package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.*;
import com.things.link.shared.id.Uuid7;
import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import com.things.link.shared.message.OriginalPayloadDigest;
import com.things.link.telemetry.application.DeviceCommandAccessReplyPort;
import com.things.link.ingestion.application.access.DeviceAccessPushPort;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import tools.jackson.databind.ObjectMapper;

/** 国密锁的注册、鉴权、属性受理及命令关联；网络输出失败不会自动再次执行控制。 */
public final class Jt808Session {
    /** 原子化一帧输出；抛出异常时发送结果未知，调用方应关闭连接。 */
    @FunctionalInterface public interface WireSink { void write(byte[] wire) throws IOException; }
    private final Jt808DeviceBinding binding;
    private final Jt808StateStore store;
    private final Jt808ThingsLinkGateway gateway;
    private final Jt808SessionCoordinator coordinator;
    private final Jt808Sm4FrameCodec codec;
    private final ObjectMapper json;
    private final Jt808ReplyOutbox outbox;
    private final String clientIp;
    private final SecureRandom random=new SecureRandom();
    private AuthenticatedDeviceIdentity identity;
    private long generation;
    private boolean closed;

    /** @param binding 私有预绑定 @param store 外盘独占状态 @param gateway 平台公开端口组合
     * @param coordinator 此设备共享的会话代次 @param cipher 私有密码实例 @param json 应用JSON配置 @param clientIp 实际来源IP */
    public Jt808Session(Jt808DeviceBinding binding,Jt808StateStore store,Jt808ThingsLinkGateway gateway,
                        Jt808SessionCoordinator coordinator,Jt808Sm4Cipher cipher,ObjectMapper json,String clientIp) {
        this.binding=binding; this.store=store; this.gateway=gateway; this.coordinator=coordinator; this.json=json; this.clientIp=clientIp;
        codec=new Jt808Sm4FrameCodec(new Jt808DeviceProfile(Jt808DeviceProfile.Model.DM08_V_A,Jt808DeviceProfile.BodyProtection.SM4_CBC),cipher);
        outbox=new Jt808ReplyOutbox(store,gateway,json);
        String scope=OriginalPayloadDigest.of((binding.terminalId()+"|"+binding.projectKey()+"|"+binding.deviceKey()).getBytes(StandardCharsets.UTF_8));
        synchronized(coordinator) {
            String existing=store.snapshot().get("binding");
            if(existing==null) store.update(map->map.put("binding",scope));
            else if(!existing.equals(scope)) throw new IllegalStateException("JT808状态不属于本预绑定");
        }
    }

    /** @param wire 一帧完整国密上行 @param receivedAt 完整读取时冻结的平台时刻 @param sink 当前连接输出 */
    public void receive(byte[] wire,Instant receivedAt,WireSink sink) throws IOException {
        synchronized(coordinator) {
            if(closed) throw new IllegalStateException("JT808连接已关闭");
            Jt808Frame frame=codec.decodeUplink(wire);
            if(!frame.terminalId().equals(binding.terminalId()) || frame.fragment().isPresent()) throw new IllegalArgumentException("JT808终端或分包不受支持");
            if(frame.messageId()==0x0100) { register(frame,receivedAt,sink); return; }
            if(frame.messageId()==0x0102) { authenticate(frame,sink); return; }
            requireCurrent(); expire(receivedAt); outbox.flush(identity);
            switch(frame.messageId()) {
                case 0x0002 -> {
                    if(frame.body().length!=0) throw new IllegalArgumentException("JT808心跳体必须为空");
                    respond(frame,0,sink);
                }
                case 0x0200,0x0201 -> report(frame,receivedAt,sink);
                case 0x0001 -> acknowledge(frame,receivedAt);
                default -> respond(frame,1,sink);
            }
        }
    }

    private void register(Jt808Frame frame,Instant now,WireSink sink) throws IOException {
        if(identity!=null) throw new IllegalStateException("JT808已鉴权连接不能重新注册");
        gateway.checkAuthenticationBudget(binding,clientIp);
        var registration=Jt808Messages.registration(frame.body());
        if(!binding.enrollmentAllowed(now) || !MessageDigest.isEqual(binding.mac(),registration.mac())) {
            gateway.authenticationFailed(binding); send(0x8100,Jt808Messages.registrationReply(frame.serial(),null),sink); return;
        }
        var authenticated=gateway.authenticate(binding); pinIdentity(authenticated);
        String stored=store.snapshot().get("token");
        if(stored==null) {
            // 六字节是厂家合同的上限；采用可打印随机字符，不能当作平台一机一密。
            byte[] token=new byte[6]; byte[] alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".getBytes(StandardCharsets.US_ASCII);
            for(int i=0;i<token.length;i++) token[i]=alphabet[random.nextInt(alphabet.length)];
            String frozen=HexFormat.of().formatHex(token); store.update(map->map.put("token",frozen)); stored=frozen;
        }
        gateway.authenticationSucceeded(binding);
        send(0x8100,Jt808Messages.registrationReply(frame.serial(),HexFormat.of().parseHex(stored)),sink);
    }

    private void authenticate(Jt808Frame frame,WireSink sink) throws IOException {
        if(identity!=null) throw new IllegalStateException("JT808连接已经鉴权");
        gateway.checkAuthenticationBudget(binding,clientIp);
        String token=store.snapshot().get("token");
        if(frame.body().length!=6 || token==null || !MessageDigest.isEqual(frame.body(),HexFormat.of().parseHex(token))) {
            gateway.authenticationFailed(binding); respond(frame,1,sink); closed=true; return;
        }
        var authenticated=gateway.authenticate(binding); pinIdentity(authenticated);
        identity=authenticated; generation=coordinator.establish(); gateway.authenticationSucceeded(binding);
        respond(frame,0,sink); outbox.flush(identity);
    }

    private void pinIdentity(AuthenticatedDeviceIdentity authenticated) {
        String target=authenticated.tenantId()+"|"+authenticated.projectId()+"|"+authenticated.deviceId();
        String existing=store.snapshot().get("identity");
        if(existing!=null && !existing.equals(target)) throw new IllegalStateException("JT808平台归属发生变化，须重新核对预绑定");
        if(existing==null) store.update(map->map.put("identity",target));
    }

    private void requireCurrent() {
        if(identity==null || !coordinator.owns(generation)) throw new IllegalStateException("JT808尚未鉴权或会话已被接管");
        if(!identity.equals(gateway.authenticate(binding))) throw new IllegalStateException("JT808原认证代际已失效");
    }

    private void report(Jt808Frame frame,Instant receivedAt,WireSink sink) throws IOException {
        boolean query=frame.messageId()==0x0201;
        var location=Jt808Messages.location(frame.body(),query?2:0);
        var mapped=new LinkedHashMap<String,Object>();
        binding.properties().forEach((from,to)-> { if(location.properties().containsKey(from)) mapped.put(to,location.properties().get(from)); });
        if(mapped.isEmpty()) throw new IllegalArgumentException("JT808上报没有已映射属性");
        String digest=frameDigest(frame),key="report."+digest;
        String frozen=store.snapshot().get(key);
        if(frozen==null) {
            UUID messageId=Uuid7.generate();
            byte[] payload=json.writeValueAsBytes(Map.of("messageId",messageId.toString(),"occurredAt",location.occurredAt().toString(),
                    "modelVersion",binding.modelVersion(),"payload",mapped));
            String value=messageId+"|"+receivedAt+"|"+identity.credentialVersion()+"|"+Base64.getEncoder().encodeToString(payload);
            store.update(map->map.put(key,value)); frozen=value;
        }
        String[] parts=frozen.split("\\|",4);
        if(identity.credentialVersion()!=Long.parseLong(parts[2])) throw new IllegalStateException("JT808原上报凭据代际已变化，须核对历史受理");
        gateway.report(identity,Base64.getDecoder().decode(parts[3]),Instant.parse(parts[1]),parts[0]);
        if(query) {
            int serial=Short.toUnsignedInt(ByteBuffer.wrap(frame.body()).getShort());
            String prefix=findCommand(serial,0x8201);
            if(prefix!=null && live(prefix,receivedAt)) {
                store.update(map->map.put(prefix+"state","SUCCEEDED"));
                outbox.enqueue(commandId(prefix),"result",DeviceCommandAccessReplyPort.Status.SUCCESS,mapped,null,digest,receivedAt,identity);
                outbox.flush(identity);
            }
        }
        respond(frame,0,sink);
    }

    private void acknowledge(Jt808Frame frame,Instant receivedAt) {
        var ack=Jt808Messages.acknowledgement(frame.body()); String prefix=findCommand(ack.serial(),ack.messageId());
        if(prefix==null || !live(prefix,receivedAt)) return;
        boolean failed=ack.result()!=0;
        String current=store.snapshot().get(prefix+"state");
        if("ACKNOWLEDGED".equals(current) && !failed) { outbox.flush(identity); return; }
        if("ACKNOWLEDGED".equals(current) && failed) throw new IllegalStateException("JT808同一命令出现冲突应答");
        store.update(map->map.put(prefix+"state",failed?"FAILED":"ACKNOWLEDGED"));
        outbox.enqueue(commandId(prefix),"ack",failed?DeviceCommandAccessReplyPort.Status.FAILED:DeviceCommandAccessReplyPort.Status.ACK,
                null,failed?"JT808_DEVICE_REJECTED":null,frameDigest(frame),receivedAt,identity);
        outbox.flush(identity);
    }

    /** 到期和原回复恢复不重发控制；空维护不额外扣业务预算。 */
    public void maintain(Instant now) {
        synchronized(coordinator) {
            if(closed) throw new IllegalStateException("JT808连接已关闭");
            if(!active()) throw new IllegalStateException("JT808会话已失效");
            expire(now);
            if(store.snapshot().keySet().stream().anyMatch(k->k.startsWith("reply.") && !k.endsWith(".done") && !store.snapshot().containsKey(k+".done"))) {
                requireCurrent(); outbox.flush(identity);
            }
        }
    }

    /** 下行准入前的无副作用所有权判断，原命令准入和规则仍由平台消费者负责。 */
    public boolean owns(DeviceAccessPushPort.Push push) {
        synchronized(coordinator) {
            return active() && identity.tenantId().equals(push.tenantId()) && identity.projectId().equals(push.projectId())
                    && identity.deviceId().equals(push.deviceId()) && !store.snapshot().containsKey("cmd."+push.commandId()+".state");
        }
    }

    /** @param push 已经过平台命令准入及规则链的推送 @param now 写前平台时间 @param sink 此会话输出
     * @return 只报告发送结果，不把发送成功解释为执行成功 */
    public DeviceAccessPushPort.PushOutcome push(DeviceAccessPushPort.Push push,Instant now,WireSink sink) throws IOException {
        synchronized(coordinator) {
            if(!owns(push)) return DeviceAccessPushPort.PushOutcome.DEFERRED_NOT_OWNER;
            requireCurrent(); expire(now);
            return dispatch(push,now,sink);
        }
    }

    private DeviceAccessPushPort.PushOutcome dispatch(DeviceAccessPushPort.Push claimed,Instant now,WireSink sink) throws IOException {
        UUID id=claimed.commandId(); if(id==null || id.version()!=7 || claimed.expiresAt()==null) return DeviceAccessPushPort.PushOutcome.WRITE_FAILED;
        String prefix="cmd."+id+".";
        int message; byte[] body;
        switch(claimed.commandKey()) {
            case "jt808_query" -> { message=0x8201; body=new byte[0]; }
            case "jt808_unlock" -> { message=0x8500; body=new byte[]{1,0}; }
            case "jt808_lock" -> { message=0x8500; body=new byte[]{1,1}; }
            default -> { return DeviceAccessPushPort.PushOutcome.WRITE_FAILED; }
        }
        tools.jackson.databind.JsonNode input;
        try { input=json.readTree(claimed.inputJson()); }
        catch(tools.jackson.core.JacksonException invalid) { return DeviceAccessPushPort.PushOutcome.WRITE_FAILED; }
        if(!input.isObject() || !input.isEmpty() || !now.isBefore(claimed.expiresAt())) {
            return DeviceAccessPushPort.PushOutcome.WRITE_FAILED;
        }
        if(message==0x8500 && store.snapshot().entrySet().stream().anyMatch(e->e.getKey().startsWith("cmd.") && e.getKey().endsWith("state")
                && e.getValue().equals("UNKNOWN") && "34048".equals(store.snapshot().get(e.getKey().replace("state","message"))))) {
            return DeviceAccessPushPort.PushOutcome.WRITE_FAILED;
        }
        int serial=store.nextSerial();
        store.update(map-> { map.put(prefix+"state","PREPARED"); map.put(prefix+"serial",Integer.toString(serial));
            map.put(prefix+"message",Integer.toString(message)); map.put(prefix+"expires",claimed.expiresAt().toString());
            map.put(prefix+"key",claimed.commandKey()); });
        try {
            sink.write(codec.encodeDownlink(new Jt808Frame(message,binding.terminalId(),serial,Optional.empty(),body)));
            store.update(map->map.put(prefix+"state","SENT"));
            return DeviceAccessPushPort.PushOutcome.DELIVERED;
        } catch(IOException | RuntimeException failure) {
            store.update(map->map.put(prefix+"state","UNKNOWN")); throw failure;
        }
    }

    private String findCommand(int serial,int message) {
        return store.snapshot().entrySet().stream().filter(e->e.getKey().startsWith("cmd.") && e.getKey().endsWith("serial")
                && e.getValue().equals(Integer.toString(serial))).map(e->e.getKey().substring(0,e.getKey().length()-6))
                .filter(prefix->Integer.toString(message).equals(store.snapshot().get(prefix+"message"))).findFirst().orElse(null);
    }
    private static UUID commandId(String prefix) { return UUID.fromString(prefix.substring(4,prefix.length()-1)); }
    private boolean live(String prefix,Instant now) {
        String state=store.snapshot().get(prefix+"state");
        return ("SENT".equals(state) || "ACKNOWLEDGED".equals(state)) && now.isBefore(Instant.parse(store.snapshot().get(prefix+"expires")));
    }
    private void expire(Instant now) {
        var snapshot=store.snapshot();
        boolean needs=snapshot.entrySet().stream().anyMatch(e->e.getKey().endsWith("state") && e.getKey().startsWith("cmd.")
                && ("PREPARED".equals(e.getValue()) || (("SENT".equals(e.getValue()) || "ACKNOWLEDGED".equals(e.getValue()))
                && !now.isBefore(Instant.parse(snapshot.get(e.getKey().replace("state","expires")))))));
        if(needs) store.update(map->snapshot.forEach((key,value)-> {
            if(key.startsWith("cmd.") && key.endsWith("state") && ("PREPARED".equals(value)
                    || (("SENT".equals(value) || "ACKNOWLEDGED".equals(value)) && !now.isBefore(Instant.parse(snapshot.get(key.replace("state","expires")))))))
                map.put(key,"UNKNOWN");
        }));
    }
    private static String frameDigest(Jt808Frame frame) {
        return OriginalPayloadDigest.of(ByteBuffer.allocate(4+frame.body().length).putShort((short)frame.messageId())
                .putShort((short)frame.serial()).put(frame.body()).array());
    }
    private void respond(Jt808Frame frame,int result,WireSink sink) throws IOException { send(0x8001,Jt808Messages.acknowledgement(frame.serial(),frame.messageId(),result),sink); }
    private void send(int message,byte[] body,WireSink sink) throws IOException {
        sink.write(codec.encodeDownlink(new Jt808Frame(message,binding.terminalId(),store.nextSerial(),Optional.empty(),body)));
    }
    /** @return 仅扩展本地会话可用，不代表平台原生TCP在线事实 */
    public boolean active() { synchronized(coordinator) { return !closed && identity!=null && coordinator.owns(generation); } }
    public boolean isClosed() { synchronized(coordinator) { return closed; } }
    /** 仅关闭本连接；不关闭共享密码实例或删除持久状态。 */
    public void close() { synchronized(coordinator) { closed=true; } }
}
