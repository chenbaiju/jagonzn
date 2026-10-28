package com.jagonzn.service.extension.jt808.protocol;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;
import java.util.Objects;
import java.util.Optional;

/** 简工JT808明文编解码；SM4设备须经独立密码配置路径处理，不能以本类自动探测。 */
public final class Jt808FrameCodec {
    /** 包含最大分包头、SM4补齐至1024字节、校验及最坏转义膨胀的有限上界。 */
    public static final int MAX_WIRE_BYTES = 2 * (18 + 1024 + 1) + 2;

    private Jt808FrameCodec() { }

    /**
     * 按厂家指定范围计算校验后转义。
     * @param frame 明文消息
     * @param mode 已确认的型号校验范围
     * @return 包含首尾标识位的完整线上帧
     */
    public static byte[] encode(Jt808Frame frame, Jt808ChecksumMode mode) {
        Objects.requireNonNull(frame); Objects.requireNonNull(mode);
        byte[] body = frame.body();
        var raw = ByteBuffer.allocate((frame.fragment().isPresent() ? 18 : 14) + body.length + 1)
                .order(ByteOrder.BIG_ENDIAN);
        raw.putShort((short) frame.messageId());
        raw.putShort((short) (body.length | (frame.fragment().isPresent() ? 0x2000 : 0)));
        for (int index = 0; index < 16; index += 2) {
            raw.put((byte) ((frame.terminalId().charAt(index) - '0') * 16
                    + frame.terminalId().charAt(index + 1) - '0'));
        }
        raw.putShort((short) frame.serial());
        frame.fragment().ifPresent(part -> raw.putShort((short) part.total()).putShort((short) part.index()));
        raw.put(body);
        int checksum = mode.initialValue();
        for (int index = 0; index < raw.position(); index++) checksum ^= raw.array()[index] & 0xff;
        raw.put((byte) checksum);
        return wrap(raw.array());
    }

    /** 同包密码分支复用转义，输入包含校验但不包含首尾标识。 */
    static byte[] wrap(byte[] raw) {
        if (raw.length > (MAX_WIRE_BYTES - 2) / 2) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.LENGTH);
        }
        var wire = new ByteArrayOutputStream(raw.length * 2 + 2);
        wire.write(0x7e);
        for (byte value : raw) {
            int unsigned = value & 0xff;
            if (unsigned == 0x7e || unsigned == 0x7d) {
                wire.write(0x7d); wire.write(unsigned == 0x7e ? 2 : 1);
            } else wire.write(unsigned);
        }
        wire.write(0x7e);
        return wire.toByteArray();
    }

    /**
     * 还原转义、验证校验与精确长度后读取十四字节基础头。
     * @param wire 单个完整明文线上帧
     * @param mode 显式指定的型号校验范围
     * @return 已验证的消息；分包只返回元数据，不冒充已重组
     */
    public static Jt808Frame decode(byte[] wire, Jt808ChecksumMode mode) {
        Objects.requireNonNull(mode);
        byte[] raw = unwrap(wire); int size = raw.length;
        int checksum = mode.initialValue();
        for (int index = 0; index < size - 1; index++) checksum ^= raw[index] & 0xff;
        if (checksum != (raw[size - 1] & 0xff)) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.CHECKSUM);
        }
        var header = ByteBuffer.wrap(raw, 0, size - 1).order(ByteOrder.BIG_ENDIAN);
        int messageId = Short.toUnsignedInt(header.getShort());
        int properties = Short.toUnsignedInt(header.getShort());
        if ((properties & 0xc000) != 0) throw new Jt808ProtocolException(Jt808ProtocolException.Reason.HEADER);
        if ((properties & 0x1c00) != 0) throw new Jt808ProtocolException(Jt808ProtocolException.Reason.ENCRYPTION);
        int headerBytes = (properties & 0x2000) == 0 ? 14 : 18;
        if (size != headerBytes + (properties & 0x3ff) + 1) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.LENGTH);
        }
        var terminalId = new StringBuilder(16);
        for (int index = 0; index < 8; index++) {
            int value = header.get() & 0xff, high = value >>> 4, low = value & 15;
            if (high > 9 || low > 9) throw new Jt808ProtocolException(Jt808ProtocolException.Reason.TERMINAL_ID);
            terminalId.append((char) ('0' + high)).append((char) ('0' + low));
        }
        int serial = Short.toUnsignedInt(header.getShort());
        Optional<Jt808Fragment> fragment = (properties & 0x2000) == 0 ? Optional.empty()
                : Optional.of(new Jt808Fragment(Short.toUnsignedInt(header.getShort()), Short.toUnsignedInt(header.getShort())));
        return new Jt808Frame(messageId, terminalId.toString(), serial, fragment,
                Arrays.copyOfRange(raw, headerBytes, size - 1));
    }

    /** 只还原线上边界与转义；校验和密码语义由对应分支完成。 */
    static byte[] unwrap(byte[] wire) {
        if (wire == null || wire.length < 17 || wire.length > MAX_WIRE_BYTES
                || wire[0] != 0x7e || wire[wire.length - 1] != 0x7e) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.LENGTH);
        }
        byte[] raw = new byte[wire.length - 2]; int size = 0;
        for (int index = 1; index < wire.length - 1; index++) {
            int value = wire[index] & 0xff;
            if (value == 0x7e) throw new Jt808ProtocolException(Jt808ProtocolException.Reason.ESCAPE);
            if (value == 0x7d) {
                if (++index >= wire.length - 1 || (wire[index] != 1 && wire[index] != 2)) {
                    throw new Jt808ProtocolException(Jt808ProtocolException.Reason.ESCAPE);
                }
                value = wire[index] == 1 ? 0x7d : 0x7e;
            }
            raw[size++] = (byte) value;
        }
        if (size < 15) throw new Jt808ProtocolException(Jt808ProtocolException.Reason.LENGTH);
        return Arrays.copyOf(raw, size);
    }
}
