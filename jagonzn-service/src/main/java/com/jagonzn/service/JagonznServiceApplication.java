package com.jagonzn.service;

import com.jagonzn.service.enrollment.EnrollmentRequestCommand;
import com.jagonzn.service.enrollment.SignedGrantImportCommand;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.tomcat.servlet.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.context.annotation.Bean;

/** jagonzn 独立设备接入服务的启动入口；ThingsCloud 内核由正式运行时 JAR 自动装配。 */
@SpringBootApplication
public class JagonznServiceApplication {

    /**
     * 当前 Windows/Temurin 环境的默认 NIO selector 初始化失败，故本服务改用 Tomcat NIO2。
     * 此设置只影响 jagonzn-service，不更改 ThingsCloud 的容器配置。
     */
    @Bean
    WebServerFactoryCustomizer<TomcatServletWebServerFactory> tomcatProtocol() {
        return factory -> factory.setProtocol("org.apache.coyote.http11.Http11Nio2Protocol");
    }

    /** 启动独立服务；协议与设备业务能力仍须按正式合同逐项验收。 */
    public static void main(String[] args) throws Exception {
        if (args.length > 0 && "--prepare-enrollment".equals(args[0])) {
            EnrollmentRequestCommand.run(args);
            return;
        }
        if (args.length > 0 && "--import-grant".equals(args[0])) {
            SignedGrantImportCommand.run(args);
            return;
        }
        SpringApplication.run(JagonznServiceApplication.class, args);
    }

}
