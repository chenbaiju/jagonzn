package com.jagonzn.service.extension.jt808;

import com.things.link.shared.id.Uuid7;
import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import com.things.link.telemetry.application.DeviceCommandAccessReplyPort;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectMapper;

/** 只重交同一已冻结回复，不重发物理命令；保留最初身份代际、时间、摘要及消息ID。 */
final class Jt808ReplyOutbox {
    private static final TypeReference<Map<String,Object>> MAP=new TypeReference<>() { };
    private final Jt808StateStore store;
    private final Jt808ThingsLinkGateway gateway;
    private final ObjectMapper json;

    Jt808ReplyOutbox(Jt808StateStore store,Jt808ThingsLinkGateway gateway,ObjectMapper json) {
        this.store=store; this.gateway=gateway; this.json=json;
    }

    void enqueue(UUID commandId,String stage,DeviceCommandAccessReplyPort.Status status,Map<String,Object> output,
                 String errorCode,String digest,Instant receivedAt,AuthenticatedDeviceIdentity identity) {
        String key="reply."+commandId+"."+stage;
        if(store.snapshot().containsKey(key)) return;
        var data=new LinkedHashMap<String,Object>();
        data.put("command",commandId.toString()); data.put("message",Uuid7.generate().toString()); data.put("status",status.name());
        data.put("output",output); data.put("error",errorCode); data.put("digest",digest); data.put("received",receivedAt.toString());
        data.put("tenant",identity.tenantId().toString()); data.put("project",identity.projectId().toString());
        data.put("device",identity.deviceId().toString()); data.put("version",identity.credentialVersion());
        String frozen=json.writeValueAsString(data); store.update(map->map.put(key,frozen));
    }

    @SuppressWarnings("unchecked")
    void flush(AuthenticatedDeviceIdentity current) {
        for(var entry:store.snapshot().entrySet().stream().filter(e->e.getKey().startsWith("reply.") && !e.getKey().endsWith(".done"))
                .sorted(Map.Entry.comparingByKey()).toList()) {
            String key=entry.getKey(); if(store.snapshot().containsKey(key+".done")) continue;
            var data=json.readerFor(MAP).with(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS).readValue(entry.getValue());
            Map<String,Object> value=(Map<String,Object>)data;
            var original=new AuthenticatedDeviceIdentity(UUID.fromString((String)value.get("tenant")),UUID.fromString((String)value.get("project")),
                    UUID.fromString((String)value.get("device")),((Number)value.get("version")).longValue());
            if(!current.equals(original)) throw new IllegalStateException("JT808历史回复凭据已变化，须人工核对");
            Instant received=Instant.parse((String)value.get("received"));
            var reply=new DeviceCommandAccessReplyPort.Reply(original.tenantId(),original.projectId(),original.deviceId(),
                    UUID.fromString((String)value.get("command")),UUID.fromString((String)value.get("message")),
                    DeviceCommandAccessReplyPort.Status.valueOf((String)value.get("status")),(Map<String,Object>)value.get("output"),
                    (String)value.get("error"),null,received,received,(String)value.get("message"));
            var outcome=gateway.reply(original,reply,(String)value.get("digest"));
            if(outcome!=DeviceCommandAccessReplyPort.Outcome.APPLIED && outcome!=DeviceCommandAccessReplyPort.Outcome.DUPLICATE)
                throw new IllegalStateException("JT808命令回复未被平台确认");
            store.update(map->map.put(key+".done",outcome.name()));
        }
    }
}
