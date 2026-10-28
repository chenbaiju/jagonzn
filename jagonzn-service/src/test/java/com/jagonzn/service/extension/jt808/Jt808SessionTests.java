package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.*;
import com.things.link.shared.id.Uuid7;
import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import com.things.link.telemetry.application.DeviceCommandAccessReplyPort;
import com.things.link.ingestion.application.access.DeviceAccessPushPort;
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
    @Test void badTokenCannotUseStoredPlatformSecretAndClosesConnection() throws Exception {
        try(var f=new Fixture()) {
            var session=f.session(); var output=new ArrayList<byte[]>();
            session.receive(Jt808TestLock.uplink(0x0102,2,new byte[6]),NOW,output::add);
            assertTrue(session.isClosed()); assertEquals(1,Jt808TestLock.downlink(output.getFirst()).body()[4]);
            verify(f.gateway,never()).authenticate(any()); verify(f.gateway).authenticationFailed(f.binding);
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
