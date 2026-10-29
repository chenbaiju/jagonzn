package com.jagonzn.service.extension.jt808;

import com.things.link.shared.id.Uuid7;
import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import com.things.link.shared.message.OriginalPayloadDigest;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.LoggerFactory;

/** Jagonzn自己的协议日志事实和待交付原件；不写ThingsLink事件表，也不伪造平台标准事件。 */
public final class Jt808LogJournal implements AutoCloseable {
    private final Path directory;
    private final ObjectMapper json;
    private final FileChannel channel;
    private final FileLock lock;
    private boolean closed;
    public record Entry(Path path,String json){ }
    public Jt808LogJournal(Path directory,Path externalRoot,ObjectMapper json){
        this.json=json;
        FileChannel opened=null;FileLock acquired=null;
        try{
            this.directory=directory.toRealPath();
            if(Files.isSymbolicLink(directory)||!this.directory.startsWith(externalRoot.toRealPath())
                    ||Files.getFileStore(externalRoot).equals(Files.getFileStore(Path.of("").toAbsolutePath())))throw new IllegalArgumentException();
            Jt808StateStore.requirePrivate(directory,true);
            Path path=directory.resolve("log-journal.lock");
            if(Files.exists(path))Jt808StateStore.requirePrivate(path,false);
            opened=FileChannel.open(path,java.util.Set.of(StandardOpenOption.CREATE,StandardOpenOption.WRITE),PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
            acquired=opened.tryLock();if(acquired==null)throw new IllegalStateException();channel=opened;lock=acquired;
        }catch(Exception failure){
            try{if(acquired!=null)acquired.release();if(opened!=null)opened.close();}catch(java.io.IOException ignored){ }
            throw new IllegalStateException("JT808外置日志目录或独占租约无效");
        }
    }
    /** 已认证事实先持久保存再应答；相同报文保留首次事件ID/时间，既有文件不覆盖。 */
    public synchronized void append(AuthenticatedDeviceIdentity identity,String dedupKey,String kind,String direction,
            int message,int serial,Instant occurredAt,Instant receivedAt,Map<String,Object> details){
        if(closed)throw new IllegalStateException("JT808日志已停止");
        String key=OriginalPayloadDigest.of((identity.tenantId()+"|"+identity.projectId()+"|"+identity.deviceId()+"|"+dedupKey).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        Path path=directory.resolve("log-"+key+".json");
        try{
            if(Files.exists(path)){Jt808StateStore.requirePrivate(path,false);return;}
            try(var files=Files.list(directory)){
                var all=files.filter(f->f.getFileName().toString().startsWith("log-")&&f.toString().endsWith(".json")).toList();
                long bytes=0;for(Path file:all)bytes+=Files.size(file);
                if(all.size()>=4096||bytes>=64L*1024*1024)throw new IllegalStateException("日志原件容量已满，须人工归档");
            }
            // 本扩展分配自己的单调序号；不是厂家尚未启用的日志序列号，不用于伪造动作闭环。
            Path sequenceFile=directory.resolve("sequence.txt");long sequence=0;
            if(Files.exists(sequenceFile)){Jt808StateStore.requirePrivate(sequenceFile,false);if(Files.size(sequenceFile)>32)throw new IllegalArgumentException();sequence=Long.parseLong(Files.readString(sequenceFile).trim());}
            if(sequence<0||sequence==Long.MAX_VALUE)throw new IllegalStateException("日志序号不可回绕");
            sequence++;atomic(sequenceFile,Long.toString(sequence).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            var payload=json.createObjectNode();payload.put("protocol","JT808");payload.put("logType",kind);payload.put("direction",direction);
            payload.put("messageId",String.format("0x%04X",message));payload.put("serial",serial);payload.set("details",json.valueToTree(details));
            var event=json.createObjectNode();event.put("schemaVersion",1);event.put("eventId",Uuid7.generate().toString());event.put("eventType","jagonzn.lock.log");
            event.put("tenantId",identity.tenantId().toString());event.put("projectId",identity.projectId().toString());event.put("deviceId",identity.deviceId().toString());
            event.put("sourceSequence",sequence);event.put("occurredAt",occurredAt.toString());event.put("receivedAt",receivedAt.toString());event.set("payload",payload);
            byte[] body=json.writeValueAsBytes(event);if(body.length>262000)throw new IllegalArgumentException();
            atomic(path,body);LoggerFactory.getLogger(Jt808LogJournal.class).info("锁具日志已持久保存 event={}",event);
        }catch(Exception failure){throw new IllegalStateException("JT808日志持久化失败，未确认该条日志");}
    }
    /** 有界返回未被cloud持久签收的原件；响应丢失不会修改事件或删除原件。 */
    public synchronized List<Entry> pending(){
        if(closed)return List.of();
        try(var files=Files.list(directory)){
            var paths=files.filter(p->p.getFileName().toString().matches("log-[0-9a-f]{64}\\.json")&&!Files.exists(p.resolveSibling(p.getFileName()+".accepted"))).toList();
            var result=new java.util.ArrayList<Entry>();
            for(Path path:paths){Jt808StateStore.requirePrivate(path,false);if(Files.size(path)>262000)throw new IllegalArgumentException();result.add(new Entry(path,Files.readString(path)));}
            result.sort(java.util.Comparator.comparingLong(entry->json.readTree(entry.json()).path("sourceSequence").asLong()));
            return List.copyOf(result.subList(0,Math.min(10,result.size())));
        }catch(Exception failure){throw new IllegalStateException("JT808日志原件读取失败");}
    }
    /** 仅cloud返回约定的持久签收后落标记，原日志保留用于核对与受控重放。 */
    public synchronized void accepted(Entry entry){
        try{
            if(!entry.path().getParent().equals(directory)||!Files.readString(entry.path()).equals(entry.json()))throw new IllegalArgumentException();
            Path marker=entry.path().resolveSibling(entry.path().getFileName()+".accepted");
            if(!Files.exists(marker))atomic(marker,"accepted\n".getBytes(java.nio.charset.StandardCharsets.UTF_8));
        }catch(Exception failure){throw new IllegalStateException("JT808日志签收结果未确认，不删除原件");}
    }
    private void atomic(Path destination,byte[] bytes) throws java.io.IOException {
        Path temporary=Files.createTempFile(directory,"log-writing-",".tmp",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
        try(var file=FileChannel.open(temporary,StandardOpenOption.WRITE)){var buffer=java.nio.ByteBuffer.wrap(bytes);while(buffer.hasRemaining())file.write(buffer);file.force(true);}
        Files.move(temporary,destination,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
        try(var parent=FileChannel.open(directory,StandardOpenOption.READ)){parent.force(true);}
    }
    /** 停止独占访问但保留日志、签收标记和首败临时原件。 */
    @Override public synchronized void close(){closed=true;try{lock.release();channel.close();}catch(java.io.IOException failure){throw new IllegalStateException("日志租约释放失败");}}
}
