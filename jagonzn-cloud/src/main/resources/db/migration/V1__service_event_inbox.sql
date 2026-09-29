CREATE TABLE cloud_service_event_inbox (
    source_deployment_id uuid NOT NULL,
    event_id uuid NOT NULL,
    delivery_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    project_id uuid NOT NULL,
    event_type text NOT NULL,
    event_digest char(64) NOT NULL,
    event_body jsonb NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_cloud_service_event_inbox PRIMARY KEY (source_deployment_id, event_id),
    CONSTRAINT uq_cloud_service_delivery UNIQUE (source_deployment_id, delivery_id)
);

COMMENT ON TABLE cloud_service_event_inbox IS '业务后端已持久接收的设备事件，不代表业务处理完成';
COMMENT ON COLUMN cloud_service_event_inbox.source_deployment_id IS '发送事件的技术服务部署标识';
COMMENT ON COLUMN cloud_service_event_inbox.event_id IS '来源事件的稳定标识';
COMMENT ON COLUMN cloud_service_event_inbox.delivery_id IS '本次传输交付标识';
COMMENT ON COLUMN cloud_service_event_inbox.tenant_id IS '可信签名配置绑定的租户标识';
COMMENT ON COLUMN cloud_service_event_inbox.project_id IS '可信签名配置绑定的项目标识';
COMMENT ON COLUMN cloud_service_event_inbox.event_type IS '版本化来源事件类型';
COMMENT ON COLUMN cloud_service_event_inbox.event_digest IS '事件正文的 SHA-256 摘要';
COMMENT ON COLUMN cloud_service_event_inbox.event_body IS '原始版本化事件 JSON 正文';
COMMENT ON COLUMN cloud_service_event_inbox.received_at IS '业务后端持久接收时间';

CREATE TABLE cloud_service_event_nonce (
    source_deployment_id uuid NOT NULL,
    nonce uuid NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_cloud_service_event_nonce PRIMARY KEY (source_deployment_id, nonce)
);
CREATE INDEX idx_cloud_service_event_nonce_received_at ON cloud_service_event_nonce (received_at);

COMMENT ON TABLE cloud_service_event_nonce IS '服务间签名请求的短窗重放标识';
COMMENT ON COLUMN cloud_service_event_nonce.source_deployment_id IS '发送事件的技术服务部署标识';
COMMENT ON COLUMN cloud_service_event_nonce.nonce IS '一次签名请求的随机标识';
COMMENT ON COLUMN cloud_service_event_nonce.received_at IS '随机标识首次持久接收时间';
