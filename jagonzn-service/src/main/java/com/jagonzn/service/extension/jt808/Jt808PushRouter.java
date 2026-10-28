package com.jagonzn.service.extension.jt808;

import com.things.link.ingestion.application.access.DeviceAccessPushPort;
import java.util.List;
import java.util.function.Supplier;
import java.util.Objects;

/** 组合公开下行端口，保留原平台消费者的准入、规则、计费及markDispatched；不替换其内部实现。 */
public final class Jt808PushRouter implements DeviceAccessPushPort {
    private final Jt808TcpServer jt808;
    private final Supplier<List<DeviceAccessPushPort>> ports;
    private final ThreadLocal<Push> directDispatch=new ThreadLocal<>();
    /** @param jt808 专用会话 @param ports 延迟取得原有公开推送端口；排除本路由避免递归 */
    public Jt808PushRouter(Jt808TcpServer jt808,Supplier<List<DeviceAccessPushPort>> ports) { this.jt808=jt808; this.ports=ports; }
    @Override public boolean owns(Push push) {
        if(jt808.targets(push)) return jt808.owns(push);
        return owner(push)!=null;
    }
    @Override public PushOutcome push(Push push) {
        if(jt808.targets(push)) {
            Push authorized=directDispatch.get(); directDispatch.remove();
            if(!Objects.equals(authorized,push)) return PushOutcome.WRITE_FAILED;
            return jt808.push(push);
        }
        DeviceAccessPushPort owner=owner(push); return owner==null?PushOutcome.DEFERRED_NOT_OWNER:owner.push(push);
    }
    boolean targets(Push push) { return jt808.targets(push); }
    void clearAuthorization() { directDispatch.remove(); }
    void authorizeDirectDispatch(Push push) { directDispatch.set(push); }
    private DeviceAccessPushPort owner(Push push) {
        var owners=ports.get().stream().filter(port->port!=this).filter(port->port.owns(push)).toList();
        if(owners.size()>1) throw new IllegalStateException("TCP下行存在多个所有者，已拒绝发送");
        return owners.isEmpty()?null:owners.getFirst();
    }
}
