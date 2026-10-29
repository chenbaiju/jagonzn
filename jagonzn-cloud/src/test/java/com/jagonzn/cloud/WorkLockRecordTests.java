package com.jagonzn.cloud;

import com.jagonzn.cloud.delivery.*;
import java.net.URI;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;

/** 参数合同与历史配置兼容；仅使用合成号码，不把现场手机号写入仓库。 */
class WorkLockRecordTests {
    static final ObjectMapper JSON=new ObjectMapper();
    static final UUID SOURCE=UUID.fromString("00000000-0000-0000-0000-000000000811"),TENANT=UUID.fromString("00000000-0000-0000-0000-000000000822"),PROJECT=UUID.fromString("00000000-0000-0000-0000-000000000833"),DEVICE=UUID.fromString("00000000-0000-0000-0000-000000000844");
    static JsonNode constants(){return JSON.createObjectNode().put("lockNum","860000000000000").put("phoneNum","13800000000").put("sealOffNum","");}
    static HttpDeliveryTarget target(URI url,UUID device,String from,String through,JsonNode constants){return new HttpDeliveryTarget("work-lock",1,SOURCE,TENANT,PROJECT,url,"POST",Set.of("jagonzn.lock.log"),Map.of(),Map.of(),Map.of(),constants,Set.of(200),"/code",JSON.valueToTree(200),true,3,1,true,"WORK_LOCK_RECORD_V1",device,from,through);}
    static JsonNode event(UUID id,String kind,UUID device){return JSON.createObjectNode().put("schemaVersion",1).put("eventId",id.toString()).put("eventType","jagonzn.lock.log").put("tenantId",TENANT.toString()).put("projectId",PROJECT.toString()).put("deviceId",device.toString()).put("occurredAt","2025-12-04T00:00:59Z").set("payload",JSON.createObjectNode().put("logType",kind));}
    static HttpDeliveryTarget target(){return target(URI.create("http://127.0.0.1:9001/records"),DEVICE,"2020-01-01T00:00:00Z","2099-01-01T00:00:00Z",constants());}
    @Test void exactSixFieldsUseBeijingOperationTimeChineseStateAndStablePerRecordUuid(){
        UUID open=UUID.randomUUID(),close=UUID.randomUUID();var target=target();var body=JSON.readTree(target.body(event(open,"UNLOCK_REPORTED",DEVICE),JSON));
        assertThat(body.propertyNames()).containsExactlyInAnyOrder("uuid","optime","lockState","lockNum","phoneNum","sealOffNum");
        assertThat(body.path("uuid").asText()).isEqualTo(open.toString().replace("-",""));assertThat(body.path("optime").asText()).isEqualTo("2025-12-04 08:00");assertThat(body.path("lockState").asText()).isEqualTo("开锁");assertThat(body.path("sealOffNum").asText()).isEmpty();
        assertThat(target.body(event(open,"UNLOCK_REPORTED",DEVICE),JSON)).isEqualTo(target.body(event(open,"UNLOCK_REPORTED",DEVICE),JSON));
        var closed=JSON.readTree(target.body(event(close,"LOCK_REPORTED",DEVICE),JSON));assertThat(closed.path("lockState").asText()).isEqualTo("关锁");assertThat(closed.path("uuid").asText()).isNotEqualTo(body.path("uuid").asText());
    }
    @Test void knownDispatchNumberIsCopiedAndUnknownNumberStaysEmpty(){
        var fields=JSON.createObjectNode().put("lockNum","S787854589").put("phoneNum","13800000000").put("sealOffNum","67646");
        var target=target(URI.create("http://127.0.0.1:9001/records"),DEVICE,"2020-01-01T00:00:00Z","2099-01-01T00:00:00Z",fields);
        assertThat(JSON.readTree(target.body(event(UUID.randomUUID(),"LOCK_REPORTED",DEVICE),JSON)).path("sealOffNum").asText()).isEqualTo("67646");
    }
    @ParameterizedTest @ValueSource(strings={"AUTHENTICATED","DEVICE_ACK","COMMAND_DISPATCH_REQUESTED","STATUS_REPORTED"})
    void metadataAndCommandIntentCannotBecomeOperationRecords(String kind){assertThatThrownBy(()->target().body(event(UUID.randomUUID(),kind,DEVICE),JSON)).isInstanceOf(IllegalArgumentException.class);}
    @Test void differentDeviceCannotUseTheFixedLockAndPhone(){assertThatThrownBy(()->target().body(event(UUID.randomUUID(),"LOCK_REPORTED",UUID.randomUUID()),JSON)).isInstanceOf(IllegalArgumentException.class);}
    @ParameterizedTest @ValueSource(strings={"missing-lock","missing-phone","bad-phone","uuid-override","no-device","no-window","reverse-window"})
    void incompleteOrWidenedConfigurationIsRejected(String bad){
        var fields=JSON.createObjectNode().put("lockNum","860000000000000").put("phoneNum","13800000000");UUID device=DEVICE;String from="2020-01-01T00:00:00Z",through="2099-01-01T00:00:00Z";
        switch(bad){case "missing-lock"->fields.remove("lockNum");case "missing-phone"->fields.remove("phoneNum");case "bad-phone"->fields.put("phoneNum","unknown");case "uuid-override"->fields.put("uuid","spoof");case "no-device"->device=null;case "no-window"->from=null;case "reverse-window"->through=from;}
        UUID selected=device;String start=from,end=through;
        assertThatThrownBy(()->target(URI.create("http://127.0.0.1:9001/records"),selected,start,end,fields)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void legacySnapshotsRemainGenericAndNewProfileRequiresExactBusinessSuccess(){
        var t=target();assertThat(t.success(200,"{\"code\":200,\"msg\":\"成功\"}",JSON)).isTrue();assertThat(t.success(200,"{\"code\":500,\"msg\":\"失败\"}",JSON)).isFalse();assertThat(t.success(200,"{\"code\":\"200\"}",JSON)).isFalse();
        var old=JSON.valueToTree(new HttpDeliveryTarget("generic",1,SOURCE,TENANT,PROJECT,URI.create("https://example.invalid/events"),"POST",Set.of("jagonzn.lock.log"),Map.of(),Map.of(),Map.of(),JSON.createObjectNode(),Set.of(200),"",null,false,3,1,false));
        var legacy=JSON.createObjectNode();old.properties().forEach(e->{if(!Set.of("payloadProfile","deviceId","receivedNotBefore","receivedNotAfter").contains(e.getKey()))legacy.set(e.getKey(),e.getValue());});
        assertThat(JSON.readValue(legacy.toString(),HttpDeliveryTarget.class).payloadProfile()).isEqualTo("GENERIC_JSON");
    }
}
