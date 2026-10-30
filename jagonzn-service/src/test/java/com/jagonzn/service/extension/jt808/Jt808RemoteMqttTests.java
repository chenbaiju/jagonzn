package com.jagonzn.service.extension.jt808;

import java.nio.file.Path;
import java.util.concurrent.atomic.*;
import org.eclipse.paho.client.mqttv3.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class Jt808RemoteMqttTests {
    @TempDir Path external;
    private MqttClient available(){var c=mock(MqttClient.class);when(c.isConnected()).thenReturn(true);return c;}

    @Test void tcpConnectionAloneIsNotReadyAndTlsAndSubscriptionRemainRequired()throws Exception {
        try(var f=new Jt808RemoteFixture(external,false)){
            var client=available();var ref=new AtomicReference<Jt808RemoteMqtt.Tls>();
            doAnswer(call->{assertFalse(ref.get().connected());return null;}).when(client).subscribe("tc/v1/project/lock/down/#",1);
            try(var tls=new Jt808RemoteMqtt.Tls(f.settings,f.binding,()->client)){
                ref.set(tls);tls.connect();assertTrue(tls.connected());var options=ArgumentCaptor.forClass(MqttConnectOptions.class);verify(client).connect(options.capture());
                assertTrue(options.getValue().isHttpsHostnameVerificationEnabled());assertTrue(options.getValue().isCleanSession());assertFalse(options.getValue().isAutomaticReconnect());
                verify(client).setTimeToWait(8000);verify(client).setTimeToWait(3000);verify(client).subscribe("tc/v1/project/lock/down/#",1);
            }
        }
    }
    @Test void connectTimeoutIsCancelledAndLateTcpSuccessCannotBecomeReady()throws Exception {
        try(var f=new Jt808RemoteFixture(external,false)){
            var failed=mock(MqttClient.class);doThrow(new MqttException(32000)).when(failed).connect(any(MqttConnectOptions.class));
            var replacement=available();var calls=new AtomicInteger();
            try(var tls=new Jt808RemoteMqtt.Tls(f.settings,f.binding,()->calls.getAndIncrement()==0?failed:replacement)){
                assertThrows(IllegalStateException.class,tls::connect);verify(failed).disconnectForcibly(0,0,false);verify(failed).close(true);
                when(failed.isConnected()).thenReturn(true);assertFalse(tls.connected());tls.connect();assertTrue(tls.connected());verify(replacement).subscribe("tc/v1/project/lock/down/#",1);assertEquals(2,calls.get());
            }
        }
    }
    @Test void subscriptionFailureClosesThePartialSessionAndRetryMustSubscribeAgain()throws Exception {
        try(var f=new Jt808RemoteFixture(external,false)){
            var failed=available();doThrow(new MqttException(128)).when(failed).subscribe("tc/v1/project/lock/down/#",1);var replacement=available();var calls=new AtomicInteger();
            try(var tls=new Jt808RemoteMqtt.Tls(f.settings,f.binding,()->calls.getAndIncrement()==0?failed:replacement)){
                assertThrows(IllegalStateException.class,tls::connect);assertFalse(tls.connected());verify(failed).close(true);tls.connect();verify(replacement).subscribe("tc/v1/project/lock/down/#",1);assertTrue(tls.connected());
            }
        }
    }
    @Test void callbacksFromDiscardedClientsCannotDisconnectNewSession()throws Exception {
        try(var f=new Jt808RemoteFixture(external,false)){
            var first=available();var second=available();var calls=new AtomicInteger();var lost=new AtomicInteger();
            try(var tls=new Jt808RemoteMqtt.Tls(f.settings,f.binding,()->calls.getAndIncrement()==0?first:second)){
                tls.onDisconnect(lost::incrementAndGet);tls.connect();var a=ArgumentCaptor.forClass(MqttCallback.class);verify(first).setCallback(a.capture());tls.disconnect();tls.connect();
                var b=ArgumentCaptor.forClass(MqttCallback.class);verify(second).setCallback(b.capture());a.getValue().connectionLost(new RuntimeException());assertTrue(tls.connected());assertEquals(0,lost.get());
                b.getValue().connectionLost(new RuntimeException());assertFalse(tls.connected());assertEquals(1,lost.get());
            }
        }
    }
}
