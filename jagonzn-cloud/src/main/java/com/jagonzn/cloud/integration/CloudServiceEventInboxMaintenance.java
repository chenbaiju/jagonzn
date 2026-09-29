package com.jagonzn.cloud.integration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** 定期清除超过防重放窗口的 nonce，接收事实本身不随之删除。 */
@Component
@ConditionalOnProperty(name = "jagonzn.cloud.service-events.enabled", havingValue = "true")
public class CloudServiceEventInboxMaintenance {
    private final CloudServiceEventInboxStore store;

    public CloudServiceEventInboxMaintenance(CloudServiceEventInboxStore store) {
        this.store = store;
    }

    @Scheduled(fixedDelay = 3_600_000)
    public void clean() {
        store.removeExpiredNonces();
    }
}
