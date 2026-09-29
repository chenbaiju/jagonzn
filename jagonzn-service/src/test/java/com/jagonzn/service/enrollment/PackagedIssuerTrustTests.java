package com.jagonzn.service.enrollment;

import com.things.cloud.entitlement.GrantV1;
import com.things.cloud.entitlement.application.ApprovedSelfHostedRevision;
import com.things.cloud.entitlement.application.GrantV1Verification;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 用临时测试密钥验证发行物公钥锚解析，不将测试公钥写入正常资源。 */
class PackagedIssuerTrustTests {
    @Test
    void fixedPublicAnchorVerifiesOriginalGrantAndRejectsMutableOrMalformedAnchors() throws Exception {
        assertThatThrownBy(PackagedIssuerTrust::load)
                .isInstanceOf(GeneralSecurityException.class).hasMessageContaining("缺少");
        var signer = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();
        byte[] spki = signer.getPublic().getEncoded();
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(spki);
        String keyId = "thingscloud.v1." + HexFormat.of().formatHex(digest, 0, 8);
        String resource = "issuerId=thingscloud\n"
                + "keyId=" + keyId + "\n"
                + "publicKeySha256=" + HexFormat.of().formatHex(digest) + "\n"
                + "publicKeySpkiBase64=" + Base64.getEncoder().encodeToString(spki) + "\n";
        var trusted = PackagedIssuerTrust.parse(bytes(resource));
        var approved = ApprovedSelfHostedRevision.loadApproved();
        UUID deployment = UUID.randomUUID(), tenant = UUID.randomUUID();
        Instant start = Instant.now();
        var plan = approved.tier("STANDARD");
        byte[] envelope = new GrantV1("thingscloud", UUID.randomUUID(), deployment, tenant,
                "STANDARD", approved.revisionId(), approved.sha256(), 1, start, start,
                start.atOffset(ZoneOffset.UTC).plusYears(1).toInstant(), keyId,
                plan.quotas(), plan.capabilities()).sign(signer.getPrivate());
        assertThat(GrantV1Verification.verify(envelope, trusted.keys(), trusted.issuerId(),
                deployment, tenant).tier()).isEqualTo("STANDARD");
        assertThatThrownBy(() -> GrantV1Verification.verify(envelope, trusted.keys(),
                trusted.issuerId(), UUID.randomUUID(), tenant))
                .isInstanceOf(GeneralSecurityException.class);

        assertThatThrownBy(() -> PackagedIssuerTrust.parse(bytes(
                resource.replace("issuerId=thingscloud", "issuerId=attacker"))))
                .isInstanceOf(GeneralSecurityException.class);
        String hex = HexFormat.of().formatHex(digest);
        String changedHex = (hex.charAt(0) == '0' ? "1" : "0") + hex.substring(1);
        assertThatThrownBy(() -> PackagedIssuerTrust.parse(bytes(
                resource.replace(hex, changedHex))))
                .isInstanceOf(GeneralSecurityException.class);
        assertThatThrownBy(() -> PackagedIssuerTrust.parse(bytes(resource + "keyId=other\n")))
                .isInstanceOf(GeneralSecurityException.class);
        assertThatThrownBy(() -> PackagedIssuerTrust.parse(bytes(resource.replace("\n", "\r\n"))))
                .isInstanceOf(GeneralSecurityException.class);
    }

    private static ByteArrayInputStream bytes(String value) {
        return new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8));
    }
}
