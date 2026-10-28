package com.jagonzn.service.extension.jt808.protocol;

/** 协议拒绝只暴露分类，不携带原始报文、IMEI或鉴权材料。 */
public final class Jt808ProtocolException extends IllegalArgumentException {
    /** 可由接入层分类统计的拒绝原因。 */
    public enum Reason { LENGTH, HEADER, TERMINAL_ID, ESCAPE, CHECKSUM, ENCRYPTION, PROFILE }

    private final Reason reason;

    /** @param reason 已确定的拒绝分类 */
    public Jt808ProtocolException(Reason reason) {
        super("JT808报文不符合约定：" + reason);
        this.reason = reason;
    }

    /** @return 不含设备内容的拒绝分类 */
    public Reason reason() { return reason; }
}
