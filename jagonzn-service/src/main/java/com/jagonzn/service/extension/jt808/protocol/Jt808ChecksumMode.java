package com.jagonzn.service.extension.jt808.protocol;

/** 校验范围必须由已确认的设备配置指定，不能试错后自动降级。 */
public enum Jt808ChecksumMode {
    /** GS04H、GS04G、DM08-VA及DM08-VI的消息头起算模式。 */
    HEADER_AND_BODY(0),
    /** DM08-IV(A/B)额外包含起始标识位的模式。 */
    START_FLAG_HEADER_AND_BODY(0x7e);

    private final int initialValue;

    Jt808ChecksumMode(int initialValue) { this.initialValue = initialValue; }

    /** @return 厂家文档规定的异或初始值 */
    int initialValue() { return initialValue; }
}
