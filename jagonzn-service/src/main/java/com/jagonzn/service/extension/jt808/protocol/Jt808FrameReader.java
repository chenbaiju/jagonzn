package com.jagonzn.service.extension.jt808.protocol;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

/** 每连接独占的有界拆帧器；仅切分标识位，不验证或接受设备身份。 */
public final class Jt808FrameReader {
    private final byte[] buffer = new byte[Jt808FrameCodec.MAX_WIRE_BYTES];
    private int length;

    /**
     * 接收一次TCP读取，可返回零个或多个完整帧。
     * @param chunk 当前读取到的字节
     * @return 独立副本；超长时清空当前帧并拒绝，由调用层关闭坏连接
     */
    public List<byte[]> accept(byte[] chunk) {
        Objects.requireNonNull(chunk);
        List<byte[]> frames = new ArrayList<>();
        for (byte value : chunk) {
            if (value == 0x7e) {
                if (length > 1) {
                    buffer[length++] = value;
                    frames.add(Arrays.copyOf(buffer, length));
                }
                buffer[0] = 0x7e; length = 1;
            } else if (length != 0) {
                if (length >= buffer.length - 1) {
                    length = 0;
                    throw new Jt808ProtocolException(Jt808ProtocolException.Reason.LENGTH);
                }
                buffer[length++] = value;
            }
        }
        return frames;
    }
}
