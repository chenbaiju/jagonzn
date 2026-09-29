package com.jagonzn.service;

import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import java.util.Map;

/**
 * 独立验证部署的测试资源：新建 jagonzn 数据库，避免读取或写入原 ThingsCloud 库。
 * 容器仅在测试 JVM 中复用，迁移 owner 与应用 RLS 角色保持分离。
 */
@ActiveProfiles("test")
abstract class JagonznServiceIntegrationTest {

    protected static final PostgreSQLContainer<?> POSTGRES = createDatabase();

    private static PostgreSQLContainer<?> createDatabase() {
        var database = new PostgreSQLContainer<>(
                DockerImageName.parse("timescale/timescaledb-ha:pg17.4-ts2.18.2")
                        .asCompatibleSubstituteFor("postgres"))
                .withDatabaseName("jagonzn")
                .withUsername("jagonzn")
                .withPassword("jagonzn");
        if (Boolean.getBoolean("shc.lab.database.tmpfs")) {
            // 仅本机交接脚本显式启用；普通集成测试仍用原有 Docker 存储。
            database.withTmpFs(Map.of("/home/postgres/pgdata", "rw,size=1g,uid=1000,gid=1000"));
        }
        return database;
    }

    private static final GenericContainer<?> REDIS =
            new GenericContainer<>(DockerImageName.parse("redis:7.4-alpine")).withExposedPorts(6379);

    static {
        POSTGRES.start();
        REDIS.start();
    }

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
}
