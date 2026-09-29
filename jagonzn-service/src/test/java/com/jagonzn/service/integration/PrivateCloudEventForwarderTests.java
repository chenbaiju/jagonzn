package com.jagonzn.service.integration;

import com.things.cloud.shared.message.PublicWebhookEvent;
import com.things.cloud.shared.message.PublicWebhookSource;
import com.things.cloud.support.webhook.PublicWebhookCodec;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 固定内部来源与云端封套互通；失败不得被误认为 Kafka offset 可提交。 */
class PrivateCloudEventForwarderTests {
    private static final UUID SOURCE = UUID.fromString("00000000-0000-0000-0000-000000000111");
    private static final UUID TENANT = UUID.fromString("00000000-0000-0000-0000-000000000222");
    private static final UUID PROJECT = UUID.fromString("00000000-0000-0000-0000-000000000333");
    private static final UUID SECOND_PROJECT = UUID.fromString("00000000-0000-0000-0000-000000000334");
    private static final byte[] SECRET = "0123456789abcdefghijklmnopqrstuv".getBytes(StandardCharsets.US_ASCII);
    private static final String URL = "https://cloud.internal:8443/api/v1/internal/service-events";
    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test
    void signsFrozenEventAndPreservesStableDeliveryAcrossRetry() throws Exception {
        var transport = new CapturingTransport();
        var forwarder = sender(transport);
        UUID eventId = UUID.randomUUID();
        var record = record(eventId, TENANT, PROJECT);
        transport.status = 503;
        assertThatThrownBy(() -> forwarder.consume(record))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("PRIVATE_CLOUD_EVENT_NOT_DELIVERED");
        transport.status = 200;
        forwarder.consume(record);
        assertThat(transport.calls).hasSize(2);
        assertThat(transport.calls.get(0).deliveryId).isEqualTo(eventId);
        assertThat(transport.calls.get(1).deliveryId).isEqualTo(eventId);
        assertThat(transport.calls.get(0).nonce).isNotEqualTo(transport.calls.get(1).nonce);
        for (var call : transport.calls) {
            assertThat(call.target.toString()).isEqualTo(URL);
            assertThat(call.source).isEqualTo(SOURCE);
            assertThat(call.keyId).isEqualTo("local-v1");
            assertThat(mapper.readTree(call.body).path("event").path("eventId").asText())
                    .isEqualTo(eventId.toString());
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(SECRET, "HmacSHA256"));
            mac.update((call.timestamp + "\n" + call.nonce + "\n" + eventId + "\n")
                    .getBytes(StandardCharsets.UTF_8));
            assertThat(call.signature).isEqualTo("v1=" + HexFormat.of().formatHex(mac.doFinal(call.body)));
        }
    }

    @Test
    void commandTerminalDescriptorKeepsIdentityAndStatusAcrossPrivateRetry() {
        var transport = new CapturingTransport();
        var forwarder = sender(transport);
        UUID eventId = UUID.randomUUID();
        UUID commandId = UUID.randomUUID();
        UUID deviceId = UUID.randomUUID();
        var event = new PublicWebhookEvent(eventId, "command.completed", TENANT, PROJECT,
                7, "command", commandId, deviceId, Instant.now(), Instant.now(),
                "private-command-test", "{\"status\":\"SUCCEEDED\"}");
        var source = new PublicWebhookCodec(mapper).prepare(event);
        var record = new ConsumerRecord<byte[], byte[]>(PublicWebhookSource.TOPIC, 0, 3,
                source.aggregateId().toString().getBytes(StandardCharsets.UTF_8),
                mapper.writeValueAsBytes(source));
        transport.status = 503;
        assertThatThrownBy(() -> forwarder.consume(record))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("PRIVATE_CLOUD_EVENT_NOT_DELIVERED");
        transport.status = 200;
        forwarder.consume(record);
        assertThat(transport.calls).hasSize(2);
        for (var call : transport.calls) {
            assertThat(call.deliveryId).isEqualTo(eventId);
            var body = mapper.readTree(call.body).path("event");
            assertThat(body.path("eventType").asText()).isEqualTo("command.completed");
            assertThat(body.path("resourceId").asText()).isEqualTo(commandId.toString());
            assertThat(body.path("deviceId").asText()).isEqualTo(deviceId.toString());
            assertThat(body.path("payload").path("status").asText()).isEqualTo("SUCCEEDED");
        }
    }

    @Test
    void ignoresOtherScopeAndRejectsCorruptedSourceWithoutNetwork() {
        var transport = new CapturingTransport();
        var forwarder = sender(transport);
        forwarder.consume(record(UUID.randomUUID(), UUID.randomUUID(), PROJECT));
        assertThat(transport.calls).isEmpty();
        assertThatThrownBy(() -> forwarder.consume(record(UUID.randomUUID(), TENANT, UUID.randomUUID())))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("PRIVATE_CLOUD_PROJECT_NOT_MAPPED");
        forwarder.consume(record(UUID.randomUUID(), TENANT, SECOND_PROJECT));
        assertThat(transport.calls).hasSize(1);
        var valid = record(UUID.randomUUID(), TENANT, PROJECT);
        var corrupted = new ConsumerRecord<byte[], byte[]>(PublicWebhookSource.TOPIC, 0, 0,
                "wrong".getBytes(StandardCharsets.UTF_8), valid.value());
        assertThatThrownBy(() -> forwarder.consume(corrupted))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("PRIVATE_CLOUD_SOURCE_INVALID");
        assertThat(transport.calls).hasSize(1);
    }

    @Test
    void keepsOffsetBlockedForOversizeAndPermanentReceiverRejection() {
        var transport = new CapturingTransport();
        var forwarder = sender(transport);
        var valid = record(UUID.randomUUID(), TENANT, PROJECT);
        var tooLarge = new ConsumerRecord<byte[], byte[]>(PublicWebhookSource.TOPIC, 0, 42,
                valid.key(), new byte[1_048_577]);
        assertThatThrownBy(() -> forwarder.consume(tooLarge))
                .isInstanceOf(IllegalStateException.class).hasMessage("PRIVATE_CLOUD_SOURCE_TOO_LARGE");
        transport.status = 401;
        assertThatThrownBy(() -> forwarder.consume(valid))
                .isInstanceOf(IllegalStateException.class).hasMessage("PRIVATE_CLOUD_RECEIVER_REJECTED_401");
        transport.status = 413;
        assertThatThrownBy(() -> forwarder.consume(valid))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("PRIVATE_CLOUD_RECEIVER_PAYLOAD_TOO_LARGE");
    }

    @Test
    void requiresHttpsCompleteIdentityAndDurableSource() {
        var transport = new CapturingTransport();
        assertThatThrownBy(() -> new PrivateCloudEventForwarder(mapper,
                "http://cloud.internal/api/v1/internal/service-events", SOURCE.toString(),
                TENANT.toString(), PROJECT.toString(), "local-v1", encodedSecret(), true, transport))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new PrivateCloudEventForwarder(mapper,
                URL, SOURCE.toString(), TENANT.toString(), PROJECT.toString(),
                "local-v1", encodedSecret(), false, transport))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new PrivateCloudEventForwarder(mapper,
                URL, "", TENANT.toString(), PROJECT.toString(),
                "local-v1", encodedSecret(), true, transport))
                .isInstanceOf(IllegalStateException.class);
    }

    private PrivateCloudEventForwarder sender(CapturingTransport transport) {
        return new PrivateCloudEventForwarder(mapper, URL, SOURCE.toString(), TENANT.toString(),
                PROJECT + "," + SECOND_PROJECT, "local-v1", encodedSecret(), true, transport);
    }

    private static String encodedSecret() {
        return Base64.getEncoder().encodeToString(SECRET);
    }

    private ConsumerRecord<byte[], byte[]> record(UUID eventId, UUID tenant, UUID project) {
        UUID device = UUID.randomUUID();
        var event = new PublicWebhookEvent(eventId, "device.property.report", tenant, project,
                1, "device", device, device, Instant.now(), Instant.now(), "private-test", "{}");
        var source = new PublicWebhookCodec(mapper).prepare(event);
        return new ConsumerRecord<>(PublicWebhookSource.TOPIC, 0, 0,
                source.aggregateId().toString().getBytes(StandardCharsets.UTF_8),
                mapper.writeValueAsBytes(source));
    }

    private static final class CapturingTransport implements PrivateCloudEventForwarder.Transport {
        private final List<Call> calls = new ArrayList<>();
        private int status = 200;

        @Override
        public int post(URI target, UUID source, String keyId, long timestamp, String nonce,
                        UUID deliveryId, String signature, byte[] body) {
            calls.add(new Call(target, source, keyId, timestamp, nonce, deliveryId, signature, body));
            return status;
        }
    }

    private record Call(URI target, UUID source, String keyId, long timestamp, String nonce,
                        UUID deliveryId, String signature, byte[] body) {}
}
