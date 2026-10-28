package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.*;
import com.things.link.shared.id.Uuid7;
import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import com.things.link.telemetry.application.*;
import com.things.link.device.application.DeviceAccessSessionPort;
import com.things.link.shared.message.DeviceCommandDispatch;
import com.things.link.shared.message.TransportProtocol;
import com.things.link.ingestion.application.DownlinkPreprocessingChain;
import com.things.link.ingestion.infrastructure.protocol.tcp.TcpCommandDownlinkKafkaConsumer;
import com.things.link.project.application.ProjectDownlinkBillingService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.net.*;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class Jt808TcpServerTests {
    @TempDir Path external;
    @Test void realLoopbackTcpExercisesSm4RegistrationAuthenticationStateAndCorrelatedQuery() throws Exception {
        Instant now=Instant.now(); var gateway=mock(Jt808ThingsLinkGateway.class);
        var identity=new AuthenticatedDeviceIdentity(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),1);
        var binding=new Jt808DeviceBinding(Jt808TestLock.TERMINAL,Jt808TestLock.MAC,"project","lock","synthetic-secret","1.0.0",now.plusSeconds(60),Map.of("door_closed","door_closed"));
        when(gateway.authenticate(binding)).thenReturn(identity); when(gateway.reply(any(),any(),anyString())).thenReturn(DeviceCommandAccessReplyPort.Outcome.APPLIED);
        var command=new DeviceCommandDispatch(Uuid7.generate(),identity.tenantId(),identity.projectId(),Uuid7.generate(),Uuid7.generate(),1,
                identity.deviceId(),"lock",identity.deviceId(),"lock","project","jt808_query","{}",now.plusSeconds(30),"test-trace");
        Path state=Files.createDirectory(external.resolve("state"),PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        try(var store=new Jt808StateStore(state,external); var cipher=new Jt808Sm4Cipher(Jt808TestLock.KEY,new byte[16]);
            var server=new Jt808TcpServer(binding,cipher,store,gateway,new ObjectMapper(),new InetSocketAddress("127.0.0.1",0),Duration.ofSeconds(5),Duration.ofMillis(250),Clock.systemUTC())) {
            server.start(); int port=server.boundPort(); assertNotEquals(6808,port);
            try(var socket=new Socket("127.0.0.1",port)) {
                socket.setSoTimeout(3000); var output=socket.getOutputStream(); var input=socket.getInputStream();
                byte[] registration=Jt808TestLock.uplink(0x0100,1,Jt808TestLock.registration());
                output.write(registration,0,7); output.flush(); output.write(registration,7,registration.length-7); output.flush();
                byte[] token=Arrays.copyOfRange(Jt808TestLock.downlink(Jt808TestLock.read(input)).body(),3,9);
                output.write(Jt808TestLock.uplink(0x0102,2,token)); output.flush();
                assertEquals(0,Jt808TestLock.downlink(Jt808TestLock.read(input)).body()[4]);
                output.write(Jt808TestLock.uplink(0x0002,5,new byte[0])); output.flush();
                assertEquals(0,Jt808TestLock.downlink(Jt808TestLock.read(input)).body()[4]);
                var router=new Jt808PushRouter(server,List::of);
                var nativeSessions=mock(DeviceAccessSessionPort.class);
                when(nativeSessions.config(identity.tenantId(),identity.projectId(),identity.deviceId())).thenReturn(Optional.of(new DeviceAccessSessionPort.Config(TransportProtocol.TCP,1,30,true)));
                var lifecycle=mock(DeviceCommandService.class); when(lifecycle.admitDispatch(command)).thenReturn(true);
                var consumer=new TcpCommandDownlinkKafkaConsumer(nativeSessions,router,new DownlinkPreprocessingChain(List.of(new Jt808DispatchGuard(router))),
                        lifecycle,new SimpleMeterRegistry(),mock(ProjectDownlinkBillingService.class));
                consumer.consume(new ConsumerRecord<>("test-only",0,0,identity.deviceId().toString(),command));
                verify(lifecycle).admitDispatch(command); verify(lifecycle).markDispatched(eq(command),any());
                Jt808Frame query=Jt808TestLock.downlink(Jt808TestLock.read(input)); assertEquals(0x8201,query.messageId());
                consumer.consume(new ConsumerRecord<>("test-only",0,1,identity.deviceId().toString(),command));
                verify(lifecycle,times(1)).admitDispatch(command);
                output.write(Jt808TestLock.uplink(0x0001,3,Jt808Messages.acknowledgement(query.serial(),0x8201,0)));
                output.write(Jt808TestLock.uplink(0x0201,4,Jt808TestLock.query(query.serial()))); output.flush();
                var receipt=Jt808TestLock.downlink(Jt808TestLock.read(input)); assertEquals(0,receipt.body()[4]);
                verify(gateway).report(eq(identity),any(),any(),anyString());
                var replies=ArgumentCaptor.forClass(DeviceCommandAccessReplyPort.Reply.class); verify(gateway,times(2)).reply(eq(identity),replies.capture(),anyString());
                assertEquals(DeviceCommandAccessReplyPort.Status.SUCCESS,replies.getAllValues().get(1).status());
            }
            server.stop(); assertFalse(server.isRunning());
        }
    }
}
