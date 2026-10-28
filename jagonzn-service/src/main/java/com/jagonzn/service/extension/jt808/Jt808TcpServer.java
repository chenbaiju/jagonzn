package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.Jt808FrameReader;
import com.jagonzn.service.extension.jt808.protocol.Jt808Sm4Cipher;
import com.things.link.ingestion.application.access.DeviceAccessPushPort;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.time.Clock;
import java.time.Duration;
import java.util.Arrays;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.context.SmartLifecycle;
import tools.jackson.databind.ObjectMapper;

/** 专用有界TCP监听器；默认由关闭的扩展开关隔离，不接管平台原生TC注册表或消费者。 */
public final class Jt808TcpServer implements SmartLifecycle,AutoCloseable {
    private final Jt808DeviceBinding binding;
    private final Jt808Sm4Cipher cipher;
    private final Jt808StateStore store;
    private final Jt808ThingsLinkGateway gateway;
    private final ObjectMapper json;
    private final InetSocketAddress address;
    private final Duration idleTimeout,pollInterval;
    private final Clock clock;
    private final Jt808SessionCoordinator coordinator=new Jt808SessionCoordinator();
    private final Set<Socket> sockets=ConcurrentHashMap.newKeySet();
    private final Semaphore permits=new Semaphore(32);
    private final AtomicLong rejected=new AtomicLong();
    private volatile ServerSocket server;
    private ExecutorService executor;
    private Endpoint endpoint;
    private record Endpoint(Jt808Session session,Jt808Session.WireSink sink) { }

    /** @param binding 单台预绑定 @param cipher 私有国密实例 @param store 外盘状态 @param gateway 公开端口组合
     * @param json 应用JSON配置 @param address 明确监听地址 @param idleTimeout 本地无活动断开策略
     * @param pollInterval 状态维护间隔 @param clock 平台接收时钟 */
    public Jt808TcpServer(Jt808DeviceBinding binding,Jt808Sm4Cipher cipher,Jt808StateStore store,
                          Jt808ThingsLinkGateway gateway,ObjectMapper json,InetSocketAddress address,Duration idleTimeout,
                          Duration pollInterval,Clock clock) {
        if(idleTimeout.compareTo(Duration.ofSeconds(1))<0 || pollInterval.compareTo(Duration.ofMillis(250))<0) throw new IllegalArgumentException("JT808运行周期无效");
        this.binding=binding; this.cipher=cipher; this.store=store; this.gateway=gateway; this.json=json;
        this.address=address; this.idleTimeout=idleTimeout; this.pollInterval=pollInterval; this.clock=clock;
    }
    @Override public synchronized void start() {
        if(isRunning()) return;
        try {
            var listening=new ServerSocket();
            try { listening.bind(address,32); } catch(IOException failure) { listening.close(); throw failure; }
            server=listening; executor=Executors.newVirtualThreadPerTaskExecutor();
            var currentExecutor=executor; currentExecutor.submit(()->acceptLoop(listening,currentExecutor));
        } catch(IOException failure) { throw new IllegalStateException("JT808专用监听启动失败"); }
    }
    private void acceptLoop(ServerSocket listening,ExecutorService currentExecutor) {
        while(server==listening && !listening.isClosed()) {
            try {
                Socket socket=listening.accept();
                if(!permits.tryAcquire()) { rejected.incrementAndGet(); socket.close(); continue; }
                sockets.add(socket);
                try { currentExecutor.submit(()->serve(socket)); }
                catch(RuntimeException failure) { sockets.remove(socket); permits.release(); socket.close(); }
            } catch(IOException failure) { if(isRunning()) rejected.incrementAndGet(); }
        }
    }
    private void serve(Socket socket) {
        Jt808Session session=null;
        try(socket) {
            socket.setSoTimeout(250); socket.setTcpNoDelay(true);
            session=new Jt808Session(binding,store,gateway,coordinator,cipher,json,socket.getInetAddress().getHostAddress());
            var frames=new Jt808FrameReader(); var input=socket.getInputStream(); var output=socket.getOutputStream();
            Jt808Session.WireSink sink=wire->{ output.write(wire); output.flush(); };
            byte[] chunk=new byte[2048]; long lastFrame=System.nanoTime(),lastPoll=0;
            boolean authenticated=false;
            while(isRunning() && !socket.isClosed()) {
                try {
                    int count=input.read(chunk); if(count<0) return;
                    for(byte[] wire:frames.accept(Arrays.copyOf(chunk,count))) {
                        session.receive(wire,clock.instant(),sink); lastFrame=System.nanoTime();
                        authenticated|=session.active();
                        synchronized(coordinator) { if(session.active()) endpoint=new Endpoint(session,sink); }
                    }
                } catch(SocketTimeoutException waiting) { }
                if(session.isClosed() || authenticated && !session.active()) return;
                long now=System.nanoTime();
                if(now-lastFrame>(authenticated?idleTimeout:Duration.ofSeconds(20)).toNanos()) return;
                if(session.active() && now-lastPoll>=pollInterval.toNanos()) {
                    session.maintain(clock.instant()); lastPoll=now;
                }
            }
        } catch(IOException | RuntimeException failure) {
            // 只保留低基数失败计数，禁止把密钥、鉴权码、注册信息或原始报文带入普通日志。
            rejected.incrementAndGet();
        } finally {
            synchronized(coordinator) {
                if(session!=null) session.close();
                if(endpoint!=null && endpoint.session()==session) endpoint=null;
            }
            sockets.remove(socket); permits.release();
        }
    }
    @Override public synchronized void stop() {
        var listening=server; server=null;
        try { if(listening!=null) listening.close(); } catch(IOException ignored) { }
        for(Socket socket:sockets) try { socket.close(); } catch(IOException ignored) { }
        if(executor!=null) executor.shutdownNow();
    }
    @Override public boolean isRunning() { var current=server; return current!=null && !current.isClosed(); }
    /** @return 实际绑定端口，仅供运维及本地回环测试 */
    public int boundPort() { var current=server; if(current==null) throw new IllegalStateException("JT808监听未运行"); return current.getLocalPort(); }
    public long rejectedConnections() { return rejected.get(); }
    /** 持久权威归属保证离线时也不把同一设备退回标准TC编码器。 */
    public boolean targets(DeviceAccessPushPort.Push push) {
        String identity=store.snapshot().get("identity");
        return (push.tenantId()+"|"+push.projectId()+"|"+push.deviceId()).equals(identity);
    }
    public boolean owns(DeviceAccessPushPort.Push push) {
        synchronized(coordinator) { return endpoint!=null && endpoint.session().owns(push); }
    }
    /** 调用方仍须通过平台命令准入与规则链；此处只选择已认证连接并执行厂家编码。 */
    public DeviceAccessPushPort.PushOutcome push(DeviceAccessPushPort.Push push) {
        synchronized(coordinator) {
            if(endpoint==null) return DeviceAccessPushPort.PushOutcome.DEFERRED_NOT_OWNER;
            try { return endpoint.session().push(push,clock.instant(),endpoint.sink()); }
            catch(IOException failure) { return DeviceAccessPushPort.PushOutcome.WRITE_FAILED; }
        }
    }
    @Override public void close() { stop(); }
}
