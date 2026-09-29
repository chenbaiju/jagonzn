# jagonzn 架构决策记录（ADR）

本目录只归档 **jagonzn 项目范围内已获负责人裁决、影响长期边界的决策**。编号 `JADR-NNNN` 与 ThingsCloud 的 [平台 ADR](../../../docs/adr/README.md) 分开；本目录不替 ThingsCloud 做平台决策，也不表示平台已接受需求或交付能力。

| 编号 | 决策 | 状态 | 实施边界 |
| --- | --- | --- | --- |
| [JADR-0001](0001-service-cloud-responsibilities.md) | service 承担设备接入与 IoT 运行，cloud 承担后续 SaaS 业务 | 已接受 | 现 cloud 仅有私有事件 Inbox，完整业务仍待交付 |
| [JADR-0002](0002-tenant-isolated-deployment.md) | jagonzn 以租户模型进行独立同构部署，版本向 ThingsCloud 对齐 | 已接受 | 内核装配和数据库初始化待正式交付 |
| [JADR-0003](0003-platform-change-authority.md) | jagonzn 只做自身设备适配与验证，平台变更由 ThingsCloud 独立评审 | 已接受 | 平台能力缺口仍受阻 |
| [JADR-0004](0004-official-reuse-entry.md) | jagonzn 选择方案 A，请 ThingsCloud 评审并提供正式复用入口 | 已接受 | ThingsCloud 已受理并形成固定本机候选；正式接收待验，原 ADR 文本为当时状态 |
| [JADR-0005](0005-signed-self-hosted-entitlement.md) | 对客户分发的独立部署改用平台签名四档权益；jagonzn 装配平台内核并负责导入/UI | 已接受 | 取代旧无限额度目标；当前只有待审登记和产品草案，正式签发/套餐强制未完成 |
| [JADR-0006](0006-local-enrollment-identity-file.md) | 现场以单租户持久身份生成可离线传递的 V1 申请 | 已接受 | 申请只证明私钥持有，仍须发行方审核与签发 |
| [JADR-0007](0007-unified-console-and-backend-boundary.md) | jagonzn-console 统一技术及业务 Web 操作；service/cloud 保留各自 API 与数据库 | 已接受 | 仅设计；原网络形态建议由 JADR-0008 取代 |
| [JADR-0008](0008-two-deployment-network-modes.md) | 首版公网双后端、全内网双后端两种部署形态 | 已接受 | 取代 JADR-0007 的混合公网/私网形态建议；真实部署待验 |
| [JADR-0009](0009-cloud-private-event-inbox.md) | cloud 私有事件 Inbox 保持公开 Webhook 私网拒绝策略 | 已接受；来源部署头由 JADR-0010 补充 | 先交付接收端；service 私网发送和业务命令仍开放 |
| [JADR-0010](0010-service-cloud-signed-event-forwarder.md) | service 单项目可信源到 cloud 签名 HTTPS 适配 | 已接受 | 本机聚焦验证；真实 Kafka、双库恢复和多项目仍开放 |
| [JADR-0011](0011-private-cloud-delivery-scope-rotation-and-recovery.md) | 私有事件多项目范围、轮换与受控恢复 | 已接受 | 合成事件同候选回执；真实设备与业务投影仍开放 |
| [JADR-0012](0012-test-only-signed-grant-runtime-assembly.md) | TEST 公钥只由测试类路径装配到 service 签名模式 | 已接受 | 普通 JAR 缺正式公钥或误选测试来源均拒绝；双后端动态实验仍开放 |
| [JADR-0013](0013-technical-command-lab-and-business-unlock-boundary.md) | 本机无害技术命令实验与未来物理开锁业务入口分离 | 已接受 | cloud 业务授权、服务端有效期与首台锁语义仍待实施和验收 |

## 维护规则

- 每一项新的重大架构裁决单独建一份 ADR，写明依据、备选项、取舍、影响和实施状态，并更新本索引及相关正文。普通实现细节、候选建议和待裁决问题不冒充已接受 ADR。
- 已接受 ADR 保持原文；决策变化时新增 ADR，在索引标明取代关系，并更新现行架构与进度正文。`JCH-NNN` 是知识库变更记录，`J<阶段>-<序号>` 是功能切片编号，均不替代 ADR 编号。
- ThingsCloud 的公共代码、数据库结构、合同及其 ADR 由 ThingsCloud 自行维护；jagonzn 的[反馈台账](../PLATFORM_CAPABILITY_FEEDBACK.md)只提供评审输入。
