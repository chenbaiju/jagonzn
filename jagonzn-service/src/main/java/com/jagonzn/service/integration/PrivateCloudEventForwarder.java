package com.jagonzn.service.integration;

import com.things.cloud.shared.message.PublicWebhookSource;
import com.things.cloud.support.notification.delivery.WebhookSignatures;
import com.things.cloud.support.webhook.PublicWebhookCodec;
import jakarta.annotation.PreDestroy;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.UUID;

/** 独立 Kafka 消费组把已持久平台事实送到受控 cloud 内网入口；失败保留原 offset。 */
@Component
@ConditionalOnProperty(name = "jagonzn.cloud.private-delivery.enabled", havingValue = "true")
public final class PrivateCloudEventForwarder {
    private final ObjectMapper json;
    private final PublicWebhookCodec codec;
    private final URI target;
    private final UUID sourceDeploymentId;
    private final UUID tenantId;
    private final Set<UUID> projectIds;
    private final String keyId;
    private final byte[] secret;
    private final Transport transport;

    @Autowired
    public PrivateCloudEventForwarder(ObjectMapper json,
            @Value("${jagonzn.cloud.private-delivery.url:}") String url,
            @Value("${jagonzn.cloud.private-delivery.source-deployment-id:}") String source,
            @Value("${jagonzn.cloud.private-delivery.tenant-id:}") String tenant,
            @Value("${jagonzn.cloud.private-delivery.project-id:}") String project,
            @Value("${jagonzn.cloud.private-delivery.project-ids:}") String projects,
            @Value("${jagonzn.cloud.private-delivery.key-id:}") String keyId,
            @Value("${jagonzn.cloud.private-delivery.secret-base64:}") String encodedSecret,
            @Value("${things-cloud.integration.internal-event-source.enabled:false}") boolean sourceEnabled) {
        this(json, url, source, tenant, projects.isBlank() ? project : projects, keyId, encodedSecret, sourceEnabled,
                new HttpsTransport());
    }

    PrivateCloudEventForwarder(ObjectMapper json, String url, String source, String tenant,
            String project, String keyId, String encodedSecret, boolean sourceEnabled,
            Transport transport) {
        this.json = json;
        this.codec = new PublicWebhookCodec(json);
        this.transport = transport;
        try {
            target = URI.create(url);
            if (!"https".equals(target.getScheme()) || target.getHost() == null
                    || target.getUserInfo() != null || target.getQuery() != null
                    || target.getFragment() != null || !"/api/v1/internal/service-events".equals(target.getPath()))
                throw new IllegalArgumentException();
            sourceDeploymentId = canonicalUuid(source);
            tenantId = canonicalUuid(tenant);
            projectIds = projectIds(project);
            if (!keyId.matches("[A-Za-z0-9_-]{1,32}")) throw new IllegalArgumentException();
            this.keyId = keyId;
            secret = Base64.getDecoder().decode(encodedSecret);
            if (secret.length != 32 || !sourceEnabled) throw new IllegalArgumentException();
        } catch (IllegalArgumentException invalid) {
            throw new IllegalStateException("私有 cloud 事件发送配置或内部持久源无效", invalid);
        }
    }

    @KafkaListener(id = "jagonzn-private-cloud-source", topics = PublicWebhookSource.TOPIC,
            groupId = "${things-cloud.kafka.group-prefix:jagonzn}-private-cloud-source",
            containerFactory = "webhookSourceKafkaListenerContainerFactory",
            concurrency = "1")
    public void consume(ConsumerRecord<byte[], byte[]> record) {
        try {
            if (!PublicWebhookSource.TOPIC.equals(record.topic()) || record.value() == null)
                throw new DeliveryFailure("PRIVATE_CLOUD_SOURCE_INVALID");
            if (record.value().length > 1_048_576)
                throw new DeliveryFailure("PRIVATE_CLOUD_SOURCE_TOO_LARGE");
            var source = json.readValue(record.value(), PublicWebhookSource.class);
            if (!Arrays.equals(record.key(), source.aggregateId().toString().getBytes(StandardCharsets.UTF_8)))
                throw new DeliveryFailure("PRIVATE_CLOUD_SOURCE_INVALID");
            if (!tenantId.equals(source.event().tenantId()))
                return; // 独立消费组只接收本部署租户的事实。
            if (!projectIds.contains(source.event().projectId()))
                throw new DeliveryFailure("PRIVATE_CLOUD_PROJECT_NOT_MAPPED");
            codec.validate(source);
            if (source.eventText() == null) throw new DeliveryFailure("PRIVATE_CLOUD_EVENT_TOO_LARGE");
            UUID deliveryId = source.event().eventId();
            byte[] body = PublicWebhookCodec.body(deliveryId, source.eventText())
                    .getBytes(StandardCharsets.UTF_8);
            if (body.length > PublicWebhookCodec.MAX_BODY_BYTES)
                throw new DeliveryFailure("PRIVATE_CLOUD_EVENT_TOO_LARGE");
            String nonce = UUID.randomUUID().toString();
            long timestamp = Instant.now().getEpochSecond();
            String signature = WebhookSignatures.sign(secret, timestamp, nonce, deliveryId, body);
            int status = transport.post(target, sourceDeploymentId, keyId, timestamp,
                    nonce, deliveryId, signature, body);
            if (status == 413) throw new DeliveryFailure("PRIVATE_CLOUD_RECEIVER_PAYLOAD_TOO_LARGE");
            if (status >= 400 && status < 500)
                throw new DeliveryFailure("PRIVATE_CLOUD_RECEIVER_REJECTED_" + status);
            if (status != 200) throw new DeliveryFailure("PRIVATE_CLOUD_EVENT_NOT_DELIVERED");
        } catch (DeliveryFailure failure) {
            // 稳定错误码和 Kafka 原始分区/offset 可用于受控恢复，正文与密钥不写日志。
            throw failure;
        } catch (RuntimeException failure) {
            // 原消息、密钥及网络异常不得进入消费日志；原容器 factory 无限重试且不提交 offset。
            throw new IllegalStateException("PRIVATE_CLOUD_EVENT_NOT_DELIVERED");
        }
    }

    private static final class DeliveryFailure extends IllegalStateException {
        private DeliveryFailure(String code) { super(code); }
    }

    private static UUID canonicalUuid(String text) {
        UUID value = UUID.fromString(text);
        if (!value.toString().equals(text)) throw new IllegalArgumentException();
        return value;
    }

    private static Set<UUID> projectIds(String text) {
        String[] entries = text.split(",", -1);
        if (entries.length == 0 || entries.length > 1000) throw new IllegalArgumentException();
        Set<UUID> ids = Arrays.stream(entries).map(PrivateCloudEventForwarder::canonicalUuid)
                .collect(Collectors.toUnmodifiableSet());
        if (ids.size() != entries.length) throw new IllegalArgumentException();
        return ids;
    }

    @PreDestroy
    public void clearSecret() {
        Arrays.fill(secret, (byte) 0);
    }

    /** 注入端口只供聚焦测试；正式实现只接受 HTTPS 并使用 JVM 受信链。 */
    interface Transport {
        int post(URI target, UUID source, String keyId, long timestamp, String nonce,
                 UUID deliveryId, String signature, byte[] body);
    }

    static final class HttpsTransport implements Transport {
        private final HttpClient client;

        HttpsTransport() {
            this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                    .followRedirects(HttpClient.Redirect.NEVER).build());
        }

        HttpsTransport(HttpClient client) {
            this.client = client;
        }

        @Override
        public int post(URI target, UUID source, String keyId, long timestamp, String nonce,
                        UUID deliveryId, String signature, byte[] body) {
            var request = HttpRequest.newBuilder(target).timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .header("X-ThingsCloud-Source-Deployment-Id", source.toString())
                    .header("X-ThingsCloud-Key-Id", keyId)
                    .header("X-ThingsCloud-Timestamp", Long.toString(timestamp))
                    .header("X-ThingsCloud-Nonce", nonce)
                    .header("X-ThingsCloud-Delivery-Id", deliveryId.toString())
                    .header("X-ThingsCloud-Signature", signature)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body)).build();
            try {
                return client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("私有事件发送中断");
            } catch (java.io.IOException unavailable) {
                throw new IllegalStateException("私有事件接收端不可达");
            }
        }
    }
}
