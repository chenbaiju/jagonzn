package com.jagonzn.cloud;

import com.jagonzn.cloud.integration.CloudServiceEventInboxController;
import com.jagonzn.cloud.integration.CloudServiceEventInboxStore;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import tools.jackson.databind.ObjectMapper;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/** 验证统一ThingsLink请求头合同和旧格式拒绝，不启动数据库。 */
class CloudServiceEventHeaderTests {
    private static final UUID SOURCE=UUID.fromString("00000000-0000-0000-0000-000000000111");
    private static final UUID TENANT=UUID.fromString("00000000-0000-0000-0000-000000000222");
    private static final UUID PROJECT=UUID.fromString("00000000-0000-0000-0000-000000000333");
    private static final byte[] SECRET="0123456789abcdefghijklmnopqrstuv".getBytes(StandardCharsets.US_ASCII);
    private static final String CURRENT="X-ThingsLink-";
    private static final String LEGACY="X-ThingsCloud-";

    private record SignedRequest(byte[] body,Map<String,String> headers) {
        MockHttpServletRequest request(String prefix) {
            var request=new MockHttpServletRequest("POST","/api/v1/internal/service-events");
            request.setContentType("application/json"); request.setContent(body);
            headers.forEach((suffix,value)->request.addHeader(prefix+suffix,value));
            return request;
        }
    }

    private SignedRequest signed() throws Exception {
        UUID delivery=UUID.randomUUID(),nonce=UUID.randomUUID(); long at=Instant.now().getEpochSecond();
        byte[] body=("""
                {"deliveryId":"%s","event":{"eventId":"%s","schemaVersion":1,
                "tenantId":"%s","projectId":"%s","eventType":"device.property.report"}}
                """).formatted(delivery,UUID.randomUUID(),TENANT,PROJECT).getBytes(StandardCharsets.UTF_8);
        Mac mac=Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(SECRET,"HmacSHA256"));
        mac.update((at+"\n"+nonce+"\n"+delivery+"\n").getBytes(StandardCharsets.UTF_8));
        var headers=new LinkedHashMap<String,String>();
        headers.put("Delivery-Id",delivery.toString()); headers.put("Timestamp",Long.toString(at));
        headers.put("Nonce",nonce.toString()); headers.put("Signature","v1="+HexFormat.of().formatHex(mac.doFinal(body)));
        headers.put("Key-Id","local-v1"); headers.put("Source-Deployment-Id",SOURCE.toString());
        return new SignedRequest(body,headers);
    }

    private CloudServiceEventInboxController controller(CloudServiceEventInboxStore store) {
        return new CloudServiceEventInboxController(store,new ObjectMapper(),SOURCE.toString(),TENANT.toString(),
                PROJECT.toString(),"local-v1",Base64.getEncoder().encodeToString(SECRET));
    }
    private CloudServiceEventInboxStore store() {
        var store=mock(CloudServiceEventInboxStore.class);
        when(store.accept(any(),any(),any(),any(),any(),any(),anyString(),anyString(),anyString()))
                .thenReturn(CloudServiceEventInboxStore.Outcome.ACCEPTED);
        return store;
    }

    @Test void acceptsCanonicalThingsLinkHeadersWithOriginalSignature() throws Exception {
        var store=store(); var controller=controller(store);
        try { assertThat(controller.receive(signed().request(CURRENT)).getStatusCode().value()).isEqualTo(200); }
        finally { controller.clearSecret(); }
        verify(store).accept(eq(SOURCE),any(),any(),any(),eq(TENANT),eq(PROJECT),anyString(),anyString(),anyString());
    }
    @Test void rejectsMissedLegacyDeploymentHeaderInsteadOfMaskingSenderNamingError() throws Exception {
        var signed=signed(); var request=signed.request(CURRENT);
        request.removeHeader(CURRENT+"Source-Deployment-Id"); request.addHeader(LEGACY+"Source-Deployment-Id",SOURCE.toString());
        var store=store(); var controller=controller(store);
        try { assertThat(controller.receive(request).getStatusCode().value()).isEqualTo(400); }
        finally { controller.clearSecret(); }
        verifyNoInteractions(store);
    }
    @Test void rejectsLegacyOnlyHeaders() throws Exception {
        var store=store(); var controller=controller(store);
        try { assertThat(controller.receive(signed().request(LEGACY)).getStatusCode().value()).isEqualTo(400); }
        finally { controller.clearSecret(); }
        verifyNoInteractions(store);
    }
    @Test void rejectsEachRepeatedCanonicalHeaderEvenWhenBothValuesAreIdentical() throws Exception {
        var signed=signed(); var store=store(); var controller=controller(store);
        try {
            for(var header:signed.headers().entrySet()) {
                var request=signed.request(CURRENT); request.addHeader(CURRENT+header.getKey(),header.getValue());
                assertThat(controller.receive(request).getStatusCode().value()).as(header.getKey()).isEqualTo(400);
            }
        } finally { controller.clearSecret(); }
        verifyNoInteractions(store);
    }
    @Test void rejectsConflictingCanonicalValues() throws Exception {
        var signed=signed(); var store=store(); var controller=controller(store);
        try {
            var conflict=signed.request(CURRENT); conflict.addHeader(CURRENT+"Key-Id","other-key");
            assertThat(controller.receive(conflict).getStatusCode().value()).isEqualTo(400);
        } finally { controller.clearSecret(); }
        verifyNoInteractions(store);
    }
    @Test void rejectsSignatureTamperWrongSourceAndMissingHeader() throws Exception {
        var signed=signed(); var store=store(); var controller=controller(store);
        try {
                var tampered=signed.request(CURRENT); tampered.setContent("{}".getBytes(StandardCharsets.UTF_8));
                assertThat(controller.receive(tampered).getStatusCode().value()).isEqualTo(401);
                var wrongSource=signed.request(CURRENT); wrongSource.removeHeader(CURRENT+"Source-Deployment-Id");
                wrongSource.addHeader(CURRENT+"Source-Deployment-Id",UUID.randomUUID().toString());
                assertThat(controller.receive(wrongSource).getStatusCode().value()).isEqualTo(403);
                var missing=signed.request(CURRENT); missing.removeHeader(CURRENT+"Signature");
                assertThat(controller.receive(missing).getStatusCode().value()).isEqualTo(400);
        } finally { controller.clearSecret(); }
        verifyNoInteractions(store);
    }
}
