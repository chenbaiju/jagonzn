-- 第三方投递仅使用cloud自己的表；请求快照与稳定事件标识支持重启恢复和对账。
CREATE TABLE cloud_http_log_delivery (
 id uuid PRIMARY KEY,
 source_deployment_id uuid NOT NULL,
 event_id uuid NOT NULL,
 target_id text NOT NULL,
 target_revision integer NOT NULL,
 target_snapshot jsonb NOT NULL,
 request_body text NOT NULL,
 state text NOT NULL CHECK (state IN ('PENDING','SENDING','RETRY_WAIT','DELIVERED','UNCERTAIN','FAILED')),
 attempt_count integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,
 lease_until timestamptz,
 http_status integer,
 response_body text,
 failure_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_deployment_id,event_id,target_id),
 FOREIGN KEY(source_deployment_id,event_id) REFERENCES cloud_service_event_inbox(source_deployment_id,event_id)
);
CREATE INDEX idx_cloud_http_log_delivery_pending ON cloud_http_log_delivery(state,next_attempt_at);
COMMENT ON TABLE cloud_http_log_delivery IS '逐目标冻结的第三方JSON投递任务，不代表第三方业务已执行';
