package com.jagonzn.service.extension.jt808.protocol;

import java.security.GeneralSecurityException;
import java.security.Provider;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.bouncycastle.jce.provider.BouncyCastleProvider;

/** 厂家SM4/CBC及零补齐；提供者仅局部使用，不修改平台的全局密码提供者列表。 */
public final class Jt808Sm4Cipher implements AutoCloseable {
    private static final Provider PROVIDER = new BouncyCastleProvider();
    private final byte[] key;
    private final byte[] iv;
    private boolean closed;

    /** @param key 外部提供的十六字节密钥 @param iv 外部提供的十六字节初始向量 */
    public Jt808Sm4Cipher(byte[] key, byte[] iv) {
        if (key == null || key.length != 16 || iv == null || iv.length != 16) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.ENCRYPTION);
        }
        this.key = key.clone(); this.iv = iv.clone();
    }

    /** @param plain 有效明文消息体 @return 零补齐后的密文；空消息体不增加填充块 */
    public synchronized byte[] encryptZeroPadded(byte[] plain) {
        requireOpen();
        if (plain == null || plain.length > Jt808Frame.MAX_BODY_BYTES) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.LENGTH);
        }
        byte[] padded = Arrays.copyOf(plain, paddedLength(plain.length));
        try { return crypt(Cipher.ENCRYPT_MODE, padded); }
        finally { Arrays.fill(padded, (byte) 0); }
    }

    /** @param encrypted 完整密文消息体 @param effectiveLength 头中声明的有效长度 @return 校验零补齐后的有效明文 */
    public synchronized byte[] decryptZeroPadded(byte[] encrypted, int effectiveLength) {
        requireOpen();
        if (effectiveLength < 0 || effectiveLength > Jt808Frame.MAX_BODY_BYTES || encrypted == null
                || encrypted.length != paddedLength(effectiveLength)) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.LENGTH);
        }
        byte[] clear = crypt(Cipher.DECRYPT_MODE, encrypted);
        try {
            int invalid = 0;
            for (int index = effectiveLength; index < clear.length; index++) invalid |= clear[index];
            if (invalid != 0) throw new Jt808ProtocolException(Jt808ProtocolException.Reason.ENCRYPTION);
            return Arrays.copyOf(clear, effectiveLength);
        } finally { Arrays.fill(clear, (byte) 0); }
    }

    /** @param length 有效长度 @return 补齐到十六字节整数倍后的长度 */
    static int paddedLength(int length) { return (length + 15) / 16 * 16; }

    private byte[] crypt(int direction, byte[] input) {
        if (input.length == 0) return new byte[0];
        try {
            var cipher = Cipher.getInstance("SM4/CBC/NoPadding", PROVIDER);
            cipher.init(direction, new SecretKeySpec(key, "SM4"), new IvParameterSpec(iv));
            return cipher.doFinal(input);
        } catch (GeneralSecurityException error) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.ENCRYPTION);
        }
    }

    private void requireOpen() {
        if (closed) throw new Jt808ProtocolException(Jt808ProtocolException.Reason.ENCRYPTION);
    }

    /** 只清理本实例拥有的副本，不承诺JVM及密码库的全部临时副本即时擦除。 */
    @Override public synchronized void close() {
        closed = true; Arrays.fill(key, (byte) 0); Arrays.fill(iv, (byte) 0);
    }
}
