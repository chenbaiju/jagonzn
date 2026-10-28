package com.jagonzn.service.extension.jt808;

import com.things.link.ingestion.application.access.DeviceAccessPushPort;
import com.things.link.ingestion.application.InvalidDownlinkMessageException;
import com.things.link.shared.id.Uuid7;
import com.things.link.shared.message.DeviceCommandDispatch;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class Jt808PushRouterTests {
    DeviceAccessPushPort.Push push() { return new DeviceAccessPushPort.Push(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),Uuid7.generate(),"jt808_unlock","{}",1,Instant.now().plusSeconds(30)); }
    DeviceCommandDispatch dispatch(DeviceAccessPushPort.Push push,UUID target) {
        return new DeviceCommandDispatch(Uuid7.generate(),push.tenantId(),push.projectId(),push.commandId(),Uuid7.generate(),push.attempt(),target,"target",
                push.deviceId(),"connection","project",push.commandKey(),push.inputJson(),push.expiresAt(),"trace");
    }
    @Test void preservesNativeDeviceRoutingAndDoesNotSendKnownJt808DeviceToFallbackWhenOffline() {
        var server=mock(Jt808TcpServer.class); var nativePort=mock(DeviceAccessPushPort.class);
        var router=new Jt808PushRouter(server,()->List.of(nativePort)); var push=push();
        when(nativePort.owns(push)).thenReturn(true); when(nativePort.push(push)).thenReturn(DeviceAccessPushPort.PushOutcome.DELIVERED);
        assertTrue(router.owns(push)); assertEquals(DeviceAccessPushPort.PushOutcome.DELIVERED,router.push(push));
        when(server.targets(push)).thenReturn(true); assertFalse(router.owns(push));
        assertEquals(DeviceAccessPushPort.PushOutcome.WRITE_FAILED,router.push(push)); verify(nativePort,times(1)).push(push);
    }
    @Test void onlyGuardedDirectDispatchCanUseJt808SocketAndWitnessIsConsumedOnce() {
        var server=mock(Jt808TcpServer.class); var router=new Jt808PushRouter(server,List::of); var push=push();
        when(server.targets(push)).thenReturn(true); when(server.push(push)).thenReturn(DeviceAccessPushPort.PushOutcome.DELIVERED);
        assertEquals(DeviceAccessPushPort.PushOutcome.WRITE_FAILED,router.push(push));
        new Jt808DispatchGuard(router).preprocess(dispatch(push,push.deviceId()));
        assertEquals(DeviceAccessPushPort.PushOutcome.DELIVERED,router.push(push));
        assertEquals(DeviceAccessPushPort.PushOutcome.WRITE_FAILED,router.push(push)); verify(server,times(1)).push(push);
    }
    @Test void gatewayChildCannotControlThePhysicalConnectionLock() {
        var server=mock(Jt808TcpServer.class); var router=new Jt808PushRouter(server,List::of); var push=push();
        when(server.targets(push)).thenReturn(true);
        assertThrows(InvalidDownlinkMessageException.class,()->new Jt808DispatchGuard(router).preprocess(dispatch(push,UUID.randomUUID())));
        verify(server,never()).push(any());
    }
    @Test void ambiguousNativeOwnersNeverFanOut() {
        var first=mock(DeviceAccessPushPort.class); var second=mock(DeviceAccessPushPort.class); var push=push();
        when(first.owns(push)).thenReturn(true); when(second.owns(push)).thenReturn(true);
        var router=new Jt808PushRouter(mock(Jt808TcpServer.class),()->List.of(first,second));
        assertThrows(IllegalStateException.class,()->router.push(push)); verify(first,never()).push(any()); verify(second,never()).push(any());
    }
}
