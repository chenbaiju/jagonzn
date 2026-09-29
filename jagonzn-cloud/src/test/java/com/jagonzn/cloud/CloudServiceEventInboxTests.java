package com.jagonzn.cloud;

import com.jagonzn.cloud.integration.CloudServiceEventInboxStore;
import com.jagonzn.cloud.integration.CloudServiceEventInboxController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URI;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** 真实 PostgreSQL 与 MVC 验证私有事件的签名、范围、重放和持久去重。 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "jagonzn.cloud.service-events.enabled=true")
@AutoConfigureMockMvc
class CloudServiceEventInboxTests extends CloudDatabaseTests {
    private static final UUID SOURCE = UUID.fromString("00000000-0000-0000-0000-000000000111");
    private static final UUID TENANT = UUID.fromString("00000000-0000-0000-0000-000000000222");
    private static final UUID PROJECT = UUID.fromString("00000000-0000-0000-0000-000000000333");
    private static final UUID SECOND_PROJECT = UUID.fromString("00000000-0000-0000-0000-000000000334");
    private static final byte[] SECRET = "0123456789abcdefghijklmnopqrstuv".getBytes(StandardCharsets.US_ASCII);
    private static final byte[] PREVIOUS_SECRET = "abcdefghijklmnopqrstuvwxyzABCDEF".getBytes(StandardCharsets.US_ASCII);

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired CloudServiceEventInboxStore store;
    @LocalServerPort int port;

    @DynamicPropertySource
    static void identity(DynamicPropertyRegistry registry) {
        registry.add("jagonzn.cloud.service-events.source-deployment-id", SOURCE::toString);
        registry.add("jagonzn.cloud.service-events.tenant-id", TENANT::toString);
        registry.add("jagonzn.cloud.service-events.project-id", PROJECT::toString);
        registry.add("jagonzn.cloud.service-events.project-ids", () -> PROJECT + "," + SECOND_PROJECT);
        registry.add("jagonzn.cloud.service-events.key-id", () -> "local-v1");
        registry.add("jagonzn.cloud.service-events.secret-base64", () -> Base64.getEncoder().encodeToString(SECRET));
        registry.add("jagonzn.cloud.service-events.previous-key-id", () -> "local-v0");
        registry.add("jagonzn.cloud.service-events.previous-secret-base64",
                () -> Base64.getEncoder().encodeToString(PREVIOUS_SECRET));
    }

    @Test
    void acceptsOnceAndSurvivesDuplicateThenRejectsChangedEvent() throws Exception {
        UUID event = UUID.randomUUID();
        UUID delivery = UUID.randomUUID();
        byte[] body = body(delivery, event, TENANT, PROJECT, "first");
        request(delivery, UUID.randomUUID(), Instant.now().getEpochSecond(), body, "local-v1")
                .andExpect(status().isOk());
        request(delivery, UUID.randomUUID(), Instant.now().getEpochSecond(), body, "local-v1")
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM cloud_service_event_inbox WHERE event_id=?",
                Integer.class, event)).isEqualTo(1);
        request(UUID.randomUUID(), UUID.randomUUID(), Instant.now().getEpochSecond(),
                body(UUID.randomUUID(), event, TENANT, PROJECT, "changed"), "local-v1")
                .andExpect(status().isBadRequest());
        UUID changedDelivery = UUID.randomUUID();
        request(changedDelivery, UUID.randomUUID(), Instant.now().getEpochSecond(),
                body(changedDelivery, event, TENANT, PROJECT, "changed"), "local-v1")
                .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM cloud_service_event_inbox WHERE event_id=?",
                Integer.class, event)).isEqualTo(1);
    }

    @Test
    void rejectsReplayTamperWrongScopeAndStaleTime() throws Exception {
        UUID delivery = UUID.randomUUID();
        UUID nonce = UUID.randomUUID();
        byte[] body = body(delivery, UUID.randomUUID(), TENANT, PROJECT, "original");
        long now = Instant.now().getEpochSecond();
        request(delivery, nonce, now, body, "local-v1").andExpect(status().isOk());
        request(delivery, nonce, now, body, "local-v1").andExpect(status().isConflict());
        var signed = post("/api/v1/internal/service-events").contentType("application/json")
                .content(body(delivery, UUID.randomUUID(), TENANT, PROJECT, "tampered"))
                .header("X-ThingsCloud-Delivery-Id", delivery.toString())
                .header("X-ThingsCloud-Timestamp", Long.toString(now))
                .header("X-ThingsCloud-Nonce", UUID.randomUUID().toString())
                .header("X-ThingsCloud-Key-Id", "local-v1")
                .header("X-ThingsCloud-Source-Deployment-Id", SOURCE.toString())
                .header("X-ThingsCloud-Signature", signature(now, nonce, delivery, body));
        mvc.perform(signed).andExpect(status().isUnauthorized());
        UUID wrongDelivery = UUID.randomUUID();
        request(wrongDelivery, UUID.randomUUID(), now,
                body(wrongDelivery, UUID.randomUUID(), UUID.randomUUID(), PROJECT, "other"), "local-v1")
                .andExpect(status().isForbidden());
        UUID wrongSourceDelivery = UUID.randomUUID();
        UUID wrongSourceNonce = UUID.randomUUID();
        byte[] wrongSourceBody = body(wrongSourceDelivery, UUID.randomUUID(), TENANT, PROJECT, "source");
        mvc.perform(post("/api/v1/internal/service-events").contentType("application/json")
                .content(wrongSourceBody)
                .header("X-ThingsCloud-Delivery-Id", wrongSourceDelivery.toString())
                .header("X-ThingsCloud-Timestamp", Long.toString(now))
                .header("X-ThingsCloud-Nonce", wrongSourceNonce.toString())
                .header("X-ThingsCloud-Key-Id", "local-v1")
                .header("X-ThingsCloud-Source-Deployment-Id", UUID.randomUUID().toString())
                .header("X-ThingsCloud-Signature", signature(now, wrongSourceNonce,
                        wrongSourceDelivery, wrongSourceBody)))
                .andExpect(status().isForbidden());
        UUID staleDelivery = UUID.randomUUID();
        request(staleDelivery, UUID.randomUUID(), now - 301,
                body(staleDelivery, UUID.randomUUID(), TENANT, PROJECT, "old"), "local-v1")
                .andExpect(status().isUnauthorized());
        UUID unknownKeyDelivery = UUID.randomUUID();
        request(unknownKeyDelivery, UUID.randomUUID(), now,
                body(unknownKeyDelivery, UUID.randomUUID(), TENANT, PROJECT, "key"), "unknown")
                .andExpect(status().isUnauthorized());
        request(UUID.randomUUID(), UUID.randomUUID(), now,
                "{broken".getBytes(StandardCharsets.UTF_8), "local-v1")
                .andExpect(status().isBadRequest());
    }

    @Test
    void checksDatabaseCommentsAndBoundedInput() throws Exception {
        var comments = jdbc.query("""
                SELECT col_description((table_schema||'.'||table_name)::regclass::oid, ordinal_position)
                  FROM information_schema.columns
                 WHERE table_schema='public' AND table_name IN
                       ('cloud_service_event_inbox','cloud_service_event_nonce')
                """, (row, ignored) -> row.getString(1));
        assertThat(comments).hasSize(12).allMatch(CloudServiceEventInboxTests::hasChinese);
        assertThat(hasChinese(jdbc.queryForObject(
                "SELECT obj_description('cloud_service_event_inbox'::regclass)", String.class))).isTrue();
        assertThat(hasChinese(jdbc.queryForObject(
                "SELECT obj_description('cloud_service_event_nonce'::regclass)", String.class))).isTrue();
        assertThatThrownBy(() -> new CloudServiceEventInboxController(
                null, null, "", "", "", "", ""))
                .isInstanceOf(IllegalStateException.class);
        UUID delivery = UUID.randomUUID();
        request(delivery, UUID.randomUUID(), Instant.now().getEpochSecond(),
                new byte[262_145], "local-v1").andExpect(status().isPayloadTooLarge());
        assertThat(store.removeExpiredNonces()).isZero();
    }

    @Test
    void acceptsSecondProjectAndPreviousRotationKeyWithinOverlap() throws Exception {
        UUID delivery = UUID.randomUUID();
        UUID event = UUID.randomUUID();
        byte[] body = body(delivery, event, TENANT, SECOND_PROJECT, "rotation");
        request(delivery, UUID.randomUUID(), Instant.now().getEpochSecond(), body,
                "local-v0", PREVIOUS_SECRET).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT project_id FROM cloud_service_event_inbox WHERE event_id=?",
                UUID.class, event)).isEqualTo(SECOND_PROJECT);
        UUID wrongDelivery = UUID.randomUUID();
        request(wrongDelivery, UUID.randomUUID(), Instant.now().getEpochSecond(),
                body(wrongDelivery, UUID.randomUUID(), TENANT, SECOND_PROJECT, "wrong-key"),
                "local-v0", SECRET).andExpect(status().isUnauthorized());
    }

    private static boolean hasChinese(String value) {
        return value != null && value.codePoints().anyMatch(
                code -> Character.UnicodeScript.of(code) == Character.UnicodeScript.HAN);
    }

    @Test
    void realHttpRequestPersistsOnlySignedEvent() throws Exception {
        UUID delivery = UUID.randomUUID();
        UUID event = UUID.randomUUID();
        UUID nonce = UUID.randomUUID();
        long at = Instant.now().getEpochSecond();
        byte[] body = body(delivery, event, TENANT, PROJECT, "http");
        HttpURLConnection connection = (HttpURLConnection) URI.create(
                "http://127.0.0.1:" + port + "/api/v1/internal/service-events")
                .toURL().openConnection(Proxy.NO_PROXY);
        connection.setConnectTimeout(5000);
        connection.setReadTimeout(5000);
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("X-ThingsCloud-Delivery-Id", delivery.toString());
        connection.setRequestProperty("X-ThingsCloud-Timestamp", Long.toString(at));
        connection.setRequestProperty("X-ThingsCloud-Nonce", nonce.toString());
        connection.setRequestProperty("X-ThingsCloud-Signature", signature(at, nonce, delivery, body));
        connection.setRequestProperty("X-ThingsCloud-Key-Id", "local-v1");
        connection.setRequestProperty("X-ThingsCloud-Source-Deployment-Id", SOURCE.toString());
        connection.setDoOutput(true);
        try {
            connection.getOutputStream().write(body);
            assertThat(connection.getResponseCode()).isEqualTo(200);
        } finally {
            connection.disconnect();
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM cloud_service_event_inbox WHERE event_id=?",
                Integer.class, event)).isEqualTo(1);
    }

    private org.springframework.test.web.servlet.ResultActions request(UUID delivery, UUID nonce,
            long at, byte[] body, String keyId) throws Exception {
        return request(delivery, nonce, at, body, keyId, SECRET);
    }

    private org.springframework.test.web.servlet.ResultActions request(UUID delivery, UUID nonce,
            long at, byte[] body, String keyId, byte[] signingSecret) throws Exception {
        return mvc.perform(post("/api/v1/internal/service-events").contentType("application/json")
                .content(body)
                .header("X-ThingsCloud-Delivery-Id", delivery.toString())
                .header("X-ThingsCloud-Timestamp", Long.toString(at))
                .header("X-ThingsCloud-Nonce", nonce.toString())
                .header("X-ThingsCloud-Signature", signature(at, nonce, delivery, body, signingSecret))
                .header("X-ThingsCloud-Key-Id", keyId)
                .header("X-ThingsCloud-Source-Deployment-Id", SOURCE.toString()));
    }

    private static byte[] body(UUID delivery, UUID event, UUID tenant, UUID project, String marker) {
        return ("""
                {"deliveryId":"%s","event":{"eventId":"%s","schemaVersion":1,
                "tenantId":"%s","projectId":"%s","eventType":"device.property.report",
                "payload":{"marker":"%s"}}}
                """).formatted(delivery, event, tenant, project, marker).getBytes(StandardCharsets.UTF_8);
    }

    private static String signature(long at, UUID nonce, UUID delivery, byte[] body) {
        return signature(at, nonce, delivery, body, SECRET);
    }

    private static String signature(long at, UUID nonce, UUID delivery, byte[] body, byte[] signingSecret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(signingSecret, "HmacSHA256"));
            mac.update((at + "\n" + nonce + "\n" + delivery + "\n").getBytes(StandardCharsets.UTF_8));
            return "v1=" + HexFormat.of().formatHex(mac.doFinal(body));
        } catch (java.security.GeneralSecurityException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
