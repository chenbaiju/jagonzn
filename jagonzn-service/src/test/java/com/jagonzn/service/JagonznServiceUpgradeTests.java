package com.jagonzn.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.things.cloud.FlywayCompatibilityConfiguration;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.PropertiesLoaderUtils;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

/** 在独占 PostgreSQL 实例验证 jagonzn 历史库升级，避免全局角色与空库夹具冲突。 */
@Testcontainers
class JagonznServiceUpgradeTests {

    @Container
    static final PostgreSQLContainer<?> DATABASE = new PostgreSQLContainer<>(
            DockerImageName.parse("timescale/timescaledb-ha:pg17.4-ts2.18.2")
                    .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("jagonzn")
            .withUsername("jagonzn")
            .withPassword("jagonzn");

    /** 历史版本及独立角色保持不变，升级只增加后续平台结构。 */
    @Test
    void existingDatabaseUpgradesWithoutLosingFacts() throws Exception {
        String[] locations = PropertiesLoaderUtils.loadProperties(new ClassPathResource("application.properties"))
                .getProperty("spring.flyway.locations").split(",");
        Flyway historic = flyway(locations, "20260913.1030");
        historic.migrate();
        int earlierCount = historic.info().applied().length;
        try (Connection existing = owner(); Statement sql = existing.createStatement()) {
            sql.execute("CREATE TABLE reuse_upgrade_marker (value text NOT NULL)");
            sql.execute("INSERT INTO reuse_upgrade_marker VALUES ('kept')");
        }

        Flyway latest = flyway(locations, null);
        try (var context = new AnnotationConfigApplicationContext(FlywayCompatibilityConfiguration.class)) {
            context.getBean(FlywayMigrationStrategy.class).migrate(latest);
        }
        latest.validate();
        assertTrue(latest.info().applied().length > earlierCount);
        assertTrue(latest.info().applied().length >= 300);
        try (Connection upgraded = owner(); Statement sql = upgraded.createStatement()) {
            assertEquals("kept", scalar(sql, "SELECT value FROM reuse_upgrade_marker"));
            assertEquals("0", scalar(sql,
                    "SELECT count(*)::text FROM pg_roles WHERE rolname LIKE 'thingscloud%'"));
        }
    }

    private static Flyway flyway(String[] locations, String target) {
        var configuration = Flyway.configure()
                .dataSource(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword())
                .locations(locations)
                .placeholders(Map.of("app_role_password", "jagonzn"));
        if (target != null) {
            configuration.target(target);
        }
        return configuration.load();
    }

    private static Connection owner() throws Exception {
        return DriverManager.getConnection(DATABASE.getJdbcUrl(), DATABASE.getUsername(), DATABASE.getPassword());
    }

    private static String scalar(Statement sql, String query) throws Exception {
        try (ResultSet result = sql.executeQuery(query)) {
            result.next();
            return result.getString(1);
        }
    }
}
