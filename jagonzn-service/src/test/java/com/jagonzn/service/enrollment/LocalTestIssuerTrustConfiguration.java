package com.jagonzn.service.enrollment;

import com.things.cloud.project.application.SelfHostedGrantImportService;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.spec.X509EncodedKeySpec;
import java.util.Map;

/** 只随测试类路径编译；读取当轮临时公钥，普通客户 JAR 没有此信任提供者。 */
@TestConfiguration(proxyBeanMethods = false)
public class LocalTestIssuerTrustConfiguration {
    @Bean
    SelfHostedGrantImportService.TrustedIssuer localTestIssuerTrust() throws Exception {
        Path directory = Path.of(System.getProperty("shc.lab.handoff.dir")).toAbsolutePath();
        byte[] publicSpki = Files.readAllBytes(directory.resolve("issuer-public.der"));
        String keyId = Files.readString(directory.resolve("key-id.txt"), StandardCharsets.US_ASCII);
        var key = KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(publicSpki));
        return new SelfHostedGrantImportService.TrustedIssuer(
                "thingscloud-local-test", Map.of(keyId, key));
    }
}
