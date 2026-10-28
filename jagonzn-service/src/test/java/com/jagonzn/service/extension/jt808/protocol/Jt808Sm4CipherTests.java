package com.jagonzn.service.extension.jt808.protocol;

import static org.junit.jupiter.api.Assertions.*;
import java.security.Security;
import java.util.Arrays;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class Jt808Sm4CipherTests {
    static byte[] hex(String s) { return HexFormat.of().parseHex(s); }
    static byte[] key() { return hex("0123456789abcdeffedcba9876543210"); }

    @Test void matchesPublishedSm4VectorForFirstCbcBlockWithZeroIv() {
        // BC官方SM4Test采用的公开向量；零IV下CBC首块等于该标准分组向量。
        try (var cipher = new Jt808Sm4Cipher(key(), new byte[16])) {
            byte[] expected = hex("681edf34d206965e86b3e94f536e4246");
            assertArrayEquals(expected, cipher.encryptZeroPadded(key()));
            assertArrayEquals(key(), cipher.decryptZeroPadded(expected, 16));
        }
    }

    @Test void zeroPaddingKeepsEffectiveLengthIncludingEmptyAndMaximumBody() {
        try (var cipher = new Jt808Sm4Cipher(key(), new byte[16])) {
            for (int length : new int[]{0, 1, 15, 16, 17, 1023}) {
                byte[] body = new byte[length]; Arrays.fill(body, (byte) 0x41);
                byte[] encrypted = cipher.encryptZeroPadded(body);
                assertEquals((length + 15) / 16 * 16, encrypted.length);
                assertArrayEquals(body, cipher.decryptZeroPadded(encrypted, length));
            }
        }
    }

    @Test void rejectsNonZeroPaddingInsteadOfTrimmingArbitraryDecryptedBytes() {
        try (var cipher = new Jt808Sm4Cipher(key(), new byte[16])) {
            var failure = assertThrows(Jt808ProtocolException.class,
                    () -> cipher.decryptZeroPadded(hex("681edf34d206965e86b3e94f536e4246"), 3));
            assertEquals(Jt808ProtocolException.Reason.ENCRYPTION, failure.reason());
        }
    }

    @Test void rejectsInvalidKeyIvAndCipherLengths() {
        assertThrows(Jt808ProtocolException.class, () -> new Jt808Sm4Cipher(new byte[15], new byte[16]));
        assertThrows(Jt808ProtocolException.class, () -> new Jt808Sm4Cipher(key(), new byte[17]));
        try (var cipher = new Jt808Sm4Cipher(key(), new byte[16])) {
            assertThrows(Jt808ProtocolException.class, () -> cipher.encryptZeroPadded(new byte[1024]));
            assertThrows(Jt808ProtocolException.class, () -> cipher.decryptZeroPadded(new byte[15], 3));
            assertThrows(Jt808ProtocolException.class, () -> cipher.decryptZeroPadded(new byte[32], 3));
            assertThrows(Jt808ProtocolException.class, () -> cipher.decryptZeroPadded(new byte[16], -1));
        }
    }

    @Test void ownsKeyCopiesAndClosePreventsReuse() {
        byte[] inputKey = key(), inputIv = new byte[16];
        var cipher = new Jt808Sm4Cipher(inputKey, inputIv);
        Arrays.fill(inputKey, (byte) 9); Arrays.fill(inputIv, (byte) 9);
        assertArrayEquals(hex("681edf34d206965e86b3e94f536e4246"), cipher.encryptZeroPadded(key()));
        cipher.close(); cipher.close();
        assertThrows(Jt808ProtocolException.class, () -> cipher.encryptZeroPadded(new byte[0]));
        assertThrows(Jt808ProtocolException.class, () -> cipher.decryptZeroPadded(new byte[0], 0));
        assertEquals(9, inputKey[0]);
    }

    @Test void leavesPlatformGlobalProviderRegistryUnchanged() {
        var before = Arrays.stream(Security.getProviders()).map(p -> p.getName()).toList();
        try (var cipher = new Jt808Sm4Cipher(key(), new byte[16])) { cipher.encryptZeroPadded(key()); }
        assertEquals(before, Arrays.stream(Security.getProviders()).map(p -> p.getName()).toList());
    }
}
