package com.jagonzn.service.extension.jt808;

import com.things.link.shared.id.Uuid7;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import static com.jagonzn.service.extension.jt808.Jt808RemoteFixture.*;

class Jt808RemoteOutboxTests {
    @TempDir Path external;
    @Test void pubackAloneDoesNotCompleteButMatchingBusinessReceiptDoes()throws Exception{
        try(var f=new Jt808RemoteFixture(external,false)){
            var id=Uuid7.generate();f.outbox.property(f.json.writeValueAsBytes(f.property(id)),NOW);f.mqtt.connect();f.outbox.flush(f.mqtt);assertEquals(2,f.mqtt.sent.size());assertFalse(f.store.snapshot().containsKey("uplink."+id+".done"));
            var receipt=f.json.createObjectNode().put("messageId",id.toString()).put("kind","EVENT").put("modelVersion","1.0.0").put("status","PERSISTED");String topic="tc/v1/project/lock/down/uplink/receipt";
            f.outbox.receipt(topic,f.json.writeValueAsBytes(receipt));assertFalse(f.store.snapshot().containsKey("uplink."+id+".done"));receipt.put("kind","PROPERTY");
            f.outbox.receipt("tc/v1/project/other/down/uplink/receipt",f.json.writeValueAsBytes(receipt));assertFalse(f.store.snapshot().containsKey("uplink."+id+".done"));
            f.outbox.receipt(topic,f.json.writeValueAsBytes(receipt));assertEquals("PERSISTED",f.store.snapshot().get("uplink."+id+".done"));f.outbox.flush(f.mqtt);assertEquals(2,f.mqtt.sent.size());
        }
    }
    @Test void retryAndRestartPreserveIdAndBodyWithoutHistoryImport()throws Exception{
        Path root=directory(external,"case");try(var f=new Jt808RemoteFixture(root,false)){
            var id=Uuid7.generate();byte[] original=f.json.writeValueAsBytes(f.property(id));f.outbox.property(original,NOW);f.mqtt.connect();f.outbox.flush(f.mqtt);f.outbox.flush(f.mqtt);assertArrayEquals(f.mqtt.sent.get(0).getValue(),f.mqtt.sent.get(2).getValue());
            assertThrows(IllegalStateException.class,()->f.outbox.property(f.json.writeValueAsBytes(f.property(Uuid7.generate())),NOW.minusSeconds(61)));
            try(var session=new Jt808StateStore(f.stateDirectory,root)){session.update(m->m.put("identity","old-test-identity"));assertThrows(IllegalStateException.class,()->f.settings.bindState(session));}
            f.store.close();try(var reopened=new Jt808StateStore(f.outboxDirectory,root)){var queue=new Jt808RemoteOutbox(reopened,f.settings,f.binding,f.json);int before=f.mqtt.sent.size();queue.flush(f.mqtt);assertArrayEquals(original,f.mqtt.sent.get(before).getValue());}
        }
    }
    @Test void onlyExplicitOpenCloseFactsProduceDistinctStableEvents()throws Exception{
        try(var f=new Jt808RemoteFixture(external,false)){
            f.outbox.event("metadata","AUTHENTICATED",NOW,NOW,Map.of(),"1.0.0");f.outbox.event("inconsistent","UNLOCK_REPORTED",NOW,NOW,Map.of("door_closed",true),"1.0.0");
            f.outbox.event("open","UNLOCK_REPORTED",NOW,NOW,Map.of("door_closed",false),"1.0.0");f.outbox.event("open","UNLOCK_REPORTED",NOW,NOW,Map.of("door_closed",false),"1.0.0");f.outbox.event("close","LOCK_REPORTED",NOW.plusSeconds(2),NOW.plusSeconds(2),Map.of("door_closed",true),"1.0.0");
            var events=f.store.snapshot().entrySet().stream().filter(e->e.getKey().startsWith("uplink.")).toList();assertEquals(2,events.size());assertNotEquals(events.get(0).getKey(),events.get(1).getKey());
        }
    }
    @Test void changedScopePermissionsOrSameMessageDifferentBodyAreRejected()throws Exception{
        try(var f=new Jt808RemoteFixture(external,false)){
            var id=Uuid7.generate();f.outbox.property(f.json.writeValueAsBytes(f.property(id)),NOW);var changed=f.property(id);((tools.jackson.databind.node.ObjectNode)changed.path("payload")).put("door_closed",true);
            assertThrows(IllegalStateException.class,()->f.outbox.property(f.json.writeValueAsBytes(changed),NOW));Files.writeString(f.file,Files.readString(f.file)+" ");assertThrows(IllegalStateException.class,f.settings::requireCurrent);
        }
    }
    @Test void replacedDirectoryCannotReuseAnOldOpenLease()throws Exception{
        Path state=directory(external,"state");try(var store=new Jt808StateStore(state,external)){
            store.update(m->m.put("owned","original"));Path moved=state.resolveSibling(state.getFileName()+"-retained");Files.move(state,moved);Files.createDirectory(state);Files.setPosixFilePermissions(state,java.nio.file.attribute.PosixFilePermissions.fromString("rwx------"));
            assertThrows(IllegalStateException.class,store::snapshot);assertTrue(Files.exists(moved.resolve("adapter-state.properties")));assertFalse(Files.exists(state.resolve("adapter-state.properties")));
        }
    }
    @Test void duplicateDoorReportKeepsFirstCommandAssociationAfterCommandHasFinished()throws Exception{
        try(var f=new Jt808RemoteFixture(external,false)){
            String command=Uuid7.generate().toString();f.outbox.event("open","UNLOCK_REPORTED",NOW,NOW,Map.of("door_closed",false,"related_command_id",command),"1.0.0");var original=f.store.snapshot();
            f.outbox.event("open","UNLOCK_REPORTED",NOW,NOW.plusSeconds(10),Map.of("door_closed",false),"1.0.0");assertEquals(original,f.store.snapshot());
            var event=original.entrySet().stream().filter(e->e.getKey().startsWith("uplink.")).findFirst().orElseThrow();var body=f.json.readTree(f.json.readTree(event.getValue()).path("payload").asText());assertEquals(command,body.path("params").path("related_command_id").asText());
        }
    }
}
