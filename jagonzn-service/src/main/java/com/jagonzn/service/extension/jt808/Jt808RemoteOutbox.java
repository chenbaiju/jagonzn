package com.jagonzn.service.extension.jt808;

import com.things.link.shared.id.Uuid7;
import java.time.Instant;
import java.util.*;
import tools.jackson.databind.*;

/** 独占外盘队列；稳定正文、明确新事件窗口、范围摘要和PERSISTED签收共同阻止历史误补交。 */
public final class Jt808RemoteOutbox {
    private final Jt808StateStore store;private final Jt808RemoteSettings settings;private final ObjectMapper json;private final String prefix;
    public Jt808RemoteOutbox(Jt808StateStore store,Jt808RemoteSettings settings,Jt808DeviceBinding binding,ObjectMapper json){
        this.store=store;this.settings=settings;this.json=json;prefix="tc/v1/"+binding.projectKey()+"/"+binding.deviceKey()+"/";
        bind(store,settings);bindIdentity(binding);
    }
    static void bind(Jt808StateStore store,Jt808RemoteSettings settings){
        String digest=settings.bindingDigest();var values=store.snapshot();
        if(values.isEmpty())store.update(m->m.put("remote.scope",digest));
        else if(!digest.equals(values.get("remote.scope")))throw new IllegalStateException("远程状态目录已有其他范围，禁止复用旧历史");
    }
    private void bindIdentity(Jt808DeviceBinding binding){
        String id=Jt808RemoteSettings.hash((binding.projectKey()+"|"+binding.deviceKey()+"|"+binding.modelVersion()+"|"+binding.terminalId()+"|"+HexFormat.of().formatHex(binding.mac())+"|"+new TreeMap<>(binding.properties())+"|"+Jt808RemoteSettings.hash(binding.secret().getBytes(java.nio.charset.StandardCharsets.UTF_8))).getBytes(java.nio.charset.StandardCharsets.UTF_8));
        var old=store.snapshot().get("remote.binding");if(old!=null&&!old.equals(id))throw new IllegalStateException("远程队列绑定发生变化");if(old==null)store.update(m->m.put("remote.binding",id));
    }
    /** 属性原正文先保存，范围外新记录明确拒绝；同messageId异正文不覆盖。 */
    public void property(byte[] bytes,Instant received){var body=json.readTree(bytes);String id=body.path("messageId").asText();put("PROPERTY",id,"property/report",body,received);}
    /** 只将原因1/2及真实门磁一致的日志转成事件，使用与属性不同的稳定UUID。 */
    public synchronized void event(String dedup,String kind,Instant occurred,Instant received,Map<String,Object> details,String model){
        boolean open=kind.equals("UNLOCK_REPORTED");if(!open&&!kind.equals("LOCK_REPORTED"))return;
        if(!(details.get("door_closed") instanceof Boolean closed)||closed==open)return;
        String key="event-id."+Jt808RemoteSettings.hash(dedup.getBytes(java.nio.charset.StandardCharsets.UTF_8));var id=store.snapshot().get(key);
        String suffix="event/"+(open?"lock_opened":"lock_closed");
        if(id!=null){
            String saved=store.snapshot().get("uplink."+id);if(saved==null)throw new IllegalStateException("事件原件索引不完整，须核对");var envelope=json.readTree(saved);var first=json.readTree(envelope.path("payload").asText());
            if(!envelope.path("topic").asText().equals(prefix+"up/"+suffix)||!first.path("modelVersion").asText().equals(model)||!first.path("occurredAt").asText().equals(occurred.toString())||first.path("params").path("door_closed").asBoolean()!=closed)throw new IllegalStateException("相同报文对应的事件事实改变");
            // related_command_id是首次关联结果；重放时在途命令已结束也不得重建或丢失此字段。
            return;
        }
        requireWindow(received);id=Uuid7.generate().toString();
        var params=json.createObjectNode().put("door_closed",closed).put("report_reason",open?1:2).put("lock_state",open?"OPEN":"CLOSED").put("lock_state_source","MANUFACTURER_DOOR_CONTACT");
        if(details.get("related_command_id") instanceof String command)params.put("related_command_id",command);
        var body=json.createObjectNode().put("messageId",id).put("modelVersion",model).put("occurredAt",occurred.toString()).set("params",params);
        put("EVENT",id,suffix,body,received,key);
    }
    private synchronized void put(String kind,String id,String suffix,JsonNode body,Instant received){
        put(kind,id,suffix,body,received,null);
    }
    private synchronized void put(String kind,String id,String suffix,JsonNode body,Instant received,String alias){
        settings.requireCurrent();UUID uuid=UUID.fromString(id);if(uuid.version()!=7)throw new IllegalArgumentException("远程上行消息须为UUIDv7");
        String key="uplink."+id;String payload=json.writeValueAsString(body),old=store.snapshot().get(key);
        if(old!=null){var original=json.readTree(old);if(!original.path("payload").asText().equals(payload)||!original.path("kind").asText().equals(kind))throw new IllegalStateException("远程上行同键正文冲突");return;}
        requireWindow(received);if(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8).length>60000||store.snapshot().size()>4000)throw new IllegalStateException("远程队列容量已满");
        String frozen=json.createObjectNode().put("kind",kind).put("topic",prefix+"up/"+suffix).put("payload",payload).put("modelVersion",body.path("modelVersion").asText()).toString();store.update(m->{m.put(key,frozen);if(alias!=null)m.put(alias,id);});
        org.slf4j.LoggerFactory.getLogger(getClass()).info("JT808远程上行已持久排队 messageId={} kind={}",id,kind);
    }
    private void requireWindow(Instant received){if(!settings.includes(received))throw new IllegalStateException("新事件不在明确远程交付窗口");}
    /** 没有待签收原件时不触发管理GET轮询，原已签收事实仍完整保留。 */
    public boolean hasPending(){var values=store.snapshot();return values.keySet().stream().anyMatch(k->k.startsWith("uplink.")&&!k.endsWith(".done")&&!values.containsKey(k+".done"));}
    /** 一轮最多十条，PUBACK后仍待业务回执；丢失回执可补查，重启沿用相同ID和正文。 */
    public void flush(Jt808RemoteMqtt mqtt){
        settings.requireCurrent();for(var entry:store.snapshot().entrySet().stream().filter(e->e.getKey().startsWith("uplink.")&&!e.getKey().endsWith(".done")&&!store.snapshot().containsKey(e.getKey()+".done")).sorted(Map.Entry.comparingByKey()).limit(10).toList()){
            var v=json.readTree(entry.getValue());mqtt.publish(v.path("topic").asText(),v.path("payload").asText().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            var query=json.createObjectNode().put("messageId",entry.getKey().substring(7)).put("modelVersion",v.path("modelVersion").asText()).put("kind",v.path("kind").asText());mqtt.publish(prefix+"up/uplink/receipt/query",json.writeValueAsBytes(query));
        }
    }
    /** 只接受本设备、原消息、原模型与种类的明确持久回执，未知或不匹配回执不消除待发送记录。 */
    public synchronized void receipt(String topic,byte[] bytes){
        if(!topic.equals(prefix+"down/uplink/receipt")||bytes.length>1024)return;settings.requireCurrent();var r=json.readTree(bytes);String key="uplink."+r.path("messageId").asText();String value=store.snapshot().get(key);if(value==null)return;var expected=json.readTree(value);
        if(r.path("status").asText().equals("PERSISTED")&&r.path("kind").asText().equals(expected.path("kind").asText())&&r.path("modelVersion").asText().equals(expected.path("modelVersion").asText()))store.update(m->m.put(key+".done","PERSISTED"));
    }
    Jt808StateStore store(){return store;}
}
