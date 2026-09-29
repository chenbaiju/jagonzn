package com.jagonzn.service.enrollment;

import com.things.cloud.project.application.SelfHostedGrantImportService;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.spec.X509EncodedKeySpec;
import java.util.Arrays;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;

/**
 * 客户发行物内固定的 ThingsCloud 公钥锚。不能从授权文件、数据库或可改写的部署配置取得。
 * 正式公钥尚未产生时，启用签名授权模式必须拒绝启动。
 */
public final class PackagedIssuerTrust {
    static final String RESOURCE = "/jagonzn/self-hosted-issuer-trust-v1.txt";
    private static final String ISSUER = "thingscloud";

    private PackagedIssuerTrust() { }

    public static SelfHostedGrantImportService.TrustedIssuer load() throws Exception {
        try (InputStream input = PackagedIssuerTrust.class.getResourceAsStream(RESOURCE)) {
            if (input == null) {
                throw new GeneralSecurityException("固定发行物缺少受控发行方公钥");
            }
            return parse(input);
        }
    }

    static SelfHostedGrantImportService.TrustedIssuer parse(InputStream input) throws Exception {
        if (input == null) throw new GeneralSecurityException("发行方公钥资源缺失");
        byte[] bytes = input.readNBytes(513);
        if (bytes.length > 512) throw new GeneralSecurityException("发行方公钥资源过长");
        String value = new String(bytes, StandardCharsets.US_ASCII);
        if (!Arrays.equals(bytes, value.getBytes(StandardCharsets.US_ASCII))) {
            throw new GeneralSecurityException("发行方公钥资源编码无效");
        }
        String[] lines = value.split("\n", -1);
        if (lines.length != 5 || !lines[4].isEmpty()
                || !lines[0].equals("issuerId=" + ISSUER)
                || !lines[1].matches("keyId=thingscloud\\.v1\\.[0-9a-f]{16}")
                || !lines[2].matches("publicKeySha256=[0-9a-f]{64}")
                || !lines[3].matches("publicKeySpkiBase64=[A-Za-z0-9+/]+={0,2}")) {
            throw new GeneralSecurityException("发行方公钥资源字段或规范格式无效");
        }
        String keyId = lines[1].substring("keyId=".length());
        byte[] expectedDigest = HexFormat.of().parseHex(lines[2].substring("publicKeySha256=".length()));
        String encoded = lines[3].substring("publicKeySpkiBase64=".length());
        byte[] spki;
        try {
            spki = Base64.getDecoder().decode(encoded);
        } catch (IllegalArgumentException invalid) {
            throw new GeneralSecurityException("发行方公钥编码无效", invalid);
        }
        if (spki.length != 44 || !Base64.getEncoder().encodeToString(spki).equals(encoded)) {
            throw new GeneralSecurityException("发行方公钥编码非规范形式");
        }
        PublicKey key = KeyFactory.getInstance("Ed25519")
                .generatePublic(new X509EncodedKeySpec(spki));
        byte[] actualDigest = MessageDigest.getInstance("SHA-256").digest(spki);
        if (!Arrays.equals(key.getEncoded(), spki)
                || !MessageDigest.isEqual(expectedDigest, actualDigest)
                || !keyId.equals("thingscloud.v1." + HexFormat.of().formatHex(actualDigest, 0, 8))) {
            throw new GeneralSecurityException("发行方公钥身份或摘要不一致");
        }
        return new SelfHostedGrantImportService.TrustedIssuer(ISSUER, Map.of(keyId, key));
    }
}
