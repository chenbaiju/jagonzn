import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.util.List;

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

/** 本机标准 CoAP/DTLS 属性探针；凭据从 stdin 读取。 */
public final class SmokeCoap {
    private static final String URI = "coaps://127.0.0.1:15684/device-access/v1/property/report";

    public static void main(String[] args) throws Exception {
        Path certificateDir = args.length == 0 ? Path.of("/certs") : Path.of(args[0]);
        if (args.length > 1) throw new IllegalArgumentException("expected only certificate directory");
        String[] fields = new String(System.in.readAllBytes(), StandardCharsets.UTF_8).split("\\R", -1);
        if (fields.length < 5) throw new IllegalArgumentException("probe input incomplete");
        String projectKey = fields[0], deviceKey = fields[1], secret = fields[2];
        String messageId = fields[3], occurredAt = fields[4];
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
        X509KeyManager keyManager = java.util.Arrays.stream(managers.getKeyManagers())
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
        CoapEndpoint endpoint = new CoapEndpoint.Builder()
                .setConfiguration(configuration)
                .setOptionRegistry(new MapBasedOptionRegistry(
                        StandardOptionRegistry.getDefaultOptionRegistry(),
                        new OpaqueOptionDefinition(65001, "TC-Device-Key"),
                        new OpaqueOptionDefinition(65002, "TC-Credential")))
                .setConnector(new DTLSConnector(clientConfig))
                .build();
        CoapClient client = new CoapClient(URI).setEndpoint(endpoint);
        client.setTimeout(15_000L);
        Request request = Request.newPost();
        request.setURI(URI);
        request.getOptions().setContentFormat(MediaTypeRegistry.APPLICATION_JSON);
        request.getOptions().addOption(new Option(65001, projectKey + "/" + deviceKey));
        request.getOptions().addOption(new Option(65002, secret));
        request.setPayload(("{\"messageId\":\"" + messageId + "\",\"occurredAt\":\"" + occurredAt
                + "\",\"payload\":{\"temperature\":31.5}}")
                .getBytes(StandardCharsets.UTF_8));
        try {
            CoapResponse response = client.advanced(request);
            if (response == null || response.getCode() != CoAP.ResponseCode.CHANGED
                    || !response.getResponseText().contains(messageId)) {
                throw new IllegalStateException("CoAP device report was not accepted");
            }
            System.out.println("CoAP DTLS 1.2 2.04 Changed acceptance passed");
        } finally {
            endpoint.destroy();
            client.shutdown();
        }
    }
}
