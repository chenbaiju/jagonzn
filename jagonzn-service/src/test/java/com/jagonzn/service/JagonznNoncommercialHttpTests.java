package com.jagonzn.service;

import com.things.cloud.iam.application.AuthRateLimiter;
import com.things.cloud.project.application.DeploymentEntitlementPolicy;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** 独立应用通过正式入口验证非商业项目扩展与有限技术容量。 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
@TestPropertySource(properties = {
        "things-cloud.deployment.entitlement-mode=NONCOMMERCIAL",
        "things-cloud.deployment.noncommercial-capacity.projects=2",
        "things-cloud.deployment.noncommercial-capacity.devices=2",
        "things-cloud.deployment.noncommercial-capacity.end-users=2",
        "things-cloud.deployment.noncommercial-capacity.dashboards=2",
        "things-cloud.deployment.noncommercial-capacity.external-seats=2",
        "things-cloud.deployment.noncommercial-capacity.history-days=30",
        "things-cloud.deployment.noncommercial-capacity.daily.uplink-message=100",
        "things-cloud.deployment.noncommercial-capacity.daily.downlink-message=100",
        "things-cloud.deployment.noncommercial-capacity.daily.uplink-bytes=100000",
        "things-cloud.deployment.noncommercial-capacity.daily.time-series-point=100",
        "things-cloud.deployment.noncommercial-capacity.daily.rest-api-call=100",
        "things-cloud.deployment.noncommercial-capacity.daily.notification-delivery=100",
        "things-cloud.deployment.noncommercial-capacity.daily.script-execution=100",
        "things-cloud.deployment.noncommercial-capacity.daily.automation-execution=100",
        "things-cloud.deployment.noncommercial-capacity.daily.script-cpu-millis=100000"
})
class JagonznNoncommercialHttpTests {
    // NONCOMMERCIAL 的部署自动化额度与默认商业库不同，不能复用别的上下文已迁移的库。
    @Container
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("timescale/timescaledb-ha:pg17.4-ts2.18.2")
                    .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("jagonzn_noncommercial")
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
    private static final ObjectMapper JSON = new ObjectMapper();
    @Autowired private MockMvc http;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private AuthRateLimiter rateLimiter;
    @Autowired private DeploymentEntitlementPolicy entitlementPolicy;
    @Autowired private Environment environment;

    @Test
    void freePlanDoesNotBlockSecondProjectButTechnicalLimitBlocksThird() throws Exception {
        assertEquals("NONCOMMERCIAL", environment.getProperty("things-cloud.deployment.entitlement-mode"));
        assertTrue(entitlementPolicy.nonCommercial());
        String email = "reuse-noncommercial-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
        String password = "correct-horse-battery-staple";
        rateLimiter.clear();
        assertEquals(204, http.perform(post("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)))
                .andReturn().getResponse().getStatus());
        jdbc.update("UPDATE sys_account SET email_verified_at = now() WHERE email = ?", email);
        var login = http.perform(post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)))
                .andReturn();
        assertEquals(200, login.getResponse().getStatus());
        String token = JSON.readTree(login.getResponse().getContentAsString()).get("accessToken").asString();
        assertEquals(200, create(token, "first").getStatus());
        assertEquals(200, create(token, "second").getStatus());
        var refused = create(token, "third");
        assertEquals(429, refused.getStatus());
        assertTrue(refused.getContentAsString().contains("50020"));
    }

    @Test
    void technicalDeviceEndUserDashboardAndExternalSeatLimitsApplyThroughRealJagonznHttpPath() throws Exception {
        String suffix = UUID.randomUUID().toString().substring(0, 8);
        String email = "reuse-devices-" + suffix + "@example.com";
        String password = "correct-horse-battery-staple";
        rateLimiter.clear();
        assertEquals(204, http.perform(post("/api/v1/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)))
                .andReturn().getResponse().getStatus());
        jdbc.update("UPDATE sys_account SET email_verified_at = now() WHERE email = ?", email);
        var login = http.perform(post("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)))
                .andReturn();
        assertEquals(200, login.getResponse().getStatus());
        String token = JSON.readTree(login.getResponse().getContentAsString()).get("accessToken").asString();
        String project = JSON.readTree(create(token, "devices-" + suffix).getContentAsString())
                .get("id").asString();
        var switched = http.perform(post("/api/v1/auth/switch-project")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .cookie(login.getResponse().getCookie("tc_refresh"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"projectId\":\"%s\"}".formatted(project))).andReturn();
        assertEquals(200, switched.getResponse().getStatus());
        token = JSON.readTree(switched.getResponse().getContentAsString()).get("accessToken").asString();
        var type = http.perform(post("/api/v1/projects/" + project + "/device-types")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(("{\"typeKey\":\"reuse_%s\",\"name\":\"Quota candidate\","
                        + "\"deviceKind\":\"DIRECT\",\"payloadProtocol\":\"STANDARD\","
                        + "\"networkType\":\"WIFI\"}").formatted(suffix))).andReturn();
        assertEquals(201, type.getResponse().getStatus(), type.getResponse().getContentAsString());
        String typeId = JSON.readTree(type.getResponse().getContentAsString()).get("id").asString();
        for (int index = 1; index <= 3; index++) {
            var device = http.perform(post("/api/v1/projects/" + project + "/devices")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(("{\"deviceTypeId\":\"%s\",\"deviceKey\":\"reuse-%s-%d\","
                            + "\"name\":\"Quota %d\"}").formatted(typeId, suffix, index, index)))
                    .andReturn().getResponse();
            if (index <= 2) {
                assertEquals(201, device.getStatus(), device.getContentAsString());
            } else {
                assertEquals(429, device.getStatus(), device.getContentAsString());
                assertTrue(device.getContentAsString().contains("30035"));
            }
        }
        for (int index = 1; index <= 3; index++) {
            var endUser = http.perform(post("/api/v1/projects/" + project + "/end-users")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"username\":\"reuse_%s_%d\",\"password\":\"%s\",\"displayName\":\"Quota %d\"}"
                            .formatted(suffix, index, password, index)))
                    .andReturn().getResponse();
            if (index <= 2) {
                assertEquals(200, endUser.getStatus(), endUser.getContentAsString());
            } else {
                assertEquals(409, endUser.getStatus(), endUser.getContentAsString());
                assertTrue(endUser.getContentAsString().contains("60058"));
            }
        }
        String dashboard = "{\"managementName\":\"Quota candidate\",\"content\":{"
                + "\"schemaVersion\":\"tc.dashboard/v1\","
                + "\"presentation\":{\"mode\":\"RESPONSIVE_GRID\"},"
                + "\"models\":[],\"variables\":[],"
                + "\"pages\":[{\"id\":\"overview\",\"title\":\"Quota\",\"components\":[]}]}}";
        for (int index = 1; index <= 3; index++) {
            var created = http.perform(post("/api/v1/projects/" + project + "/dashboards")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .header("Idempotency-Key", "reuse-dashboard-" + suffix + "-" + index)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(dashboard)).andReturn().getResponse();
            if (index <= 2) {
                assertEquals(201, created.getStatus(), created.getContentAsString());
            } else {
                assertEquals(409, created.getStatus(), created.getContentAsString());
                assertTrue(created.getContentAsString().contains("60059"));
            }
        }
        // 外部协作者各自注册为其他租户，第三位必须由本部署技术席位而非 FREE 套餐值拒绝。
        for (int index = 1; index <= 3; index++) {
            String externalEmail = "reuse-external-" + suffix + "-" + index + "@example.com";
            rateLimiter.clear();
            var registration = http.perform(post("/api/v1/auth/register")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\":\"%s\",\"password\":\"%s\"}"
                            .formatted(externalEmail, password))).andReturn().getResponse();
            assertEquals(204, registration.getStatus(), registration.getContentAsString());
            var invited = http.perform(post("/api/v1/projects/" + project + "/members")
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"email\":\"%s\",\"role\":\"VIEWER\"}"
                            .formatted(externalEmail))).andReturn().getResponse();
            if (index <= 2) {
                assertEquals(200, invited.getStatus(), invited.getContentAsString());
            } else {
                assertEquals(409, invited.getStatus(), invited.getContentAsString());
                assertTrue(invited.getContentAsString().contains("50049"));
            }
        }
    }

    private org.springframework.mock.web.MockHttpServletResponse create(String token, String name) throws Exception {
        return http.perform(post("/api/v1/projects")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"%s\",\"region\":\"sh-1\"}".formatted(name)))
                .andReturn().getResponse();
    }
}
