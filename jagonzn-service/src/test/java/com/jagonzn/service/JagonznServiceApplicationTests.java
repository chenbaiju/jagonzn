package com.jagonzn.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.things.cloud.device.application.DeviceService;
import com.things.cloud.ingestion.infrastructure.protocol.tcp.DeviceAccessTcpRuntime;
import com.things.cloud.project.application.ProjectService;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;

/** 验证正式运行时从外部应用装配完整平台域，并在独立空库执行同源角色映射迁移。 */
@SpringBootTest
class JagonznServiceApplicationTests extends JagonznServiceIntegrationTest {

    @Autowired
    ApplicationContext context;

    @Autowired
    Flyway flyway;

    @Autowired
    Environment environment;

    @Autowired
    KafkaListenerEndpointRegistry kafkaListeners;

    /** 一次真实装配同时覆盖项目、设备域与平台不可变迁移集。 */
    @Test
    void contextLoads() {
        context.getBean(ProjectService.class);
        context.getBean(DeviceService.class);
        assertTrue(context.containsBean("controlledOutOfOrderMigrationStrategy"));
        assertTrue(flyway.info().applied().length >= 300);
        // 独立部署的全部生产消费组应使用 jagonzn 身份，包括实例广播组。
        assertTrue(kafkaListeners.getListenerContainers().size() >= 15);
        assertTrue(kafkaListeners.getListenerContainers().stream()
                .map(container -> container.getGroupId())
                .allMatch(groupId -> groupId != null && groupId.startsWith("jagonzn-")));
        assertTrue(context.getBean(DeviceAccessTcpRuntime.class).groupId()
                .startsWith("jagonzn-ingestion-tcp-downlink."));
        assertEquals("jagonzn", environment.getRequiredProperty("things-cloud.security.jwt.issuer"));
        assertEquals("jagonzn-app", environment.getRequiredProperty("things-cloud.security.app-jwt.issuer"));
        assertEquals("jagonzn-uplink-ingress-v1",
                environment.getRequiredProperty("things-cloud.ingress.handoff.client-id"));
        assertEquals("18883", environment.getRequiredProperty("things-cloud.access.tcp.port"));
        assertEquals("15684", environment.getRequiredProperty("things-cloud.access.coap.port"));
        assertEquals("false", environment.getRequiredProperty("things-cloud.access.http.enabled"));
        assertEquals("false", environment.getRequiredProperty("things-cloud.access.tcp.enabled"));
        assertEquals("false", environment.getRequiredProperty("things-cloud.access.coap.enabled"));
        assertEquals("http://localhost:18083",
                environment.getRequiredProperty("things-cloud.ingestion.emqx-api.base-url"));
    }

    /** 独立库的 owner 与运行角色必须分离，缺少项目上下文及错误项目均不可读取。 */
    @Test
    void isolatedDatabaseAppliesProjectRlsToApplicationRole() throws Exception {
        String url = environment.getRequiredProperty("spring.flyway.url");
        UUID firstProject = UUID.randomUUID();
        UUID secondProject = UUID.randomUUID();
        try (Connection owner = DriverManager.getConnection(url,
                environment.getRequiredProperty("spring.flyway.user"),
                environment.getRequiredProperty("spring.flyway.password"));
             Statement sql = owner.createStatement()) {
            assertEquals("jagonzn", scalar(sql, "SELECT current_user"));
            assertEquals("jagonzn", scalar(sql, "SELECT current_database()"));
            assertEquals("0", scalar(sql,
                    "SELECT count(*)::text FROM pg_roles WHERE rolname LIKE 'thingscloud%'"));
            sql.execute("CREATE TABLE reuse_rls_probe (project_id uuid NOT NULL, note text NOT NULL)");
            sql.execute("SELECT enable_project_rls('reuse_rls_probe')");
            sql.execute("INSERT INTO reuse_rls_probe VALUES ('" + firstProject + "', 'first'), ('"
                    + secondProject + "', 'second')");
            assertEquals(2, count(sql));
            try (ResultSet result = sql.executeQuery("SELECT relrowsecurity FROM pg_class "
                    + "WHERE oid = 'dev_device'::regclass")) {
                assertTrue(result.next() && result.getBoolean(1));
            }
        }

        try (Connection app = DriverManager.getConnection(url,
                environment.getRequiredProperty("spring.datasource.username"),
                environment.getRequiredProperty("spring.datasource.password"));
             Statement sql = app.createStatement()) {
            assertEquals("jagonzn_app", scalar(sql, "SELECT current_user"));
            assertEquals(0, count(sql));
            sql.execute("SELECT set_config('app.project_id', '" + firstProject + "', false)");
            assertEquals(1, count(sql));
            sql.execute("SELECT set_config('app.project_id', '" + secondProject + "', false)");
            assertEquals(1, count(sql));
        }
    }

    private static int count(Statement sql) throws Exception {
        try (ResultSet result = sql.executeQuery("SELECT count(*) FROM reuse_rls_probe")) {
            result.next();
            return result.getInt(1);
        }
    }

    private static String scalar(Statement sql, String query) throws Exception {
        try (ResultSet result = sql.executeQuery(query)) {
            result.next();
            return result.getString(1);
        }
    }

}
