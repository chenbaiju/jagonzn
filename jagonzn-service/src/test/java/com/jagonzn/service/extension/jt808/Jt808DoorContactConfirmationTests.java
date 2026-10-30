package com.jagonzn.service.extension.jt808;

import com.jagonzn.service.extension.jt808.protocol.*;
import com.things.link.shared.id.Uuid7;
import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import com.things.link.ingestion.application.access.DeviceAccessPushPort;
import com.things.link.telemetry.application.DeviceCommandAccessReplyPort;
import java.io.IOException;
import java.nio.ByteBuffer;
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

class Jt808DoorContactConfirmationTests {
    static final Instant NOW=Instant.parse("2026-10-28T12:00:00Z");
    @TempDir Path external;
    final ObjectMapper json=new ObjectMapper();
    Path directory(String prefix)throws Exception{return Files.createTempDirectory(external,prefix,PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));}
    final class Fixture implements AutoCloseable {
        final Jt808ThingsLinkGateway gateway=mock(Jt808ThingsLinkGateway.class);
        final AuthenticatedDeviceIdentity identity=new AuthenticatedDeviceIdentity(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),1);
        final Jt808DeviceBinding binding=new Jt808DeviceBinding(Jt808TestLock.TERMINAL,Jt808TestLock.MAC,"project","lock","synthetic-secret","1.0.0",NOW.plusSeconds(60),Map.of("door_closed","door_closed","battery_percent","battery_percent"));
        final Path stateDirectory=directory("state-"),logDirectory=directory("logs-");
        Jt808StateStore store=new Jt808StateStore(stateDirectory,external);
        final Jt808LogJournal journal=new Jt808LogJournal(logDirectory,external,json);
        final Jt808Sm4Cipher cipher=new Jt808Sm4Cipher(Jt808TestLock.KEY,new byte[16]);
        final Jt808SessionCoordinator coordinator=new Jt808SessionCoordinator();
        Jt808Session session;
        byte[] token;
        Fixture()throws Exception {
            when(gateway.authenticate(binding)).thenReturn(identity);when(gateway.reply(any(),any(),anyString())).thenReturn(DeviceCommandAccessReplyPort.Outcome.APPLIED);
            session=create();var output=new ArrayList<byte[]>();session.receive(Jt808TestLock.uplink(0x0100,1,Jt808TestLock.registration()),NOW,output::add);
            token=Arrays.copyOfRange(Jt808TestLock.downlink(output.getFirst()).body(),3,9);authenticate(session);
        }
        Jt808Session create(){return new Jt808Session(binding,store,gateway,coordinator,cipher,json,"127.0.0.1",journal,false,"initial",true);}
        void authenticate(Jt808Session s)throws Exception{s.receive(Jt808TestLock.uplink(0x0102,2,token),NOW,w->{});}
        void baseline(boolean closed)throws Exception{receive(report(15,closed,NOW,10),NOW.plusSeconds(1));}
        void receive(byte[] frame,Instant at)throws Exception{session.receive(frame,at,w->{});}
        DeviceAccessPushPort.Push command(String key){return new DeviceAccessPushPort.Push(identity.tenantId(),identity.projectId(),identity.deviceId(),Uuid7.generate(),key,"{}",1,NOW.plusSeconds(10));}
        DeviceAccessPushPort.Push send(String key)throws Exception{var command=command(key);var output=new ArrayList<byte[]>();assertEquals(DeviceAccessPushPort.PushOutcome.DELIVERED,session.push(command,NOW.plusSeconds(2),output::add));assertEquals(1,output.size());return command;}
        String state(DeviceAccessPushPort.Push command){return store.snapshot().get("cmd."+command.commandId()+".state");}
        @Override public void close(){session.close();store.close();journal.close();cipher.close();}
    }
    byte[] report(int reason,boolean closed,Instant occurred,int serial){return frame(0x0200,reason,closed,occurred,serial);}
    byte[] frame(int mid,int reason,boolean closed,Instant occurred,int serial){
        byte[] body=Jt808TestLock.location();body[30]=0;body[31]=(byte)((reason<<1)|(closed?1:0));var t=occurred.atOffset(ZoneOffset.ofHours(8));
        int[] parts={t.getYear()%100,t.getMonthValue(),t.getDayOfMonth(),t.getHour(),t.getMinute(),t.getSecond()};
        for(int i=0;i<6;i++)body[22+i]=(byte)((parts[i]/10<<4)|(parts[i]%10));
        if(mid==0x0201)body=ByteBuffer.allocate(body.length+2).putShort((short)999).put(body).array();
        return Jt808TestLock.uplink(mid,serial,body);
    }
    @Test void unlockSucceedsFromUniqueFreshTransitionWithoutProtocolAckAndCloseOnlyAddsCycleLink()throws Exception {
        try(var f=new Fixture()){
            f.baseline(true);var command=f.send("jt808_unlock");byte[] opened=report(1,false,NOW.plusSeconds(3),11);
            f.receive(opened,NOW.plusSeconds(4));assertEquals("SUCCEEDED",f.state(command));
            f.receive(report(2,true,NOW.plusSeconds(5),12),NOW.plusSeconds(6));f.receive(opened,NOW.plusSeconds(7));
            var replies=ArgumentCaptor.forClass(DeviceCommandAccessReplyPort.Reply.class);verify(f.gateway,times(1)).reply(eq(f.identity),replies.capture(),anyString());
            var reply=replies.getValue();assertEquals(command.commandId(),reply.commandId());assertEquals(DeviceCommandAccessReplyPort.Status.SUCCESS,reply.status());
            assertEquals(false,reply.output().get("protocol_ack_received"));assertEquals("OPEN",reply.output().get("lock_state"));
            assertEquals("MANUFACTURER_DOOR_CONTACT_TRANSITION",reply.output().get("confirmation_basis"));
            assertEquals(false,reply.output().get("device_command_id_present"));assertEquals(NOW.plusSeconds(3),reply.occurredAt());assertEquals(NOW.plusSeconds(4),reply.receivedAt());
            var events=f.journal.pending().stream().map(e->json.readTree(e.json())).filter(e->List.of("UNLOCK_REPORTED","LOCK_REPORTED").contains(e.path("payload").path("logType").asText())).toList();
            assertEquals(2,events.size());assertTrue(events.stream().allMatch(e->e.path("payload").path("details").path("related_command_id").asText().equals(command.commandId().toString())));
            f.session.maintain(NOW.plusSeconds(30));assertEquals("SUCCEEDED",f.state(command));
            assertEquals(DeviceAccessPushPort.PushOutcome.DEFERRED_NOT_OWNER,f.session.push(command,NOW.plusSeconds(3),w->fail()));
        }
    }
    @Test void closeCommandUsesOnlyNewCloseTransitionAndAckRemainsAnIndependentFact()throws Exception {
        try(var f=new Fixture()){
            f.baseline(false);var command=f.send("jt808_lock");String prefix="cmd."+command.commandId()+".";
            int serial=Integer.parseInt(f.store.snapshot().get(prefix+"serial"));f.receive(Jt808TestLock.uplink(0x0001,11,Jt808Messages.acknowledgement(serial,0x8500,0)),NOW.plusSeconds(3));
            f.receive(report(2,true,NOW.plusSeconds(4),12),NOW.plusSeconds(5));assertEquals("SUCCEEDED",f.state(command));
            var replies=ArgumentCaptor.forClass(DeviceCommandAccessReplyPort.Reply.class);verify(f.gateway,times(2)).reply(any(),replies.capture(),anyString());
            assertEquals(DeviceCommandAccessReplyPort.Status.ACK,replies.getAllValues().getFirst().status());
            assertEquals(true,replies.getAllValues().getLast().output().get("protocol_ack_received"));assertEquals("CLOSED",replies.getAllValues().getLast().output().get("lock_state"));
        }
    }
    @Test void closeCycleKeepsItsCommandLinkWhileRemoteFinalReadbackIsPending()throws Exception {
        try(var f=new Fixture()){
            var applied=new java.util.concurrent.atomic.AtomicBoolean();when(f.gateway.reply(any(),any(),anyString())).thenAnswer(call->{if(!applied.get())throw new Jt808PlatformGateway.ReplyPending();return DeviceCommandAccessReplyPort.Outcome.APPLIED;});
            f.baseline(true);var command=f.send("jt808_unlock");f.receive(report(1,false,NOW.plusSeconds(3),11),NOW.plusSeconds(4));assertEquals("CONFIRMED_PENDING",f.state(command));
            f.receive(report(2,true,NOW.plusSeconds(5),12),NOW.plusSeconds(6));
            var closed=f.journal.pending().stream().map(e->json.readTree(e.json())).filter(e->e.path("payload").path("logType").asText().equals("LOCK_REPORTED")).findFirst().orElseThrow();assertEquals(command.commandId().toString(),closed.path("payload").path("details").path("related_command_id").asText());assertEquals("CONFIRMED_PENDING",f.state(command));
            applied.set(true);f.session.maintain(NOW.plusSeconds(7));assertEquals("SUCCEEDED",f.state(command));
        }
    }
    @Test void missingOldOrAlreadyTargetBaselineNeverSendsPhysicalControl()throws Exception {
        for(int mode=0;mode<3;mode++)try(var f=new Fixture()){
            if(mode!=0)f.baseline(mode==1);Instant sent=mode==1?NOW.plusSeconds(40):NOW.plusSeconds(2);
            var command=f.command("jt808_unlock");assertEquals(DeviceAccessPushPort.PushOutcome.WRITE_FAILED,f.session.push(command,sent,w->fail()));assertNull(f.state(command));
        }
    }
    @Test void anotherPendingControlCannotBeSentOrAmbiguouslyMatched()throws Exception {
        try(var f=new Fixture()){
            f.baseline(true);var first=f.send("jt808_unlock");var second=f.command("jt808_unlock");
            assertEquals(DeviceAccessPushPort.PushOutcome.WRITE_FAILED,f.session.push(second,NOW.plusSeconds(3),w->fail()));assertNull(f.state(second));
            f.store.update(m->{String p="cmd."+second.commandId()+".";m.put(p+"state","SENT");m.put(p+"message","34048");m.put(p+"expires",NOW.plusSeconds(10).toString());});
            f.receive(report(1,false,NOW.plusSeconds(3),11),NOW.plusSeconds(4));assertEquals("SENT",f.state(first));verify(f.gateway,never()).reply(any(),any(),anyString());
        }
    }
    @Test void queryOldFutureUnchangedAndOutOfOrderReportsNeverFinishControl()throws Exception {
        for(String variant:List.of("query","old","future","unchanged","serial","presend"))try(var f=new Fixture()){
            f.baseline(true);var command=f.send("jt808_unlock");Instant time=variant.equals("old")?NOW.minusSeconds(5):variant.equals("future")?NOW.plusSeconds(8):variant.equals("presend")?NOW.plusSeconds(1):NOW.plusSeconds(3);
            byte[] data=frame(variant.equals("query")?0x0201:0x0200,1,variant.equals("unchanged"),time,variant.equals("serial")?9:11);
            f.receive(data,NOW.plusSeconds(4));assertEquals("SENT",f.state(command),variant);verify(f.gateway,never()).reply(any(),any(),anyString());
        }
    }
    @Test void alarmPasswordCardAndTimedTransitionsInvalidateRatherThanCompleteControl()throws Exception {
        for(int reason:new int[]{0,10,12,14,15})try(var f=new Fixture()){
            f.baseline(true);var command=f.send("jt808_unlock");f.receive(report(reason,false,NOW.plusSeconds(3),11),NOW.plusSeconds(4));
            f.receive(report(15,true,NOW.plusSeconds(5),12),NOW.plusSeconds(6));f.receive(report(1,false,NOW.plusSeconds(7),13),NOW.plusSeconds(8));
            assertEquals("SENT",f.state(command));assertTrue(f.store.snapshot().containsKey("cmd."+command.commandId()+".contact.invalidated"));verify(f.gateway,never()).reply(any(),any(),anyString());
        }
    }
    @Test void elapsedDeadlineWriteUncertaintyAndReconnectionNeverAdoptNewStateAsOldSuccess()throws Exception {
        for(String variant:List.of("late","write","reconnect"))try(var f=new Fixture()){
            f.baseline(true);var command=f.command("jt808_unlock");
            if(variant.equals("write"))assertThrows(IOException.class,()->f.session.push(command,NOW.plusSeconds(2),w->{throw new IOException("uncertain");}));
            else f.session.push(command,NOW.plusSeconds(2),w->{});
            if(variant.equals("reconnect")){f.session.close();f.session=f.create();f.authenticate(f.session);}
            f.receive(report(1,false,variant.equals("late")?NOW.plusSeconds(9):NOW.plusSeconds(3),11),variant.equals("late")?NOW.plusSeconds(10):NOW.plusSeconds(4));
            assertNotEquals("SUCCEEDED",f.state(command));verify(f.gateway,never()).reply(any(),any(),anyString());
            assertEquals(DeviceAccessPushPort.PushOutcome.DEFERRED_NOT_OWNER,f.session.push(command,NOW.plusSeconds(5),w->fail()));
        }
    }
    @Test void publicLockTimelineExpiresOriginalAttemptDespitePlatformRetryWithoutResending()throws Exception {
        try(var f=new Fixture()){
            f.baseline(true);var id=Uuid7.generate();Instant accepted=NOW.plusSeconds(10);
            Instant sent=accepted.plusNanos(2_354_907_000L),deadline=accepted.plusSeconds(20);
            var first=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),id,"jt808_unlock","{}",1,deadline);
            var physical=new ArrayList<byte[]>();assertEquals(DeviceAccessPushPort.PushOutcome.DELIVERED,f.session.push(first,sent,physical::add));
            f.session.maintain(deadline);assertEquals("UNKNOWN",f.state(first));
            var retry=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),id,"jt808_unlock","{}",2,accepted.plusNanos(40_685_427_000L));
            assertEquals(DeviceAccessPushPort.PushOutcome.DEFERRED_NOT_OWNER,f.session.push(retry,accepted.plusNanos(20_685_427_000L),physical::add));
            assertEquals(deadline.toString(),f.store.snapshot().get("cmd."+id+".expires"));assertEquals(1,physical.size());
            f.receive(report(1,false,accepted.plusNanos(34_473_410_000L),11),accepted.plusNanos(36_331_848_000L));
            f.receive(report(2,true,accepted.plusNanos(39_473_410_000L),12),accepted.plusNanos(41_283_325_000L));
            assertEquals("UNKNOWN",f.state(first));verify(f.gateway,never()).reply(any(),any(),anyString());
            var events=f.journal.pending().stream().map(e->json.readTree(e.json())).filter(e->List.of("UNLOCK_REPORTED","LOCK_REPORTED").contains(e.path("payload").path("logType").asText())).toList();
            assertEquals(2,events.size());assertTrue(events.stream().noneMatch(e->e.path("payload").path("details").has("related_command_id")));
        }
    }
    @Test void sameFreshReportIntervalsCanMatchWhenOriginalDeadlineHasNotElapsed()throws Exception {
        try(var f=new Fixture()){
            f.baseline(true);Instant accepted=NOW.plusSeconds(10);var id=Uuid7.generate();
            var command=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),id,"jt808_unlock","{}",1,accepted.plusSeconds(60));
            var physical=new ArrayList<byte[]>();assertEquals(DeviceAccessPushPort.PushOutcome.DELIVERED,f.session.push(command,accepted.plusNanos(2_354_907_000L),physical::add));
            f.receive(report(1,false,accepted.plusNanos(34_473_410_000L),11),accepted.plusNanos(36_331_848_000L));
            f.receive(report(2,true,accepted.plusNanos(39_473_410_000L),12),accepted.plusNanos(41_283_325_000L));
            assertEquals("SUCCEEDED",f.state(command));assertEquals(1,physical.size());verify(f.gateway,times(1)).reply(any(),any(),anyString());
            var events=f.journal.pending().stream().map(e->json.readTree(e.json())).filter(e->List.of("UNLOCK_REPORTED","LOCK_REPORTED").contains(e.path("payload").path("logType").asText())).toList();
            assertEquals(2,events.size());assertTrue(events.stream().allMatch(e->e.path("payload").path("details").path("related_command_id").asText().equals(id.toString())));
        }
    }
    @Test void verifiedRetryResumesOriginalTimelineAndLinksCloseWithOnlyOnePhysicalWrite()throws Exception {
        try(var f=new Fixture()){
            f.baseline(true);var id=Uuid7.generate();Instant accepted=NOW.plusSeconds(10),sent=accepted.plusNanos(2_354_907_000L),deadline=accepted.plusSeconds(20);
            var first=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),id,"jt808_unlock","{}",1,deadline);
            var physical=new ArrayList<byte[]>();f.session.push(first,sent,physical::add);String prefix="cmd."+id+".";String serial=f.store.snapshot().get(prefix+"serial");
            f.session.maintain(deadline);assertEquals("RESULT_WAIT_EXPIRED",f.store.snapshot().get(prefix+"unknownReason"));
            var retry=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),id,"jt808_unlock","{}",2,accepted.plusNanos(40_685_427_000L));
            assertTrue(f.session.resumeResultWait(retry,accepted.plusNanos(21_694_450_000L)));
            assertFalse(f.session.resumeResultWait(retry,accepted.plusSeconds(22)));assertEquals("SENT",f.state(first));
            f.receive(report(1,false,accepted.plusNanos(34_473_410_000L),11),accepted.plusNanos(36_331_848_000L));
            f.receive(report(2,true,accepted.plusNanos(39_473_410_000L),12),accepted.plusNanos(41_283_325_000L));
            assertEquals("SUCCEEDED",f.state(first));assertEquals(1,physical.size());assertEquals(serial,f.store.snapshot().get(prefix+"serial"));
            assertEquals(sent.toString(),f.store.snapshot().get(prefix+"contact.sent"));assertEquals(deadline.toString(),f.store.snapshot().get(prefix+"originalExpires"));
            var replies=ArgumentCaptor.forClass(DeviceCommandAccessReplyPort.Reply.class);verify(f.gateway,times(1)).reply(any(),replies.capture(),anyString());
            assertEquals(id,replies.getValue().commandId());assertEquals(2,replies.getValue().output().get("command_attempt"));
            var events=f.journal.pending().stream().map(e->json.readTree(e.json())).filter(e->List.of("UNLOCK_REPORTED","LOCK_REPORTED").contains(e.path("payload").path("logType").asText())).toList();
            assertEquals(2,events.size());assertTrue(events.stream().allMatch(e->e.path("payload").path("details").path("related_command_id").asText().equals(id.toString())));
            assertFalse(f.session.resumeResultWait(new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),id,"jt808_unlock","{}",3,accepted.plusSeconds(60)),accepted.plusSeconds(42)));
        }
    }
    @Test void resumeRejectsUncertaintyReconnectionDifferentIdentityInvalidAttemptAndUnboundedDeadline()throws Exception {
        for(String variant:List.of("write","prepared","reconnect","version","tenant","project","device","id","key","input","malformed","attempt","deadline","bound","failed","confirmed","legacy","pending","reviewed","sleep","lateFailure"))try(var f=new Fixture()){
            f.baseline(true);var first=f.command("jt808_unlock");String prefix="cmd."+first.commandId()+".";
            if(variant.equals("write"))assertThrows(IOException.class,()->f.session.push(first,NOW.plusSeconds(2),w->{throw new IOException("uncertain");}));
            else f.session.push(first,NOW.plusSeconds(2),w->{});
            if(variant.equals("reconnect")){f.session.close();f.session=f.create();f.authenticate(f.session);}
            f.session.maintain(NOW.plusSeconds(10));
            if(variant.equals("sleep"))f.receive(Jt808TestLock.uplink(0x0001,11,Jt808Messages.acknowledgement(1,0x8418,0)),NOW.plusSeconds(10));
            if(variant.equals("lateFailure"))f.receive(Jt808TestLock.uplink(0x0001,11,Jt808Messages.acknowledgement(Integer.parseInt(f.store.snapshot().get(prefix+"serial")),0x8500,1)),NOW.plusSeconds(10));
            f.store.update(m->{switch(variant){
                case "prepared" -> m.put(prefix+"unknownReason","PREPARED_UNCERTAIN");
                case "version" -> m.put(prefix+"contact.version","2");
                case "failed" -> m.put(prefix+"state","FAILED");
                case "confirmed" -> m.put(prefix+"state","CONFIRMED_PENDING");
                case "legacy" -> m.remove(prefix+"unknownReason");
                case "reviewed" -> m.put(prefix+"physicalReview","OPERATOR_CURRENT_LOCKED");
                case "pending" -> {String other="cmd."+Uuid7.generate()+".";m.put(other+"state","SENT");m.put(other+"message","34048");m.put(other+"expires",NOW.plusSeconds(40).toString());}
            }});
            var retry=new DeviceAccessPushPort.Push(variant.equals("tenant")?UUID.randomUUID():f.identity.tenantId(),variant.equals("project")?UUID.randomUUID():f.identity.projectId(),variant.equals("device")?UUID.randomUUID():f.identity.deviceId(),variant.equals("id")?Uuid7.generate():first.commandId(),variant.equals("key")?"jt808_lock":"jt808_unlock",variant.equals("malformed")?"{":variant.equals("input")?"{\"x\":1}":"{}",variant.equals("attempt")?1:2,variant.equals("bound")?NOW.plusSeconds(303):variant.equals("deadline")?NOW.plusSeconds(10):NOW.plusSeconds(30));
            assertFalse(f.session.resumeResultWait(retry,NOW.plusSeconds(11)),variant);assertEquals(first.expiresAt().toString(),f.store.snapshot().get(prefix+"expires"),variant);verify(f.gateway,never()).reply(any(),any(),anyString());
        }
    }
    @Test void expiredGapOperationAndReportsGeneratedBeforeResumptionNeverFinishCommand()throws Exception {
        for(String variant:List.of("gap","old","presend","duplicate","beforeResume"))try(var f=new Fixture()){
            f.baseline(true);var first=f.send("jt808_unlock");f.session.maintain(NOW.plusSeconds(10));
            if(variant.equals("gap")){
                f.receive(report(1,false,NOW.plusSeconds(11),11),NOW.plusSeconds(12));f.receive(report(2,true,NOW.plusSeconds(13),12),NOW.plusSeconds(14));
            }
            var retry=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),first.commandId(),"jt808_unlock","{}",2,NOW.plusSeconds(30));
            assertEquals(!variant.equals("gap"),f.session.resumeResultWait(retry,NOW.plusMillis(15500)));
            Instant occurred=variant.equals("presend")?NOW.plusSeconds(1):variant.equals("old")?NOW.plusSeconds(10):NOW.plusSeconds(15);
            f.receive(report(1,false,occurred,variant.equals("duplicate")?10:13),NOW.plusSeconds(16));
            assertNotEquals("SUCCEEDED",f.state(first));verify(f.gateway,never()).reply(any(),any(),anyString());
        }
    }
    @Test void retryRetainsAckAndOriginalSendEvidenceBeforeOrAfterDeadline()throws Exception {
        for(boolean expired:List.of(false,true))try(var f=new Fixture()){
            f.baseline(true);var first=f.send("jt808_unlock");String prefix="cmd."+first.commandId()+".";
            int serial=Integer.parseInt(f.store.snapshot().get(prefix+"serial"));f.receive(Jt808TestLock.uplink(0x0001,11,Jt808Messages.acknowledgement(serial,0x8500,0)),NOW.plusSeconds(3));
            var retry=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),first.commandId(),"jt808_unlock","{}",2,NOW.plusSeconds(30));
            assertTrue(f.session.resumeResultWait(retry,NOW.plusSeconds(expired?11:4)));assertEquals("ACKNOWLEDGED",f.state(first));
            f.receive(report(1,false,NOW.plusSeconds(12),12),NOW.plusSeconds(13));assertEquals("SUCCEEDED",f.state(first));
            var replies=ArgumentCaptor.forClass(DeviceCommandAccessReplyPort.Reply.class);verify(f.gateway,times(2)).reply(any(),replies.capture(),anyString());assertEquals(true,replies.getAllValues().getLast().output().get("protocol_ack_received"));
        }
    }
    @Test void repeatedRetriesAreMonotonicAndBoundedFromOriginalSend()throws Exception {
        try(var f=new Fixture()){
            f.baseline(true);var first=f.send("jt808_unlock");String prefix="cmd."+first.commandId()+".";
            for(int attempt=2;attempt<=3;attempt++) {
                var retry=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),first.commandId(),"jt808_unlock","{}",attempt,NOW.plusSeconds(attempt==2?30:50));
                assertTrue(f.session.resumeResultWait(retry,NOW.plusSeconds(attempt==2?11:31)));
                assertFalse(f.session.resumeResultWait(retry,NOW.plusSeconds(attempt==2?12:32)));
            }
            assertEquals(NOW.plusSeconds(10).toString(),f.store.snapshot().get(prefix+"originalExpires"));
            var unbounded=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),first.commandId(),"jt808_unlock","{}",4,NOW.plusSeconds(303));
            assertFalse(f.session.resumeResultWait(unbounded,NOW.plusSeconds(32)));assertFalse(f.session.resumeResultWait(unbounded,NOW.plusSeconds(302)));
            assertEquals(NOW.plusSeconds(50).toString(),f.store.snapshot().get(prefix+"expires"));verify(f.gateway,never()).reply(any(),any(),anyString());
        }
    }
    @Test void retryDeadlineIsCheckedAfterCurrentIdentityVerificationCompletes()throws Exception {
        try(var f=new Fixture()){
            f.baseline(true);var first=f.send("jt808_unlock");var time=new java.util.concurrent.atomic.AtomicReference<>(NOW.plusSeconds(11));
            var retry=new DeviceAccessPushPort.Push(f.identity.tenantId(),f.identity.projectId(),f.identity.deviceId(),first.commandId(),"jt808_unlock","{}",2,NOW.plusSeconds(30));
            when(f.gateway.authenticate(f.binding)).thenAnswer(call->{time.set(NOW.plusSeconds(31));return f.identity;});
            assertFalse(f.session.resumeResultWait(retry,time::get));assertEquals("UNKNOWN",f.state(first));
            assertEquals(first.expiresAt().toString(),f.store.snapshot().get("cmd."+first.commandId()+".expires"));verify(f.gateway,never()).reply(any(),any(),anyString());
        }
    }
    @Test void frozenConfirmationRecoversAcrossProcessRestartWithSameOriginalIdentityMessageAndTimes()throws Exception {
        try(var f=new Fixture()){
            f.baseline(true);var command=f.send("jt808_unlock");when(f.gateway.reply(any(),any(),anyString())).thenThrow(new IllegalStateException("unknown apply")).thenReturn(DeviceCommandAccessReplyPort.Outcome.DUPLICATE);
            assertThrows(IllegalStateException.class,()->f.receive(report(1,false,NOW.plusSeconds(3),11),NOW.plusSeconds(4)));
            assertEquals("CONFIRMED_PENDING",f.state(command));f.session.close();f.store.close();f.store=new Jt808StateStore(f.stateDirectory,external);f.session=f.create();f.authenticate(f.session);
            assertEquals("SUCCEEDED",f.state(command));var replies=ArgumentCaptor.forClass(DeviceCommandAccessReplyPort.Reply.class);verify(f.gateway,times(2)).reply(eq(f.identity),replies.capture(),anyString());
            assertEquals(replies.getAllValues().getFirst(),replies.getAllValues().getLast());assertEquals(NOW.plusSeconds(3),replies.getAllValues().getLast().occurredAt());
            assertEquals(DeviceAccessPushPort.PushOutcome.DEFERRED_NOT_OWNER,f.session.push(command,NOW.plusSeconds(5),w->fail()));
        }
    }
    @Test void rejectedPlatformReplyPreservesEvidenceWithoutClaimingSuccessOrRepeatingControl()throws Exception {
        try(var f=new Fixture()){
            f.baseline(true);var command=f.send("jt808_unlock");when(f.gateway.reply(any(),any(),anyString())).thenReturn(DeviceCommandAccessReplyPort.Outcome.NOT_FOUND);
            assertThrows(IllegalStateException.class,()->f.receive(report(1,false,NOW.plusSeconds(3),11),NOW.plusSeconds(4)));
            assertEquals("CONFIRMED_PENDING",f.state(command));assertTrue(f.store.snapshot().containsKey("cmd."+command.commandId()+".contact.evidence"));
            assertEquals(DeviceAccessPushPort.PushOutcome.DEFERRED_NOT_OWNER,f.session.push(command,NOW.plusSeconds(5),w->fail()));
        }
    }
    @Test void consumedReportCannotCompleteTheNextCommandAndSecondPrecisionDoesNotInventANewTimestamp()throws Exception {
        try(var f=new Fixture()){
            f.baseline(true);var first=f.send("jt808_unlock");byte[] opened=report(1,false,NOW.plusSeconds(2),11);
            f.receive(opened,NOW.plusMillis(2500));assertEquals("SUCCEEDED",f.state(first));f.receive(report(2,true,NOW.plusSeconds(3),12),NOW.plusSeconds(4));
            var next=f.command("jt808_unlock");f.session.push(next,NOW.plusSeconds(5),w->{});f.receive(opened,NOW.plusSeconds(6));assertEquals("SENT",f.state(next));
            var replies=ArgumentCaptor.forClass(DeviceCommandAccessReplyPort.Reply.class);verify(f.gateway,times(1)).reply(any(),replies.capture(),anyString());
            assertEquals(NOW.plusSeconds(2),replies.getValue().occurredAt());
        }
    }
}
