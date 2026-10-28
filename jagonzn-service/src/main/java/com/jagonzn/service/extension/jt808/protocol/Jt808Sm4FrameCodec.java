package com.jagonzn.service.extension.jt808.protocol;

import java.util.Arrays;
import java.util.Objects;

/** DM08-V(A)国密分支：下行按有效明文、上行按有效密文计算校验，不含零补齐尾部。 */
public final class Jt808Sm4FrameCodec {
    private final Jt808Sm4Cipher cipher;

    /** @param profile 已确认的国密设备配置 @param cipher 从私有配置取得的密码实例 */
    public Jt808Sm4FrameCodec(Jt808DeviceProfile profile, Jt808Sm4Cipher cipher) {
        if (profile == null || profile.model() != Jt808DeviceProfile.Model.DM08_V_A
                || profile.protection() != Jt808DeviceProfile.BodyProtection.SM4_CBC) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.PROFILE);
        }
        this.cipher = Objects.requireNonNull(cipher);
    }

    /** @param message 有效明文消息 @return 设置bit10、按明文校验并加密转义后的下行帧 */
    public byte[] encodeDownlink(Jt808Frame message) {
        byte[] plain = Jt808FrameCodec.unwrap(Jt808FrameCodec.encode(message, Jt808ChecksumMode.HEADER_AND_BODY));
        int headerLength = message.fragment().isPresent() ? 18 : 14;
        plain[2] |= 4;
        byte checksum = checksum(plain, plain.length - 1);
        byte[] encrypted = cipher.encryptZeroPadded(message.body());
        byte[] raw = Arrays.copyOf(plain, headerLength + encrypted.length + 1);
        System.arraycopy(encrypted, 0, raw, headerLength, encrypted.length);
        raw[raw.length - 1] = checksum;
        return Jt808FrameCodec.wrap(raw);
    }

    /** @param wire 厂家上行帧，加密位按文档保持零 @return 解密且精确校验后的有效消息 */
    public Jt808Frame decodeUplink(byte[] wire) {
        byte[] raw = Jt808FrameCodec.unwrap(wire);
        int properties = (raw[2] & 0xff) << 8 | raw[3] & 0xff;
        if ((properties & 0xc000) != 0) throw new Jt808ProtocolException(Jt808ProtocolException.Reason.HEADER);
        if ((properties & 0x1c00) != 0) throw new Jt808ProtocolException(Jt808ProtocolException.Reason.ENCRYPTION);
        int length = properties & 0x3ff;
        int headerLength = (properties & 0x2000) == 0 ? 14 : 18;
        int encryptedLength = Jt808Sm4Cipher.paddedLength(length);
        if (raw.length != headerLength + encryptedLength + 1) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.LENGTH);
        }
        if (checksum(raw, headerLength + length) != raw[raw.length - 1]) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.CHECKSUM);
        }
        byte[] clear = cipher.decryptZeroPadded(Arrays.copyOfRange(raw, headerLength, raw.length - 1), length);
        byte[] plain = Arrays.copyOf(raw, headerLength + length + 1);
        System.arraycopy(clear, 0, plain, headerLength, length);
        plain[plain.length - 1] = checksum(plain, plain.length - 1);
        return Jt808FrameCodec.decode(Jt808FrameCodec.wrap(plain), Jt808ChecksumMode.HEADER_AND_BODY);
    }

    private static byte checksum(byte[] input, int end) {
        int result = 0;
        for (int index = 0; index < end; index++) result ^= input[index] & 0xff;
        return (byte) result;
    }
}
