package com.jagonzn.cloud.integration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/** cloud 独立数据库中的接收事实；同一事务保存防重放标识与来源事件。 */
@Service
@ConditionalOnProperty(name = "jagonzn.cloud.service-events.enabled", havingValue = "true")
public class CloudServiceEventInboxStore {
    private final JdbcTemplate jdbc;

    public CloudServiceEventInboxStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** 只对已验签且已核对来源范围的事件调用。 */
    @Transactional
    public Outcome accept(UUID sourceDeploymentId, UUID nonce, UUID deliveryId, UUID eventId,
                          UUID tenantId, UUID projectId, String eventType, String eventDigest,
                          String eventJson) {
        int nonceRows = jdbc.update("""
                INSERT INTO cloud_service_event_nonce(source_deployment_id, nonce)
                VALUES (?, ?) ON CONFLICT DO NOTHING
                """, sourceDeploymentId, nonce);
        if (nonceRows == 0) return Outcome.REPLAY;
        int inserted = jdbc.update("""
                INSERT INTO cloud_service_event_inbox(source_deployment_id,event_id,delivery_id,
                    tenant_id,project_id,event_type,event_digest,event_body)
                VALUES (?,?,?,?,?,?,?,?::jsonb) ON CONFLICT DO NOTHING
                """, sourceDeploymentId, eventId, deliveryId, tenantId, projectId, eventType,
                eventDigest, eventJson);
        if (inserted == 1) return Outcome.ACCEPTED;
        var existing = jdbc.query("""
                SELECT event_digest FROM cloud_service_event_inbox
                 WHERE source_deployment_id=? AND event_id=?
                """, (row, ignored) -> row.getString(1).trim(), sourceDeploymentId, eventId);
        return existing.size() == 1 && existing.getFirst().equals(eventDigest)
                ? Outcome.DUPLICATE : Outcome.CONFLICT;
    }

    /** 超过签名时间窗的旧 nonce 仍留存一天，再由受限维护任务清理。 */
    public int removeExpiredNonces() {
        return jdbc.update("DELETE FROM cloud_service_event_nonce WHERE received_at < now() - interval '1 day'");
    }

    public enum Outcome { ACCEPTED, DUPLICATE, REPLAY, CONFLICT }
}
