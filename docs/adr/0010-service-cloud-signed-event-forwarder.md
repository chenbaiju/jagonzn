# JADR-0010：service 对 cloud 的独立签名事件发送适配

- 状态：已接受（2026-09-28；补充 JADR-0009 的来源部署请求头，只覆盖单项目发送适配，完整双端交接仍未验收）。
- 后续多项目、轮换与处置合同见 [JADR-0011](0011-private-cloud-delivery-scope-rotation-and-recovery.md)；本 ADR 的单项目限制保留为当时实现事实。
- 依据：[平台内部源](../../../docs/adr/0228-internal-event-source-independent-from-public-webhook.md)、[cloud Inbox](0009-cloud-private-event-inbox.md)、[双后端模式](0008-two-deployment-network-modes.md)。

## 四维审计

| 维度 | 结论 |
| --- | --- |
| 事实依据 | 平台 `PublicWebhookSourceWriter` 可在事务内写出已选七类内部事件；`WebhookSourceKafkaConfiguration` 使用逐记录 ack 和无限错误重试，失败不提交 offset；cloud Inbox 接受受信 HTTPS、HMAC 与固定来源范围。 |
| 逻辑连贯性 | 拥有事件源、发送适配和接收端各自测试，仍不能推出实际 Kafka→cloud 双库链、断线期间积压、真实设备事件或命令结果已验。 |
| 信息缺口 | 目标内网/公网地址和证书、正式服务身份与密钥分发、双密钥轮换、多项目接收映射、超长来源事件运维处置及完整固定候选恢复仍缺。 |
| 观点区分 | 平台来源、Kafka 错误处理和公开 Webhook 私网禁令是现行合同；单项目配置绑定、同事件 ID 作为交付 ID、仅 200 认定持久签收及默认关闭为本次实现选择。 |

## 首版发送合同

`jagonzn-service` 的 `PrivateCloudEventForwarder` 默认关闭，仅在内部持久源同时启用、目标为精确 `/api/v1/internal/service-events` 的 HTTPS URL、部署/租户/项目/key ID/32 字节密钥齐全时装配。它使用**独立 Kafka 消费组**读取平台内部源，核对 Topic、分区键和冻结事件摘要；只转发显式绑定的一个租户项目。HTTP 连接使用 JVM 受信证书链、不跟随重定向；签名覆盖时间戳、随机 nonce、稳定事件 ID 与原始封套正文，来源部署头供 cloud 验签后复核。cloud 返回 200 才提交消费记录；其他状态和网络错误抛出固定错误码，由共享无限重试容器保留 offset。重试使用新 nonce，同一事件 ID 和正文保持不变，cloud Inbox 作幂等接纳。

本配置并非外部任意 Webhook 订阅；URL 和密钥只由部署管理员配置，目标网络须有出站限制。内部来源启用后若发送端未启动，Kafka 将保留积压；服务实例的同一消费组由 Kafka 分区协调。当前单项目范围外事件会被该组略过并提交 offset，**不能把它推广为整租户多项目可靠交付**；多项目映射须在正式双后端工作包内另行实现。来源正文超 256 KiB、消息身份损坏及 cloud 持续拒绝均失败关闭并阻塞相应分区，需正式死信/处置作业。密钥轮换目前需维护窗口协调两端重启，没有不中断的双 key 交叠回执。

## 验收边界

聚焦测试仅核对编码、签名、真实本机 HTTPS、证书拒绝、错误状态重试与外部 service 装配；cloud 单端隔离实验另有回执。这些结果不可跨不同源码身份拼接为正式全内网或公网双后端资格。`G3-SHC-JAG-PRIVATE-DELIVERY-1` 仍需同固定候选真实 Kafka、两库、断线/恢复、多项目与轮换完整动态证明；公开 `PinnedWebhookTransport` 的私网拒绝保持不变。
