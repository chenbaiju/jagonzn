package com.jagonzn.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

/** 确认 jagonzn 迁移仅重命名数据库角色，所有平台 SQL 与非事务配置同源且完整。 */
class JagonznMigrationNamespaceTests {

    private static final Map<String, String> ROLES = Map.of(
            "thingslink_app", "jagonzn_app",
            "thingslink_quota_operator", "jagonzn_quota_operator",
            "thingslink_commercial_admin", "jagonzn_commercial_admin",
            "thingslink_topology_guard", "jagonzn_topology_guard",
            "thingslink_constraint", "jagonzn_constraint",
            "thingslink_automation_cleanup", "jagonzn_automation_cleanup");

    @Test
    void generatedMigrationsKeepPlatformSqlAndFlywayMetadata() throws IOException {
        var original = resources("classpath*:db/migration/**/*");
        var namespaced = resources("classpath*:jagonzn/db/migration/**/*");
        assertFalse(original.isEmpty(), "平台迁移清单不能为空");
        assertEquals(original.keySet(), namespaced.keySet());
        for (var entry : original.entrySet()) {
            String expected = entry.getValue();
            if (entry.getKey().endsWith(".sql")) {
                for (var role : ROLES.entrySet()) {
                    expected = expected.replace(role.getKey(), role.getValue());
                }
            }
            assertEquals(expected, namespaced.get(entry.getKey()), entry.getKey());
        }
    }

    /** 新平台模块加入后，显式迁移位置必须同步；发行方模块仅因测试依赖出现。 */
    @Test
    void configuredLocationsCoverEveryRuntimeMigrationDomain() throws IOException {
        var resolver = new PathMatchingResourcePatternResolver();
        var expected = new java.util.TreeSet<String>();
        for (Resource resource : resolver.getResources("classpath*:db/migration/**/*.sql")) {
            String url = resource.getURL().toString();
            String domain = url.substring(url.indexOf("/db/migration/") + "/db/migration/".length()).split("/")[0];
            if (!domain.equals("issuer")) expected.add("classpath:jagonzn/db/migration/" + domain);
        }
        var properties = new java.util.Properties();
        try (var reader = java.nio.file.Files.newBufferedReader(
                java.nio.file.Path.of("src/main/resources/application.properties"), StandardCharsets.UTF_8)) {
            properties.load(reader);
        }
        var actual = new java.util.TreeSet<>(java.util.Arrays.asList(
                properties.getProperty("spring.flyway.locations").split(",")));
        assertEquals(expected, actual, "运行时迁移域变化后须更新 jagonzn 的显式位置，不可漏接新能力");
    }

    private static Map<String, String> resources(String location) throws IOException {
        var resolver = new PathMatchingResourcePatternResolver();
        Map<String, String> result = new HashMap<>();
        for (Resource resource : resolver.getResources(location)) {
            if (!resource.getFilename().endsWith(".sql") && !resource.getFilename().endsWith(".sql.conf")) {
                continue;
            }
            try (var stream = resource.getInputStream()) {
                String previous = result.put(resource.getFilename(),
                        new String(stream.readAllBytes(), StandardCharsets.UTF_8).replace("\r\n", "\n"));
                if (previous != null) {
                    throw new IllegalStateException("重复 Flyway 资源：" + resource.getFilename());
                }
            }
        }
        return result;
    }
}
