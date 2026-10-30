package com.jagonzn.service.extension.jt808;

import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import com.things.link.telemetry.application.DeviceCommandAccessReplyPort;
import java.time.Instant;
import java.util.Map;

/** 厂家会话使用的接入能力；内核和远程实现互斥，远程身份版本必须来自平台实际读取。 */
public interface Jt808PlatformGateway {
    /** 结果已外置冻结但平台终态尚未确认；会话继续接收关门报告，不把待确认当失败重开。 */
    final class ReplyPending extends RuntimeException { public ReplyPending(){super("远程命令结果待平台确认");} }
    void checkAuthenticationBudget(Jt808DeviceBinding binding,String ip);
    void authenticationFailed(Jt808DeviceBinding binding);
    void authenticationSucceeded(Jt808DeviceBinding binding);
    AuthenticatedDeviceIdentity authenticate(Jt808DeviceBinding binding);
    void report(AuthenticatedDeviceIdentity identity,byte[] payload,Instant receivedAt,String traceId);
    DeviceCommandAccessReplyPort.Outcome reply(AuthenticatedDeviceIdentity identity,DeviceCommandAccessReplyPort.Reply reply,String digest);
    /** 新连接取得本地会话代次后通知远端，旧连接退出不能撤销新连接。 */
    default void sessionOpened(long generation) { }
    /** 休眠或关闭只结束对应代次的远程设备连接。 */
    default void sessionClosed(long generation) { }
    /** 明确的厂家业务事实与属性分开持久交付，不把普通状态快照当独立事件。 */
    default void event(String dedupKey,String kind,Instant occurred,Instant received,Map<String,Object> details) { }
}
