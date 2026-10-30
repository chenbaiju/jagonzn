package com.jagonzn.service.extension.jt808;

import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import com.things.link.ingestion.application.access.DeviceAccessPushPort;
import com.things.link.telemetry.application.DeviceCommandAccessReplyPort;
import java.time.*;
import java.util.*;
import java.util.concurrent.ArrayBlockingQueue;
import tools.jackson.databind.*;

/** 远程设备MQTT网关；不构造平台事务或伪造身份版本，物理写前后分别核验线上事实。 */
public final class Jt808RemoteGateway implements Jt808PlatformGateway,AutoCloseable {
    private final Jt808RemoteSettings settings;private final Jt808DeviceBinding binding;private final Jt808RemoteManagement management;private final Jt808RemoteMqtt mqtt;private final Jt808RemoteOutbox outbox;private final ObjectMapper json;private final Clock clock;
    private final ArrayBlockingQueue<Map.Entry<String,byte[]>> incoming=new ArrayBlockingQueue<>(64);
    private final java.util.concurrent.atomic.AtomicBoolean busy=new java.util.concurrent.atomic.AtomicBoolean();
    private final java.util.concurrent.ExecutorService worker=java.util.concurrent.Executors.newSingleThreadExecutor(r->{var t=new Thread(r,"jt808-remote-delivery");t.setDaemon(true);return t;});
    private volatile Jt808TcpServer server;private volatile long generation;private volatile boolean active;
    private volatile Instant retryAfter=Instant.MIN;
    private int deliveryFailures;
    private int authenticationFailures;private Instant failureWindow;
    public Jt808RemoteGateway(Jt808RemoteSettings settings,Jt808DeviceBinding binding,Jt808RemoteManagement management,Jt808RemoteMqtt mqtt,Jt808RemoteOutbox outbox,ObjectMapper json,Clock clock){
        this.settings=settings;this.binding=binding;this.management=management;this.mqtt=mqtt;this.outbox=outbox;this.json=json;this.clock=clock;mqtt.onDisconnect(()->{active=false;incoming.clear();});mqtt.receiver((t,b)->{if(!incoming.offer(Map.entry(t,b))){mqtt.disconnect();active=false;}});
    }
    /** 与当前TCP接收器绑定，不把命令交给另一个本机内核或Kafka消费者。 */
    public void attach(Jt808TcpServer server){this.server=server;}
    public synchronized void checkAuthenticationBudget(Jt808DeviceBinding ignored,String ip){settings.requireCurrent();if(failureWindow!=null&&!clock.instant().isBefore(failureWindow.plusSeconds(60))){authenticationFailures=0;failureWindow=null;}if(authenticationFailures>=5)throw new Jt808ThingsLinkGateway.AuthenticationBudgetRejected(com.things.link.ingestion.application.access.DeviceAccessAuthBudget.Decision.BACKOFF);}
    public synchronized void authenticationFailed(Jt808DeviceBinding ignored){if(failureWindow==null)failureWindow=clock.instant();authenticationFailures++;if(!active)mqtt.disconnect();}
    public synchronized void authenticationSucceeded(Jt808DeviceBinding ignored){authenticationFailures=0;failureWindow=null;}
    /** Broker CONNECT实际验证设备secret，管理面核对原身份、真实凭据版本和启用平面。 */
    public AuthenticatedDeviceIdentity authenticate(Jt808DeviceBinding value){
        if(value!=binding)throw new IllegalArgumentException("远程绑定实例不匹配");management.verify();mqtt.connect();return identity();
    }
    private AuthenticatedDeviceIdentity identity(){return new AuthenticatedDeviceIdentity(settings.tenant,settings.project,settings.device,settings.credentialVersion);}
    public void sessionOpened(long value){if(value!=generation){incoming.clear();if(generation!=0){mqtt.disconnect();mqtt.connect();}}generation=value;active=true;}
    public void sessionClosed(long value){if(value==generation){active=false;incoming.clear();mqtt.disconnect();}}
    public void report(AuthenticatedDeviceIdentity identity,byte[] payload,Instant received,String trace){
        if(!identity().equals(identity))throw new IllegalStateException("远程上行身份不匹配");var body=json.readTree(payload);var properties=(tools.jackson.databind.node.ObjectNode)body.path("payload");
        var door=properties.path("door_closed");properties.put("lock_state",door.isBoolean()?(door.asBoolean()?"CLOSED":"OPEN"):"UNKNOWN");properties.put("lock_state_source",door.isBoolean()?"MANUFACTURER_DOOR_CONTACT":"NOT_REPORTED");outbox.property(json.writeValueAsBytes(body),received);
    }
    public void event(String dedup,String kind,Instant occurred,Instant received,Map<String,Object> details){outbox.event(dedup,kind,occurred,received,details,binding.modelVersion());}
    /** 原结果先冻结再发送；只有受权限控制的命令GET确认同一状态及输出，才返回APPLIED。 */
    public DeviceCommandAccessReplyPort.Outcome reply(AuthenticatedDeviceIdentity identity,DeviceCommandAccessReplyPort.Reply reply,String digest){
        if(!identity().equals(identity))throw new IllegalStateException("远程回复身份不匹配");settings.requireCurrent();
        var body=json.createObjectNode().put("messageId",reply.messageId().toString()).put("occurredAt",reply.occurredAt().toString()).put("status",reply.status().name()).set("output",json.valueToTree(reply.output()==null?Map.of():reply.output()));
        if(reply.errorCode()!=null)body.put("errorCode",reply.errorCode());
        String key="result."+reply.messageId(),frozen=body.toString(),old=outbox.store().snapshot().get(key);if(old!=null&&!old.equals(frozen))throw new IllegalStateException("远程回复正文改变");if(old==null)outbox.store().update(m->m.put(key,frozen));
        if(!mqtt.connected())throw new ReplyPending();
        try{management.verify();}catch(RuntimeException unavailable){throw new ReplyPending();}
        mqtt.publish(prefix()+"up/command/"+reply.commandId()+"/reply",frozen.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        JsonNode actual;
        try{actual=management.command(reply.commandId());}catch(RuntimeException unavailable){throw new ReplyPending();}
        String state=switch(reply.status()){case SUCCESS->"SUCCEEDED";case FAILED->"FAILED";case ACK->"ACKNOWLEDGED";};
        if(!actual.path("id").asText().equals(reply.commandId().toString())||!actual.path("deviceId").asText().equals(settings.device.toString())||!actual.path("status").asText().equals(state)||!actual.path("output").equals(body.path("output"))
                ||reply.status()==DeviceCommandAccessReplyPort.Status.FAILED&&!Objects.equals(reply.errorCode(),actual.path("failureCode").asText(null)))throw new ReplyPending();
        outbox.store().update(m->m.put(key+".done",state));return DeviceCommandAccessReplyPort.Outcome.APPLIED;
    }
    private String prefix(){return "tc/v1/"+binding.projectKey()+"/"+binding.deviceKey()+"/";}
    /** 后台I/O与设备接收线程分离，回调只排队；失败保留队列，下一轮仍核对权限与范围。 */
    @org.springframework.scheduling.annotation.Scheduled(fixedDelayString="${jagonzn.jt808.remote.poll-millis:1000}")
    public void trigger(){if(!active||!busy.compareAndSet(false,true))return;try{worker.execute(()->{try{tick();}catch(RuntimeException rejected){org.slf4j.LoggerFactory.getLogger(getClass()).warn("JT808远程交付未确认，原件保留");}finally{busy.set(false);}});}catch(java.util.concurrent.RejectedExecutionException closed){busy.set(false);}}
    public void tick(){
        if(!active)return;settings.requireCurrent();if(!mqtt.connected())return;
        if(incoming.isEmpty()&&!outbox.hasPending()||clock.instant().isBefore(retryAfter))return;
        // 旧MQTT连接尚未断开也不能沿用已撤销的配置；失败时仅保留原件和待确认结果。
        try{
            management.verify();
            for(int n=0;n<64;n++){var entry=incoming.poll();if(entry==null)break;if(entry.getKey().equals(prefix()+"down/uplink/receipt"))outbox.receipt(entry.getKey(),entry.getValue());else dispatch(entry.getKey(),entry.getValue());}
            outbox.flush(mqtt);deliveryFailures=0;retryAfter=Instant.MIN;
        }catch(RuntimeException rejected){
            // 限流、过期及网络失败均有界退避；不修改保护配置，不清队列，也不重复物理命令。
            deliveryFailures=Math.min(deliveryFailures+1,5);retryAfter=clock.instant().plusSeconds(Math.min(30,1L<<deliveryFailures));throw rejected;
        }
    }
    /** MQTT不带截止时刻，须核对同命令当前尝试；后继尝试只可续接等待，原物理派发仍持久去重。 */
    public synchronized void dispatch(String topic,byte[] bytes){
        if(!settings.controls||!settings.includes(clock.instant())||!active||!mqtt.connected()||server==null||bytes.length>4096||!topic.startsWith(prefix()+"down/command/"))return;
        UUID id=UUID.fromString(topic.substring((prefix()+"down/command/").length()));if(id.version()!=7)return;
        var body=json.readTree(bytes);if(!body.isObject()||!body.propertyNames().equals(Set.of("targetDeviceKey","commandKey","input","attempt"))||!binding.deviceKey().equals(body.path("targetDeviceKey").asText())||!body.path("input").isObject()||!body.path("input").isEmpty()||!Set.of("jt808_query","jt808_unlock").contains(body.path("commandKey").asText()))return;
        var actual=management.command(id);Instant now=clock.instant();int attempt=body.path("attempt").asInt();
        if(!actual.path("id").asText().equals(id.toString())||!actual.path("deviceId").asText().equals(settings.device.toString())||!actual.path("connectionDeviceId").asText().equals(settings.device.toString())||!actual.path("commandKey").asText().equals(body.path("commandKey").asText())||!actual.path("input").equals(body.path("input"))||!Set.of("DISPATCHED","ACKNOWLEDGED").contains(actual.path("status").asText())||attempt<1||actual.path("attemptCount").asInt()!=attempt)return;
        Instant deadline=null;for(var a:actual.path("attempts"))if(a.path("attemptNo").asInt()==attempt&&Set.of("PUBLISHED","ACKNOWLEDGED").contains(a.path("status").asText()))deadline=Instant.parse(a.path("deadlineAt").asText());
        if(deadline==null||!deadline.isAfter(now)||deadline.isAfter(now.plusSeconds(300)))return;
        if("jt808_unlock".equals(body.path("commandKey").asText())){
            // 一个明确范围只准许一个开锁命令ID；持久占位后重放只能关联原命令。
            String claimed=outbox.store().snapshot().get("remote.control.commandId");
            if(claimed!=null&&!claimed.equals(id.toString()))return;
            if(claimed==null)outbox.store().update(m->m.put("remote.control.commandId",id.toString()));
        }
        // 原会话持久commandId去重及写前门磁基线检查仍是最后一道厂家控制门禁。
        var push=new DeviceAccessPushPort.Push(settings.tenant,settings.project,settings.device,id,body.path("commandKey").asText(),"{}",attempt,deadline);
        // 同ID后继尝试先续接结果等待；拒绝续接时原push仍按持久ID去重，绝不重发已有控制。
        if(attempt>1 && server.resumeResultWait(push)) return;
        server.push(push);
    }
    @Override public void close(){active=false;worker.shutdownNow();mqtt.close();}
}
