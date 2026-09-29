package com.jagonzn.service;

import com.jagonzn.service.enrollment.EnrollmentRequestCommand;
import com.jagonzn.service.enrollment.LocalTestIssuerTrustConfiguration;
import com.things.cloud.entitlement.application.ApprovedSelfHostedRevision;
import com.things.cloud.project.application.SelfHostedGrantImportService;
import com.things.cloud.project.application.SelfHostedGrantRepository;
import com.things.cloud.project.application.SelfHostedQuotaSnapshotService;
import com.things.cloud.project.application.SelfHostedDeviceUsageReader;
import com.things.cloud.project.application.SelfHostedMessageUsageReader;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** 只由本地交接脚本显式调用；消费发行方测试进程产出的同一封套原字节。 */
@SpringBootTest(properties = "jagonzn.self-hosted.signed-grant.enabled=true")
@Import(LocalTestIssuerTrustConfiguration.class)
class JagonznSelfHostedLocalHandoffRunner extends JagonznServiceIntegrationTest {
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Autowired SelfHostedGrantRepository repository;
    @Autowired SelfHostedDeviceUsageReader deviceUsage;
    @Autowired SelfHostedMessageUsageReader messageUsage;
    @Autowired SelfHostedGrantImportService importer;
    @Autowired SelfHostedGrantImportService.Installation installation;
    @Autowired SelfHostedGrantImportService.TrustedIssuer trusted;

    @DynamicPropertySource
    static void signedGrantIdentity(DynamicPropertyRegistry registry) {
        registry.add("jagonzn.self-hosted.signed-grant.trust-source", () -> "local-test");
        registry.add("jagonzn.self-hosted.identity-directory", () ->
                Path.of(System.getProperty("shc.lab.handoff.dir"), "identity").toString());
    }

    @Test
    void importOriginalIssuerBytesIntoIndependentJagonznDatabase() throws Exception {
        Path directory = Path.of(System.getProperty("shc.lab.handoff.dir")).toAbsolutePath();
        var identity = EnrollmentRequestCommand.inspect(directory.resolve("identity"));
        byte[] envelope = Files.readAllBytes(directory.resolve("grant.tcshgrant"));

        jdbc.update("INSERT INTO sys_tenant(id,name) VALUES (?,?)", identity.tenantId(), "本地交接实验租户");
        var subject = new SelfHostedGrantImportService.Installation(identity.deploymentId(),
                identity.tenantId(), identity.publicKeySha256());
        assertThat(installation.deploymentId()).isEqualTo(subject.deploymentId());
        assertThat(installation.tenantId()).isEqualTo(subject.tenantId());
        assertThat(installation.deploymentPublicKeySha256())
                .containsExactly(subject.deploymentPublicKeySha256());
        assertThat(trusted.issuerId()).isEqualTo("thingscloud-local-test");
        assertThat(importer.importGrant(envelope, subject).outcome())
                .isEqualTo(SelfHostedGrantImportService.Outcome.IMPORTED);
        assertThat(importer.importGrant(envelope, subject).outcome())
                .isEqualTo(SelfHostedGrantImportService.Outcome.ALREADY_IMPORTED);

        var restarted = new SelfHostedGrantImportService(repository, transactions, trusted);
        var imported = restarted.readCurrent(subject).orElseThrow();
        assertThat(imported.tier()).isEqualTo("STANDARD");
        assertThat(imported.quotas()).isEqualTo(ApprovedSelfHostedRevision.loadApproved()
                .tier("STANDARD").quotas());
        assertThat(jdbc.queryForObject("SELECT signed_envelope FROM sys_shc_local_grant_state",
                byte[].class)).isEqualTo(envelope);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM sys_shc_local_grant_import_audit",
                Integer.class)).isEqualTo(1);

        // 完整平台 JAR 在 jagonzn 独立数据库中使用同一个通用快照与事实围栏。
        var snapshot = new SelfHostedQuotaSnapshotService(restarted, deviceUsage, messageUsage);
        assertThat(snapshot.read(subject).devices().limit()).isEqualTo(100L);
        assertThat(snapshot.read(subject).uplinkMessages().limit()).isEqualTo(105_000L);
        assertThat(snapshot.read(subject).downlinkMessages().limit()).isEqualTo(45_000L);
        var project = java.util.UUID.randomUUID();
        try (var connection = DriverManager.getConnection(POSTGRES.getJdbcUrl(),
                POSTGRES.getUsername(), POSTGRES.getPassword());
             var insertProject = connection.prepareStatement(
                     "INSERT INTO sys_project(id,tenant_id,name,project_key) VALUES (?,?,?,?)")) {
            insertProject.setObject(1, project);
            insertProject.setObject(2, identity.tenantId());
            insertProject.setString(3, "现场额度实验项目");
            insertProject.setString(4, "shc_lab_" + project.toString().replace("-", ""));
            insertProject.executeUpdate();
            try (var seed = connection.prepareStatement("""
                    INSERT INTO dev_device(id,tenant_id,project_id,device_key,name)
                    SELECT gen_random_uuid(), ?, ?, 'seed_' || g, '已接受设备'
                      FROM generate_series(1,99) AS g
                    """)) {
                seed.setObject(1, identity.tenantId());
                seed.setObject(2, project);
                seed.executeUpdate();
            }
            assertThat(snapshot.read(subject).devices().used()).isEqualTo(99L);
            try (var admitted = connection.prepareStatement("""
                    INSERT INTO dev_device(id,tenant_id,project_id,device_key,name)
                    VALUES (gen_random_uuid(), ?, ?, 'accepted_100', '临界设备')
                    """)) {
                admitted.setObject(1, identity.tenantId());
                admitted.setObject(2, project);
                admitted.executeUpdate();
            }
            assertThat(snapshot.read(subject).devices().atLimit()).isTrue();
            try (var rejected = connection.prepareStatement("""
                    INSERT INTO dev_device(id,tenant_id,project_id,device_key,name)
                    VALUES (gen_random_uuid(), ?, ?, 'rejected_101', '超额设备')
                    """)) {
                rejected.setObject(1, identity.tenantId());
                rejected.setObject(2, project);
                org.assertj.core.api.Assertions.assertThatThrownBy(rejected::executeUpdate)
                        .hasMessageContaining("self-hosted device quota exceeded");
            }
            try (var uplink = connection.prepareStatement("""
                    INSERT INTO sys_inbox_message(message_id,project_id,received_at)
                    VALUES (gen_random_uuid(), ?, ?)
                    """)) {
                uplink.setObject(1, project);
                uplink.setObject(2, java.sql.Timestamp.from(Instant.now()));
                uplink.executeUpdate();
            }
        }
        assertThat(snapshot.read(subject).uplinkMessages().used()).isEqualTo(1L);
    }
}
