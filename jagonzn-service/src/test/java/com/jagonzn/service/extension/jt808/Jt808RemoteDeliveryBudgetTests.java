package com.jagonzn.service.extension.jt808;

import com.things.link.shared.id.Uuid7;
import java.nio.file.Path;
import java.time.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.node.ObjectNode;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.jagonzn.service.extension.jt808.Jt808RemoteFixture.*;

class Jt808RemoteDeliveryBudgetTests {
    @TempDir Path external;
    static class TestClock extends Clock {
        final AtomicReference<Instant> now=new AtomicReference<>(NOW);
        public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId ignored){return this;}public Instant instant(){return now.get();}
    }
    @Test void idleOrPersistedQueueDoesNotPollManagementButNewWorkStillVerifies()throws Exception{
        try(var f=new Jt808RemoteFixture(external,false)){
            var management=spy(f.management);
            try(var gateway=new Jt808RemoteGateway(f.settings,f.binding,management,f.mqtt,f.outbox,f.json,Clock.fixed(NOW,ZoneOffset.UTC))){
                gateway.authenticate(f.binding);gateway.sessionOpened(1);clearInvocations(management);gateway.tick();gateway.tick();verifyNoInteractions(management);
                var id=Uuid7.generate();f.outbox.property(f.json.writeValueAsBytes(f.property(id)),NOW);gateway.tick();verify(management).verify();assertEquals(2,f.mqtt.sent.size());
                var receipt=f.json.createObjectNode().put("messageId",id.toString()).put("kind","PROPERTY").put("modelVersion","1.0.0").put("status","PERSISTED");f.outbox.receipt("tc/v1/project/lock/down/uplink/receipt",f.json.writeValueAsBytes(receipt));
                clearInvocations(management);gateway.tick();assertFalse(f.outbox.hasPending());verifyNoInteractions(management);
            }
        }
    }
    @Test void rejectionBacksOffWithoutDeletingFactsAndRecoveryUsesOriginalMessage()throws Exception{
        try(var f=new Jt808RemoteFixture(external,false)){
            var management=spy(f.management);var clock=new TestClock();
            try(var gateway=new Jt808RemoteGateway(f.settings,f.binding,management,f.mqtt,f.outbox,f.json,clock)){
                gateway.authenticate(f.binding);gateway.sessionOpened(1);var id=Uuid7.generate();byte[] original=f.json.writeValueAsBytes(f.property(id));f.outbox.property(original,NOW);
                ((ObjectNode)f.reads.get(f.prefix()+"/access-config")).put("configVersion","4");clearInvocations(management);assertThrows(IllegalStateException.class,gateway::tick);verify(management).verify();
                clearInvocations(management);gateway.tick();verifyNoInteractions(management);assertTrue(f.outbox.hasPending());assertTrue(f.mqtt.sent.isEmpty());
                clock.now.set(NOW.plusSeconds(2));assertThrows(IllegalStateException.class,gateway::tick);verify(management).verify();
                ((ObjectNode)f.reads.get(f.prefix()+"/access-config")).put("configVersion","3");clearInvocations(management);clock.now.set(NOW.plusSeconds(3));gateway.tick();verifyNoInteractions(management);
                clock.now.set(NOW.plusSeconds(6));gateway.tick();verify(management).verify();assertArrayEquals(original,f.mqtt.sent.getFirst().getValue());assertTrue(f.outbox.hasPending());
            }
        }
    }
}
