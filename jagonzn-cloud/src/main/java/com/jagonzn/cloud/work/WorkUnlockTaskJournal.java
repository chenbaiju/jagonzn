package com.jagonzn.cloud.work;

import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** 作业JSON专属外置日志；逐次保留原始字节，同一作业uuid的补充推送也不覆盖旧原件。 */
@Component
@ConditionalOnProperty(name="jagonzn.cloud.work-tasks.enabled",havingValue="true")
public final class WorkUnlockTaskJournal implements AutoCloseable {
    private final Path directory;
    private final Object directoryKey;
    private final FileChannel channel;
    private final FileLock lock;
    public WorkUnlockTaskJournal(@Value("${jagonzn.cloud.work-tasks.journal-directory:}") String folder,
            @Value("${jagonzn.cloud.work-tasks.external-root:}") String external){
        FileChannel opened=null;FileLock acquired=null;
        try{
            Path path=Path.of(folder),root=Path.of(external);if(!path.isAbsolute()||!root.isAbsolute())throw new IllegalArgumentException();
            directory=path.toRealPath();if(!directory.startsWith(root.toRealPath())||Files.getFileStore(root).equals(Files.getFileStore(Path.of("").toAbsolutePath())))throw new IllegalArgumentException();
            requirePrivate(path,true);directoryKey=Files.readAttributes(directory,BasicFileAttributes.class).fileKey();Path marker=directory.resolve("work-task-log.lock");
            if(Files.exists(marker,LinkOption.NOFOLLOW_LINKS))requirePrivate(marker,false);
            opened=FileChannel.open(marker,java.util.Set.of(StandardOpenOption.CREATE,StandardOpenOption.WRITE),PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
            acquired=opened.tryLock();if(acquired==null)throw new IllegalStateException();channel=opened;lock=acquired;
        }catch(Exception invalid){try{if(acquired!=null)acquired.release();if(opened!=null)opened.close();}catch(java.io.IOException ignored){ }throw new IllegalStateException("作业接收日志须使用当前用户独占的外置0700目录");}
    }
    /** 原始JSON文件0600，原子写入并fsync后才返回接收标识；失败不冒充成功或静默删除原件。 */
    public synchronized UUID append(byte[] json){
        try{
            requirePrivate(directory,true);
            if(!lock.isValid()||!java.util.Objects.equals(directoryKey,Files.readAttributes(directory,BasicFileAttributes.class).fileKey())||json.length==0||json.length>65536)throw new IllegalArgumentException();
            long total=0,count=0;
            try(var files=Files.list(directory)){for(Path file:files.toList()){requirePrivate(file,false);total+=Files.size(file);if(file.getFileName().toString().startsWith("task-"))count++;}}
            if(count>=10000||total+json.length>64L*1024*1024)throw new IllegalStateException();
            UUID receipt=UUID.randomUUID();Path temporary=Files.createTempFile(directory,"receiving-",".tmp",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
            try(var file=FileChannel.open(temporary,StandardOpenOption.WRITE)){var bytes=java.nio.ByteBuffer.wrap(json);while(bytes.hasRemaining())file.write(bytes);file.force(true);}
            Files.move(temporary,directory.resolve("task-"+receipt+".json"),StandardCopyOption.ATOMIC_MOVE);
            try(var parent=FileChannel.open(directory,StandardOpenOption.READ)){parent.force(true);}return receipt;
        }catch(Exception failure){throw new IllegalStateException("作业JSON日志未确认持久保存，接收失败");}
    }
    private static void requirePrivate(Path path,boolean folder)throws java.io.IOException{
        if(Files.isSymbolicLink(path)||(folder?!Files.isDirectory(path):!Files.isRegularFile(path))
                ||!Files.getPosixFilePermissions(path).equals(PosixFilePermissions.fromString(folder?"rwx------":"rw-------"))
                ||!Files.getOwner(path).getName().equals(System.getProperty("user.name")))throw new IllegalArgumentException();
    }
    /** 只释放本实例日志租约，原件由外置保留政策处理。 */
    @Override @jakarta.annotation.PreDestroy public synchronized void close(){try{if(lock.isValid())lock.release();channel.close();}catch(java.io.IOException failure){throw new IllegalStateException("作业日志租约释放失败");}}
}
