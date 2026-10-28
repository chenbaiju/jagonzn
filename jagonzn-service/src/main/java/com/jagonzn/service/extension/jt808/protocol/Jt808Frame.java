package com.jagonzn.service.extension.jt808.protocol;

import java.util.Objects;
import java.util.Optional;

/**
 * 简工十四字节基础头对应的明文消息；保留十六位终端标识，不擅自裁剪前导零。
 * @param messageId 消息标识，无符号双字节
 * @param terminalId 八字节BCD对应的十六位十进制字符串
 * @param serial 消息流水号，无符号双字节
 * @param fragment 可选分包头
 * @param body 有效明文消息体
 */
public record Jt808Frame(int messageId, String terminalId, int serial,
                         Optional<Jt808Fragment> fragment, byte[] body) {
    /** 消息体属性的低十位最多表达1023，不能将1024截断为零。 */
    public static final int MAX_BODY_BYTES = 0x3ff;

    public Jt808Frame {
        if (messageId < 0 || messageId > 0xffff || serial < 0 || serial > 0xffff) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.HEADER);
        }
        if (terminalId == null || !terminalId.matches("[0-9]{16}")) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.TERMINAL_ID);
        }
        Objects.requireNonNull(fragment, "分包选项不能为空");
        Objects.requireNonNull(body, "消息体不能为空");
        if (body.length > MAX_BODY_BYTES) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.LENGTH);
        }
        body = body.clone();
    }

    /** @return 防止调用方修改已解析内容的消息体副本 */
    @Override public byte[] body() { return body.clone(); }

    /**
     * 将十五位IMEI前补零；已有十六位协议标识保持原样。
     * @param imei 厂家提供的十五位IMEI或十六位协议标识
     * @return 严格十六位的协议标识
     */
    public static String terminalIdForImei(String imei) {
        if (imei == null || !imei.matches("[0-9]{15,16}")) {
            throw new Jt808ProtocolException(Jt808ProtocolException.Reason.TERMINAL_ID);
        }
        return imei.length() == 15 ? "0" + imei : imei;
    }
}
