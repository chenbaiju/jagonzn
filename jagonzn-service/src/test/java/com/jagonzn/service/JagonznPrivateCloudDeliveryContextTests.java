package com.jagonzn.service;

import com.jagonzn.service.integration.PrivateCloudEventForwarder;
import com.things.cloud.support.webhook.PublicWebhookSourceWriter;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;

import static org.assertj.core.api.Assertions.assertThat;

/** 外部 service 真实装配中，私有消费组与内部来源须同时存在且不启动测试 Broker。 */
@SpringBootTest(properties = {
        "jagonzn.cloud.private-delivery.enabled=true",
        "things-cloud.integration.internal-event-source.enabled=true",
        "jagonzn.cloud.private-delivery.url=https://cloud.internal/api/v1/internal/service-events",
        "jagonzn.cloud.private-delivery.source-deployment-id=00000000-0000-0000-0000-000000000111",
        "jagonzn.cloud.private-delivery.tenant-id=00000000-0000-0000-0000-000000000222",
        "jagonzn.cloud.private-delivery.project-id=00000000-0000-0000-0000-000000000333",
        "jagonzn.cloud.private-delivery.key-id=local-v1",
        "jagonzn.cloud.private-delivery.secret-base64=MDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1ub3BxcnN0dXY="
})
class JagonznPrivateCloudDeliveryContextTests extends JagonznServiceIntegrationTest {
    @Autowired ApplicationContext context;
    @Autowired KafkaListenerEndpointRegistry listeners;

    @Test
    void assemblesPrivateListenerWithoutPublicWebhook() {
        assertThat(context.getBean(PrivateCloudEventForwarder.class)).isNotNull();
        assertThat(context.getBean(PublicWebhookSourceWriter.class).enabled()).isTrue();
        assertThat(listeners.getListenerContainers()).anySatisfy(container ->
                assertThat(container.getGroupId()).isEqualTo("jagonzn-private-cloud-source"));
    }
}
