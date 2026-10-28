package com.jagonzn.service.extension.jt808.protocol;

import java.util.Locale;

/**
 * 已确认型号与显式消息体保护方式；不能从上行加密位为零推断普通版。
 * @param model 已支持的具体型号
 * @param protection 已核实或明确未确认的消息体保护方式
 */
public record Jt808DeviceProfile(Model model, BodyProtection protection) {
    /** 当前首台型号；其他型号不得静默采用同一门磁定义。 */
    public enum Model { DM08_V_A }
    /** 加密方式未知时保持拒绝；SM4实现属于后续独立差额。 */
    public enum BodyProtection { UNCONFIRMED, PLAIN, SM4_CBC }
    /** 这里仅表示厂家门磁位解释，不代替命令执行结果。 */
    public enum DoorState { OPEN, CLOSED }

    public Jt808DeviceProfile {
        if (model == null || protection == null) throw new Jt808ProtocolException(Jt808ProtocolException.Reason.PROFILE);
    }

    /**
     * 识别首台锁具的等价厂家写法；罗马数字五与四严格区分。
     * @param name 厂家型号文本
     * @return 本轮已确认型号
     */
    public static Model modelForVendorName(String name) {
        if (name == null) throw new Jt808ProtocolException(Jt808ProtocolException.Reason.PROFILE);
        return switch (name.strip().toUpperCase(Locale.ROOT)) {
            case "ZN-DM08-Ⅴ(A)", "ZN-DM08-V(A)", "ZN-DM08-VA", "DM08-VA" -> Model.DM08_V_A;
            default -> throw new Jt808ProtocolException(Jt808ProtocolException.Reason.PROFILE);
        };
    }

    /** @param wire 单个完整帧 @return 型号与普通版均显式确认后才解析的消息 */
    public Jt808Frame decodeUplink(byte[] wire) {
        requirePlain();
        return Jt808FrameCodec.decode(wire, Jt808ChecksumMode.HEADER_AND_BODY);
    }

    /** @param frame 已构造的消息 @return 使用本型号校验范围封装的明文帧 */
    public byte[] encodeDownlink(Jt808Frame frame) {
        requirePlain();
        return Jt808FrameCodec.encode(frame, Jt808ChecksumMode.HEADER_AND_BODY);
    }

    /** @param lockStatus 附加信息E2的双字节锁状态 @return 本型号的门磁状态 */
    public DoorState doorState(int lockStatus) {
        if (lockStatus < 0 || lockStatus > 0xffff) throw new Jt808ProtocolException(Jt808ProtocolException.Reason.HEADER);
        return (lockStatus & 1) == 1 ? DoorState.CLOSED : DoorState.OPEN;
    }

    private void requirePlain() {
        if (protection != BodyProtection.PLAIN) throw new Jt808ProtocolException(Jt808ProtocolException.Reason.ENCRYPTION);
    }
}
