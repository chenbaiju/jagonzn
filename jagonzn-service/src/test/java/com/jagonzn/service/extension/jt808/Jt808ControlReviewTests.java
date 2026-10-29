package com.jagonzn.service.extension.jt808;

import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;

class Jt808ControlReviewTests {
    @TempDir Path external;
    final Instant now=Instant.parse("2026-10-29T02:10:00Z");final ObjectMapper json=new ObjectMapper();
    final UUID command=UUID.randomUUID(),device=UUID.randomUUID();final String prefix="cmd."+command+".";
    Jt808StateStore store() throws Exception {
        Path dir=Files.createTempDirectory(external,"state-");Files.setPosixFilePermissions(dir,PosixFilePermissions.fromString("rwx------"));
        var store=new Jt808StateStore(dir,external);store.update(m->{m.put("identity",UUID.randomUUID()+"|"+UUID.randomUUID()+"|"+device);
            m.put(prefix+"state","UNKNOWN");m.put(prefix+"message","34048");m.put(prefix+"key","jt808_unlock");m.put(prefix+"expires",now.minusSeconds(60).toString());});return store;
    }
    Path privateFile(String name,String body) throws Exception {
        Path p=external.resolve(name);Files.writeString(p,body);Files.setPosixFilePermissions(p,PosixFilePermissions.fromString("rw-------"));return p;
    }
    Map<String,Object> note() throws Exception {
        Path evidence=privateFile("evidence.json","{\"currentState\":\"locked\",\"source\":\"operator\"}");
        var n=new LinkedHashMap<String,Object>();n.put("source","OPERATOR");n.put("observation","CURRENT_LOCKED");n.put("commandId",command.toString());
        n.put("deviceId",device.toString());n.put("observedAt",now.minusSeconds(30).toString());n.put("evidenceFile",evidence.toString());
        n.put("evidenceSha256",HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(evidence))));return n;
    }
    Path write(Map<String,Object> note) throws Exception { return privateFile("review.json",json.writeValueAsString(note)); }
    @Test void reviewIsIdempotentKeepsUnknownAndRejectsChangedOriginal() throws Exception {
        try(var s=store()) {
            var n=note();Path file=write(n);Jt808ControlReview.importReview(file,external,s,json,now);var before=s.snapshot();
            assertEquals("UNKNOWN",before.get(prefix+"state"));assertTrue(Jt808ControlReview.reviewed(before,prefix));
            Jt808ControlReview.importReview(file,external,s,json,now);assertEquals(before,s.snapshot());
            n.put("observedAt",now.minusSeconds(10).toString());write(n);
            assertThrows(IllegalStateException.class,()->Jt808ControlReview.importReview(file,external,s,json,now));assertEquals(before,s.snapshot());
        }
    }
    @Test void anotherDeviceOrCommandAndHistoricalSuccessClaimsCannotResolveUnknown() throws Exception {
        for(String field:new String[]{"deviceId","commandId","source","observation"}) {
            try(var s=store()) {var n=note();n.put(field,field.endsWith("Id")?UUID.randomUUID().toString():"UNLOCK_SUCCEEDED");Path file=write(n);
                assertThrows(IllegalStateException.class,()->Jt808ControlReview.importReview(file,external,s,json,now));assertFalse(Jt808ControlReview.reviewed(s.snapshot(),prefix));}
        }
    }
    @Test void evidenceTamperingPublicPermissionsAndSymlinksAreRejected() throws Exception {
        try(var s=store()) {
            Path file=write(note());Files.writeString(external.resolve("evidence.json"),"tampered");
            assertThrows(IllegalStateException.class,()->Jt808ControlReview.importReview(file,external,s,json,now));
            Path publicFile=write(note());Files.setPosixFilePermissions(publicFile,PosixFilePermissions.fromString("rw-r--r--"));
            assertThrows(IllegalStateException.class,()->Jt808ControlReview.importReview(publicFile,external,s,json,now));
            Files.setPosixFilePermissions(publicFile,PosixFilePermissions.fromString("rw-------"));Path link=external.resolve("link.json");Files.createSymbolicLink(link,publicFile);
            assertThrows(IllegalStateException.class,()->Jt808ControlReview.importReview(link,external,s,json,now));assertFalse(Jt808ControlReview.reviewed(s.snapshot(),prefix));
        }
    }
    @Test void futurePrematureUnfinishedAndWrongMessageRemainBlocked() throws Exception {
        for(String variant:new String[]{"future","past","sent","query"}) {
            try(var s=store()) {
                var n=note();if(variant.equals("future"))n.put("observedAt",now.plusSeconds(1).toString());if(variant.equals("past"))n.put("observedAt",now.minusSeconds(61).toString());
                if(variant.equals("sent"))s.update(m->m.put(prefix+"state","SENT"));if(variant.equals("query"))s.update(m->m.put(prefix+"message","33281"));Path file=write(n);
                assertThrows(IllegalStateException.class,()->Jt808ControlReview.importReview(file,external,s,json,now));
            }
        }
    }
}
