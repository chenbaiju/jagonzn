package com.jagonzn.cloud.integration;

import jakarta.annotation.PreDestroy;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collections;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.UUID;

/** 仅服务间事件接收；外层内网代理负责 TLS 和设备网隔离。 */
@RestController
@ConditionalOnProperty(name = "jagonzn.cloud.service-events.enabled", havingValue = "true")
public class CloudServiceEventInboxController {
    private static final int MAX_BODY = 262_144;
    private final CloudServiceEventInboxStore store;
    private final ObjectMapper json;
    private final UUID sourceDeploymentId;
    private final UUID tenantId;
    private final Set<UUID> projectIds;
    private final Map<String, byte[]> secrets;

    @Autowired
    public CloudServiceEventInboxController(CloudServiceEventInboxStore store, ObjectMapper json,
            @Value("${jagonzn.cloud.service-events.source-deployment-id:}") String sourceDeploymentId,
            @Value("${jagonzn.cloud.service-events.tenant-id:}") String tenantId,
            @Value("${jagonzn.cloud.service-events.project-id:}") String projectId,
            @Value("${jagonzn.cloud.service-events.project-ids:}") String projectIds,
            @Value("${jagonzn.cloud.service-events.key-id:}") String keyId,
            @Value("${jagonzn.cloud.service-events.secret-base64:}") String secretBase64,
            @Value("${jagonzn.cloud.service-events.previous-key-id:}") String previousKeyId,
            @Value("${jagonzn.cloud.service-events.previous-secret-base64:}") String previousSecretBase64) {
        this.store = store;
        this.json = json;
        try {
            this.sourceDeploymentId = canonicalUuid(sourceDeploymentId);
            this.tenantId = canonicalUuid(tenantId);
            this.projectIds = parseProjects(projectIds.isBlank() ? projectId : projectIds);
            if (!keyId.matches("[A-Za-z0-9_-]{1,32}")) throw new IllegalArgumentException();
            byte[] current = decodeSecret(secretBase64);
            if (previousKeyId.isBlank() && previousSecretBase64.isBlank()) {
                this.secrets = Map.of(keyId, current);
            } else {
                if (previousKeyId.equals(keyId) || !previousKeyId.matches("[A-Za-z0-9_-]{1,32}"))
                    throw new IllegalArgumentException();
                this.secrets = Map.of(keyId, current, previousKeyId,
                        decodeSecret(previousSecretBase64));
            }
        } catch (IllegalArgumentException invalid) {
            throw new IllegalStateException("cloud 私有事件入口缺少有效来源身份或签名密钥", invalid);
        }
    }

    public CloudServiceEventInboxController(CloudServiceEventInboxStore store, ObjectMapper json,
            String sourceDeploymentId, String tenantId, String projectId, String keyId,
            String secretBase64) {
        this(store, json, sourceDeploymentId, tenantId, projectId, "", keyId,
                secretBase64, "", "");
    }

    @PostMapping(path = "/api/v1/internal/service-events", consumes = "application/json")
    public ResponseEntity<Void> receive(HttpServletRequest request) throws IOException {
        if (request.getContentLengthLong() > MAX_BODY) return ResponseEntity.status(413).build();
        String deliveryText = oneHeader(request, "X-ThingsCloud-Delivery-Id");
        String timestampText = oneHeader(request, "X-ThingsCloud-Timestamp");
        String nonceText = oneHeader(request, "X-ThingsCloud-Nonce");
        String signature = oneHeader(request, "X-ThingsCloud-Signature");
        String receivedKeyId = oneHeader(request, "X-ThingsCloud-Key-Id");
        String receivedDeploymentId = oneHeader(request, "X-ThingsCloud-Source-Deployment-Id");
        if (deliveryText == null || timestampText == null || nonceText == null
                || signature == null || receivedKeyId == null || receivedDeploymentId == null)
            return ResponseEntity.badRequest().build();
        byte[] body = request.getInputStream().readNBytes(MAX_BODY + 1);
        if (body.length > MAX_BODY) return ResponseEntity.status(413).build();
        try {
            UUID deliveryId = canonicalUuid(deliveryText);
            UUID nonce = canonicalUuid(nonceText);
            if (!timestampText.matches("[1-9][0-9]{0,18}")) return ResponseEntity.badRequest().build();
            long timestamp = Long.parseLong(timestampText);
            long now = Instant.now().getEpochSecond();
            if (timestamp < now - 300 || timestamp > now + 300) return ResponseEntity.status(401).build();
            byte[] secret = secrets.get(receivedKeyId);
            if (secret == null || !signature.matches("v1=[0-9a-f]{64}"))
                return ResponseEntity.status(401).build();
            byte[] expected = sign(secret, timestampText, nonceText, deliveryText, body);
            byte[] received = HexFormat.of().parseHex(signature.substring(3));
            if (!MessageDigest.isEqual(expected, received)) return ResponseEntity.status(401).build();
            if (!sourceDeploymentId.equals(canonicalUuid(receivedDeploymentId)))
                return ResponseEntity.status(403).build();
            JsonNode document = json.readTree(body);
            if (document == null || !document.isObject()
                    || !document.path("deliveryId").isString()
                    || !deliveryText.equals(document.path("deliveryId").asText()))
                return ResponseEntity.badRequest().build();
            JsonNode event = document.path("event");
            if (!event.isObject() || !event.path("schemaVersion").isIntegralNumber()
                    || event.path("schemaVersion").asInt() != 1
                    || !event.path("eventType").isString()
                    || event.path("eventType").asText().isBlank())
                return ResponseEntity.badRequest().build();
            UUID eventId = canonicalUuid(event.path("eventId").asText());
            UUID eventProjectId = canonicalUuid(event.path("projectId").asText());
            if (!tenantId.equals(canonicalUuid(event.path("tenantId").asText()))
                    || !projectIds.contains(eventProjectId))
                return ResponseEntity.status(403).build();
            String eventJson = event.toString();
            String digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(eventJson.getBytes(StandardCharsets.UTF_8)));
            var outcome = store.accept(sourceDeploymentId, nonce, deliveryId, eventId,
                    tenantId, eventProjectId, event.path("eventType").asText(), digest, eventJson);
            return switch (outcome) {
                case ACCEPTED, DUPLICATE -> ResponseEntity.ok().build();
                case REPLAY, CONFLICT -> ResponseEntity.status(409).build();
            };
        } catch (IllegalArgumentException | tools.jackson.core.JacksonException invalid) {
            return ResponseEntity.badRequest().build();
        } catch (java.security.GeneralSecurityException impossible) {
            throw new IllegalStateException("事件摘要算法不可用", impossible);
        }
    }

    /** 重复请求头不能由 servlet 合并后偷偷通过验签。 */
    private static String oneHeader(HttpServletRequest request, String name) {
        var values = Collections.list(request.getHeaders(name));
        return values.size() == 1 ? values.getFirst() : null;
    }

    private static UUID canonicalUuid(String text) {
        UUID value = UUID.fromString(text);
        if (!value.toString().equals(text)) throw new IllegalArgumentException("UUID 格式无效");
        return value;
    }

    private byte[] sign(byte[] secret, String timestamp, String nonce, String deliveryId, byte[] body)
            throws java.security.GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret, "HmacSHA256"));
        mac.update((timestamp + "\n" + nonce + "\n" + deliveryId + "\n")
                .getBytes(StandardCharsets.UTF_8));
        return mac.doFinal(body);
    }

    @PreDestroy
    public void clearSecret() {
        secrets.values().forEach(secret -> Arrays.fill(secret, (byte) 0));
    }

    private static byte[] decodeSecret(String encoded) {
        byte[] secret = Base64.getDecoder().decode(encoded);
        if (secret.length != 32) throw new IllegalArgumentException();
        return secret;
    }

    private static Set<UUID> parseProjects(String text) {
        String[] entries = text.split(",", -1);
        if (entries.length == 0 || entries.length > 1000) throw new IllegalArgumentException();
        Set<UUID> ids = Arrays.stream(entries).map(CloudServiceEventInboxController::canonicalUuid)
                .collect(Collectors.toUnmodifiableSet());
        if (ids.size() != entries.length) throw new IllegalArgumentException();
        return ids;
    }
}
