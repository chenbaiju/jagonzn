package com.jagonzn.service.extension.jt808;

import com.things.link.ingestion.application.access.DeviceAccessAuthBudget;
import com.things.link.ingestion.application.access.DeviceAccessDeviceAuthenticator;
import com.things.link.ingestion.application.access.DeviceAccessUplinkIngressService;
import com.things.link.ingestion.application.access.DeviceAccessUplinkMessage;
import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import com.things.link.shared.message.TransportProtocol;
import com.things.link.telemetry.application.DeviceCommandAccessReplyPort;
import java.time.Instant;

/** 仅组合平台公开应用端口；会话为扩展本地事实，不伪造标准TC的AUTH_RESPONSE或空03心跳。 */
public class Jt808ThingsLinkGateway {
    private final DeviceAccessAuthBudget authBudget;
    private final DeviceAccessDeviceAuthenticator authenticator;
    private final DeviceAccessUplinkIngressService ingress;
    private final DeviceCommandAccessReplyPort replies;

    /** @param authBudget 共享认证限流 @param authenticator 凭据、接入平面、项目可写及业务预算
     * @param ingress 标准属性受理 @param replies 正式认证回复 */
    public Jt808ThingsLinkGateway(DeviceAccessAuthBudget authBudget,DeviceAccessDeviceAuthenticator authenticator,
                                  DeviceAccessUplinkIngressService ingress,DeviceCommandAccessReplyPort replies) {
        this.authBudget=authBudget; this.authenticator=authenticator; this.ingress=ingress; this.replies=replies;
    }

    /** @param binding 预绑定 @param ip 真实连接来源；不能从设备载荷读取 */
    public void checkAuthenticationBudget(Jt808DeviceBinding binding,String ip) {
        if(authBudget.check(ip,binding.projectKey(),binding.deviceKey())!=DeviceAccessAuthBudget.Decision.ALLOW)
            throw new IllegalStateException("JT808认证预算拒绝");
    }
    public void authenticationFailed(Jt808DeviceBinding binding) { authBudget.recordFailure(binding.projectKey(),binding.deviceKey()); }
    public void authenticationSucceeded(Jt808DeviceBinding binding) { authBudget.recordSuccess(binding.projectKey(),binding.deviceKey()); }

    /** 每个业务消息均复核原凭据，包含项目、协议、预算及最终活动保护。 */
    public AuthenticatedDeviceIdentity authenticate(Jt808DeviceBinding binding) {
        return authenticator.authenticate(TransportProtocol.TCP,binding.projectKey(),binding.deviceKey(),binding.secret());
    }

    /** 返回仅表示可靠受理，属性生效与历史落库由平台标准管道判定。 */
    public void report(AuthenticatedDeviceIdentity identity,byte[] payload,Instant receivedAt,String traceId) {
        ingress.accept(new DeviceAccessUplinkMessage(identity.tenantId(),identity.projectId(),identity.deviceId(),
                TransportProtocol.TCP,payload,receivedAt,traceId,identity));
    }

    /** @return 平台原状态机结果；不降级到无认证的兼容入口 */
    public DeviceCommandAccessReplyPort.Outcome reply(AuthenticatedDeviceIdentity identity,
            DeviceCommandAccessReplyPort.Reply reply,String digest) {
        return replies.applyAuthenticated(reply,identity,digest);
    }
}
