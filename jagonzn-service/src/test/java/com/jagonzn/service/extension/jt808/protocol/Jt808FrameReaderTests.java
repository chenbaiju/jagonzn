package com.jagonzn.service.extension.jt808.protocol;

import static org.junit.jupiter.api.Assertions.*;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;

class Jt808FrameReaderTests {
    private static final byte[] FRAME = HexFormat.of().parseHex("7e02000002000000000000000100007d027d01027e");

    @Test void handlesEveryReadBoundaryIncludingInsideEscapePairs() {
        for (int split = 0; split <= FRAME.length; split++) {
            var reader = new Jt808FrameReader(); var frames = new ArrayList<byte[]>();
            frames.addAll(reader.accept(Arrays.copyOfRange(FRAME, 0, split)));
            frames.addAll(reader.accept(Arrays.copyOfRange(FRAME, split, FRAME.length)));
            assertEquals(1, frames.size(), "split=" + split);
            assertArrayEquals(FRAME, frames.getFirst());
        }
    }

    @Test void supportsStickyFramesWithSeparateOrSharedFlag() {
        for (boolean shared : new boolean[]{false, true}) {
            var input = new ByteArrayOutputStream(); input.writeBytes(FRAME);
            input.writeBytes(Arrays.copyOfRange(FRAME, shared ? 1 : 0, FRAME.length));
            var result = new Jt808FrameReader().accept(input.toByteArray());
            assertEquals(2, result.size());
            assertArrayEquals(FRAME, result.get(0)); assertArrayEquals(FRAME, result.get(1));
        }
    }

    @Test void ignoresNoiseAndEmptyFlagPairsWithoutPublishingPartialFrames() {
        var reader = new Jt808FrameReader();
        assertTrue(reader.accept(new byte[]{0, 1, 0x7d, 0x7e, 0x7e}).isEmpty());
        assertTrue(reader.accept(Arrays.copyOfRange(FRAME, 1, 6)).isEmpty());
        var result = reader.accept(Arrays.copyOfRange(FRAME, 6, FRAME.length));
        assertEquals(1, result.size()); assertArrayEquals(FRAME, result.getFirst());
    }

    @Test void oversizedUnterminatedFrameIsRejectedAndBufferDoesNotRemainPoisoned() {
        var reader = new Jt808FrameReader(); byte[] excessive = new byte[Jt808FrameCodec.MAX_WIRE_BYTES + 1];
        Arrays.fill(excessive, (byte) 1); excessive[0] = 0x7e;
        var failure = assertThrows(Jt808ProtocolException.class, () -> reader.accept(excessive));
        assertEquals(Jt808ProtocolException.Reason.LENGTH, failure.reason());
        assertArrayEquals(FRAME, reader.accept(FRAME).getFirst());
    }

    @Test void partialByteReadsProduceOneOwnedFrameCopy() {
        var reader = new Jt808FrameReader(); var result = new ArrayList<byte[]>();
        for (byte b : FRAME) result.addAll(reader.accept(new byte[]{b}));
        assertEquals(1, result.size());
        reader.accept(FRAME);
        assertArrayEquals(FRAME, result.getFirst());
    }
}
