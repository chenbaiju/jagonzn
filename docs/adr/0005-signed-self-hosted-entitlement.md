# JADR-0005：独立部署由平台签名权益控制

- 状态：已接受（2026-09-28，负责人明确 ThingsCloud 登记/签发、jagonzn 装配平台验签/计量内核并限制套餐）。
- 取代范围：[service 后端旧方案](../jagonzn-service-backend-architecture.md)和[双项目旧方案](../jagonzn-system-architecture.md)中“默认无限商业额度”“超过档位不拒绝”的产品目标；不取代 [JADR-0002](0002-tenant-isolated-deployment.md) 的隔离库、[JADR-0003](0003-platform-change-authority.md) 的代码归属或 [JADR-0004](0004-official-reuse-entry.md) 的正式接收边界。
- 平台依据：[ADR0216](../../../docs/adr/0216-self-hosted-entitlement-issuance-identity-and-term.md)、[ADR0218](../../../docs/adr/0218-self-hosted-capability-enforcement-boundary.md)、[ADR0219](../../../docs/adr/0219-self-hosted-product-revision-approval-before-signing.md)、[专项进度](../../../docs/reuse-entry/THINGS_CLOUD_REUSE_CLOSEOUT_PROGRESS.md)。

## 四维核对

**事实依据**：旧 jagonzn 文档在 2026-09-24 以独立无限额度作为目标；2026-09-28 负责人明确商用四档设备/消息总量、自部署联网/离线两种情况，以及 ThingsCloud 维护登记、签发和可复用验签/计量组件，jagonzn 负责部署导入、配置、界面及整体验收。

**逻辑连贯性**：独立数据库及不连接原 ThingsCloud 应用，只说明设备数据与运行资源独立，不推出免套餐。若 jagonzn 自行返回无限额度或把缺失授权降为 FREE，会绕过签名权益；若在 jagonzn 复制平台判定内核，会使 MQTT/TCP/CoAP、规则和实际发送等平台内部入口无法统一强制。

**信息缺口**：完整四档修订仍是[待审稿](../../../docs/reuse-entry/THINGS_CLOUD_SELF_HOSTED_REVISION_REVIEW_DRAFT.md)，正式密钥与审核、联网续期、离线导入、端到端计量和 jagonzn 界面均未完成。旧本机非商业候选不能充作客户发行物。

**观点区分**：单部署单租户、签名权益和平台内核归属来自已接受平台 ADR 与负责人最新裁决；把旧“无限”表述归为历史目标、将 jagonzn 当前职责限定为装配/导入/UI，是本次文档校准。功能和额度草案尚不是获批产品。

## 决策

未来对客户分发的 `jagonzn-service`，包括 FREE 档，必须导入 ThingsCloud 发行方签署的、绑定一个部署和一个计费租户的有效权益。平台可复用运行时解析、验签、计量和拒绝，jagonzn 在自身工程实现现场部署身份、申请传递、授权文件导入、配置与管理界面，并对同一固定制品做联网和纯离线整体验收。jagonzn 不修改平台核心代码、迁移或签发私钥。现场设备事实和实际用量仍保留在 jagonzn 独立库；ThingsCloud 发行方知道申请/审核/签发事实，离线时不能推断现场已导入或实际用量。

当前本机 `NONCOMMERCIAL` 有限技术容量只用于未发行的研发候选。正式自部署发行物不得依赖该开关扩大权益，不得把没有文件、坏签名、错租户/部署或旧序号转换为无限、旧付费档或未签名 FREE。四档数值和能力需先获批独立修订，原 SaaS `product-revision-1` 不自动移植；FREE 也签名。联网和离线只改变申请/授权介质，最终都走同一导入与平台判定内核。云端 SaaS 订单/收款与 jagonzn-cloud 后续人员开锁授权不属于这套现场计量的替代物。

备选一是保留旧无限模式：它不能满足负责人最新四档商用目标，拒绝。备选二是由 jagonzn 自建验签和计量副本：它违背平台变更权威并留下后台 Worker/物理发送旁路，拒绝。

## 实施与验收边界

平台当前 [G3-SHC-REG-1](../../../docs/reuse-entry/audits/G3-SHC-REG-1-enrollment-registration-2026-09-28.md)只产生发行方 `PENDING` 申请事实，不是客户授权；[四档待审稿](../../../docs/reuse-entry/THINGS_CLOUD_SELF_HOSTED_REVISION_REVIEW_DRAFT.md)不是批准清单。jagonzn 阶段 1 的正式复用接收与 SHC 固定商业发行分别验收：先确认同版本制品/迁移/运行时来源，再验证有效/无效授权、额度边界、四协议、规则/任务、下行、断网、跨日、导入恢复和原 SaaS 兼容。未取得这些结果前，本 ADR 不称授权码验证或套餐限制已开发完成。

返回 [ADR 索引](README.md)。
