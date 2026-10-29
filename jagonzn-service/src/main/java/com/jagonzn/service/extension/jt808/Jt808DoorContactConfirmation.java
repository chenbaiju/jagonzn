package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.Jt808Messages;
import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import com.things.link.telemetry.application.DeviceCommandAccessReplyPort;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** 厂家门磁判据下的有界单命令状态关联；不伪造协议ACK，也不把历史状态补成执行结果。 */
final class Jt808DoorContactConfirmation {
    private final boolean enabled;
    private final Jt808StateStore store;
    private final Jt808ReplyOutbox outbox;
    private final String session=UUID.randomUUID().toString();
    private Observation latest;
    private Match recentUnlock;
    private record Observation(boolean closed,int reason,int serial,Instant occurred,Instant received,String digest) { }
    record Match(String prefix,Map<String,Object> output,String digest,Instant occurred,Instant received,boolean completion) {
        UUID commandId() { return UUID.fromString(prefix.substring(4,prefix.length()-1)); }
    }

    Jt808DoorContactConfirmation(boolean enabled,Jt808StateStore store,Jt808ReplyOutbox outbox) {
        this.enabled=enabled;this.store=store;this.outbox=outbox;
    }

    /** 开启关联后，仅允许新鲜、同连接的相反门磁基线及唯一在途控制。 */
    boolean canDispatch(String key,Instant now) {
        if(!enabled || !control(key)) return true;
        return pending().isEmpty() && latest!=null && !latest.received().isAfter(now)
                && !latest.received().isBefore(now.minusSeconds(30)) && latest.closed()==key.equals("jt808_unlock");
    }

    /** 随命令发送意图原子保存基线、原身份与会话；连接变更后不能拿新报文完成旧命令。 */
    void prepare(Map<String,String> values,String prefix,Instant now,AuthenticatedDeviceIdentity identity) {
        if(!enabled) return;
        values.put(prefix+"contact.session",session);values.put(prefix+"contact.sent",now.toString());
        values.put(prefix+"contact.before",Boolean.toString(latest.closed()));values.put(prefix+"contact.serial",Integer.toString(latest.serial()));
        values.put(prefix+"contact.version",Long.toString(identity.credentialVersion()));
        values.put(prefix+"contact.baselineReceived",latest.received().toString());
        values.put(prefix+"contact.baselineDigest",latest.digest());recentUnlock=null;
    }

    /** 只观察真正主动上报；时间、顺序、原因、状态变化和唯一在途命令须同时成立。 */
    Optional<Match> observe(boolean query,int serial,Jt808Messages.Location location,Instant originalReceived,
                            Instant now,String digest,AuthenticatedDeviceIdentity identity) {
        if(!enabled || query || !(location.properties().get("door_closed") instanceof Boolean closed)) return Optional.empty();
        Instant occurred=location.occurredAt();
        if(originalReceived.isAfter(now) || originalReceived.isBefore(now.minusSeconds(5))
                || occurred.isBefore(originalReceived.minusSeconds(5)) || occurred.isAfter(originalReceived.plusSeconds(1))) return Optional.empty();
        int reason=((Number)location.properties().getOrDefault("report_reason",-1)).intValue();
        var report=new Observation(closed,reason,serial,occurred,originalReceived,digest);
        if(latest!=null && (serial<=latest.serial() || !originalReceived.isAfter(latest.received()) || occurred.isBefore(latest.occurred()))) return Optional.empty();
        var snapshot=store.snapshot();var waiting=pending();Match match=null;
        if(waiting.size()==1 && !snapshot.containsKey("contact.used."+digest)) {
            String prefix=waiting.getFirst(),key=snapshot.get(prefix+"key");Instant sent=parse(snapshot.get(prefix+"contact.sent"));
            boolean applicable=sent!=null && session.equals(snapshot.get(prefix+"contact.session"))
                    && Long.toString(identity.credentialVersion()).equals(snapshot.get(prefix+"contact.version"))
                    && ("SENT".equals(snapshot.get(prefix+"state")) || "ACKNOWLEDGED".equals(snapshot.get(prefix+"state")))
                    && now.isBefore(Instant.parse(snapshot.get(prefix+"expires"))) && originalReceived.isAfter(sent)
                    && !occurred.isBefore(sent.truncatedTo(ChronoUnit.SECONDS))
                    && serial>Integer.parseInt(snapshot.get(prefix+"contact.serial"));
            if(applicable && !snapshot.containsKey(prefix+"contact.invalidated")) {
                boolean target=key.equals("jt808_lock");int expected=target?2:1;
                if(latest!=null && latest.closed()!=closed && closed==target && reason==expected) {
                    var output=new LinkedHashMap<String,Object>();output.put("door_closed",closed);output.put("lock_state",closed?"CLOSED":"OPEN");
                    output.put("confirmation_basis","MANUFACTURER_DOOR_CONTACT_TRANSITION");output.put("correlation","SINGLE_PENDING_COMMAND");
                    output.put("device_command_id_present",false);output.put("protocol_ack_received","ACKNOWLEDGED".equals(snapshot.get(prefix+"state")));
                    output.put("evidence_message_id","0x0200");output.put("evidence_serial",serial);output.put("evidence_digest",digest);
                    output.put("evidence_occurred_at",occurred.toString());output.put("evidence_received_at",originalReceived.toString());
                    output.put("command_sent_at",sent.toString());output.put("independent_bolt_position","UNKNOWN");
                    output.put("baseline_digest",snapshot.get(prefix+"contact.baselineDigest"));
                    output.put("baseline_received_at",snapshot.get(prefix+"contact.baselineReceived"));
                    match=new Match(prefix,Map.copyOf(output),digest,occurred,originalReceived,true);
                } else if((latest!=null && latest.closed()!=closed) || reason==10 || reason==12 || reason==14) {
                    store.update(map->map.put(prefix+"contact.invalidated","UNRELATED_CONTACT_OR_LOCAL_OPERATION"));
                }
            }
        }
        // 成功开锁后的关门只补同一现场周期的日志关系，不生成第二次命令成功或关锁指令。
        if(match==null && recentUnlock!=null && waiting.isEmpty() && latest!=null && !latest.closed() && closed && reason==2
                && now.isBefore(recentUnlock.received().plusSeconds(30)) && originalReceived.isAfter(recentUnlock.received())) {
            match=new Match(recentUnlock.prefix(),Map.of(),digest,occurred,originalReceived,false);recentUnlock=null;
        }
        latest=report;return Optional.ofNullable(match);
    }

    /** 状态满足证据和唯一结果消息一起冻结，再由现有公开回复端口推进平台命令。 */
    void confirm(Match match,AuthenticatedDeviceIdentity identity) {
        if(!match.completion()) return;
        outbox.enqueueWithEvidence(match.commandId(),"result",DeviceCommandAccessReplyPort.Status.SUCCESS,match.output(),null,
                match.digest(),match.occurred(),match.received(),identity,map->{
                    map.put(match.prefix()+"state","CONFIRMED_PENDING");map.put(match.prefix()+"contact.evidence",match.digest());
                    map.put("contact.used."+match.digest(),match.commandId().toString());
                });
        if("jt808_unlock".equals(store.snapshot().get(match.prefix()+"key"))) recentUnlock=match;
    }

    /** 平台明确应用或确认同键重放后，才把扩展本地命令记为成功。 */
    void finishApplied() {
        var snapshot=store.snapshot();var ready=snapshot.entrySet().stream().filter(e->e.getKey().startsWith("cmd.")
                && e.getKey().endsWith(".state") && e.getValue().equals("CONFIRMED_PENDING"))
                .map(e->e.getKey().substring(0,e.getKey().length()-5))
                .filter(p->snapshot.containsKey("reply."+p.substring(4,p.length()-1)+".result.done")).toList();
        if(!ready.isEmpty()) store.update(map->ready.forEach(p->map.put(p+"state","SUCCEEDED")));
    }

    private List<String> pending() {
        var snapshot=store.snapshot();return snapshot.entrySet().stream().filter(e->e.getKey().startsWith("cmd.") && e.getKey().endsWith(".state")
                && List.of("PREPARED","SENT","ACKNOWLEDGED","CONFIRMED_PENDING").contains(e.getValue()))
                .map(e->e.getKey().substring(0,e.getKey().length()-5)).filter(p->"34048".equals(snapshot.get(p+"message"))).toList();
    }
    private static boolean control(String key) { return "jt808_unlock".equals(key)||"jt808_lock".equals(key); }
    private static Instant parse(String value) { return value==null?null:Instant.parse(value); }
}
