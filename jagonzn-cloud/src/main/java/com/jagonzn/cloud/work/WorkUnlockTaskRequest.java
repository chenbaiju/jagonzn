package com.jagonzn.cloud.work;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.Set;
import tools.jackson.databind.JsonNode;

/** 第三方推送的作业参数，只用于接收和日志留存，不授予权限或触发设备开锁。 */
public record WorkUnlockTaskRequest(String uuid,String planBeginTime,String planEndTime,String lockNum,String phoneNum,
        String title,String lineName,String lineKm,String sealOffBeginTime,String sealOffEndTime,String sealOffNum) {
    private static final Set<String> FIELDS=Set.of("uuid","planBeginTime","planEndTime","lockNum","phoneNum","title","lineName","lineKm","sealOffBeginTime","sealOffEndTime","sealOffNum");
    private static final Set<String> TITLES=Set.of("施工作业","普速天窗","高速天窗","邻营作业","点外作业","应急处置","配合作业");
    private static final DateTimeFormatter TIME=DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm",java.util.Locale.ROOT).withResolverStyle(ResolverStyle.STRICT);
    public WorkUnlockTaskRequest {
        if(uuid==null||!uuid.matches("[A-Za-z0-9_-]{1,64}")||lockNum==null||!lockNum.matches("[A-Za-z0-9]{1,64}")||phoneNum==null||!phoneNum.matches("1[0-9]{10}"))throw new IllegalArgumentException("作业标识、锁编号或手机号无效");
        if(!time(planBeginTime).isBefore(time(planEndTime)))throw new IllegalArgumentException("计划开始须早于结束时间");
        if(!TITLES.contains(title))throw new IllegalArgumentException("作业标题无效");
        display(lineName,256);display(lineKm,128);
        sealOffBeginTime=optional(sealOffBeginTime);sealOffEndTime=optional(sealOffEndTime);sealOffNum=optional(sealOffNum);
        if(!sealOffBeginTime.isEmpty())time(sealOffBeginTime);if(!sealOffEndTime.isEmpty())time(sealOffEndTime);
        if(!sealOffBeginTime.isEmpty()&&!sealOffEndTime.isEmpty()&&!time(sealOffBeginTime).isBefore(time(sealOffEndTime)))throw new IllegalArgumentException("封锁开始须早于结束时间");
        if(sealOffNum.length()>128||sealOffNum.chars().anyMatch(Character::isISOControl))throw new IllegalArgumentException("命令号无效");
    }
    /** 封闭接收合同字段；封锁时间与命令号在调令下达前可以缺省、null或空字符串。 */
    public static WorkUnlockTaskRequest parse(JsonNode value){
        if(value==null||!value.isObject()||!FIELDS.containsAll(value.propertyNames()))throw new IllegalArgumentException("作业JSON字段无效");
        return new WorkUnlockTaskRequest(text(value,"uuid",false),text(value,"planBeginTime",false),text(value,"planEndTime",false),text(value,"lockNum",false),text(value,"phoneNum",false),text(value,"title",false),text(value,"lineName",false),text(value,"lineKm",false),text(value,"sealOffBeginTime",true),text(value,"sealOffEndTime",true),text(value,"sealOffNum",true));
    }
    private static String text(JsonNode value,String key,boolean optional){var field=value.path(key);if(optional&&(field.isMissingNode()||field.isNull()))return "";if(!field.isString())throw new IllegalArgumentException("作业字段须为字符串");return field.asText();}
    private static LocalDateTime time(String value){if(value==null||!value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}"))throw new IllegalArgumentException("时间须为yyyy-MM-dd HH:mm");return LocalDateTime.parse(value,TIME);}
    private static void display(String value,int max){if(value==null||value.isBlank()||value.length()>max||value.chars().anyMatch(Character::isISOControl))throw new IllegalArgumentException("展示字段无效");}
    private static String optional(String value){return value==null?"":value;}
}
