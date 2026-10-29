package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.Jt808Sm4Cipher;
import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import com.things.link.shared.id.Uuid7;
import com.things.link.ingestion.application.access.DeviceAccessPushPort;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 真正国密报文进入会话后生成逐条扩展日志；属性快照与控制ACK不冒充物理动作。 */
class Jt808LogTests {
    @TempDir Path external;
    final ObjectMapper json=new ObjectMapper();
    final Instant now=Instant.parse("2026-10-28T12:00:00Z");
    Path directory(String prefix)throws Exception{return Files.createTempDirectory(external,prefix,PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));}
    final class Fixture implements AutoCloseable {
        final Jt808ThingsLinkGateway gateway=mock(Jt808ThingsLinkGateway.class);
        final AuthenticatedDeviceIdentity identity=new AuthenticatedDeviceIdentity(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),1);
        final Path logDirectory=directory("logs-");
        final Jt808LogJournal journal=new Jt808LogJournal(logDirectory,external,json);
        final Jt808StateStore state=new Jt808StateStore(directory("state-"),external);
        final Jt808Sm4Cipher cipher=new Jt808Sm4Cipher(Jt808TestLock.KEY,new byte[16]);
        final Jt808DeviceBinding binding=new Jt808DeviceBinding(Jt808TestLock.TERMINAL,Jt808TestLock.MAC,"project","lock","synthetic-platform-secret","1.0.0",now.plusSeconds(60),Map.of("door_closed","door_closed","battery_percent","battery_percent"));
        final Jt808Session session;
        Fixture()throws Exception{
            when(gateway.authenticate(binding)).thenReturn(identity);when(gateway.reply(any(),any(),anyString())).thenReturn(com.things.link.telemetry.application.DeviceCommandAccessReplyPort.Outcome.APPLIED);session=new Jt808Session(binding,state,gateway,new Jt808SessionCoordinator(),cipher,json,"127.0.0.1",journal);
            var response=new ArrayList<byte[]>();session.receive(Jt808TestLock.uplink(0x0100,1,Jt808TestLock.registration()),now,response::add);byte[] token=Arrays.copyOfRange(Jt808TestLock.downlink(response.getFirst()).body(),3,9);session.receive(Jt808TestLock.uplink(0x0102,2,token),now,wire->{});
        }
        List<String> kinds(){return journal.pending().stream().map(e->json.readTree(e.json()).path("payload").path("logType").asText()).toList();}
        @Override public void close(){session.close();journal.close();state.close();cipher.close();}
    }
    byte[] report(int reason,boolean closed){byte[] body=Jt808TestLock.location();body[31]=(byte)((reason<<1)|(closed?1:0));return body;}
    @Test void reasonFifteenPreservesAlarmAndDoorStateWithoutInventingACoverOrUnlockAction() throws Exception {
        try(var f=new Fixture()) {
            f.session.receive(Jt808TestLock.uplink(0x0200,10,report(15,false)),now,wire->{});
            assertTrue(f.kinds().contains("ALARM_REPORTED")); assertFalse(f.kinds().contains("COVER_ALARM_REPORTED"));
            assertFalse(f.kinds().contains("UNLOCK_REPORTED"));
            var alarm=f.journal.pending().stream().map(e->json.readTree(e.json())).filter(e->e.path("payload").path("logType").asText().equals("ALARM_REPORTED")).findFirst().orElseThrow();
            assertEquals(15,alarm.path("payload").path("details").path("report_reason").asInt());
            assertFalse(alarm.path("payload").path("details").path("door_closed").asBoolean());
        }
    }
    @Test void openCloseAndEveryOtherReasonAreSeparateLogsWithoutPrivateRawFields()throws Exception {
        try(var f=new Fixture()){
            f.session.receive(Jt808TestLock.uplink(0x0200,10,report(1,false)),now,wire->{});f.session.receive(Jt808TestLock.uplink(0x0200,11,report(2,true)),now,wire->{});
            assertTrue(f.kinds().containsAll(List.of("REGISTERED","AUTHENTICATED","UNLOCK_REPORTED","LOCK_REPORTED")));
            String all=f.journal.pending().toString();assertFalse(all.contains("synthetic-platform-secret"));assertFalse(all.contains("latitude"));assertFalse(all.contains("iccid"));assertFalse(all.contains("bluetooth"));
        }
    }
    @Test void plainSnapshotDoesNotInventUnlockOrCloseEvent()throws Exception {
        try(var f=new Fixture()){f.session.receive(Jt808TestLock.uplink(0x0200,10,report(0,true)),now,wire->{});assertTrue(f.kinds().contains("STATUS_REPORTED"));assertFalse(f.kinds().contains("LOCK_REPORTED"));}
    }
    @Test void replayFreezesOriginalEventAndSurvivesJournalRestart()throws Exception {
        Path logs=directory("logs-");var identity=new AuthenticatedDeviceIdentity(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),1);String first;
        try(var journal=new Jt808LogJournal(logs,external,json)){journal.append(identity,"same","UNLOCK_REPORTED","UP",0x0200,10,now,now,Map.of("doorClosed",false));first=journal.pending().getFirst().json();journal.append(identity,"same","UNLOCK_REPORTED","UP",0x0200,10,now.plusSeconds(1),now.plusSeconds(1),Map.of("doorClosed",false));assertEquals(1,journal.pending().size());}
        try(var journal=new Jt808LogJournal(logs,external,json)){assertEquals(first,journal.pending().getFirst().json());journal.accepted(journal.pending().getFirst());assertTrue(journal.pending().isEmpty());assertTrue(Files.list(logs).anyMatch(p->p.toString().endsWith(".json")));}
    }
    @Test void commandIntentAndAckNeverClaimPhysicalUnlock()throws Exception {
        try(var f=new Fixture()){
            var command=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),Uuid7.generate(),"jt808_unlock","{}",1,now.plusSeconds(20));var wire=new ArrayList<byte[]>();f.session.push(command,now,wire::add);int serial=Jt808TestLock.downlink(wire.getFirst()).serial();
            byte[] body=java.nio.ByteBuffer.allocate(5).putShort((short)serial).putShort((short)0x8500).put((byte)0).array();f.session.receive(Jt808TestLock.uplink(0x0001,8,body),now,w->{});
            assertTrue(f.kinds().containsAll(List.of("COMMAND_DISPATCH_REQUESTED","DEVICE_ACK")));assertFalse(f.kinds().contains("UNLOCK_REPORTED"));assertTrue(f.journal.pending().stream().anyMatch(e->e.json().contains("UNCONFIRMED")));
        }
    }
    @Test void vaDoorOperationReasonsAndShackleBitNeverProveBoltPositionOrControlSuccess() throws Exception {
        for(boolean acknowledge:new boolean[]{false,true}) for(boolean shackleClosed:new boolean[]{false,true}) {
            try(var f=new Fixture()) {
                var command=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),Uuid7.generate(),"jt808_unlock","{}",1,now.plusSeconds(20));
                var output=new ArrayList<byte[]>();f.session.push(command,now,output::add);int serial=Jt808TestLock.downlink(output.getFirst()).serial();
                if(acknowledge) f.session.receive(Jt808TestLock.uplink(0x0001,8,com.jagonzn.service.extension.jt808.protocol.Jt808Messages.acknowledgement(serial,0x8500,0)),now,w->{});
                byte[] opened=report(1,false),closed=report(2,true);opened[30]=(byte)(shackleClosed?4:0);closed[30]=(byte)(shackleClosed?4:0);
                f.session.receive(Jt808TestLock.uplink(0x0200,10,opened),now.plusSeconds(1),w->{});
                f.session.receive(Jt808TestLock.uplink(0x0200,11,closed),now.plusSeconds(2),w->{});
                var events=f.journal.pending().stream().map(e->json.readTree(e.json())).filter(e->List.of("UNLOCK_REPORTED","LOCK_REPORTED").contains(e.path("payload").path("logType").asText())).toList();
                assertEquals(2,events.size());
                for(var e:events) {
                    var details=e.path("payload").path("details");assertEquals("E2_BIT0_DOOR_CONTACT",details.path("door_state_source").asText());
                    assertEquals("UNKNOWN",details.path("bolt_position").asText());assertEquals("UNCONFIRMED",details.path("physicalResult").asText());
                    assertEquals(details.path("door_closed").asBoolean()?"CLOSED":"OPEN",details.path("lock_state").asText());
                    assertEquals("MANUFACTURER_DOOR_CONTACT",details.path("lock_state_source").asText());
                    assertEquals(shackleClosed,details.path("shackle_closed").asBoolean());
                }
                assertEquals(acknowledge?"ACKNOWLEDGED":"SENT",f.state.snapshot().get("cmd."+command.commandId()+".state"));
                var replies=org.mockito.ArgumentCaptor.forClass(com.things.link.telemetry.application.DeviceCommandAccessReplyPort.Reply.class);
                verify(f.gateway,times(acknowledge?1:0)).reply(any(),replies.capture(),anyString());
                assertTrue(replies.getAllValues().stream().noneMatch(r->r.status()==com.things.link.telemetry.application.DeviceCommandAccessReplyPort.Status.SUCCESS));
                f.session.maintain(now.plusSeconds(21));assertEquals("UNKNOWN",f.state.snapshot().get("cmd."+command.commandId()+".state"));
            }
        }
    }
    @Test void batteryReportWithoutDoorContactNeverInfersOpenOrClosedState() throws Exception {
        try(var f=new Fixture()) {
            byte[] base=Jt808TestLock.location(),withoutDoor=new byte[base.length-4];
            System.arraycopy(base,0,withoutDoor,0,28);System.arraycopy(base,32,withoutDoor,28,base.length-32);
            f.session.receive(Jt808TestLock.uplink(0x0200,10,withoutDoor),now,w->{});
            var event=f.journal.pending().stream().map(e->json.readTree(e.json())).filter(e->e.path("payload").path("logType").asText().equals("STATUS_REPORTED")).findFirst().orElseThrow();
            var details=event.path("payload").path("details");assertEquals("UNKNOWN",details.path("lock_state").asText());
            assertEquals("NOT_REPORTED",details.path("lock_state_source").asText());assertEquals("UNKNOWN",details.path("bolt_position").asText());
            assertEquals("NOT_REPORTED",details.path("door_state_source").asText());
            assertFalse(details.has("door_closed"));
        }
    }
    @Test void repeatedReportDoesNotCreateAnotherLog()throws Exception {
        try(var f=new Fixture()){byte[] wire=Jt808TestLock.uplink(0x0200,10,report(1,false));f.session.receive(wire,now,w->{});int count=f.journal.pending().size();f.session.receive(wire,now.plusSeconds(1),w->{});assertEquals(count,f.journal.pending().size());}
    }
    @Test void heartbeatAndUnsupportedMessagesAreLoggedWithoutRawPayload()throws Exception {
        try(var f=new Fixture()){f.session.receive(Jt808TestLock.uplink(0x0002,10,new byte[0]),now,w->{});f.session.receive(Jt808TestLock.uplink(0x1234,11,"password=DO_NOT_PRINT".getBytes()),now,w->{});assertTrue(f.kinds().containsAll(List.of("HEARTBEAT","UNSUPPORTED_MESSAGE")));assertTrue(f.journal.pending().stream().noneMatch(e->e.json().contains("DO_NOT_PRINT")));}
    }
    @Test void exclusiveJournalRejectsSecondWriterAndInvalidPermissions()throws Exception {
        Path logs=directory("logs-");try(var one=new Jt808LogJournal(logs,external,json)){assertThrows(IllegalStateException.class,()->new Jt808LogJournal(logs,external,json));}Files.setPosixFilePermissions(logs,PosixFilePermissions.fromString("rwxr-xr-x"));assertThrows(IllegalStateException.class,()->new Jt808LogJournal(logs,external,json));
    }
}
