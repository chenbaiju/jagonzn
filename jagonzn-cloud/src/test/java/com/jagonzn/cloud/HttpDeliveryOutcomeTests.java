package com.jagonzn.cloud;

import com.jagonzn.cloud.delivery.*;
import java.net.URI;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/** HTTP响应已发生后的本地提交失败，不得改写为确定失败或打印假成功。 */
class HttpDeliveryOutcomeTests {
    final ObjectMapper json=new ObjectMapper();
    HttpDeliveryTarget target(Map<String,String> headers,Map<String,String> secrets){return new HttpDeliveryTarget("sample",1,UUID.randomUUID(),UUID.randomUUID(),UUID.randomUUID(),URI.create("http://127.0.0.1:9001/logs"),"POST",Set.of("jagonzn.lock.log"),headers,secrets,Map.of(),json.createObjectNode(),Set.of(200),"",null,false,3,1,true);}
    @Test void databaseCommitFailureAfterSuccessResponseIsNotReclassifiedAsFailed()throws Exception {
        var config=mock(HttpDeliveryConfiguration.class);var store=mock(HttpDeliveryStore.class);var transport=mock(JsonHttpTransport.class);var t=target(Map.of(),Map.of());var a=new HttpDeliveryStore.Attempt(UUID.randomUUID(),UUID.randomUUID(),t,"{}",1,UUID.randomUUID());
        when(transport.send(any(),anyString(),anyString())).thenReturn(new JsonHttpTransport.Response(200,"{\"received\":true}"));when(store.complete(eq(a),eq("DELIVERED"),any(),any(),isNull())).thenThrow(new IllegalStateException("database unavailable"));
        var worker=new HttpDeliveryWorker(config,store,transport,json,new HttpDeliveryAudit(json));assertThatThrownBy(()->worker.deliver(a)).isInstanceOf(IllegalStateException.class);verify(store,times(1)).complete(any(),anyString(),any(),any(),any());
    }
    @Test void plaintextAuthAndCaseConflictingHeadersAreRejected(){assertThatThrownBy(()->target(Map.of("Authorization","secret"),Map.of())).isInstanceOf(IllegalArgumentException.class);assertThatThrownBy(()->target(Map.of("X-Mode","a","x-mode","b"),Map.of())).isInstanceOf(IllegalArgumentException.class);assertThatThrownBy(()->target(Map.of("X-Mode","a"),Map.of("x-mode","TEST_SECRET"))).isInstanceOf(IllegalArgumentException.class);}
    @Test void constantsAlsoApplyToPassthroughBody(){var t=target(Map.of(),Map.of());var withConstant=new HttpDeliveryTarget(t.id(),t.revision(),t.sourceDeploymentId(),t.tenantId(),t.projectId(),t.url(),t.method(),t.eventTypes(),t.headers(),t.secretHeaderEnvironment(),Map.of(),json.createObjectNode().put("vendor","jagonzn"),t.successStatuses(),"",null,false,3,1,true);assertThat(json.readTree(withConstant.body(json.readTree("{\"eventId\":\"abc\"}"),json)).path("vendor").asText()).isEqualTo("jagonzn");}
    @Test void slowPartnerDoesNotBlockSchedulerOrOverlapSameInstance()throws Exception {
        var config=mock(HttpDeliveryConfiguration.class);var store=mock(HttpDeliveryStore.class);var transport=mock(JsonHttpTransport.class);var t=target(Map.of(),Map.of());var a=new HttpDeliveryStore.Attempt(UUID.randomUUID(),UUID.randomUUID(),t,"{}",1,UUID.randomUUID());
        var started=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);var completed=new java.util.concurrent.CountDownLatch(1);when(config.targets()).thenReturn(List.of(t));when(store.claim(t)).thenReturn(a,null);when(store.complete(any(),anyString(),any(),any(),any())).thenAnswer(invocation->{completed.countDown();return true;});
        when(transport.send(any(),anyString(),anyString())).thenAnswer(invocation->{started.countDown();release.await(3,java.util.concurrent.TimeUnit.SECONDS);return new JsonHttpTransport.Response(200,"{}");});
        var worker=new HttpDeliveryWorker(config,store,transport,json,new HttpDeliveryAudit(json));try{long before=System.nanoTime();worker.trigger();assertThat(System.nanoTime()-before).isLessThan(java.time.Duration.ofMillis(500).toNanos());assertThat(started.await(2,java.util.concurrent.TimeUnit.SECONDS)).isTrue();worker.trigger();verify(transport,times(1)).send(any(),anyString(),anyString());release.countDown();assertThat(completed.await(2,java.util.concurrent.TimeUnit.SECONDS)).isTrue();}finally{release.countDown();worker.close();}
    }

}
