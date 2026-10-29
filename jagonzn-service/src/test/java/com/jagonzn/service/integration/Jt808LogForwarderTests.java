package com.jagonzn.service.integration;

import com.jagonzn.service.extension.jt808.Jt808LogJournal;
import com.things.link.shared.message.AuthenticatedDeviceIdentity;
import com.things.link.support.notification.delivery.WebhookSignatures;
import java.nio.file.*;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.ObjectMapper;
import static org.junit.jupiter.api.Assertions.*;

/** cloud响应丢失后重交同一日志，实际签名仍绑定原事件和正文。 */
class Jt808LogForwarderTests {
    @TempDir Path external;
    @Test void unknownThenAcceptedKeepsStableEventAndPayloadWithFreshNonce()throws Exception {
        var json=new ObjectMapper();Path path=Files.createTempDirectory(external,"log-",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));byte[] secret="0123456789abcdefghijklmnopqrstuv".getBytes();var count=new AtomicInteger();var bodies=new ArrayList<String>();var nonces=new HashSet<String>();UUID source=UUID.randomUUID();
        try(var journal=new Jt808LogJournal(path,external,json)){
            journal.append(new AuthenticatedDeviceIdentity(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),1),"sample","UNLOCK_REPORTED","UP",0x0200,1,Instant.now(),Instant.now(),Map.of("door_closed",false));
            var forwarder=new Jt808LogForwarder(journal,json,"https://localhost/api/v1/internal/service-events",source.toString(),"test",Base64.getEncoder().encodeToString(secret),(url,src,key,time,nonce,id,signature,body)->{
                assertEquals(source,src);assertEquals(WebhookSignatures.sign(secret,time,nonce,id,body),signature);bodies.add(new String(body));nonces.add(nonce);return count.incrementAndGet()==1?503:200;
            });forwarder.flush();assertEquals(1,journal.pending().size());forwarder.flush();assertTrue(journal.pending().isEmpty());assertEquals(bodies.getFirst(),bodies.getLast());assertEquals(2,nonces.size());forwarder.close();
        }
    }
    @Test void slowCloudDoesNotBlockSchedulerOrCreateAnotherConcurrentAttempt()throws Exception {
        var json=new ObjectMapper();Path path=Files.createTempDirectory(external,"async-",PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));byte[] secret="0123456789abcdefghijklmnopqrstuv".getBytes();var started=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);var calls=new AtomicInteger();
        try(var journal=new Jt808LogJournal(path,external,json)){
            journal.append(new AuthenticatedDeviceIdentity(UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),1),"slow","LOCK_REPORTED","UP",0x0200,1,Instant.now(),Instant.now(),Map.of());
            var forwarder=new Jt808LogForwarder(journal,json,"https://localhost/api/v1/internal/service-events",UUID.randomUUID().toString(),"test",Base64.getEncoder().encodeToString(secret),(url,src,key,time,nonce,id,signature,body)->{calls.incrementAndGet();started.countDown();try{release.await(3,java.util.concurrent.TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}return 200;});
            try{long before=System.nanoTime();forwarder.trigger();assertTrue(System.nanoTime()-before<java.time.Duration.ofMillis(500).toNanos());assertTrue(started.await(2,java.util.concurrent.TimeUnit.SECONDS));forwarder.trigger();assertEquals(1,calls.get());release.countDown();for(int n=0;n<100&&!journal.pending().isEmpty();n++)Thread.sleep(20);assertTrue(journal.pending().isEmpty());}finally{release.countDown();forwarder.close();}
        }
    }

}
