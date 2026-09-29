package com.jagonzn.service.enrollment;

import com.things.cloud.project.application.SelfHostedGrantImportService;
import com.things.cloud.project.application.SelfHostedGrantRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.transaction.PlatformTransactionManager;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPairGenerator;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** 不启动容器，验证普通发行信任锚与仅测试类路径信任锚的装配边界。 */
class SignedGrantRuntimeConfigurationTests {
    @TempDir Path temporary;

    private ApplicationContextRunner runner(Path identity) {
        return new ApplicationContextRunner()
                .withUserConfiguration(SignedGrantRuntimeConfiguration.class)
                .withBean(SelfHostedGrantRepository.class, () -> mock(SelfHostedGrantRepository.class))
                .withBean(PlatformTransactionManager.class, () -> mock(PlatformTransactionManager.class))
                .withPropertyValues("jagonzn.self-hosted.signed-grant.enabled=true",
                        "jagonzn.self-hosted.identity-directory=" + identity);
    }

    @Test
    void ordinarySourceRejectsMissingPackagedPublicKey() throws Exception {
        Path identity = temporary.resolve("identity");
        EnrollmentRequestCommand.prepare(identity, UUID.randomUUID());
        runner(identity).run(context -> {
            assertThat(context.getStartupFailure()).isNotNull()
                    .hasRootCauseMessage("固定发行物缺少受控发行方公钥");
        });
    }

    @Test
    void testSourceWithoutTestClasspathProviderAlsoFailsClosed() throws Exception {
        Path identity = temporary.resolve("identity");
        EnrollmentRequestCommand.prepare(identity, UUID.randomUUID());
        runner(identity).withPropertyValues("jagonzn.self-hosted.signed-grant.trust-source=local-test")
                .run(context -> {
                    assertThat(context.getStartupFailure()).isNotNull();
                });
    }

    @Test
    void testClasspathProviderWiresOriginalRuntimeImporterAndIdentity() throws Exception {
        UUID tenant = UUID.randomUUID();
        Path identity = temporary.resolve("identity");
        EnrollmentRequestCommand.prepare(identity, tenant);
        var signer = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        Files.write(temporary.resolve("issuer-public.der"), signer.getPublic().getEncoded());
        Files.writeString(temporary.resolve("key-id.txt"), "local-test", StandardCharsets.US_ASCII);
        String original = System.getProperty("shc.lab.handoff.dir");
        try {
            System.setProperty("shc.lab.handoff.dir", temporary.toString());
            runner(identity).withUserConfiguration(LocalTestIssuerTrustConfiguration.class)
                    .withPropertyValues("jagonzn.self-hosted.signed-grant.trust-source=local-test")
                    .run(context -> {
                        assertThat(context).hasNotFailed();
                        assertThat(context).hasSingleBean(SelfHostedGrantImportService.class);
                        assertThat(context).hasSingleBean(SelfHostedGrantImportService.TrustedIssuer.class);
                        var trusted = context.getBean(SelfHostedGrantImportService.TrustedIssuer.class);
                        assertThat(trusted.issuerId()).isEqualTo("thingscloud-local-test");
                        assertThat(trusted.keys()).containsKey("local-test");
                        var actual = context.getBean(SelfHostedGrantImportService.Installation.class);
                        var expected = EnrollmentRequestCommand.inspect(identity);
                        assertThat(actual.deploymentId()).isEqualTo(expected.deploymentId());
                        assertThat(actual.tenantId()).isEqualTo(tenant);
                        assertThat(actual.deploymentPublicKeySha256())
                                .isEqualTo(expected.publicKeySha256());
                    });
        } finally {
            if (original == null) System.clearProperty("shc.lab.handoff.dir");
            else System.setProperty("shc.lab.handoff.dir", original);
        }
    }
}
