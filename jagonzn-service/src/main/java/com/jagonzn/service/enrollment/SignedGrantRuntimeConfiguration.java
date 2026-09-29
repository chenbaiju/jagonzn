package com.jagonzn.service.enrollment;

import com.things.cloud.project.application.SelfHostedGrantImportService;
import com.things.cloud.project.application.SelfHostedGrantRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.transaction.PlatformTransactionManager;

import java.nio.file.Path;

/** 仅在显式启用的客户签名授权模式装配；缺可信公钥或现场身份即拒绝启动。 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "jagonzn.self-hosted.signed-grant.enabled", havingValue = "true")
public class SignedGrantRuntimeConfiguration {
    @Bean
    @ConditionalOnProperty(name = "jagonzn.self-hosted.signed-grant.trust-source",
            havingValue = "packaged", matchIfMissing = true)
    SelfHostedGrantImportService.TrustedIssuer packagedIssuerTrust() throws Exception {
        return PackagedIssuerTrust.load();
    }

    @Bean
    SelfHostedGrantImportService.Installation signedGrantInstallation(
            @Value("${jagonzn.self-hosted.identity-directory:}") String directory) throws Exception {
        if (directory.isBlank()) throw new IllegalStateException("未配置现场部署身份目录");
        var identity = EnrollmentRequestCommand.inspect(Path.of(directory));
        return new SelfHostedGrantImportService.Installation(
                identity.deploymentId(), identity.tenantId(), identity.publicKeySha256());
    }

    @Bean
    SelfHostedGrantImportService signedGrantImporter(
            SelfHostedGrantRepository repository, PlatformTransactionManager transactions,
            SelfHostedGrantImportService.TrustedIssuer trustedIssuer) throws Exception {
        return new SelfHostedGrantImportService(repository, transactions, trustedIssuer);
    }
}
