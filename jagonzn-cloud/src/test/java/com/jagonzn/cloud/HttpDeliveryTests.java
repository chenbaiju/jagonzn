package com.jagonzn.cloud;

import com.jagonzn.cloud.delivery.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;

/** 真实独立PG、签名HTTP入站及POST/PUT接收端，检查可靠任务与控制台JSON输出。 */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@ExtendWith(OutputCaptureExtension.class)
class HttpDeliveryTests extends CloudDatabaseTests {
    static final UUID SOURCE=UUID.fromString("00000000-0000-0000-0000-000000000711"),TENANT=UUID.fromString("00000000-0000-0000-0000-000000000722"),PROJECT=UUID.fromString("00000000-0000-0000-0000-000000000733");
    static final byte[] SECRET="0123456789abcdefghijklmnopqrstuv".getBytes(StandardCharsets.UTF_8);
    static final ObjectMapper JSON=new ObjectMapper();
    static final HttpServer RECEIVER;
    static final Path CONFIG;
    static final List<Map<String,String>> REQUESTS=new CopyOnWriteArrayList<>();
    static final AtomicInteger POST_STATUS=new AtomicInteger(200),PUT_STATUS=new AtomicInteger(200),DELAY=new AtomicInteger();
    static final AtomicReference<String> POST_BODY=new AtomicReference<>("{\"code\":0,\"received\":true}"),PUT_BODY=new AtomicReference<>("{\"received\":true}");
    static final HttpClient CLIENT=HttpClient.newHttpClient();
    static {
        try{
            RECEIVER=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);RECEIVER.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
            RECEIVER.createContext("/",exchange->{
                String path=exchange.getRequestURI().getPath();String body=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);
                REQUESTS.add(Map.of("path",path,"method",exchange.getRequestMethod(),"body",body,"idempotency",exchange.getRequestHeaders().getFirst("Idempotency-Key")));
                int status=path.equals("/post")?POST_STATUS.get():PUT_STATUS.get();byte[] response=(path.equals("/post")?POST_BODY.get():PUT_BODY.get()).getBytes(StandardCharsets.UTF_8);
                try{if(DELAY.get()>0)Thread.sleep(DELAY.get());exchange.getResponseHeaders().add("Content-Type","application/json");if(status==302)exchange.getResponseHeaders().add("Location","/trap");exchange.sendResponseHeaders(status,response.length);exchange.getResponseBody().write(response);}catch(InterruptedException e){Thread.currentThread().interrupt();}catch(java.io.IOException ignored){ }finally{exchange.close();}
            });RECEIVER.start();CONFIG=Files.createTempFile("json-targets-",".json");Files.setPosixFilePermissions(CONFIG,java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));Files.writeString(CONFIG,JSON.writeValueAsString(List.of(target("post",1),target("put",1))));
        }catch(Exception e){throw new ExceptionInInitializerError(e);}
    }
    static HttpDeliveryTarget target(String id,int revision){return new HttpDeliveryTarget(id,revision,SOURCE,TENANT,PROJECT,URI.create("http://127.0.0.1:"+RECEIVER.getAddress().getPort()+"/"+id),id.equals("post")?"POST":"PUT",Set.of("jagonzn.lock.log"),Map.of(),Map.of(),id.equals("post")?Map.of("lockCode","/deviceId","operation","/payload/logType"):Map.of(),JSON.createObjectNode().put("vendor","jagonzn"),Set.of(200),id.equals("post")?"/code":"/received",id.equals("post")?JSON.valueToTree(0):JSON.valueToTree(true),id.equals("put"),3,1,true);}
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r){
        r.add("jagonzn.cloud.service-events.enabled",()->true);r.add("jagonzn.cloud.service-events.source-deployment-id",SOURCE::toString);r.add("jagonzn.cloud.service-events.tenant-id",TENANT::toString);r.add("jagonzn.cloud.service-events.project-id",PROJECT::toString);r.add("jagonzn.cloud.service-events.key-id",()->"test");r.add("jagonzn.cloud.service-events.secret-base64",()->Base64.getEncoder().encodeToString(SECRET));
        r.add("jagonzn.cloud.http-delivery.enabled",()->true);r.add("jagonzn.cloud.http-delivery.loopback-test",()->true);r.add("jagonzn.cloud.http-delivery.targets-file",CONFIG::toString);r.add("jagonzn.cloud.http-delivery.poll-millis",()->3600000);
    }
    @Autowired HttpDeliveryWorker worker;@Autowired HttpDeliveryStore store;@Autowired JdbcTemplate jdbc;@Autowired HttpDeliveryAudit audit;@Autowired PlatformTransactionManager manager;
    @LocalServerPort int port;
    @BeforeEach void reset(){jdbc.update("DELETE FROM cloud_http_log_delivery");jdbc.update("DELETE FROM cloud_service_event_inbox");jdbc.update("DELETE FROM cloud_service_event_nonce");REQUESTS.clear();POST_STATUS.set(200);PUT_STATUS.set(200);POST_BODY.set("{\"code\":0,\"received\":true}");PUT_BODY.set("{\"received\":true}");DELAY.set(0);}
    @AfterAll static void close(){RECEIVER.stop(0);CLIENT.close();}
    UUID receive(String kind) throws Exception {UUID id=UUID.randomUUID();assertThat(receive(id,kind,TENANT,PROJECT)).isEqualTo(200);return id;}
    int receive(UUID id,String kind,UUID tenant,UUID project) throws Exception {
        var event=JSON.createObjectNode();event.put("schemaVersion",1);event.put("eventId",id.toString());event.put("eventType","jagonzn.lock.log");event.put("tenantId",tenant.toString());event.put("projectId",project.toString());event.put("deviceId","test-lock");event.put("occurredAt","2026-10-28T12:00:00Z");event.set("payload",JSON.createObjectNode().put("logType",kind));
        byte[] body=JSON.writeValueAsBytes(Map.of("deliveryId",id.toString(),"event",event));String nonce=UUID.randomUUID().toString(),timestamp=Long.toString(Instant.now().getEpochSecond());Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(SECRET,"HmacSHA256"));mac.update((timestamp+"\n"+nonce+"\n"+id+"\n").getBytes(StandardCharsets.UTF_8));String signature="v1="+HexFormat.of().formatHex(mac.doFinal(body));
        return CLIENT.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/v1/internal/service-events")).header("Content-Type","application/json").header("X-ThingsLink-Delivery-Id",id.toString()).header("X-ThingsLink-Timestamp",timestamp).header("X-ThingsLink-Nonce",nonce).header("X-ThingsLink-Signature",signature).header("X-ThingsLink-Key-Id","test").header("X-ThingsLink-Source-Deployment-Id",SOURCE.toString()).POST(HttpRequest.BodyPublishers.ofByteArray(body)).build(),HttpResponse.BodyHandlers.discarding()).statusCode();
    }
    String state(UUID id,String target){return jdbc.queryForObject("SELECT state FROM cloud_http_log_delivery WHERE event_id=? AND target_id=?",String.class,id,target);}
    long count(String path){return REQUESTS.stream().filter(r->r.get("path").equals(path)).count();}
    @Test void postPutMappingDuplicateAndConsoleShowActualJson(CapturedOutput output) throws Exception {
        UUID id=receive("UNLOCK_REPORTED");assertThat(receive(id,"UNLOCK_REPORTED",TENANT,PROJECT)).isEqualTo(200);worker.tick();worker.tick();
        assertThat(state(id,"post")).isEqualTo("DELIVERED");assertThat(state(id,"put")).isEqualTo("DELIVERED");assertThat(count("/post")).isEqualTo(1);assertThat(count("/put")).isEqualTo(1);
        var post=REQUESTS.stream().filter(r->r.get("path").equals("/post")).findFirst().orElseThrow();assertThat(post.get("method")).isEqualTo("POST");assertThat(JSON.readTree(post.get("body")).path("lockCode").asText()).isEqualTo("test-lock");
        assertThat(output.getOut()).contains("接收成功_来源事件已持久保存","发送请求 POST","接收响应 HTTP_200","发送成功_第三方已按合同接收","UNLOCK_REPORTED");
    }
    @Test void closeReportIsDeliveredAsItsOwnFact() throws Exception {UUID id=receive("LOCK_REPORTED");worker.tick();assertThat(state(id,"post")).isEqualTo("DELIVERED");assertThat(REQUESTS.getFirst().get("body")).contains("LOCK_REPORTED");}
    @Test void wrongTenantAndProjectNeverCreateJobs() throws Exception {assertThat(receive(UUID.randomUUID(),"LOCK_REPORTED",UUID.randomUUID(),PROJECT)).isEqualTo(403);assertThat(receive(UUID.randomUUID(),"LOCK_REPORTED",TENANT,UUID.randomUUID())).isEqualTo(403);worker.tick();assertThat(REQUESTS).isEmpty();}
    @Test void retryUsesOriginalBodyAndIdempotencyWhileOtherTargetIsUncertain() throws Exception {
        POST_STATUS.set(429);PUT_STATUS.set(503);UUID id=receive("LOCK_REPORTED");worker.tick();assertThat(state(id,"post")).isEqualTo("UNCERTAIN");assertThat(state(id,"put")).isEqualTo("RETRY_WAIT");var first=REQUESTS.stream().filter(r->r.get("path").equals("/put")).findFirst().orElseThrow();PUT_STATUS.set(200);jdbc.update("UPDATE cloud_http_log_delivery SET next_attempt_at=now()-interval '1 second'");worker.tick();var second=REQUESTS.stream().filter(r->r.get("path").equals("/put")).toList().getLast();assertThat(first).isEqualTo(second);assertThat(state(id,"put")).isEqualTo("DELIVERED");assertThat(count("/post")).isEqualTo(1);
    }
    @Test void accepted202IsNotAssumedBusinessSuccess() throws Exception {POST_STATUS.set(202);UUID id=receive("LOCK_REPORTED");worker.tick();assertThat(state(id,"post")).isEqualTo("UNCERTAIN");assertThat(state(id,"put")).isEqualTo("DELIVERED");}
    @Test void businessRejectionAndRedirectNeverFollowOrReportSuccess() throws Exception {POST_BODY.set("{\"code\":7}");UUID id=receive("LOCK_REPORTED");worker.tick();assertThat(state(id,"post")).isEqualTo("FAILED");POST_STATUS.set(302);UUID next=receive("UNLOCK_REPORTED");worker.tick();assertThat(state(next,"post")).isEqualTo("FAILED");assertThat(count("/trap")).isZero();}
    @Test void timeoutWithoutDeduplicationRemainsUncertainAndDoesNotResend() throws Exception {DELAY.set(1500);UUID id=receive("LOCK_REPORTED");worker.tick();worker.tick();assertThat(state(id,"post")).isEqualTo("UNCERTAIN");assertThat(count("/post")).isEqualTo(1);}
    @Test void oversizedResponseIsBoundedAndDoesNotClaimDelivery() throws Exception {POST_BODY.set("x".repeat(70000));UUID id=receive("LOCK_REPORTED");worker.tick();assertThat(state(id,"post")).isEqualTo("UNCERTAIN");}
    @Test void restartRecoverDoesNotBlindlyRetryUncertainPost() throws Exception {UUID id=receive("LOCK_REPORTED");store.materialize(target("post",1));store.materialize(target("put",1));assertThat(store.claim(target("post",1))).isNotNull();assertThat(store.claim(target("put",1))).isNotNull();jdbc.update("UPDATE cloud_http_log_delivery SET lease_until=now()-interval '1 second'");var restarted=new HttpDeliveryStore(jdbc,JSON,manager);assertThat(restarted.recover()).isEqualTo(2);assertThat(state(id,"post")).isEqualTo("UNCERTAIN");assertThat(state(id,"put")).isEqualTo("RETRY_WAIT");}
    @Test void changedConfigurationDoesNotRewritePendingTargetRevision() throws Exception {UUID id=receive("LOCK_REPORTED");store.materialize(target("post",1));store.materialize(target("post",2));var a=store.claim(target("post",1));assertThat(a.target().revision()).isEqualTo(1);assertThat(a.body()).contains("LOCK_REPORTED");assertThat(jdbc.queryForObject("SELECT count(*) FROM cloud_http_log_delivery WHERE event_id=?",Integer.class,id)).isEqualTo(1);}
    @Test void concurrentClaimsHaveOneOwner() throws Exception {receive("LOCK_REPORTED");store.materialize(target("post",1));try(var pool=Executors.newVirtualThreadPerTaskExecutor()){var one=pool.submit(()->store.claim(target("post",1)));var two=pool.submit(()->store.claim(target("post",1)));assertThat(java.util.stream.Stream.of(one.get(),two.get()).filter(Objects::nonNull).count()).isEqualTo(1);}}
    @Test void noConfiguredTargetsKeepInboxWithoutCreatingFailures() throws Exception {receive("LOCK_REPORTED");var off=new HttpDeliveryConfiguration(JSON,false,"",false);new HttpDeliveryWorker(off,store,new JsonHttpTransport(),JSON,audit).tick();assertThat(jdbc.queryForObject("SELECT count(*) FROM cloud_http_log_delivery",Integer.class)).isZero();}
    @Test void credentialsAreMaskedButBusinessDetailsRemainVisible(){String safe=audit.safe("{\"password\":\"DO_NOT_PRINT\",\"data\":{\"token\":\"SECRET_VALUE\",\"doorClosed\":true}}");assertThat(safe).doesNotContain("DO_NOT_PRINT","SECRET_VALUE").contains("doorClosed","已脱敏");}
    @Test void plaintextRemoteAndUnapprovedLoopbackAreRejected(){assertThatThrownBy(()->new HttpDeliveryConfiguration(JSON,true,CONFIG.toString(),false)).isInstanceOf(IllegalStateException.class);}
}
