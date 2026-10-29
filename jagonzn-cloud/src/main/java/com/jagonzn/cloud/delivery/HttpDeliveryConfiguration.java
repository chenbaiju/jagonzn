package com.jagonzn.cloud.delivery;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.HashSet;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

/** 默认关闭；仅由受控外置配置提供目标，不提供任意URL写入接口。 */
@Component
public class HttpDeliveryConfiguration {
    private final List<HttpDeliveryTarget> targets;
    public HttpDeliveryConfiguration(ObjectMapper json,@Value("${jagonzn.cloud.http-delivery.enabled:false}") boolean enabled,
            @Value("${jagonzn.cloud.http-delivery.targets-file:}") String file,
            @Value("${jagonzn.cloud.http-delivery.loopback-test:false}") boolean loopback){
        if(!enabled){targets=List.of();return;}
        try{
            Path path=Path.of(file);
            if(!path.isAbsolute()||Files.isSymbolicLink(path)||!Files.isRegularFile(path)||Files.size(path)>262144)throw new IllegalArgumentException();
            // 配置可能含普通业务头，仍按私有文件保护；真实密钥只引用环境变量。
            if(!Files.getPosixFilePermissions(path).equals(java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"))
                    ||!Files.getOwner(path).getName().equals(System.getProperty("user.name")))throw new IllegalArgumentException();
            HttpDeliveryTarget[] parsed=json.readValue(Files.readAllBytes(path),HttpDeliveryTarget[].class);
            if(parsed.length>20)throw new IllegalArgumentException();
            var ids=new HashSet<String>();
            for(var target:parsed){if(!ids.add(target.id())||target.loopbackTest()&&!loopback)throw new IllegalArgumentException();}
            targets=List.of(parsed);
        }catch(Exception invalid){throw new IllegalStateException("第三方JSON投递配置无效，未启动发送器");}
    }
    /** 返回启动时冻结的目标版本；无目标时仍可持久接收日志。 */
    public List<HttpDeliveryTarget> targets(){return targets;}
}
