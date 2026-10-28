package com.jagonzn.service.extension.jt808.protocol;

import static org.junit.jupiter.api.Assertions.*;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class Jt808Sm4FrameCodecTests {
    // 由独立OpenSSL 3.6.4的sm4-cbc/nopad生成；只使用公开合成测试密钥和零IV。
    private static final String UPLINK = "7e0102000600000000000000017d027d0186eb863e8abac0836873ca96f2cb95d0e27e";
    private static final String DOWNLINK = "7e8500040200000000000000017d027d018577c6edef40d19975f12dad55cdd741807e";
    private static byte[] hex(String s) { return HexFormat.of().parseHex(s); }
    private static Jt808DeviceProfile profile(Jt808DeviceProfile.BodyProtection protection) {
        return new Jt808DeviceProfile(Jt808DeviceProfile.Model.DM08_V_A, protection);
    }
    private static Jt808Sm4Cipher cipher() {
        return new Jt808Sm4Cipher(Jt808Sm4CipherTests.key(), new byte[16]);
    }

    @Test void encodesIndependentDownlinkVectorUsingPlainChecksumAndBit10() {
        try (var cipher = cipher()) {
            var codec = new Jt808Sm4FrameCodec(profile(Jt808DeviceProfile.BodyProtection.SM4_CBC), cipher);
            var message = new Jt808Frame(0x8500, "0000000000000001", 0x7e7d, Optional.empty(), hex("0100"));
            assertArrayEquals(hex(DOWNLINK), codec.encodeDownlink(message));
        }
    }

    @Test void decodesIndependentUplinkWithZeroEncryptionBitsAndCipherPrefixChecksum() {
        try (var cipher = cipher()) {
            var codec = new Jt808Sm4FrameCodec(profile(Jt808DeviceProfile.BodyProtection.SM4_CBC), cipher);
            var message = codec.decodeUplink(hex(UPLINK));
            assertEquals(0x0102, message.messageId()); assertEquals(0x7e7d, message.serial());
            assertEquals("0000000000000001", message.terminalId());
            assertArrayEquals("ABCDEF".getBytes(java.nio.charset.StandardCharsets.US_ASCII), message.body());
        }
    }

    @Test void rejectsChecksumThatIncorrectlyIncludesCipherPadding() {
        byte[] raw = Jt808FrameCodec.unwrap(hex(UPLINK)); byte original = raw[raw.length - 1];
        raw[raw.length - 1] = xor(raw, raw.length - 1);
        assertNotEquals(original, raw[raw.length - 1]);
        rejected(Jt808FrameCodec.wrap(raw), Jt808ProtocolException.Reason.CHECKSUM);
    }

    @Test void rejectsCipherTamperingEvenOutsideTheWeakChecksumPrefixThroughPaddingValidation() {
        byte[] raw = Jt808FrameCodec.unwrap(hex(UPLINK)); raw[24] ^= 1;
        rejected(Jt808FrameCodec.wrap(raw), Jt808ProtocolException.Reason.ENCRYPTION);
    }

    @Test void rejectsTruncatedCiphertextAndFlaggedUplink() {
        byte[] raw = Jt808FrameCodec.unwrap(hex(UPLINK)); byte[] shortRaw = Arrays.copyOf(raw, raw.length - 1);
        shortRaw[shortRaw.length - 1] = raw[raw.length - 1];
        rejected(Jt808FrameCodec.wrap(shortRaw), Jt808ProtocolException.Reason.LENGTH);
        raw[2] |= 4;
        rejected(Jt808FrameCodec.wrap(raw), Jt808ProtocolException.Reason.ENCRYPTION);
    }

    @Test void missingOrPlainProtectionCannotSelectTheSm4Path() {
        try (var cipher = cipher()) {
            assertThrows(Jt808ProtocolException.class, () -> new Jt808Sm4FrameCodec(profile(Jt808DeviceProfile.BodyProtection.UNCONFIRMED), cipher));
            assertThrows(Jt808ProtocolException.class, () -> new Jt808Sm4FrameCodec(profile(Jt808DeviceProfile.BodyProtection.PLAIN), cipher));
        }
    }

    @Test void acceptsZeroLengthHeartbeatWithoutInventingAnExtraBlock() {
        try (var cipher = cipher()) {
            var codec = new Jt808Sm4FrameCodec(profile(Jt808DeviceProfile.BodyProtection.SM4_CBC), cipher);
            var message = codec.decodeUplink(hex("7e0002000000000000000000017d027d01007e"));
            assertEquals(2, message.messageId()); assertEquals(0, message.body().length);
        }
    }

    @Test void preservesLogicalLengthWhileTransmitting1024CipherBytes() {
        try (var cipher = cipher()) {
            var codec = new Jt808Sm4FrameCodec(profile(Jt808DeviceProfile.BodyProtection.SM4_CBC), cipher);
            byte[] wire = codec.encodeDownlink(new Jt808Frame(0x0200, "0000000000000001", 0,
                    Optional.of(new Jt808Fragment(2, 1)), new byte[1023]));
            byte[] raw = Jt808FrameCodec.unwrap(wire);
            assertEquals(18 + 1024 + 1, raw.length);
            assertEquals(0x27, raw[2] & 0xff); assertEquals(0xff, raw[3] & 0xff);
            assertTrue(wire.length <= Jt808FrameCodec.MAX_WIRE_BYTES);
            assertArrayEquals(wire, new Jt808FrameReader().accept(wire).getFirst());
        }
    }

    @Test void decryptedMessageStillPassesTheSameStrictBcdValidation() {
        byte[] raw = Jt808FrameCodec.unwrap(hex(UPLINK)); raw[11] = 0x0a;
        raw[raw.length - 1] = xor(raw, 14 + 6);
        rejected(Jt808FrameCodec.wrap(raw), Jt808ProtocolException.Reason.TERMINAL_ID);
    }

    private static byte xor(byte[] raw, int end) {
        int result = 0; for (int i = 0; i < end; i++) result ^= raw[i] & 0xff; return (byte) result;
    }
    private static void rejected(byte[] wire, Jt808ProtocolException.Reason reason) {
        try (var cipher = cipher()) {
            var codec = new Jt808Sm4FrameCodec(profile(Jt808DeviceProfile.BodyProtection.SM4_CBC), cipher);
            var failure = assertThrows(Jt808ProtocolException.class, () -> codec.decodeUplink(wire));
            assertEquals(reason, failure.reason());
        }
    }
}
