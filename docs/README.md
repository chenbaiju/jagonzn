# jagonzn 项目知识库

更新时间：2026-10-10。当前阶段优先建设设备接入与运行服务，暂不启动 cloud 业务开发；统一浏览器前端 `jagonzn-console` 曾新增[本机免登录静态测试页](upstream/static-console/README.md)，现已完整复制上游 Console 并适配品牌和 service 代理，本机验证见专题记录；真实登录及16个主要页面读取已通过，设备业务与正式接收仍未验收，见[复用与同步方案](console-reuse-and-evolution.md)。负责人已交接后续开发与本地测试，结果和剩余前置见[进度总览](PROJECT_PROGRESS.md)及[本轮专项回执](../../.private/thingslink-docs/docs/reuse-entry/THINGS_LINK_LOCAL_TEST_EXECUTION_20260929.md)。jagonzn 是 ThingsCloud 的一个租户，目标是在独立的 jagonzn-service 与同构的 `jagonzn` 数据库中适配并验证设备。**jagonzn 禁止修改 ThingsCloud 的任何代码或数据库表；只记录不足、证据和改进建议，由 ThingsCloud 自行评审。**自定义数据流与公共协议扩展属于反馈方向，不是本项目的平台改造授权。

当前service继承版本与JT808迁入结果见[本轮同步记录](console-reuse-and-evolution.md#2026-10-28%20ThingsLink运行时同步与JT808扩展迁入)及[固定制品清单](service-upstream.json)。JT808开发切片、首台VA型号、外设存储与实际结果统一见[JT808开发测试计划](jt808-development-plan.md)，其中[真实运行时回执](jt808-development-plan.md#外置独立环境与真实运行时联调回执)包含独立外置数据库/Kafka、模拟国密终端闭环及资源恢复边界。后继真机注册鉴权、门磁状态与命令SUCCEEDED的最新限定结果见[service真机专题](../jagonzn-service/src/main/java/com/jagonzn/service/extension/jt808/README.md#门磁上报与命令结果关联)，不由模拟回执继承资格。

[锁具日志与第三方JSON HTTP交付](http-lock-log-delivery.md)：后端日志留存、service→cloud签名交接、可配置POST/PUT、成功判断及外置验证；真实第三方接口尚未确定，出口默认关闭。

## 项目分工

| 项目 | 定位 |
| --- | --- |
| jagonzn-service | 复用 ThingsCloud 内核的独立 IoT 服务，负责多协议设备接入、数据处理、技术告警、命令和可靠转发 |
| jagonzn-cloud | 后续定制化设备 SaaS，负责人员、场所、开锁权限与时段、业务审计和业务处置 |
| jagonzn-console | 已完整复制上游界面，品牌及默认代理适配至 jagonzn-service，见[复用与同步方案](console-reuse-and-evolution.md)；历史静态页的[浏览器与网络复测](../jagonzn-console/docs/TEST_EXECUTION_20260929.md)通过，Console 三项网络前置失败已复测通过；新 Console 已完成真实 service 登录及16个主要页面读取；设备业务、cloud 与正式接收仍待验收 |

TCP 智能锁是既有业务场景，首台验证设备已确定为ZN-DM08-Ⅴ(A)国密版，固件和实机互通待验；service 的目标范围包含原方案中的完整后端能力，不能理解为只做 TCP 代理。service 的独立运行目标不依赖 ThingsCloud 应用或 cloud 的部署，但依赖实际启用能力所需的中间件。

## Console 复用与后续方向

[完整复制、上游同步与后续精简方案](console-reuse-and-evolution.md)：当前保留全部上游菜单，后续再做业务精简；包含固定版本、独立后端配置、三方合并流程与验证边界；[源码差异清单](upstream/console-parity-audit.json)记录本次900文件复核，[联调验证摘要](upstream/console-service-verification.json)保留脱敏页面结果和运行时模块摘要。

## 阅读顺序

1. [双项目架构与分阶段实施方案](jagonzn-system-architecture.md)：主文档，说明职责、数据权威、上下行合同、私有部署预留与实施阶段。
2. [service 后端复用与独立部署方案](jagonzn-service-backend-architecture.md)：原设备接入方案的迁移版本，说明内核 JAR、签名四档权益、计量、数据库兼容与装配。
3. [原 cloud 架构文档迁移说明](jagonzn-cloud-backend-architecture.md)：保留旧链接，原接入定位已被替代。
4. [多协议接入、4G 烟感与 JT808 智能锁适配调研](protocol-extensibility-and-smoke-adapter-research.md)：记录 ThingsCloud 当前接入边界、烟感与智能锁协议事实、可复用部分和待冻结设计。
5. [多协议接入能力建设优先级与实施顺序](protocol-expansion-priority.md)：保存候选优先级建议和验收方向，明确不改变 ThingsCloud 当前实施轨迹。
6. [隔离验证部署、租户试点与平台合同演进](tenant-validation-and-contract-evolution.md)：明确租户与独立部署、同构数据库、适配权限和 ThingsCloud 独立评审边界。
7. [jagonzn 项目开发进度总览](PROJECT_PROGRESS.md)：记录当前基线、阶段状态、完成判据、前置条件和设备试点选择门禁；与 ThingsCloud 自身进度台账分开维护。
8. [2026-09-24 四维文档审计](DOCS_AUDIT_2026-09-24.md)：记录状态校准、证据边界及负责人对代码/数据库修改权限的裁定。
9. [平台能力不足与改进建议](PLATFORM_CAPABILITY_FEEDBACK.md)：独立记录不足、来源证据、设备影响、改进建议和 ThingsCloud 评审/交付/复验状态。
10. [提交 ThingsCloud 评审的正式复用入口需求](../../.private/thingslink-docs/docs/reuse-entry/THINGS_LINK_REUSE_ENTRY_REQUEST.md)：记录负责人选择方案 A 后的平台交付合同和 jagonzn 接收范围；平台已受理并实施本机候选，当前进度以[专项台账](../../.private/thingslink-docs/docs/reuse-entry/THINGS_LINK_REUSE_CLOSEOUT_PROGRESS.md)为准，正式接收仍未完成。
11. [jagonzn 架构决策记录（ADR）](adr/README.md)：逐项保存已获裁决的重大决策、备选与实施边界；不代替 ThingsCloud 的平台 ADR。
12. [实施债务与测试阻塞](IMPLEMENTATION_DEBT.md)：Windows 导入、原 shc1 材料及完整 LAN/权益/业务矩阵的编号、证据、归属和关闭条件。

首次接手按“主架构 → service 架构 → 进度总览 → ADR 索引 → 本轮审计 → 协议调研与候选建议”阅读；文档维护遵守仓库[文档维护指南](../../.private/thingslink-docs/docs/DOCUMENTATION_GUIDE.md)。当前阶段只有进度总览一处记账，架构中的历史工作包编号不另行决定执行顺序。

项目入口：[service README](../jagonzn-service/README.md)、[独立本机部署](../deploy/README.md)、[cloud README](../jagonzn-cloud/README.md)。

## 状态约定

需求方向、设计建议、已存在的内核能力与已接入应用的能力必须分别描述。service 已有平台运行时的本机装配候选；同一固定本机候选已用合成来源验证 service 经 Kafka/私网 HTTPS 向 cloud 独立 Inbox 交付、断线恢复和轮换，模拟 MQTT 设备的无害技术命令也已取得双后端回执，见[专项台账](../../.private/thingslink-docs/docs/reuse-entry/THINGS_LINK_REUSE_CLOSEOUT_PROGRESS.md)。后续工作树另通过 TEST 授权跨进程交接与三项额度实验；这些结果不互相拼接为正式资格。cloud 人员/场所业务、Console 全业务矩阵、正式签发及完整内网接收仍缺。文档不代表 TCP 厂家协议、真实设备业务闭环或 SaaS 已实现。后续变更先同步主文档，再更新对应项目说明。

## 编码与配置规范（强制）

- 在 `jagonzn-service`、`jagonzn-cloud` 新增或修改代码、配置项时，必须添加准确的**中文注释**，说明职责、约束或设置原因；现有注释也应随行为变化同步更新。注释不代替接口合同和验证记录。
- 两个应用的监听端口不得占用 ThingsCloud 已配置的端口。当前 ThingsCloud bootstrap 为 `8080`、模拟器为 `8090`；jagonzn-service 的 HTTP 默认端口为 `18080`，jagonzn-cloud 内部 HTTP 默认端口为 `18081` 且默认只绑定回环。后续新增 TCP/MQTT 等监听端口前，先核对 ThingsCloud 配置和 jagonzn 端口清单，不复用已占用端口。
- 每次 Git 提交除中文标题外，正文用一句简明中文同时说明改动、验证与结论，不使用“做了什么／测了什么／结果”等标签；未运行某类验证须如实注明，不编造测试结论。
- 两个应用的 Logback 业务 logger 分别指向 `com.jagonzn.service`、`com.jagonzn.cloud`；从各自项目根目录启动时，文件日志写入各自的 `logs`。跨目录启动须分别设置 `JAGONZN_SERVICE_LOG_PATH`、`JAGONZN_CLOUD_LOG_PATH` 为各自 `logs` 的绝对路径，避免共享目录。

## 文档链接维护

2026-10-28全仓复现205处失效引用：203处位于本独立仓库，另2处是配套ThingsLink仓库JT808文档的图片路径。根因是平台知识库迁入`.private/thingslink-docs/`、部分文件由`THINGS_CLOUD_`改名为`THINGS_LINK_`、Java工程/包路径改名，以及Console归档文档搬迁后仍使用原相对路径。现按实际目标逐项修正，并更正两处已改名的标题锚点；没有恢复旧目录、复制平台正文或放宽链接检查。

普通文档181处直接修复；已接受ADR中24处经负责人明确授权后仅改链接，原决策、状态及其他正文不变。原件摘要、精确差分、首败和复验日志保存在已核外盘`doc-link-repair-20261028`验证目录。全仓Markdown链接检查覆盖1103份文档；验证入口为配套ThingsLink根目录的`python3 -B scripts/workspace/verify-docs.py --base-ref HEAD --skip-maven`，包含链接解析回归及静态策略，不代表已运行Java/Maven文档一致性或业务验收。
