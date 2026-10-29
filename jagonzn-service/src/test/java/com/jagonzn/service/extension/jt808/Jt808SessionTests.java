package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.*;
import com.things.link.shared.id.Uuid7;
import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import com.things.link.telemetry.application.DeviceCommandAccessReplyPort;
import com.things.link.ingestion.application.access.DeviceAccessPushPort;
import com.things.link.ingestion.application.access.DeviceAccessAuthBudget;
import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class Jt808SessionTests {
    static final Instant NOW=Instant.parse("2026-10-28T12:00:00Z");
    @TempDir Path external;

    final class Fixture implements AutoCloseable {
        final Jt808ThingsLinkGateway gateway=mock(Jt808ThingsLinkGateway.class);
        final AuthenticatedDeviceIdentity identity=new AuthenticatedDeviceIdentity(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),1);
        final Jt808Sm4Cipher cipher=new Jt808Sm4Cipher(Jt808TestLock.KEY,new byte[16]);
        final Jt808SessionCoordinator coordinator=new Jt808SessionCoordinator();
        final ObjectMapper json=new ObjectMapper();
        final Path directory;
        Jt808StateStore store;
        final Jt808DeviceBinding binding;
        Fixture() throws Exception { this(NOW.plusSeconds(60)); }
        Fixture(Instant until) throws Exception {
            directory=Files.createTempDirectory(external,"state-",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
            store=new Jt808StateStore(directory,external);
            binding=new Jt808DeviceBinding(Jt808TestLock.TERMINAL,Jt808TestLock.MAC,"project","lock","synthetic-platform-secret","1.0.0",until,
                    Map.of("door_closed","door_closed","battery_percent","battery_percent","latitude","latitude","longitude","longitude"));
            when(gateway.authenticate(binding)).thenReturn(identity);
            when(gateway.reply(any(),any(),anyString())).thenReturn(DeviceCommandAccessReplyPort.Outcome.APPLIED);
        }
        Jt808Session session() { return new Jt808Session(binding,store,gateway,coordinator,cipher,json,"127.0.0.1"); }
        byte[] register(Jt808Session session) throws Exception {
            var output=new ArrayList<byte[]>(); session.receive(Jt808TestLock.uplink(0x0100,1,Jt808TestLock.registration()),NOW,output::add);
            return Arrays.copyOfRange(Jt808TestLock.downlink(output.getFirst()).body(),3,9);
        }
        void authenticate(Jt808Session session,byte[] token) throws Exception {
            var output=new ArrayList<byte[]>(); session.receive(Jt808TestLock.uplink(0x0102,2,token),NOW,output::add);
            assertEquals(0,Jt808TestLock.downlink(output.getFirst()).body()[4]); assertTrue(session.active());
        }
        Jt808Session ready() throws Exception { var session=session(); authenticate(session,register(session)); return session; }
        DeviceAccessPushPort.Push command(String key) { return new DeviceAccessPushPort.Push(identity.tenantId(),identity.projectId(),identity.deviceId(),Uuid7.generate(),key,"{}",1,NOW.plusSeconds(30)); }
        List<Jt808Frame> push(Jt808Session session,DeviceAccessPushPort.Push command) throws Exception {
            var output=new ArrayList<byte[]>(); session.push(command,NOW,output::add);
            return output.stream().map(Jt808TestLock::downlink).toList();
        }
        @Override public void close() { cipher.close(); store.close(); }
    }

    @Test void registerRespondsOnlyAfterPersistingStableSixByteToken() throws Exception {
        try(var f=new Fixture()) {
            var session=f.session(); byte[] first=f.register(session),second=f.register(session);
            assertEquals(6,first.length); assertArrayEquals(first,second); assertFalse(session.active());
            assertEquals(HexFormat.of().formatHex(first),f.store.snapshot().get("token")); f.authenticate(session,first);
            verify(f.gateway,times(3)).checkAuthenticationBudget(f.binding,"127.0.0.1");
        }
    }
    @Test void macMismatchClosedEnrollmentAndWrongTerminalNeverMintIdentity() throws Exception {
        try(var f=new Fixture()) {
            byte[] registration=Jt808TestLock.registration(); registration[29]=99; var output=new ArrayList<byte[]>();
            f.session().receive(Jt808TestLock.uplink(0x0100,1,registration),NOW,output::add);
            assertEquals(1,Jt808TestLock.downlink(output.getFirst()).body()[2]); assertFalse(f.store.snapshot().containsKey("token"));
            verify(f.gateway,never()).authenticate(any());
        }
        try(var f=new Fixture(null)) { f.register(f.session()); verify(f.gateway,never()).authenticate(any()); }
        try(var f=new Fixture()) {
            byte[] wrong=Jt808TestLock.uplink(0x0002,1,new byte[0]); wrong[13]^=1;
            assertThrows(IllegalArgumentException.class,()->f.session().receive(wrong,NOW,wire->fail())); verify(f.gateway,never()).authenticate(any());
        }
    }
    @Test void badTokenOutsideEnrollmentCannotUseStoredPlatformSecretAndClosesConnection() throws Exception {
        try(var f=new Fixture(null)) {
            var session=f.session(); var output=new ArrayList<byte[]>();
            session.receive(Jt808TestLock.uplink(0x0102,2,new byte[6]),NOW,output::add);
            assertTrue(session.isClosed()); assertEquals(1,Jt808TestLock.downlink(output.getFirst()).body()[4]);
            verify(f.gateway,never()).authenticate(any()); verify(f.gateway).authenticationFailed(f.binding);
        }
    }
    @Test void unknownTokenDuringEnrollmentRequiresRegistrationBeforeAuthentication() throws Exception {
        try(var f=new Fixture()) {
            var session=f.session(); var output=new ArrayList<byte[]>();
            session.receive(Jt808TestLock.uplink(0x0102,1,new byte[6]),NOW,output::add);
            assertFalse(session.isClosed()); assertFalse(session.active());
            assertEquals(1,Jt808TestLock.downlink(output.getFirst()).body()[4]);
            assertFalse(f.store.snapshot().containsKey("token")); assertFalse(f.store.snapshot().containsKey("identity"));
            verify(f.gateway,never()).authenticate(any());
            f.authenticate(session,f.register(session));
            verify(f.gateway).authenticationFailed(f.binding);
        }
    }
    @Test void recoveryCannotPublishBeforeRegistrationOrRetryAuthenticationWithoutRegistering() throws Exception {
        for(int message:new int[]{0x0200,0x0102,0x0002}) {
            try(var f=new Fixture()) {
                var session=f.session(); session.receive(Jt808TestLock.uplink(0x0102,1,new byte[6]),NOW,ignored->{});
                byte[] body=message==0x0200?Jt808TestLock.location():message==0x0102?new byte[6]:new byte[0];
                assertThrows(IllegalStateException.class,()->session.receive(Jt808TestLock.uplink(message,2,body),NOW,ignored->fail()));
                assertTrue(session.isClosed()); assertFalse(session.active());
                verify(f.gateway,never()).authenticate(any()); verify(f.gateway,never()).report(any(),any(),any(),anyString());
            }
        }
    }
    @Test void recoveryReusesPersistedTokenAndCannotRepeatAfterAnotherFailedAuthentication() throws Exception {
        try(var f=new Fixture()) {
            byte[] issued=f.register(f.session()); byte[] wrong=issued.clone(); wrong[0]^=1;
            var session=f.session(); session.receive(Jt808TestLock.uplink(0x0102,2,wrong),NOW,ignored->{});
            assertFalse(session.isClosed()); assertArrayEquals(issued,f.register(session));
            session.receive(Jt808TestLock.uplink(0x0102,3,wrong),NOW,ignored->{});
            assertTrue(session.isClosed()); assertFalse(session.active());
            assertEquals(HexFormat.of().formatHex(issued),f.store.snapshot().get("token"));
        }
    }
    @Test void malformedTokenAndRecoveryRegistrationWithWrongMacOrExpiredWindowStayRejected() throws Exception {
        try(var f=new Fixture()) {
            var session=f.session(); session.receive(Jt808TestLock.uplink(0x0102,1,new byte[5]),NOW,ignored->{});
            assertTrue(session.isClosed()); verify(f.gateway,never()).authenticate(any());
        }
        for(boolean wrongMac:new boolean[]{true,false}) {
            try(var f=new Fixture()) {
                var session=f.session(); session.receive(Jt808TestLock.uplink(0x0102,1,new byte[6]),NOW,ignored->{});
                byte[] registration=Jt808TestLock.registration(); if(wrongMac)registration[29]^=1;
                var output=new ArrayList<byte[]>();
                session.receive(Jt808TestLock.uplink(0x0100,2,registration),wrongMac?NOW:NOW.plusSeconds(61),output::add);
                assertEquals(1,Jt808TestLock.downlink(output.getFirst()).body()[2]);
                assertTrue(session.isClosed()); assertFalse(f.store.snapshot().containsKey("token"));
                verify(f.gateway,never()).authenticate(any());
            }
        }
    }
    @Test void matchingIssuedTokenCanAuthenticateAfterEnrollmentCloses() throws Exception {
        try(var f=new Fixture()) {
            byte[] issued=f.register(f.session()); var session=f.session(); var output=new ArrayList<byte[]>();
            session.receive(Jt808TestLock.uplink(0x0102,3,issued),NOW.plusSeconds(61),output::add);
            assertEquals(0,Jt808TestLock.downlink(output.getFirst()).body()[4]); assertTrue(session.active());
        }
    }
    @Test void recoveryDoesNotClearOrBypassPlatformBudgetRejection() throws Exception {
        for(var decision:new DeviceAccessAuthBudget.Decision[]{DeviceAccessAuthBudget.Decision.BACKOFF,DeviceAccessAuthBudget.Decision.RATE_LIMITED}) {
            try(var f=new Fixture()) {
                var session=f.session(); session.receive(Jt808TestLock.uplink(0x0102,1,new byte[6]),NOW,ignored->{});
                doThrow(new Jt808ThingsLinkGateway.AuthenticationBudgetRejected(decision)).when(f.gateway).checkAuthenticationBudget(f.binding,"127.0.0.1");
                var rejected=assertThrows(Jt808ThingsLinkGateway.AuthenticationBudgetRejected.class,
                        ()->session.receive(Jt808TestLock.uplink(0x0100,2,Jt808TestLock.registration()),NOW,ignored->fail()));
                assertEquals(decision,rejected.decision()); assertFalse(f.store.snapshot().containsKey("token"));
                verify(f.gateway,never()).authenticate(any()); verify(f.gateway,never()).authenticationSucceeded(any());
            }
        }
    }
    @Test void registeredTimeSyncCannotAuthorizeBusinessAndCorrectTokenIsStillRequired() throws Exception {
        try(var f=new Fixture()) {
            var session=f.session(); byte[] token=f.register(session); var output=new ArrayList<byte[]>();
            session.receive(Jt808TestLock.uplink(0x040f,3,new byte[]{0,0}),NOW,output::add);
            var time=Jt808TestLock.downlink(output.getFirst()); assertEquals(0x840f,time.messageId());
            assertArrayEquals(new byte[]{26,10,28,20,0,0},time.body()); assertFalse(session.active());
            session.receive(Jt808TestLock.uplink(0x040f,4,new byte[]{1,0}),NOW,ignored->fail()); assertFalse(session.active());
            assertThrows(IllegalStateException.class,()->session.receive(Jt808TestLock.uplink(0x0200,5,Jt808TestLock.location()),NOW,ignored->fail()));
            verify(f.gateway,never()).report(any(),any(),any(),anyString());
            f.authenticate(session,token);
            output.clear(); session.receive(Jt808TestLock.uplink(0x040f,6,new byte[]{2,0}),NOW,output::add);
            assertEquals(0x840f,Jt808TestLock.downlink(output.getFirst()).messageId());
            verify(f.gateway,never()).reply(any(),any(),anyString());
        }
    }
    @Test void unregisteredTimeRequestsAndUncorrelatedRegisteredAcksStayRejected() throws Exception {
        try(var f=new Fixture()) {
            assertThrows(IllegalStateException.class,()->f.session().receive(Jt808TestLock.uplink(0x040f,1,new byte[]{0,0}),NOW,ignored->fail()));
            var session=f.session(); f.register(session);
            assertThrows(IllegalStateException.class,()->session.receive(Jt808TestLock.uplink(0x040f,2,new byte[]{1,0}),NOW,ignored->fail()));
            var output=new ArrayList<byte[]>(); session.receive(Jt808TestLock.uplink(0x040f,3,new byte[]{0,0}),NOW,output::add);
            int serial=Jt808TestLock.downlink(output.getFirst()).serial();
            assertThrows(IllegalStateException.class,()->session.receive(Jt808TestLock.uplink(0x0001,4,Jt808Messages.acknowledgement(serial,0x8500,0)),NOW,ignored->fail()));
            session.receive(Jt808TestLock.uplink(0x0001,5,Jt808Messages.acknowledgement(serial,0x840f,0)),NOW,ignored->fail());
            assertFalse(session.active()); verify(f.gateway,never()).report(any(),any(),any(),anyString());
        }
    }
    @Test void explicitFirmwareProbeRunsOnceAfterAuthenticationAndNeverBecomesAControlCommand() throws Exception {
        try(var f=new Fixture()) {
            var session=new Jt808Session(f.binding,f.store,f.gateway,f.coordinator,f.cipher,f.json,"127.0.0.1",null,true);
            byte[] token=f.register(session); var output=new ArrayList<byte[]>();
            assertFalse(f.store.snapshot().containsKey("metadata.firmware-probe"));
            session.receive(Jt808TestLock.uplink(0x0102,2,token),NOW,output::add); assertEquals(1,output.size());
            session.maintain(NOW.plusMillis(999),output::add); assertEquals(1,output.size());
            assertFalse(f.store.snapshot().containsKey("metadata.firmware-probe"));
            session.maintain(NOW.plusSeconds(1),output::add); assertEquals(2,output.size());
            var probe=Jt808TestLock.downlink(output.get(1)); assertEquals(0x8413,probe.messageId()); assertArrayEquals(new byte[]{0,1},probe.body());
            assertTrue(f.store.snapshot().get("metadata.firmware-probe").startsWith("SENT|"));
            output.clear(); session.receive(Jt808TestLock.uplink(0x0413,3,"0223122412".getBytes(java.nio.charset.StandardCharsets.US_ASCII)),NOW,output::add);
            assertEquals(0,Jt808TestLock.downlink(output.getFirst()).body()[4]); assertTrue(f.store.snapshot().containsKey("metadata.firmware-version"));
            var reconnected=new Jt808Session(f.binding,f.store,f.gateway,f.coordinator,f.cipher,f.json,"127.0.0.1",null,true);
            output.clear(); reconnected.receive(Jt808TestLock.uplink(0x0102,4,token),NOW,output::add); assertEquals(1,output.size());
            reconnected.maintain(NOW.plusSeconds(1),output::add); assertEquals(1,output.size());
            verify(f.gateway,never()).reply(any(),any(),anyString());
        }
    }
    @Test void firmwareWriteUnknownIsPreservedAndNotRepeatedAfterReconnect() throws Exception {
        try(var f=new Fixture()) {
            var session=new Jt808Session(f.binding,f.store,f.gateway,f.coordinator,f.cipher,f.json,"127.0.0.1",null,true);
            byte[] token=f.register(session); var sent=new ArrayList<byte[]>();
            session.receive(Jt808TestLock.uplink(0x0102,2,token),NOW,sent::add);
            assertThrows(IOException.class,()->session.maintain(NOW.plusSeconds(1),wire->{
                if(Jt808TestLock.downlink(wire).messageId()==0x8413)throw new IOException("unknown"); sent.add(wire);
            }));
            assertTrue(f.store.snapshot().get("metadata.firmware-probe").startsWith("PREPARED|"));
            var reconnected=new Jt808Session(f.binding,f.store,f.gateway,f.coordinator,f.cipher,f.json,"127.0.0.1",null,true);
            sent.clear(); reconnected.receive(Jt808TestLock.uplink(0x0102,3,token),NOW,sent::add); assertEquals(1,sent.size());
            reconnected.maintain(NOW.plusSeconds(1),sent::add); assertEquals(1,sent.size());
        }
    }
    @Test void namedFirmwareProbePreservesEarlierEvidenceAndDoesNotRepeatAcrossRestart() throws Exception {
        try(var f=new Fixture()) {
            byte[] token=f.register(f.session()); f.store.update(map->map.put("metadata.firmware-probe","SENT|14|earlier"));
            var session=new Jt808Session(f.binding,f.store,f.gateway,f.coordinator,f.cipher,f.json,"127.0.0.1",null,true,"paced-v1");
            var output=new ArrayList<byte[]>(); session.receive(Jt808TestLock.uplink(0x0102,2,token),NOW,output::add);
            session.maintain(NOW.plusSeconds(1),output::add); assertEquals(2,output.size());
            assertEquals("SENT|14|earlier",f.store.snapshot().get("metadata.firmware-probe"));
            assertTrue(f.store.snapshot().get("metadata.firmware-probe.paced-v1").startsWith("SENT|"));
            f.store.close(); f.store=new Jt808StateStore(f.directory,external);
            var restarted=new Jt808Session(f.binding,f.store,f.gateway,f.coordinator,f.cipher,f.json,"127.0.0.1",null,true,"paced-v1");
            output.clear(); restarted.receive(Jt808TestLock.uplink(0x0102,3,token),NOW,output::add);
            restarted.maintain(NOW.plusSeconds(2),output::add); assertEquals(1,output.size());
            assertThrows(IllegalArgumentException.class,()->new Jt808Session(f.binding,f.store,f.gateway,f.coordinator,f.cipher,f.json,"127.0.0.1",null,true,"../other"));
        }
    }
    @Test void deferredFirmwareProbeRechecksCredentialBeforePersistingOrWriting() throws Exception {
        try(var f=new Fixture()) {
            var session=new Jt808Session(f.binding,f.store,f.gateway,f.coordinator,f.cipher,f.json,"127.0.0.1",null,true);
            f.authenticate(session,f.register(session)); when(f.gateway.authenticate(f.binding)).thenThrow(new IllegalStateException("revoked"));
            assertThrows(IllegalStateException.class,()->session.maintain(NOW.plusSeconds(1),ignored->fail()));
            assertFalse(f.store.snapshot().containsKey("metadata.firmware-probe"));
        }
    }
    @Test void sleepNoticeDefersNewCommandsAndHeartbeatDoesNotPretendTheLockBodyIsAwake() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready(); var command=f.command("jt808_query"); assertTrue(session.owns(command));
            session.receive(Jt808TestLock.uplink(0x0001,4,Jt808Messages.acknowledgement(2,0x8418,0)),NOW,ignored->fail());
            assertTrue(session.active()); assertFalse(session.owns(command));
            assertEquals(DeviceAccessPushPort.PushOutcome.DEFERRED_NOT_OWNER,session.push(command,NOW,ignored->fail()));
            assertFalse(f.store.snapshot().containsKey("cmd."+command.commandId()+".state"));
            session.receive(Jt808TestLock.uplink(0x0002,5,new byte[0]),NOW,ignored->{}); assertFalse(session.owns(command));
            byte[] wake=Jt808TestLock.location(); wake[31]=15;
            session.receive(Jt808TestLock.uplink(0x0200,6,wake),NOW.plusSeconds(120),ignored->{}); assertFalse(session.owns(command));
            wake[26]=2; wake[31]=31; session.receive(Jt808TestLock.uplink(0x0200,7,wake),NOW.plusSeconds(120),ignored->{}); assertTrue(session.owns(command));
            verify(f.gateway,never()).reply(any(),any(),anyString());
        }
    }
    @Test void sleepNoticeIsNotAQueryAckAndAlsoDefersUnsentDiagnosticUntilNextConnection() throws Exception {
        try(var f=new Fixture()) {
            var session=new Jt808Session(f.binding,f.store,f.gateway,f.coordinator,f.cipher,f.json,"127.0.0.1",null,true);
            byte[] token=f.register(session); f.authenticate(session,token); var command=f.command("jt808_query");
            var query=f.push(session,command).getFirst();
            session.receive(Jt808TestLock.uplink(0x0001,4,Jt808Messages.acknowledgement(query.serial(),0x8418,0)),NOW,ignored->fail());
            session.maintain(NOW.plusSeconds(2),ignored->fail());
            assertEquals("SENT",f.store.snapshot().get("cmd."+command.commandId()+".state"));
            assertFalse(f.store.snapshot().containsKey("metadata.firmware-probe")); verify(f.gateway,never()).reply(any(),any(),anyString());
            var reconnected=f.session(); f.authenticate(reconnected,token); assertTrue(reconnected.owns(f.command("jt808_query")));
        }
    }
    @Test void unauthenticatedReportAndMalformedRegistrationAreRejected() throws Exception {
        try(var f=new Fixture()) {
            assertThrows(IllegalStateException.class,()->f.session().receive(Jt808TestLock.uplink(0x0200,3,Jt808TestLock.location()),NOW,wire->fail()));
            assertThrows(Jt808ProtocolException.class,()->f.session().receive(Jt808TestLock.uplink(0x0100,3,new byte[58]),NOW,wire->fail()));
            verify(f.gateway,never()).report(any(),any(),any(),anyString());
        }
    }
    @Test void newConnectionFencesOldConnectionAndCredentialVersionCannotBeUpgradedInPlace() throws Exception {
        try(var f=new Fixture()) {
            var old=f.ready(); byte[] token=HexFormat.of().parseHex(f.store.snapshot().get("token")); var current=f.session(); f.authenticate(current,token);
            assertFalse(old.active());
            assertThrows(IllegalStateException.class,()->old.receive(Jt808TestLock.uplink(0x0002,3,new byte[0]),NOW,wire->fail()));
            when(f.gateway.authenticate(f.binding)).thenReturn(new AuthenticatedDeviceIdentity(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),2));
            assertThrows(IllegalStateException.class,()->current.receive(Jt808TestLock.uplink(0x0002,3,new byte[0]),NOW,wire->fail()));
        }
    }
    @Test void revokedCredentialOrBudgetFailureCannotAckHeartbeatOrPublish() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready(); when(f.gateway.authenticate(f.binding)).thenThrow(new IllegalStateException("revoked"));
            assertThrows(IllegalStateException.class,()->session.receive(Jt808TestLock.uplink(0x0002,3,new byte[0]),NOW,wire->fail()));
            verify(f.gateway,never()).report(any(),any(),any(),anyString());
        }
        try(var f=new Fixture()) {
            doThrow(new IllegalStateException("limited")).when(f.gateway).checkAuthenticationBudget(any(),anyString());
            assertThrows(IllegalStateException.class,()->f.register(f.session())); assertFalse(f.store.snapshot().containsKey("token"));
        }
    }
    @Test void reportRetriesKeepAdapterMessageIdAndFrozenPayloadAcrossRestart() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready(); byte[] token=HexFormat.of().parseHex(f.store.snapshot().get("token")),wire=Jt808TestLock.uplink(0x0200,4,Jt808TestLock.location());
            var first=new ArrayList<byte[]>(); session.receive(wire,NOW,first::add); assertEquals(0,Jt808TestLock.downlink(first.getFirst()).body()[4]);
            f.store.close(); f.store=new Jt808StateStore(f.directory,external); var reconnected=f.session(); f.authenticate(reconnected,token);
            reconnected.receive(wire,NOW.plusSeconds(2),ignored->{});
            var payload=ArgumentCaptor.forClass(byte[].class); var time=ArgumentCaptor.forClass(Instant.class);
            verify(f.gateway,times(2)).report(eq(f.identity),payload.capture(),time.capture(),anyString());
            assertArrayEquals(payload.getAllValues().get(0),payload.getAllValues().get(1)); assertEquals(List.of(NOW,NOW),time.getAllValues());
            var parsed=f.json.readTree(payload.getValue()); assertEquals(7,UUID.fromString(parsed.get("messageId").asText()).version());
            assertTrue(parsed.get("payload").get("door_closed").asBoolean()); assertFalse(parsed.get("payload").has("unlock_event"));
        }
    }
    @Test void handoffFailureCannotAckAndRetryKeepsOriginalMessage() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready(); byte[] wire=Jt808TestLock.uplink(0x0200,4,Jt808TestLock.location());
            doThrow(new IllegalStateException("handoff unknown")).doNothing().when(f.gateway).report(any(),any(),any(),anyString());
            assertThrows(IllegalStateException.class,()->session.receive(wire,NOW,ignored->fail()));
            session.receive(wire,NOW.plusSeconds(1),ignored->{});
            var payload=ArgumentCaptor.forClass(byte[].class); verify(f.gateway,times(2)).report(any(),payload.capture(),any(),anyString());
            assertArrayEquals(payload.getAllValues().get(0),payload.getAllValues().get(1));
        }
    }
    @Test void queryAckIsIntermediateAndOnlyMatching0201CompletesCommand() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready(); var command=f.command("jt808_query"); Jt808Frame down=f.push(session,command).getFirst(); assertEquals(0x8201,down.messageId());
            session.receive(Jt808TestLock.uplink(0x0001,8,Jt808Messages.acknowledgement(down.serial(),0x8500,0)),NOW,ignored->fail());
            verify(f.gateway,never()).reply(any(),any(),anyString());
            byte[] ack=Jt808TestLock.uplink(0x0001,9,Jt808Messages.acknowledgement(down.serial(),0x8201,0));
            session.receive(ack,NOW,ignored->fail()); session.receive(ack,NOW,ignored->fail());
            session.receive(Jt808TestLock.uplink(0x0201,10,Jt808TestLock.query(down.serial())),NOW,ignored->{});
            var replies=ArgumentCaptor.forClass(DeviceCommandAccessReplyPort.Reply.class); verify(f.gateway,times(2)).reply(eq(f.identity),replies.capture(),anyString());
            assertEquals(List.of(DeviceCommandAccessReplyPort.Status.ACK,DeviceCommandAccessReplyPort.Status.SUCCESS),replies.getAllValues().stream().map(DeviceCommandAccessReplyPort.Reply::status).toList());
            assertTrue(replies.getAllValues().stream().allMatch(r->r.commandId().equals(command.commandId())));
        }
    }
    @Test void controlAckAndUncorrelatedOpenSnapshotNeverMeanPhysicalSuccess() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready(); var command=f.command("jt808_unlock"); Jt808Frame down=f.push(session,command).getFirst(); assertArrayEquals(new byte[]{1,0},down.body());
            session.receive(Jt808TestLock.uplink(0x0001,8,Jt808Messages.acknowledgement(down.serial(),0x8500,0)),NOW,ignored->fail());
            byte[] state=Jt808TestLock.location(); state[31]=0;
            session.receive(Jt808TestLock.uplink(0x0200,9,state),NOW,ignored->{});
            var reply=ArgumentCaptor.forClass(DeviceCommandAccessReplyPort.Reply.class); verify(f.gateway).reply(any(),reply.capture(),anyString());
            assertEquals(DeviceCommandAccessReplyPort.Status.ACK,reply.getValue().status());
            var output=new ArrayList<byte[]>(); session.maintain(NOW.plusSeconds(31)); session.push(command,NOW.plusSeconds(31),output::add); assertTrue(output.isEmpty());
            assertEquals("UNKNOWN",f.store.snapshot().get("cmd."+command.commandId()+".state"));
        }
    }
    @Test void failedDeviceAckUsesFailedStateAndLateResultCannotReverseIt() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready(); var command=f.command("jt808_query"); Jt808Frame down=f.push(session,command).getFirst();
            session.receive(Jt808TestLock.uplink(0x0001,8,Jt808Messages.acknowledgement(down.serial(),0x8201,1)),NOW,ignored->fail());
            session.receive(Jt808TestLock.uplink(0x0201,9,Jt808TestLock.query(down.serial())),NOW,ignored->{});
            var reply=ArgumentCaptor.forClass(DeviceCommandAccessReplyPort.Reply.class); verify(f.gateway).reply(any(),reply.capture(),anyString());
            assertEquals(DeviceCommandAccessReplyPort.Status.FAILED,reply.getValue().status()); assertEquals("FAILED",f.store.snapshot().get("cmd."+command.commandId()+".state"));
        }
    }
    @Test void writeFailureAndRepeatedPlatformPushNeverRepeatPhysicalAction() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready(); var command=f.command("jt808_unlock");
            assertThrows(IOException.class,()->session.push(command,NOW,wire->{throw new IOException("ambiguous write");}));
            var output=new ArrayList<byte[]>(); session.push(command,NOW.plusSeconds(1),output::add); assertTrue(output.isEmpty());
            var second=f.command("jt808_lock"); assertEquals(DeviceAccessPushPort.PushOutcome.WRITE_FAILED,session.push(second,NOW.plusSeconds(2),output::add));
            assertTrue(output.isEmpty()); var reply=ArgumentCaptor.forClass(DeviceCommandAccessReplyPort.Reply.class);
            verify(f.gateway,never()).reply(any(),any(),anyString());
        }
    }
    @Test void sleepNoticeUsingControlSerialIsNotItsAcknowledgement() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready();var command=f.command("jt808_unlock");var control=f.push(session,command).getFirst();
            session.receive(Jt808TestLock.uplink(0x0001,5,Jt808Messages.acknowledgement(control.serial(),0x8418,0)),NOW,ignored->fail());
            assertEquals("SENT",f.store.snapshot().get("cmd."+command.commandId()+".state"));
            verify(f.gateway,never()).reply(any(),any(),anyString());
            session.maintain(NOW.plusSeconds(31));assertEquals("UNKNOWN",f.store.snapshot().get("cmd."+command.commandId()+".state"));
        }
    }
    @Test void reviewedCurrentLockStateAllowsNewIntentWithoutReplayingOldOrReplyingSuccess() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready();var old=f.command("jt808_unlock");f.push(session,old);session.maintain(NOW.plusSeconds(31));
            var next=f.command("jt808_unlock");var output=new ArrayList<byte[]>();assertEquals(DeviceAccessPushPort.PushOutcome.WRITE_FAILED,session.push(next,NOW,output::add));
            Path evidence=external.resolve("current-locked.json");Files.writeString(evidence,"现场确认当前锁舌伸出");Files.setPosixFilePermissions(evidence,PosixFilePermissions.fromString("rw-------"));
            String digest=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(evidence)));
            Path file=external.resolve("review.json");Files.writeString(file,f.json.writeValueAsString(Map.of("source","OPERATOR","observation","CURRENT_LOCKED",
                    "commandId",old.commandId().toString(),"deviceId",f.identity.deviceId().toString(),"observedAt",NOW.plusSeconds(31).toString(),"evidenceFile",evidence.toString(),"evidenceSha256",digest)));
            Files.setPosixFilePermissions(file,PosixFilePermissions.fromString("rw-------"));Jt808ControlReview.importReview(file,external,f.store,f.json,NOW.plusSeconds(32));
            assertEquals("UNKNOWN",f.store.snapshot().get("cmd."+old.commandId()+".state"));session.push(old,NOW,output::add);assertTrue(output.isEmpty());
            assertEquals(DeviceAccessPushPort.PushOutcome.DELIVERED,session.push(next,NOW,output::add));assertEquals(1,output.size());
            assertArrayEquals(new byte[]{1,0},Jt808TestLock.downlink(output.getFirst()).body());verify(f.gateway,never()).reply(any(),any(),anyString());
        }
    }
    @Test void preparedIntentAfterRestartBecomesUnknownAndIsNeverResent() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready(); var command=f.command("jt808_unlock"); f.push(session,command);
            String key="cmd."+command.commandId()+".state"; f.store.update(map->map.put(key,"PREPARED"));
            byte[] token=HexFormat.of().parseHex(f.store.snapshot().get("token")); f.store.close(); f.store=new Jt808StateStore(f.directory,external);
            var next=f.session(); f.authenticate(next,token); var output=new ArrayList<byte[]>(); next.maintain(NOW); next.push(command,NOW,output::add);
            assertTrue(output.isEmpty()); assertEquals("UNKNOWN",f.store.snapshot().get(key));
        }
    }
    @Test void pendingReplyCanRecoverSameMessageAfterAmbiguousApplyWithoutResendingCommand() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready(); var command=f.command("jt808_query"); var down=f.push(session,command).getFirst();
            when(f.gateway.reply(any(),any(),anyString())).thenThrow(new IllegalStateException("unknown apply")).thenReturn(DeviceCommandAccessReplyPort.Outcome.DUPLICATE);
            byte[] ack=Jt808TestLock.uplink(0x0001,8,Jt808Messages.acknowledgement(down.serial(),0x8201,0));
            assertThrows(IllegalStateException.class,()->session.receive(ack,NOW,ignored->fail()));
            session.receive(ack,NOW.plusSeconds(1),ignored->fail());
            var reply=ArgumentCaptor.forClass(DeviceCommandAccessReplyPort.Reply.class); verify(f.gateway,times(2)).reply(any(),reply.capture(),anyString());
            assertEquals(reply.getAllValues().get(0),reply.getAllValues().get(1));
        }
    }
    @Test void unsupportedCommandAndInvalidInputAreFailedWithoutWireWrite() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready(); assertTrue(f.push(session,f.command("factory_reset")).isEmpty());
            var invalid=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),Uuid7.generate(),"jt808_unlock","{\"extra\":true}",1,NOW.plusSeconds(30));
            assertTrue(f.push(session,invalid).isEmpty()); verify(f.gateway,never()).reply(any(),any(),anyString());
        }
    }
    @Test void platformReplyNotFoundCannotBeReportedAsSuccessful() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready(); var down=f.push(session,f.command("jt808_query")).getFirst();
            when(f.gateway.reply(any(),any(),anyString())).thenReturn(DeviceCommandAccessReplyPort.Outcome.NOT_FOUND);
            assertThrows(IllegalStateException.class,()->session.receive(Jt808TestLock.uplink(0x0001,8,Jt808Messages.acknowledgement(down.serial(),0x8201,0)),NOW,ignored->fail()));
            assertTrue(f.store.snapshot().keySet().stream().noneMatch(k->k.startsWith("reply.") && k.endsWith(".done")));
        }
    }
    @Test void reportRecoveryCannotReplaceOriginalCredentialVersionWithNewAuthentication() throws Exception {
        try(var f=new Fixture()) {
            var first=f.ready(); byte[] report=Jt808TestLock.uplink(0x0200,4,Jt808TestLock.location()); first.receive(report,NOW,ignored->{});
            byte[] token=HexFormat.of().parseHex(f.store.snapshot().get("token"));
            when(f.gateway.authenticate(f.binding)).thenReturn(new AuthenticatedDeviceIdentity(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),2));
            var reconnected=f.session(); f.authenticate(reconnected,token);
            assertThrows(IllegalStateException.class,()->reconnected.receive(report,NOW.plusSeconds(1),ignored->fail()));
            verify(f.gateway,times(1)).report(any(),any(),any(),anyString());
        }
    }
    @Test void foreignScopeAndExpiredCommandCannotReachWireOrProduceFabricatedDeviceReply() throws Exception {
        try(var f=new Fixture()) {
            var session=f.ready(); var wrong=new DeviceAccessPushPort.Push(UUID.randomUUID(),f.identity.projectId(),f.identity.deviceId(),Uuid7.generate(),"jt808_unlock","{}",1,NOW.plusSeconds(20));
            assertEquals(DeviceAccessPushPort.PushOutcome.DEFERRED_NOT_OWNER,session.push(wrong,NOW,ignored->fail()));
            var expired=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),Uuid7.generate(),"jt808_unlock","{}",1,NOW);
            assertEquals(DeviceAccessPushPort.PushOutcome.WRITE_FAILED,session.push(expired,NOW,ignored->fail()));
            var invalid=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),Uuid7.generate(),"jt808_unlock","broken json",1,NOW.plusSeconds(20));
            assertEquals(DeviceAccessPushPort.PushOutcome.WRITE_FAILED,session.push(invalid,NOW,ignored->fail()));
            verify(f.gateway,never()).reply(any(),any(),anyString());
        }
    }
}
