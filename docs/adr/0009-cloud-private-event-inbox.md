# JADR-0009：cloud 私有设备事件 Inbox 与公开 Webhook 边界

- 状态：已接受（2026-09-28，按负责人持续推进及推荐裁决授权，限 cloud 接收端）。
- 依据：[双后端职责](0007-unified-console-and-backend-boundary.md)、[两种部署方式](0008-two-deployment-network-modes.md)、[平台公共 Webhook 安全](../../../docs/adr/0182-public-webhook-revisions-delivery-and-signing.md)。

## 四维审计

| 维度 | 结论 |
| --- | --- |
| 事实依据 | 平台公共 Webhook 已有 `deliveryId`、时间戳、nonce 与 HMAC-SHA256 签名原语；其生产传输拒绝私网地址。现有公开投递没有本片的 `keyId` 与 `event` 私有封套合同，cloud 此前也没有 API/数据库。 |
| 逻辑连贯性 | cloud 能验证一份人工签造的测试事件，不能推出 service 已有私网可靠发送、目标配置、断线积压或命令回执。将公共 Webhook 的 SSRF 保护关掉也不能作为内网部署方案。 |
| 信息缺口 | service 到 cloud 的受控私网发送端、身份分发/轮换、事件投递与重放端口、真实设备事件扩展、目标 TLS 证书和业务投影尚未交付。 |
| 观点区分 | HMAC 签名原语和公开出站限制来自平台现行合同；`keyId`、`event` 私有封套、cloud 独立 PostgreSQL、仅显式启用、固定来源绑定与持久去重是本次实施选择，须由未来独立发送端配套。 |

## 接收端合同

`jagonzn-cloud` 可在配置独立 PostgreSQL 后启用 `/api/v1/internal/service-events`。入口消费本片定义的私有 `deliveryId/event` 正文，复用平台 HMAC 签名原语，但额外要求私有 `keyId` 头；最多 256 KiB。受控配置中的固定 `sourceDeploymentId`、`tenantId`、`projectId`、`keyId` 和 32 字节密钥为唯一可信来源。签名覆盖时间戳、nonce、deliveryId、原始正文，时间窗口 300 秒；请求头重复、错密钥、错范围、篡改、过时、非法 JSON 均拒绝。签名密钥不写库、日志或响应，缺配置时启动失败；入口默认关闭。

单独的 cloud 库在一个事务里持久化 nonce 和事件 Inbox，键为 `(sourceDeploymentId,eventId)`；相同事件同字节重投只返回既有成功，改正文冲突返回 409，不产生第二条业务事实。Inbox 只说明已持久接收，不表示人员权限已处理或设备动作成功。当前不提供业务投影、开锁命令或对外查询，避免把测试接收端冒充 cloud SaaS 完成。

TLS 由受控内网代理终止，应用容器/进程端口不得直接暴露给设备网；代理必须只把此路径转发至 cloud。该路径不调用也不放宽 `PinnedWebhookTransport`。未来 service 若复用同一签名格式，仍须增加**独立私网目标审批、服务身份和可靠发送端口**，而非给公开订阅配置私网例外。正式双后端和离线授权验收继续受[专项计划](../../../docs/reuse-entry/THINGS_CLOUD_REUSE_CLOSEOUT_AND_SELF_HOSTED_REVIEW.md)约束。

## 备选与取舍

直接把公开 Webhook 指向 RFC1918 地址会破坏既有 SSRF 约束；应用 MQTT/WS 的零离线会话不能承诺 cloud 故障后的可靠补发；cloud 直接查 service 数据库会破坏数据权威。因此首包只建立独立、持久、可验签的接收端，后续另做受控私网发送和恢复合同。
