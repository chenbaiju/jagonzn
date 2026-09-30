# jagonzn 项目开发进度总览

> 更新日期：2026-09-30
> 最新补充验证：Windows 原生身份边界 9 项通过；实际 JAR 离线导入仍复现 POSIX 权限 API 不支持。普通候选配置拒绝 3 项、POSIX 实际 CLI 缺根拒绝 1 项通过。原 shc1 双 JAR 未找到，完整权益/业务/API/Console 矩阵缺实现和材料，见[专项结果](../../docs/reuse-entry/THINGS_CLOUD_LOCAL_CONTINUATION_20260930.md)与[实施债务 001～003](IMPLEMENTATION_DEBT.md)。独立 rc4 V5g 已取得真实 UTC 跨日通过回执，历史等待/失败记录保留原日期。本轮未提交或推送。
> 最新范围调整：负责人暂停原 Console/共享包复制，改为在 `jagonzn-console` 创建独立 Vue + Vite 免登录静态测试页。后续[002 测试回执](../jagonzn-console/docs/TEST_EXECUTION_20260929.md)完成浏览器 5/5、静态网络 14/14及后端停止/静态重启稳定 16/16；新预检 15 PASS/0 FAIL，原 Console 三项失败已复测通过。HTTP 13006 保留，测试 HTTPS 实际用 13007；静态页无业务 API，正式 Console 和完整 LAN 验收仍待完成。
> 2026-09-29 后续交接：负责人将 jagonzn 后续开发与具备本地条件的专项测试交给当前代理。执行前核对既有设计/平台边界；未定义业务合同仍先冻结。后端全量由负责人手动执行，当前代理不执行全量、不提交或推送。本轮计划与结果见[本地专项接管](../../docs/reuse-entry/THINGS_CLOUD_LOCAL_TEST_EXECUTION_20260929.md)。
> 本轮本地专项：service 原生 24 项中 22 过/1 权限错/1 跳，同 8 项 POSIX 全过；cloud 6/6，商业真浏览器 5/5，TEST 授权跨进程两侧各 1/1。新 SNAPSHOT 双后端在正常 5 GiB Broker 门槛下完成私有交付、毒消息恢复及两条模拟 MQTT 技术命令；首次预检 11 PASS/3 FAIL 保留为历史快照，静态 Console 后续补入后的新预检为 15/15，完整资格仍 BLOCKED。Windows 原生离线导入尚不支持，正式根/完整套餐/业务开锁/真机仍待前置。本轮独立实验栈最终停止且保留卷；V5g 等待真实午夜，详见上述回执。
> 状态：开发路线按“复用 ThingsCloud 能力 → 接入设备 → 验证闭环 → 汇总缺口反馈”分阶段；平台已受理正式复用入口并开始本地候选实施，阶段 1 接收门禁尚未通过。
> 本文记录 jagonzn 项目进展，不替代 ThingsCloud 仓库的 [开发进度总览](../../docs/PROGRESS.md)，也不改变 ThingsCloud 当前执行轨迹。
> 2026-09-29 负责人授权 Windows 接管测试：已批准修订状态校准，可靠受理与业务完成按[ADR0231](../../docs/adr/0231-self-hosted-uplink-admission-and-business-completion.md)分别验收；[接管记录](../../docs/reuse-entry/THINGS_CLOUD_WINDOWS_TAKEOVER_20260929.md)登记 rc4 V5g、宿主 UDP、当前源码及 SHC 可执行回归，阶段接收与正式签发门禁仍开放。
> 本轮 rc4 [Windows 宿主 UDP/DTLS](../../docs/reuse-entry/audits/G3-REUSE-V3d-rc4-windows-host-udp-2026-09-29.md)及可靠交接故障恢复通过；V5g 新 D 日准备通过，等待真实午夜。当前平台 SHC 持久聚焦 13 项通过，密钥 2 项原生 POSIX 错误；平台全量两轮失败，第二轮 issuer 3 项权限错误，后续模块未执行。jagonzn 原生申请/授权目标 6 过、1 错、1 跳；独立 POSIX 的同 8 项全部通过并单列留证，不能写成 Windows 全过或正式签发。
> 2026-09-28 负责人已把未来正式独立部署的商业目标从旧无限额度调整为平台签名四档权益，见 [JADR-0005](adr/0005-signed-self-hosted-entitlement.md)。当前本机有限 `NONCOMMERCIAL` 仍是未发行候选；ThingsCloud 的待审申请登记、运营端只读队列、[已批准四档产品修订](../../docs/reuse-entry/THINGS_CLOUD_SELF_HOSTED_APPROVED_REVISION_V1.md)和可复用公钥验签组件不代表正式授权已可用。后续本机 TEST 授权导入与三项额度实验已通过，见[专项台账](../../docs/reuse-entry/THINGS_CLOUD_REUSE_CLOSEOUT_PROGRESS.md)；正式签发及完整套餐强制仍未取得回执。

> 2026-09-28 负责人进一步确定 [JADR-0007](adr/0007-unified-console-and-backend-boundary.md)：service 与 cloud 都是后端，后续 `jagonzn-console` 统一浏览器操作。cloud 继续负责人员、组织、场所、开锁权限/时段、业务审计和处置及自己的业务数据库，不接管设备协议或 service 技术事实。当时 console 尚不存在；2026-09-29 新增的是独立静态测试页，正式界面仍待交付，不改变阶段 0/1 完成状态。

> 2026-09-28 全内网优先：现有本机 Compose 的[只读预检回执](../../docs/reuse-entry/audits/G3-SHC-JAG-LAN-PREFLIGHT-1-2026-09-28.md)为 4 PASS/9 FAIL；cloud/console 缺席、网络未隔绝互联网，正式 LAN 门禁未放行。内网实验与正式资格的完成定义见[专项合同](../../docs/reuse-entry/THINGS_CLOUD_JAGONZN_LAN_LOCAL_READINESS.md)。

> 后续 [TEST 运行时装配回执](../../docs/reuse-entry/audits/G3-SHC-JAG-LAB-RUNTIME-WIRING-1-2026-09-28.md)已验证仅测试类路径可注入当轮临时公钥，普通 JAR 缺正式根或误选测试源均拒绝启动；3 项轻量装配测试通过，普通 JAR 不含测试根。该工作包当时待复验的跨进程交接已由[后续 TEST 回执](../../docs/reuse-entry/audits/G3-SHC-JAG-LAB-RUNTIME-HANDOFF-2-2026-09-28.md)完成；固定候选完整双后端授权验收及正式现场资格仍开放。

> [私网命令结果来源回执](../../docs/reuse-entry/audits/G3-SHC-JAG-COMMAND-RESULT-SOURCE-1-2026-09-28.md)验证公开 Webhook 关闭时可信内部 `command.completed` 的身份、终态与发送器重试字段；该工作包是无容器聚焦合同。后续[双后端技术命令回执](../../docs/reuse-entry/audits/G3-SHC-JAG-TECH-COMMAND-LAB-1-2026-09-28.md)已覆盖模拟 MQTT 设备 ACK/终态和 cloud Inbox；物理设备回复、cloud 开锁业务授权/投影仍未验。

> [JADR-0013](adr/0013-technical-command-lab-and-business-unlock-boundary.md)已限定本机先测无害技术命令与 cloud Inbox 终态接收；现有技术 API 无每次业务操作的服务端失效字段，不能直接作为人员开锁入口。[技术命令动态回执](../../docs/reuse-entry/audits/G3-SHC-JAG-TECH-COMMAND-LAB-1-2026-09-28.md)已完成模拟 MQTT 设备链，人员权限和物理锁语义保持后续门禁。

> 同日 [cloud 私有事件 Inbox](../../docs/reuse-entry/audits/G3-SHC-JAG-CLOUD-INBOX-1-2026-09-28.md)已在本工作树以独立 PostgreSQL、真实 HTTP 和签名/去重负例通过；当时尚未部署到前述 rc4 Compose 栈，也没有 service 私网发送、业务命令或 console。后续[固定候选私网交付回执](../../docs/reuse-entry/audits/G3-SHC-JAG-PRIVATE-DELIVERY-1-2026-09-28.md)已补技术发送链；负责人选择正式客户资格为关闭口径，正式签名及完整双后端交付前继续阻塞。

> 其后 [cloud 无互联网实验栈](../../docs/reuse-entry/audits/G3-SHC-JAG-CLOUD-LAN-LAB-1-2026-09-28.md)仅验证 cloud 一端独立库、内部受信 HTTPS 与签名事件；未与 service 组网，未提供浏览器 LAN 入口，正式双后端资格继续阻塞。

> 平台 [ADR0228](../../docs/adr/0228-internal-event-source-independent-from-public-webhook.md)已把可信内部事件源与公开 Webhook 开关分离；当时 jagonzn-service 仅新增默认关闭的部署变量映射。后续私网发送端与固定候选技术交付见[专项台账](../../docs/reuse-entry/THINGS_CLOUD_REUSE_CLOSEOUT_PROGRESS.md)；Kafka 积压本身仍不能算 cloud 签收。

> 后续 [JADR-0010](adr/0010-service-cloud-signed-event-forwarder.md)实现默认关闭的单项目 Kafka→cloud 签名 HTTPS 适配，外部 service 装配和真实回环 TLS 聚焦通过；前一句记录的是源开关工作包当时状态。[固定候选交付回执](../../docs/reuse-entry/audits/G3-SHC-JAG-PRIVATE-DELIVERY-1-2026-09-28.md)已补实际 Kafka→cloud 独立库、断线积压、多项目及轮换，所用来源为合成事实且 Broker 容量受限；正式内网资格仍阻塞。

> 同日负责人将首版双后端部署限定为公网双后端、无互联网但彼此可达的全内网双后端，见 [JADR-0008](adr/0008-two-deployment-network-modes.md)。混合公网/私网拓扑不进入当前计划；两种形态的目标环境、授权交付和双后端动态验收均未完成。

> [G3-SHC-REV-3](../../docs/reuse-entry/audits/G3-SHC-REV-3-shared-approved-revision-binding-2026-09-28.md)已给平台可复用模块增加获批修订的严格读取与已验签授权精确匹配；该工作包当时尚无 jagonzn 导入或热路径门禁。后续[本机 TEST 授权导入](../../docs/reuse-entry/audits/G3-SHC-LAB-IMPORT-1-local-test-grant-import-2026-09-28.md)与[三项额度回执](../../docs/reuse-entry/audits/G3-SHC-LAB-QUOTA-1-local-test-quota-admission-2026-09-28.md)不能升级为正式现场授权或完整套餐资格。

现场 [G3-SHC-ENROLL-LOCAL-1](../../docs/reuse-entry/audits/G3-SHC-ENROLL-LOCAL-1-jagonzn-offline-request-2026-09-28.md) 已提供稳定身份与可离线传递的 V1 待审申请；该包当时尚无授权导入或套餐强制。后续本机 TEST 导入与三项额度实验见上，申请文件仍须经正式审核签发才可用于客户现场。

[G3-SHC-ENROLL-E2E-1](../../docs/reuse-entry/audits/G3-SHC-ENROLL-E2E-1-cross-process-pending-intake-2026-09-28.md)已从本工作树真实 jagonzn JAR 生成申请文件，再经 ThingsCloud 运营受控入口完成本机跨进程 `PENDING` 联调；该包不提供客户在线自助申请、已审核组织归属或正式签发。其后的 TEST 授权导入与三项额度仅属实验回执，不构成正式现场套餐强制。

## 1. 目标与状态摘要

jagonzn 是当前 ThingsCloud 项目中的一个租户。jagonzn-service 作为该租户的独立运行验证部署，另行创建与 ThingsCloud 原数据库完全隔离的 `jagonzn` 数据库，使用与所复用 ThingsCloud 版本一致的表结构。数据库迁移 owner 为 `jagonzn`，应用账号为 `jagonzn_app`；迁移从同版本平台 JAR 生成，仅对固定数据库角色标识作确定性映射，详见[ADR0214](../../docs/adr/0214-official-runtime-reuse-entry.md)。先复用已交付且可装配的能力，再在 jagonzn 自身项目开发厂商适配，最后用真实设备验证身份、属性、事件、命令和设备结果。**jagonzn 不得修改 ThingsCloud 的任何代码或数据库表；发现不足只登记证据与改进建议，由 ThingsCloud 自行评审。**已有能力无法完成的闭环项如实标记受阻，设备事实不回写 ThingsCloud 原数据库。独立反馈台账见[平台能力不足与改进建议](PLATFORM_CAPABILITY_FEEDBACK.md)。

| 项目 | 当前状态 |
| --- | --- |
| 总体阶段 | **阶段 0：基线核对与最小合同冻结**；双应用基线构建与上下文已通过 |
| 当前/下一工作 | J0-1 已通过；ThingsCloud 已按方案 A 建立[ADR0214](../../docs/adr/0214-official-runtime-reuse-entry.md)并实施运行时 JAR 本地候选。四协议和非商业本机路径有候选回执，正式制品和完整接收仍待完成；并行的自部署商用已有[平台待审申请登记](../../docs/reuse-entry/audits/G3-SHC-REG-1-enrollment-registration-2026-09-28.md)、[运营端待审接收](../../docs/reuse-entry/audits/G3-SHC-INTAKE-1-operator-pending-http-2026-09-28.md)、[已批准四档修订](../../docs/reuse-entry/THINGS_CLOUD_SELF_HOSTED_APPROVED_REVISION_V1.md)和[可复用公钥验签组件](../../docs/reuse-entry/audits/G3-SHC-VERIFIER-1-runtime-public-key-kernel-2026-09-28.md)。jagonzn 本机 TEST 导入与设备、上下行三项额度已有局部回执；正式签发、固定候选完整强制、统一界面及全内网接收尚未完成 |
| 下一道阶段门 | ThingsCloud 正式复用入口、同源同构且 jagonzn 角色命名的迁移、隔离部署合同交付并核实；设备合同在阶段 2 前另行裁定 |
| jagonzn-service 代码基线 | Spring Boot 4.1.0；已接入 ThingsCloud 全量运行时本地候选并通过独立空库上下文测试；尚无正式不可变制品、实际设备协议适配和闭环实现 |
| 当前文档基线 | 双项目架构、service 复用方案、协议调研、接入合同演进和优先级建议已记录 |
| 实现状态 | **内核本地候选装配已验证，阶段 1 尚未验收**；service 独立空库迁移、RLS、健康 HTTP 及 HTTPS/MQTT/TCP/CoAP 各一条有效属性链路已验证；其他业务、故障与外部交付尚未验。J0-1 历史回执见[记录](progress/J0.md) |
| ThingsCloud 当前轨迹 | 不因本文件改变；以 ThingsCloud 仓库进度总览、门禁和负责人后续指令为准 |

阶段顺序依据：[service 后端复用与独立部署架构](jagonzn-service-backend-architecture.md)、[隔离验证部署与平台合同演进](tenant-validation-and-contract-evolution.md)、[多协议建设优先级](protocol-expansion-priority.md)。
已获裁决的长期边界逐项归档于 [jagonzn ADR 索引](adr/README.md)；候选建议和未交付能力不能因归档而改变本页实施状态。

2026-09-25 本机一键部署候选已使用 `jagonzn-service` Compose 项目启动独立数据库、Redis、Redpanda、MinIO、EMQX 与服务容器；健康入口返回 200，独立库 313 条迁移成功，`jagonzn` 与 `jagonzn_app` 等角色已核对。生成的本机凭据与外置配置均被 Git 忽略且未进入应用 JAR。当前 Windows/Temurin 21.0.11 直接从 IDE 运行会在 Kafka Selector 初始化时失败；容器内运行和回环远程调试端口可用。这些只证明本地部署与进程启动，不替代设备 MQTT、HTTP/TCP/CoAP、MinIO 业务或正式部署验收。

2026-09-25 又补充独立 Caddy HTTPS 设备入口、EMQX API 身份、MinIO 受限应用身份、显式非商业有限技术容量及一次性数据库恢复演练；HTTPS/MQTT/TCP/CoAP 四协议各一条标准属性路径、OTA 固件草稿上传到独立 MinIO、含样例数据的数据库恢复与单对象恢复已通过。非商业项目/设备/终端用户/看板/外部协作者席位的独立 HTTP 技术限额与公开 API Key 读/撤销、实时 WS/独立应用 Broker MQTT 设备事件交付、Webhook 管理创建/撤销也已通过；Webhook 对外投递待验。上述[本机核对](../../docs/reuse-entry/audits/G3-REUSE-3-5-local-candidate-2026-09-25.md)只覆盖已列路径，不关闭阶段 1 接收门。

2026-09-26 正式复用入口仍未完整接收；历史边界见[补充登记](../../docs/reuse-entry/audits/G3-REUSE-status-2026-09-26.md)，新一轮四协议、故障交接、独立应用8项、样例恢复、平台Webhook专项及本机隔离SMTP注册/告警邮件复验见[本机回执](../../docs/reuse-entry/audits/G3-REUSE-local-reverification-2026-09-26.md)。按[统一清单](../../docs/reuse-entry/THINGS_CLOUD_REUSE_ACCEPTANCE_CHECKLIST.md)登记；负责人要求完成SMTP验证和提交后暂停，JPF-001/003继续开放。未来厂商真机适配不混作本入口已交付能力。

## 2. 阶段总览

| 阶段 | 目标 | 状态 | 进入/完成条件 |
| --- | --- | --- | --- |
| 0. 基线核对与合同冻结 | 明确依赖版本、隔离边界并登记后续设备合同问题 | **进行中** | 按 §3 分阶段裁定；阶段 1 的依赖与部署门禁通过后可进入能力复用，不以未来插件设计为前提 |
| 1. 复用 ThingsCloud 已交付能力 | 让 service 在独立部署中装配并运行约定的内核能力 | 未开始 | 固定内核与数据库迁移版本；隔离数据库完成初始化；启用能力及安全/计量边界经验证 |
| 2. 接入首个设备 | 在已有平台能力内开发选定设备的厂商适配器 | 未开始 | 型号/固件及协议证据明确；支持路径可运行；缺失路径登记受阻，不能认领完整接入 |
| 3. 验证单设备端到端闭环 | 核对身份、数据语义、命令和设备实际结果 | 未开始 | 按 §6 保存验证证据；必需闭环存在平台缺口时仅记录部分通过，阶段不得标完整通过 |
| 4. 多协议对照与缺口反馈 | 用其他设备协议对照能力边界，向 ThingsCloud 提供评审材料 | 未开始 | 完成证据与建议登记；平台是否修改、如何排期由 ThingsCloud 决定；后续正式交付后再复验 |

本阶段安排是 jagonzn 的开发路线。每阶段详细实现任务、接口字段和数据库变更须在相应设计冻结后进入实施记录，不能仅凭阶段标题推导为已批准的具体技术方案。

### 2.1 功能切片编号与候选清单

切片采用 `J<阶段>-<序号>` 编号，编号一经登记不复用。编号仅绑定一个可独立演示、验证和回滚的功能或缺陷闭环；构建、取证、设计、文档与测试属于片内步骤。单片上限遵守[实施手册 §2.1](../../docs/DEVELOPMENT_ROADMAP.md#2.1%20单人纵向切片)原有 **4 小时** 规则。下表“候选”只有范围建议，动工前仍须核对前置合同和 4 小时规模；超过上限时按独立功能边界重新编号拆分，不将技术步骤改称切片。

| 编号 | 独立功能及验收入口 | 前置条件 | 状态 |
| --- | --- | --- | --- |
| J0-1 | jagonzn-service 独立健康 HTTP 入口；真实请求验证最小 `UP`，敏感端点不暴露 | Spring Boot 4.1.0 基线 | **通过**，见[功能回执](progress/J0.md) |
| J1-1 | `jagonzn` 独立数据库由同版本 ThingsCloud 迁移生成物初始化并可供 service 连接，验证同构、jagonzn 命名角色和不跨库写入 | 正式迁移清单、连接角色及隔离边界冻结 | 本地空库、历史升级及空业务库备份恢复候选已验；正式制品和生产恢复待验 |
| J1-2 | jagonzn-service 通过现有受支持能力完成本租户下项目/设备的授权读取，越权读取被拒绝 | J1-1、正式 JAR 装配入口和身份合同 | 候选，JPF-001 前置未满足 |
| J1-3 | 选定的现有标准接入路径完成一次设备属性上报到平台当前值/历史并返回合同受理结果 | J1-2、对应协议及消息基础设施 | 标准 HTTP 的独立实栈本地候选已通过；正式版本与阶段 1 前置仍未满足 |
| J2-1 | 选定厂商设备的一类真实报文完成分帧、可信身份映射和一项属性入库 | 首台型号/固件、凭据与现有接入接口已确认 | 候选，设备未选定 |
| J2-2 | 首台设备一类逐次事件完成受理、保存、去重与查询 | ThingsCloud 正式提供受支持事件入口；JPF-002 解除 | 候选，受阻 |
| J2-3 | 首台设备一类命令完成授权下发、设备 ACK/结果关联与超时区分 | 型号协议和受支持命令合同已确认 | 候选，设备未选定 |
| J3-1 | 已接入设备在断连、重复上报及恢复后保持已交付事实与结果的一致性 | J2 对应路径已通过，重试/保留规则冻结 | 候选；属于可靠性行为闭环，不单列“跑测试”切片 |
| J4-1 | 第二种协议设备的一类报文按已有接入合同入库，形成两协议兼容证据 | 第二型号/固件及现有平台接口已确认 | 候选；平台改进建议随片内记录，不单列“写反馈”切片 |

若正式平台能力缺失，相关候选保持受阻，并在[独立反馈台账](PLATFORM_CAPABILITY_FEEDBACK.md)记录证据；不能因已编号就绕过阶段门或宣称能力已交付。编号 `JCH-NNN` 只用于下文变更记录，与功能切片编号分开。

## 3. 当前阶段：基线核对与最小合同冻结

### 已确认事实

- `jagonzn-service` 当前具备 Spring Boot 启动类、基础配置、应用健康 HTTP 入口，并通过平台运行时 JAR 装配后端模块；独立空库测试不等于设备接入实现或正式交付。
- 当前 ThingsCloud、jagonzn-service、jagonzn-cloud 的 Maven 项目版本均为 `0.0.1-SNAPSHOT`，Java 均为 21；Spring Boot 均为 `4.1.0`。ThingsCloud 版本是版本源头；两个 jagonzn 项目向 ThingsCloud 对齐，不通过升级或修改 ThingsCloud 来迁就应用。
- 本次已把 jagonzn-service 的 Spring Boot parent 从 `4.1.1` 改为 `4.1.0`；jagonzn-cloud 与 ThingsCloud 已是 `4.1.0`，无需改动。2026-09-24 两个 jagonzn 骨架已各自通过 Maven verify 与启动上下文检查（各 1 项），但这不代表 ThingsCloud 内核装配兼容已验证。
- ThingsCloud 标准 TCP 已支持固定 TC 帧及 `ACCEPTED(0x13)` 逐条受理确认，但不自动支持烟感或智能锁的私有帧；设备自报事件尚未形成通用接入闭环。TCP 多实例 D-190 已开发、验证并关闭，不是本项目未完成项。依据：[标准协议合同](../../docs/device-integration/STANDARD_PROTOCOL_ACCESS.md)、[D-190 资格记录](../../docs/delivery/audits/G3-TCP-D190-2026-09-19-qualification.md)。
- ThingsCloud 已有公共 REST、应用侧 MQTT/WS、公共 Webhook 及既定平台事件交付能力；其本地交付证据见 [S14-R8f-1](../../docs/delivery/audits/S14-R8f-1-public-integration-evidence.md)。这不等于 jagonzn 已完成装配，也不等于设备自报事件已有受支持入口。
- jagonzn-service 的目标是独立运行，并另行创建独立的 `jagonzn` 数据库；jagonzn 是当前 ThingsCloud 项目中的一个租户，设备按其项目和设备归属管理。

### 按阶段裁定的前置事项

1. **阶段 1 前——内核交付细节：**负责人已选方案 A 并授权 ThingsCloud 自行建设装配层，平台已建立 ADR0214 及普通运行时 JAR 本地候选；jagonzn 角色命名映射已纳入候选。正式不可变制品、既有库升级/回滚与全功能证据仍待交付。具体接收要求见[正式入口交付需求](../../docs/reuse-entry/THINGS_CLOUD_REUSE_ENTRY_REQUEST.md)。以 ThingsCloud 版本为源头，jagonzn 不实施公共内核改造。JPF-001/003 尚未关闭。
2. **阶段 1 前——隔离部署约束：**`jagonzn` 数据库、凭据和中间件边界，数据库迁移来源、备份恢复和测试数据脱敏要求；另库不自动保证共享中间件的资源与故障隔离。
3. **阶段 2 前——首个试点设备：**烟感或简工智能锁，及准确型号、固件、协议版本、真机可用性和厂商测试支持。现有优先级文档没有替负责人做此选择。
4. **阶段 2 前——最小业务接入合同：**核对已有接口如何覆盖身份、属性、逐次事件、状态、命令、设备 ACK/最终结果及可靠性语义。缺失部分形成需求建议，不在 jagonzn 中新增平台接口或存储；事件缺口见反馈 JPF-002，边界裁定见[本轮审计](DOCS_AUDIT_2026-09-24.md)。
5. **对应阶段开始前——实施授权与验收负责人：**每阶段的实现启动、真实设备测试条件、完成证据及阶段放行方式。任意用户脚本、插件装载与公开扩展机制在阶段 4 单独评审，不阻塞使用开发者编写的首台设备适配器。

任一关键项与现有文档冲突或定义缺失时，按项目约定先发起设计冻结，不在进度文档中代替负责人裁定。

## 4. 阶段 1：复用 ThingsCloud 能力

### 工作目标

基于与 ThingsCloud 版本基线一致的普通 JAR/Starter 装配 service，不依赖另一套 ThingsCloud 应用运行；为验证部署另行创建 `jagonzn` 数据库。`jagonzn` 数据库与 ThingsCloud 原数据库完全隔离，使用所对齐内核版本对应的同一套表结构与迁移；不得为了匹配 service 而改变 ThingsCloud 版本。使用租户模型的目的及数据隔离的理由见[验证部署说明](tenant-validation-and-contract-evolution.md#为什么使用%20ThingsCloud%20租户模型和独立数据库)。复用范围限定为对应版本中已交付并经核实的能力，不把仓库模块名或“继承全部能力”表述当作功能已启用的证明。

### 主要交付

- 以 ThingsCloud 当前批准版本固定内核、BOM/Starter、Java/Spring Boot 和数据库迁移版本矩阵；service 侧版本向该基线对齐，不调整 ThingsCloud 版本。
- 通过已有受支持依赖、接口和配置完成 service 侧装配，列明启动的 API、接入服务、消费者、Worker 及其外部依赖；缺少可用装配入口登记反馈，不改公共代码。
- 新建独立的 `jagonzn` 数据库，按对齐的 ThingsCloud 内核版本使用同源、同结构的角色映射迁移完成空库初始化和升级；验证租户/项目、设备身份、RLS/权限与数据库角色边界。
- 本机有限非商业候选按原范围验证；正式独立发行须核对平台签名权益的装配、有效/无效授权及四档额度，保留计量、鉴权、限流和容量保护。若需修改 ThingsCloud 商业策略或数据库函数，登记 JPF-003 并保持对应能力受阻。
- 形成已复用能力清单、未复用/未交付能力清单和已知部署限制。

### 完成判据

- service 可在不运行另一套 ThingsCloud 应用和 jagonzn-cloud 时独立启动并访问其隔离数据库。
- 启动所需组件、配置、迁移、权限与容量均有可复现部署说明；不发生对其他 ThingsCloud 数据库的写入或跨库直连。
- 通过明确的能力清单和运行证据确认设备管理、认证、接入入口、消息持久化、计量等实际装配结果；未交付的事件和厂家私有协议能力明确标为缺口。
- ThingsCloud 原应用的业务装配不因复用方式改变而被破坏；验证结果按内核版本留档。

## 5. 阶段 2：接入首个设备

具体设备在本阶段开始前裁定。本阶段按设备协议开发适配器，不把厂商私有帧直接送入 ThingsCloud 标准 TC 解码器，也不预先承诺任意用户 codec、脚本或插件机制。

### 主要交付

- 精确记录厂商、型号、硬件/固件、协议版本、认证信息来源及已验证帧样本；样本脱敏，不保存密钥。
- 实现协议分帧、校验、身份映射、重连/短连接处理和厂商 ACK；把消息映射到冻结的平台合同。
- 分开表达属性快照与逐次设备事件；保持可追溯的设备消息标识，不把报警/开锁记录压成单个属性值。
- 设备事件入口、持久化或查询若无受支持路径，登记 JPF-002 的证据及影响并停止相关实现；可继续验证独立的解析与已支持路径，但不把解析、日志或属性快照称为事件闭环。公共 Webhook 不能代替设备输入入口。
- 按设备能力实现命令排队、下发、ACK/最终结果处理；设备不支持的合同能力记录为不支持或受限，不伪造成功。
- 为帧解析、身份校验、映射、异常与版本兼容保留可复现样例和适配器测试证据。

### 完成判据

- 指定型号/固件的合法报文能按合同接入，非法身份、坏帧和越权项目报文被拒绝且可诊断。
- 设备上报的属性、事件、状态能够区分并通过支持路径保存；重复报文按合同处理。缺少必要事件能力时本项受阻，不因登记了反馈就判定完成。
- 适用的命令可到达设备，设备回复可关联原命令；限制和未支持能力明确列出。
- 适配器不依赖未承诺稳定的内核内部类或表结构；其兼容内核版本有记录。

## 6. 阶段 3：验证端到端闭环

使用阶段 2 的具体设备和冻结的测试范围，逐项验证：

1. **身份闭环：**设备凭据可信绑定到正确 tenant/project/device；重置、撤销、重绑及错误归属行为明确。
2. **上行闭环：**属性、在线/状态和逐次事件到达持久处理点；平台受理与业务处理完成分别可见。
3. **命令闭环：**合法命令受理、关联设备、派发、设备 ACK/最终结果、超时/失败/结果未知均有明确状态；不能把平台接收或 socket 写成功标成设备执行成功。
4. **可靠性闭环：**覆盖重复上报、响应丢失、短连接/休眠、离线命令、重连、进程重启及补发；验证幂等、顺序范围和到期策略。
5. **隔离闭环：**验证 jagonzn 租户下的身份、事件和命令按项目/设备归属正确隔离，不能越权读写或路由；数据库与外部凭据保持隔离。
6. **诊断闭环：**从设备消息标识到平台事实和命令结果可关联；保存脱敏日志、样例、版本矩阵、故障注入及验收记录。

完成报告必须标明真实设备/固件和环境。若设备本身不支持某项能力（例如设备去重、结果查询或可靠逐记录确认），应记录合同保证降级与风险，该项不能标成“全闭环通过”。

## 7. 阶段 4：跨协议验证与缺口反馈

- 引入不同于首台设备的第二种协议样本，对照哪些身份、属性、事件、命令、结果与可靠性语义确实共通。
- 厂商帧格式、厂家原因码、特定身份流程和特定命令编码保留在对应适配器；仅将跨设备稳定的合同和接入生命周期机制作为公共能力候选。
- 在独立反馈文档中记录公共合同不足、设备证据、影响范围、改进建议及兼容风险，作为 ThingsCloud 的评审输入。
- ThingsCloud 独立决定是否采纳、设计、实现和发布；jagonzn 不代改平台代码、表或进度。平台正式交付后，jagonzn 跟随基线复验并更新反馈结论。
- 用第二设备的证据更新支持矩阵；不能把两款设备成功接入外推成“支持任意 TCP/HEX/JT808/Modbus”。

本阶段不预先决定通用 codec 的具体形态、代码运行位置或插件安全模型；这些公共能力由 ThingsCloud 评审。发现阻塞可在任何阶段立即登记，不能等阶段 4 才反馈，也不能绕过未完成的闭环门禁。

## 8. 设备试点选择记录

| 候选设备 | 适合验证 | 当前限制 | 状态 |
| --- | --- | --- | --- |
| 4G 烟感 | 私有 TCP 二进制帧、IMEI 绑定、报警/恢复事件、短连接/休眠、延迟命令与厂商 ACK | 具体型号/固件真机需核实；事件、唤醒窗口和命令结果语义要验真 | 待裁定是否首台 |
| 简工智能锁 | JT808 风格帧、注册鉴权、锁事件、命令及设备结果 | 标准符合性未核实；锁型、固件、加密/校验变体和安全凭据需核实 | 待裁定是否首台 |

选择原则：若优先验证短连接烟感私有 TCP 能力，烟感更有代表性；若优先推进既定智能锁业务场景，锁更贴近目标。当前文档不替项目负责人选择设备，也不假设二者可共用解码器。

## 9. 风险、依赖与阶段规则

| 风险/依赖 | 影响 | 处理规则 |
| --- | --- | --- |
| 内核 JAR/Starter 与数据库迁移交付路径未冻结 | service 无法证明可独立复用内核 | 阶段 1 前完成版本与集成合同裁定 |
| POM 对齐后骨架构建已验证，内核装配仍无证据 | 不能据骨架启动推出内核依赖、迁移和运行兼容 | 两个应用 `verify` 已通过；后续核对正式内核交付，不改 ThingsCloud |
| 设备事件入口缺失（JPF-002） | 只有解析器无法交付事件闭环；jagonzn 禁止新增平台表或接口绕过 | 登记证据，等待 ThingsCloud 自行评审；缺失项保持受阻，正式交付后复验 |
| 首台设备与真机未确定 | 不能冻结协议适配和验收范围 | 阶段 2 前明确型号、固件、可用设备和厂家样本 |
| 只验证一款设备就抽象平台框架 | 产生过度拟合和后续重做 | 阶段 4 使用 jagonzn 下第二种设备协议样本再决定公共化范围 |
| 厂商或设备不支持可靠 ACK/去重/结果查询 | 可能不能提供恰当的一次性或最终结果保证 | 明确能力降级、未知结果与补偿策略，不伪称 exactly-once |

- 每一阶段开始前核对对应设计冻结项，结束时写入验收证据、版本和未解决问题。切片以完整功能或缺陷闭环为单位，最长 4 小时；取证、文档和构建核验是片内步骤，不单独登记为切片或单独提交。
- ThingsCloud 共用合同、接口或兼容问题只登记到 jagonzn 独立反馈台账；ThingsCloud 自行评审和维护自己的合同/ADR/进度，jagonzn 不代改。
- 需求、建议、正在实施、实现完成和验收通过使用不同状态；只有有可查证据的事项才标为完成。
- 不预置完成日期、工期、测试数量或设备兼容范围。

### 2026-09-29 后续开发交接

当前代理已接手后续开发。最近可推进的入口为 `G3-SHC-JAG-BOOTSTRAP-API-1` 的现场管理员身份/初始化及申请、授权状态合同，后续是离线导入 API 和统一 Console；现有命令行与 TEST 回执不等于这些 API 已实现。具体切片和前置继续引用[专项评审计划](../../docs/reuse-entry/THINGS_CLOUD_REUSE_CLOSEOUT_AND_SELF_HOSTED_REVIEW.md)，不另建重复功能编号。

本轮确认一项 **jagonzn 自身实施债务**：`SignedGrantImportCommand` 只支持 POSIX 私有文件权限，Windows NTFS 原生导入不能认领可用；申请 CLI 已有 Windows ACL 分支也不能推导导入 CLI 已支持。后续先明确等价 ACL、文件所有者和拒绝边界，再按合同补实现/负例；不直接跳过权限检查。这是 service 自身的跨平台支持缺口，未作为平台 JPF 伪报。首台设备、cloud 业务权限及未定义关键接口仍在各阶段开始前冻结。

## 10. 变更记录

编号 `JCH-NNN` 是本知识库的稳定引用标识，不是功能切片编号；历史条目编号一经发布不复用。

| 编号 | 日期 | 记录 |
| --- | --- | --- |
| JCH-001 | 2026-09-24 | 根据已形成的双项目架构、隔离验证模型、协议调研和用户确认的阶段主线，建立进度总览。建立时两个应用仍为 Spring Boot 骨架，内核集成和设备适配未启动。 |
| JCH-002 | 2026-09-24 | 按负责人指示将 jagonzn-service 的 Spring Boot parent 从 4.1.1 对齐到 ThingsCloud 的 4.1.0；jagonzn-cloud 已为 4.1.0。未修改 ThingsCloud POM；当时尚未运行构建验证。 |
| JCH-003 | 2026-09-24 | 四维文档审计：校准 TCP 受理/多实例及公共集成现状，拆分各阶段前置条件，记录设备事件缺口和数据库边界。详见 [审计记录](DOCS_AUDIT_2026-09-24.md)。 |
| JCH-004 | 2026-09-24 | 负责人明确禁止 jagonzn 修改任何 ThingsCloud 代码或数据库表；直接改造任务校准为能力核对、受限验证和反馈，新增独立[不足与改进建议台账](PLATFORM_CAPABILITY_FEEDBACK.md)。 |
| JCH-005 | 2026-09-24 | 两个 jagonzn 应用分别通过 Maven verify 与 Spring 上下文测试（各 1 项），确认骨架基线可构建；该核验是阶段 0 事实，不单独占切片。负责人将切片上限恢复为实施手册的 4 小时，仅完整功能或缺陷闭环登记切片和提交。 |
| JCH-006 | 2026-09-24 | J0-1 service 独立部署健康 HTTP 入口已通过真实请求验收，`/actuator/health` 返回最小 200/UP，`env` 与 `metrics` 不公开；2 项测试通过。详见 [J0-1 回执](progress/J0.md)。 |
| JCH-007 | 2026-09-24 | 为已完成与候选功能片建立 `J<阶段>-<序号>` 稳定编号、验收入口、前置条件和状态；继续用 `JCH-NNN` 单独标识知识库变更记录，构建与文档步骤不占功能片编号。 |
| JCH-008 | 2026-09-24 | 负责人选择方案 A：由 ThingsCloud 评审并提供正式复用入口；形成[交付需求与验收清单](../../docs/reuse-entry/THINGS_CLOUD_REUSE_ENTRY_REQUEST.md)。此决策不代表平台已受理、排期或交付，也不占功能切片编号。 |
| JCH-009 | 2026-09-24 | 为已获裁决的双项目职责、租户隔离与版本、平台变更权限、正式入口方案 A 建立[独立 ADR 与索引](adr/README.md)；未决设备合同和平台交付仍保持原状态。本次文档归档不是功能切片。 |
| JCH-010 | 2026-09-24 | 两个应用显式避开 ThingsCloud 已配置端口：service HTTP 默认 `18080`，cloud 未来 HTTP 预留 `18081`（当前无 Web 依赖）；在[知识库入口](README.md)明确新增/修改代码与设置项须有中文注释、Git 提交正文用一句话概述改动/验证/结论，并在方案 A 交接状态处直引 [JADR-0004](adr/0004-official-reuse-entry.md)。 |
| JCH-011 | 2026-09-24 | 为现有两个应用的启动入口、上下文/健康验证代码及 service 新增依赖补齐中文注释，说明职责、NIO2 原因和健康检查边界；不改变运行逻辑或阶段状态。 |
| JCH-012 | 2026-09-24 | ThingsCloud 普通运行时 JAR 已接入 service 本地候选；独立 `jagonzn` 库的空库/历史升级、角色命名与 RLS、健康/敏感端点及注册登录后的项目/设备授权共 6 项测试通过。MQTT 身份、Kafka 消费组、签名密钥变量及标准 TCP/CoAP 端口使用 jagonzn 配置；真实外部业务路径、非商业策略、制品发布与恢复未验，阶段 1 门禁仍开放。 |
| JCH-013 | 2026-09-29 | 负责人交接后续开发并授权执行本地专项；原生/POSIX、TEST 授权、商业浏览器与正常容量双后端实验逐项留证，记录 Windows 导入权限债务。完整 LAN、正式签发及设备阶段仍开放，全量由负责人手动执行，未提交或推送。见[专项回执](../../docs/reuse-entry/THINGS_CLOUD_LOCAL_TEST_EXECUTION_20260929.md)。 |
| JCH-014 | 2026-09-29 | 负责人暂停 Console 全量复制，改为创建独立 Vue + Vite 免登录、无操作的本机静态测试页；原 Console 和共享包均未复制。只新增前端访问实验，不关闭正式界面、初始化/授权 API 或完整 LAN 门禁，见[记录](../jagonzn-console/docs/TEST_PAGE_20260929.md)。 |
