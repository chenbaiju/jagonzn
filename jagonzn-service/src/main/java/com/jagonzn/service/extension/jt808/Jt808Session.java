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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.ObjectMapper;

/** 国密锁的注册、鉴权、属性受理及命令关联；网络输出失败不会自动再次执行控制。 */
public final class Jt808Session {
    private static final Logger LOGGER=LoggerFactory.getLogger(Jt808Session.class);
    /** 原子化一帧输出；抛出异常时发送结果未知，调用方应关闭连接。 */
    @FunctionalInterface public interface WireSink { void write(byte[] wire) throws IOException; }
    private final Jt808DeviceBinding binding;
    private final Jt808StateStore store;
    private final Jt808ThingsLinkGateway gateway;
    private final Jt808SessionCoordinator coordinator;
    private final Jt808Sm4FrameCodec codec;
    private final ObjectMapper json;
    private final Jt808ReplyOutbox outbox;
    private final Jt808DoorContactConfirmation contactConfirmation;
    private final String clientIp;
    private final Jt808LogJournal logs;
    private final boolean firmwareProbeEnabled;
    private final String firmwareProbeStateKey;
    private Instant firmwareProbeNotBefore;
    private final SecureRandom random=new SecureRandom();
    private AuthenticatedDeviceIdentity identity;
    private AuthenticatedDeviceIdentity registrationIdentity;
    private int timeSyncSerial=-1;
    private long generation;
    private boolean closed;
    private boolean awaitingRegistration;
    private boolean registrationRecoveryUsed;
    private boolean sleepReported;

    /** 仅供TCP层对等待中的注册帧执行有界退避；不代表设备已通过鉴权。 */
    boolean awaitingRegistration() { return awaitingRegistration; }

    /** @param binding 私有预绑定 @param store 外盘独占状态 @param gateway 平台公开端口组合
     * @param coordinator 此设备共享的会话代次 @param cipher 私有密码实例 @param json 应用JSON配置 @param clientIp 实际来源IP */
    public Jt808Session(Jt808DeviceBinding binding,Jt808StateStore store,Jt808ThingsLinkGateway gateway,
                        Jt808SessionCoordinator coordinator,Jt808Sm4Cipher cipher,ObjectMapper json,String clientIp) {
        this(binding,store,gateway,coordinator,cipher,json,clientIp,null);
    }

    /** 显式装配外置日志时保存Jagonzn自己的协议事实，不改变平台属性/命令合同。 */
    public Jt808Session(Jt808DeviceBinding binding,Jt808StateStore store,Jt808ThingsLinkGateway gateway,
                        Jt808SessionCoordinator coordinator,Jt808Sm4Cipher cipher,ObjectMapper json,String clientIp,Jt808LogJournal logs) {
        this(binding,store,gateway,coordinator,cipher,json,clientIp,logs,false);
    }

    /** 版本诊断缺省关闭；显式开启也只在完整鉴权后持久登记一次只读查询。 */
    public Jt808Session(Jt808DeviceBinding binding,Jt808StateStore store,Jt808ThingsLinkGateway gateway,
                        Jt808SessionCoordinator coordinator,Jt808Sm4Cipher cipher,ObjectMapper json,String clientIp,Jt808LogJournal logs,boolean firmwareProbeEnabled) {
        this(binding,store,gateway,coordinator,cipher,json,clientIp,logs,firmwareProbeEnabled,"initial");
    }

    /** 诊断操作标识由管理员显式给定；同一标识跨连接、重启保持一次尝试，旧记录不删除。 */
    public Jt808Session(Jt808DeviceBinding binding,Jt808StateStore store,Jt808ThingsLinkGateway gateway,
                        Jt808SessionCoordinator coordinator,Jt808Sm4Cipher cipher,ObjectMapper json,String clientIp,Jt808LogJournal logs,boolean firmwareProbeEnabled,String firmwareProbeId) {
        this(binding,store,gateway,coordinator,cipher,json,clientIp,logs,firmwareProbeEnabled,firmwareProbeId,false);
    }

    /** 厂家门磁结果关联必须显式开启，旧实例继续保持只记录状态与ACK的原行为。 */
    public Jt808Session(Jt808DeviceBinding binding,Jt808StateStore store,Jt808ThingsLinkGateway gateway,
                        Jt808SessionCoordinator coordinator,Jt808Sm4Cipher cipher,ObjectMapper json,String clientIp,Jt808LogJournal logs,
                        boolean firmwareProbeEnabled,String firmwareProbeId,boolean doorContactConfirmationEnabled) {
        if(firmwareProbeId==null || !firmwareProbeId.matches("[a-z0-9-]{1,32}")) throw new IllegalArgumentException("JT808诊断操作标识无效");
        firmwareProbeStateKey="metadata.firmware-probe"+("initial".equals(firmwareProbeId)?"":"."+firmwareProbeId);
        this.logs=logs; this.firmwareProbeEnabled=firmwareProbeEnabled;
        this.binding=binding; this.store=store; this.gateway=gateway; this.coordinator=coordinator; this.json=json; this.clientIp=clientIp;
        codec=new Jt808Sm4FrameCodec(new Jt808DeviceProfile(Jt808DeviceProfile.Model.DM08_V_A,Jt808DeviceProfile.BodyProtection.SM4_CBC),cipher);
        outbox=new Jt808ReplyOutbox(store,gateway,json);
        contactConfirmation=new Jt808DoorContactConfirmation(doorContactConfirmationEnabled,store,outbox);
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
            if(awaitingRegistration && frame.messageId()!=0x0100) {
                closed=true;
                LOGGER.info("JT808握手：stage=REJECTED reason=REGISTRATION_REQUIRED");
                throw new IllegalStateException("JT808鉴权失败后须先重新注册");
            }
            if(frame.messageId()==0x0100) { register(frame,receivedAt,sink); return; }
            if(frame.messageId()==0x0102) { authenticate(frame,receivedAt,sink); return; }
            // 注册成功的固件会先请求授时；只允许此握手辅助交互，仍不接受属性或命令。
            if(identity==null && registrationIdentity!=null && (frame.messageId()==0x040f || frame.messageId()==0x0001)) {
                if(!registrationIdentity.equals(gateway.authenticate(binding))) throw new IllegalStateException("JT808注册凭据已失效");
                if(frame.messageId()==0x040f) synchronizeTime(frame,receivedAt,sink);
                else {
                    var ack=Jt808Messages.acknowledgement(frame.body());
                    if(timeSyncSerial<0 || ack.serial()!=timeSyncSerial || ack.messageId()!=0x840f)
                        throw new IllegalStateException("JT808未鉴权应答不属于本连接授时");
                    timeSyncSerial=-1; LOGGER.info("JT808握手：stage=TIME_SYNC_ACK result={} authenticated=false",ack.result());
                }
                return;
            }
            requireCurrent(); expire(receivedAt); flushReplies();
            switch(frame.messageId()) {
                case 0x0002 -> {
                    if(frame.body().length!=0) throw new IllegalArgumentException("JT808心跳体必须为空");
                    log(frame,receivedAt,receivedAt,"HEARTBEAT",Map.of());
                    respond(frame,0,sink);
                }
                case 0x0200,0x0201 -> report(frame,receivedAt,sink);
                case 0x040f -> synchronizeTime(frame,receivedAt,sink);
                case 0x0413 -> receiveFirmwareVersion(frame,receivedAt,sink);
                case 0x0001 -> acknowledge(frame,receivedAt);
                default -> { log(frame,receivedAt,receivedAt,"UNSUPPORTED_MESSAGE",Map.of()); respond(frame,1,sink); }
            }
        }
    }

    private void register(Jt808Frame frame,Instant now,WireSink sink) throws IOException {
        if(identity!=null) throw new IllegalStateException("JT808已鉴权连接不能重新注册");
        gateway.checkAuthenticationBudget(binding,clientIp);
        var registration=Jt808Messages.registration(frame.body());
        if(!binding.enrollmentAllowed(now) || !MessageDigest.isEqual(binding.mac(),registration.mac())) {
            gateway.authenticationFailed(binding); send(0x8100,Jt808Messages.registrationReply(frame.serial(),null),sink);
            if(awaitingRegistration) closed=true;
            LOGGER.info("JT808握手：stage=REGISTRATION_REJECTED reason=ENROLLMENT_OR_MAC");
            return;
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
        if(logs!=null)logs.append(authenticated,"REGISTER|"+frameDigest(frame),"REGISTERED","UP",frame.messageId(),frame.serial(),now,now,Map.of());
        send(0x8100,Jt808Messages.registrationReply(frame.serial(),HexFormat.of().parseHex(stored)),sink);
        awaitingRegistration=false; registrationIdentity=authenticated;
        LOGGER.info("JT808握手：stage=REGISTERED awaiting=AUTHENTICATION");
    }

    private void authenticate(Jt808Frame frame,Instant receivedAt,WireSink sink) throws IOException {
        if(identity!=null) throw new IllegalStateException("JT808连接已经鉴权");
        gateway.checkAuthenticationBudget(binding,clientIp);
        String token=store.snapshot().get("token");
        if(frame.body().length!=6 || token==null || !MessageDigest.isEqual(frame.body(),HexFormat.of().parseHex(token))) {
            gateway.authenticationFailed(binding); respond(frame,1,sink);
            // 厂家6.6要求失败后重新注册；仅在明确首绑窗口内保留一次同连接恢复机会。
            // 来码绝不作为新token入库，也不能凭终端号跳过MAC、平台凭据和后继鉴权。
            boolean recovery=frame.body().length==6 && binding.enrollmentAllowed(receivedAt) && !registrationRecoveryUsed;
            awaitingRegistration=recovery; registrationRecoveryUsed=true; closed=!recovery;
            LOGGER.info("JT808握手：stage=AUTHENTICATION_REJECTED reason={} awaiting={}",
                    frame.body().length!=6?"TOKEN_LENGTH":token==null?"TOKEN_MISSING":"TOKEN_MISMATCH",
                    recovery?"REGISTRATION":"CLOSED");
            return;
        }
        var authenticated=gateway.authenticate(binding); pinIdentity(authenticated);
        identity=authenticated; generation=coordinator.establish(); gateway.authenticationSucceeded(binding);
        log(frame,receivedAt,receivedAt,"AUTHENTICATED",Map.of());
        respond(frame,0,sink); flushReplies();
        LOGGER.info("JT808握手：stage=AUTHENTICATED");
        // 鉴权成功应答先独立完成；诊断查询由本连接维护循环在间隔后发送。
        firmwareProbeNotBefore=receivedAt.plusSeconds(1);
    }

    private void probeFirmware(Instant now,WireSink sink) throws IOException {
        if(!firmwareProbeEnabled || sleepReported || firmwareProbeNotBefore==null || now.isBefore(firmwareProbeNotBefore)
                || store.snapshot().containsKey(firmwareProbeStateKey)) return;
        requireCurrent();
        // 写前落盘；发送结果未知或重连时不盲目再次查询，更不接触升级或控制消息。
        store.update(map->map.put(firmwareProbeStateKey,"PREPARED|"+now));
        int serial=send(0x8413,new byte[]{0,1},sink);
        store.update(map->map.put(firmwareProbeStateKey,"SENT|"+serial+"|"+now));
        LOGGER.info("JT808握手：stage=FIRMWARE_QUERY_SENT");
    }

    private void receiveFirmwareVersion(Jt808Frame frame,Instant now,WireSink sink) throws IOException {
        if(!store.snapshot().containsKey(firmwareProbeStateKey)) { respond(frame,1,sink); return; }
        final Jt808Messages.FirmwareVersion version;
        try { version=Jt808Messages.firmwareVersion(frame.body()); }
        catch(Jt808ProtocolException unsupported) {
            LOGGER.info("JT808握手：stage=FIRMWARE_FORMAT_UNRECOGNIZED"); respond(frame,1,sink); return;
        }
        var fields=Map.<String,Object>of("device_type",version.deviceType(),"firmware_date",version.firmwareDate(),"firmware_major",version.major(),"firmware_minor",version.minor());
        store.update(map->map.put("metadata.firmware-version",json.writeValueAsString(fields)));
        log(frame,now,now,"FIRMWARE_VERSION",fields); respond(frame,0,sink);
        LOGGER.info("JT808握手：stage=FIRMWARE_VERSION date={} version={}.{}",version.firmwareDate(),version.major(),version.minor());
    }

    private void synchronizeTime(Jt808Frame frame,Instant now,WireSink sink) throws IOException {
        var time=Jt808Messages.timeSync(frame.body());
        if(time.operation()==1) {
            if(timeSyncSerial<0) throw new IllegalStateException("JT808无待确认授时");
            timeSyncSerial=-1;
            LOGGER.info("JT808握手：stage=TIME_SYNC_ACK result={} authenticated={}",time.result(),identity!=null);
            if(identity!=null) log(frame,now,now,"TIME_SYNC_ACK",Map.of("result",time.result()));
        } else {
            timeSyncSerial=send(0x840f,Jt808Messages.serverTime(now),sink);
            LOGGER.info("JT808握手：stage=TIME_SYNC_SENT zone=UTC+08:00 authenticated={}",identity!=null);
            if(identity!=null) log(frame,now,now,"TIME_SYNC_REQUEST",Map.of("operation",time.operation(),"zone","UTC+08:00"));
        }
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
        // 逐条保存明确的厂家上报原因；普通快照或命令ACK不推断实物开关锁成功。
        var details=new LinkedHashMap<String,Object>();
        java.util.Set<String> allowed=java.util.Set.of("door_closed","lock_status","report_reason","unlock_count","battery_percent","firmware_major","firmware_minor","charging","battery_cover_closed","shackle_closed");
        location.properties().forEach((propertyKey,value)->{if(allowed.contains(propertyKey))details.put(propertyKey,value);});
        // 厂家已确认本型号按门磁判断开合状态；保留判据来源，不能冒充独立锁舌传感或指令应答。
        Object door=location.properties().get("door_closed");
        details.put("door_state_source",door instanceof Boolean?"E2_BIT0_DOOR_CONTACT":"NOT_REPORTED");
        details.put("lock_state",door instanceof Boolean closed?(closed?"CLOSED":"OPEN"):"UNKNOWN");
        details.put("lock_state_source",door instanceof Boolean?"MANUFACTURER_DOOR_CONTACT":"NOT_REPORTED");
        details.put("bolt_position","UNKNOWN");
        details.put("physicalResult","UNCONFIRMED");
        int reason=((Number)location.properties().getOrDefault("report_reason",-1)).intValue();
        String kind=query?"QUERY_RESPONSE":switch(reason){
            case 1 -> "UNLOCK_REPORTED"; case 2 -> "LOCK_REPORTED"; case 3 -> "LOW_POWER_REPORTED";
            case 4 -> "CUT_ALARM_REPORTED"; case 5 -> "TAMPER_ALARM_REPORTED"; case 6 -> "UNLOCK_FAILURE_REPORTED";
            case 7 -> "BUTTON_WAKE_REPORTED"; case 8 -> "RESTART_REPORTED"; case 9 -> "LOW_BATTERY_ALARM_REPORTED";
            case 10 -> "DYNAMIC_PASSWORD_OPERATION_REPORTED"; case 11 -> "MOVEMENT_REPORTED"; case 12 -> "CARD_OPERATION_REPORTED";
            case 13 -> "PASSWORD_ATTEMPTS_REPORTED"; case 14 -> "LOCAL_PASSWORD_OPERATION_REPORTED";
            // 原因15在不同型号上有差异；只保留报警及原始原因，不能推断现场发生拆盖。
            case 15 -> "ALARM_REPORTED";
            default -> "STATUS_REPORTED";
        };
        var confirmation=contactConfirmation.observe(query,frame.serial(),location,Instant.parse(parts[1]),receivedAt,digest,identity);
        confirmation.ifPresent(match->{details.put("related_command_id",match.commandId().toString());
            details.put("correlation_basis",match.completion()?"SINGLE_PENDING_COMMAND_DOOR_TRANSITION":"POST_UNLOCK_DOOR_CLOSE");});
        log(frame,location.occurredAt(),Instant.parse(parts[1]),kind,details);
        if(confirmation.isPresent()) {
            contactConfirmation.confirm(confirmation.get(),identity);flushReplies();
        }
        if(!query && !location.occurredAt().isBefore(receivedAt.minusSeconds(60))
                && !location.occurredAt().isAfter(receivedAt.plusSeconds(60))) {
            sleepReported=false; LOGGER.info("JT808会话：stage=DEVICE_WAKE_REPORT reason={}",reason);
        }
        if(query) {
            int serial=Short.toUnsignedInt(ByteBuffer.wrap(frame.body()).getShort());
            String prefix=findCommand(serial,0x8201);
            if(prefix!=null && live(prefix,receivedAt)) {
                store.update(map->map.put(prefix+"state","SUCCEEDED"));
                outbox.enqueue(commandId(prefix),"result",DeviceCommandAccessReplyPort.Status.SUCCESS,mapped,null,digest,receivedAt,identity);
                flushReplies();
            }
        }
        respond(frame,0,sink);
    }

    private void acknowledge(Jt808Frame frame,Instant receivedAt) {
        var ack=Jt808Messages.acknowledgement(frame.body()); String prefix=findCommand(ack.serial(),ack.messageId());
        if(ack.messageId()==0x8418 && ack.result()==0) {
            log(frame,receivedAt,receivedAt,"SLEEP_NOTIFICATION",Map.of("responseMessage","0x8418","responseSerial",ack.serial(),"result",ack.result()));
            sleepReported=true; LOGGER.info("JT808会话：stage=DEVICE_SLEEP_NOTICE dispatch=DEFERRED"); return;
        }
        log(frame,receivedAt,receivedAt,"DEVICE_ACK",Map.of("responseMessage",String.format("0x%04X",ack.messageId()),"responseSerial",ack.serial(),"result",ack.result()));
        if(prefix==null || !live(prefix,receivedAt)) return;
        boolean failed=ack.result()!=0;
        String current=store.snapshot().get(prefix+"state");
        if("ACKNOWLEDGED".equals(current) && !failed) { flushReplies(); return; }
        if("ACKNOWLEDGED".equals(current) && failed) throw new IllegalStateException("JT808同一命令出现冲突应答");
        store.update(map->map.put(prefix+"state",failed?"FAILED":"ACKNOWLEDGED"));
        outbox.enqueue(commandId(prefix),"ack",failed?DeviceCommandAccessReplyPort.Status.FAILED:DeviceCommandAccessReplyPort.Status.ACK,
                null,failed?"JT808_DEVICE_REJECTED":null,frameDigest(frame),receivedAt,identity);
        flushReplies();
    }

    /** 到期和原回复恢复不重发控制；空维护不额外扣业务预算。 */
    public void maintain(Instant now) {
        synchronized(coordinator) {
            if(closed) throw new IllegalStateException("JT808连接已关闭");
            if(!active()) throw new IllegalStateException("JT808会话已失效");
            expire(now);
            if(store.snapshot().keySet().stream().anyMatch(k->k.startsWith("reply.") && !k.endsWith(".done") && !store.snapshot().containsKey(k+".done"))) {
                requireCurrent(); flushReplies();
            }
        }
    }

    /** 由当前连接自己的维护循环发送有界只读诊断，不占平台共享调度器或延迟鉴权应答。 */
    public void maintain(Instant now,WireSink sink) throws IOException {
        synchronized(coordinator) { maintain(now); probeFirmware(now,sink); }
    }

    /** 下行准入前的无副作用所有权判断，原命令准入和规则仍由平台消费者负责。 */
    public boolean owns(DeviceAccessPushPort.Push push) {
        synchronized(coordinator) {
            return active() && !sleepReported && identity.tenantId().equals(push.tenantId()) && identity.projectId().equals(push.projectId())
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
        if(!contactConfirmation.canDispatch(claimed.commandKey(),now)) return DeviceAccessPushPort.PushOutcome.WRITE_FAILED;
        if(message==0x8500 && store.snapshot().entrySet().stream().anyMatch(e->e.getKey().startsWith("cmd.") && e.getKey().endsWith("state")
                && e.getValue().equals("UNKNOWN") && "34048".equals(store.snapshot().get(e.getKey().replace("state","message")))
                && !Jt808ControlReview.reviewed(store.snapshot(),e.getKey().substring(0,e.getKey().length()-5)))) {
            return DeviceAccessPushPort.PushOutcome.WRITE_FAILED;
        }
        int serial=store.nextSerial();
        store.update(map-> { map.put(prefix+"state","PREPARED"); map.put(prefix+"serial",Integer.toString(serial));
            map.put(prefix+"message",Integer.toString(message)); map.put(prefix+"expires",claimed.expiresAt().toString());
            map.put(prefix+"key",claimed.commandKey());
            if(message==0x8500) contactConfirmation.prepare(map,prefix,now,identity); });
        if(logs!=null)logs.append(identity,"COMMAND|"+id,"COMMAND_DISPATCH_REQUESTED","DOWN",message,serial,now,now,
                Map.of("commandId",id.toString(),"commandKey",claimed.commandKey(),"physicalResult","UNCONFIRMED"));
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
    private void flushReplies() { outbox.flush(identity);contactConfirmation.finishApplied(); }
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
    private void log(Jt808Frame frame,Instant occurredAt,Instant receivedAt,String kind,Map<String,Object> details) {
        if(logs!=null)logs.append(identity,"UP|"+frameDigest(frame),kind,"UP",frame.messageId(),frame.serial(),occurredAt,receivedAt,details);
    }
    private static String frameDigest(Jt808Frame frame) {
        return OriginalPayloadDigest.of(ByteBuffer.allocate(4+frame.body().length).putShort((short)frame.messageId())
                .putShort((short)frame.serial()).put(frame.body()).array());
    }
    private void respond(Jt808Frame frame,int result,WireSink sink) throws IOException { send(0x8001,Jt808Messages.acknowledgement(frame.serial(),frame.messageId(),result),sink); }
    private int send(int message,byte[] body,WireSink sink) throws IOException {
        int serial=store.nextSerial(); sink.write(codec.encodeDownlink(new Jt808Frame(message,binding.terminalId(),serial,Optional.empty(),body)));
        return serial;
    }
    /** @return 仅扩展本地会话可用，不代表平台原生TCP在线事实 */
    public boolean active() { synchronized(coordinator) { return !closed && identity!=null && coordinator.owns(generation); } }
    public boolean isClosed() { synchronized(coordinator) { return closed; } }
    /** 仅关闭本连接；不关闭共享密码实例或删除持久状态。 */
    public void close() { synchronized(coordinator) { closed=true; } }
}
