package com.jagonzn.cloud.delivery;

import java.net.URI;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** 管理员配置的JSON连接器版本；任务冻结此快照，后续改配置不改写原请求。 */
public record HttpDeliveryTarget(String id,int revision,UUID sourceDeploymentId,UUID tenantId,UUID projectId,
        URI url,String method,Set<String> eventTypes,Map<String,String> headers,Map<String,String> secretHeaderEnvironment,
        Map<String,String> fieldMappings,JsonNode constants,Set<Integer> successStatuses,String successPointer,
        JsonNode successValue,boolean idempotencySupported,int maxAttempts,int timeoutSeconds,boolean loopbackTest) {
    public HttpDeliveryTarget {
        if(id==null||!id.matches("[A-Za-z0-9_-]{1,64}")||revision<1||sourceDeploymentId==null||tenantId==null||projectId==null
                ||url==null||url.getHost()==null||url.getUserInfo()!=null||url.getFragment()!=null
                ||!("https".equals(url.getScheme())||loopbackTest&&"http".equals(url.getScheme())&&Set.of("127.0.0.1","localhost","[::1]").contains(url.getHost()))
                ||!("POST".equals(method)||"PUT".equals(method))||eventTypes==null||eventTypes.isEmpty()
                ||maxAttempts<1||maxAttempts>10||timeoutSeconds<1||timeoutSeconds>30||successStatuses==null||successStatuses.isEmpty()
                ||successStatuses.stream().anyMatch(s->s<200||s>299))throw new IllegalArgumentException("HTTP连接器配置无效");
        headers=Map.copyOf(headers);secretHeaderEnvironment=Map.copyOf(secretHeaderEnvironment);fieldMappings=Map.copyOf(fieldMappings);eventTypes=Set.copyOf(eventTypes);successStatuses=Set.copyOf(successStatuses);
        if(!successPointer.isEmpty()&&(!successPointer.startsWith("/")||successValue==null))throw new IllegalArgumentException("成功判断须为JSON Pointer及确定值");
        var names=new java.util.HashSet<String>();
        for(String name:headers.keySet()){
            validateHeader(name,headers.get(name));
            if(name.toLowerCase(java.util.Locale.ROOT).matches(".*(authorization|key|token|secret|cookie).*"))throw new IllegalArgumentException("认证头须使用环境变量引用");
            if(!names.add(name.toLowerCase(java.util.Locale.ROOT)))throw new IllegalArgumentException("HTTP头重复");
        }
        for(String name:secretHeaderEnvironment.keySet()){
            validateHeader(name,secretHeaderEnvironment.get(name));
            if(!names.add(name.toLowerCase(java.util.Locale.ROOT)))throw new IllegalArgumentException("HTTP头重复");
            if(headers.containsKey(name)||!secretHeaderEnvironment.get(name).matches("[A-Z][A-Z0-9_]{0,127}"))throw new IllegalArgumentException("密钥头只允许环境变量引用");
        }
        if(constants!=null&&!constants.isObject())throw new IllegalArgumentException("常量须为JSON对象");
        fieldMappings.forEach((key,path)->{if(!key.matches("[A-Za-z][A-Za-z0-9_]{0,63}")||!path.startsWith("/"))throw new IllegalArgumentException("字段映射无效");});
        if(constants!=null&&fieldMappings.keySet().stream().anyMatch(constants::has))throw new IllegalArgumentException("常量不能覆盖字段映射");
    }
    private static void validateHeader(String name,String value){
        if(!name.matches("[A-Za-z0-9-]{1,64}")||Set.of("host","content-length","connection","content-type","idempotency-key","x-jagonzn-event-id").contains(name.toLowerCase(java.util.Locale.ROOT))
                ||value==null||value.length()>4096||value.contains("\r")||value.contains("\n"))throw new IllegalArgumentException("HTTP头配置无效");
    }
    /** 仅从受信Inbox事件取值，缺字段拒绝生成请求，不发送半份数据。 */
    public String body(JsonNode event,ObjectMapper json){
        var result=json.createObjectNode();
        if(fieldMappings.isEmpty())event.properties().forEach(e->result.set(e.getKey(),e.getValue()));
        fieldMappings.forEach((key,path)->{JsonNode value=event.at(path);if(value.isMissingNode())throw new IllegalArgumentException("日志缺少映射字段");result.set(key,value);});
        if(constants!=null)constants.properties().forEach(e->result.set(e.getKey(),e.getValue()));return result.toString();
    }
    /** HTTP成功码还须满足可选业务JSON条件；202只有显式配置才算约定的接收成功。 */
    public boolean success(int status,String response,ObjectMapper json){
        if(!successStatuses.contains(status))return false;
        if(successPointer.isEmpty())return true;
        try{return successValue.equals(json.readTree(response).at(successPointer));}catch(RuntimeException invalid){return false;}
    }
}
