package com.jagonzn.service.extension.jt808;

import com.things.link.shared.id.Uuid7;
import com.things.link.shared.message.OriginalPayloadDigest;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;
import static com.jagonzn.service.extension.jt808.Jt808RemoteFixture.*;

class Jt808RemoteStateMigrationTests {
    @TempDir Path external;
    private Jt808DeviceBinding oldBinding(Jt808RemoteFixture f) {
        return new Jt808DeviceBinding(f.binding.terminalId(),f.binding.mac(),"old-project","old-lock","old-synthetic-secret","1.0.0",null,f.binding.properties());
    }
    private Path source(Jt808RemoteFixture f)throws Exception {
        Path p=directory(external,"source");try(var store=new Jt808StateStore(p,external)) {
            store.update(m->{m.put("binding",digest(oldBinding(f)));m.put("identity","old-platform-identity");m.put("token","414243444546");m.put("serial","87");
                m.put("report.old","old-property");m.put("cmd."+Uuid7.generate()+".state","SUCCEEDED");});
        }return p;
    }
    private String digest(Jt808DeviceBinding b) {return OriginalPayloadDigest.of((b.terminalId()+"|"+b.projectKey()+"|"+b.deviceKey()).getBytes(StandardCharsets.UTF_8));}
    private String hash(Path p)throws Exception{return Jt808RemoteSettings.hash(Files.readAllBytes(p.resolve("adapter-state.properties")));}
    private void migrate(Jt808RemoteFixture f,Path p,String hash){Jt808RemoteStateMigration.prepare(external,p,hash,f.settings,oldBinding(f),f.binding);}

    @Test void onlyManufacturerTokenAndSerialMoveAndOriginalBytesStayUntouched()throws Exception {
        try(var f=new Jt808RemoteFixture(external,false)) {
            Path p=source(f);String original=hash(p);migrate(f,p,original);assertEquals(original,hash(p));
            try(var target=new Jt808StateStore(f.stateDirectory,external)) {
                assertEquals(Set.of("remote.scope","binding","token","serial","migration.sourceSha256"),target.snapshot().keySet());
                assertEquals("414243444546",target.snapshot().get("token"));assertEquals("87",target.snapshot().get("serial"));
                assertEquals(digest(f.binding),target.snapshot().get("binding"));f.settings.bindState(target);
                assertFalse(target.snapshot().containsKey("identity"));assertEquals(original,target.snapshot().get("migration.sourceSha256"));
            }
            assertThrows(IllegalStateException.class,()->migrate(f,p,original));assertEquals(original,hash(p));
        }
    }
    @Test void runningSourceLeaseCannotBeCopied()throws Exception {
        try(var f=new Jt808RemoteFixture(external,false)) {
            Path p=source(f);String original=hash(p);
            try(var active=new Jt808StateStore(p,external)){assertThrows(IllegalStateException.class,()->migrate(f,p,original));assertTrue(active.snapshot().containsKey("token"));}
            assertFalse(Files.exists(f.stateDirectory.resolve("adapter-state.properties")));
        }
    }
    @Test void unsettledPhysicalControlOrUnconfirmedReplyCannotDisappearInMigration()throws Exception {
        try(var f=new Jt808RemoteFixture(external,false)) {
            Path p=source(f);String prefix="cmd."+Uuid7.generate()+".";
            try(var store=new Jt808StateStore(p,external)){store.update(m->{m.put(prefix+"state","UNKNOWN");m.put(prefix+"message","34048");});}
            String unknown=hash(p);assertThrows(IllegalStateException.class,()->migrate(f,p,unknown));
            try(var store=new Jt808StateStore(p,external)){store.update(m->{m.put(prefix+"state","SUCCEEDED");m.put("reply."+Uuid7.generate()+".result","pending-old-identity");});}
            String pending=hash(p);assertThrows(IllegalStateException.class,()->migrate(f,p,pending));assertFalse(Files.exists(f.stateDirectory.resolve("adapter-state.properties")));
        }
    }
    @Test void reviewedUnknownKeepsOriginalEvidenceAndNeverBecomesSuccess()throws Exception {
        try(var f=new Jt808RemoteFixture(external,false)) {
            Path p=source(f);String prefix="cmd."+Uuid7.generate()+".";
            try(var store=new Jt808StateStore(p,external)){store.update(m->{m.put(prefix+"state","UNKNOWN");m.put(prefix+"message","34048");m.put(prefix+"physicalReview","OPERATOR_CURRENT_LOCKED|"+NOW+"|"+"a".repeat(64));m.put(prefix+"physicalReviewImportSha256","b".repeat(64));});}
            String original=hash(p);migrate(f,p,original);
            try(var retained=new Jt808StateStore(p,external)){assertEquals("UNKNOWN",retained.snapshot().get(prefix+"state"));assertTrue(Jt808ControlReview.reviewed(retained.snapshot(),prefix));}
            assertEquals(original,hash(p));
        }
    }
    @Test void changedDigestOtherHardwareOrControlsEnabledAreRejected()throws Exception {
        try(var f=new Jt808RemoteFixture(external,false)) {
            Path p=source(f);String original=hash(p);assertThrows(IllegalStateException.class,()->migrate(f,p,"0".repeat(64)));
            byte[] other=f.binding.mac();other[0]^=1;var wrong=new Jt808DeviceBinding(f.binding.terminalId(),other,"project","lock","secret","1.0.0",null,f.binding.properties());
            assertThrows(IllegalStateException.class,()->Jt808RemoteStateMigration.prepare(external,p,original,f.settings,oldBinding(f),wrong));assertEquals(original,hash(p));
        }
        try(var enabled=new Jt808RemoteFixture(external,true)){Path p=source(enabled);String original=hash(p);assertThrows(IllegalStateException.class,()->migrate(enabled,p,original));}
    }
    @Test void explicitlyAuthorizedControlScopeStillCopiesOnlyTokenAndSerial()throws Exception {
        try(var f=new Jt808RemoteFixture(external,true)){
            Path p=source(f);String original=hash(p);Jt808RemoteStateMigration.prepare(external,p,original,f.settings,oldBinding(f),f.binding,true);
            try(var target=new Jt808StateStore(f.stateDirectory,external)){assertEquals("414243444546",target.snapshot().get("token"));assertEquals("87",target.snapshot().get("serial"));assertFalse(target.snapshot().containsKey("identity"));}
            assertEquals(original,hash(p));
        }
    }
}
