package com.jagonzn.service.extension.jt808;

import com.things.link.ingestion.application.DownlinkPreprocessor;
import com.things.link.ingestion.application.InvalidDownlinkMessageException;
import com.things.link.ingestion.application.access.DeviceAccessPushPort;
import com.things.link.shared.message.DeviceCommandDispatch;

/** 公开预处理扩展核对直连目标；Push投影不含targetDeviceId，必须在原完整信封仍在场时拒绝网关子设备。 */
public final class Jt808DispatchGuard implements DownlinkPreprocessor {
    private final Jt808PushRouter router;
    public Jt808DispatchGuard(Jt808PushRouter router) { this.router=router; }
    @Override public int order() { return Integer.MAX_VALUE; }
    @Override public DeviceCommandDispatch preprocess(DeviceCommandDispatch source) {
        router.clearAuthorization();
        if(source.operationType()!=DeviceCommandDispatch.OperationType.COMMAND) return source;
        var push=new DeviceAccessPushPort.Push(source.tenantId(),source.projectId(),source.connectionDeviceId(),source.commandId(),
                source.commandKey(),source.inputJson(),source.attemptNo(),source.deadlineAt());
        if(router.targets(push)) {
            if(!source.targetDeviceId().equals(source.connectionDeviceId())) throw new InvalidDownlinkMessageException("JT808锁具仅支持直接目标，拒绝网关子设备控制");
            router.authorizeDirectDispatch(push);
        }
        return source;
    }
}
