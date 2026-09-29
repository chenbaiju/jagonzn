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

/** V5e 本机 CoAP/DTLS 命令重领探针；设备凭据只从 stdin 读取，从不打印响应载荷。 */
public final class SmokeCoapClaim {
    private static final String CLAIM_URI = "coaps://127.0.0.1:15684/device-access/v1/command/claim";

    private SmokeCoapClaim() {
    }

    public static void main(String[] args) {
        try {
            run(args);
        } catch (ProbeFailure failure) {
            System.err.println("COAP_CLAIM_FAIL category=" + failure.category);
            System.exit(1);
        } catch (Exception failure) {
            // Exception text can contain transport details or payloads; keep public output stable.
            System.err.println("COAP_CLAIM_FAIL category=UNEXPECTED");
            System.exit(1);
        }
    }

    private static void run(String[] args) throws Exception {
        if (args.length != 5) throw new ProbeFailure("INPUT");
        UUID expected;
        int rounds;
        long pauseMillis;
        int leaseSeconds;
        try {
            expected = UUID.fromString(args[1]);
            rounds = Integer.parseInt(args[2]);
            pauseMillis = Long.parseLong(args[3]);
            leaseSeconds = Integer.parseInt(args[4]);
        } catch (IllegalArgumentException failure) {
            throw new ProbeFailure("INPUT");
        }
        if (rounds < 1 || rounds > 5 || pauseMillis < 0 || pauseMillis > 300_000
                || leaseSeconds < 10 || leaseSeconds > 300) {
            throw new ProbeFailure("INPUT");
        }
        String[] fields = new String(System.in.readAllBytes(), StandardCharsets.UTF_8).split("\\R", -1);
        if (fields.length < 3 || Arrays.stream(fields, 0, 3).anyMatch(String::isBlank)) {
            throw new ProbeFailure("INPUT");
        }
        Device device = new Device(fields[0], fields[1], fields[2]);

        CoapEndpoint endpoint;
        try {
            endpoint = endpoint(Path.of(args[0]));
        } catch (Exception failure) {
            throw new ProbeFailure("CERTIFICATE");
        }
        CoapClient client = new CoapClient(CLAIM_URI).setEndpoint(endpoint);
        client.setTimeout(15_000L);
        try {
            for (int index = 1; index <= rounds; index++) {
                if (index > 1) Thread.sleep(pauseMillis);
                CoapResponse response;
                try {
                    response = post(client, device, leaseSeconds);
                } catch (Exception failure) {
                    throw new ProbeFailure("NETWORK");
                }
                if (response == null) throw new ProbeFailure("NETWORK");
                if (response.getCode() == CoAP.ResponseCode.CHANGED) {
                    if (!response.getResponseText().isEmpty()) throw new ProbeFailure("RESPONSE");
                    System.out.println("COAP_CLAIM index=" + index + " code=204 empty=true");
                } else if (response.getCode() == CoAP.ResponseCode.CONTENT) {
                    Claimed claimed = parseClaim(response.getResponseText(), expected);
                    System.out.println("COAP_CLAIM index=" + index + " code=205 command=" + claimed.commandId
                            + " attempt=" + claimed.attempt + " leaseExpiresAt=" + claimed.leaseExpiresAt);
                } else {
                    throw new ProbeFailure("RESPONSE");
                }
            }
        } finally {
            client.shutdown();
            endpoint.destroy();
        }
    }

    private static CoapResponse post(CoapClient client, Device device, int leaseSeconds) throws Exception {
        Request request = Request.newPost();
        request.setURI(CLAIM_URI);
        request.getOptions().setContentFormat(MediaTypeRegistry.APPLICATION_JSON);
        request.getOptions().addOption(new Option(65001, device.projectKey + "/" + device.deviceKey));
        request.getOptions().addOption(new Option(65002, device.secret));
        request.setPayload(("{\"limit\":1,\"leaseSeconds\":" + leaseSeconds + "}")
                .getBytes(StandardCharsets.UTF_8));
        return client.advanced(request);
    }

    private static Claimed parseClaim(String body, UUID expected) {
        try {
            Object parsed = new JsonReader(body).read();
            if (!(parsed instanceof Map<?, ?> envelope)
                    || !(envelope.get("commands") instanceof List<?> commands)
                    || commands.size() != 1 || !(commands.get(0) instanceof Map<?, ?> command)
                    || !(command.get("commandId") instanceof String id)
                    || !expected.toString().equals(id)
                    || !(command.get("attempt") instanceof Number attemptNumber)
                    || attemptNumber.longValue() < 1
                    || !(command.get("leaseExpiresAt") instanceof String expires)
                    || !Instant.parse(expires).isAfter(Instant.now())
                    || !(envelope.get("pollAfterMillis") instanceof Number pollAfter)
                    || pollAfter.longValue() < 1) {
                throw new ProbeFailure("CONTRACT");
            }
            return new Claimed(id, attemptNumber.longValue(), expires);
        } catch (ProbeFailure failure) {
            throw failure;
        } catch (RuntimeException failure) {
            throw new ProbeFailure("CONTRACT");
        }
    }

    private static CoapEndpoint endpoint(Path certificateDir) throws Exception {
        X509Certificate certificate;
        try (var input = Files.newInputStream(certificateDir.resolve("device.crt"))) {
            certificate = (X509Certificate) CertificateFactory.getInstance("X.509")
                    .generateCertificate(input);
        }
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

    private record Device(String projectKey, String deviceKey, String secret) {
    }

    private record Claimed(String commandId, long attempt, String leaseExpiresAt) {
    }

    private static final class ProbeFailure extends RuntimeException {
        private final String category;

        private ProbeFailure(String category) {
            this.category = category;
        }
    }

    /** 仅解析本探针需要的响应结构，避免引入与候选服务无关的新运行时依赖。 */
    private static final class JsonReader {
        private final String source;
        private int at;

        private JsonReader(String source) {
            this.source = source;
        }

        private Object read() {
            Object value = value();
            spaces();
            if (at != source.length()) throw new IllegalStateException("trailing JSON");
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
            catch (NumberFormatException failure) { throw new IllegalStateException("invalid JSON number"); }
        }

        private Map<String, Object> objectValue() {
            Map<String, Object> values = new java.util.LinkedHashMap<>();
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
            List<Object> values = new java.util.ArrayList<>();
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
                        if (at + 4 > source.length()) throw new IllegalStateException("invalid JSON unicode");
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
            if (!take(ch)) throw new IllegalStateException("invalid JSON delimiter");
        }

        private void spaces() {
            while (at < source.length() && Character.isWhitespace(source.charAt(at))) at++;
        }
    }
}
