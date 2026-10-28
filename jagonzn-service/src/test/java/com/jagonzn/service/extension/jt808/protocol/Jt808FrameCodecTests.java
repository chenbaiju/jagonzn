package com.jagonzn.service.extension.jt808.protocol;

import static org.junit.jupiter.api.Assertions.*;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class Jt808FrameCodecTests {
    private static final String TERMINAL = "0000000000000001";
    private static final String HEARTBEAT = "7e0002000000000000000000010000037e";
    private static byte[] hex(String value) { return HexFormat.of().parseHex(value); }
    private static Jt808Frame frame(int id, byte[] body) {
        return new Jt808Frame(id, TERMINAL, 0, Optional.empty(), body);
    }

    @Test void readsIndependentFourteenByteHeaderVector() {
        var result = Jt808FrameCodec.decode(hex(HEARTBEAT), Jt808ChecksumMode.HEADER_AND_BODY);
        assertEquals(0x0002, result.messageId());
        assertEquals(TERMINAL, result.terminalId());
        assertEquals(0, result.serial());
        assertTrue(result.fragment().isEmpty());
        assertArrayEquals(new byte[0], result.body());
        assertArrayEquals(hex(HEARTBEAT), Jt808FrameCodec.encode(frame(2, new byte[0]), Jt808ChecksumMode.HEADER_AND_BODY));
    }

    @Test void flagIncludedChecksumIsExplicitAndEscaped() {
        byte[] wire = hex("7e00020000000000000000000100007d017e");
        assertArrayEquals(wire, Jt808FrameCodec.encode(frame(2, new byte[0]), Jt808ChecksumMode.START_FLAG_HEADER_AND_BODY));
        assertEquals(2, Jt808FrameCodec.decode(wire, Jt808ChecksumMode.START_FLAG_HEADER_AND_BODY).messageId());
        rejected(wire, Jt808ProtocolException.Reason.CHECKSUM);
    }

    @Test void escapesBodyBytesAfterComputingChecksum() {
        byte[] wire = hex("7e02000002000000000000000100007d027d01027e");
        assertArrayEquals(wire, Jt808FrameCodec.encode(frame(0x0200, hex("7e7d")), Jt808ChecksumMode.HEADER_AND_BODY));
        assertArrayEquals(hex("7e7d"), Jt808FrameCodec.decode(wire, Jt808ChecksumMode.HEADER_AND_BODY).body());
    }

    @Test void readsFragmentFieldsAndUnsignedSerialFromIndependentVector() {
        byte[] wire = hex("7e000220000000000000000001ffff00020001207e");
        var result = Jt808FrameCodec.decode(wire, Jt808ChecksumMode.HEADER_AND_BODY);
        assertEquals(0xffff, result.serial());
        assertEquals(new Jt808Fragment(2, 1), result.fragment().orElseThrow());
        assertArrayEquals(wire, Jt808FrameCodec.encode(result, Jt808ChecksumMode.HEADER_AND_BODY));
    }

    @ParameterizedTest
    @CsvSource({
        "7e0002000100000000000000010000027e,LENGTH",
        "7e00020000000000000000000a0000087e,TERMINAL_ID",
        "7e0002040000000000000000010000077e,ENCRYPTION",
        "7e0002400000000000000000010000437e,HEADER",
        "7e0002000000000000000000010000047e,CHECKSUM",
        "7e000220000000000000000001ffff00000001227e,HEADER"
    })
    void rejectsMalformedFramesWithValidlyConstructedHeaders(String wire, Jt808ProtocolException.Reason reason) {
        rejected(hex(wire), reason);
    }

    @Test void rejectsUnknownDanglingAndUnescapedControlBytes() {
        byte[] invalid = hex(HEARTBEAT); invalid[5] = 0x7d; invalid[6] = 3;
        rejected(invalid, Jt808ProtocolException.Reason.ESCAPE);
        invalid = hex(HEARTBEAT); invalid[invalid.length - 2] = 0x7d;
        rejected(invalid, Jt808ProtocolException.Reason.ESCAPE);
        invalid = hex(HEARTBEAT); invalid[5] = 0x7e;
        rejected(invalid, Jt808ProtocolException.Reason.ESCAPE);
    }

    @Test void requiresBothFlagsAndMinimumLength() {
        rejected(new byte[0], Jt808ProtocolException.Reason.LENGTH);
        byte[] wire = hex(HEARTBEAT); wire[0] = 0;
        rejected(wire, Jt808ProtocolException.Reason.LENGTH);
        wire = hex(HEARTBEAT); wire[wire.length - 1] = 0;
        rejected(wire, Jt808ProtocolException.Reason.LENGTH);
        rejected(Arrays.copyOf(hex(HEARTBEAT), 16), Jt808ProtocolException.Reason.LENGTH);
    }

    @Test void preservesAllPossibleBodyByteValues() {
        byte[] body = new byte[256];
        for (int index = 0; index < body.length; index++) body[index] = (byte) index;
        byte[] wire = Jt808FrameCodec.encode(frame(0x8500, body), Jt808ChecksumMode.HEADER_AND_BODY);
        assertArrayEquals(body, Jt808FrameCodec.decode(wire, Jt808ChecksumMode.HEADER_AND_BODY).body());
    }

    @Test void lengthCannotWrapTheTenBitField() {
        byte[] body = new byte[1023]; Arrays.fill(body, (byte) 0x7e);
        byte[] wire = Jt808FrameCodec.encode(frame(0x0200, body), Jt808ChecksumMode.HEADER_AND_BODY);
        assertTrue(wire.length <= Jt808FrameCodec.MAX_WIRE_BYTES);
        assertArrayEquals(body, Jt808FrameCodec.decode(wire, Jt808ChecksumMode.HEADER_AND_BODY).body());
        assertThrows(Jt808ProtocolException.class, () -> frame(0x0200, new byte[1024]));
    }

    @Test void messageBodyHasDefensiveCopies() {
        byte[] body = {1, 2}; var value = frame(0x8500, body); body[0] = 9;
        byte[] read = value.body(); read[1] = 9;
        assertArrayEquals(new byte[]{1, 2}, value.body());
    }

    @Test void terminalAndUnsignedHeaderFieldsAreValidated() {
        assertEquals("0864162044012501", Jt808Frame.terminalIdForImei("864162044012501"));
        assertEquals("0864162044012501", Jt808Frame.terminalIdForImei("0864162044012501"));
        assertThrows(Jt808ProtocolException.class, () -> Jt808Frame.terminalIdForImei("123"));
        assertThrows(Jt808ProtocolException.class, () -> new Jt808Frame(-1, TERMINAL, 0, Optional.empty(), new byte[0]));
        assertThrows(Jt808ProtocolException.class, () -> new Jt808Frame(2, TERMINAL, 65536, Optional.empty(), new byte[0]));
        assertThrows(Jt808ProtocolException.class, () -> new Jt808Fragment(2, 3));
    }

    private static void rejected(byte[] wire, Jt808ProtocolException.Reason reason) {
        var failure = assertThrows(Jt808ProtocolException.class,
                () -> Jt808FrameCodec.decode(wire, Jt808ChecksumMode.HEADER_AND_BODY));
        assertEquals(reason, failure.reason());
        assertFalse(failure.getMessage().contains(TERMINAL));
    }
}
