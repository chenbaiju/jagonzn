package com.jagonzn.service.extension.jt808;

import com.things.link.ingestion.application.access.*;
import com.things.link.shared.message.*;
import com.things.link.telemetry.application.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class Jt808ThingsLinkGatewayTests {
    @Test void reusesNativeAuthenticationIngressAndAuthenticatedReplyPortsWithAuthorityScope() {
        var budget=mock(DeviceAccessAuthBudget.class); var auth=mock(DeviceAccessDeviceAuthenticator.class);
        var ingress=mock(DeviceAccessUplinkIngressService.class);
        var replies=mock(DeviceCommandAccessReplyPort.class); var gateway=new Jt808ThingsLinkGateway(budget,auth,ingress,replies);
        var binding=new Jt808DeviceBinding(Jt808TestLock.TERMINAL,Jt808TestLock.MAC,"project","device","synthetic-secret","1.0.0",null,Map.of("door_closed","closed"));
        var identity=new AuthenticatedDeviceIdentity(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),3);
        when(auth.authenticate(TransportProtocol.TCP,"project","device","synthetic-secret")).thenReturn(identity);
        when(budget.check("127.0.0.1","project","device")).thenReturn(DeviceAccessAuthBudget.Decision.ALLOW);
        gateway.checkAuthenticationBudget(binding,"127.0.0.1"); assertEquals(identity,gateway.authenticate(binding));
        gateway.report(identity,new byte[]{1},Instant.EPOCH,"trace");
        var message=ArgumentCaptor.forClass(DeviceAccessUplinkMessage.class); verify(ingress).accept(message.capture());
        assertEquals(identity,message.getValue().authenticatedIdentity()); assertEquals(TransportProtocol.TCP,message.getValue().protocol());
        gateway.reply(identity,null,"digest"); verify(replies).applyAuthenticated(null,identity,"digest"); verify(replies,never()).apply(any());
    }
    @Test void platformAuthenticationFailureAndAuthBudgetRefusalAreNotReplacedWithSyntheticIdentity() {
        var budget=mock(DeviceAccessAuthBudget.class); var auth=mock(DeviceAccessDeviceAuthenticator.class);
        var gateway=new Jt808ThingsLinkGateway(budget,auth,null,null);
        var binding=new Jt808DeviceBinding(Jt808TestLock.TERMINAL,Jt808TestLock.MAC,"project","device","synthetic-secret","1.0.0",null,Map.of("door_closed","closed"));
        when(budget.check(anyString(),anyString(),anyString())).thenReturn(DeviceAccessAuthBudget.Decision.BACKOFF);
        assertThrows(IllegalStateException.class,()->gateway.checkAuthenticationBudget(binding,"127.0.0.1"));
        when(auth.authenticate(any(),anyString(),anyString(),anyString())).thenThrow(new IllegalStateException("revoked"));
        assertThrows(IllegalStateException.class,()->gateway.authenticate(binding));
    }
}
