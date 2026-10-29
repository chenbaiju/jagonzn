package com.jagonzn.cloud.delivery;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.Set;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** 作业系统接口2的六字段记录；记录主键独立于作业主键，重推沿用原值。 */
public record WorkLockRecord(String uuid,String optime,String lockState,String lockNum,String phoneNum,String sealOffNum) {
    private static final DateTimeFormatter TIME=DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm",java.util.Locale.ROOT).withResolverStyle(ResolverStyle.STRICT);
    public WorkLockRecord {
        if(uuid==null||!uuid.matches("[0-9a-f]{32}")||optime==null||!optime.matches("[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}")||!("开锁".equals(lockState)||"关锁".equals(lockState)))throw new IllegalArgumentException("开关锁记录标识、时间或状态无效");
        LocalDateTime.parse(optime,TIME);
        if(lockNum==null||!lockNum.matches("[A-Za-z0-9]{1,64}")||phoneNum==null||!phoneNum.matches("1[0-9]{10}"))throw new IllegalArgumentException("须显式配置锁编号和手机号");
        if(sealOffNum==null)sealOffNum="";
        if(sealOffNum.length()>128||sealOffNum.chars().anyMatch(Character::isISOControl))throw new IllegalArgumentException("命令号格式无效");
    }
    /** 只转换可信开关锁事实；使用发生时间而非重试时间，按北京时间输出到分钟。 */
    public static WorkLockRecord fromEvent(JsonNode event,JsonNode constants){
        validateConstants(constants);
        if(!"jagonzn.lock.log".equals(event.path("eventType").asText()))throw new IllegalArgumentException("不是锁具日志");
        String state=switch(event.path("payload").path("logType").asText()){
            case "UNLOCK_REPORTED"->"开锁";case "LOCK_REPORTED"->"关锁";default->throw new IllegalArgumentException("不是明确开关锁记录");
        };
        String id=UUID.fromString(event.path("eventId").asText()).toString().replace("-","");
        String time=TIME.format(Instant.parse(event.path("occurredAt").asText()).atZone(ZoneId.of("Asia/Shanghai")));
        return new WorkLockRecord(id,time,state,constants.path("lockNum").asText(),constants.path("phoneNum").asText(),constants.path("sealOffNum").asText(""));
    }
    /** 业务常量只能提供显式锁编号、手机号及命令号，不能覆盖主键、时间或状态。 */
    public static void validateConstants(JsonNode constants){
        if(constants==null||!constants.isObject()||!Set.of("lockNum","phoneNum","sealOffNum").containsAll(constants.propertyNames())
                ||!constants.path("lockNum").isString()||!constants.path("phoneNum").isString()
                ||constants.has("sealOffNum")&&!constants.path("sealOffNum").isString())throw new IllegalArgumentException("开关锁接口业务常量无效");
        new WorkLockRecord("0".repeat(32),"2026-01-01 00:00","开锁",constants.path("lockNum").asText(),constants.path("phoneNum").asText(),constants.path("sealOffNum").asText(""));
    }
    /** 固定输出六个协议字段，未知命令号留空，不携带内部租户或凭据信息。 */
    public String json(ObjectMapper mapper){return mapper.createObjectNode().put("uuid",uuid).put("optime",optime).put("lockState",lockState).put("lockNum",lockNum).put("phoneNum",phoneNum).put("sealOffNum",sealOffNum).toString();}
}
