package com.jagonzn.service.integration;

import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsServer;
import com.things.cloud.shared.message.PublicWebhookEvent;
import com.things.cloud.shared.message.PublicWebhookSource;
import com.things.cloud.support.webhook.PublicWebhookCodec;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.KeyStore;
import java.time.Instant;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 真实回环 HTTPS 校验证书信任、签名头、拒绝后的重试边界。 */
class PrivateCloudEventHttpsTests {
    private static final UUID SOURCE = UUID.fromString("00000000-0000-0000-0000-000000000111");
    private static final UUID TENANT = UUID.fromString("00000000-0000-0000-0000-000000000222");
    private static final UUID PROJECT = UUID.fromString("00000000-0000-0000-0000-000000000333");

    @TempDir Path directory;

    @Test
    void trustedHttpsAcceptsAndFailedStatusKeepsRetryableSource() throws Exception {
        KeyStore keys = certificate();
        KeyManagerFactory keyManagers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        keyManagers.init(keys, "test-only-password".toCharArray());
        TrustManagerFactory trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
        trust.init(keys);
        SSLContext serverTls = SSLContext.getInstance("TLS");
        serverTls.init(keyManagers.getKeyManagers(), null, null);
        SSLContext clientTls = SSLContext.getInstance("TLS");
        clientTls.init(null, trust.getTrustManagers(), null);

        var server = HttpsServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.setHttpsConfigurator(new HttpsConfigurator(serverTls));
        var status = new AtomicInteger(200);
        var received = new AtomicReference<byte[]>();
        var deploymentHeader = new AtomicReference<String>();
        server.createContext("/api/v1/internal/service-events", exchange -> {
            received.set(exchange.getRequestBody().readAllBytes());
            deploymentHeader.set(exchange.getRequestHeaders().getFirst("X-ThingsCloud-Source-Deployment-Id"));
            exchange.sendResponseHeaders(status.get(), -1);
            exchange.close();
        });
        server.start();
        try {
            String url = "https://127.0.0.1:" + server.getAddress().getPort()
                    + "/api/v1/internal/service-events";
            byte[] secret = "0123456789abcdefghijklmnopqrstuv".getBytes(StandardCharsets.US_ASCII);
            var json = JsonMapper.builder().build();
            var client = HttpClient.newBuilder().sslContext(clientTls).build();
            var forwarder = new PrivateCloudEventForwarder(json, url, SOURCE.toString(),
                    TENANT.toString(), PROJECT.toString(), "local-v1",
                    Base64.getEncoder().encodeToString(secret), true,
                    new PrivateCloudEventForwarder.HttpsTransport(client));
            UUID eventId = UUID.randomUUID(), device = UUID.randomUUID();
            var event = new PublicWebhookEvent(eventId, "device.property.report", TENANT, PROJECT,
                    1, "device", device, device, Instant.now(), Instant.now(), "tls-test", "{}");
            var source = new PublicWebhookCodec(json).prepare(event);
            var record = new ConsumerRecord<byte[], byte[]>(PublicWebhookSource.TOPIC, 0, 0,
                    source.aggregateId().toString().getBytes(StandardCharsets.UTF_8),
                    json.writeValueAsBytes(source));
            forwarder.consume(record);
            assertThat(deploymentHeader.get()).isEqualTo(SOURCE.toString());
            assertThat(json.readTree(received.get()).path("event").path("eventId").asText())
                    .isEqualTo(eventId.toString());

            status.set(503);
            assertThatThrownBy(() -> forwarder.consume(record))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessage("PRIVATE_CLOUD_EVENT_NOT_DELIVERED");
            status.set(200);
            forwarder.consume(record);

            var untrusted = new PrivateCloudEventForwarder(json, url, SOURCE.toString(),
                    TENANT.toString(), PROJECT.toString(), "local-v1",
                    Base64.getEncoder().encodeToString(secret), true,
                    new PrivateCloudEventForwarder.HttpsTransport());
            assertThatThrownBy(() -> untrusted.consume(record))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessage("PRIVATE_CLOUD_EVENT_NOT_DELIVERED");
        } finally {
            server.stop(0);
        }
    }

    private KeyStore certificate() throws Exception {
        Path store = directory.resolve("private-cloud-test.p12");
        String keytool = Path.of(System.getProperty("java.home"), "bin", "keytool").toString();
        var process = new ProcessBuilder(keytool, "-genkeypair", "-alias", "cloud",
                "-keyalg", "EC", "-groupname", "secp256r1", "-dname", "CN=localhost",
                "-ext", "SAN=IP:127.0.0.1,DNS:localhost", "-validity", "2",
                "-storetype", "PKCS12", "-keystore", store.toString(),
                "-storepass", "test-only-password", "-keypass", "test-only-password", "-noprompt")
                .redirectErrorStream(true).start();
        if (!process.waitFor(30, TimeUnit.SECONDS) || process.exitValue() != 0)
            throw new IllegalStateException("测试 HTTPS 证书生成失败");
        var keys = KeyStore.getInstance("PKCS12");
        try (var input = java.nio.file.Files.newInputStream(store)) {
            keys.load(input, "test-only-password".toCharArray());
        }
        return keys;
    }
}
