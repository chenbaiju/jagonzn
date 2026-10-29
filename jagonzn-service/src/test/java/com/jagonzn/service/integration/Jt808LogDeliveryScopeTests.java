package com.jagonzn.service.integration;

import com.jagonzn.service.extension.jt808.Jt808LogJournal;
import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import java.net.URI;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.ObjectMapper;
import static com.jagonzn.service.integration.Jt808LogDeliveryFixtures.*;
import static org.junit.jupiter.api.Assertions.*;

/** 覆盖真实首因、旧批次饥饿、身份与时间边界、持久重启及运行时范围变更。 */
class Jt808LogDeliveryScopeTests {
    @TempDir Path external;
    final ObjectMapper json=new ObjectMapper();
    final AuthenticatedDeviceIdentity identity=identity();
    final UUID source=UUID.randomUUID();

    Jt808LogForwarder forwarder(Jt808LogJournal journal,Jt808LogDeliveryScope scope,PrivateCloudEventForwarder.Transport transport){return new Jt808LogForwarder(journal,json,URL,source.toString(),"test",SECRET,scope,transport);}
    Jt808LogDeliveryScope load(Jt808LogJournal journal,Path file){return new Jt808LogDeliveryScope(journal,json,file.toString(),URL,source.toString());}
    long markers(Path directory)throws Exception{try(var files=Files.list(directory)){return files.filter(p->p.toString().endsWith(".accepted")).count();}}

    @Test void fiftyEightOldPendingEventsDoNotBlockNewEventsOrGainAcceptanceMarkers()throws Exception{
        Path path=directory(external);var sent=new ArrayList<String>();var before=new HashMap<Path,byte[]>();
        try(var journal=new Jt808LogJournal(path,external,json)){
            for(int n=0;n<58;n++)append(journal,identity,"old-"+n,"UNLOCK_REPORTED",NOW.minusSeconds(1));
            try(var files=Files.list(path)){for(Path p:files.filter(p->p.toString().endsWith(".json")).toList())before.put(p,Files.readAllBytes(p));}
            var scope=scope(journal,source,identity,58,json);var sender=forwarder(journal,scope,(url,src,key,time,nonce,id,signature,body)->{sent.add(new String(body,java.nio.charset.StandardCharsets.UTF_8));return 200;});
            try{
                sender.flush();assertTrue(sent.isEmpty());assertEquals(0,markers(path));
                append(journal,identity,"new-open","UNLOCK_REPORTED",NOW);append(journal,identity,"new-close","LOCK_REPORTED",NOW.plusSeconds(2));
                sender.flush();sender.flush();assertEquals(2,sent.size());assertEquals(2,markers(path));
                assertEquals(List.of(59L,60L),sent.stream().map(body->json.readTree(body).path("event").path("sourceSequence").asLong()).toList());
                for(var entry:before.entrySet()){assertArrayEquals(entry.getValue(),Files.readAllBytes(entry.getKey()));assertFalse(Files.exists(entry.getKey().resolveSibling(entry.getKey().getFileName()+".accepted")));}
            }finally{sender.close();}
        }
    }

    @Test void freshScopeCannotStartAtZeroInAnOldDirectoryOrPretendADeletedCounterIsEmpty()throws Exception{
        Path path=directory(external);
        try(var journal=new Jt808LogJournal(path,external,json)){
            append(journal,identity,"old","UNLOCK_REPORTED",NOW);Path file=write(external,configuration(path,source,identity,0),json);
            assertThrows(IllegalStateException.class,()->load(journal,file));assertEquals(0,markers(path));
            Files.delete(path.resolve("sequence.txt"));assertThrows(IllegalStateException.class,()->load(journal,file));assertEquals(0,markers(path));
        }
    }

    @Test void identityTypesAndInclusiveTimeBoundariesLimitDeliveryWithoutAcceptingExcludedEvents()throws Exception{
        Path path=directory(external);var sent=new ArrayList<String>();
        try(var journal=new Jt808LogJournal(path,external,json)){
            var scope=scope(journal,source,identity,0,json);
            append(journal,identity,"start","UNLOCK_REPORTED",NOW.minusSeconds(60));append(journal,identity,"end","LOCK_REPORTED",NOW.plusSeconds(60));
            append(journal,identity,"before","UNLOCK_REPORTED",NOW.minusSeconds(61));append(journal,identity,"after","LOCK_REPORTED",NOW.plusSeconds(61));
            append(journal,identity,"other-kind","AUTHENTICATED",NOW);
            for(var other:List.of(new AuthenticatedDeviceIdentity(UUID.randomUUID(),identity.projectId(),identity.deviceId(),1),new AuthenticatedDeviceIdentity(identity.tenantId(),UUID.randomUUID(),identity.deviceId(),1),new AuthenticatedDeviceIdentity(identity.tenantId(),identity.projectId(),UUID.randomUUID(),1)))append(journal,other,"other-identity","UNLOCK_REPORTED",NOW);
            var sender=forwarder(journal,scope,(url,src,key,time,nonce,id,signature,body)->{sent.add(new String(body));return 200;});
            try{sender.flush();assertEquals(2,sent.size());assertEquals(2,markers(path));assertEquals(6,journal.pending().size());}finally{sender.close();}
        }
    }

    @Test void sameScopeResumesUnknownDeliveryAfterRestartWithoutRebasingItsSequence()throws Exception{
        Path path=directory(external);Path file=write(external,configuration(path,source,identity,0),json);var bodies=new ArrayList<String>();var nonces=new HashSet<String>();
        try(var journal=new Jt808LogJournal(path,external,json)){
            var scope=load(journal,file);append(journal,identity,"pending","UNLOCK_REPORTED",NOW);
            var sender=forwarder(journal,scope,(url,src,key,time,nonce,id,signature,body)->{bodies.add(new String(body));nonces.add(nonce);return 503;});
            try{sender.flush();assertEquals(0,markers(path));}finally{sender.close();}
        }
        try(var journal=new Jt808LogJournal(path,external,json)){
            var sender=forwarder(journal,load(journal,file),(url,src,key,time,nonce,id,signature,body)->{bodies.add(new String(body));nonces.add(nonce);return 200;});
            try{sender.flush();assertEquals(1,markers(path));assertEquals(bodies.getFirst(),bodies.getLast());assertEquals(2,nonces.size());}finally{sender.close();}
        }
    }

    @Test void changingTheSameScopeIdCannotWidenAnAlreadyConfirmedWindow()throws Exception{
        Path path=directory(external);var value=configuration(path,source,identity,0);Path file=write(external,value,json);
        try(var journal=new Jt808LogJournal(path,external,json)){
            load(journal,file);append(journal,identity,"pending","UNLOCK_REPORTED",NOW);
            value.put("receivedNotBefore",NOW.minusSeconds(300).toString());Files.write(file,json.writeValueAsBytes(value));assertThrows(IllegalStateException.class,()->load(journal,file));assertEquals(0,markers(path));
        }
    }

    @ParameterizedTest @ValueSource(strings={"file-content","file-permissions","file-missing","scope-marker","scope-marker-missing","directory-replaced"})
    void runtimeScopeChangesStopBeforeAnyRequest(String change)throws Exception{
        Path path=directory(external);Path file=write(external,configuration(path,source,identity,0),json);var calls=new AtomicInteger();
        try(var journal=new Jt808LogJournal(path,external,json)){
            var sender=forwarder(journal,load(journal,file),(url,src,key,time,nonce,id,signature,body)->{calls.incrementAndGet();return 200;});append(journal,identity,"pending","UNLOCK_REPORTED",NOW);
            try{
                switch(change){
                    case "file-content"->Files.writeString(file,Files.readString(file)+" ");
                    case "file-permissions"->Files.setPosixFilePermissions(file,PosixFilePermissions.fromString("rw-r--r--"));
                    case "file-missing"->Files.delete(file);
                    case "scope-marker"->{try(var files=Files.list(path)){Files.writeString(files.filter(p->p.toString().endsWith(".sha256")).findFirst().orElseThrow(),"changed\n");}}
                    case "scope-marker-missing"->{try(var files=Files.list(path)){Files.delete(files.filter(p->p.toString().endsWith(".sha256")).findFirst().orElseThrow());}}
                    case "directory-replaced"->{Files.move(path,path.resolveSibling(path.getFileName()+"-original"));Files.createDirectory(path,PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));}
                }
                assertThrows(IllegalStateException.class,sender::flush);assertEquals(0,calls.get());assertEquals(0,markers(path));
            }finally{sender.close();}
        }
    }

    @ParameterizedTest @ValueSource(strings={"symbolic-link","public-permissions","oversized","missing","relative","outside-root"})
    void unsafeScopeFilesRejectActivation(String change)throws Exception{
        Path path=directory(external);Path file=write(external,configuration(path,source,identity,0),json);
        switch(change){
            case "symbolic-link"->{Path link=external.resolve("linked-scope.json");Files.createSymbolicLink(link,file);file=link;}
            case "public-permissions"->Files.setPosixFilePermissions(file,PosixFilePermissions.fromString("rw-r--r--"));
            case "oversized"->Files.writeString(file," ".repeat(16385));case "missing"->Files.delete(file);
            case "relative"->file=Path.of("relative-scope.json");case "outside-root"->{ }
        }
        Path selected=file;
        // 外盘根缩小到日志目录，范围文件仍在同一测试临时根，验证边界检查而不在外盘外生成文件。
        try(var journal=new Jt808LogJournal(path,change.equals("outside-root")?path:external,json)){assertThrows(IllegalStateException.class,()->load(journal,selected));assertEquals(0,markers(path));}
    }

    @ParameterizedTest @ValueSource(strings={"-1","9223372036854775808","\"0\""})
    void sequenceMustBeAnExactNonnegativeLong(String raw)throws Exception{
        Path path=directory(external);var value=configuration(path,source,identity,0);value.put("afterSequence",json.readTree(raw));Path file=write(external,value,json);
        try(var journal=new Jt808LogJournal(path,external,json)){assertThrows(IllegalStateException.class,()->load(journal,file));}
    }

    @Test void scopeIsRecheckedBetweenRequestsInTheSameBatch()throws Exception{
        Path path=directory(external);Path file=write(external,configuration(path,source,identity,0),json);var calls=new AtomicInteger();
        try(var journal=new Jt808LogJournal(path,external,json)){
            var sender=forwarder(journal,load(journal,file),(url,src,key,time,nonce,id,signature,body)->{calls.incrementAndGet();try{Files.writeString(file,Files.readString(file)+" ");}catch(Exception e){throw new IllegalStateException(e);}return 200;});
            append(journal,identity,"one","UNLOCK_REPORTED",NOW);append(journal,identity,"two","LOCK_REPORTED",NOW);
            try{assertThrows(IllegalStateException.class,sender::flush);assertEquals(1,calls.get());assertEquals(1,markers(path));assertEquals(1,journal.pending().size());}finally{sender.close();}
        }
    }

    @ParameterizedTest @ValueSource(strings={"schemaVersion","mode","scopeId","journalDirectory","cloudUrl","sourceDeploymentId","tenantId","projectId","deviceId","afterSequence","receivedNotBefore","receivedNotAfter","logTypes","unexpected"})
    void missingMalformedOrUnknownScopeFieldsRejectActivation(String field)throws Exception{
        Path path=directory(external);var value=configuration(path,source,identity,0);
        switch(field){
            case "schemaVersion"->value.put(field,2);case "mode"->value.put(field,"ALL_HISTORY");
            case "journalDirectory"->value.put(field,"relative/path");case "cloudUrl"->value.put(field,"https://elsewhere/api/v1/internal/service-events");
            case "sourceDeploymentId"->value.put(field,UUID.randomUUID().toString());case "afterSequence"->value.put(field,0.5);
            case "receivedNotBefore"->value.put(field,"invalid");case "receivedNotAfter"->value.put(field,NOW.minusSeconds(60).toString());
            case "logTypes"->value.put(field,List.of());case "unexpected"->value.put(field,true);default->value.remove(field);
        }
        Path file=write(external,value,json);
        try(var journal=new Jt808LogJournal(path,external,json)){assertThrows(IllegalStateException.class,()->load(journal,file));assertEquals(0,markers(path));}
    }

    @Test void aConfirmedScopeCannotBeBorrowedByAnotherJournalOrDestination()throws Exception{
        try(var one=new Jt808LogJournal(directory(external),external,json);var two=new Jt808LogJournal(directory(external),external,json)){
            var scope=scope(one,source,identity,0,json);assertThrows(IllegalStateException.class,()->scope.requireBinding(two,URI.create(URL),source));
            assertThrows(IllegalStateException.class,()->scope.requireBinding(one,URI.create("https://other/api/v1/internal/service-events"),source));
            assertThrows(IllegalStateException.class,()->scope.requireBinding(one,URI.create(URL),UUID.randomUUID()));
        }
    }
}
