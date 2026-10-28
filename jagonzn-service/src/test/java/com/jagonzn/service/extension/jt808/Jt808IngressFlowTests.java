package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.Jt808Sm4Cipher;
import com.things.link.device.application.DeviceAccessAcceptancePort;
import com.things.link.ingestion.application.*;
import com.things.link.ingestion.application.access.*;
import com.things.link.shared.message.*;
import com.things.link.telemetry.application.DeviceCommandAccessReplyPort;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class Jt808IngressFlowTests {
    @TempDir Path external;
    @Test void actualPlatformNormalizerAndAcceptanceDeduplicateTranslatedReportsWithoutClaimingDatabasePersistence() throws Exception {
        var json=new ObjectMapper(); var facts=new HashMap<UUID,DeviceAccessAcceptancePort.Acceptance>(); var published=new ArrayList<StandardUplinkMessage>();
        DeviceAccessAcceptancePort acceptance=new DeviceAccessAcceptancePort() {
            @Override public Decision decide(Attempt attempt) { return facts.containsKey(attempt.messageId())?new Decision.Duplicate(facts.get(attempt.messageId())):new Decision.Fresh(); }
            @Override public Recording record(Attempt attempt) {
                var fact=new Acceptance(attempt.deviceId(),attempt.messageId(),attempt.payloadDigest(),attempt.protocol(),attempt.receivedAt(),attempt.receivedAt());
                facts.put(attempt.messageId(),fact); return new Recording(true,fact);
            }
        };
        var ingress=new DeviceAccessUplinkIngressService(new DeviceAccessUplinkNormalizer(new DevicePropertyReportReader(json),new UplinkTimestampPolicy(Duration.ofMinutes(5))),published::add,acceptance);
        var auth=mock(DeviceAccessDeviceAuthenticator.class); var budget=mock(DeviceAccessAuthBudget.class);
        when(budget.check(anyString(),anyString(),anyString())).thenReturn(DeviceAccessAuthBudget.Decision.ALLOW);
        var identity=new AuthenticatedDeviceIdentity(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),1);
        when(auth.authenticate(any(),anyString(),anyString(),anyString())).thenReturn(identity);
        var gateway=new Jt808ThingsLinkGateway(budget,auth,ingress,mock(DeviceCommandAccessReplyPort.class));
        Instant now=Jt808SessionTests.NOW;
        var binding=new Jt808DeviceBinding(Jt808TestLock.TERMINAL,Jt808TestLock.MAC,"project","lock","synthetic-secret","1.0.0",now.plusSeconds(30),Map.of("door_closed","door_closed"));
        Path state=Files.createDirectory(external.resolve("state"),PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
        try(var store=new Jt808StateStore(state,external);var cipher=new Jt808Sm4Cipher(Jt808TestLock.KEY,new byte[16])) {
            var session=new Jt808Session(binding,store,gateway,new Jt808SessionCoordinator(),cipher,json,"127.0.0.1");
            var responses=new ArrayList<byte[]>(); session.receive(Jt808TestLock.uplink(0x0100,1,Jt808TestLock.registration()),now,responses::add);
            byte[] token=Arrays.copyOfRange(Jt808TestLock.downlink(responses.getFirst()).body(),3,9);
            session.receive(Jt808TestLock.uplink(0x0102,2,token),now,ignored->{});
            byte[] report=Jt808TestLock.uplink(0x0200,3,Jt808TestLock.location());
            session.receive(report,now,ignored->{}); session.receive(report,now.plusSeconds(1),ignored->{});
            assertEquals(1,published.size()); var message=published.getFirst();
            assertEquals(identity.tenantId(),message.tenantId()); assertEquals(identity.deviceId(),message.deviceId());
            assertEquals(TransportProtocol.TCP,message.protocol()); assertEquals(Map.of("door_closed",true),message.payload());
            assertEquals(7,message.messageId().version()); assertEquals(1,facts.size());
            byte[] future=Jt808TestLock.location(); future[24]=0x29;
            assertThrows(InvalidUplinkMessageException.class,()->session.receive(Jt808TestLock.uplink(0x0200,4,future),now,ignored->fail()));
            assertEquals(1,published.size());
        }
    }
}
