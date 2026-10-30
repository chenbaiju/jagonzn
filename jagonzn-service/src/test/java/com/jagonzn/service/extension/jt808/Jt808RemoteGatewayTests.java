package com.jagonzn.service.extension.jt808;

import com.things.link.shared.id.Uuid7;
import com.things.link.telemetry.application.DeviceCommandAccessReplyPort;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.node.ObjectNode;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.jagonzn.service.extension.jt808.Jt808RemoteFixture.*;

class Jt808RemoteGatewayTests {
    @TempDir Path external;
    @Test void independentManagementReadsOverlapWithoutCachingOrSkippingDeviceType()throws Exception{
        try(var f=new Jt808RemoteFixture(external,false)){
            var barrier=new java.util.concurrent.CountDownLatch(5);var deviceRead=new java.util.concurrent.atomic.AtomicBoolean();var typeRead=new java.util.concurrent.atomic.AtomicBoolean();
            var management=new Jt808RemoteManagement(f.settings,f.binding,path->{
                if(path.contains("/device-types/")){assertEquals(0,barrier.getCount());assertTrue(deviceRead.get());typeRead.set(true);return f.reads.get(path);}
                barrier.countDown();try{assertTrue(barrier.await(2,java.util.concurrent.TimeUnit.SECONDS));}catch(InterruptedException interrupted){Thread.currentThread().interrupt();throw new IllegalStateException();}
                if(path.equals(f.prefix()))deviceRead.set(true);return f.reads.get(path);
            });
            management.verify();assertTrue(typeRead.get());
        }
    }
    @Test void actualCredentialGenerationAndProjectAreRequiredAndOldCloseCannotEndNewSession()throws Exception{
        try(var f=new Jt808RemoteFixture(external,false)){
            assertEquals(9,f.gateway.authenticate(f.binding).credentialVersion());f.gateway.sessionOpened(2);f.gateway.sessionClosed(1);assertTrue(f.mqtt.connected());f.gateway.sessionClosed(2);assertFalse(f.mqtt.connected());
            ((ObjectNode)f.reads.get(f.prefix()+"/access-config")).put("credentialVersion","10");assertThrows(IllegalStateException.class,()->f.gateway.authenticate(f.binding));
        }
    }
    @Test void wrongTenantRoleModelOrProtocolRejectsAuthentication()throws Exception{
        for(String field:List.of("tenantId","projectRole","protocol","model")){
            Path folder=directory(external,"case");try(var f=new Jt808RemoteFixture(folder,false)){
                if(field.equals("protocol"))((ObjectNode)f.reads.get(f.prefix()+"/access-config")).put(field,"TCP");
                else if(field.equals("model"))((ObjectNode)f.reads.get(f.prefix()+"/thing-model-binding").path("version")).put("versionNumber","2.0.0");
                else ((ObjectNode)f.reads.get("/api/v1/auth/me")).put(field,"unexpected");
                assertThrows(IllegalStateException.class,()->f.gateway.authenticate(f.binding));assertFalse(f.mqtt.connected());
            }
        }
    }
    ObjectNode body(Jt808RemoteFixture f){return f.json.createObjectNode().put("targetDeviceKey","lock").put("commandKey","jt808_unlock").put("attempt",1).set("input",f.json.createObjectNode());}
    ObjectNode command(Jt808RemoteFixture f,UUID id){return f.json.createObjectNode().put("id",id.toString()).put("deviceId",f.device.toString()).put("connectionDeviceId",f.device.toString()).put("commandKey","jt808_unlock").put("status","DISPATCHED").put("attemptCount",1).set("input",f.json.createObjectNode());}
    @Test void dispatchNeedsRemoteSameAttemptDeadlineAndEnabledControl()throws Exception{
        for(String mode:List.of("valid","expired","foreign","attempt","terminal","disabled"))try(var f=new Jt808RemoteFixture(directory(external,mode),!mode.equals("disabled"))){
            var server=mock(Jt808TcpServer.class);f.gateway.attach(server);f.gateway.authenticate(f.binding);f.gateway.sessionOpened(1);UUID id=Uuid7.generate();var actual=command(f,id);actual.set("attempts",f.json.createArrayNode().add(f.json.createObjectNode().put("attemptNo",1).put("status","PUBLISHED").put("deadlineAt",(mode.equals("expired")?NOW.minusSeconds(1):NOW.plusSeconds(15)).toString())));
            if(mode.equals("foreign"))actual.put("deviceId",UUID.randomUUID().toString());if(mode.equals("attempt"))actual.put("attemptCount",2);if(mode.equals("terminal"))actual.put("status","TIMED_OUT");f.reads.put(f.prefix()+"/commands/"+id,actual);
            f.gateway.dispatch("tc/v1/project/lock/down/command/"+id,f.json.writeValueAsBytes(body(f)));
            if(mode.equals("valid"))verify(server).push(argThat(p->p.commandId().equals(id)&&p.expiresAt().equals(NOW.plusSeconds(15))));else verifyNoInteractions(server);
        }
    }
    @Test void verifiedCurrentRetryRenewsOnlyWaitAndRejectedRemoteFactsNeverReachSession()throws Exception{
        for(String mode:List.of("valid","terminal","expired","attempt","foreign","input","role"))try(var f=new Jt808RemoteFixture(directory(external,mode),true)){
            var server=mock(Jt808TcpServer.class);when(server.resumeResultWait(any())).thenReturn(true);f.gateway.attach(server);f.gateway.authenticate(f.binding);f.gateway.sessionOpened(1);
            UUID id=Uuid7.generate();var actual=command(f,id).put("attemptCount",2);
            actual.set("attempts",f.json.createArrayNode().add(f.json.createObjectNode().put("attemptNo",2).put("status","PUBLISHED").put("deadlineAt",(mode.equals("expired")?NOW:NOW.plusSeconds(30)).toString())));
            if(mode.equals("terminal"))actual.put("status","TIMED_OUT");if(mode.equals("attempt"))actual.put("attemptCount",3);if(mode.equals("foreign"))actual.put("deviceId",UUID.randomUUID().toString());
            if(mode.equals("input"))actual.set("input",f.json.createObjectNode().put("other",1));
            f.reads.put(f.prefix()+"/commands/"+id,actual);byte[] body=f.json.writeValueAsBytes(body(f).put("attempt",2));
            if(mode.equals("role")){
                ((ObjectNode)f.reads.get("/api/v1/auth/me")).put("projectRole","VIEWER");f.mqtt.callback.accept("tc/v1/project/lock/down/command/"+id,body);assertThrows(IllegalStateException.class,f.gateway::tick);
            }else f.gateway.dispatch("tc/v1/project/lock/down/command/"+id,body);
            if(mode.equals("valid"))verify(server).resumeResultWait(argThat(p->p.commandId().equals(id)&&p.attempt()==2&&p.expiresAt().equals(NOW.plusSeconds(30))));else verifyNoInteractions(server);
            verify(server,never()).push(any());
        }
    }
    @Test void onlyOneUnlockCommandIdCanClaimTheScopeEvenAfterReplays()throws Exception{
        try(var f=new Jt808RemoteFixture(external,true)){
            var server=mock(Jt808TcpServer.class);f.gateway.attach(server);f.gateway.authenticate(f.binding);f.gateway.sessionOpened(1);
            UUID first=Uuid7.generate(),second=Uuid7.generate();
            for(UUID id:List.of(first,second)){var c=command(f,id);c.set("attempts",f.json.createArrayNode().add(f.json.createObjectNode().put("attemptNo",1).put("status","PUBLISHED").put("deadlineAt",NOW.plusSeconds(15).toString())));f.reads.put(f.prefix()+"/commands/"+id,c);}
            byte[] request=f.json.writeValueAsBytes(body(f));f.gateway.dispatch("tc/v1/project/lock/down/command/"+first,request);f.gateway.dispatch("tc/v1/project/lock/down/command/"+second,request);
            assertEquals(first.toString(),f.store.snapshot().get("remote.control.commandId"));verify(server,times(1)).push(argThat(p->p.commandId().equals(first)));verifyNoMoreInteractions(server);
        }
    }
    @Test void publishedReplyRemainsPendingUntilMatchingNativeFinalFact()throws Exception{
        try(var f=new Jt808RemoteFixture(external,true)){
            var identity=f.gateway.authenticate(f.binding);f.gateway.sessionOpened(1);UUID id=Uuid7.generate();var reply=new DeviceCommandAccessReplyPort.Reply(f.tenant,f.project,f.device,id,Uuid7.generate(),DeviceCommandAccessReplyPort.Status.SUCCESS,Map.of("lock_state","OPEN"),null,null,NOW,NOW,"test");var actual=command(f,id);actual.set("output",f.json.valueToTree(Map.of("lock_state","OPEN")));f.reads.put(f.prefix()+"/commands/"+id,actual);
            assertThrows(Jt808PlatformGateway.ReplyPending.class,()->f.gateway.reply(identity,reply,"0".repeat(64)));byte[] frozen=f.mqtt.sent.getLast().getValue();actual.put("status","TIMED_OUT");assertThrows(Jt808PlatformGateway.ReplyPending.class,()->f.gateway.reply(identity,reply,"0".repeat(64)));
            actual.put("status","SUCCEEDED");assertEquals(DeviceCommandAccessReplyPort.Outcome.APPLIED,f.gateway.reply(identity,reply,"0".repeat(64)));assertArrayEquals(frozen,f.mqtt.sent.getLast().getValue());
        }
    }
    @Test void rawWireAuthenticationFailuresAreLocallyBoundedBeforeRemoteRequests()throws Exception{
        try(var f=new Jt808RemoteFixture(external,false)){
            for(int n=0;n<5;n++){f.gateway.checkAuthenticationBudget(f.binding,"127.0.0.1");f.gateway.authenticationFailed(f.binding);}
            assertThrows(Jt808ThingsLinkGateway.AuthenticationBudgetRejected.class,()->f.gateway.checkAuthenticationBudget(f.binding,"127.0.0.1"));
        }
    }
    @Test void remotePropertiesExplicitlyCarryManufacturerContactBasis()throws Exception{
        try(var f=new Jt808RemoteFixture(external,false)){
            var id=Uuid7.generate();var identity=f.gateway.authenticate(f.binding);f.gateway.report(identity,f.json.writeValueAsBytes(f.property(id)),NOW,"trace");
            var body=f.json.readTree(f.json.readTree(f.store.snapshot().get("uplink."+id)).path("payload").asText()).path("payload");
            assertEquals("OPEN",body.path("lock_state").asText());assertEquals("MANUFACTURER_DOOR_CONTACT",body.path("lock_state_source").asText());
        }
    }
    @Test void revokedConfigurationStopsQueuedUplinkAndFrozenResultBeforePublish()throws Exception{
        try(var f=new Jt808RemoteFixture(external,true)){
            var identity=f.gateway.authenticate(f.binding);f.gateway.sessionOpened(1);var id=Uuid7.generate();f.outbox.property(f.json.writeValueAsBytes(f.property(id)),NOW);
            ((ObjectNode)f.reads.get(f.prefix()+"/access-config")).put("configVersion","4");assertThrows(IllegalStateException.class,f.gateway::tick);assertTrue(f.mqtt.sent.isEmpty());
            var reply=new DeviceCommandAccessReplyPort.Reply(f.tenant,f.project,f.device,Uuid7.generate(),Uuid7.generate(),DeviceCommandAccessReplyPort.Status.SUCCESS,Map.of("lock_state","OPEN"),null,null,NOW,NOW,"test");
            assertThrows(Jt808PlatformGateway.ReplyPending.class,()->f.gateway.reply(identity,reply,"0".repeat(64)));assertTrue(f.mqtt.sent.isEmpty());
            assertTrue(f.store.snapshot().containsKey("uplink."+id));assertTrue(f.store.snapshot().containsKey("result."+reply.messageId()));assertFalse(f.store.snapshot().containsKey("result."+reply.messageId()+".done"));
        }
    }
}
