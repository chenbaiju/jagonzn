package com.jagonzn.service.extension.jt808;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;
import java.util.function.Consumer;

/** 扩展私有状态的单进程原子文件；不创建平台表，写入结果不明时停止而不自动重试。 */
public final class Jt808StateStore implements AutoCloseable {
    private static final int MAX_BYTES=4*1024*1024;
    private final Path directory;
    private final Path state;
    private final FileChannel lockChannel;
    private final FileLock lock;
    private Map<String,String> values;
    private boolean stopped;

    /** @param directory 已存在的私有状态目录 @param externalRoot 已核验外设根；不能位于源码内 */
    public Jt808StateStore(Path directory,Path externalRoot) {
        FileChannel channel=null; FileLock acquired=null;
        try {
            Path external=externalRoot.toRealPath();
            if(Files.getFileStore(external).equals(Files.getFileStore(Path.of("").toAbsolutePath()))) throw invalid();
            if(Files.isSymbolicLink(directory)) throw invalid();
            this.directory=directory.toRealPath();
            if(!this.directory.startsWith(external) || external.startsWith(Path.of("").toAbsolutePath().normalize())) throw invalid();
            requirePrivate(this.directory,true);
            Path lockFile=this.directory.resolve("adapter.lock");
            if(Files.exists(lockFile,LinkOption.NOFOLLOW_LINKS)) requirePrivate(lockFile,false);
            channel=FileChannel.open(lockFile,java.util.Set.of(StandardOpenOption.CREATE,StandardOpenOption.WRITE),
                    PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
            acquired=channel.tryLock(); if(acquired==null) throw invalid();
            state=this.directory.resolve("adapter-state.properties");
            var loaded=new LinkedHashMap<String,String>();
            if(Files.exists(state,LinkOption.NOFOLLOW_LINKS)) {
                requirePrivate(state,false); if(Files.size(state)>MAX_BYTES) throw invalid();
                var props=new Properties(); props.load(new ByteArrayInputStream(Files.readAllBytes(state)));
                props.forEach((k,v)->loaded.put(k.toString(),v.toString()));
            }
            values=Map.copyOf(loaded); lockChannel=channel; lock=acquired;
        } catch(Exception failure) {
            try { if(acquired!=null) acquired.release(); if(channel!=null) channel.close(); } catch(Exception ignored) { }
            throw invalid();
        }
    }

    /** 私有原件须归当前用户所有，目录0700、文件0600；链接与不支持权限的系统明确拒绝。 */
    static void requirePrivate(Path path,boolean directory) throws java.io.IOException {
        if(Files.isSymbolicLink(path) || (directory?!Files.isDirectory(path):!Files.isRegularFile(path))) throw invalid();
        var expected=PosixFilePermissions.fromString(directory?"rwx------":"rw-------");
        if(!Files.getPosixFilePermissions(path).equals(expected)
                || !Files.getOwner(path).getName().equals(System.getProperty("user.name"))) throw invalid();
    }

    /** @return 状态不可变快照，调用者不得记录其内容 */
    public synchronized Map<String,String> snapshot() { requireOpen(); return values; }

    /** @param change 一次状态变更；先持久化再向设备发成功响应 */
    public synchronized void update(Consumer<Map<String,String>> change) {
        requireOpen(); var next=new LinkedHashMap<>(values); change.accept(next);
        if(next.size()>10_000 || next.entrySet().stream().anyMatch(e->e.getKey().length()>200 || e.getValue().length()>65_536)) throw invalid();
        Path temporary=null;
        try {
            var props=new Properties(); props.putAll(next); var output=new ByteArrayOutputStream();
            props.store(output,null); byte[] bytes=output.toByteArray(); if(bytes.length>MAX_BYTES) throw invalid();
            temporary=Files.createTempFile(directory,"state-",".tmp",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
            try(var file=FileChannel.open(temporary,StandardOpenOption.WRITE)) {
                var buffer=ByteBuffer.wrap(bytes); while(buffer.hasRemaining()) file.write(buffer); file.force(true);
            }
            Files.move(temporary,state,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);
            try(var parent=FileChannel.open(directory,StandardOpenOption.READ)) { parent.force(true); }
            values=Map.copyOf(next);
        } catch(Exception failure) {
            stopped=true;
            // 临时文件作为写入首因证据保留；不尝试覆盖、修复或重复写状态。
            throw invalid();
        }
    }

    /** @return 不回绕的下行流水号；耗尽后须人工评估旧帧及状态归档，不能自行清零 */
    public synchronized int nextSerial() {
        long current;
        try { current=Long.parseLong(snapshot().getOrDefault("serial","0")); }
        catch(NumberFormatException failure) { throw invalid(); }
        if(current<0 || current>=65535) throw invalid();
        int next=(int)current+1; update(map->map.put("serial",Integer.toString(next))); return next;
    }

    private void requireOpen() { if(stopped) throw invalid(); }
    private static IllegalStateException invalid() { return new IllegalStateException("JT808私有状态不可用，已停止处理"); }

    /** 释放独占租约；状态和首败原件保留。 */
    @Override public synchronized void close() {
        stopped=true;
        try { if(lock.isValid()) lock.release(); lockChannel.close(); } catch(java.io.IOException failure) { throw invalid(); }
    }
}
