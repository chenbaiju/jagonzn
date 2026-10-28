package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.Jt808Frame;
import java.time.Instant;
import java.util.Map;

/** 管理员私有预绑定；密码只交给正式认证端口，不允许默认账号或从注册报文创建平台设备。 */
public final class Jt808DeviceBinding {
    private final String terminalId,projectKey,deviceKey,secret,modelVersion;
    private final byte[] mac;
    private final Instant enrollmentUntil;
    private final Map<String,String> properties;

    /** @param terminalId BCD终端标识 @param mac 预核对蓝牙MAC @param projectKey 正式项目短标识
     * @param deviceKey 正式设备短标识 @param secret 正式设备凭据 @param modelVersion 已绑定物模型版本
     * @param enrollmentUntil 管理员明确开启的首绑截止时刻；空表示拒绝注册 @param properties 协议属性到物模型标识符的显式映射 */
    public Jt808DeviceBinding(String terminalId,byte[] mac,String projectKey,String deviceKey,String secret,
                              String modelVersion,Instant enrollmentUntil,Map<String,String> properties) {
        this.terminalId=Jt808Frame.terminalIdForImei(terminalId);
        if(mac==null || mac.length!=6 || projectKey==null || !projectKey.matches("[A-Za-z0-9_-]{1,64}")
                || deviceKey==null || !deviceKey.matches("[A-Za-z0-9_-]{1,64}") || secret==null || secret.isBlank()
                || modelVersion==null || !modelVersion.matches("(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)")
                || properties==null || properties.isEmpty() || properties.values().stream().anyMatch(v->v==null || !v.matches("[A-Za-z0-9_-]{1,64}"))
                || properties.values().stream().distinct().count()!=properties.size()) throw new IllegalArgumentException("JT808预绑定配置不完整");
        this.mac=mac.clone(); this.projectKey=projectKey; this.deviceKey=deviceKey; this.secret=secret;
        this.modelVersion=modelVersion; this.enrollmentUntil=enrollmentUntil; this.properties=Map.copyOf(properties);
    }
    public String terminalId() { return terminalId; }
    public byte[] mac() { return mac.clone(); }
    public String projectKey() { return projectKey; }
    public String deviceKey() { return deviceKey; }
    /** 仅正式认证调用使用，禁止日志或诊断输出。 */
    String secret() { return secret; }
    public String modelVersion() { return modelVersion; }
    public Map<String,String> properties() { return properties; }
    public boolean enrollmentAllowed(Instant now) { return enrollmentUntil!=null && now.isBefore(enrollmentUntil); }
    @Override public String toString() { return "JT808预绑定[私有]"; }
}
