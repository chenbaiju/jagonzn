package com.jagonzn.service.extension.jt808;

import com.things.link.ingestion.application.access.DeviceAccessAuthBudget;
import com.things.link.ingestion.application.access.DeviceAccessDeviceAuthenticator;
import com.things.link.ingestion.application.access.DeviceAccessUplinkIngressService;
import com.things.link.telemetry.application.DeviceCommandAccessReplyPort;
import com.things.link.ingestion.application.access.DeviceAccessPushPort;
import java.net.InetSocketAddress;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.env.Environment;
import tools.jackson.databind.ObjectMapper;

/** 只有显式开启才读取私有配置和创建监听；缺失真实预绑定时拒绝启动，不使用测试身份补位。 */
@Configuration(proxyBeanMethods=false)
@ConditionalOnProperty(name="jagonzn.jt808.enabled",havingValue="true")
public class Jt808ExtensionConfiguration {
    @Bean(destroyMethod="close")
    Jt808PrivateConfiguration jt808PrivateConfiguration(Environment environment) {
        return new Jt808PrivateConfiguration(path(environment,"external-root"),path(environment,"crypto-file"),path(environment,"binding-file"));
    }
    @Bean(destroyMethod="close")
    Jt808StateStore jt808StateStore(Environment environment,ObjectMapper json) {
        var store=new Jt808StateStore(path(environment,"state-directory"),path(environment,"external-root"));
        try {
            String review=environment.getProperty("jagonzn.jt808.control-review-file","");
            if(!review.isBlank()) Jt808ControlReview.importReview(Path.of(review),path(environment,"external-root"),store,json,java.time.Instant.now());
            return store;
        } catch(RuntimeException failure) { store.close();throw failure; }
    }
    /** 日志单独开关和外盘目录，不给未配置的第三方目标制造失败请求。 */
    @Bean(destroyMethod="close")
    @ConditionalOnProperty(name="jagonzn.jt808.logs.enabled",havingValue="true")
    Jt808LogJournal jt808LogJournal(Environment environment,ObjectMapper json) {
        return new Jt808LogJournal(path(environment,"logs.directory"),path(environment,"external-root"),json);
    }
    @Bean Jt808ThingsLinkGateway jt808Gateway(DeviceAccessAuthBudget budget,DeviceAccessDeviceAuthenticator authenticator,
            DeviceAccessUplinkIngressService ingress,DeviceCommandAccessReplyPort replies) {
        return new Jt808ThingsLinkGateway(budget,authenticator,ingress,replies);
    }
    @Bean Jt808TcpServer jt808TcpServer(Jt808PrivateConfiguration config,Jt808StateStore store,Jt808ThingsLinkGateway gateway,
            ObjectMapper json,Environment environment,ObjectProvider<Jt808LogJournal> logs) {
        // 沿用原TCP下行消费者的安全准入及规则链；不偷偷建立另一套Kafka消费者绕过保护。
        if(!"device-access".equals(environment.getProperty("things-link.deployment.role","device-access"))
                || !environment.getProperty("things-link.access.tcp.enabled",Boolean.class,false))
            throw new IllegalStateException("JT808须装配device-access角色及现行TCP下行消费者，不能以仅监听代替命令链");
        return new Jt808TcpServer(config.binding(),config.cipher(),store,gateway,json,
                new InetSocketAddress(environment.getProperty("jagonzn.jt808.bind-address","127.0.0.1"),environment.getProperty("jagonzn.jt808.port",Integer.class,6808)),
                Duration.ofSeconds(environment.getProperty("jagonzn.jt808.idle-timeout-seconds",Integer.class,120)),
                Duration.ofSeconds(environment.getProperty("jagonzn.jt808.maintenance-interval-seconds",Integer.class,5)),Clock.systemUTC(),logs.getIfAvailable(),
                environment.getProperty("jagonzn.jt808.firmware-probe-enabled",Boolean.class,false),
                environment.getProperty("jagonzn.jt808.firmware-probe-id","initial"),
                environment.getProperty("jagonzn.jt808.door-contact-confirmation-enabled",Boolean.class,false));
    }
    @Bean @Primary Jt808PushRouter jt808PushRouter(Jt808TcpServer server,ObjectProvider<DeviceAccessPushPort> ports) {
        return new Jt808PushRouter(server,()->ports.orderedStream().toList());
    }
    @Bean Jt808DispatchGuard jt808DispatchGuard(Jt808PushRouter router) { return new Jt808DispatchGuard(router); }
    private static Path path(Environment environment,String key) { return Path.of(environment.getRequiredProperty("jagonzn.jt808."+key)).toAbsolutePath(); }
}
