package com.jagonzn.cloud.delivery;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.util.Locale;

/** 后端打印实际收发JSON及关联标识；密钥、卡号和人员凭据递归脱敏，正文有界。 */
@Component
public class HttpDeliveryAudit {
    private static final Logger LOG=LoggerFactory.getLogger(HttpDeliveryAudit.class);
    private final ObjectMapper json;
    public HttpDeliveryAudit(ObjectMapper json){this.json=json;}
    /** 打印已提交的受理事实或本次真实HTTP尝试，不把发送意图称为发送成功。 */
    public void record(String phase,String id,String body){
        LOG.info("第三方日志交付 phase={} id={} json={}",phase,id,safe(body));
    }
    /** 无效JSON也不原样打印，避免错误页或自由文本夹带凭据。 */
    public String safe(String body){
        if(body==null||body.isBlank())return "{}";
        try{
            JsonNode node=json.readTree(body);if(node==null)return "null";
            JsonNode clean=redact(node);String text=clean.toString();
            return text.length()>8192?text.substring(0,8192)+"[正文已截断]":text;
        }catch(RuntimeException invalid){return "[非JSON响应已省略]";}
    }
    private JsonNode redact(JsonNode value){
        if(value.isObject()){
            var result=json.createObjectNode();
            value.properties().forEach(entry->{String key=entry.getKey().toLowerCase(Locale.ROOT).replace("_","").replace("-","");
                if(key.matches(".*(password|passwd|secret|token|authorization|signature|credential|card|iccid|face|phone|pwd).*"))result.put(entry.getKey(),"[已脱敏]");
                else result.set(entry.getKey(),redact(entry.getValue()));});return result;
        }
        if(value.isArray()){var result=json.createArrayNode();value.forEach(item->result.add(redact(item)));return result;}
        return value;
    }
}
