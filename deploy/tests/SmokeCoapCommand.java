import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.X509KeyManager;

import org.eclipse.californium.core.CoapClient;
import org.eclipse.californium.core.CoapResponse;
import org.eclipse.californium.core.coap.CoAP;
import org.eclipse.californium.core.coap.MediaTypeRegistry;
import org.eclipse.californium.core.coap.Option;
import org.eclipse.californium.core.coap.Request;
import org.eclipse.californium.core.coap.option.MapBasedOptionRegistry;
import org.eclipse.californium.core.coap.option.OpaqueOptionDefinition;
import org.eclipse.californium.core.coap.option.StandardOptionRegistry;
import org.eclipse.californium.core.network.CoapEndpoint;
import org.eclipse.californium.elements.config.Configuration;
import org.eclipse.californium.scandium.DTLSConnector;
import org.eclipse.californium.scandium.config.DtlsConfig;
import org.eclipse.californium.scandium.config.DtlsConnectorConfig;
import org.eclipse.californium.scandium.dtls.CertificateType;
import org.eclipse.californium.scandium.dtls.cipher.CipherSuite;
import org.eclipse.californium.scandium.dtls.x509.KeyManagerCertificateProvider;
import org.eclipse.californium.scandium.dtls.x509.StaticNewAdvancedCertificateVerifier;

/** 本机 CoAP/DTLS 命令领取与回复探针；全部设备凭据只从 stdin 读取。 */
public final class SmokeCoapCommand {
    private static final String BASE_URI = "coaps://127.0.0.1:15684/device-access/v1/command/";
    private static final String CLAIM_BODY = "{\"limit\":1,\"leaseSeconds\":30}";

    private SmokeCoapCommand() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            throw new IllegalArgumentException("expected certificate directory");
        }
        String[] fields = new String(System.in.readAllBytes(), StandardCharsets.UTF_8).split("\\R", -1);
        if (fields.length < 8 || Arrays.stream(fields, 0, 8).anyMatch(String::isBlank)) {
            throw new IllegalArgumentException("probe input incomplete: expected eight nonblank lines");
        }
        String projectKey = fields[0];
        Device target = new Device(projectKey, fields[1], fields[2]);
        Device other = new Device(projectKey, fields[3], fields[4]);
        UUID commandId = UUID.fromString(fields[5]);
        UUID replyMessageId = UUID.fromString(fields[6]);
        if (replyMessageId.version() != 7) {
            throw new IllegalArgumentException("reply messageId must be UUIDv7");
        }
        Instant occurredAt = Instant.parse(fields[7]);

        CoapEndpoint endpoint = endpoint(Path.of(args[0]));
        CoapClient client = new CoapClient(BASE_URI + "claim").setEndpoint(endpoint);
        client.setTimeout(15_000L);
        try {
            // 先证明另一设备没有可领取的目标命令。
            assertEmptyClaim(client, other, "other initial claim");

            CoapResponse claimed = awaitClaim(client, target);
            Map<String, Object> claim = object(claimed.getResponseText(), "claim response");
            List<?> commands = list(claim.get("commands"), "commands");
            if (commands.size() != 1 || !(commands.get(0) instanceof Map<?, ?> rawCommand)) {
                throw new IllegalStateException("claim must contain exactly one command");
            }
            Map<?, ?> command = rawCommand;
            if (!commandId.toString().equals(command.get("commandId"))) {
                throw new IllegalStateException("claimed commandId differs from requested command");
            }
            if (!(command.get("commandKey") instanceof String commandKey) || commandKey.isBlank()
                    || !(command.get("input") instanceof Map<?, ?>)
                    || !(command.get("attempt") instanceof Number attempt) || attempt.longValue() < 1
                    || !(command.get("leaseExpiresAt") instanceof String leaseExpiresAt)
                    || !Instant.parse(leaseExpiresAt).isAfter(Instant.now())
                    || !(claim.get("pollAfterMillis") instanceof Number pollAfter)
                    || pollAfter.longValue() < 1) {
                throw new IllegalStateException("claim response does not satisfy command contract");
            }

            String replyBody = "{\"commandId\":\"" + commandId + "\",\"messageId\":\""
                    + replyMessageId + "\",\"occurredAt\":\"" + occurredAt
                    + "\",\"status\":\"SUCCESS\",\"output\":{\"source\":\"coap-v3b\"}}";
            CoapResponse foreign = post(client, "reply", other, replyBody);
            assertCode(foreign, CoAP.ResponseCode.NOT_FOUND, "other-device reply");

            CoapResponse accepted = post(client, "reply", target, replyBody);
            assertCode(accepted, CoAP.ResponseCode.CHANGED, "target reply");
            Map<String, Object> acceptance = object(accepted.getResponseText(), "reply response");
            if (!commandId.toString().equals(acceptance.get("commandId"))
                    || !replyMessageId.toString().equals(acceptance.get("messageId"))
                    || !"ACCEPTED".equals(acceptance.get("status"))
                    || !(acceptance.get("receivedAt") instanceof String receivedAt)
                    || Instant.parse(receivedAt).isAfter(Instant.now().plusSeconds(10))) {
                throw new IllegalStateException("reply acceptance does not satisfy command contract");
            }

            assertEmptyClaim(client, target, "target final claim");
            System.out.println("COAP initial-empty=204 claim=205 other-reply=404 target-reply=204 "
                    + "final-empty=204 command=" + commandId + " attempt=" + attempt.longValue());
        } finally {
            client.shutdown();
            endpoint.destroy();
        }
    }

    private static CoapResponse awaitClaim(CoapClient client, Device device) throws Exception {
        long deadline = System.nanoTime() + 30_000_000_000L;
        do {
            CoapResponse response = post(client, "claim", device, CLAIM_BODY);
            if (response != null && response.getCode() == CoAP.ResponseCode.CONTENT) {
                return response;
            }
            if (response == null || response.getCode() != CoAP.ResponseCode.CHANGED
                    || !response.getResponseText().isEmpty()) {
                throw new IllegalStateException("target claim returned unexpected response");
            }
            Thread.sleep(500L);
        } while (System.nanoTime() < deadline);
        throw new IllegalStateException("target command was not claimable within 30 seconds");
    }

    private static void assertEmptyClaim(CoapClient client, Device device, String step) throws Exception {
        CoapResponse response = post(client, "claim", device, CLAIM_BODY);
        assertCode(response, CoAP.ResponseCode.CHANGED, step);
        if (!response.getResponseText().isEmpty()) {
            throw new IllegalStateException(step + " unexpectedly returned a body");
        }
    }

    private static CoapResponse post(CoapClient client, String resource, Device device, String body) throws Exception {
        Request request = Request.newPost();
        request.setURI(BASE_URI + resource);
        request.getOptions().setContentFormat(MediaTypeRegistry.APPLICATION_JSON);
        request.getOptions().addOption(new Option(65001, device.projectKey() + "/" + device.deviceKey()));
        request.getOptions().addOption(new Option(65002, device.secret()));
        request.setPayload(body.getBytes(StandardCharsets.UTF_8));
        return client.advanced(request);
    }

    private static void assertCode(CoapResponse response, CoAP.ResponseCode expected, String step) {
        if (response == null || response.getCode() != expected) {
            throw new IllegalStateException(step + " expected " + expected + ", got "
                    + (response == null ? "no response" : response.getCode()));
        }
    }

    private static CoapEndpoint endpoint(Path certificateDir) throws Exception {
        X509Certificate certificate = (X509Certificate) CertificateFactory.getInstance("X.509")
                .generateCertificate(Files.newInputStream(certificateDir.resolve("device.crt")));
        String pem = Files.readString(certificateDir.resolve("device.key"), StandardCharsets.US_ASCII)
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
        PrivateKey privateKey = KeyFactory.getInstance("EC").generatePrivate(
                new PKCS8EncodedKeySpec(Base64.getDecoder().decode(pem)));
        KeyStore store = KeyStore.getInstance("PKCS12");
        store.load(null, null);
        char[] password = "local-probe".toCharArray();
        store.setKeyEntry("client", privateKey, password, new java.security.cert.Certificate[] {certificate});
        KeyManagerFactory managers = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
        managers.init(store, password);
        X509KeyManager keyManager = Arrays.stream(managers.getKeyManagers())
                .filter(X509KeyManager.class::isInstance)
                .map(X509KeyManager.class::cast).findFirst().orElseThrow();

        Configuration configuration = Configuration.createStandardWithoutFile();
        DtlsConnectorConfig clientConfig = new DtlsConnectorConfig.Builder(configuration)
                .setAsList(DtlsConfig.DTLS_CIPHER_SUITES,
                        CipherSuite.TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256)
                .setCertificateIdentityProvider(new KeyManagerCertificateProvider(keyManager, CertificateType.X_509))
                .setAdvancedCertificateVerifier(new StaticNewAdvancedCertificateVerifier.Builder()
                        .setTrustedCertificates(certificate)
                        .setSupportedCertificateTypes(List.of(CertificateType.X_509))
                        .build())
                .build();
        return new CoapEndpoint.Builder()
                .setConfiguration(configuration)
                .setOptionRegistry(new MapBasedOptionRegistry(
                        StandardOptionRegistry.getDefaultOptionRegistry(),
                        new OpaqueOptionDefinition(65001, "TC-Device-Key"),
                        new OpaqueOptionDefinition(65002, "TC-Credential")))
                .setConnector(new DTLSConnector(clientConfig))
                .build();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> object(String json, String description) {
        Object value = new JsonReader(json).read();
        if (!(value instanceof Map<?, ?>)) {
            throw new IllegalStateException(description + " is not a JSON object");
        }
        return (Map<String, Object>) value;
    }

    private static List<?> list(Object value, String description) {
        if (!(value instanceof List<?> result)) {
            throw new IllegalStateException(description + " is not a JSON array");
        }
        return result;
    }

    private record Device(String projectKey, String deviceKey, String secret) {
    }

    /** 足够读取探针响应的严格 JSON 解析器，避免探针引入另一套外部依赖。 */
    private static final class JsonReader {
        private final String source;
        private int at;

        private JsonReader(String source) {
            this.source = source;
        }

        private Object read() {
            Object value = value();
            spaces();
            if (at != source.length()) {
                throw new IllegalStateException("trailing JSON content");
            }
            return value;
        }

        private Object value() {
            spaces();
            if (at >= source.length()) throw new IllegalStateException("incomplete JSON");
            char next = source.charAt(at);
            if (next == '{') return objectValue();
            if (next == '[') return arrayValue();
            if (next == '"') return string();
            if (source.startsWith("true", at)) { at += 4; return true; }
            if (source.startsWith("false", at)) { at += 5; return false; }
            if (source.startsWith("null", at)) { at += 4; return null; }
            int start = at;
            while (at < source.length() && "-+.eE0123456789".indexOf(source.charAt(at)) >= 0) at++;
            if (start == at) throw new IllegalStateException("invalid JSON value");
            try { return Double.valueOf(source.substring(start, at)); }
            catch (NumberFormatException exception) { throw new IllegalStateException("invalid JSON number", exception); }
        }

        private Map<String, Object> objectValue() {
            java.util.Map<String, Object> values = new java.util.LinkedHashMap<>();
            expect('{');
            spaces();
            if (take('}')) return values;
            do {
                spaces();
                String key = string();
                expect(':');
                values.put(key, value());
            } while (take(','));
            expect('}');
            return values;
        }

        private List<Object> arrayValue() {
            java.util.List<Object> values = new java.util.ArrayList<>();
            expect('[');
            spaces();
            if (take(']')) return values;
            do { values.add(value()); } while (take(','));
            expect(']');
            return values;
        }

        private String string() {
            expect('"');
            StringBuilder result = new StringBuilder();
            while (at < source.length()) {
                char ch = source.charAt(at++);
                if (ch == '"') return result.toString();
                if (ch != '\\') { result.append(ch); continue; }
                if (at >= source.length()) break;
                char escape = source.charAt(at++);
                switch (escape) {
                    case '"', '\\', '/' -> result.append(escape);
                    case 'b' -> result.append('\b');
                    case 'f' -> result.append('\f');
                    case 'n' -> result.append('\n');
                    case 'r' -> result.append('\r');
                    case 't' -> result.append('\t');
                    case 'u' -> {
                        if (at + 4 > source.length()) throw new IllegalStateException("invalid JSON unicode escape");
                        result.append((char) Integer.parseInt(source.substring(at, at + 4), 16));
                        at += 4;
                    }
                    default -> throw new IllegalStateException("invalid JSON escape");
                }
            }
            throw new IllegalStateException("unterminated JSON string");
        }

        private boolean take(char ch) {
            spaces();
            if (at < source.length() && source.charAt(at) == ch) { at++; return true; }
            return false;
        }

        private void expect(char ch) {
            if (!take(ch)) throw new IllegalStateException("expected JSON delimiter " + ch);
        }

        private void spaces() {
            while (at < source.length() && Character.isWhitespace(source.charAt(at))) at++;
        }
    }
}
