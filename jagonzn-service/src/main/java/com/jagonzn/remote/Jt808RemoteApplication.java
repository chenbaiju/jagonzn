package com.jagonzn.remote;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Import;
import java.util.Map;

/** 远程适配独立启动边界；不扫描本机平台或service消费者，连接线上只经受支持网络接口。 */
@SpringBootConfiguration
@EnableAutoConfiguration(excludeName={"org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration","org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration","org.springframework.boot.data.redis.autoconfigure.DataRedisAutoConfiguration","org.springframework.boot.kafka.autoconfigure.KafkaAutoConfiguration","org.springframework.boot.security.autoconfigure.SecurityAutoConfiguration","org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration"})
@Import(Jt808RemoteConfiguration.class)
public class Jt808RemoteApplication {
    /** 使用独立配置名启动，旧应用配置或环境变量覆盖成内核模式时明确失败。 */
    public static void main(String[] args){var app=new SpringApplication(Jt808RemoteApplication.class);app.setDefaultProperties(Map.of("spring.config.name","application-remote-jt808"));app.addInitializers(context->Jt808RemoteConfiguration.validateMode(context.getEnvironment()));app.run(args);}
}
