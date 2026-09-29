package com.jagonzn.service;

import com.jagonzn.service.enrollment.EnrollmentRequestCommand;
import com.things.cloud.entitlement.GrantV1;
import com.things.cloud.entitlement.application.ApprovedSelfHostedRevision;
import com.things.cloud.project.application.SelfHostedGrantImportService;
import com.things.cloud.project.application.SelfHostedGrantRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 测试源码注入临时公钥，核对 jagonzn 身份与平台持久导入内核的真实独立库交接。 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers
class JagonznSelfHostedLocalGrantImportTests {
    private static final String ISSUER = "tc-local-test";
    private static final String KEY_ID = "jagonzn-lab-key";

    // 已导入授权禁止第二租户，故本用例必须拥有独立库，不得污染其它 HTTP 回归的共享容器。
    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("timescale/timescaledb-ha:pg17.4-ts2.18.2")
                    .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("jagonzn_shc_import")
            .withUsername("jagonzn")
            .withPassword("jagonzn");
    @Container
    private static final GenericContainer<?> REDIS =
            new GenericContainer<>(DockerImageName.parse("redis:7.4-alpine")).withExposedPorts(6379);

    @DynamicPropertySource
    static void runtimeResources(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", () -> "jagonzn_app");
        registry.add("spring.datasource.password", () -> "jagonzn");
        registry.add("spring.flyway.url", POSTGRES::getJdbcUrl);
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
        registry.add("spring.flyway.placeholders.app_role_password", () -> "jagonzn");
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
    }

    @TempDir Path temporary;
    @Autowired JdbcTemplate jdbc;
    @Autowired ApplicationContext context;
    @Autowired PlatformTransactionManager transactions;
    @Autowired SelfHostedGrantRepository repository;

    @Test
    void existingIdentityImportsSignedPlanAndSurvivesFreshServiceInstance() throws Exception {
        assertThat(context.getBeansOfType(SelfHostedGrantImportService.class)).isEmpty();
        UUID tenant = UUID.randomUUID();
        Path directory = temporary.resolve("deployment");
        EnrollmentRequestCommand.prepare(directory, tenant);
        var identity = EnrollmentRequestCommand.inspect(directory);
        jdbc.update("INSERT INTO sys_tenant(id,name) VALUES (?,?)", tenant, "本地授权实验租户");

        KeyPair signer = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        var trusted = new SelfHostedGrantImportService.TrustedIssuer(
                ISSUER, Map.of(KEY_ID, signer.getPublic()));
        var subject = new SelfHostedGrantImportService.Installation(
                identity.deploymentId(), identity.tenantId(), identity.publicKeySha256());
        var first = new SelfHostedGrantImportService(repository, transactions, trusted);
        Instant start = Instant.now().minusSeconds(5);
        Instant end = start.atOffset(ZoneOffset.UTC).plusYears(1).toInstant();
        byte[] firstEnvelope = sign(subject, signer, "STANDARD", 1, start, end);

        assertThat(first.importGrant(firstEnvelope, subject).outcome())
                .isEqualTo(SelfHostedGrantImportService.Outcome.IMPORTED);
        assertThat(first.importGrant(firstEnvelope, subject).outcome())
                .isEqualTo(SelfHostedGrantImportService.Outcome.ALREADY_IMPORTED);
        var restarted = new SelfHostedGrantImportService(repository, transactions, trusted);
        var active = restarted.readCurrent(subject).orElseThrow();
        assertThat(active.tier()).isEqualTo("STANDARD");
        assertThat(active.quotas()).isEqualTo(ApprovedSelfHostedRevision.loadApproved()
                .tier("STANDARD").quotas());
        assertThat(active.sequence()).isEqualTo(1);

        byte[] successor = sign(subject, signer, "STANDARD", 2, start, end);
        assertThat(restarted.importGrant(successor, subject).sequence()).isEqualTo(2);
        assertThat(first.readCurrent(subject).orElseThrow().sequence()).isEqualTo(2);
        assertThatThrownBy(() -> first.importGrant(firstEnvelope, subject))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("序号");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM sys_shc_local_grant_import_audit", Integer.class))
                .isEqualTo(2);

        byte[] wrongDigest = identity.publicKeySha256();
        wrongDigest[0] ^= 1;
        var replacedIdentity = new SelfHostedGrantImportService.Installation(
                identity.deploymentId(), identity.tenantId(), wrongDigest);
        assertThatThrownBy(() -> restarted.readCurrent(replacedIdentity))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("损坏")
                .hasCauseInstanceOf(java.security.GeneralSecurityException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO sys_tenant(id,name) VALUES (?,?)",
                UUID.randomUUID(), "第二租户"))
                .hasMessageContaining("self-hosted installation permits one billing tenant");

        Path request = directory.resolve("enrollment-request.tcshreq");
        byte[] original = Files.readAllBytes(request);
        byte[] tampered = original.clone();
        tampered[tampered.length - 1] ^= 1;
        Files.write(request, tampered);
        assertThatThrownBy(() -> EnrollmentRequestCommand.inspect(directory))
                .hasMessageContaining("不一致");
        Files.write(request, original);
        assertThat(EnrollmentRequestCommand.inspect(directory).deploymentId())
                .isEqualTo(identity.deploymentId());
        assertThat(restarted.readCurrent(subject).orElseThrow().sequence()).isEqualTo(2);
    }

    private static byte[] sign(SelfHostedGrantImportService.Installation identity, KeyPair signer,
                               String tier, long sequence, Instant start, Instant end) throws Exception {
        var approved = ApprovedSelfHostedRevision.loadApproved();
        var plan = approved.tier(tier);
        return new GrantV1(ISSUER, UUID.randomUUID(), identity.deploymentId(), identity.tenantId(),
                tier, approved.revisionId(), approved.sha256(), sequence, start, start, end, KEY_ID,
                plan.quotas(), plan.capabilities()).sign(signer.getPrivate());
    }
}
