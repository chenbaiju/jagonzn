package com.jagonzn.cloud;

import com.jagonzn.cloud.delivery.*;
import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import static com.jagonzn.cloud.WorkLockRecordTests.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 独立真实PG与回环POST接收端；对方按正文uuid去重，业务500仍须重试原任务。 */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.NONE,properties={"jagonzn.cloud.service-events.enabled=false","jagonzn.cloud.http-delivery.enabled=false"})
@ExtendWith(OutputCaptureExtension.class)
class WorkLockRecordDeliveryTests extends CloudDatabaseTests {
    static final List<String> REQUESTS=new CopyOnWriteArrayList<>();
    static final Map<String,String> EFFECTS=new ConcurrentHashMap<>();
    static final AtomicInteger CODE=new AtomicInteger(200),DELAY=new AtomicInteger(),HTTP_STATUS=new AtomicInteger(200);
    static HttpServer receiver;static ExecutorService threads;
    @Autowired JdbcTemplate jdbc;@Autowired HttpDeliveryStore store;@Autowired HttpDeliveryAudit audit;
    JsonHttpTransport transport;HttpDeliveryWorker worker;HttpDeliveryTarget selected;
    @BeforeAll static void start()throws Exception{
        receiver=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);threads=Executors.newVirtualThreadPerTaskExecutor();receiver.setExecutor(threads);
        receiver.createContext("/records",exchange->{
            try{
                String body=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);REQUESTS.add(body);var value=JSON.readTree(body);EFFECTS.putIfAbsent(value.path("uuid").asText(),body);
                int delay=DELAY.get(),code=CODE.get(),status=HTTP_STATUS.get();if(delay>0)Thread.sleep(delay);
                byte[] response=JSON.createObjectNode().put("code",code).put("msg",code==200?"成功":"失败").toString().getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type","application/json");exchange.sendResponseHeaders(status,response.length);exchange.getResponseBody().write(response);
            }catch(InterruptedException e){Thread.currentThread().interrupt();}catch(java.io.IOException ignored){ }finally{exchange.close();}
        });receiver.start();
    }
    @AfterAll static void stop(){receiver.stop(0);threads.shutdownNow();}
    @BeforeEach void reset(){
        jdbc.update("DELETE FROM cloud_http_log_delivery");jdbc.update("DELETE FROM cloud_service_event_inbox");jdbc.update("DELETE FROM cloud_service_event_nonce");REQUESTS.clear();EFFECTS.clear();CODE.set(200);DELAY.set(0);HTTP_STATUS.set(200);
        selected=target(URI.create("http://127.0.0.1:"+receiver.getAddress().getPort()+"/records"),DEVICE,Instant.now().minusSeconds(60).toString(),Instant.now().plusSeconds(3600).toString(),constants());
        var config=mock(HttpDeliveryConfiguration.class);when(config.targets()).thenReturn(List.of(selected));transport=new JsonHttpTransport();worker=new HttpDeliveryWorker(config,store,transport,JSON,audit);
    }
    @AfterEach void close()throws Exception{
        Path proof=Path.of(System.getProperty("java.io.tmpdir")).resolve("work-record-last-http.json");Files.writeString(proof,JSON.writeValueAsString(Map.of("requests",REQUESTS,"uniqueWrites",EFFECTS.size())));Files.setPosixFilePermissions(proof,java.nio.file.attribute.PosixFilePermissions.fromString("rw-------"));
        worker.close();transport.close();
    }
    UUID receive(String kind,UUID device,Instant received){
        UUID id=UUID.randomUUID();JsonNode event=event(id,kind,device);
        jdbc.update("INSERT INTO cloud_service_event_inbox(source_deployment_id,event_id,delivery_id,tenant_id,project_id,event_type,event_digest,event_body,received_at) VALUES (?,?,?,?,?,?,'"+"a".repeat(64)+"',?::jsonb,?)",SOURCE,id,id,TENANT,PROJECT,"jagonzn.lock.log",event.toString(),received.atOffset(java.time.ZoneOffset.UTC));return id;
    }
    void due(){jdbc.update("UPDATE cloud_http_log_delivery SET next_attempt_at=now()-interval '1 second'");}
    String state(UUID id){return jdbc.queryForObject("SELECT state FROM cloud_http_log_delivery WHERE event_id=?",String.class,id);}
    @Test void exactContractAndDistinctOpenCloseUuidsAreDeliveredOnce(CapturedOutput output){
        UUID open=receive("UNLOCK_REPORTED",DEVICE,Instant.now()),closed=receive("LOCK_REPORTED",DEVICE,Instant.now());worker.tick();worker.tick();
        assertThat(state(open)).isEqualTo("DELIVERED");assertThat(state(closed)).isEqualTo("DELIVERED");assertThat(REQUESTS).hasSize(2);assertThat(EFFECTS).hasSize(2);
        assertThat(JSON.readTree(REQUESTS.getFirst()).propertyNames()).containsExactlyInAnyOrder("uuid","optime","lockState","lockNum","phoneNum","sealOffNum");
        assertThat(output.getOut()).contains("发送请求 POST","接收响应 HTTP_200","发送成功_第三方已按合同接收","开锁","关锁","已脱敏").doesNotContain("13800000000");
    }
    @Test void business500RetriesWithSameUuidBodyAndOnlyOneReceiverWrite(){
        CODE.set(500);UUID id=receive("UNLOCK_REPORTED",DEVICE,Instant.now());worker.tick();assertThat(state(id)).isEqualTo("RETRY_WAIT");String original=REQUESTS.getFirst();
        CODE.set(200);due();worker.tick();assertThat(state(id)).isEqualTo("DELIVERED");assertThat(REQUESTS).containsExactly(original,original);assertThat(EFFECTS).hasSize(1);
    }
    @Test void persistentFailureIsBoundedAndPrintsContactRequired(CapturedOutput output){
        CODE.set(500);UUID id=receive("LOCK_REPORTED",DEVICE,Instant.now());worker.tick();due();worker.tick();due();worker.tick();due();worker.tick();
        assertThat(state(id)).isEqualTo("FAILED");assertThat(REQUESTS).hasSize(3);assertThat(EFFECTS).hasSize(1);assertThat(jdbc.queryForObject("SELECT failure_code FROM cloud_http_log_delivery WHERE event_id=?",String.class,id)).isEqualTo("PARTNER_RETRY_EXHAUSTED");assertThat(output.getOut()).contains("需联系接口提供方");
    }
    @ParameterizedTest @ValueSource(ints={202,302,400,500})
    void nonSuccessHttpAlsoRetriesOriginalRecordWithoutClaimingDelivery(int status){
        HTTP_STATUS.set(status);CODE.set(500);UUID id=receive("LOCK_REPORTED",DEVICE,Instant.now());worker.tick();assertThat(state(id)).isEqualTo("RETRY_WAIT");String body=REQUESTS.getFirst();
        HTTP_STATUS.set(200);CODE.set(200);due();worker.tick();assertThat(state(id)).isEqualTo("DELIVERED");assertThat(REQUESTS).containsExactly(body,body);assertThat(EFFECTS).hasSize(1);
    }
    @Test void timeoutRecoveryAlsoUsesTheOriginalRecordUuid(){
        DELAY.set(1400);UUID id=receive("LOCK_REPORTED",DEVICE,Instant.now());worker.tick();assertThat(state(id)).isEqualTo("RETRY_WAIT");String first=REQUESTS.getFirst();DELAY.set(0);due();worker.tick();assertThat(state(id)).isEqualTo("DELIVERED");assertThat(REQUESTS).containsExactly(first,first);assertThat(EFFECTS).hasSize(1);
    }
    @Test void historicalOrForeignOrMetadataRowsCannotFillTheFirstBatch(){
        for(int n=0;n<105;n++){receive("UNLOCK_REPORTED",DEVICE,Instant.now().minusSeconds(7200));receive("LOCK_REPORTED",UUID.randomUUID(),Instant.now());receive("AUTHENTICATED",DEVICE,Instant.now());}
        UUID id=receive("UNLOCK_REPORTED",DEVICE,Instant.now());worker.tick();assertThat(state(id)).isEqualTo("DELIVERED");assertThat(REQUESTS).hasSize(1);assertThat(jdbc.queryForObject("SELECT count(*) FROM cloud_http_log_delivery",Integer.class)).isEqualTo(1);
    }
    @Test void changingDeviceOrWindowPausesOldTasksAndPendingBodiesStayFrozen(){
        UUID id=receive("LOCK_REPORTED",DEVICE,Instant.now());assertThat(store.materialize(selected)).isEqualTo(1);
        var other=target(selected.url(),UUID.randomUUID(),selected.receivedNotBefore(),selected.receivedNotAfter(),constants());assertThat(store.claim(other)).isNull();
        var future=target(selected.url(),DEVICE,Instant.now().plusSeconds(20).toString(),Instant.now().plusSeconds(3600).toString(),constants());assertThat(store.claim(future)).isNull();
        var changed=target(selected.url(),DEVICE,selected.receivedNotBefore(),selected.receivedNotAfter(),JSON.createObjectNode().put("lockNum","CHANGED1").put("phoneNum","13900000000"));
        assertThat(store.materialize(changed)).isZero();var original=store.claim(selected);assertThat(original.body()).contains("860000000000000").doesNotContain("CHANGED1","13900000000");
    }
    @Test void noTargetKeepsInboxAndSendsNothing(){
        receive("UNLOCK_REPORTED",DEVICE,Instant.now());var off=mock(HttpDeliveryConfiguration.class);when(off.targets()).thenReturn(List.of());var inactive=new HttpDeliveryWorker(off,store,transport,JSON,audit);
        try{inactive.tick();assertThat(REQUESTS).isEmpty();assertThat(jdbc.queryForObject("SELECT count(*) FROM cloud_http_log_delivery",Integer.class)).isZero();}finally{inactive.close();}
    }
}
