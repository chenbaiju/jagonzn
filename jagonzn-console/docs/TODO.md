# ThingsCloud Console 开发任务与验证记录

本文件维护**现有后端合同已具备、Console可自行接续**的开发与验证任务，以及已完成任务的原位回执。
需后端新增或完善能力的任务单独维护在[后端依赖待办](BACKEND_TODO.md)，不把环境、供应商或外部验收条件误列为缺接口。
页面补齐计划见[接口覆盖补齐工作包](#接口覆盖补齐工作包)，详细范围与回执由 TODO-011 至 TODO-017 及原任务003/010维护；旧任务页面收尾纳入WP-10。

[开发者工作台重构](#开发者工作台重构计划)覆盖TODO-018至023，已获6包7片连续实施授权；6包7片已完成并验证本地软件范围，最终矩阵49 PASS / 25条件SKIP、严格TLS组合5 PASS。菜单合同[BE-003](BACKEND_TODO.md#BE-003%20开发者工作台菜单与兼容迁移)已完成并验证本地范围；各片新UI回执与原接口补齐包分别登记。

App接收号码配置随客户端TL-06-B2交付，详细裁决、失败修复与验证统一见
[App号码功能片](../../../.private/thingslink-docs/things-link-flutter/docs/V1_PLAN.md#tl-06-b2-片前审计与冻结)，本页只保留导航。

## 工程目录整理

2026-10-09，负责人要求判断Console根目录文件的用途、依赖、删除/归类/Git隔离可能，并实施归纳整理。基线为平台 `master / a36a10181`，开始时工作区干净，Console是平台普通目录；未使用旧独立仓库，也未将历史授权作为本轮提交许可。

| 切片 | 完成定义 | 状态 |
| --- | --- | --- |
| ~~CONSOLE-STRUCT-01~~ | 核对全部根文件的调用关系和Git状态，归档上游历史与退役模板精简工具，补齐格式化产物隔离及使用索引，完成相关验证 | 本地整理完成 |

审计覆盖当时根目录29个普通文件：27个Git跟踪文件，另2个为已忽略的 `.auto-import.json` 与 `.DS_Store`。逐文件路径、字节数及SHA256保存在 `logs/root-structure-1791534213264855000/before.json`；核对 `package.json`、工具配置、Runner、源快照/独占守卫、CI调用及历史审计消费者，不以扩展名或未找到业务import判定配置无用。变量核对只读公共环境配置，不把 `VITE_` 文件视为秘密存储。

判断与处置以 [根目录文件分类](../README.md#根目录文件分类) 为准：保留构建/类型/依赖/格式/测试入口与版权；两份上游CHANGELOG迁入 `docs/upstream/`，正文仅调整迁移所需的相对链接，贡献入口同步。`scripts/clean-dev.ts` 唯一直接调用为 `clean:dev` 命令，它会删除当前README并重写路由/语言/菜单；本轮退出该命令，原脚本逐字节转为 `docs/upstream/clean-dev.ts.txt` 非执行归档。历史审计清单和摘要中的旧路径继续表示旧候选，未改写不可变证据。原路径可从基线提交恢复，LICENSE原文不变。

缓存、日志、构建、模拟器manifest与E2E证据均已有Git忽略，本轮未发现被索引跟踪；保留文件原位，不执行删除。Prettier另补产物、生成声明与上游归档排除，避免源码格式化误改日志/证据摘要；纠正Console `.gitignore` 中过时的独立仓库说明。没有新增按扩展名整体忽略的规则，测试/工具/工程配置继续随平台源码跟踪。

根目录普通文件从29个降为27个（Git跟踪由27个降为25个），没有以删除有用配置降低文件数。完整分类表留在README，日志和缓存的体量不作为可丢弃证据的判据。

macOS / Node 26.7.0 / pnpm 11.22.0 本机验证与限制：

| 验证 | 结果及边界 |
| --- | --- |
| `pnpm build` | PASS，共享合同检查/构建、Vite生产构建及Vue类型检查通过；`build-1791534213264855000.log` |
| `pnpm test tests/ownedRuntimeSetup.test.ts --maxWorkers=2` | PASS，23项；确认独占运行材料/必需源文件绑定路径仍受保护，未重跑全量单元；`owned-runtime-1791534213264855000.log` |
| `pnpm exec playwright test --list` | PASS，78文件94旅程被原配置正常收集；只核对配置加载与发现，没有启动浏览器或业务栈；`playwright-list-1791534213264855000.log` |
| `pnpm lint` | PASS，0错误，保留1条原有未使用eslint-disable警告，未执行自动修复；`eslint-1791534213264855000.log` |
| `pnpm exec prettier --check README.md CONTRIBUTING.md package.json` | PASS；首轮把 `.prettierignore` 当源文件传入格式命令，因无法推断解析器退出2，随后缩回支持的源文件范围复验通过；忽略文件按实际排除效果核对 |
| 归档完整性与隔离 | PASS；两份CHANGELOG除相对链接外与基线一致，退役脚本与LICENSE逐字节一致，package仅删除旧命令，9类产物/归档被Prettier实际忽略且测试/配置未误排除；`integrity.json`、`prettier-isolation.json` |
| `pwsh scripts/docs-verify.ps1 -BaseRef a36a10181 -SkipMaven` 与 `git diff --check` | PASS，850份根/模块文档本地链接、23项语法回归及空白检查；该命令的提交范围策略不证明未提交迁移已入库，当前归档完整性另验；`docs-1791534213264855000.log` |
| 提交前完整文档门禁 `pwsh scripts/docs-verify.ps1 -BaseRef origin/master` | PASS，Maven `clean verify`、16项Java文档一致性及根/模块链接检查通过；本机证据为 `logs/root-structure-delivery-1791535083167401000/docs-full-1791535083167401000.log`，不代表完整业务回归或远端CI |

上述证据统一在本机忽略目录 `logs/root-structure-1791534213264855000/`，功能结论保留于本条；本片未改动业务源码、运行配置值、测试配置、锁文件、许可证或CI入口。整理验证阶段未运行Maven业务测试、完整业务E2E、真实后端/硬件、远端CI，也未提交或推送，不继承此前业务或发布资格。负责人随后明确授权提交并推送平台master，要求简要提交说明；本轮交付补完整文档门禁及最终提交范围检查，实际提交和远端状态以Git回执为准。Jagonzn保持独立且未修改。

## TODO-001至TODO-010复核结论

2026-10-06重新扫描平台`d5e24018`的Controller/OpenAPI、Console API消费者、页面入口及测试，
并对照[G3 Console接续](../../../.private/thingslink-docs/docs/progress/G3.md#Console%20待办接续)与[Agent开发计划](../../../.private/thingslink-docs/things-link-agent/docs/DEVELOPMENT_PLAN.md)。
本轮页面交付复核纠正此前仅凭接口接线判定完成的结论：TODO-003曾缺少独立“告警设备数”卡片；003-C纳入WP-10后已实施并取得本地页面回执，父任务现按本地功能范围关闭。
TODO-001、002、004至009保留原限定范围完成回执；静态复核未发现新增明确页面缺口，不等于本轮重新完成浏览器验收。TODO-010扩展验收仍未闭合，010-C同样归入WP-10收尾队列。
下面的“已完成”均限定表内软件范围；历史浏览器回执只归原候选，本轮验证见[分类复核回执](#分类复核回执)。

| 任务 | 后端当前事实 | Console当前事实与定位 | 完成与验证结论 |
| --- | --- | --- | --- |
| ~~TODO-001~~ | 邀请创建/重发/撤回、收件箱、预览/绑定注册/接受已提供 | [邀请API](../src/api/project-invitations.ts)、成员页和个人中心`ProjectInvitations`、[邀请注册入口](../src/views/auth/project-invitation/index.vue)已接线 | 已完成并验证本地邀请闭环；受控TLS SMTP注册/验证/接受历史浏览器通过；外部邮件另验 |
| ~~TODO-002~~ | `MenuCatalog.userCenter`与`/me`已有 | [个人中心](../src/views/system/user-center/index.vue)只读资料及头像入口已接线 | 已完成并验证；菜单合同、无项目/四角色、换账号历史专项通过 |
| ~~TODO-003~~ | `OverviewResponse.alarmSeverityDeviceCounts`及快照缓存已有 | [概要页](../src/views/dashboard/overview/index.vue)消费[互斥分布](../src/utils/alarm-distribution.ts) | 已完成并验证本地功能范围；聚合/图表原回执保留，003-C新增卡片、21项组件/聚合及2项限定浏览器通过 |
| ~~TODO-004~~ | 六类设备关联独立查询已有 | [设备详情](../src/views/device/index/index.vue)挂载命令、终端用户、任务、自动化、场景与规则组件 | 已完成并验证原六类范围；非空/20+1分页/权限历史专项通过；设备事件历史另归后端待办 |
| ~~TODO-005~~ | `GET .../alarms/device-status`已有 | [批量摘要API](../src/api/device-alarm-status.ts)与可见行合批已接线 | 已完成并验证；合批、断网不可用、单行重试历史浏览器通过 |
| ~~TODO-006~~ | 模型配置GET/PUT/PATCH/DELETE已有 | [AgentModelPanel](../src/views/project/settings/AgentModelPanel.vue)已接项目设置 | 已完成并验证配置范围；密钥替换/启停/删除及限定浏览器通过，不代表模型准入 |
| ~~TODO-007~~ | 快照、单属性历史、告警证据接口已有 | [DeviceAgentEvidence](../src/views/device/components/DeviceAgentEvidence.vue)及历史来源概览已接线 | 已完成并验证只读证据范围；AG-6h等限定真实旅程通过，不代表模型诊断 |
| ~~TODO-008~~ | 本人记录CRUD、事实报告与有界集合报告已有 | [DevicePersonalRecords](../src/views/device/components/DevicePersonalRecords.vue)、[项目设置](../src/views/project/settings/index.vue)集合面板及重新确权下载已接线 | 已完成并验证个人事实范围；非空历史/告警、四角色及五场限定整合历史通过 |
| ~~TODO-009~~ | 项目知识目录/正文/发布/删除/本地检索已有 | [ProjectKnowledgePanel](../src/components/agent/ProjectKnowledgePanel.vue)已接项目设置 | 已完成并验证本地受控知识范围；AG-6b-2四角色限定真实浏览器通过，无外部模型调用 |
| TODO-010 | 受审状态、单次POST和原键GET恢复合同已有 | [DeviceAgentAnalysis](../src/views/device/components/DeviceAgentAnalysis.vue)、[analysis API](../src/api/assistant-analysis.ts)已消费新增状态与可空结果 | 部分完成；原状态/问题功能及扩展接线已有局部回执，整项浏览器/真实结果质量不整体划线，见本任务子项 |

编号和任务名称的删除线只标已完成范围，标题保持原样以保留入链。完成条目不再出现在“等待后端”的活动队列。


## 页面交付项复核与收尾队列

2026-10-06，`master / d5e24018`加当前文档差异。按接口、实际页面控件和测试断言重新核对001至010；本轮是源码及测试内容审阅，未重跑业务测试或浏览器。不以API消费者存在直接判定用户所需展示已完成。

| 原任务 | 当前页面交付核对 | 新增缺口或接续归属 |
| --- | --- | --- |
| ~~TODO-001~~ | `ProjectInvitations`在成员页/个人中心提供邀请、重发、撤回、分页及接受；邀请注册入口绑定邮箱 | 未发现新增明确缺口；原本地闭环回执保留，外部邮件资格独立 |
| ~~TODO-002~~ | 个人中心已展示只读账号/租户/角色及头像入口、邀请 | 未发现新增明确缺口；不将未约定的资料编辑扩成任务 |
| ~~TODO-003~~ | 复核时概要仅三张数量卡片；`alarmDistribution`已经计算有效告警设备数，当前只在分布说明展示；工具及现有E2E没有独立卡片断言 | 遗漏已由WP-10 / 003-C修复并验证，父项本地功能范围关闭 |
| ~~TODO-004~~ | 设备详情六类专用关联组件已挂载，含当前关系/历史及分页 | 原六类范围未发现新增明确缺口；事件历史WP-08、类型单读WP-09仍独立 |
| ~~TODO-005~~ | 设备列表挂载`DeviceAlarmStatus`，展示状态、观察时间及不可用重试 | 未发现新增明确缺口；概要卡片不能混记为本项完成 |
| ~~TODO-006~~ | `AgentModelPanel`已有配置读取、替换Key、启停、删除及未知结果反馈 | 未发现新增明确缺口；模型诊断资格不由配置页完成继承 |
| ~~TODO-007~~ | `DeviceAgentEvidence`与`DeviceEvidenceTools`已有属性选择/快照、单属性历史、来源概览及告警分页 | 未发现新增明确缺口；保留只读范围 |
| ~~TODO-008~~ | `DevicePersonalRecords`已有保存、读取、删除、报告下载；项目设置挂载有界集合报告面板 | 未发现新增明确缺口；下载继续重新确权 |
| ~~TODO-009~~ | `ProjectKnowledgePanel`已有目录/正文、新建、删除、发布和手工检索，挂载项目设置 | 未发现新增明确缺口；不扩展Embedding或外部模型 |
| TODO-010 | `DeviceAgentAnalysis`已有固定问题、状态、确认、结果和恢复面板；010-C九场合成受审真实浏览器已通过 | WP-10既有010-C已完成并验证本地软件范围；010-D仍为外部资格 |

WP-10只增加003-C一个新开发切片；010-C沿原任务维护、不另编号或复制流水。当前总计10个工作包、19个新增规划子片，另有既有010-C补证；010-D不计入可直接实施队列。后续扫描若发现其他明确页面缺口，同样挂回原TODO并调整父项状态，不能因后端已有接口将父项划线。

本次文档修订验证：`pwsh scripts/docs-verify.ps1`退出0，完整文档门禁及Java文档一致性测试通过；三份任务/索引122处本地链接及标题核对通过，`git diff --check`通过。原始日志：`logs/page-closeout-docs-1791299835427386000.log`。本次仅改任务文档与索引，业务代码、业务测试、浏览器验收、提交及推送均NOTRUN；等待执行指令。

## 当前联调边界

平台当前阶段暂停商用服务器、正式域名与公开部署验收，以及 SIM 服务对接；Console 保留套餐/订阅、有效额度、用量统计和超额反馈页面及对应测试。内部环境的来源准入由实际服务入口落实，隐藏路由不能代替服务端权限。本仓库的静态、单元及隔离后端 E2E 继续执行；通过不代表实际服务器/域名或正式发布验收。下方邀请/注册等需求只在获准环境实施，不由待办文档自动开放公众访问。

本文件登记Console开发、待验与完成记录；后端是否就绪以各项复核事实判断。接口、状态机和安全约束始终以平台当前已接受合同为准，不由本待办新增合同。

以下为第四轮历史接续背景，不作为当前恢复或推送授权：负责人于2026-10-02授权恢复第四轮剩余软件工作，Console 已按本轮指令拉取至 `4d663b1`（包含 `b397866`）。已通过的本地功能范围保留；先补告警摘要和未注册邮箱邀请，再验证 SMTP、资源包与时间自动化组合。草稿在前次暂停时未验，现按下方各功能回执更新，见[第四轮测试接续](#第四轮测试接续)；本轮仅本地提交，不推送。

## TODO-001 项目成员邀请、注册与验证闭环

- **编号**：~~CONSOLE-TODO-001~~ — 已完成并验证本地功能范围；实际候选、专项结果和限制见下文。
- **状态**：增量邀请、邮箱绑定注册及收件箱已实现；当前候选构建、846项前端测试与默认浏览器矩阵通过；本轮受控TLS SMTP与未注册邮箱完整注册/验证/接受浏览器已通过，实际外部邮箱仍独立待验。
- **提出日期**：2026-09-28
- **范围**：项目成员管理的邮箱识别、邀请/注册链接、邮箱验证和最终加入项目。

### 当前实现边界

兼容旧入口 `POST /api/v1/projects/{projectId}/members` 只按邮箱查找已注册账号，成功后立即创建成员关系；邮箱尚未注册时返回 `404 / 50010`。它没有待接受邀请状态，不会自动注册账号或发送邀请/注册链接。现行合同见仓库根目录 `docs/contracts/CONSOLE_IDENTITY_PROFILE.md` §3；原接口作为兼容入口保留；新增邀请与接受接口采用该合同 §6，Console 成员页已切换。

### 需求目标

1. ~~项目管理者输入对方邮箱和拟分配角色后，系统识别邮箱是否已有账号。~~
2. ~~**邮箱已注册**：向该账号的站内信发送带一次性校验码的项目邀请及验证链接；点击后进入登录界面。对方完成登录及要求的验证/确认前，不创建有效项目成员关系。~~
3. ~~**邮箱未注册**：向该邮箱发送带同一邀请上下文及一次性校验码的注册链接；点击后进入注册界面，邮箱字段预填且锁定不可编辑，不能把链接用于注册其他邮箱。对方完成该邮箱的注册及验证，并完成项目邀请验证/确认后，才加入项目。~~
4. ~~无论走哪条路径，项目成员关系只能在目标身份和邮箱验证通过后生效；加入后，成员可在“我加入的项目”列表看到项目。~~
5. ~~保留项目成员管理权限、可分配角色限制（不能通过此流程分配 OWNER）、席位/套餐约束和审计要求。~~
6. ~~注册链接中的目标邮箱必须与最终创建账号绑定；客户端不得允许修改邮箱，服务端也必须验证链接与注册邮箱一致，防止把他人邮箱的邀请链接转用于另一账号。~~
7. ~~邀请链接必须携带与目标邮箱及邀请上下文绑定的一次性校验码；首次有效使用后立即失效，过期、已使用或上下文不匹配时拒绝，重复点击/重放不得再次加入或改变成员角色。~~

### 邀请闭环实现与验证

管理页创建待接受邀请并查看投递、重发及撤回；收件人登录后从头像菜单进入个人中心，明确接受后才加入项目。未知邮箱收到邀请注册链接，页面锁定邮箱，后端复验同一绑定；仍须完成原邮箱验证，注册不自动加成员。链接码置于浏览器 fragment；管理响应和日志不输出码。未配置真实 SMTP 显示失败，不把日志发送器当作送达。已验证账号可在站内收件箱接受；代码过期、换码、撤回、权限失效或席位不足由服务端拒绝。本机组件11项覆盖邀请收件箱与注册入口（含个人资料回归）；默认浏览器矩阵已验证头像个人中心入口及已有账号明确接受；真实邮箱送达尚未认领。

### 验收与剩余边界

合同已冻结于平台 `docs/contracts/CONSOLE_IDENTITY_PROFILE.md` §6。真实 PostgreSQL/HTTP 已覆盖身份与邮箱绑定、未验证拒绝、过期/换码/撤回/重放、管理权限失效、席位竞争、游标隔离及原子接受；异步邮件覆盖提交后发送、回滚不发送、日志发送器拒绝和失败状态，旧直接添加接口保留兼容。早期容量及Access误装配失败保留；2026-10-01修复后Docker Desktop完整后端和默认浏览器矩阵通过。旅程验证已有账号在接受前不可见项目、从头像个人中心明确接受后加入，并保留VIEWER写入口隔离；新增 `project-invitation.spec.ts` 两项真实浏览器通过：邀请预览锁定目标邮箱且预览不加成员，错误身份拒绝，明确接受及重放、撤回分别验证。本轮已补未注册账号经受控TLS邮件、注册、邮箱验证及明确接受的完整浏览器差额，见[第四轮测试接续](#第四轮测试接续)。真实 SMTP 送达需配置实际邮件服务，本地 MailSender 测试不承担外部邮箱资格；商用部署仍暂停。

## TODO-002 个人中心后端菜单路由下发

- **编号**：~~CONSOLE-TODO-002~~ — 已完成并验证本地功能范围；实际候选、专项结果和限制见下文。
- **状态**：后端菜单与前端只读页面均已实现，本机合同、组件和真实 HTTP 验证通过；默认矩阵及个人中心专项2项真实浏览器通过，无项目/四角色字段、只读和换账号隔离已验。
- **提出日期**：2026-09-28
- **范围**：头像菜单进入 `/system/user-center`；通过后端菜单控制正式环境中的路由可见性，页面只读展示当前账号 `/me` 返回的身份资料。

### 已完成的接口要求与验收

1. ~~在后端 MenuCatalog 中登记稳定路由身份 `UserCenter`、路径 `/system/user-center`、组件 `/system/user-center` 和标题键 `menus.system.userCenter`，确保菜单权限接口返回完整路由记录。~~
2. ~~明确向哪些已登录控制台账号下发此入口；页面只显示当前 `/me` 返回的账号资料，不应要求项目角色或额外平台管理权限。~~
3. ~~与 Console 前端兜底路由核对路径、路由名、组件、隐藏菜单/标签属性及标题键，保持跨语言菜单合同一致。~~
4. ~~后端路由可用后，从头像菜单打开页面并验证 `/me` 的用户名、邮箱、账号 ID、租户 ID、当前项目 ID、角色与头像字段；不得把未提供字段显示为虚构值。~~

### 当前边界

Console 已按现有 `Api.Auth.UserInfo` 实现只读页面，未新增或假设资料编辑、头像上传或口令修改接口。正式环境由后端 MenuCatalog 下发 UserCenter，无项目或平台管理权限的已登录账号同样可见；隐藏菜单和标签不阻止注册路由。后端菜单合同和服务端授权仍以根目录文档及实际实现为准。

### 本机验证与剩余边界

2026-09-30 核实后端既有实现，未重复新增路由。IAM 模块 246 项测试、真实 PostgreSQL 后端 ProjectApiTests 的无项目个人中心场景、Console 生产构建及 774 项单元/组件测试通过。新增回归覆盖无项目及四种项目角色、匿名拒绝、当前账号隔离、只读显示、缺失字段和切换账号后清除旧资料。头像采用本地占位图（当前 `/me` 不提供头像）；未新增资料编辑或上传接口。原始日志在本机 `/tmp/console-todo-iam.log`、`/tmp/console-todo-menu-http.log`、`/tmp/console-todo-console-tests.log`。2026-10-01默认浏览器矩阵通过头像点击及个人中心邀请接受；新增 `profile.spec.ts` 两项真实浏览器逐项核对无项目及OWNER/ADMIN/OPERATOR/VIEWER的资料、菜单合同、只读字段及切换账号不残留旧身份，均通过。证据采用第四轮专项固定候选，见本节下方；远端CI与实际部署未验证。

第四轮这三类专项绑定平台 `e6b00289` 加B-047修复、Console `8fe6ca2` 加默认整合及专项测试补丁，
Docker Desktop隔离依赖、Node22/pnpm11.9，邀请2项、个人中心2项、关联权限1项通过，每场前置真实API合同9项通过。
源码快照SHA256为 `1b74f08e1993329da7af74ebd786d3d906774d372c84acc05e24bb7d38f59336`；
平台工作区原始证据入口为 `logs/verification/r4-console-selected/evidence/selected/`。
该旧候选同批告警摘要失败当时待复验；本轮结果见第四轮测试接续，不把这5项通过写成整批通过；本结果不继承后续SDK或后端额度修复资格。

## TODO-003 概要接口补充告警设备数及严重度分布

- **编号**：~~CONSOLE-TODO-003~~ / WP-10 — 已完成并验证本地功能范围，回执与资格边界如下。
- **状态**：后端聚合、缓存及图表原回执保留；003-C独立告警设备数卡片已实现并验证，本地功能范围关闭。WP-10的010-C亦已取得本机合成受审浏览器回执，关闭本地软件范围；010-D另验。
- **提出日期**：2026-09-28
- **范围**：为项目概要增加告警设备总数和按严重度划分的互斥设备数，供 Console 将告警率环形图升级为多色设备告警分布图。

### 页面收尾切片

| 子片 | 状态与证据边界 |
| --- | --- |
| ~~003-A 后端聚合与生成合同~~ | 已完成并验证原限定范围，见下方接口要求及历史回执 |
| ~~003-B 多色分布图及说明文字~~ | 已完成并验证原限定范围；现有浏览器验证分布和说明，不覆盖独立数量卡片 |
| ~~003-C 概要告警设备数卡片~~ | 已完成并验证本地页面范围；后端既有合同未修改，见本片回执 |

**003-C片前验证选择**：本片仅改概要展示及身份切换时的本地快照管理，后端聚合/契约不变。先以页面DOM反例证明卡片遗漏，再跑聚合工具、概要组件、类型检查及概要专项真实PG/浏览器（包括四/二/单列布局）；共享身份机制只消费不修改，无需本片重跑全后端或完整E2E矩阵。若暴露后端或共享机制缺陷则重评范围。

**003-C交付范围与验收**：

1. 在概要数量区增加独立“告警设备数”卡片，与设备总数、在线设备数、活跃设备数并列。当前页面仅有后三项；环图下的数量说明不能替代卡片。四张数量卡片需覆盖桌面、双列及移动端单列布局，分布图区域独立验证。
2. 现有后端返回`alarmSeverityDeviceCounts`六类计数，并非独立的`alarmDeviceCount`标量。复用已校验的`alarmDistribution().alarmDevices`，即同快照`devices.total - NORMAL`（等价五类非正常计数之和）；无需为此强加新接口或字段，禁止从四舍五入后的比例或告警分页列表反推。
3. 保持设备去重和最高活动严重度口径；ACK不等于消除ACTIVE，PENDING/CLEARED不计入。有效零值显示0；缺失、非法计数、总和/比例不一致显示不可用，不能显示成0。卡片、环图和说明来自同一有效快照；加载、请求失败、项目/账号切换不得误显其他身份或项目的旧数量。
4. 单元/组件验证除聚合工具外必须断言页面实际渲染的卡片标题和数值，覆盖非零、零、不可用及加载/失败/切换。扩展现有`e2e/overview-alarm-summary.spec.ts`，对独立数量卡片断言5→4→0及其与分布的一致性，并检查响应式布局。现有PG事实夹具只证明聚合与页面，不认领MQTT摄取或硬件资格。
5. 实施后按影响运行类型/组件及限定浏览器验证，记录命令、候选、环境、结果和未验范围；必要后端缺陷同片修复并补受影响验证。003-C满足回执后才能关闭父TODO-003；规划本身不划完成线。

### 003-D 项目概况历史曲线

~~003-D 项目概况数据库模拟曲线~~已完成本机功能与限定验证。候选为平台 `master / bcc25df00` 加本轮未提交差异；负责人要求片前快照提交已先完成，曲线开发验证期间未提交、未推送；随后负责人明确授权将本轮代码、测试及文档提交并推送平台 `master`，要求附提交说明。实际交付提交与远端结果以 Git 回执核实，不继承为远端CI通过。

参照本机六张截图，在原数量与环图下添加使用统计：设备消息数、活跃设备数、连接次数、告警状态、告警通知、规则调用、任务运行、自动化、场景及 MQTT/TCP/HTTP 流量，共12图47指标。保留现有 Vue/Element Plus/ECharts 生命周期，提供24小时/3天/7天/15天/30天窗口、刷新、图例显隐及单图 CSV 导出；桌面全宽、窄屏自然换行。正常状态沿用既有绿色。刷新使用同一快照窗口更新12图；同范围失败保留上次结果并提示，换范围/项目/身份先清空，旧响应不能覆盖新上下文。缺样显示断点，明确零值保留，图表空结果保留坐标轴，不编造曲线；全空图禁止导出。

后端新增只读 `GET /api/v1/projects/{projectId}/overview/trends?days=1` 与独立表 `ts_project_overview_sample`，按项目成员授权及实际项目所有租户读取，附加RLS。时间以 UTC 整点结束、采用完整小时闭开窗口，五档步长1/3/6/12/24小时，分别24/24/28/30/30点。数量和字节求和，设备状态取桶末值；桶内小时不完整则返回空值。来源 `OBSERVED` / `SIMULATED` / `NONE` 在整个窗口统一选择，实测优先且不混算模拟值；页面模拟来源明确标注。CSV注明项目、来源、聚合、单位及UTC起止，字节保留原值，空值为空，标题防公式注入。小时统计为可重建派生数据，最终清理项目时随项目删除；架构与约束见[数据库设计§9](../../../.private/thingslink-docs/docs/BACKEND_ARCHITECTURE.md#9.%20核心数据库设计)。

本机模拟写入只针对 `tc-postgres / thingscloud` 的“智慧消防”项目 `3fa46e56-aab4-4d22-96bc-90976dcf7675`，使用项目真实所有租户及8台设备上限，30天720小时、47指标，共33,840行。两次执行行数相同；源为 `SIMULATED` 的固定键幂等写入，不覆盖实测。种子前后设备8、告警实例2、消息7、用量事实7505均相同，证明种子没有改写业务或计费事实；后续浏览器请求按原机制计量，不宣称整个验证期间账本不变。脚本拒绝无设备项目生成虚假活跃数。

复现命令（先启动本机依赖和后端，让正常 Flyway 应用 `V20261008_0100`）：

```bash
python3 scripts/seed-overview-trends.py --container tc-postgres \
  --project-id 3fa46e56-aab4-4d22-96bc-90976dcf7675 --days 30
./things-cloud/mvnw -f things-cloud/pom.xml -pl things-cloud-bootstrap -am \
  -Dtest=OverviewTrendsServiceTests,OverviewTrendsDatabaseTests,DatabaseNamingConventionTests \
  -Dsurefire.failIfNoSpecifiedTests=false test
python3 scripts/generate-openapi-contracts.py
cd things-cloud-console
pnpm typecheck
pnpm exec vitest run tests/overviewTrends.test.ts tests/overviewTrendChart.test.ts tests/overviewAlarmCount.test.ts
```

实际验证与回执：

| 范围 | 本机结果与证据 |
| --- | --- |
| 后端服务、真实 PostgreSQL、RLS及命名规范 | 4服务测试、2数据库测试、4数据库命名测试全部通过，另2项支持模块夹具通过；覆盖成员拒绝、项目所有租户、来源优先、SUM/LAST、完整性、零与空、范围上限、跨项目读写拒绝、约束及最终清理。日志 `logs/overview-trends-backend-tests-final.log` |
| 正式生成合同 | 唯一生成脚本成功，75项OpenAPI测试通过，另2项支持夹具通过；新增1条GET及3个响应schema，逐项语义对比既有路径/模型无变化。OpenAPI SHA256 `6d3330bed1fd6f9ca276ab96fd54c66d4a76118030f0349a2788cc99bfe78a22`；两端schema SHA256 `320fc5f3075ef0dd54fc93ec9acaed5a6d009af356c85856545494234b2c92f9`。日志 `logs/overview-trends-contracts-final.log` |
| Console | 类型、范围 ESLint/Stylelint 通过；3文件19项连续三轮通过。覆盖身份/epoch/范围请求竞态、错项目响应、失败保留、导出与字节/空值、防公式、零值及离屏图表再显示。日志 `logs/overview-trends-{typecheck,lint,stylelint}-final.log`、`logs/overview-trends-console-run{1,2,3}.log` |
| 真实本机页面 | 使用当前已登录项目完成五档窗口切换、图例关/开及刷新；导出设备消息和MQTT流量CSV，两者均24行小时数据，分别核总数=9项明细之和、总字节=上行+下行。独立视觉审阅检查1280×720、390×844、24小时/30天及长页面，无稳定裁切、重叠或页底空图；修正正常状态绿色后再次本机核对。最终正常重启后端（PID 94711）健康UP，重新打开页面显示12图、模拟来源和五档窗口，重启后的浏览器错误日志为空。下载文件在本机 Downloads；不附截图给负责人 |
| 数据种子 | Python编译通过；重复写入仍33,840行/47指标/720小时，业务事实前后对比相同。脚本与对应表为唯一模拟写入路径 |
| 仓库文档 | `pwsh scripts/docs-verify.ps1 -BaseRef bcc25df00` 通过：23项链接语法回归、850份主/模块文档本地链接、引用候选策略、16项Java文档一致性及空白检查通过；日志 `logs/overview-trends-docs-gate.log`。最终回执补齐后的 `-SkipMaven` 链接/策略/空白复核亦通过，日志 `logs/overview-trends-docs-final-links.log` |

失败与修复保留：首轮运行出现共享类加载失败，串行重跑后定位新约束命名不符合全表前缀，以及 Timescale SkipScan 在RLS下对 `DISTINCT source` 的查询错误，改为全表名前缀及分组读取来源后通过。合同生成曾因未登记新操作及生成期间输入变化拒绝发布，补齐冻结操作矩阵并等输入稳定后重跑；将控制器操作方法命名唯一化，避免既有5个同名操作ID改号。前端首轮范围切换测试修正组件桩名称；真实页面发现离屏懒加载图没有恢复实际曲线，接入已有 `chartVisible` 事件并补回归后通过。

限制：本片交付数据库模拟统计、只读聚合与页面，未实现生产事件到小时表的采集器，不将模拟值当作实测或计费证据。未运行完整默认E2E、远端CI、Windows、公司部署或硬件验证；这些资格不从既有页面或历史回执继承。未来生产采集另行授权与验收，当前新增迁移已由本机Flyway应用，历史正文保持不可变。

### 003-C实施回执

2026-10-06，候选`master / 9b4dc27b`加本片概要源码、组件测试和浏览器断言；macOS、Node26.7.0 / pnpm11.22.0、仓库锁定Chromium1234。新增独立卡片复用已校验聚合；数量区四/二/单列，环图布局独立；概要监听账号、租户、项目与内存身份代次，先清快照并拒绝旧请求回填。后端和生成契约无变更。

| 验证 | 实际结果与证据 |
| --- | --- |
| 原实现反例 | `pnpm test tests/overviewAlarmCount.test.ts --maxWorkers=2`：11失败、1通过，证明缺卡片及跨身份旧响应防护不足；`logs/003-c-red.log` |
| 聚焦组件/聚合 | `pnpm test tests/overviewAlarmCount.test.ts tests/alarmDistribution.test.ts --maxWorkers=2`：21项通过；卡片DOM、非零/零/不可用、加载失败、账号/租户/项目/身份代次及旧响应；`logs/003-c-green.log` |
| 类型与静态 | `pnpm typecheck`、三个改动TS/Vue文件ESLint通过；`logs/003-c-typecheck.log`、`logs/003-c-lint.log` |
| 隔离启动首败 | `CONTRACT_BASE_URL=http://localhost:8088 E2E_BASE_URL=http://localhost:3016 E2E_SPEC=overview-alarm-summary.spec.ts bash scripts/run-e2e-tests.sh`退出1，现有EMQX生命周期配置不满足启动器合同，未进入浏览器业务；没有覆盖未知配置，`logs/003-c-e2e.log` |
| 本地限定浏览器 | 专用Vite3016代理既有开发后端8080、独立`e2e-003c`测试租户，正式API创建/删除自有项目与设备、PG告警夹具。首次未指定仓库浏览器缓存而启动失败，`logs/003-c-browser.log`；补`PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers E2E_BASE_URL=http://localhost:3016 E2E_OWNER_EMAIL=e2e-003c@example.com pnpm exec playwright test overview-alarm-summary.spec.ts`：2项通过，独立卡片5→4→0、同快照分布、1800/1000/375px四/二/单列及无溢出；`logs/003-c-browser-cache.log` |
| 文档与差异 | 完整`pwsh scripts/docs-verify.ps1`通过，含Java文档一致性；`logs/003-c-docs.log`；最终回执补写后再跑`-SkipMaven`全文档结构门禁及`git diff --check` |

本片不修改后端聚合，所以无需全后端或完整E2E矩阵。限定浏览器基于既有开发运行实例，其构件身份未重新冻结，不认领完整隔离栈资格、MQTT摄取、Node22、Windows、远端CI或部署；既有开发服务保持运行。失败证据已保留，EMQX配置差异后续需要依赖MQTT的包开片另核，不因本片通过裁决其合格。本片代码、测试和回执同次本地提交，不推送；提交号由Git定位本条源码与回执。

### 已完成的接口要求与验收

1. ~~在 `/api/v1/projects/{projectId}/overview` 中返回 `NORMAL`、`CRITICAL`、`MAJOR`、`MINOR`、`WARNING`、`INFO` 六类设备数；可按明确的 OpenAPI schema 设计成 `alarmSeverityDeviceCounts`。名称映射沿用 Console 现有严重度标签：正常、严重、主要、次要、警告、提示。~~
2. ~~统计对象是设备而不是告警实例。严重度顺序为 `CRITICAL > MAJOR > MINOR > WARNING > INFO`；每台设备按当前 `ACTIVE` 实例中的最高严重度归入一个告警类别，没有 `ACTIVE` 实例的设备计入 `NORMAL`。同一设备多条同级或不同级活动告警只计一次，`PENDING` 和 `CLEARED` 不计入告警类别。~~
3. ~~保证六类互斥且覆盖项目有效设备，类别数量之和等于概要中的 `devices.total`；非 `NORMAL` 类数量之和与 `alarmRate` 的分子（受影响去重设备数）一致。继续由后端 PostgreSQL 事实源聚合，不从 Console 告警分页结果汇总。~~
4. ~~将分布数据纳入 OverviewSnapshot / Redis 派生缓存并更新缓存契约版本；与 `alarmRate`、设备总数使用同一统计快照。~~
5. ~~更新根目录 OpenAPI，并通过唯一生成入口同步 Console 响应类型。~~
6. ~~验收空项目、无活动告警、单设备多条同级告警、单设备多严重度告警、PENDING/CLEARED 混合场景，确认互斥归类、总数与比例分子一致。~~

### 当前边界

Console 按服务端六类计数绘制多色环图、图例和提示；缺失字段、非法计数或比例不一致显示不可用。真实 PostgreSQL/Redis 4 项覆盖最高等级、重复实例、ACK、PENDING/CLEARED、删除、并发快照及缓存失效；受影响后端模块、Console 构建及 783 项测试、生成类型一致性验证通过。第四轮概要与批量摘要真实浏览器2项复验通过，原失败与绑定候选见下方接续记录。远端CI资格不继承本机结果。

## TODO-004 设备详情关联能力查询接口

- **编号**：~~CONSOLE-TODO-004~~ — 已完成并验证本地功能范围；实际候选、专项结果和限制见下文。
- **状态**：六类关联查询及页面均已实现，842项前端测试通过；Docker Desktop完整后端与六类空目录浏览器接线通过；新增VIEWER读取/管理边界及撤权浏览器专项通过；非空六目录及20+1分页浏览器本轮通过。
- **提出日期**：2026-09-28
- **范围**：为设备详情提供完整、明确的设备关联读取，不能将项目分页结果在浏览器筛选后当作该设备全部内容。

### 已交付能力与关联边界

**核对依据**：当前 Console [OpenAPI 生成合同](../src/types/api/schema.d.ts)中的项目级列表请求参数，以及私有平台仓库的 [设备数据运行时合同](https://github.com/chenbaiju/things-cloud/blob/master/docs/delivery/S12-0b-dashboard-data-runtime-contract.md) §3.5、§3.6。下表路径均为 `/api/v1/projects/{projectId}` 下的相对路径；设备关联边界以平台 `docs/contracts/DEVICE_CAPABILITY_SCOPE.md` §5 为准，未实现项不展示入口。

| 能力 | 当前已有接口/内容 | 已落实的设备查询条件及关联定义 |
| --- | --- | --- |
| 消息规则 | 设备下`/message-rule-candidates`、`/message-rule-executions`、`/message-rule-actions` | 项目候选不推断脚本设备过滤；新增日志保留确权设备，旧未知行不回填，原设备动作独立查询 |
| 任务调度 | 设备下`/task-jobs`与`/task-executions`游标查询 | 已区分当前静态/动态组目标与历史冻结目标；暂停配置保留状态，删除定义不改写该设备的旧执行归属 |
| 自动化 | 设备下`/automations`与`/automation-executions` | 已区分发布版本中的上报源/时间上下文、条件与设备动作；管理者读配置，全体成员读原版本执行和同设备动作记录数 |
| 场景 | 设备下`/scene-candidates`与`/scene-executions` | 项目候选明确未绑定设备，含暂停配置；历史按原设备和版本查询，同执行设备动作数不等于物理成功 |
| 终端用户 | `GET /devices/{deviceId}/end-users` 反查及原用户维度查询 | 已按关系、账号、项目角色均有效过滤；仅用户ID/显示名/设备关系角色/建立时间，含主控、共享成员及只读用户 |
| 命令执行历史 | `GET /devices/{deviceId}/commands` 游标历史及原单条结果 | 已按目标设备服务端过滤、签名分页；沿控制权限展示低敏摘要，含属性设置，受理或Broker接收不等于设备成功 |

### 已完成的接口要求与验收

1. ~~在根目录权威文档中冻结各能力的设备关联定义及请求/响应 schema；采用按设备的独立端点或服务端 deviceId 过滤条件，正式接口名称由后端确定。~~
2. ~~关联过滤必须在服务端分页前完成；约定稳定排序、游标绑定设备/项目/账号/过滤条件、空结果、失效设备及权限错误语义。~~
3. ~~任务/动态设备组、自动化和场景区分当前配置关系与历史执行事实；历史目标以执行时快照/投递事实为准，不用当前成员关系重写历史。~~
4. ~~保留项目隔离、资源读取权限、隐藏/删除与版本失效规则；终端用户关联只返回本入口获准展示的字段。~~
5. ~~同步 OpenAPI 和 Console 生成类型，验收无关联、多页关联、同一设备多个关联角色、动态组变化、旧版本、设备删除、撤权及跨项目查询。~~
6. ~~后端交付后，Console 再展示对应标签和该设备的数据，禁止以全项目页客户端过滤替代缺失合同。~~

### 已实现切片与剩余验证

命令历史由后端按目标设备、受理时间和ID倒序查询；OWNER/ADMIN/OPERATOR可读，VIEWER不新增权限。
Console支持前后翻页、回首页刷新及下发后刷新，切换设备/项目/账号时取消旧请求；失败显示不可用，不能推断无历史。
本机HTTP覆盖分页、撤权、设备失效、跨项目/跨租户及游标绑定，前端807项测试和构建通过；
早期完整模块回归在上游数据库初始化时容量失败；当前整合结果见本节末尾。终端用户标签使用新增服务端反查，前后翻页、刷新及身份变化取消旧请求；
显示名缺失不回退为登录名，明确只显示当前有效授权。对应HTTP6项、组件5项及前端全套812项通过，
任务调度标签已分别展示当前配置和执行目标，显示整体执行与该设备结果，切换模式重新从首页读取。
真实HTTP7项及新增组件6项通过。自动化标签区分管理配置与执行历史，管理权限撤回后取消配置读取；
定时上下文不标成上报源，动作记录数不标成设备成功。对应HTTP6项、新增组件7项及前端全套825项通过。
场景页区分项目候选与原设备执行，候选未绑定设备，暂停不可执行；权限撤回或身份变化取消旧请求。
场景真实HTTP6项、新增组件8项及前端全套833项通过。消息规则分别展示项目候选、已知设备身份的执行尝试和原设备动作；
旧未知日志不进入设备列表，不能推断完整旧历史，SUCCESS也不代表物理动作成功。对应HTTP9项、新增组件9项及前端全套842项通过；
新增 `e2e/device-associations.spec.ts` 覆盖自有项目下六类目录真实HTTP接线及候选/未知日志边界；静态检查和Playwright发现通过，
早期OrbStack容量失败保留；2026-10-01改用Docker Desktop，完整后端及默认浏览器矩阵通过，未降低容量门槛。
设备关联用例修复API夹具创建后的列表刷新，以及BOOLEAN改用合同SWITCH并增加类型约束；类型检查与ESLint通过。
真实浏览器确认六类空目录GET为200/no-store，以及候选未绑定、已知身份执行尝试/原设备动作的空态边界。
新增 `device-association-access.spec.ts` 通过：VIEWER五类历史目录读取200/no-store，管理按钮不可见且实际管理读取403，移除成员后原项目令牌401；命令页保留无控制权限说明。本轮已补六类非空、20+1分页及跨项目/游标浏览器反例，见第四轮专项回执；旧分层证据保留，物理设备资格不继承。
本次固定Console `8fe6ca2` 加关联/命令/成员夹具、流式响应取证、迟到REST时序及ADR0230断言修复、平台 `e6b00289` 加后端及菜单修复；全部补丁摘要及快照绑定于候选记录，同期SDK及其他新提交不继承。
Docker Node22/pnpm11.9构建、API一致性、103文件842项测试及静态检查通过（ESLint 1条既有warning）。
macOS Java21驱动Docker Desktop真实依赖的完整后端7923项汇总：0失败/错误、45条件跳过；其中6项Access打包另行全部通过，其余39项不认领。
Docker内真实API合同9项与默认浏览器33项通过，OTA受控signer生命周期1项按原前置跳过；不是外部资格放行。
详细回执、候选摘要及原始证据统一在平台 `docs/progress/G3.md` 的B-047条目和
`logs/verification/console-docker-gate/`；本次修复与登记在独立Console仓库本地提交，不推送。


### 单独边界

原六类设备关联查询已完成；设备事件发生历史WP-08已实现并验证本地软件范围，回执归后端待办；015-A已提供类型单条GET，WP-09单条当前读取优化与真实权限/页面验证已完成本地软件范围，详见后端待办唯一回执。
两项现有不足已迁至[后端依赖待办](BACKEND_TODO.md)，不再混入TODO-004完成范围；现有设备类型游标目录查询继续有效。

## TODO-005 设备列表批量告警状态摘要

- **编号**：~~CONSOLE-TODO-005~~ — 已完成并验证本地功能范围；实际候选、专项结果和限制见下文。
- **状态**：批量摘要及可见行合批已实现；本机 HTTP、权限、构建及793项前端测试通过；第四轮真实浏览器合批、断网及单行重试复验通过。
- **提出日期**：2026-09-28
- **依据**：当前 OpenAPI 的 DeviceResponse 未包含告警状态；`/alarms/query` 返回指定设备集合的分页告警实例，不是每台设备一条的状态摘要。多设备第一页未出现某设备，不能证明该设备无告警。

### 已完成的接口要求与验收

1. ~~在设备列表响应中扩展告警状态，或提供按 deviceId 集合批量查询状态的专用合同；字段名称及批量上限由后端冻结，禁止 Console 自行扩展生成类型。~~
2. ~~沿用详情和概要口径：存在 ACTIVE 告警实例即有告警，ACK 不影响判断，PENDING/CLEARED 不计入；无活动实例才返回无告警。~~
3. ~~明确摘要观测时间、一致性与刷新语义；禁止错误、撤权、设备失效或模型异常静默返回无告警，维持项目/设备权限隔离。~~
4. ~~验收多设备、单设备多告警、空结果、已确认活动告警、模型变化、设备删除及跨项目查询；确保每个请求设备都有可解释的状态，不受告警实例分页截断影响。~~
5. ~~同步 OpenAPI 与 Console 生成类型后，Console 替换逐行模型元数据和告警读取，保留未知、失败及重试状态。~~

### 当前 Console 边界

可见行按最多20台合批调用 `GET /alarms/device-status`，继续使用共享读取预算；刷新、换页和重试获取新快照，取消最后一行时终止共享请求，身份变化后的旧响应不落地。缺项、未知状态或失败整批显示不可用，不推断无告警。返回的观测时间可在状态提示中查看；仅是读取时状态，不承诺实时推送。真实后端 HTTP/RLS 回归已执行；批量摘要浏览器原失败已修正并定向复验通过，见下方接续记录；远端CI未验收。


## 第四轮测试接续

最终Console候选默认整合通过：平台`ca4205ec`加本轮后端生产增量、Console`1f5dc575`加全部本轮源文件，
快照SHA256 `bc16959e1e3fcfce1eb8a0844d15e0c208e04b8061bbbca90a9d97cc20e7d7eb`，
Linux独占Dind/Java21/Node22/pnpm11.9。构建、生成合同、类型检查、846项单元、37项Node与33项Python夹具通过；
ESLint零错误、1条既有未使用disable注释警告。真实API合同9项、默认浏览器40项通过、9项条件跳过，宿主/清理退出0。
跳过为SMTP5场、私有邀请1场、非空关联1场、资源包1场和OTA活动1场；前八场由下方各功能专项单独取证，
不能写成默认矩阵已执行。OTA活动的受控signer前置未提供，本轮未验；实物、服务器与远端CI资格不继承。
平台本机证据`logs/verification/r4-final-console/run-20261003T035833Z/`含源码逐文件摘要、结果和报告；
整合结束后非Markdown源文件无漂移。重建默认矩阵：`bash scripts/run-e2e-tests.sh --with-simulator`，
须按README准备自有隔离依赖，不运行下方私有选场或扩大默认权限。

2026-10-02概要及摘要复验已通过，平台 `ca4205ec`、本仓库 `4d663b1` 加绑定补丁，Linux独占Dind、
Java21/Node22/pnpm11.9：`overview-alarm-summary.spec.ts` 2项与真实API合同9项通过，退出0，无跳过或附加错误。
覆盖六级互斥分布、删除/空集、可见行一次合批、断网整批不可用与单行重试。
断网正则的前导空白失败保留，修正采用标准精确文本规范化；生产组件及业务断言不变。
快照SHA256 `015ed2c0e09192cec6b9b2c36e66d8213bf76ae2ce6a484a2eb123af39e18434`；
平台本机证据在 `logs/verification/r4-smtp-combined/run-20261003T014509Z-summary-notification/evidence/selected/overview-alarm-summary/`。
邀请完整注册、非空关联及其他组合仍沿独立结果判断，不以本次2项认领默认全套或远端CI。

下表维护本轮各功能差额；原暂停候选与失败证据保留，局部通过不关闭平台父包。
2026-10-01暂停时保存的原27个测试/夹具文件不含生产界面修改；本轮规则页签修复另有真实浏览器回执。

| 工作包与入口 | 已写内容 / 实际验证 | 尚缺内容与恢复入口 |
| --- | --- | --- |
| TODO-003/005：`overview-alarm-summary.spec.ts`、`alarm-summary-fixture.ts` | 原固定候选分布1项通过、批量摘要1项失败；冷加载等待预算及响应Promise处理已修正，类型检查通过 | 修正后真实浏览器2项已通过；重建：`E2E_SPEC=overview-alarm-summary.spec.ts bash scripts/run-e2e-tests.sh --with-simulator`。保留原失败，不把静态检查算复验 |
| R4-3a/b：`alarm-smtp-journey.spec.ts`、`rule-smtp-journey.spec.ts`、`rule-notification-fixture.ts` | 两场真实隔离组合各1项通过、各前置API9项；MQTT TLS、451/原一分钟退避/250、重放及暂停/恢复事实通过 | 仅受控SMTP收件；告警成功合同SUCCEEDED误写DELIVERED及规则页签不自动读取的原失败保留，修正后复验通过；真实外部邮箱另验 |
| R4-3c：`property-automation-smtp.spec.ts`、`automation-quota-fixture.ts` | 完整组合1项及API9项通过；零预算拒绝、CAS扩容/原操作重放、唯一属性执行/通知预留、真实MQTT/SMTP及暂停屏障 | 原CLI租户v4夹具失败保留；仅租户ID兼容v4/v7，资源/操作仍v7，8项护栏通过；只准独占Dind/专属PG/精确selector，物理动作另验 |
| R4-3d：`time-once-smtp.spec.ts`、`time-cron-smtp.spec.ts`、`time-automation-smtp.ts`、`time-automation-fixture.ts` | 两场各1浏览器+9 API通过；自然DB未来点、ONE_SHOT拒绝重挂、CRON第二次前暂停、唯一事实与451/原一分钟退避/250 | 受控收件，无SQL提前时钟；重启/竞争及设备动作由平台独立回执，不认领实物或外部邮件 |
| R4-4a：`plan-resource-package.spec.ts`、`scripts/run-plan-resource-package-e2e.ts` | 容量3→5→3的真实页面/设备API组合，JUnit1+浏览器1通过；同Request原响应捕获及APP RLS后验/清理通过 | 原超时与夹具失败保留；只能用平台ResourcePackageBrowserAcceptanceTests显式配套启动，不含真实付款或自然到期/实物资格 |
| TODO-001：`invitation-registration-smtp.spec.ts`、`identity-mail-fixture.ts` | 真实TLS两封邮件、锁定邮箱注册/验证、明确接受及身份/重放反例浏览器1项/API9项通过，退出0；受控收件6项/身份解析3项通过 | 保留冷加载/checkbox/注册窗口/MIME首败；等待原301秒自然限流窗口，主体/URL校验不放宽。源码快照00ea69a6；真实外部邮箱独立，正文仅0700目录/0600文件 |
| TODO-004：`device-associations-populated.spec.ts`、`association-quota-fixture.ts`、`association-request-fixture.ts` | 真实六类非空关联与命令/任务20+1分页、跨项目拒绝、刷新及返回浏览器1项/API9项通过，退出0 | 原项目setup/写限流失败保留；每次250毫秒与4项护栏，不调高限额、不重试、不减样本；当前源码快照09e42337，详见下方 |
| 公共测试设施 | EMQX typed TLS安装/恢复12项工具测试及真实EMQX6.2.3安装、TLS1.3、错主机拒绝、低权拒绝与恢复通过 | 原SDK失败仍保留；后续平台探针各自验收，唯一详细回执归SDK知识库；工具通过不替代业务入库 |

TODO-001 未注册邀请本轮回执：平台`ca4205ec`、Console`4d663b1`加冻结夹具，Linux独占Dind、
Java21/Node22/pnpm11.9，浏览器1项/API9项通过，0失败/跳过/附加错误；清理及宿主退出0。
真实TLS收件2封，邀请预览不加入、注册邮箱锁定、未验证/错误邮箱拒绝、邮箱验证后仍需明确接受、
接受后一次加入与重放拒绝；生产Mailer形成的折行主题按严格RFC2047相邻编码词处理，不放宽收件主体/URL绑定。
C2c消耗原注册额度后自然等待301秒，仅精确选场与私有收件前置允许该等待，未改限流或清Redis。
快照SHA256 `00ea69a64dd8bd1962724d44d284bea3eed3d53ac53cdede7a1f39e97d3a51b2`；平台本机原始证据
`logs/verification/r4-console-identity-combined/run-20261003T034043Z-mime-subject/evidence/selected/invitation-registration-smtp/`。
原失败和合成JavaMail匹配探针在`logs/verification/r4-invitation-registration-smtp/`，与真实SMTP证据分开。
该结果不认领真实外部邮件服务或公开注册部署。

TODO-004 非空目录本轮回执：平台`ca4205ec`、Console`4d663b1`加冻结夹具，Linux独占Dind、
Java21/Node22/pnpm11.9，浏览器1项与API9项通过，0失败/跳过/附加错误；数据清理及宿主退出0。
六类数据经真实公开API创建，命令与任务各21条按20+1分页；跨项目读取404、跨目录游标400，
页面刷新/返回及已发布当前配置保持可读。原每秒写限流拒绝不降低阈值，仅排队每次250毫秒；
权限、quota精确CAS和失败清理护栏保持。源码快照SHA256
`09e42337f463346dbe6deb1b415bc4afab95c444b8e75e74ba48ef5677e155de`；平台本机原始证据
`logs/verification/r4-console-identity-combined/run-20261003T033604Z-association-pacing/evidence/selected/device-associations-populated/`。
非空专项通过不代表默认全套、真实设备或公司服务器资格。

### 验证记录与重建命令

2026-10-01历史交接候选基于平台`0574a8f9`、Console `e7fc7c3`及上述待保存差异；macOS、Node26.7、pnpm11.22。
22项Node夹具、23项Python工具、1项MQTT TLS单元、完整vue-tsc、ESLint、8场用例收集与Shell语法通过；没有启动真实PG/EMQX组合或浏览器。
这包含模拟Broker恢复与本机回环TLS收件，不能替代真实平台握手、业务入库或CI Node22环境。
命令在Console目录执行，`scripts/tests/`小测试不会随`pnpm test`自动执行：

```bash
node --import tsx --test scripts/tests/owned-fixture.test.ts \
  scripts/tests/rule-notification-fixture.test.ts scripts/tests/automation-quota-fixture.test.ts \
  scripts/tests/time-automation-fixture.test.ts scripts/tests/controlled-smtp-fixture.test.mjs
python3 -m unittest scripts.tests.test_runner_arguments scripts.tests.test_emqx_test_tls scripts.tests.test_smtp_receipt_cleanup
pnpm exec vitest run tests/currentValueMqttTls.test.ts
pnpm exec vue-tsc --noEmit
bash -n scripts/run-e2e-tests.sh
```

平台本机原始证据位于`logs/verification/r4-handoff-closeout/`，此前摘要失败在`r4-console-selected/`；
这些目录被忽略，不在公开Console仓库，缺失时应按上述命令重建而非推断结果。
完整后端与功能前置见[平台第四轮暂停接续](https://github.com/chenbaiju/things-cloud/blob/master/docs/progress/G3.md)，需私有仓库读取权限；SDK失败与恢复详见[SDK知识库](https://github.com/chenbaiju/things-cloud/blob/master/things-cloud-device-sdk/docs/ESP32.md)。

本轮告警快照`1810951de0e78114bb4f579114c50fcb01244b5e4c14ee279ac81df3b0798292`、规则快照
`a0583cd11cf61b5c7f6409bb9df224c245daf77281316f13d165854e9f55b58b`，平台`ca4205ec`、本仓库`4d663b1`加冻结差异，
Linux独占Dind/Java21/Node22/pnpm11.9，各成功selected场退出0、无失败/跳过/附加错误，TLS恢复及清理成功。
上述两批宿主分别因后续规则页签/属性夹具首败退出1，并非整批通过；后续失败已由下方独立修正候选复验，原退出1保留。
规则生产页签组件旧版2失败、修复3/3，完整前端846项、类型与ESLint通过；SMTP范围、原失败和当前日志分别在平台本机
`logs/verification/r4-smtp-combined/run-20261003T021048Z-alarm-status/`、`run-20261003T023418Z-rule-tab/`、
`logs/verification/r4-rule-execution-tab/`。本机结果不继承远端CI或公司服务器资格。
属性/时间三场绑定快照`9c8498ebee96a7c5f03605aea8ffa06e8f3823366f7f2e83656c05f54c1a1a00`，
同环境各退出0、无跳过或附加错误，证据`logs/verification/r4-smtp-combined/run-20261003T030000Z-cli-tenant/`。
资源包快照`1f153c8e7f3ccfbe44bd7fb1b1e1bcf8d0e1d138b2a5bd706d24069e95e7569c`，证据
`logs/verification/r4-resource-package-browser-runner/run-20261003T030838Z-owned-rls-import-NOTRUN/`；
这些是平台本机忽略目录，公开仓库缺失时按精确选场及所属平台入口重建。

### CI与恢复边界

默认CI会收集并执行摘要2场；SMTP5场、私有邀请、非空关联、资源包及OTA活动缺显式前置时跳过，跳过不等于通过。
本次保留原触发器，不扩大受控SMTP选场；公共TLS/收件配置只能由专属选场启动，失败须保留私有恢复状态。
此前独立Console CI使用固定后端`6a1e2429`，该历史候选不能继承后来本地增量的验证资格；原配置见[迁移前固定版本](https://github.com/chenbaiju/things-cloud/blob/591d3d04f115ae0afbb868199ae600c49a8e3b6c/things-cloud-console/.github/workflows/console.yml)。
2026-10-03工作区迁回平台单仓库，[Console工作流](../../../.github/workflows/console.yml)与[E2E工作流](../../../.github/workflows/e2e.yml)统一检出手动运行的同一平台提交，不再单独绑定旧后端SHA。迁移实施阶段未提交、未推送，随后获准提交并推送平台 `master`；未运行远端CI，实际资格以对应候选运行结果为准。
恢复时先确认平台提交、源码摘要和运行时，按尚未验证的范围选场；已通过的摘要/TLS结果保留，不自动运行旧排队脚本。


## TODO-006 Agent 项目模型配置

- **编号**：~~CONSOLE-TODO-006~~ — 已完成并验证本地功能范围；实际候选、专项结果和限制见下文。
- **状态**：配置界面、组件及最终同候选真实浏览器复验通过；不含模型诊断入口。
- **范围**：在项目设置中仅为当前 OWNER/ADMIN 提供 DeepSeek Key 替换、启停、删除和元数据刷新。
- **合同**：遵循 [Agent 项目模型配置](../../../.private/thingslink-docs/things-link-agent/docs/PROJECT_MODEL_CONFIGURATION.md)，
  复用登录与项目选择；新 Key 提交即清空，项目/账号/权限切换清除敏感输入并丢弃旧响应。
  不回显已存 Key、不写浏览器存储；结果不明时先刷新，不自动重发。
  AG-UI01 已裁决 A：新 Key“保存并启用”由单次请求、同一后端事务完成，成功后显示“停用”；现存停用配置保持原状态。
  AG-UI02：503/50061 显示服务器凭据保护不可用及联系管理员检查主密钥的固定提示，不回显异常、不重发 Key，先刷新再操作。
- **验证入口**：`pnpm build`、`pnpm exec vitest run tests/agentModelPanel.test.ts --maxWorkers=2`、
  聚焦 ESLint/Stylelint，以及隔离环境内 `E2E_SPEC=agent-model-configuration.spec.ts bash scripts/run-e2e-tests.sh`。
  标准 E2E 启动脚本给新启测试后端注入独立随机主密钥；不在文件落盘，不调用供应商。
  使用 SKIP_BACKEND 时须由测试环境提供匹配主密钥；不能将真实项目密钥交给测试栈。
- **证据边界**：详细候选、结果和限制统一登记在 [Agent 开发计划](../../../.private/thingslink-docs/things-link-agent/docs/DEVELOPMENT_PLAN.md)，
  配置启用只验证本地解密，不证明供应商可达或模型分析已交付。


## TODO-007 Agent 单设备只读证据

- **编号**：~~CONSOLE-TODO-007~~ — 已完成并验证本地功能范围；实际候选、专项结果和限制见下文。
- **状态**：AG-1c-3a构建、28项聚焦及887项全量本机通过；AG-1c-3b限定Linux真实API9项/浏览器1项及自有运行器清理通过；不继承完整矩阵。本任务只读证据范围已完成；个人事实报告已由TODO-008交付，真实模型诊断仍独立待验。
- **范围**：设备详情增加“诊断证据”页签，当前四类项目成员手动读取属性目录、选1至10项并读取受权快照。
- **合同**：[AG-1c-3a](../../../.private/thingslink-docs/things-link-agent/docs/FIRST_SLICE_DESIGN.md#AG-1c-3a%20Console只读证据页签（自主裁决%20A）)，
  消费既有binding-metadata和AG-1a快照，不新增接口/菜单，不读取Key或发外部请求。
  缺失/来源未知/模型变化分别显示；身份/项目/设备/权限切换清空及丢弃旧响应，无业务自动重试。
- **证据入口**：候选、命令和实际结果统一在[Agent开发计划](../../../.private/thingslink-docs/things-link-agent/docs/DEVELOPMENT_PLAN.md)；
  组件mock通过不代表真实平台浏览器、付费模型、质量、Windows/CI或正式部署通过。

AG-2d增加手动单NUMBER属性/过去24小时历史与告警20条替换式分页，当前权限及身份代次围栏；
历史来源模型、未知空值、保留裁剪/实际粒度显式，告警事故模型未提供/无时间窗/非稳定快照。
本机66聚焦/985完整单元、类型/构建/静态通过，AG-6c-2限定Linux真实空历史/告警旅程通过；非空来源/完整矩阵与模型诊断另验，不代表正常状态判断。

AG-2e复用上述手动历史结果，按来源类型和精确模型分组展示返回点数、精确样本计数及值范围；
未知值不作零，降采样仅是桶均值范围，不求跨模型均值、完整率或异常；身份/输入/失败沿原围栏清除。
AG-6h限定Linux真实API9项/四角色浏览器1场通过；验证与运行范围统一登记Agent开发计划，不继承完整矩阵或真实模型诊断。

## TODO-008 Agent 个人事实记录

- **编号**：~~CONSOLE-TODO-008~~ — 已完成并验证本地功能范围；实际候选、专项结果和限制见下文。
- **状态**：AG-4a/b及AG-5a/b本机通过，手动报告/下载947项单元、类型/构建与摘要/身份反例通过；AG-6a个人记录限定Linux浏览器1项通过，AG-6c-1报告候选d793b558/0180开发实例加载通过，AG-6c-2限定Linux真实API9/报告下载/空历史告警浏览器1及回收通过；AG-5c有界历史集合后端通过，AG-5d项目设置集合选择/手动生成/重新确权下载48聚焦/1031完整单元及类型/构建通过，集合候选45843778/0180开发实例健康与路由通过，AG-6d-2限定Linux集合四角色真实API9/浏览器1及实际下载通过；AG-6e非空历史/告警四角色Linux真实API9/浏览器1及专属回收通过，存储事实非摄取/触发资格；AG-6f同候选限定Linux五场45接口/5浏览器通过，首败测试定位已修；模型/部署/完整矩阵另验。
- **范围**：现有设备详情诊断证据页签手动保存、刷新本人记录、查看历史事实和删除；手动生成来源可复核的事实报告，下载重新向服务端确权并校验摘要；项目设置汇编本人选定最多五设备各一条历史来源。
- **边界**：记录四角色本人且当前有权，历史数据不代表当前状态；取消不承诺撤销已提交保存，不自动重发。
- **证据入口**：[Agent开发计划](../../../.private/thingslink-docs/things-link-agent/docs/DEVELOPMENT_PLAN.md)，限定旅程与实际运行环境分别登记，完整矩阵和部署独立。


## TODO-009 Agent 受控项目知识

- **编号**：~~CONSOLE-TODO-009~~ — 已完成并验证本地功能范围；实际候选、专项结果和限制见下文。
- **状态**：本机组件/身份、931项完整单元、类型/构建/静态通过；AG-6b-2限定Linux真实API9项及四角色浏览器1项/清理通过，完整矩阵和部署另验。项目设置中的手动目录/正文/本地检索面板；四角色读取，当前活跃项目管理员逐次批准发布或按版本删除。
- **合同**：[ADR0234](../../../.private/thingslink-docs/docs/adr/0234-agent-controlled-project-knowledge.md)及[AG-3b设计](../../../.private/thingslink-docs/things-link-agent/docs/FIRST_SLICE_DESIGN.md#AG-3b%20Console受控知识维护与检索（自主裁决%20A）)。资料仅当前项目共用，个人记录不共享；不外发、不调用模型，字面命中不等于诊断。
- **验证**：实际候选、角色/身份代次、原文转义、失败不重发及运行限制统一在[Agent开发计划](../../../.private/thingslink-docs/things-link-agent/docs/DEVELOPMENT_PLAN.md)，浏览器/部署独立。

## TODO-010 Agent 模型状态与固定问题

- **编号**：CONSOLE-TODO-010；扩展后的父任务保持未完成，不能由后端已提供接口推导为整体验收完成。

| 子项 | 当前状态与后续工作 |
| --- | --- |
| ~~010-A 默认关闭状态与固定问题~~ | 已完成并验证：原AG-1c-3c/3d组件与限定关闭状态真实浏览器回执有效 |
| ~~010-B 受审状态及单次提交页面接线~~ | 已完成并验证本机组件范围：消费AG-1c-4e-2c-1新增状态，显式费用勾选、点击重新GET、先存意图后单次POST、纯文本结果、原键核对与人工处置已实现；AG-1c-4e-2c-2历史1237项通过。该完成标记不包含正向真实浏览器 |
| ~~010-C 当前扩展交互浏览器补证~~ | 已完成并验证本机合成受审范围：9项真实浏览器通过，覆盖三付费角色单次POST/原键恢复、VIEWER403、停用重新确权、原生storage及身份/范围切换、真实迟POST取消、401不重放和UNKNOWN；17项新增后端夹具与191次分析/架构回归、1992项Console通过。生产PENDING不变，真实模型另验；详细唯一回执见[Agent开发计划](../../../.private/thingslink-docs/things-link-agent/docs/DEVELOPMENT_PLAN.md#ag-1c-4e-2c-2-console显式单次提交回执) |
| 010-D 真实模型结果及质量 | 待外部准入与专项验收；供应商材料、计数合同/上界及新的有效授权未齐。不是Console缺接口，不得开启真实出站、重置旧探针或用Key启用替代准入；见[跨域资格边界](BACKEND_TODO.md#跨域资格边界) |


- **状态**：默认关闭状态和本地问题选择已实现，本机53聚焦/1056全量及类型构建通过；AG-1c-3d限定Linux四角色及个人记录两场真实复验通过，完整矩阵及正向结果另验。
- **范围**：设备诊断证据页签复用当前身份与项目，三类付费角色手动查看模型状态；VIEWER继续查看事实。
- **合同**：[AG-1c-3c](../../../.private/thingslink-docs/things-link-agent/docs/FIRST_SLICE_DESIGN.md#AG-1c-3c%20Console默认关闭模型状态（自主裁决%20A）)。
  当前接受封闭状态配对：仅受审且项目配置启用可发起，Key启用不代表准入；问题选择不发送数据，待审仍禁用。
  身份/项目/设备/模型/属性及权限改变清除旧状态，无自动请求或重试；瞬时展示已接线，显式费用勾选及点击时重新GET状态通过才可保存原意图和单次POST。
  AG-1c-4a在公共HTTP精确禁止分析POST认证重放；401保留原意图并要求重新核对，不影响普通请求刷新。
  AG-1c-4c补最小持久意图、跨标签互斥及原键只读恢复客户端；错误/到期不自动删键，已接入手动提交按钮；4e-2a已接入原设备手动GET核对及有条件人工处置，失败/到期不自动删除。
  AG-1c-4d-3后端已定义首次受权返回的可空result；AG-1c-4e-1补封闭结果解码，验证类别/正文关联、用量/引用/字节上限并复制嵌套对象，原键GET共用元数据校验。
  AG-1c-4e-2b已接入纯文本瞬时展示和先持久后单次提交客户端，身份/输入/存储变化清除内存；页面只消费受审配对状态并再次核对，不能用项目配置布尔值绕过。独立签发及内部受审通道已本机验证，4e-2c-2受审手动交互已接线，不把元数据SUCCEEDED当旧正文恢复。
  AG-1c-4e-2c-1补后端封闭受审状态，配套生成类型已更新；2c-2已消费状态，完成后撤销勾选/可用提示，原意图不自动清除。随包PENDING使当前业务不可用。
- **验证与边界**：组件/API、类型与构建回执统一在[Agent开发计划](../../../.private/thingslink-docs/things-link-agent/docs/DEVELOPMENT_PLAN.md)；
  真实浏览器、付费意图与结果展示、模型质量及部署分别验收，不能用状态查询认领AG-1完成。


## 接口覆盖补齐工作包

### 审查基线与执行边界

2026-10-06，根据负责人要求登记已确认缺口并规划后续工作包。该规划轮仅编制计划，未实施页面、提交或推送；本轮分类复核不自动启动WP-01至WP-07。
基线为平台 `master / d5e24018`，审查时 Console 与 `docs/openapi.json` 无未提交差异；
[OpenAPI](../../../docs/openapi.json)包含330条路径、407个操作。后续开片必须重新核对HEAD、工作区、实际Controller及合同，数量不是覆盖率或完成标准。

事实依据为路由、API封装、页面消费者及后端合同的静态对照；不能仅按URL全文匹配判缺失，须展开动态路径和共享客户端。
`pnpm api:check`已在审查轮通过，只证明生成类型一致，不证明页面消费、后端运行或浏览器验收。
本计划沿用[V1-R4](../../../.private/thingslink-docs/docs/PRODUCT_SCOPE_V1_R4.md)、[前端边界](../../../.private/thingslink-docs/docs/FRONTEND_ARCHITECTURE.md)与[测试方针](../../../.private/thingslink-docs/docs/TEST_VERIFICATION_POLICY.md)。
接口已有与页面应提供是两项判断：App、匿名分享运行时、设备接入、EMQX回调、模拟器、Actuator及受控模型探针不逐一建设Console页面。
SIM、商用服务器、域名与公开部署验收继续暂停；套餐、计量、租户隔离和TLS继续保留。真实模型、signer和硬件资格不因补页面获得放行。

原WP-01至WP-07七个工作包的主要业务接口已有，归Console可接续队列；这不保证刷新恢复等完整操作链均已具备，WP-02/03新增后端预检见[闭环预检](BACKEND_TODO.md#已有接口工作包中的后端闭环预检)。各包当前状态见下表。新增菜单的MenuCatalog配套、接口缺陷修复仍须同片跨端验证，不等于仅能修改前端文件。默认按下表顺序接续；若前置受阻，可记录原因后推进无依赖工作包，不借此绕过门禁。
每个子片均包含范围核对、实现、相应验证和回执，不把“写API、写页面、写测试”拆成互不闭环的交付片。

| 工作包 | 对应任务与入口 | 顺序 | 前置 | 子片及独立交付边界 | 当前状态 |
| --- | --- | --- | --- | --- | --- |
| ~~WP-10~~ | [原任务页面收尾](#页面交付项复核与收尾队列) | 0 | TODO-003/010后端合同已具备 | ~~003-C数量卡片~~及~~010-C既有受控浏览器补证~~均已验证（不重复计片） | 已完成并验证本机软件范围；010-D外部资格开放 |
| ~~WP-01~~ | [~~TODO-011 项目回收站~~](#TODO-011%20项目回收站与恢复) | 1 | 当前项目删除、OWNER与恢复合同 | ~~011-A 回收站与恢复闭环~~ | 已完成并验证本地范围 |
| ~~WP-02~~ | ~~[TODO-012 留存导出](#TODO-012%20删除项目留存导出)~~ | 2 | WP-01入口；导出worker与私有对象存储测试条件 | ~~012-A 异步导出申请、状态与下载闭环~~ | 已完成并验证现行合同的本地软件范围；启用存储额度拒绝边界保留 |
| ~~WP-03~~ | [TODO-013 终端用户](#TODO-013%20项目终端用户管理) | 3 | 现有终端用户及设备绑定合同 | ~~013-A 账号与项目角色管理~~；~~013-B 用户设备绑定与认领令牌~~；~~013-C 用户维度看板授权目录~~ | 已完成并验证本地软件范围；同候选完整默认矩阵及严格TLS旅程3/6/7均已验证 |
| ~~WP-04~~ | [~~TODO-014 通知投递~~](#TODO-014%20告警通知投递查询) | 4 | 既有告警实例与投递意图查询 | ~~014-A 告警详情投递查询闭环~~ | 已完成并验证本地软件范围 |
| ~~WP-05~~ | [TODO-015 产品凭据](#TODO-015%20一型一密产品凭据) | 5 | 已发布设备类型及产品凭据合同 | ~~015-A~~ 产品密钥生成与轮换闭环 | 已完成并验证本地软件范围 |
| ~~WP-06~~ | [~~TODO-016 OTA补齐~~](#TODO-016%20OTA配套管理与诊断) | 6 | 既有OTA管理面；写入口另核受控配置 | ~~016-A~~ 信任域、发布键及基线只读信息；~~016-B~~ 已发布固件下载；~~016-C~~ 作业回退准备观察；~~016-D~~ 受控信任包导入；~~016-E~~ 受控类型基线登记 | 五片已完成并验证本地软件范围；真实根/signing与实物资格独立保留 |
| ~~WP-07~~ | [~~TODO-017 软删除~~](#TODO-017%20看板与应用软删除) | 7 | 既有发布管理、CAS与运行资格 | ~~017-A~~ 看板软删除；~~017-B~~ 应用软删除 | 两片已完成并验证本地软件范围 |

013-B/C依赖013-A的用户选择和身份清理；016各子片复用现有OTA页面，可分别验证；017-A/B分别核验资源合同。
只读与安全写入、不同资源生命周期具有独立验收边界，因此分别拆片；WP-02的申请、状态和下载共同构成一次用户流程，保持同片。

### 前后端统一接手与执行顺序

负责人本轮明确：后端缺口也由当前执行者负责，不再以“等待其他后端开发者”作为停工理由。
两个文档按**依赖是否已具备**分类，不按执行人员分工。需要的领域逻辑、HTTP、权限/菜单、生成契约、迁移、Console和测试由同一功能切片交付。
2026-10-06负责人已授权按统一顺序连续实施；每个功能切片包含记录与验证后单独本地提交，不推送。既有差异已保存为`9b4dc27b`。当前从003-C开始；外部资格及R4暂停事项保持原边界。

| 队列 | 工作包与切片 | 统一负责的交付范围 | 进入条件与完成门禁 |
| --- | --- | --- | --- |
| 已有接口补齐 | WP-01至WP-07，011-A至017-B共14片 | 下表逐项核对/修复后端，再完成Console及相应验证 | 当前API存在只证明有入口；WP-02任务找回、WP-03未分配账号恢复等先核查，缺陷同片修复；功能与证据齐备才关闭 |
| 后端先行新增 | [~~WP-08 / BE-001~~](BACKEND_TODO.md#BE-001%20设备事件发生历史)，~~BE-001-A/B/C~~ | A为独立契约与范围决策；B为所选事件摄取及持久化；C为后端查询、生成类型、页面与验证 | A/B/C设计、摄取与管理查询/Console均已完成并验证各自本地范围；C同片修精确脱敏，真实TLS MQTT/Kafka/PG及浏览器通过；详细结果只见后端TODO，不补写旧历史 |
| Console直接优化（后端已就绪） | [~~WP-09 / BE-002~~](BACKEND_TODO.md#BE-002%20设备类型单条读取)，~~BE-002-A~~ | 单条GET、隔离/错误合同、Console改用直接读取与验证同片完成 | 已完成并验证本地软件范围；目录缺失N页→单GET、缓存0→1当前复核；复用015-A、不重复新增接口 |
| 原任务页面收尾 | WP-10：003-C及既有010-C | 003-C补概要独立告警设备数卡片及验证；010-C： 对当前受审交互补同候选限定浏览器证据，发现范围内前后端缺陷一并修复 | 复用Agent执行入口与合成受审条件，不等待新公共接口；真实出站010-D仍受独立准入约束 |

默认软件顺序：WP-10的003-C→WP-01→02→03→04→05→06→07→BE-001-A→BE-001-B→BE-001-C→WP-09；WP-10的010-C按Agent现有计划接续，不在两处复制实现流水。
BE-001合同评估可以在规划/开片时提前读取，但未取得执行指令不实施；若有新的必需依赖，先更新此表和对应TODO。
不存在必需依赖时不把可选BE-002或真实模型资格作为前七包的阻塞。WP-08/09保留为独立需求；不得用原接口完成回执替代003-C、010-C页面收尾。

### 各包后端责任与验证落点

以下是实施时必须检查的责任面与已有测试入口，不是本轮发现了所有这些后端缺陷，也不是本轮运行回执。
测试类选择需开片重新核对；同片仅按实际传播选择最小充分集合，失败则保留首败、补反例、修复后复验。

| 包 | 后端核对与按需修复责任 | Console闭环与共享文档 | 已有验证入口及重点差额 |
| --- | --- | --- | --- |
| WP-01 | project/iam：回收站在无当前项目时可用、有效OWNER、恢复期限/代次（含720小时、夏令时与锁等待边界）、旧凭据失效及清理竞争；核查导航不依赖已删除项目角色 | 回收站/恢复；项目生命周期合同及对应G3记录仅在实际变更时同步 | 项目恢复/清理相关Bootstrap场景，新增无当前项目与期限边界浏览器；不以列表隐藏证明隔离 |
| WP-02 | export/project：申请去重、worker状态、OWNER再确权、短时URL、恢复/清理竞争与私有对象交付；先核刷新后任务发现能力，不虚构列表 | 回收站导出闭环；ADR0075/0162保持历史不可改，新决策另登记 | `ProjectExportServiceTests`、`ProjectExportWorkerTests`及`ProjectExportLifecycleTests`、`ProjectExportDownloadLifecycleTests`、`ProjectExportObjectStorageTests`按影响选用；真实存储下载验包 |
| WP-03 | enduser/iam/device/dashboard：预置与角色分离、角色状态可读性、设备关系、认领限制、授权CAS与当前项目权限；若目录不能定位刚预置/停用用户，先补或明确可复用合同 | 用户管理/绑定/授权目录；MenuCatalog、权限及终端用户契约同步 | `EndUserManagementApiTests`、`EndUserIsolationIntegrationTests`、`EndUserRoleConcurrencyTests`、`DeviceClaimApiTests`及授权场景；页面创建到可再次管理必须闭环 |
| WP-04 | alarm：按实例过滤、游标绑定、脱敏、项目权限、状态语义；核对投递终态字段不伪装供应商送达 | 告警投递只读页签；不增加不存在的重发操作 | 通知HTTP与`AlarmNotificationProjectLifecycleTests`；真实意图+浏览器、失败/空集/换告警 |
| WP-05 | device/iam/ingestion：发布类型限制、权限、轮换事务、秘密只展示一次、幂等/认证重放与动态注册合同 | 产品凭据管理及影响提示；与设备凭据明确区分 | `DeviceTypeApiTests`及凭据/动态注册真实依赖测试；旧新秘密、已有设备不误伤、未知响应 |
| WP-06 | ota/iam：A公开信任/基线投影；B固定版本下载与确权；C回退观察和资格；D签名包校验/幂等；E精确类型配置/登记；页面不能代受控配置签发或绕过信任链 | 五个子片沿既有OTA页面交付；缺字段时同片后端补齐并同步契约 | `OtaTrustDomainCollectionReadHttpIntegrationTests`、`OtaTypeBaselineVersionCollectionReadHttpIntegrationTests`、`OtaPublicationHttpIntegrationTests`、`OtaRollbackPreflightIntegrationTests`、`OtaTrustHttpIntegrationTests`、`OtaTypeBaselineHttpIntegrationTests`按片选用；合成签名材料不继承真实signer |
| WP-07 | dashboard/application/enduser：软删权限、CAS/幂等、引用与发布指针、旧运行入口及分享资格；以服务端真实约束为准 | 看板/应用删除确认与刷新；需要时验证WebApp直接消费者 | `DashboardManagementAndPublicationIntegrationTests`及应用/运行元数据场景；从管理端删除到旧运行入口拒绝闭环 |
| ~~WP-08~~ | telemetry/ingestion/device：已交付事件事实、历史模型身份、保留/额度与服务端过滤 | 完整范围见后端文档；不以原始日志或当前模型补写历史事实 | A/B/C已按独立边界完成并验证本地软件；EventHistory查询/游标/service、DeviceEventHistoryHttpTests及device-event-history-journey详见后端TODO |
| WP-10 | overview/assistant：003既有聚合足够；010既有受审合同足够。实施若发现合同缺陷，同片负责后端修复 | 003-C卡片和010-C既有交互补证；不另造后端前置 | 003-C按原TODO验卡片DOM、同快照及限定浏览器；010-C按Agent现有计划取证，真实模型另验 |
| ~~WP-09~~ | device/iam：单条读取复用既有权限和安全投影，不依赖未授权的列表扫描 | 同片替换设备详情目录查找；保留不存在/已删除正确反馈 | `DeviceTypeServiceTests`、`DeviceTypeApiTests`及设备详情组件/浏览器；证明目录缺失请求减少、缓存新增当前复核且结果/隔离一致 |

### 切片验证与完成定义

1. 开片记录实际平台SHA、已有差异、选定子片、页面落点、HTTP方法/参数/响应/错误码、权限与状态边界、后端测试前置及预期验证命令。发现合同缺失先登记，不编造字段、能力或授权。
2. 每片至少验证真实页面入口与按钮权限、正常闭环、空集/失败、跨项目与越权、账号/项目切换后清除旧结果、并发或过期响应。按接口原合同处理CAS、幂等与结果未知，不对敏感写操作盲目换键重发。
3. Console业务切片先按测试方针记录影响与最小充分范围：相关组件/API反例、类型/构建、契约及受影响静态检查为基础；全量`pnpm test`及全量lint由传播与门禁决定，不机械每片重跑。最终Console整合执行 `pnpm build`、`pnpm test`、`pnpm api:check`、`pnpm lint`、`pnpm lint:stylelint:check`。新增客户端/组件反例须随对应验证运行。`scripts/tests/`工具测试不随`pnpm test`执行，只有涉及工具变更时按实际文件另跑并登记。
4. 每片在隔离真实后端执行对应API反例及真实浏览器旅程；优先复用[Console运行入口](../README.md)。浏览器选场用已存在或本片新增的实际spec，登记 `E2E_SPEC=<实际文件名> bash scripts/run-e2e-tests.sh` 的展开命令；占位命令不能算回执。缺SMTP、对象存储、签名或设备前置时标NOTRUN/阻塞，不以mock替代真实资格。
5. 后端由同一执行者按[测试方针](../../../.private/thingslink-docs/docs/TEST_VERIFICATION_POLICY.md)完成必要修改，并追加受影响模块完整测试、Bootstrap直接传播与真实依赖/隔离回归；生成合同仅通过 `python3 scripts/generate-openapi-contracts.py` 更新。新增菜单同步后端MenuCatalog、前端兜底及菜单合同测试。
6. 数据库变更只能增加新Flyway迁移，不改历史；按实际变更验证新库/升级、迁移预检及RLS。Java生产注释和Controller JavaDoc遵循中文规范；公共合同同步Console/WebApp及直接共享消费者。局部Maven从`things-cloud/`使用`./mvnw -pl <受影响模块> -am ...`，聚焦selector配`-Dsurefire.failIfNoSpecifiedTests=false`，实际模块/类名开片填写，不能把占位命令当已验。
7. 文档执行根目录 `pwsh scripts/docs-verify.ps1` 与 `git diff --check`。选定包整合后（含实际纳入的后端先行片），以同一固定候选执行Console完整静态/单元与默认浏览器矩阵，并补本轮专属选场；默认矩阵跳过的专项不算通过。未改动后端不机械要求全后端重跑，受影响范围按测试方针登记。
8. 子片只有实现、规定验证和回执齐备才标完成；部分通过保留未完成状态。工作包全部子片闭合后才关闭父项；组内整合验收单独登记，不继承各旧候选结果。CI、Windows、公司服务器、外部送达和真实硬件分别取证，未执行逐项说明。

回执直接维护在对应TODO下，顶部表同步状态，不另建按日期命名的日志文档。每片回执至少包含：
子片编号与状态、实际变更、平台SHA及未提交差异/源码摘要、环境与前置、实际命令、PASS/FAIL/SKIP/NOTRUN、
用例范围、证据路径、剩余限制、恢复命令与条件、是否已提交/推送。失败修复后保留首败与复验边界。
若产生共享合同或阶段变化，再同步其权威入口和平台PROGRESS；本轮仅规划不改变平台当前执行轴。

## TODO-011 项目回收站与恢复

- **编号/工作包**：~~CONSOLE-TODO-011~~ / ~~WP-01~~ — 已完成并验证本地软件范围。
- **状态**：011-A已完成并验证本地范围；后端合同保持，入口嵌入已有项目列表，未新增菜单。
- **代码事实**：[项目API](../src/api/project.ts)及[项目列表](../src/views/project/list/index.vue)已有删除，无回收站与恢复消费；[后端项目Controller](../../../things-link/things-link-project/src/main/java/com/things/link/project/api/controller/ProjectController.java)已有对应入口。
- **接口**：`GET /api/v1/projects/recycle-bin`、`POST /api/v1/projects/{projectId}/restore`。
- **011-A交付**：项目列表提供回收站，显示服务端返回的删除及恢复期限；按当前有效OWNER与服务端资格恢复，刷新项目列表和回收站。入口不能要求已选中被删除项目。删除确认解释留存/恢复边界并链接回收站；不承诺恢复旧凭据。
- **验收**：可恢复、过期但尚未清理、已清理/不存在、非OWNER、跨租户、重复/并发恢复、结果未知后重新读取、账号切换及旧凭据不复活。时间语义按服务端合同，不在客户端自行将30天解释为本地日历月。
- **片前验证选择**：前端新增回收站读/恢复写及删除确认，复用现有项目列表，不变更后端生命周期。先验API路径与组件确认/重复点击/不可恢复/结果未知/身份旧响应；跑项目创建防重入回归和类型检查，再跑既有真实`ProjectRecoveryLifecycleTests`（含权限、时间与旧代次），并补真实浏览器无选中项目的恢复闭环。无共享后端机制变更，不需全后端或全E2E；浏览器暴露当前项目先删除后切出导致旧令牌20020/退登录，新增项目删除顺序低层回归；保持后端代次拒绝不变，改为确认后先取得账号作用域再删除。若生命周期用例失败则下沉修复、重评。
- **011-A回执**：2026-10-06，候选`master / e71ef5a6`加本片代码/测试/回执；macOS Node26.7.0/pnpm11.22.0。后端使用当前reactor真实隔离PG验证，页面使用专用Vite3016及既有开发后端8080、独立测试租户，不认领后端运行实例冻结或隔离栈资格。

| 变更及验证 | 实际结果与证据 |
| --- | --- |
| 回收站闭环 | 项目列表提供不依赖选中项目的回收站；显示删除时间、服务端恢复截止与资格，明确时间为浏览器本地、项目时区另列；确认恢复、禁用过期、读取失败不伪装空集，结果未知重新读取两个目录，切身份丢弃旧确认/请求 |
| 删除缺陷修复 | 删除提示更新；当前项目删除前先取得账号作用域，避免删除后旧代次20020导致退登录。删除后强制重载当前项目列表，避免相同hash地址只导航锚点而留下旧目录；服务端代次校验不改变 |
| 低层反例及回归 | 删除顺序反例原实现1失败/1通过，`logs/011-a-delete-red.log`；修复后`pnpm test tests/projectRecycleBin.test.ts tests/projectRecycleBinApi.test.ts tests/projectCreateRepeatSubmit.test.ts --maxWorkers=2`：11项通过，`logs/011-a-unit-final.log`；包括确认/双击/取消/不可恢复/未知写结果/旧身份与旧响应 |
| 后端真实合同 | `./mvnw -pl things-cloud-bootstrap -am -Dtest=ProjectRecoveryLifecycleTests -Dsurefire.failIfNoSpecifiedTests=false test`：15项恢复生命周期场景通过，当前源码reactor加真实独立PG；期限含720小时/夏令时/锁等待，权限/跨租户/不存在、重复/并发恢复、原凭据能力不复活；`logs/011-a-backend.log` |
| 类型与静态 | 首次测试桩触发ElementPlus重载类型交叉推断错误，保留`logs/011-a-typecheck.log`、`logs/011-a-typecheck-recheck.log`；修正mock定义后`pnpm typecheck`及改动文件ESLint通过，`logs/011-a-typecheck-fixed.log`、`logs/011-a-lint-final.log` |
| 浏览器首败与修复 | 前两次定位器失败记录`logs/011-a-browser.log`、`logs/011-a-browser-recheck.log`；第三次确认删除后退登录，第四次DELETE204但相同hash不重载导致目录残留，分别`logs/011-a-browser-final.log`、`logs/011-a-browser-fixed.log`；各次trace/截图/视频已保存`logs/011-a-browser-first-failure`至`fourth-failure` |
| 浏览器复验 | `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers E2E_BASE_URL=http://localhost:3016 E2E_OWNER_EMAIL=e2e-003c@example.com pnpm exec playwright test project-recycle-bin.spec.ts`：1项真实生命周期通过，删除当前项目→账号作用域→回收站→确认恢复→两个目录刷新→重新进入；`logs/011-a-browser-complete.log` |
| 文档与差异 | 完整文档门禁与Java一致性按本片最终候选运行并保存`logs/011-a-docs.log`；最终回执结构和`git diff --check`同片核对 |

本片不修改Java/迁移/菜单，不需全后端或完整E2E。无项目入口、实际恢复、时间/并发/资格分别由页面与真实生命周期测试覆盖；MQTT/硬件、Windows、Node22、远端CI、公司服务器/部署及正式交付均NOTRUN。每片代码、测试和回执一起本地提交，不推送；提交号由Git定位本条变更。

## TODO-012 删除项目留存导出

- **编号/工作包**：~~CONSOLE-TODO-012~~ / ~~WP-02~~ — 已完成并验证现行合同的本地软件范围。
- **状态**：~~012-A~~已完成并验证；回收站申请、固定任务轮询、刷新找回及显式签发下载闭环已接入。当前套餐启用存储上限时仍按ADR0075拒绝新任务，不认领统一对象计量交付。
- **代码事实**：[导出Controller](../../../things-link/things-link-export/src/main/java/com/things/link/export/api/controller/ProjectExportController.java)及[留存导出面板](../src/components/ProjectRetentionExport.vue)已提供申请、状态、最新任务找回及显式下载。
- **合同**：[ADR0075](../../../.private/thingslink-docs/docs/adr/0075-project-export-snapshot-and-private-object-delivery.md)、[ADR0162](../../../.private/thingslink-docs/docs/adr/0162-plan-history-window-and-retention-export.md)。
- **接口**：`POST /api/v1/projects/{projectId}/exports`、`GET /api/v1/projects/{projectId}/exports/latest`（本片新增）、`GET /api/v1/projects/{projectId}/exports/{exportId}`、`POST /api/v1/projects/{projectId}/exports/{exportId}/download-url`。
- **012-A交付**：回收站内申请删除冻结项目的留存包，显示异步状态、错误与可用下载操作；仅在明确点击后重新确权获取短时地址。任务追踪按服务端已有能力实现，开片确认刷新后恢复任务的合同，不假设存在导出任务列表。
- **边界**：仅严格删除窗口内符合资格的项目；不是日常遥测CSV导出。不能扩大白名单数据范围、绕过限流、公开存储桶，不能长存下载URL。
- **验收**：真实worker与私有对象存储下生成并下载可核对的留存包；未完成/失败、重复申请、过期地址、恢复或删除代次变化、OWNER变化及跨项目访问拒绝；离开页面或切换身份停止旧轮询并丢弃旧响应。
- **片前决策/验证选择**：现有按ID读取不足以找回已完成且页面内存丢失的任务，选择新增`GET .../exports/latest`：只查当前有效OWNER、本删除代次、本人请求的最新一条，含终态，无任务返回204；读取不创建任务、不消费申请限流、不返回对象键/URL。对比只在sessionStorage保存ID方案，后者无法覆盖丢响应或重登/换设备，不采纳；不扩成全任务目录。新增受限SQL函数迁移复用现有队列索引，保持RLS及原下载原请求者资格。
- **预计传播与验证**：涉及export仓储/应用/HTTP/迁移、生成OpenAPI/双端类型与Console回收站。先验服务/组件，跑受影响export模块、真实PG/MinIO导出与下载生命周期、新旧库迁移及OpenAPI守卫，再以最终候选后端+私有存储浏览器申请/刷新恢复/下载验ZIP；读写、代次、轮询/身份退出及未知响应分别覆盖，不需计量/事务基础设施全平台回归。
- **012-A回执**：2026-10-06，候选`master / 7b145eb0`加本片后端/迁移/生成合同/页面及测试；macOS Node26.7.0/pnpm11.22.0/Chromium1234。独立TimescaleDB容器`tc-console-012a-pg`、端口5547、数据库`tc_console_012a_1791302473025009000`，专用后端8088及Vite3017；Redis DB14未flush，关闭Kafka监听、ingress handoff、outbox publisher及通知重试，未参与共享MQTT生命周期配置。私有MinIO共享实例仅使用独立租户随机对象路径，不改桶策略、不清共享数据。运行JAR SHA256为`78477c12ce324dcd744fe83b90abc956f34d7bb7e36f5d24d2227c0722e22727`。

| 实际变更/验证 | 结果、命令及证据 |
| --- | --- |
| 后端找回合同 | 新增只读latest GET，当前有效OWNER、本代次、原请求者的一条任务含终态/无任务204；请求时间与ID倒序，复用既有索引；追加`V20261006_0900`受限函数，仅APP角色执行，不授权表读取。现行申请限流、下载重新确权、私有桶及对象清理均保持 |
| 页面闭环 | 回收站展开单项目面板；QUEUED/RUNNING按固定ID每5秒GET，终态/读取失败停止；明确POST失败展示原因，网络未知先GET找回不自动再申请；关闭/身份变化清任务和轮询，旧响应与短时URL不得回填；URL仅本次点击使用，不落浏览器持久存储/页面正文 |
| 模块及真实依赖 | `./mvnw -pl things-cloud-export -am '-Dtest=ProjectExport*Tests' -Dsurefire.failIfNoSpecifiedTests=false test`覆盖该模块全部3类14项，PASS；`./mvnw -pl things-cloud-bootstrap -am -Dtest=ProjectExportLifecycleTests,ProjectExportDownloadLifecycleTests,ProjectExportObjectStorageTests -Dsurefire.failIfNoSpecifiedTests=false test`真实PG/MinIO26项PASS，含原请求者/代次过滤、无读副作用、OWNER/窗口/跨租户及下载边界；`logs/012-a-export-module-recheck.log`、`logs/012-a-backend-real-recheck.log` |
| 迁移新库/升级/权限 | 真实测试新库PASS；`python3 scripts/check-flyway-migrations.py` PASS。独立数据库先按`SPRING_FLYWAY_TARGET=20261005.0110`启动同一JAR，确认latest函数不存在；停止仅本片实例，取消target重启，新增迁移20261006.0900成功且health UP；确认函数ACL无PUBLIC、APP不是superuser/bypassrls；`logs/012-a-upgrade-old.log`、`logs/012-a-upgrade-new.log`、`logs/012-a-flyway-preflight.log` |
| 生成契约 | 唯一生成命令`python3 scripts/generate-openapi-contracts.py` PASS，68项OpenAPI守卫通过；新增入口写入独立结构冻结矩阵，200显式任务schema、204无正文，Console/WebApp类型同步。源输入摘要`b0dd862cb62b528fbb460b0d1ac3d70d4f23c4804f83f41b384c3be9fc96ce95`，OpenAPI SHA256 `6abe06156648b4d5869af11d11cc373c672463fd2dc21aec35f100f841e1da61`；`logs/012-a-openapi-publish.log` |
| 页面反例/静态 | `pnpm test tests/projectRetentionExport.test.ts tests/projectRecycleBin.test.ts --maxWorkers=2`18项PASS：204/读取失败、未知写、确定失败50019、双击、终态停轮询、换身份旧能力拒绝、跨项目旧结果、关闭停止；类型、改动ESLint、生产构建及`pnpm api:check`PASS，完整lint仅既有unused-disable警告；`logs/012-a-ui-unit-final.log`、`logs/012-a-typecheck-final.log`、`logs/012-a-lint-final.log`、`logs/012-a-build-final.log`、`logs/012-a-api-check.log` |
| 真实浏览器 | 专用`project-retention-export.spec.ts`两项：历史兼容夹具实际删除→申请→worker生成→刷新同任务（POST仍一次、签发零次）→显式签发→真实ZIP下载大小/摘要及manifest+七个数据集核对；当前PRO套餐实际50019、无任务、无自动重试、无下载入口。展开命令见下，`logs/012-a-browser-final.log`及`logs/012-a-browser-final/`；不以页面mock认领资格 |
| 首败及修复 | 模块测试构造器与HTTP token的long实参编译错误已修正，首败`012-a-export-module.log`/`012-a-backend-real.log`；生成首败保留`012-a-openapi.log`至`-matrix.log`，先补独立矩阵再修200空schema。共享PG多数据库尝试撞历史集群角色，转独立容器，未改历史迁移。浏览器PRO50019、FREE新增项目上限50020及legacy无订阅创建50047均保留独立日志/trace，未关闭限额；最终只使用既有独立历史项目经真实恢复/再次删除建立新代次，正常套餐拒绝另验 |
| 文档/差异 | 完整`pwsh scripts/docs-verify.ps1`及`git diff --check`按最终回执执行，证据`logs/012-a-docs.log`；同片本地提交，不推送，提交号由Git定位此条变更 |

浏览器复验从Console目录执行：

```sh
PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers E2E_BASE_URL=http://localhost:3017 \
 E2E_OWNER_EMAIL=e2e-012a-legacy@example.com \
 E2E_RETENTION_EXPORT_PROJECT_NAME=留存历史夹具 \
 E2E_RETENTION_EXPORT_QUOTA_EMAIL=e2e-012a@example.com \
 E2E_RUN_DIR=logs/012-a-browser-final pnpm exec playwright test project-retention-export.spec.ts
```

复现前先构建当前Bootstrap JAR，专用后端使用该独立DB/Flyway地址、Redis DB14及上述关闭开关，MinIO密钥仍从本地环境读取；`VITE_API_PROXY_URL=http://localhost:8088`启动3017。夹具工具新增显式`TC_CONSOLE_FIXTURE_DATABASE`/`TC_CONSOLE_FIXTURE_POSTGRES_CONTAINER`（未设置默认路径不变，`bash -n`与真实建号通过）：分别以`--plan-code PROFESSIONAL`和仅测试用`--legacy-runtime-baseline`创建两个全新隔离租户，不修改任何既有套餐/策略；legacy仅验证ADR0075未启用对象上限的历史合同，项目使用工具预置ID，不通过缺订阅的创建入口伪造正常套餐资格。默认浏览器矩阵缺这两项专用环境时分别SKIP，不能继承专项通过。

**剩余限制**：当前所有PLAN_R1套餐均配置非NULL存储上限，统一对象账本未交付时新留存导出50019是现行明确拒绝边界；成功ZIP仅验证历史兼容夹具，不代表正常套餐已能导出，不切换许可或删除计量。跨域对象计量仍按[ADR0075决策6](../../../.private/thingslink-docs/docs/adr/0075-project-export-snapshot-and-private-object-delivery.md#决策6存储额度与失败边界)及既有平台债务另案，未因页面关闭而划完成线。生产工具链Node22、完整Console整合、默认浏览器矩阵、Windows、远端CI、公司服务器、MQTT/硬件、正式交付均NOTRUN；局部本地软件通过不关闭G3。


## TODO-013 项目终端用户管理

- **编号/工作包**：~~CONSOLE-TODO-013~~ / ~~WP-03~~ — 已完成并验证本地软件范围。
- **状态**：~~013-A~~、~~013-B~~、~~013-C~~及当前候选组内整合均已完成并验证本地软件范围；完整默认矩阵与严格TLS旅程3/6/7结果见本节最终回执。
- **代码事实**：[项目终端用户页](../src/views/project/end-users/index.vue)已提供目录、预置、精确找回及角色管理；[设备用户面板](../src/views/device/components/DeviceEndUsers.vue)仅查询当前有效关联；[看板授权API](../src/api/dashboard-grants.ts)已有单看板授权，013-B已接入用户设备关系；013-C已接入管理者专属用户授权目录与固定用户单看板授权复用。
- **接口族**：`/api/v1/projects/{projectId}/end-users` 的GET/POST、本片新增`/lookup?username=`的GET、`/{appUserId}/role`的POST/PATCH、`/{appUserId}/suspend`及`/restore`的POST、`/{appUserId}/devices`的GET、`/{appUserId}/devices/{deviceId}`的DELETE、`/device-claim-tokens`的POST；`/{appUserId}/dashboard-grants`目录及现有单看板GET/PUT。精确结构以OpenAPI和Controller为准。
- **~~013-A交付~~** — 已完成并验证本地范围：项目用户目录、预置账号、分配/修改项目角色、停用/恢复；明确预置只创建租户身份，不自动分配项目角色。Console成员与终端用户不能混用菜单、字段或权限。
- **~~013-B交付~~** — 已完成并验证本地范围：选定用户查看设备绑定并受权解绑，在设备上下文签发认领令牌；令牌短时展示，不写日志或持久浏览器存储。共享、转移的用户侧操作仍由App承担，不复制进管理端。
- **~~013-C交付~~** — 已完成并验证本地切片范围：用户维度授权目录，复用现有单看板授权组件/合同，展示ACTIVE/REVOKED等服务端事实；不把项目角色推导成全部设备或全部看板授权。
- **验收**：账号预置后未分配、角色分配冲突、停用/恢复只影响本项目、跨租户拒绝、设备解绑重复调用、已有PRIMARY设备拒绝认领签发、令牌过期；授权CAS/幂等及ARCHIVED写拒绝、四角色入口和服务端授权反例、分页与换身份清理。真实App认领只在隔离夹具补管理链验证，不宣称真实终端交付。
- **013-C片前决策/验证选择**：候选`master / 67c755f1`，开片清洁。用户授权目录GET只给OWNER/ADMIN，不沿用设备关系的四角色读权限；展示ACTIVE/REVOKED、字符串修订及时间，历史删除看板保留稳定ID。选择当前看板后复用单看板授权模型与CAS/原键恢复，不自行推导授权交集。ARCHIVED或账号/角色失效只读；换用户/身份清旧响应与确认。修正EndUserResponse合法空显示名及未分配角色的OpenAPI可空声明和共享组件校验，唯一生成双端类型。验证目录分页/失败/错误身份、固定用户复用与只读反例、真实授权HTTP/CAS/幂等及当前JAR浏览器目录闭环；组内完整验证另按矩阵实际登记。
- **013-B片前决策/验证选择**：候选`master / 4000cbdc`，开片清洁；后端设备关系数组GET、幂等DELETE与一次性认领签发POST合同已具备，暂不新增接口。用户详情列出当前项目ACTIVE/CLOSED关系并以服务端权限/持续写许可解绑；只读成员可查看。设备详情签发不等于指定用户绑定，秘密只在内存面板短时展示，关闭/身份变化/到期清除；丢响应不自动补签，不承诺隐藏秘密等于撤销令牌。先验组件/API反例，运行真实`DeviceClaimApiTests`及`AppClaimUnbindProjectLifecycleTests`，再以同一隔离后端浏览器签发→真实App登录/认领→用户关系目录→管理员解绑及重复读取验证；不涉及MQTT摄取、硬件或App正式交付。若发现资格/幂等缺陷则本片补后端及生成合同。
- **013-A片前决策**：候选`master / 88ffe385`，开片工作区清洁。增加独立项目终端用户菜单，四角色读、OWNER/ADMIN按`enduser:manage`管理，Console成员目录不复用。预置与分配保持两个显式操作；为找回无角色账号新增`GET .../end-users/lookup?username=`精确查找，只给项目OWNER/ADMIN，按项目持久归属建立RLS，返回非敏感身份与仅当前项目角色；缺失/其他租户60001，不提供租户全目录或模糊枚举。刷新/丢响应/重复用户名可显式查找后继续分配，不自动重发预置，不返回或回填密码。
- **013-A验证选择**：受影响enduser/iam完整模块及真实`EndUserManagementApiTests`、`EndUserRoleConcurrencyTests`、`EndUserIsolationIntegrationTests`、`EndUserQuotaIntegrationTests`；新增查找权限/跨项目/无角色/停用投影反例，菜单后端生成快照与前端四角色合同；唯一生成OpenAPI和双端类型。页面组件验证空集/失败、双击、未知写恢复、分页、身份旧响应和秘密清理；专用当前后端真实浏览器预置→刷新查找→分配→改角色→停用→恢复，不宣称终端硬件资格。
- **013-A回执**：2026-10-06，候选`master / 88ffe385`加本片受限查找/菜单/生成合同/页面及测试；macOS Node26.7.0/pnpm11.22.0/Chromium1234。本片后端JAR SHA256为`62d6c5e36bd984115522ea7940cb27950d4519753b2a77a6d87763f2d6a8f011`；复用012-A独立PG容器/DB及专用8088/3017，先停止仅本片拥有的旧JAR进程后启动新JAR。关闭的Kafka、handoff、outbox和通知重试开关保持，Redis DB14未flush；真实浏览器使用原独立PRO测试租户的活动项目，不更改套餐与额度策略。本片无数据库结构/迁移变更。

| 实际变更与验证 | 结果、命令及证据 |
| --- | --- |
| 后端恢复合同 | 新增EndUserLookupService及精确用户名GET，复验OWNER/ADMIN后按权威项目租户建立完整RLS，仅返回非敏感账号与本项目可空/停用角色；未知60001、只读成员60002、非成员50001；不新增全租户列表、权限点、账户锁定或密码回查 |
| 页面闭环 | 独立项目终端用户菜单；四角色目录与服务端权限点管理；游标前后页、账号与项目角色两类状态、未分配查找。预置和赋权分开确认；口令发出即清、作用域变化及卸载清除。写结果未知只GET读取事实、没有自动POST重试；关闭/身份代次变化拒绝旧响应及旧确认。项目状态未知/ARCHIVED时禁止写按钮，服务端持续写许可仍权威 |
| 模块完整测试 | `./mvnw -pl things-cloud-enduser,things-cloud-iam -am test -Dmenu.contract.write=true` PASS，受影响IAM256项、EndUser508项全部通过，依赖reactor亦通过；菜单快照由真实后端目录/角色过滤显式生成，`logs/013-a-modules.log` |
| 真实隔离HTTP/PG | `./mvnw -pl things-cloud-bootstrap -am -Dtest=EndUserManagementApiTests,EndUserRoleConcurrencyTests,EndUserIsolationIntegrationTests,EndUserQuotaIntegrationTests -Dsurefire.failIfNoSpecifiedTests=false test`50项PASS（22/13/6/9），包括预置未分配可找回、其他项目角色不泄露、停用状态返回、OPERATOR403/非成员404、无口令投影、唯一冲突、并发角色锁、两轴RLS/复合外键和套餐/缺投影拒绝；`logs/013-a-backend-real.log` |
| OpenAPI/双端类型 | `python3 scripts/generate-openapi-contracts.py`唯一生成，68项守卫PASS；独立结构矩阵新增lookup读取；输入摘要`9700b1be970b8c07aabde3b819afba185c1628f736ca43d6c901b1f0d87cf8b8`，OpenAPI SHA256 `a1c46598541f3b8d0cefe6abca87c5cf95d02ce93df51e16f8198385ef97bc9a`；`logs/013-a-openapi.log` |
| 页面/菜单反例 | `pnpm test tests/endUserManagement.test.ts tests/menuCatalogContract.test.ts --maxWorkers=2`39项PASS（17页场景、22跨语言菜单场景），覆盖四角色、空集/失败、重复点击、预置丢响应后明确查找、用户名冲突、分配与PATCH、未知写读取、停用/恢复、陈旧确认/响应、查找返回错身份拒绝、ARCHIVED拒绝及游标换项目；`logs/013-a-ui-complete.log` |
| 类型/静态/构建 | 类型、改动ESLint、生产构建、`pnpm api:check` PASS；首次API URL基函数推断为string且lookup尚未生成导致编译拒绝，采用字面量`as const`并生成合同修正，未用any绕过；`logs/013-a-typecheck.log`首败、`logs/013-a-typecheck-fixed.log`、`logs/013-a-build-complete.log`、`logs/013-a-api-check-final.log`、`logs/013-a-lint.log`、`logs/013-a-lint-complete.log` |
| 浏览器入口及闭环 | `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers E2E_BASE_URL=http://localhost:3017 E2E_OWNER_EMAIL=e2e-012a@example.com E2E_END_USER_PROJECT_NAME=留存夹具 E2E_RUN_DIR=logs/013-a-browser-complete pnpm exec playwright test end-user-management.spec.ts` 1项PASS：实际展开项目菜单→终端用户→预置→刷新丢内存→精确查找→明确分配→改角色→停用→恢复→目录同步，检查口令不进入本地/会话存储、URL及浏览器控制台；`logs/013-a-browser-complete.log`及对应证据目录 |
| 首败边界 | 单元首败1/37是断言误命中固定提示的“结果未知”，缩小到“预置结果未知”后通过，并补已有角色PATCH场景；`logs/013-a-ui-unit.log`、`logs/013-a-ui-unit-fixed.log`。浏览器首败是项目菜单未展开而查找子项，修正为真实展开及点击菜单，未改业务来放宽断言；首败`logs/013-a-browser.log`及`logs/013-a-browser-first/`全部保留 |
| 文档及差异 | 完整`pwsh scripts/docs-verify.ps1`和`git diff --check`按最终候选执行，`logs/013-a-docs.log`；同片本地提交，提交号以Git定位，不推送 |

恢复验证需当前本片JAR、相同隔离HTTP栈与明确PRO测试夹具；构建/启动覆盖及共享依赖关闭方式见012-A，不修改真实套餐或扩大用户额度。默认矩阵未配置`E2E_END_USER_PROJECT_NAME`时本专项SKIP，不能继承其通过。013-B/C、完整Console组内整合/默认E2E、真实App设备关系、MQTT/实物、Windows、Node22、远端CI、公司服务器和正式交付均NOTRUN；父WP-03与G3不关闭。


### 013-B设备绑定与认领回执

~~013-B~~ — 已完成并验证本地软件范围。2026-10-06，候选`master / 4000cbdc`加本片API消费者、两处页面入口、组件和浏览器场景；工具链与隔离PG/Redis/8088/3017/PRO夹具沿013-A，后端源码、数据库与生成合同均未改变，实际运行JAR仍为`62d6c5e36bd984115522ea7940cb27950d4519753b2a77a6d87763f2d6a8f011`。不改套餐、额度或App身份门禁。

| 实际范围/验证 | 结果与证据 |
| --- | --- |
| 用户设备关系 | 用户目录管理者/只读成员均可选择用户查看当前项目关系；完整展示服务端数组中的PRIMARY/MEMBER/READ_ONLY及ACTIVE/CLOSED，不推导用户有全部设备权限，不将空数组推断为账号不存在。OWNER/ADMIN在ACTIVE项目明确确认后幂等DELETE关闭关系，重新GET；结果未知不重复DELETE，权限/身份变化拒绝旧确认及响应 |
| 设备认领令牌 | 设备详情终端用户页签受权签发，已知PRIMARY时禁用但服务端仍最终核验；项目状态未知/ARCHIVED禁用。明确说明不是指定用户绑定，明文仅内存一次响应，隐藏口令框、关闭/身份/设备变化/卸载/返回到期后清除，展示关闭不意味着服务端撤销；未知响应不自动补签，不虚构回查或撤销API |
| 真实后端 | `./mvnw -pl things-cloud-bootstrap -am -Dtest=DeviceClaimApiTests,AppClaimUnbindProjectLifecycleTests -Dsurefire.failIfNoSpecifiedTests=false test`40项PASS（22认领/解绑/转移/共享及18项目生命周期），真实PG/Redis覆盖主控存在、一次性消费/过期、角色/账号/项目状态、跨项目、幂等及旧代次反例；`logs/013-b-backend-real.log` |
| 页面反例/回归 | `pnpm test tests/endUserDevices.test.ts tests/deviceClaimToken.test.ts tests/endUserManagement.test.ts tests/deviceEndUsers.test.ts --maxWorkers=2`41项PASS；确认/双击/取消、闭合历史、只读、未知写/签发、权限改变、旧身份/用户/设备响应、错误关系及到期秘密清除、A与原设备用户页回归；`logs/013-b-ui-unit.log` |
| 类型/静态/构建/合同 | `pnpm typecheck`、改动文件及spec ESLint、`pnpm build`、`pnpm api:check`PASS，消费已有生成类型和路径，无手写DTO或再次生成未变合同；`logs/013-b-typecheck-final.log`、`logs/013-b-lint.log`、`logs/013-b-browser-lint.log`、`logs/013-b-build.log`、`logs/013-b-api-check.log` |
| 真实浏览器及App链 | `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers E2E_BASE_URL=http://localhost:3017 E2E_OWNER_EMAIL=e2e-012a@example.com E2E_END_USER_PROJECT_NAME=留存夹具 E2E_RUN_DIR=logs/013-b-browser-recheck pnpm exec playwright test end-user-devices.spec.ts`1项PASS：真实创建发布类型/设备/预置并赋App角色→设备页签签发→真实App登录与一次性认领→当前设备用户显示主控且签发禁用→用户关系PRIMARY/ACTIVE→管理员解绑CLOSED→第二次DELETE仍成功→实际App设备访问404/60010；检查能力不落本地/会话存储与Console日志；`logs/013-b-browser-recheck.log`及对应trace目录 |
| 首败边界 | 浏览器夹具类型键误用连字符，被现行`[a-z][a-z0-9_]*`验证400拒绝，首败`logs/013-b-browser.log`、`logs/013-b-browser-first/`保留；修正为下划线类型键后复验，不改类型合同放宽校验 |
| 文档/提交 | 完整文档门禁及`git diff --check`按最终回执执行，`logs/013-b-docs.log`；本片源码、测试和回执同次本地提交，提交号由Git定位，不推送 |

浏览器复现要求013-A说明的隔离HTTP栈、活动PRO测试项目与真实私有后端；无需EMQX/Kafka摄取也不修改其冻结配置。App调用只是受控HTTP夹具，不持久化App JWT，不构成真实App终端、设备上报或硬件资格。默认浏览器缺`E2E_END_USER_PROJECT_NAME`时本专项SKIP；013-C、完整Console组内整合/默认矩阵、Node22、Windows、远端CI、公司服务器及正式交付均NOTRUN；WP-03/G3保持未关闭。

### 013-C用户授权目录回执

~~013-C~~ — 已完成并验证本地切片范围，组内默认矩阵待补证。2026-10-06，候选`master / 67c755f1`加本片可空合同、生成类型、共享授权组件、用户目录及整合修复。首轮后端JAR SHA256为`300c4f1ce55f1da6ed8274606b6fde796b2db6bad2663910188428da2db562a6`，最终文档门禁同源码构建为`cb2732b740581ab10ba153888dfa336409dfaac2a889a86a895c4465109e9a68`，复制到忽略目录冻结并登记真实当前WebApp宿主后，仅停止本人持有的8088旧进程替换；独立PG、Redis DB14、3017及关闭Kafka/handoff/outbox/通知重试的运行边界沿013-A，不改变共享MQTT、套餐或额度。macOS Node26.7.0/pnpm11.22.0/Chromium1234；无迁移变更。

| 实际范围/验证 | 结果与证据 |
| --- | --- |
| 用户授权目录 | OWNER/ADMIN权限点才展示/读取；20项不透明游标前后页与刷新，ACTIVE/REVOKED、READ、字符串Long修订及三类时间，历史看板按稳定ID识别。失败不伪装为空，错用户/错误合同/重复及循环游标拒绝展示；换用户/项目/身份或权限清旧响应与目标 |
| 复用授权合同 | 从当前看板目录或历史授权选定看板；复用DesignerGrants及原CAS/固定key恢复模型，固定当前用户而不扫描/选择其他用户。ARCHIVED与未知项目状态禁止写/重试，停用账号/角色只读历史；不推导设备授权或完整App运行资格。成功读取最新事实后刷新用户目录 |
| 后端/生成修复 | EndUserResponse的displayName、role、roleStatus、assignedAt实际可空，与OpenAPI一致声明；共享模型接受合法空显示名并回退用户名。`python3 scripts/generate-openapi-contracts.py`唯一生成，69项守卫PASS；输入摘要`fb27c9523daf6079934e308f6176c65252cdd9bf4c2f7bfe5dcd14ba011f716f`，OpenAPI SHA256 `c67d8bfef8a26bc5e54310d2793e8fbaa9cfb53a4f6b0b7b43fbdf4a6106e5a4`；双端类型同步，WebApp当前无EndUserResponse直接消费者，`logs/013-c-openapi.log` |
| 完整模块/真实依赖 | `./mvnw -pl things-cloud-enduser -am test` EndUser508项及依赖reactor PASS；真实`AppUserDashboardGrantApiTests,AppUserDashboardGrantPersistenceTests,EndUserManagementApiTests`78项PASS（27/29/22），覆盖四角色/跨租户、两轴RLS、归档写拒绝、历史删除看板、双状态分页、CAS溢出/竞争、事务审计回滚、同键/异正文/在途幂等与未分配空投影；`logs/013-c-enduser-module.log`、`logs/013-c-backend-real.log` |
| 组件及整合修复 | 相关7文件96项先通过；浏览器随后暴露同用户角色回读先卸载详情导致授权目标/未知意图丢失，改为保留面板、busy禁写，事实回读失败才清资格。新增延迟回读/组件身份/写禁用回归，角色变化保留原未知意图、禁止重试、可GET事实；43项受影响页/目录/弹窗复验PASS；`logs/013-c-ui-unit-final.log`、`logs/013-c-parent-final.log` |
| 全量整合前置 | 全量测试初败2项：011-A删除恢复文案仍有旧“不能恢复”断言，013-A菜单快照未登记终端用户；按当前合同更新。第一次复验131文件/1326项PASS；最终角色回读修复后全量测试与共享合同构建并发产生导入缺失及测试超时，判定无效组合首败并保留；构建完成后31项失败文件独立复验PASS，再串行全量131文件/1327项PASS；最终构建/API一致性/全量lint（0错误、1条既有unused-disable警告）/stylelint亦PASS。实际日志`logs/013-c-full-unit-serial.log`、`013-c-build-complete.log`、`013-c-lint-complete.log`、`013-c-stylelint-complete.log`、`013-c-api-check-final.log`。lint曾误扫logs内Playwright报告而由本人终止，新增生成证据忽略，实测报告ignored=true/生产组件false；Stylelint另发现前两片两处属性排序，修正后通过。全部首败日志保留，不删除原始trace |
| 专用真实浏览器 | `PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers E2E_BASE_URL=http://localhost:3017 E2E_OWNER_EMAIL=e2e-012a@example.com E2E_END_USER_PROJECT_NAME=留存夹具 E2E_RUN_DIR=logs/013-c-browser-recheck pnpm exec playwright test end-user-dashboard-grants.spec.ts`1项PASS：真实预置空显示名→赋角色→当前看板目录→固定用户首次授予→ACTIVE/revision1目录→撤销→REVOKED/revision2→停用后历史仍可读、双写按钮禁用。首败确认为上述详情卸载缺陷，`logs/013-c-browser.log`与`logs/013-c-browser-first/`保留；复验`logs/013-c-browser-recheck.log`及证据目录 |
| 文档及差异 | 完整`pwsh scripts/docs-verify.ps1` PASS（含Java一致性）；最终回执`pwsh scripts/docs-verify.ps1 -SkipMaven`及`git diff --check` PASS，`logs/013-c-docs-preflight.log`、`013-c-docs-final.log`；本地提交，不推送，提交号以Git定位 |

既有看板授权专场以最终冻结JAR追加复验，须精确设置`E2E_PROJECT_KEY`为专用活动项目公开标识并使用`E2E_RUN_DIR=logs/013-c-existing-grant pnpm exec playwright test dashboard-grants.spec.ts`，首败因隔离后端未登记宿主，发布按现行合同503/60041拒绝；构建并显式登记真实WebApp制品后追加组内选场，第一次又缺专用项目标识，记录为夹具前置失败，补精确项目键后复验；最终冻结候选下4项全部PASS（既有READ授权/真实App可见性/CAS/原键恢复、013-C用户目录、013-B认领解绑、013-A账号角色），`logs/013-c-group-browser-recheck.log`及对应证据目录；默认`E2E_END_USER_PROJECT_NAME`未设置时保留原E2E项目路径。完整默认矩阵尚未取得当前候选独立栈资格：早前标准Runner的EMQX生命周期配置预检拒绝当前默认header展开，未知配置未覆盖；本片HTTP隔离栈未参加共享MQTT回调或Kafka摄取，不据此认领MQTT矩阵。父WP-03和G3保持未关闭，待Console最终整合补齐环境资格及默认矩阵；按统一顺序继续不依赖该运行前置的014-A。Node22、Windows、远端CI、公司服务器、真实App终端/硬件与正式交付均NOTRUN。

### WP-03 当前候选完整矩阵补证

运行环境现状（2026-10-10）：负责人明确要求清理不再测试的tc-console容器。核对owner=console-wp03、专用端口无客户端连接、
PG无外部会话及8090/3019/8092/4018无测试服务监听后，已停止并删除tc-console-wp03-pg/redis/kafka/emqx/minio五个容器。
日常thingscloud五容器、既有数据卷/镜像、宿主配置和历史验收日志保留。PG原数据位于容器层，删除前以pg_dumpall -U thingscloud压缩导出，
备份及容器挂载清单保存在本工程忽略目录logs/wp03-retirement/（备份0600）；导出及gzip完整性检查通过，TimescaleDB循环外键警告保留为恢复限制，未演练恢复。
下述历史通过结论仍仅对应原候选；旧容器ID、PID和数据库OID不得继续用于运行守卫，后续重跑需按原夹具重建独占栈并重新绑定、验证身份。
本次为运行资源清理，无业务源码修改或新功能验收；清理时未提交或推送。负责人随后授权暂停App开发并提交、推送全部平台master提交，本清理记录随本次文档收口交付。

本片补E2E夹具、守卫及真实预览调度时间边界：`database-fixture.ts`统一三处SQL消费者，独占模式检查整份公开材料SHA、容器全ID/镜像/owner标签/loopback映射、数据库用户名与OID，并在同连接执行SQL前围栏；缺项、字符串OID或漂移拒绝，不回退共享数据库。`mqtt-runtime.ts`统一当前值与旅程3/6/7，独占模式绑定本轮CA/摘要、58884严格TLS和8092模拟器，拒绝明文端口或错误范围；显式TLS的既有专场保持。`owned-runtime-setup.ts`只在显式owned模式启用，浏览器启动前核HEAD、初始5305份（最终见回执）源快照、冻结JAR/配置/真实宿主、后端/两端Vite/模拟器PID及命令/工作目录/监听、四基础容器和实际PG查询；Node/pnpm符号链接按真实路径比较，未知固定错误。原CI/legacy路径保持，owned自动trace/video/screenshot关闭，已有显式公开截图仍可能生成，不称全局无图片。私有JWT/口令/对象key只在RAM或0600忽略材料，不随Git交付。

复现须先按下文端口配置建立本人真实栈、352迁移完整参考模板与正常套餐/受控身份供给，填Console `logs/`内公开运行材料及SHA、全部源快照/JAR/配置/宿主与实际进程身份；不能只复制旧PID或旧候选材料。Console工作目录设置`E2E_OWNED_RUNTIME=<绝对公开材料路径>`、`E2E_OWNED_RUNTIME_SHA256=<整份实际SHA256>`、`E2E_BASE_URL=http://127.0.0.1:3019`、`CONTRACT_BASE_URL=http://127.0.0.1:8090`、`E2E_PG_CONTAINER=tc-console-wp03-pg`、`E2E_PG_USER=thingscloud`及下文真实DB，OWNER/MEMBER/FREE套餐/SHC独立账号按受控供给配置，`E2E_END_USER_PROJECT_NAME=E2E项目`和`E2E_PROJECT_KEY=<该当前项目实际公开键>`，`EMQX_MQTT_PORT=58884`、`E2E_WEBAPP_PORT=4018`、`E2E_SIMULATOR_BASE_URL=http://127.0.0.1:8092`、`E2E_SIMULATOR_BROKER_URI=ssl://localhost:58884`及锁定Chromium缓存；另正常供给wp03-inbox-owner@example.com（PRO/E2E项目）和wp03-inbox-member@example.com（PRO/成员项目），配置`E2E_ALARM_INBOX_OWNER_EMAIL/OWNER_PASSWORD/OWNER_PROJECT_KEY`与`E2E_ALARM_INBOX_MEMBER_EMAIL/MEMBER_PASSWORD/MEMBER_PROJECT_KEY`（六变量各自均带共同`E2E_ALARM_INBOX_`前缀；key为各当前独立项目真实公开键），两身份和项目不能复用普通矩阵OWNER/MEMBER，预置项目告警须为空；清除其他片专项资格环境，不通过添加跳过项过测。实际命令为`pnpm exec playwright test --workers=1 --max-failures=1 --grep-invert @simulator`、三文件分别及组合`pnpm exec playwright test --workers=1 --max-failures=1 journey-3.spec.ts journey-6.spec.ts journey-7.spec.ts`；每轮指定独立`E2E_RUN_DIR=logs/<本轮唯一目录>`，首败即停止，修复后整份重新执行，不拼接PASS。

2026-10-06，`master / 9f51c9fd`加本片测试设施；010-C已独立九场通过并本地提交、不推送，随后补WP-03父项缺证。默认收集整个e2e目录，仅排除@simulator标签，不能以013三专场或正式六文件矩阵代替。三默认数据库消费者仍硬编码共享tc-postgres、旧Runner会重启共享EMQX/清Redis，故本片显式owned材料守卫并保留legacy CI路径；root直接启动四独占容器和同候选服务，不运行旧Runner。新PG5549完整352项迁移，在零账号业务时停止本人服务并冻结完整参考种子模板；Redis56390/DB0、API8090、Vite3019、WebApp4018、Broker51884/TLS58884/admin58084、Kafka59093/admin59645及Simulator8092全为本人新栈。Kafka25主题/228分区按生产配置创建，普通thingscloud_app两池/RLS不变、真实Redis订阅DB0核对，TLS新CA及主机名校验、认证/ACL cache关闭，durable v2 handoff实际已连接。OWNER/MEMBER正常模拟PRO供给、FREE套餐及三SHC受控账号/真实管理员函数授权均已准备；不认领真实邮件验证、付款或客户审核。

保留准备首败：PG readiness首轮命中镜像临时初始化socket，createdb已成功但紧接OID查询遇关闭；等待实际最终服务后仅恢复公开ID核对，不重复建库/删除旧事实。后端首次callback-secret错误层级导致真实MQTT拒绝，按实际配置修为broker-callback.secret并仅终止本人PID后重启，未停共享Broker。WebApp首次register相对路径明确拒绝，改绝对专用registry后真实登记本轮1.0.0；旧017宿主保留。证据`logs/wp03-prepare*.log`、`wp03-backend-*-start.log`、`wp03-host-register*.log`、`wp03-runtime-readiness.json`及公开`wp03-runtime.json`，私有材料仅0600忽略目录。owned数据库35项、严格TLS/端口25项（含既有TLS反例）及整栈守卫23项专项通过；完整Console164文件2065项/29.92s、生产构建Vite14.76s含vue-tsc、Stylelint及双端api:check通过。唯一OpenAPI生成72项/56.647s通过，输入a7c5e9b7187c0c3f6fd7d25bfc774373632a5ee9f1f24d6fbcf9f01e5b1123eb，HTTP/双端类型字节未变。完整ESLint首轮118个ElMessage/ElMessageBox no-undef是开发懒加载自动导入JSON未扫描全站，实际生产构建补全后零错误、1条既有未使用disable警告；没有关闭规则或手工扩大全局。整栈守卫首尝试tsx -e为CJS加载不匹配共享包仅import导出，改忽略目录ESM入口；随后真正守卫在真实PG身份处拒绝，SQL json_build_object的OID自然为字符串，修只读query oid::bigint保持严格数字比较，再补负例和实机复验。原首败日志保留，不将unit模拟当实机通过；OID修后36项专项与最终164文件2066项/27.04s通过，完整ESLint零错误/1条既有警告。绑定5305份源文件的独立完整快照（1007963字节）和18份关键源摘要，实际整个运行守卫及真实API契约9项/1.15s通过。额外Python3.14严格TLS探针拒绝原测试CA缺Key Usage，保留原证书/信任库并仅停止本人服务与Broker，补CA的critical keyCertSign/cRLSign及leaf用量/CA:false，再以同CA-only信任库恢复本人后端/Simulator；没有关闭strict/hostname验证。实际Broker CLI核auth/ACL两缓存关闭和deny，API核8090两回调及durable v2，严格TLS1.3/主机名/实际peer DER摘要匹配通过，记录wp03-broker-readiness.json；首次错误GET config路由404及listener响应不含running属于准备探针误用，修到实际CLI/API闭集并由真实TLS握手证明listener运行。新actual-guard-tls-final.log通过后，默认无文件筛选Playwright已启动（--workers=1 --max-failures=1 --grep-invert @simulator），收集57文件69项；首次默认矩阵1项PASS、10项条件SKIP，第12项应用发布真实POST返回503/60041而失败、其余57项NOTRUN（`logs/wp03-default-first.log`、`logs/wp03-default-final/`）。根因为本人忽略启动配置误用host-registry.directory，实际适配器要求dashboard.host.registry-directory；仅修运行配置，不修改spec或放宽后端合同。保留首轮DB与报告，以零业务完整迁移模板创建新库tc_console_wp03_1791331618013741000/OID29509；未删除旧数据、未flush Redis。正常OWNER登录取得的项目ID与新PG一致，更新进程/配置身份后守卫PASS；另外补精确Console/App WebSocket Origin白名单，已有下行管理API临时凭据继续使用独占58084。相同源码/冻结JAR在新环境实际契约9项/1.07s PASS（`logs/wp03-contracts-qualified.log`），第二次整个默认矩阵使用独立`logs/wp03-default-qualified/`证据目录。第二轮14项PASS/16项条件SKIP，第31项OTA整合真实对象上传返回固件存储暂不可用而FAIL、38项NOTRUN（`logs/wp03-default-qualified.log`、对应目录）；此前仅合成存储key不满足无条件默认固件上传前置。新增本人MinIO59001/59002、独立随机凭据及私有版本化tc-console-wp03-ota桶，实际容器ID/镜像/loopback与桶策略核对留`wp03-storage-readiness.json`，未读写共享9000；这是运行材料补齐，未修改API或用例/增加SKIP。保留第二轮DB与报告，另从零业务352迁移模板创建tc_console_wp03_1791332240916477000/OID29580；正常OWNER项目ID再次与PG相同，冻结JAR/全部源码未变、守卫和新环境实际契约9项再次PASS。第三轮整个默认矩阵独立使用`logs/wp03-default-storage-qualified/`。第三轮OTA整合与固件私有上传两场已PASS；随后告警收件箱第45场准备守卫拒绝已有跨账号成员（此前真实应用/授权测试已给普通MEMBER加入OWNER项目），22项PASS/22项条件SKIP、24项NOTRUN（`logs/wp03-default-storage-qualified.log`、对应目录）。保留拒绝，不删除/覆盖/借用旧关系；通知22项计数也不能混入该共享本轮项目之前的真实告警，故调整owned夹具使用正常供给的专用通知双账号和独立项目公开key，legacy路径不变、缺专用身份拒绝而不回退。本次不是数据库身份漂移，真实owned SQL守卫已准确读取当前DB并及时阻止污染。通知专用配置helper的18项反例及原数据库36项共54项PASS，四文件ESLint/最小TS/Prettier均PASS（`wp03-alarm-inbox-unit-first.log`、`-lint-first.log`、`-typecheck-first.log`）。最终源码全量165文件2084项/41.27s、构建Vite15.02s含vue-tsc、完整ESLint零错误/1既有警告、Stylelint与Console api:check PASS（`logs/wp03-console-*-inbox-final.log`）；后端/生成合同未改，不机械再次生成HTTP。更新完整5307份源码快照（1008250字节）、21关键文件及12663字节运行材料，第四环境tc_console_wp03_1791332741479046000/OID29655；专用通知两PRO正常供给、普通与通知三账号真实login项目均与当前PG exact一致，未持久化JWT/cookies。整栈实机守卫、同环境契约9项/966ms PASS（`logs/wp03-contracts-inbox-final.log`）；第四轮整个默认矩阵`logs/wp03-default-inbox-final/`在第18场实时MQTT辅助连接确认失败而停止，6项PASS/11项条件SKIP、51项NOTRUN；Broker同一时段authn HTTP resource健康disconnected及not_authorized，本人后端PID/健康随后UP、Broker认证状态回到connected且容器访问本人8090健康UP。不能将后续恢复推断为原次通过或确认所有根因；保留`wp03-mqtt-failure-public.json`的安全分类，未输出秘密/报文/请求头。仅补MQTT辅助器的固定失败阶段和有限原因码反例，保留15秒边界、PUBACK+无失败真实close要求、不自动重试或降低TLS/认证。诊断专项新增23项固定阶段/有限原因码反例，连既有TLS共四文件48项/1.22s PASS，ESLint/类型通过（`logs/wp03-mqtt-diagnostic-*-qualified.log`）；首次新测试void|Error类型错误已保留并修正，未改变协议资格。实机单选`dashboard-realtime.spec.ts`1项/9.2s PASS（`logs/wp03-realtime-diagnostic-qualified.log`），不得替代矩阵。最终全部165文件2107项/43.47s、构建Vite15.34s、完整ESLint零错误/1既有警告、Stylelint及api:check均PASS（`logs/wp03-console-*-qualified-final.log`）；最终5307份源/21关键文件摘要更新。第五环境tc_console_wp03_1791333700224291000/OID29721再从零业务完整模板克隆，旧库保留、正常供给及login身份重新核验；本人认证资源actual connected后守卫/真实契约9项/911ms PASS（`logs/wp03-contracts-qualified-final.log`）。第五完整默认矩阵`logs/wp03-default-final-qualified/`启动前冻结本轮owned-runtime.json、public-config.json及source-snapshot.json独立副本，防后续准备覆盖原资格材料；所有私人材料仍不输出。第五轮11项PASS/13项条件SKIP，第25场旧REST交错观察器超时而FAIL、44项NOTRUN（`logs/wp03-default-final-qualified.log`及该轮独立冻结材料）。新WS14.75已接受、来源已显示，旧HTTP200/finished/route交付亦已通过，但bare路径安装的post观察器没有消费旧修订；不得据此标UI回退或该场通过。实机GET转译代码只采公开import URL，证实实际device API用http/index.ts?t=1791333758875，观察器bare/index.ts；HTTP模块每个ESM实例单独新建api对象，生产构建后仍运行的旧Vite HMR图形成不同模块身份。仅核SHA/PID/listener后冷重启本人3019/4018，未修改spec或减少API消费者交付断言；实际转译回读device/http均恢复相同裸路径（`wp03-cold-module-identity.json`）。源码仍为最终2107项/构建/全静态已验候选，无源码变化不机械再跑；运行前须先完成所有构建/生成再cold UI，不在浏览器期间重建共享合同。第六环境tc_console_wp03_1791334257164802000/OID29808保持完整352迁移、新正常账号供给与精确login/PG校验，认证actual connected、冷启动进程重新绑定、守卫及实际契约9项通过（`logs/wp03-contracts-cold-qualified.log`）；第六整个默认矩阵使用`logs/wp03-default-cold-qualified/`独立冻结材料。第六轮2项PASS/11项条件SKIP，第14场告警预览显式刷新要求三组真实query却为零而FAIL、55项NOTRUN（`logs/wp03-default-cold-qualified.log`及冻结材料）；本次http/device/alarm转译均为裸路径，排除已知HMR观察器身份差异。失败公开上下文为WAITING且“等待在途读取释放额度”；检查生产preview-scheduler发现已知可用时间在连续now()比较间到达，pump错误降成null，wakeAt另会直接丢弃已到时点，最终不再收到窗口唤醒。REST_READY已是前轮finish后状态，不能据此推断原轮未释放；本轮实际修复生产调度的时间边界，不放宽spec三组请求断言、滑动预算/权限或设固定sleep。新增两个fake-clock跨边界反例先RED，再保留具体已知时点并至少1ms定时重新检查资格；真实未知在途仍只等容量事件。两个边界反例在旧实现16PASS/2FAIL，修后18PASS/661ms，局部ESLint及类型检查PASS（wp03-preview-scheduler-boundary-red.log、-green-final.log）。重新全量165文件2109项/23.61s、构建Vite16.81s含vue-tsc、完整ESLint零错误/1既有警告、Stylelint及api:check PASS（wp03-console-*-scheduler-final.log）。第七完整新库tc_console_wp03_1791334894769353000/OID29874、全源码5307份/23关键文件摘要、13015字节运行材料；冷UI裸路径、实际Broker认证connected及容器到本人后端健康UP，真实契约9项/944ms PASS。第七整份默认矩阵wp03-default-scheduler-qualified在告警刷新、迟到REST交错、OTA固件和双账号通知均PASS后，第49绑定选择器按通用“绑定设备”子串匹配到两个不同时间后缀的真实设备，count1断言FAIL；25PASS/23条件SKIP/20NOTRUN（7.1m），保留该库/独立冻结报告。公开错误上下文证明本场绑定设备1791335365711与先行dashboard-recovery创建的绑定设备1791335093936均为合法不同设备；仅将dashboard-binding.spec.ts选项改为本次真实fixture.deviceId精确value，保留count1、metadata200、保存重开及预览全部断言，不删除设备或减少资格。局部ESLint/TypeScript/Prettier通过（wp03-dashboard-binding-selector-*.log），后续20场只读未发现同类明确名称碰撞；新库tc_console_wp03_1791335430604652000/OID29956保留零业务352迁移及正常身份供给。最终selector候选165文件2109项/23.94s、构建Vite15.75s含vue-tsc及完整静态均PASS（wp03-console-*-selector-final.log）；5307份完整源快照/24关键文件、13179字节运行材料冻结，正常身份精确核对与冷UI身份匹配，实际守卫及契约9项/963ms PASS。第八整份默认矩阵wp03-default-selector-qualified单次57文件69项收集，44PASS/25条件SKIP/0FAIL/0NOTRUN、0flaky/0报告errors（677177ms，11.3m）；包括013-A/B/C三场、告警调度、迟到REST、精确设备绑定、概要及两SHC全部实际PASS，不拼接旧轮。旅程及本片最终范围见下表；以上七轮首败保留，不继承或拼接其局部通过。010-D、G3正式矩阵、Node22/Windows/CI/公司部署与实物仍独立NOTRUN。

**WP-03最终冻结候选与回执**：2026-10-06，本机macOS/Docker Desktop、Node26.7.0/pnpm11.9.0；平台`master / 9f51c9fd68d23aad91ae00a4b61f7175dbfd945b`加本片未提交源码，经最终守卫核对。完整5307份源快照SHA256 `ecfb7750ed5de5e7db4a85b49c5c836c6ebaceeca4abfe7dfc460a67fdb83695`；冻结生产JAR `22213fe96f17f1a332837d4b401257421a1906573b43a7b749f206ecf933a91a`，配置 `2577a455f7949d67b951bbbeed14ff180d4390c5fd62b6b7a58ccd242d59db5c`，默认轮公开运行材料 `44d54c818fc089c9a20c32173c330f32eb9aca9e58cd5bd0f659620044c89763`。数据库`tc_console_wp03_1791335430604652000/OID29956`，所有旧库与首败报告保留；正常套餐、RLS、严格CA/主机名及授权保持。后端/HTTP合同未改，不机械重跑全后端；此前本片唯一生成72项通过且最终源输入未变。

| 实际验证 | 结果与证据 |
| --- | --- |
| `pnpm test`、`pnpm build` | 165文件2109项/23.94s PASS；Vite15.75s与vue-tsc PASS，`logs/wp03-console-{unit,build}-selector-final.log` |
| `pnpm exec eslint .`、`pnpm lint:stylelint:check`、`pnpm api:check` | PASS；ESLint零错误/1既有unused-disable警告，`logs/wp03-console-{lint,stylelint,api}-selector-final.log`；WebApp构建及api检查亦已PASS、最终源/宿主制品未变 |
| 实机守卫、`pnpm test:contract` | 整栈身份及真实PG守卫PASS，契约9项/963ms PASS；`logs/wp03-contracts-selector-qualified.log`；全部浏览器后关闭阶段只读守卫再次PASS（`logs/wp03-actual-guard-closing-qualified.log`） |
| `pnpm exec playwright test --workers=1 --max-failures=1 --grep-invert @simulator` | 单次完整57文件69场；44PASS、25条件SKIP、0FAIL/NOTRUN/flaky、0报告errors，677177ms；`logs/wp03-default-selector-qualified.log`及`logs/wp03-default-selector-qualified/{playwright.json,owned-runtime.json,public-config.json,source-snapshot.json}`；013三场、概要告警设备聚合、四角色个人中心、OTA真实存储及SHC两场均实际PASS |
| `pnpm exec playwright test --workers=1 --max-failures=1 journey-3.spec.ts` | 1PASS/25.736s，`logs/wp03-journey3-qualified.log`及`logs/wp03-simulator-journey3-qualified/`；真实严格TLS MQTT、影子/历史、实时断线补读、命令与ACK |
| 同命令分别选`journey-6.spec.ts`、`journey-7.spec.ts` | 各1PASS，37.005s/23.383s；`logs/wp03-journey6-qualified.log`、`wp03-journey7-qualified.log`及对应`wp03-simulator-journey{6,7}-qualified/`；网关配置下发/子设备上报及命令、离线级联；真实App认领/共享/转移/解绑失权 |
| 同命令组合`journey-3.spec.ts journey-6.spec.ts journey-7.spec.ts` | 3PASS/84.313s，零SKIP/FAIL/NOTRUN/flaky/errors；`logs/wp03-simulator-combined-qualified.log`及`logs/wp03-simulator-combined-qualified/`，单独冻结同候选材料 |
| 文档及提交门禁 | 完整`pwsh scripts/docs-verify.ps1 -BaseRef HEAD` PASS：821份根/模块Markdown、23链接语法回归及变更政策，Java文档一致性16项/33.479s PASS（`logs/wp03-docs-full-final.log`）；`git diff --check`及`node scripts/check-commit-message.cjs /tmp/thingscloud-wp03-commit-message.txt` PASS（`logs/wp03-commitlint-final.log`）。最终回执文本再跑`-SkipMaven -BaseRef HEAD`，提交后对原基线`9f51c9fd`再次核政策 |

25项条件SKIP分别为：非空历史告警1与合成受审分析9；告警投递1、产品凭据1、OTA新增五旅程5、软删2、事件历史1、类型详情1；OTA生命周期1；资源包1；留存导出双套餐夹具2。按原显式专项条件跳过，不称通过；这些片此前独立回执保留但不继承本次默认资格。@simulator三文件是默认收集排除，另验上述独立及组合，不混入69场。统一对象账本未交付、正常套餐50019边界、010-D真实模型准入及质量、G3正式六文件矩阵/服务器准入/TLS备份恢复、Node22/Windows/远端CI/公司服务器、SMTP真实送达、生产signer/实物硬件与正式交付仍开放或NOTRUN；R4暂停项不恢复。

~~WP-03组内本地整合~~已完成并验证，关闭TODO-013本地软件范围。提交目标为平台`master`，本片实现、反例和本回执同片本地提交，不推送；实际提交可按`fix(console): 完成独占矩阵验证并修复预览窗口唤醒`检索。接续须重新按以上公开材料闭集、完整迁移模板、正常专用账号、真实容器/进程/CA及全部源摘要建立候选，不能复制旧PID；先完成构建再cold UI，浏览器期间禁止构建/改源。忽略目录脚本仅本机编排，仓库内实际spec/helper/guard与本节命令及前置是可恢复入口，原日志不作为唯一交付记录。

## TODO-014 告警通知投递查询

- **编号/工作包**：~~CONSOLE-TODO-014 / WP-04~~ — 已完成并验证本地软件范围。
- **状态**：~~014-A~~ — 已完成并验证；只读投递记录，不新增重发能力。
- **代码事实**：[告警API](../src/api/alarm.ts)及[告警详情投递面板](../src/views/alarm/history/AlarmNotificationDeliveries.vue)已接入只读投递查询，支持20项游标、刷新及当前告警隔离。
- **接口**：`GET /api/v1/projects/{projectId}/alarm-notification-deliveries`，按合同传告警实例过滤及游标参数。
- **014-A片前决策/验证选择**：候选`master / 164bb226`，开片清洁。告警历史事件详情内接入既有GET目录，按instanceId与20项游标读取，四角色按服务端项目读取权限，target只接受后端脱敏值，不返回正文/地址/凭据、无重发入口。换项目/身份/告警或关闭取消并拒绝旧响应；同步修正宿主页现有事件读取的旧响应保护。现有Controller/NotificationConfigurationService已有只读权限与RLS，无需新增入口；随后核实QUEUED及TEMPLATE_INVALID等状态的nextAttemptAt真实为null，修正DTO可空Schema并补OpenAPI守卫，生成双端合同。补真实PG/HTTP投递查询、筛选/分页/越权/脱敏反例及页面反例；浏览器使用独立栈真实配置与生产告警评估Bean生成的意图，不插入伪造投递，不调用外部SMTP/供应商。该直接可信评估夹具不认领Broker摄取或硬件资格。若发现查询/脱敏缺陷，同片修正后端和唯一生成合同。
- **014-A交付**：告警详情增加投递记录，展示合同允许的状态、时间和脱敏信息；项目级列表仅在同片实际需要时复用。无重试写接口，不增加重发按钮；不与公共Webhook投递台账混淆。
- **验收**：有/无投递、不同状态、过滤与游标、跨项目拒绝、读取失败、切换告警不残留；隔离真实后端产生通知意图并在浏览器核对。意图状态不等于SMTP或供应商送达；外部送达NOTRUN单列。
- **回执**：~~014-A~~ — 已完成并验证本地软件范围。候选`master / 164bb226`加本片差异，macOS Node26.7.0/pnpm11.22.0/Chromium1234；专用PG沿013-A，Redis DB14、后端8088、Vite3017、活动PRO项目，无迁移变更或额度策略修改。最终冻结JAR SHA256 `32416afeb193f8f2df78f21bb91ea0c5111f89aca8bc7bb1df529d4721bd7916`；原本人PID83265按命令、制品摘要及8088监听核对后停止，新PID89483加载该冻结制品；开发者8080/3006及其他资源未操作。

| 范围 | 实际结果及证据 |
| --- | --- |
| 交付 | 告警事件详情内显示渠道、脱敏目标、状态及原枚举、尝试次数、下次计划、创建/更新时间、投递/触发事件ID。保留8种既有执行状态；失败与空集分开，拒绝原始地址/私有字段/错误实例/非法字段。换告警、项目、账号或身份epoch及关闭详情清空并拒绝迟到响应；宿主页列表、事件、确认与清除亦补范围保护；不存在重发写入口 |
| 合同 | DTO补nextAttemptAt可空声明，唯一生成OpenAPI70项PASS并双端生成。输入摘要`808851da556612a16952ed4fccc0318dad298b7dad56d9116c6c31c1066d313c`，OpenAPI摘要`a1b3e3cabde25022c2b0b51dbeedb5052b7f8c8015d717b74bd7ac09c9b3f770`。JSON语义对照仅该字段description/type变化；其他差异为生成键序，不手工编辑生成物。`logs/014-a-openapi-final.log` |
| 模块/真实PG-HTTP | 告警模块127项及依赖reactor PASS，`logs/014-a-alarm-module.log`；`AlarmConfigurationProjectLifecycleTests`30项PASS（新增4角色读取），生产评估生成21条TEMPLATE_INVALID意图，验证20+1游标/过滤/精确字段/脱敏/可空计划/归档只读/跨项目拒绝/匿名拒绝及无外发Outbox，`logs/014-a-real-query-final.log`。首轮夹具错用App角色MAINTAINER并新增第二OWNER，按Console OWNER/ADMIN/OPERATOR/VIEWER和单OWNER约束修正，未放宽数据库规则；失败`014-a-real-query-recheck.log`保留。早启的另一次Maven查询在编译阶段主动取消以恢复串行，未认领通过 |
| 页面/构建 | 全Console134文件1354项PASS（新增面板22项、宿主页4项、API1项），`logs/014-a-all-ui-proof.log`；最终`pnpm build`PASS，`014-a-build-receipt.log`。API一致性、当前片ESLint/stylelint和类型PASS，`014-a-api-check-final.log`、`014-a-release-lint.log`、`014-a-stylelint-final.log`、`014-a-release-type.log`。首次类型检查遇未生成可空Schema、ESLint遇退出回调条件表达式，分别按合同生成及改显式if后复验通过。verbose复核发现宿主页清除确认夹具缺少自动导入全局，原用例未经过确认逻辑；补齐全局并断言确认框确实调用后专项及全量复验PASS，旧记录不作为该确认边界证据；`014-a-test-lint.log`及`014-a-test-type.log`亦PASS |
| 真实浏览器 | `E2E_ALARM_RUNTIME=logs/014-a-runtime.json PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers E2E_BASE_URL=http://localhost:3017 E2E_OWNER_EMAIL=e2e-012a@example.com E2E_END_USER_PROJECT_NAME=留存夹具 E2E_RUN_DIR=logs/014-a-browser-final pnpm exec playwright test alarm-notification-deliveries.spec.ts` 1项PASS/24s，`logs/014-a-browser-final.log`及该证据目录。真实Console API建立数值设备/规则/21个合成收件人/模板/绑定；[可信评估夹具](../../../things-link/things-link-bootstrap/src/test/java/com/things/link/bootstrap/alarm/fixture/AlarmDeliveryFixtureProcess.java)只加载其测试class，普通APP角色、专用库、OWNER、唯一受控规则与合成配置检查后调用生产评估Bean，模板真实展开过长得到21个终态且无外发Outbox；页面20+1分页、刷新回首20项、脱敏/可空/无重发及关闭核对通过，不插入伪造告警或投递行 |
| 失败/环境边界 | 浏览器首轮快速创建触发真实REST速率保护；夹具按真实速率加节奏后复验，未修改套餐或Redis计量。次轮子进程继承macOS系统代理导致本机PG UnknownHostException，按主程序现有启动规则显式清空代理参数后通过；`logs/014-a-browser.log`、`014-a-browser-recheck.log`及对应目录保留。标准SMTP旅程追加面板SUCCEEDED核对，但完整矩阵的EMQX预检前置未获资格，本轮该旅程NOTRUN，专项HTTP夹具不认领Broker摄取或SMTP送达 |
| 文档/提交 | 完整`pwsh scripts/docs-verify.ps1`PASS（Java文档一致性），`logs/014-a-docs.log`；最终回执`pwsh scripts/docs-verify.ps1 -SkipMaven`及`git diff --check`PASS，`logs/014-a-docs-final.log`；27项最终专项亦PASS，`logs/014-a-focused-proof.log`；本片单独本地提交，不推送，提交号以Git定位 |

Node22、Windows、远端CI、公司服务器、Broker摄取、SMTP/供应商实际送达、真实终端/硬件及正式交付均NOTRUN；原父G3及WP-03默认矩阵不继承本片资格。按统一顺序接续015-A。

## TODO-015 一型一密产品凭据

- **编号/工作包**：~~CONSOLE-TODO-015 / WP-05~~ — 已完成并验证本地软件范围。
- **状态**：~~015-A~~ — 已完成并验证本地软件范围；一次性产品注册秘密及受权生成/轮换。
- **代码事实**：[设备API](../src/api/device.ts)及[产品凭据弹窗](../src/views/device/types/ProductCredentialDialog.vue)已消费单类型公开状态与产品凭据；目录按权限提供入口。
- **接口与合同**：`GET /api/v1/projects/{projectId}/device-types/{id}`公开状态及`POST .../{id}/product-credential`一次性生成/轮换；[设备身份范围](../../../.private/thingslink-docs/docs/contracts/DEVICE_CAPABILITY_SCOPE.md)、[ADR0003](../../../.private/thingslink-docs/docs/adr/0003-device-authentication.md)。
- **015-A片前决策/验证选择**：候选`master / 76dab0a1`，开片清洁。后端真实角色限定OWNER/ADMIN，已发布DIRECT/GATEWAY可生成、SUB_DEVICE拒绝；产品识别码固定、秘密轮换只阻止旧产品秘密继续动态注册，既有一机一密独立。产品秘密不回查；需要按单个类型刷新公开状态，当前控制面缺GET单类型，补只读项目权限/RLS/生命周期允许读取的类型详情，避免扫描目录或把公开标识当作轮换回执。当前DeviceTypeResponse.productKey真实未生成时为null，补可空Schema并唯一生成合同。产品生成POST没有幂等键/查回能力，HTTP层限定该路径单次发送（包括401和5xx），界面在任何未知结果后只读核对并明确再次轮换影响，不自动补发。秘密仅组件内存、关闭/换作用域/身份清除；完成后运行设备模块、真实产品生成/动态注册/轮换反例与浏览器，外部设备资格仍NOTRUN。
- **015-A交付**：已发布类型提供受权生成/轮换操作，明确产品级与设备级凭据差异和影响；明文仅首次响应展示，关闭/换身份清除，不记录或持久存储。不假设有产品秘密回查或撤销接口。
- **验收**：未发布类型拒绝、越权/跨项目、轮换后新旧产品凭据语义、已有设备凭据语义、重复点击及响应丢失处理、秘密不进入日志/URL/持久存储；用真实隔离后端动态注册反例验证，不代替硬件资格。
- **回执**：~~015-A~~ — 已完成并验证本地软件范围。2026-10-06，候选`master / 76dab0a1`加本片差异；macOS Node26.7.0/pnpm11.22.0/Chromium1234。沿013-A专用PG5547、Redis DB14、后端8088/Vite3017与活动PRO项目；无迁移、配额策略或设备注册协议变更。冻结JAR SHA256 `687da7281d422d88e982bd95088dffd18498fd4f31120359e95c670f632d6f52`；核对本人旧PID89483、旧制品摘要及8088监听后替换为PID97501，8080/3006开发服务未操作。

| 范围 | 实际结果与证据 |
| --- | --- |
| Console闭环 | OWNER/ADMIN及device:update提供已发布DIRECT/GATEWAY入口；先GET精确类型与当前项目状态，活动项目才能显式确认生成或轮换。产品公开标识稳定，秘密只在本次组件内存/密码输入展示，关闭、刷新、换类型/项目/账号/租户/身份或权限清除。请求及确认期间禁双发，旧响应拒绝；无秘密回查或撤销按钮 |
| 未知结果 | 产品POST独立单次发送，401/403/429/5xx/网络/超时均不认证重放或自动重试，也不传播原错误正文。已发送后关闭或结果未知需只读核对，再人工确认轮换影响；公开productKey不能证明一次轮换成功。未结束的POST保留busy，关闭重开不能再发；秘密显示后不再允许第二次生成 |
| 后端及合同 | 新GET复用真实项目读取/成员及类型仓储RLS，不返回秘密或摘要；productKey真实未生成为null，Schema如实可空。产品写路径补精确生命周期预检，避免归档被ACTIVE额度判断伪装为429，活动请求仍走原额度及事务锁。产品凭据/动态注册命名空间退出通用原文日志，拒绝请求也不缓存/query落盘；旁路以外诊断保持原合同。固定operationId=getDeviceType避免移动既有编号 |
| 唯一生成 | `python3 scripts/generate-openapi-contracts.py`及OpenAPI71项PASS，332路径/412操作/104分组；输入摘要`fefd3b92bcccf0145353f614913149fc81a38954bf4a8837ff9b187e757de1fd`、OpenAPI SHA256 `b113948c489deeb14c88f012779b069cd4a0439ce6a152553f20106351d5f4bb`。语义仅新增GET及productKey的type/description；双端类型同步。`logs/015-a-openapi-delivery.log`；最终澄清Service内部Domain由HTTP公开DTO投影的JavaDoc、关闭测试失败正文自动打印后重新唯一生成，OpenAPI及双端类型摘要不变；冻结JAR与当前编译生产class逐项一致，`logs/015-a-bytecode-equivalence.log`。旧通用detail编号移动候选重新唯一生成修正，不手改生成物 |
| 模块及真实依赖 | `./mvnw -pl things-cloud-device,things-cloud-iam -am test`PASS：Device256、IAM257及依赖reactor（Support360等），`logs/015-a-modules.log`。真实`DeviceTypeApiTests,DeviceTopologyApiTests,DeviceRegistrationQuotaTests`47项PASS及IAM过滤器36项PASS，`logs/015-a-real-api-qualified.log`：四角色、草稿/SUB_DEVICE、归档读取及写拒绝、跨项目/匿名、真实HTTP动态注册及新旧秘密、既有设备真实Broker认证过滤链allow。最终原文日志修复后`DeviceTypeApiTests,*RequestLoggingTests,ArtifactUploadRouteTests,QuotaRestRateLimitFilterTests`重新PASS：21/18/36项及依赖，`logs/015-a-final-candidate-http.log`。原文日志测试强制INFO且正向捕获普通请求，不能把默认OFF当保护证据。另显式设DeviceTypeApiTests的MockMvcPrint.NONE，防止未来失败自动倾倒一次性响应；21项再次PASS，`logs/015-a-no-print-http.log` |
| 页面及静态 | 全Console137文件1391项PASS，`logs/015-a-all-ui.log`；专项四文件66项PASS，`015-a-scopes.log`，含身份/类型/权限清除、响应未知/双击、HTTP七类禁止重放及目录迟到响应。`pnpm build`、最终Console/WebApp类型及API一致性、当前片ESLint/stylelint PASS：`015-a-build.log`、`015-a-typecheck-final.log`、`015-a-webapp-typecheck-qualified.log`、两端`015-a-*-api-check*.log`、`015-a-lint-final.log`、`015-a-stylelint.log`；WebApp不存在typecheck脚本的首条未执行成功，按该工程实际vue-tsc命令复验 |
| 真实浏览器 | `E2E_PRODUCT_RUNTIME=logs/015-a-runtime.json PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers E2E_BASE_URL=http://localhost:3017 E2E_OWNER_EMAIL=e2e-012a@example.com E2E_END_USER_PROJECT_NAME=留存夹具 E2E_RUN_DIR=logs/015-a-browser-final pnpm exec playwright test product-credential-journey.spec.ts`1项PASS/11.7s，`logs/015-a-browser-final.log`及该证据目录。真实Console建/发布类型、生成一次、动态注册、关闭重开无秘密、显式轮换一次，公开key不变，旧秘密403/30026、新秘密201；URL/两类存储/浏览器console及独占后端四级日志无明文；只返回布尔/公开状态诊断，不返回设备token到断言 |
| 首败及修复 | 后端首轮预期401与实际30026/403不符，并发现归档写429；按事实修正预期并补生命周期预检。第三轮跨项目夹具复用已轮换刷新Cookie失败，改真实独立账号会话，未放宽认证/限流。`015-a-real-api.log`、`015-a-real-api-recheck.log`、`015-a-real-api-final.log`保留。前端首次未生成GET/可空类型、宿主props泛型及HTTP错误提示false仍记公共日志的错误断言修正后通过，`015-a-typecheck-first.log`、`015-a-ui.log`保留 |
| 浏览器失败证据隐私 | 首轮凭据已成功生成，但测试误查ElInput子input；改按aria-label定位，`015-a-browser-recheck.log`1项PASS/7.4s。原Playwright默认失败ARIA文本包含该独占测试秘密（不是Console存储或日志）：已真实轮换使其失效，只脱敏本轮创建的两份error-context文本，保留失败类型/源码/其余证据，不删日志；该失败附件注明为脱敏证据，不能作为原始秘密留存回执。早前三份本人创建的Maven失败日志中9个测试productSecret字段亦脱敏保留错误与公开事实，不触碰其他日志；后续该API类明确关闭MockMvc自动正文打印。新增afterEach关闭页面早于自动失败上下文收集，trace/video/screenshot均关闭；显式设置`E2E_PRODUCT_CAPTURE_PROBE=1`的独立运行按预期exit1（固定受控异常）；读取两份error-context及HTML内嵌ZIP，确认无页面ARIA快照/秘密输入，`logs/015-a-capture-probe.log`及该目录，仅资格为失败捕获保护反例，不计业务矩阵PASS；取消该变量后最终正常旅程再次PASS |
| 文档及提交 | 最终`pwsh scripts/docs-verify.ps1`（含Java文档一致性）PASS，`logs/015-a-docs-final.log`；回执补齐后`-SkipMaven`及`git diff --check`PASS。本片单独本地提交，不推送，提交号以Git定位 |

Node22、Windows、远端CI、公司服务器、真正EMQX客户端连接/摄取、真实设备及正式交付NOTRUN；真实Broker HTTP认证结果不继承硬件资格。WP-03默认MQTT矩阵及G3不随本片关闭。后续接续016-A。


## TODO-016 OTA配套管理与诊断

- **编号/工作包**：~~CONSOLE-TODO-016~~ / ~~WP-06~~ — 已完成并验证本地软件范围。
- **状态**：~~016-A~~、~~016-B~~、~~016-C~~、~~016-D~~、~~016-E~~ — 已完成并验证本地软件范围；受控材料不继承真实设备资格。
- **代码事实**：[OTA API](../src/api/ota.ts)的三个公开历史GET已由[只读抽屉](../src/views/ota/firmwares/OtaMetadataDrawer.vue)消费并纠正固件页过时注释；`createOtaReleaseDownload`已由固件页专用下载弹窗消费。作业回退准备GET已由作业详情只读面板消费；信任包导入已由固件页独立受控弹窗消费；基线登记已由固件页独立受控弹窗消费；不重复建设已有固件、活动、作业、审计主体。
- **016-A片前决策/验证选择**：候选`master / 0b735337`，开片清洁。三项只读GET已有真实权限/RLS及分页合同；整组OTA菜单仍仅OWNER/ADMIN，不因公开历史可读而放宽活动/部署权限。固件页补只读按钮及后端/静态菜单authPoint，组件绑定账号、租户、项目、权限和身份代次；类型只选PUBLISHED。键游标绑定当前包版本，400/10001清旧事实重读首页。复验两类集合真实HTTP、菜单与组件反例，并在既有独占PG5547/Redis14/8088栈通过受控临时测试根及精确类型启动配置、真实包导入/基线登记准备实际浏览器；不INSERT安全事实，不重启或修改共享Broker。真实根/制造/设备资格仍NOTRUN。
- **016-A交付**：信任域和发布键公开元数据、设备类型基线版本历史只读展示，消费`GET .../ota/trust-domains`、`/{trustDomain}/keys`与`.../ota/device-types/{deviceTypeId}/baseline/versions`，同步过时注释。验证空集、分页、换包游标失效、未知或跨项目、权限切换；不得把只读权限当写权限。
- **016-B片前决策/验证选择**：候选`master / 037a1f04`，开片清洁。管理下载POST严格空正文、稳定幂等键，完成只保存墓碑（10014）不能找回票据；短地址仅组件内存，单次发送且不认证重放，不传播错误正文/URL；网络/5xx未知保留原键，显式恢复/再申领。OWNER/ADMIN及活动项目/READY只是页面前置，服务端再次核发布固定对象和当前信任。必要补下载命名空间原文日志防护及HTTP单次请求，真实MinIO固定版本/Range/签发中失权、组件状态与实际浏览器下载/60秒过期；临时合成根与测试signer及精确类型配置在独占栈，不继承真实signing/实物资格。
- **016-B交付**：消费`POST .../ota/firmwares/{firmwareId}/release/downloads`获取固定发布物短时下载地址。验证未发布拒绝、确权、过期、实际下载内容与固定版本一致；不替代受控signer资格。
- **016-C片前决策/验证选择**：候选`master / 4f072537`，开片清洁。既有作业详情只读GET，观察分类与当前重验分类分列，70044无观察不能伪装协议UNKNOWN；false执行权/true原子互斥要求为恒定边界，未知/坏DTO失败关闭，身份/关闭/晚响应清理。沿独占PG/Redis14/8088/Vite3017，新建本人EMQX51883/TLS58883/管理58083及Redpanda59092空数据容器，保留生产认证mountpoint/v2信封、严格TLS与关闭鉴权缓存，不改变共享Broker/Kafka；从真实HTTP设备、发布物、活动及设备MQTT报告/授权/序号缺口进入RECOVERY_REQUIRED，再接预检报告。精确受控回退扩展绑定原基线完整规范摘要，合成设备证据不代表实物槽/掉电互斥；默认WP-03矩阵保持独立。
- **016-C交付**：作业详情消费`GET .../ota/campaigns/{campaignId}/jobs/{jobId}/rollback-preflight`展示回退准备观察与资格。验证可用/不可用/未知及陈旧观察；查询不代表执行回退，不添加不存在的回退写接口。
- **016-D片前决策/验证选择**：候选`master / 304a9cf9`，开片清洁。遵循[ADR0118](../../../.private/thingslink-docs/docs/adr/0118-project-scoped-ota-trust-registry.md)，只载入离线公开签包，不生成/导入私钥或HTTP改根；严格原文JSON预算/重复字段/非安全数值及闭集，不先JSON.parse洗掉非法语义。冻结域、修订、正文及原幂等键，未知显式原键恢复；10014完成墓碑与当前GET快照分开，更高包覆盖不能冒称恢复原响应或新键重提。OWNER/ADMIN、ota:deploy/ACTIVE仅页面前置，服务器根签名/CAS/历史键及权限重新裁决。沿本人独占栈以新增精确临时公开根配置及离线签包验证实际页面，不改共享Broker；真实生产根/signing条件继续NOTRUN。补真实HTTP坏签名、跨域、归档/失权及墓碑零重复反例，前端反例、严格签包模型与实际浏览器同片验证。
- **016-D交付**：按`POST .../ota/trust-domains/{trustDomain}/bundles`提供受控离线根签名包导入。前置核对签名包来源、权限和幂等；不生成或导入私钥。验证合法/非法签名、跨域、重复提交与响应未知恢复。
- **016-E片前决策/验证选择**：候选`master / c90f2f7b`，开片清洁。已读[ADR0122](../../../.private/thingslink-docs/docs/adr/0122-controlled-ota-device-type-baselines.md)：POST严格只expectedRevision，服务器选精确类型启动配置，浏览器不接收能力JSON/开关或声称能预览待登记配置；GET五字段完整持久基线，仅作当前公开快照，不证明当前配置或类型映射仍有效。类型只选PUBLISHED且真实非空productKey，fresh GET修订/首0与服务器精确预配确认；未知原键body、10014结束原意图，只读辅助核对，新意图须显式重读并确认服务器配置更新。沿本人独占栈保留全部根/B类型基线与回退扩展，选A现2版类型的精确更高受控版本；另真实PUBLISHED未配置类型验证70028。补HTTP失权/归档/类型变化/墓碑零增量及strictDTO/范围/原意图反例，真实浏览器管理写/配置升级/断响应恢复；制造与实物资格仍NOTRUN。
- **016-E交付**：按`POST .../ota/device-types/{deviceTypeId}/baseline/registrations`接入受控基线登记；先读[ADR0122](../../../.private/thingslink-docs/docs/adr/0122-controlled-ota-device-type-baselines.md)与当前Controller，确认服务器精确类型启动配置。不能改造成浏览器任填安全基线、通配或绕过后端配置。验证缺配置拒绝、精确类型、越权及幂等。
- **资格边界**：D/E测试用受控合成材料与独占隔离环境；缺真实根/signing条件只记对应NOTRUN，不阻塞可独立验证的只读片，也不关闭真实signer与实物门禁。
- **016-A回执**：~~016-A~~ — 已完成并验证本地软件范围。2026-10-06，候选`master / 0b735337`加本片差异；macOS Node26.7.0/pnpm11.22.0/Chromium1234；沿独占PG5547/Redis DB14/后端8088/Vite3017。冻结JAR SHA256 `879b785bcde48dbcbfb323e87eef6b9dbfb4dd43e10277c51fb920c55b3ac7fe`；按旧PID97501/制品/端口三重核对替换为4491，第二版精确基线配置前再次核对并替换为5452，制品不变。配置摘要`69c4449ed61495310d86515d9acaa8156d41a1c9264e31e983acf7111abf95d1`，8080/3006及共享Broker配置未操作。

| 范围 | 实际结果与证据 |
| --- | --- |
| 页面与授权 | 固件页“信任与基线”入口，公开域/逐键/类型基线历史分别读取；20条游标分页，类型目录全分页仅PUBLISHED；闭集必填公开DTO校验，缺失/未知字段或坏页不冒充空集。状态与UTC左闭右开有效期不推断可发布/设备资格。换域/类型、关闭、账号/租户/项目/角色/权限/身份代次变化清空事实，迟响应拒绝 |
| 旧包恢复 | 发布键旧包游标400/10001后先清全部旧事实，最多一次重新读取首页；恢复失败保持空错误，不合并两代键。目录刷新同时清键；首次读取、失败与真实空集分别呈现 |
| 菜单合同 | 后端MenuCatalog及静态路由增加一个ota:read操作点，避免backend模式入口不显示；目录语义仅OtaFirmwares.authCodes新增ota:read，角色/permissions/cases不变，整个OTA菜单仍OWNER/ADMIN。菜单101项PASS（12真实端点+88过滤+1跨端目录基线），`logs/016-a-menu-qualified.log`；前端目录合同同片PASS |
| 真实接口 | `./mvnw -pl things-cloud-bootstrap -am '-Dtest=OtaTrustDomainCollectionReadHttpIntegrationTests,OtaTypeBaselineVersionCollectionReadHttpIntegrationTests' -Dsurefire.failIfNoSpecifiedTests=false test`在things-cloud执行，15项PASS及依赖，`logs/016-a-http-archived.log`。分页/空集/公开白名单/未知及跨项目/成员与匿名/坏游标/换包，并新增两个归档只读反例。归档状态只由独占测试夹具准备，安全域/基线事实仍经真实导入/登记，不声称存在新的归档HTTP接口 |
| 受控材料 | 临时Ed25519测试根与发布键仅准备进程内存，保存的启动配置/签包只含公钥与签名；51域及首域51键全部真实POST bundles产生。基线首版从精确tenant/project/type/productKey启动配置真实POST登记；停止本人后端、仅更换配置到第2版后再真实登记，历史2行。`logs/016-a-config-v1.json`、`016-a-config.json`、`016-a-fixture.json`、`016-a-provision-qualified.log`、`016-a-baseline-v2.log`；不INSERT安全事实，不重放旧DLQ |
| 唯一合同 | `python3 scripts/generate-openapi-contracts.py`及OpenAPI71项PASS，输入摘要`710de335f8ae24eba871d725c423a76d96c8c80c4034f65b015447c20539139b`，OpenAPI/双端TS与015最终合同摘要一致，无新HTTP合同；`logs/016-a-openapi.log`。两端`pnpm api:check`PASS，`016-a-api-check.log`、`016-a-webapp-api-check.log` |
| 页面与构建 | 全Console139文件1437项PASS，`logs/016-a-all-ui.log`；专项5文件75项PASS，`016-a-ui.log`，最后补产品标识前置文案后专项75项PASS，`016-a-ui-delivery.log`（补文案时旧文案断言首败保留`016-a-ui-final.log`）。Console vue-tsc、pnpm build、当前片ESLint/stylelint PASS：`016-a-typecheck.log`、`016-a-build-final.log`、`016-a-lint-final.log`、`016-a-stylelint.log` |
| 真实浏览器 | `E2E_OTA_METADATA_RUNTIME=logs/016-a-runtime.json E2E_OTA_METADATA_FIXTURE=logs/016-a-fixture.json PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers E2E_BASE_URL=http://localhost:3017 E2E_OWNER_EMAIL=e2e-012a@example.com E2E_RUN_DIR=logs/016-a-browser-qualified pnpm exec playwright test ota-metadata-journey.spec.ts`1项PASS/15.3s，`logs/016-a-browser-qualified.log`及目录。真实51域/51键20→40→51，无重复；受控包2→3后旧游标400清旧页并重载新20→40→51；两版基线、已生成产品标识但未登记基线的空集、关闭重开/真实项目切换清理。没有route/mock；唯一OTA写是验证用预签包导入，不代表页面写管理已交付 |
| 首败与复验 | 根初条mvnw工作目录错误NOTRUN，改things-cloud路径实际执行；`016-a-http.log`保留。菜单首次缺新基线而失败；第二轮依赖SchedulingShutdownExitFixture五秒超时，未归因本片或放宽超时；实际重跑101PASS，`016-a-menu.log`、`016-a-menu-baseline.log`保留。材料补空项目时缺必填region400，域/基线已成功不能盲重放，改只读读取历史并真实补空项目，`016-a-provision.log`保留。浏览器首轮在空PUBLISHED类型上70031：真实identity adapter还要求productKey非空，已经真实产品凭据入口补身份（秘密直接丢弃），并补页面前置说明/公共错误，`016-a-empty-identity.log`；首败`016-a-browser.log`保留，不放宽后端身份守卫 |
| 文档与提交 | `pwsh scripts/docs-verify.ps1`含Java一致性PASS，`logs/016-a-docs.log`；最终回执后`-SkipMaven`及`git diff --check`PASS，`logs/016-a-docs-receipt.log`。本片一次本地提交，不推送 |

Node22、Windows、远端CI、公司服务器、真实根/signing服务、制造身份、真实设备刷写与正式交付NOTRUN；WP-03默认MQTT矩阵及G3不继承本片资格。016-C/D/E仍NOTRUN，按顺序接续016-C。

- **016-B回执**：~~016-B~~ — 已完成并验证本地软件范围。2026-10-06，候选`master / 037a1f04`加本片差异；macOS Node26.7.0/pnpm11.22.0/Chromium1234。沿独占PG5547/Redis DB14/8088/Vite3017；冻结JAR SHA256 `db7088a677abf76ae38be0adbfd217e73a5a377113bc2d494ecebd0a515bc527`，公开信任/类型配置摘要`251d358d86e2d81120c19536acf4a0dea4d1a38251d3795393b47bf516e6d1d0`。按PID/冻结制品/监听三重核对，仅替换本人5452→9427→10257；本人signer stub PID9012/动态回环53150，独占私有版本化桶`tc-console-016b-release`。测试明文回环显式开关只在本片独占启动脚本，生产TLS合同未变；8080/3006与共享Broker未操作。

| 范围 | 实际结果与证据 |
| --- | --- |
| 页面与确权 | 固件READY行增加下载入口；OWNER/ADMIN及ota:deploy、项目ACTIVE/当前身份只是前置，每次申领重新读项目/lifecycle，服务端再次检查发布固定对象、当前信任与资格。成功提示只称已发起下载，不冒充收完文件；拒绝后要求刷新 |
| 单次请求与恢复 | POST严格空正文，稳定原幂等键；下载路径401不认证刷新/重放，403/429固定公共错误，网络/5xx结果未知保原键，10010原键重试，10014墓碑不回查地址、明确重新申领。5xx携带10014仍优先按未知处理。`tests/httpIdentity.test.ts`45项及下载API1项PASS，`logs/016-b-api-client.log`；新unknown优先级反例首败`016-b-dialog-unknown-original.log`，修后专项3文件74项PASS，`016-b-dialog.log` |
| 地址生命周期 | 闭集响应、匹配固件及UTC日期，HTTPS或精确回环HTTP、拒绝userinfo/control/backslash/hash；到期取服务端日期与发请求起60秒较早值。短地址/键仅组件内存，临时anchor不挂DOM、no-referrer/noopener/noreferrer；关闭、身份/角色/项目/租户/代次变化清空并拒绝晚响应，忙时防双发；刷新资格不延长旧地址 |
| 后端隐私及真实依赖 | 下载命名空间全部HTTP方法/错误子路径在INFO开启时仍不缓存或打印误放query/body/path；邻接正常请求仍有诊断。`./mvnw -pl things-cloud-bootstrap -am '-Dtest=OtaDownloadRequestLoggingTests,ProductCredentialRequestLoggingTests,OtaReleaseDownloadHttpIntegrationTests' -Dsurefire.failIfNoSpecifiedTests=false test`在things-cloud执行，隐私4项+真实下载10项及依赖PASS，`logs/016-b-http.log`。真实MinIO固定版本覆盖后仍读旧字节、Range206/416、自然1秒技术TTL、未发布拒绝、角色/范围/空正文/10014及签发窗口失权/移除成员/归档/信任变化；1秒技术试验不能替代浏览器管理票据60秒 |
| 真实发布物准备 | 新精确类型真实POST发布及生成产品身份，秘密当场丢弃；临时Ed25519根仅准备内存且已丢弃，发布私钥及signer token仅本人忽略目录0600测试文件。真实POST签包/基线登记、草稿、上传固定MinIO版本、异步受控签名及发布COMMITTED/READY，无INSERT安全事实。公开`logs/016-b-config.json`、`016-b-fixture.json`、`016-b-ready-recovery.log`与独占桶私有/versioned核验`016-b-bucket.log` |
| 真实浏览器 | `E2E_OTA_RELEASE_DOWNLOAD_RUNTIME=logs/016-b-runtime.json E2E_OTA_RELEASE_DOWNLOAD_FIXTURE=logs/016-b-fixture.json PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers E2E_BASE_URL=http://localhost:3017 E2E_OWNER_EMAIL=e2e-012a@example.com E2E_RUN_DIR=logs/016-b-browser pnpm exec playwright test ota-release-download-journey.spec.ts`1项PASS/1.1m，`logs/016-b-browser.log`及目录。无route/mock；临时anchor真实下载51字节、内容/SHA256与固定versionId一致，未导航到签名URL；关开不回显、不再POST。实际X-Amz-Expires=60，自然等待expiresAt/签名起点60秒后GET403且过期分类；DOM/location/storage、浏览器console/pageerror、专用后端四级日志/两次stdout与MinIO本次since日志均针对实际票据及签名布尔检查，无原文附件/trace/video/screenshot |
| 唯一合同与构建 | `python3 scripts/generate-openapi-contracts.py`及OpenAPI71项PASS，输入摘要`9a6514ff243c323dc0f331611d056cffe684e76244ca2269829a881849119017`，HTTP/双端TS无变更；`logs/016-b-openapi.log`。双端api:check、Console最终pnpm build/vue-tsc、ESLint/stylelint PASS，`016-b-api-check.log`、`016-b-webapp-api-check.log`、`016-b-build-final.log`、`016-b-lint-qualified.log`、`016-b-stylelint.log`；全Console142文件1518项PASS，`016-b-all-ui-final.log` |
| 首败与恢复 | 夹具首轮因缺OTA专用bucket创建上传503/70007，在插会话前关闭；补本人私有版本化桶，同JAR精确配置重启，复用已创建真实信任/基线/草稿，`016-b-provision.log`保留。第二轮误把异步PREPARED当最终ADOPTED，实际只读确认COMMITTED/READY并恢复夹具，无重发，`016-b-provision-resume.log`、`016-b-ready-recovery.log`保留。冻结制品初始文件名错误在停止进程前失败，无服务变更；ESLint控制字符正则首败`016-b-lint.log`，等价charCode检查修后PASS |
| 文档与提交 | `pwsh scripts/docs-verify.ps1`含Java一致性PASS；最终回执后`-SkipMaven`及`git diff --check`PASS；`logs/016-b-docs.log`、`016-b-docs-receipt.log`。本片一次本地提交，不推送 |

Node22、Windows、远端CI、公司服务器、真实根/signing服务、制造身份、实物OTA与正式交付NOTRUN；本片测试signer与MinIO成功不继承S13实物/生产signer资格。WP-03默认MQTT矩阵/G3仍开放。016-C/D/E待实施，下一片016-C。



- **016-C回执**：~~016-C~~ — 已完成并验证本地软件范围。2026-10-06，候选`master / 4f072537`加本片差异；macOS Node26.7.0/pnpm11.22.0/Chromium1234。沿独占PG5547/Redis DB14/8088/Vite3017，冻结JAR SHA256 `468c58c0597d261381cf099852c2fa00a51bd868a7b73051368dabfb1b424e22`、公开配置摘要`fe8d4061bc30524f1027d6b7ab18b01cc26b68dd4064b881226fa55c52a206e1`。按旧PID10257/制品/监听核对，仅替换本人后端为13908；新建本人所有权标签`thingscloud.owner=console-016-c`的EMQX6.2.3及Redpanda v24.3.6，管理58083/TCP51883/TLS58883/Kafka59092，保留实际生产认证/ACL、设备mountpoint、v2持久信封、严格TLS、12分区原始消费者与全部24项主题配置；共享服务及8080/3006未操作。

| 范围 | 实际结果与证据 |
| --- | --- |
| 页面与只读边界 | [作业详情](../src/views/ota/jobs/index.vue)接入[回退准备面板](../src/views/ota/jobs/OtaRollbackPreflightPanel.vue)，唯一新请求是GET；当时观察分类/原因/UTC与当前重验分类/原因/UTC分列，保留queryId/reportId、原截止、槽位及字符串修订。恒定`executionAuthorized=false`、`requiresAtomicCommitFence=true`，不增加查询下发或执行按钮；70044无记录单独呈现，不能伪装设备协议UNKNOWN |
| 生命周期与闭集 | [公开模型](../src/features/ota/rollback-preflight-model.ts)校验14字段闭集、UTC最多9位小数/纳秒时序、UUID/安全整数修订/槽位与能力常量；未知字段、坏DTO、翻转权限均关闭。OWNER/ADMIN、ota:read及ACTIVE仅页面前置；角色/账号/租户/项目/身份代次、关闭及晚响应清空。浏览器计时只标陈旧，不改变服务端分类；快速本机钟与服务端重验原因分开陈述 |
| 真实后端 | 在things-cloud执行`./mvnw -pl things-cloud-bootstrap -am '-Dtest=OtaRollbackPreflightIntegrationTests' -Dsurefire.failIfNoSpecifiedTests=false test`：25项及依赖PASS/385.8s，`logs/016-c-http.log`。真实PG/MinIO/Kafka与Broker回退下发；新增真实OWNER读取、匿名、跨租户/项目/活动借作业与归档反例，报告/作业/计数不变。生产60秒自然预检过期及301秒冷却均实际等待；读取常量边界亦复验。`./mvnw -pl things-cloud-ota -am '-Dtest=OtaRollbackPreflightEvaluatorTests,OtaRollbackExecutionEvaluatorTests' -Dsurefire.failIfNoSpecifiedTests=false test`20项PASS，`logs/016-c-preflight-execution-boundary.log`，包含健康/未知目标不构成自动回退候选 |
| 真实MQTT准备 | 已发布固定版本固件、合成根/测试signer与精确回退扩展绑定当前基线完整规范摘要；3个新HTTP设备/ACCESS_TOKEN/绑定元数据、严格TLS MQTT物模型、实际通知/下载授权和序号缺口进入RECOVERY_REQUIRED，再真实预检query/report生成INELIGIBLE、UNKNOWN、PREPARABLE。目标槽HEALTHY、来源INVALID/日志UNKNOWN/来源及日志满足条件分别形成三类；未INSERT安全事实、改钟或重放旧报告。`logs/016-c-runtime.json`、`016-c-config.json`、`016-c-fixture.json`及`016-c-provision-qualified.log`；一次性凭据/原幂等正文仅本人忽略目录0600，下载URL仅进程内存 |
| TLS与环境首败 | 新容器初始端口519092超范围，改59092；首主题创建尚未就绪，待就绪创建24项。镜像示例证书被Python3.14严格校验以缺AKI拒绝；未关闭校验，换本人测试CA与localhost/127.0.0.1 SAN服务器证书，完整KU/SKI/AKI后真实严格TLSv1.3握手PASS，仅本人容器重启。CA摘要`44b8798ea751695973d215ced0e2cac5f27d1d6b07dbd4e85892ae324abe5ce8`，服务器证书摘要`c0ab658b87525e04acc30fa2513651f9d4c7537adb72e6084fa87564485e3350`；测试证书不继承生产证书资格 |
| 真实浏览器 | `E2E_OTA_ROLLBACK_PREFLIGHT_RUNTIME=logs/016-c-runtime.json E2E_OTA_ROLLBACK_PREFLIGHT_FIXTURE=logs/016-c-fixture.json PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers E2E_BASE_URL=http://localhost:3017 E2E_OWNER_EMAIL=e2e-012a@example.com E2E_RUN_DIR=logs/016-c-browser-qualified-final pnpm exec playwright test ota-rollback-preflight-journey.spec.ts`1项PASS/44.3s，`logs/016-c-browser-qualified-final.log`及目录，[可复核旅程](../e2e/ota-rollback-preflight-journey.spec.ts)。无route/mock；三类原查询/报告/截止不变，刷新/关闭重开真实作业完整详情不变，自然原60秒到期只提示陈旧，显式GET才重验INELIGIBLE/QUERY_NOT_CURRENT_OR_FRESH；真实项目切换清空，全程OTA写0。trace/video/screenshot关闭，不捕获凭据或签名地址 |
| 浏览器首败与恢复 | 初始真实PREPARABLE报告目标UNHEALTHY，默认开启的生产OtaRollbackProcessor正确把作业转ROLLBACK_PENDING，`logs/016-c-browser.log`保留；该变化不是GET写入。保留原3设备/查询/报告与v1夹具，不关闭生产执行器、不改历史事实；用3个新目标HEALTHY的设备重备只读窗口。第一复跑早于FIXTURE_READY而缺文件，在登录前失败，`logs/016-c-browser-qualified.log`保留；待公开材料实际保存后上述最终运行PASS。均不盲重放未知POST |
| 唯一合同与构建 | `python3 scripts/generate-openapi-contracts.py`及OpenAPI71项PASS，输入摘要`309c7ecebacf72d31966e09a8e05a01f5ae61965653e898196447e1c0815f5ee`；HTTP及双端TS无变更，`logs/016-c-openapi.log`。双端api:check、Console最终pnpm build/vue-tsc、ESLint/stylelint PASS，`016-c-api-check.log`、`016-c-webapp-api-check.log`、`016-c-build-final.log`、`016-c-ui-lint-corrected.log`、`016-c-browser-lint.log`、`016-c-stylelint.log`；全Console146文件1610项PASS，`016-c-all-ui.log`；专项5文件98项PASS，`016-c-ui-corrected.log`。独立审查修正本机快钟文案与纳秒时序比较，并增加同毫秒反向/跨秒反例 |
| 文档与提交 | `pwsh scripts/docs-verify.ps1`含Java一致性PASS，`logs/016-c-docs.log`；最终回执后`-SkipMaven`及`git diff --check`PASS，`logs/016-c-docs-receipt.log`。本片一次本地提交，不推送 |

Node22、Windows、远端CI、公司服务器、生产根/signing服务、制造身份、实物双槽/掉电原子互斥及正式交付NOTRUN；设备脚本是受控协议参与方，不等于真实固件刷写。WP-03默认MQTT矩阵/G3继续开放；016-D/E待实施，接续016-D。


- **016-D回执**：~~016-D~~ — 已完成并验证本地软件范围。2026-10-06，候选`master / 304a9cf9`加本片差异；macOS Node26.7.0/pnpm11.22.0/Chromium1234。沿本人PG5547/Redis DB14/8088/Vite3017及C独占EMQX/Kafka；冻结JAR SHA256 `394992a310149fa849d494f049dc35baf0f92948fd20812f8bc7d2c0be40d219`。按旧PID13908/冻结制品/监听核对，仅替换本人8088为18002。公开配置`logs/016-d-config.json`摘要`a5108a17c3e0eaf959f30a9ef1282b92539a90b6bc97cc2ed674fcc629d26d44`，完整保留C的52个根配置、2个基线及回退扩展，仅增加2个本项目/真实类型精确临时公开根；合计54根。公开六版材料`logs/016-d-fixture.json`摘要`3f573a1f45fefaa0fc40932408ca8a8d52f75c6dfb3b2ff61b1a674641f7030d`。新根私钥仅离线生成进程RAM，签名自验后进程结束，未导出；页面/测试仅持公开SPKI和签包，未改共享服务或8080/3006。

| 范围 | 实际结果与证据 |
| --- | --- |
| 页面与来源 | [固件页](../src/views/ota/firmwares/index.vue)增加[受控信任包导入](../src/views/ota/firmwares/OtaTrustImportDialog.vue)入口；只载入公开JSON签包，不提供私钥/根配置/在线签名或单键编辑。明确两种离线材料封套：bundle+signature，或附冻结expectedRevision；最终POST严格三字段。展示域、版本、规范包SHA256与逐键版本/Profile/指纹/状态/UTC有效期，提示完整包、历史键保留及撤销可安全暂停活动；数学有效性、根签名与演进始终由后端裁决 |
| 严格原文与公开DTO | [严格解析](../src/features/ota/strict-public-json.ts)与[导入模型](../src/features/ota/trust-import-model.ts)执行64KiB/32层/4096节点/16KiB字符串、fatal UTF8/BOM/重复解码字段/孤立代理/小数/指数/-0/非安全整数反例，避免JSON.parse洗掉原文语义。包及键闭集、严格公开SPKI DER与逐指纹SHA、标准64字节签名、1至64键唯一版本/指纹且恰1 ACTIVE；最终封套仍检预算。当前GET九字段闭集，long修订、安全整数包/策略版本与纳秒UTC先后校验 |
| 前置与原意图 | OWNER/ADMIN、ota:deploy与ACTIVE只是前置，每次提交重读项目；显式GET当前登记才取修订，真实70013首次0须确认精确服务器预配根，读取不证明根存在。每次载材料清旧GET，冻结域/正文/修订/原键；网络/5xx未知与10010仅原意图显式恢复，401无认证重放，错误消息/trace/details不传播。50370010仍保守未知保原键且固定提示根原因，不能直接换键 |
| 完成与生命周期 | 10014仅证明原请求完成，当前GET只辅助核对公开快照；更高/不同/缺失不能恢复原响应或判原写失败。success/10014在同身份RAM记录每域最高已完成版本，不含键/正文；即使后续70013或关闭重开也阻止旧包新键重提，身份/卸载清理，64域有界。新更高材料必须重新GET；关闭/身份/角色/项目/代次变化拒绝晚读取、文件摘要与写响应；忙时防双发 |
| 真实后端与必要修复 | 在things-cloud执行`./mvnw -pl things-cloud-bootstrap -am '-Dtest=QuotaRestRateLimitFilterTests,OtaTrustHttpIntegrationTests,OtaTrustBundleCodecTests,OtaTrustRequestParserTests' -Dsurefire.failIfNoSpecifiedTests=false test`：真实JWT/MockMvc/PG集成13项、签包/解析12项、限流40项及依赖PASS，`logs/016-d-http-final.log`。精确42270011坏签名与有效根签名跨域、40970012陈旧CAS、原体原键10014/异体10009及GET完整摘要/零重复历史审计、归档40350017、移成员原Bearer40120020；不把MockMvc称为socket HTTP丢包。必要修复[限流前置](../../../things-link/things-link-iam/src/main/java/com/things/link/iam/infrastructure/security/QuotaRestRateLimitFilter.java)：仅选中项目的精确POST bundles先查写许可，ACTIVE仍原engine限流/日计量，路径/method/context/跨项目及日硬限/短窗拒绝均复验；未纳入其他OTA写入口 |
| 后端首败与复验 | 首次新增归档反例得到42910029，先按共享夹具实际HTTP节奏补125ms自然补充，仍相同失败，`016-d-http.log`、`016-d-http-qualified.log`保留。进一步定位归档被日计量ACTIVE查询掩盖，按上述精确生产生命周期预检修复后最终PASS；没有关限流、放宽quota或改预期掩盖失败 |
| 唯一合同与前端 | `python3 scripts/generate-openapi-contracts.py`及OpenAPI71项PASS，输入摘要`26753a6ad54dd11a1422c746b42baf9069b1b59fa9db34612f7ea96643c19d5c`，HTTP与双端TS未变，`016-d-openapi.log`。全Console151文件1733项PASS，`016-d-all-ui.log`；专项6文件168项及既有入口/菜单32项PASS，`016-d-unit-qualified.log`、`016-d-host-regression.log`。双端api:check、最终pnpm build/vue-tsc、ESLint/stylelint PASS，`016-d-api-check.log`、`016-d-webapp-api-check.log`、`016-d-build-final.log`、`016-d-lint-qualified.log`、`016-d-stylelint-final.log`；完成版本记录补测后先前构建只作为修前证据。新增预检组件插值折行lint首败`016-d-lint-final.log`及副本`016-d-lint-fence-first.log`保留，格式修后PASS |
| 真实浏览器 | `E2E_OTA_TRUST_IMPORT_RUNTIME=logs/016-d-runtime.json E2E_OTA_TRUST_IMPORT_FIXTURE=logs/016-d-fixture.json PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers E2E_BASE_URL=http://localhost:3017 E2E_OWNER_EMAIL=e2e-012a@example.com E2E_RUN_DIR=logs/016-d-browser-qualified pnpm exec playwright test ota-trust-import-journey.spec.ts`1项PASS/11.1s，`logs/016-d-browser-qualified.log`及目录，[真实旅程](../e2e/ota-trust-import-journey.spec.ts)。合法页面POST200与GET域/修订/包版本/完整摘要/根指纹匹配；坏签名实际422及同根有效签包跨URL域实际422零登记，UI不匹配也不能发送。原键原体再发40910014不推进；第二版实际HTTP200 Response阶段由CDP ConnectionClosed断响应（未fulfill/route/mock或替换JSON），页面未知只有1 POST，实际GET证明已提交，再原键原体恢复10014，键/正文摘要完全相同、GET不再推进。显式读取、关开、真实项目切换清理，签包/SPKI不进入存储，trace/video/screenshot关闭 |
| 浏览器首败与文档 | 首轮在任何POST前用toBeVisible检查ElementPlus隐藏的原生checkbox而失败，`016-d-browser.log`保留；改点实际可见外层并断言原生checked，`016-d-browser-checkbox-lint.log`PASS后上述真实复跑PASS，未改业务或重造根。`pwsh scripts/docs-verify.ps1`含Java一致性PASS，`016-d-docs.log`；回执后`-SkipMaven`与`git diff --check`PASS，`016-d-docs-receipt.log`。本片一次本地提交，不推送 |

Node22、Windows、远端CI、公司服务器、生产根/signing、制造身份、实物OTA及正式交付NOTRUN；临时两域公开根与签包只证明受控机制，不继承生产根或设备资格。WP-03默认MQTT矩阵/G3仍开放，016-E待实施，接续016-E。


- **016-E回执**：~~016-E~~ — 已完成并验证本地软件范围。2026-10-06，候选`master / c90f2f7b`加本片差异；macOS Node26.7.0/pnpm11.22.0/Chromium1234。沿本人PG5547/Redis DB14/8088/Vite3017及C独占EMQX/Kafka，冻结JAR SHA256 `7c6df67f620a4e54a116b6fce7b6c3f70323bd14718cea8aace9b3828d240c09`；按旧PID18002/制品/监听核对替换为22309；再按同样三重核对仅替换本人22309为25019，JAR不变。最终4版公开配置`logs/016-e-config-v4.json`摘要`f516f50d3e89f794ae1aa637a86927952e5c98c094f676fada27d417a30742b6`，公开夹具`logs/016-e-fixture-v4.json`摘要`01cfd01161cceae7c402c707e85ef854824832f5ad2d9595ca2eb1bbdff46e31`，新基线摘要`48e240ab256ee879d6b0421dbd5385503eae3d584b2464f2c11938f2252b59c0`。全部54个根、B基线与回退扩展保留，只有A精确类型的更高版本和公开来源索引改变；不改共享服务、8080/3006、套餐或额度。

| 范围 | 实际结果与证据 |
| --- | --- |
| 页面与当前事实 | [受控基线登记](../src/views/ota/firmwares/OtaTypeBaselineRegistrationDialog.vue)从固件页接入，只选PUBLISHED且有真实产品标识的类型；每次写重新核活动项目/OWNER或ADMIN/类型身份。完整五字段持久快照、22字段声明及嵌套能力闭集，Long修订字符串、安全整数、Java引导版本上界、纳秒UTC先后和完整JCS SHA256校验；逐项展示false/0，不提升能力，不提供JSON/能力开关/制造证据输入，也不能预览服务器未公开的当前配置 |
| 项目租户与身份 | 独立复核发现登录租户与项目计费租户可能不同，原客户端比较会误拒受邀跨租户ADMIN的正常GET/POST。修正业务范围只精确项目/类型/productKey，响应tenant始终严格UUID，完整摘要及当前身份校验后同类型RAM绑定服务端租户（最多64）；已观察租户变化拒绝，70031首次无租户证据不假设登录租户。身份范围仍包括登录租户/账号/权限/代次，变化及卸载清绑定/原意图，迟响应不串入新身份；新增跨租户GET/POST、首次登记、非法UUID/换租户/晚响应反例 |
| 原意图与完成 | POST严格只有冻结expectedRevision，专门HTTP单次发送，401不认证重放、网络/5xx与10010仅显式原键原正文恢复。50370028保守未知并显示精确配置不可用原因；10014只结束原请求，GET是当前快照，不能冒称恢复原响应。未知/在途关闭仅清公开目录/视图，重开恢复原类型原键；同身份完成CAS槽最多64类型，后续新意图须fresh GET修订大于已完成槽并重新确认服务器配置更新，不能从缺失GET推旧请求失败 |
| 真实后端与必要修复 | 在things-cloud执行`./mvnw -pl things-cloud-bootstrap -am '-Dtest=QuotaRestRateLimitFilterTests,OtaTypeBaselineHttpIntegrationTests,OtaTypeBaselineCodecTests,OtaTypeBaselineSourceTests' -Dsurefire.failIfNoSpecifiedTests=false test`：44限流、10真实JWT/MockMvc/PG、7配置/codec共61项及依赖PASS，`logs/016-e-http-final.log`。完整摘要/GET/no-store、墓碑无重放/异体10009/历史审计零重复、归档40350017、撤成员旧Bearer40120020、当前类型DRAFT/删除42270029与原子回滚等通过。必要修复限流前置只增加选中项目的精确POST baseline/registrations写许可预检，ACTIVE仍原engine/日计量；首轮归档POST实际42910029失败，`016-e-http-first.log`保留，没有放宽期望掩盖生命周期分类 |
| 唯一合同 | `python3 scripts/generate-openapi-contracts.py`及OpenAPI71项PASS，输入摘要`df2ec1aad579608d18a954bfc2ed7f27bcfe0c052f4f2bfd6fd4f624e84bc92e`，HTTP/双端TS未改变；`logs/016-e-openapi.log`。双端api:check PASS，`016-e-api-check.log`、`016-e-webapp-api-check.log`；源码与生成合同不手工同步 |
| 前端与构建 | 目录恢复修后5专项180项PASS，既有入口/菜单34项PASS，完整Console155文件1856项PASS；`016-e-unit-directory-final.log`、`016-e-host-regression.log`、`016-e-all-ui-directory-final.log`。最终pnpm build/vue-tsc、范围ESLint/stylelint PASS，`016-e-build-directory-final.log`、`016-e-lint-directory-final.log`、`016-e-typecheck-directory-final.log`、`016-e-stylelint-directory-final.log`，最终spec ESLint `016-e-browser-v4-lint-qualified.log`PASS。新增目录反例的get().exists类型错误首败`016-e-typecheck-directory-qualified.log`保留，改find().exists后通过；首格式命令在平台根NO_PACKAGE未执行，纠正Console目录后通过。修前172/179专项及1855全量/旧构建仅保留历史证据 |
| 受控版本与失败保全 | 初始3版公开配置摘要`9d816368d87816a14ff302336b2fe50ed33e21dc551159aee231f29058b61b6f`、夹具摘要`c1adf824845212f9791c79474c34b4273a719d1e91db7f86ca521d0b8177011e`，新基线摘要`42a6bf000d54b42a1d14f5e6f7a4da30b700b329e785fa238dc2da1758200ee5`。材料首次将历史baselineVersion当字符串导致只读断言失败，`016-e-materials-first-failure.log`保留，按真实数字DTO纠正。浏览器首轮公开行相对locator错误，在任何登记前失败，`016-e-browser.log`；纠正dt/dd后第二轮已观察3版200、CDP断响应、原键10014及完整历史不重复，但最后开始新意图后选未配置类型下拉等待超时，整场FAIL，`016-e-browser-qualified.log`。定位到未知关开将目录缩成原类型，10014后newIntent没有重载目录的真实页面缺陷，补全目录刷新及完整恢复后再选第二类型反例；两个只读诊断的API/DOM观察确认实际7类型含空类型，业务POST均0，诊断在弹层关闭/native输入点击受阻时分别FAIL（`016-e-select-diag.log`、`016-e-select-diag-qualified.log`），不认领为完整旅程PASS。只读重核3版完整摘要/历史3,2,1及空类型PUBLISHED/70031/空史，`016-e-materials-v4.log`：businessPOST0；保留3事实，准备全新4版配置/意图，不SQL清库、重写安全历史或重放已完成3意图 |
| 最终真实浏览器 | `E2E_OTA_BASELINE_REGISTRATION_RUNTIME=logs/016-e-runtime-v4.json E2E_OTA_BASELINE_REGISTRATION_FIXTURE=logs/016-e-fixture-v4.json PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers E2E_BASE_URL=http://localhost:3017 E2E_OWNER_EMAIL=e2e-012a@example.com E2E_RUN_DIR=logs/016-e-browser-v4-final pnpm exec playwright test ota-baseline-registration-journey.spec.ts`1项PASS/11.1s，`016-e-browser-v4-final.log`及目录，[真实旅程](../e2e/ota-baseline-registration-journey.spec.ts)。先真GET当前3版完整公开声明（不能显示未来4版来源），真实POST expectedRevision3/200仅在Response阶段CDP ConnectionClosed断响应；页面未知只有1请求，GET新4完整Hash/22声明/原registeredAt及全历史4,3,2,1。关开仍只有原类型原键，再POST相同键/body摘要得40910014不推进；当前GET明确仅权威快照。新意图重读全目录后真实选择另一PUBLISHED类型，GET40470031/首次0+显式配置确认→实际POST50370028；历史仍空、不伪造10014/成功。未知关开仍原目标、真实切项目销毁能力、存储不含键；OTA登记总3次，trace/video/screenshot关闭，没有route/mock/响应替换 |
| 文档与提交 | 完整`pwsh scripts/docs-verify.ps1`含Java一致性PASS，`logs/016-e-docs.log`；最终回执后`-SkipMaven`与`git diff --check`通过，`016-e-docs-receipt.log`。本片一次本地提交，不推送，提交号以Git定位本回执变更 |

Node22、Windows、远端CI、公司服务器、真实生产根/signing、制造身份与实物OTA/正式交付NOTRUN；受控启动配置及合成声明只证明本地软件机制。WP-03默认MQTT矩阵/G3不继承本片资格；WP-06五片本地软件范围关闭，按顺序接续017-A；外部资格保持NOTRUN。


## TODO-017 看板与应用软删除

- **编号/工作包**：~~CONSOLE-TODO-017 / WP-07~~。
- **状态**：~~017-A~~、~~017-B~~ — 已完成并验证本地软件，WP-07关闭本地软件范围。
- **代码事实**：[看板发布API](../src/api/dashboard-publication.ts)已接入软删除；[应用发布API](../src/api/application-publication.ts)已由017-B接入软删除，既有发布、撤回及回滚保持同一管理模型。
- **接口**：`POST /api/v1/projects/{projectId}/dashboards/{dashboardId}/soft-delete`、`POST /api/v1/projects/{projectId}/applications/{applicationId}/soft-delete`。
- **合同**：[ADR0100](../../../.private/thingslink-docs/docs/adr/0100-dashboard-access-and-publication-metadata.md)及现有发布元数据合同；V1软删除不恢复，撤回不等于软删除。
- **~~017-A~~交付（已完成并验证）**：看板软删除及确认、CAS/权限/生命周期拒绝反馈及引用后果说明，删除后目录与编辑状态刷新。当前后端允许删除被应用引用的看板，不预设必须解绑；历史引用与grant保持可审计，运行资格按每次读取裁决。
- **~~017-B~~交付（已完成并验证）**：应用软删除及确认、发布入口与编辑状态刷新；复用既有发布管理，不引入另一套版本状态。
- **验收**：当前权限、ARCHIVED写拒绝、引用约束按后端实测（不预设可删或不可删）、CAS/幂等按实际合同、重复/结果未知、删除后旧入口/分享/用户授权的服务端拒绝；隔离浏览器验证，不以隐藏列表替代服务端失效。不添加恢复按钮。
- **017-A片前决策/验证选择**：候选`master / e26282a3`，开片清洁；已读ADR0100、0101与发布元数据合同并对照Controller/SQL。沿既有publication单发端口增加SOFT_DELETE，严格只有expectedPublicationRevision，204无正文；V1不恢复、允许所有发布态及被引用看板软删，不自动删除草稿/历史/应用引用/用户历史grant。独立删除终态处理，未知原key/body与10010保持，读取404不能证明自己的原写或许可换key；10014仅原请求已完成。删除未知/在途暂停编辑/autosave/导航/分享/grant/preview而保留恢复组件，仅确认终态后清当前编辑/路由并重读目录，迟响应不能复活。核真实非NULL日额度下归档分类，必要精确前置修复同片交付；真实管理HTTP删除后验证旧分享/App精确schema失效，App其他可见引用与历史grant不被伪删。根统一Maven/生成/构建与独占运行栈，子agent按前端/后端/浏览器文件分工；新增本人匿名WebApp4017及当前真实宿主登记，不调用会重置共享Broker的默认Runner。
- **017-B片前决策/验证选择**：候选`master / 780c73ed`，开片清洁，按统一顺序接续。原应用publication读取404/60030会accessDenied→宿主invalidate→清id卸载组件，确认这是删除未知时丢原key的前端差额；仅SOFT_DELETE UNKNOWN全资源60030/无业务码整体404改为清公开view但保资源id、原publication组件/key，60048单历史版本缺失不扩大为全资源。401/403/相关应用权限、identity/project/tenant/roles撤销仍强清；等值info刷新及独立看板选择权限变化保持既有应用身份行为。复用A独立204/10014终态与同key/body恢复、严格CAS正文，保应用API既有有界fetch/read；编辑模型推进代次清view可保id，host删除锁冻结表单/save/目录切换/创建/重载/比较/候选/导航，离线保原intent，终态清所有应用view并刷目录/失败可重试。后端核fresh非NULL日额度归档及撤员原Bearer；真实管理软删应用后旧App入口和schema拒绝，但所引看板、独立share及历史grant/草稿/版本/ref仍保留。本地真实Console浏览器与原生HTTP只用本人隔离栈，当前真实受管宿主按摘要继续核验；后台缺陷仅实测确认后同片修，不预设需改生产。
- **017-B现场补充**：新后端三反例真实首跑全PASS（`logs/017-b-backend-first.log`，41.443秒），不虚构生产修复。独立复核发现应用及已提交看板模型同源离线在途差额：same-scope删除write等待期间available暂失，迟到204/transport错误未采纳却未提升ambiguity，联网后原键明确404可能误清UNKNOWN。017-B同片补两模型与真实deferred反例；实际采用retainUnobservedDeletion：只有同代、同identity/project/resource且读/管理权限仍有效、暂不可用导致write成功或transport错误未采纳时，提升原意图不确定性；首个明确CAS/400/404拒绝不扩大为UNKNOWN，identity/权限撤销仍强清。原017-A首败和PASS回执仍是当时实际范围，新边界由017-B修复/复验记录，不倒改原证据；当前单元、完整UI及真实浏览器回归已通过。另收紧目录sequence，删除锁推进并清旧目录，防在途list迟回填。
- **回执**：~~017-A~~、~~017-B~~ — 已完成并验证下列本地软件范围，各自记录实际结果。

### 017-A 本地软件回执

候选为`master / e26282a3`加本片范围差异，Console、后端测试与真实WebApp宿主统一在平台目录；macOS/Node26.7.0/pnpm11.22.0/Chromium1234。生产后端合同已具备，本片没有确认需改生产逻辑；新增真实JWT/MockMvc/PG安全及传播反例。确认文案明确只影响此看板的运行与分享，App其他授权看板仍可运行；历史草稿、版本、精确引用、ACTIVE分享记录及历史grant保留，每次读取重新裁决。

SOFT_DELETE只发送一次、严格闭集CAS正文；204空回执和原请求10014完成标记分别呈现。未知/10010/5xx保留原key/body；GET404仅清失效视图，不能证明原操作完成。仅同身份、同项目、同资源且组件在场时保留RAM恢复，离线不销毁原意图，恢复联网后显式原请求重试；硬刷新不宣称找回RAM原键。未知或在途冻结编辑、autosave、导航、绑定及分享/grant/preview；身份撤换同步强清、迟save/read/router不能回填。终态清编辑及设备绑定，清路由、刷新目录；路由抛错或正常返回取消都有固定失败提示和显式返回重试，不复活已删资源。

| 实际验证 | 当前结果与证据 |
| --- | --- |
| 后端合同与传播 | 四类完整178项PASS（57管理、64管理/发布集成、13匿名分享、44限流过滤），`logs/017-a-backend-final.log`，63秒。fresh非NULL日额度25归档403/50017、撤员原ADMIN Bearer401/20020，删除/审计/REST日事实无增量；引用看板真实管理POST204后旧share context/schema404/60053、旧App精确schema404/60023，其他entry/current200，历史grant读取200/再写404/60025；原键10014/异body10009且只增一审计，不SQL伪删除 |
| 保留首败 | 首HTTP3项中2安全项通过，传播用例遗漏App schema必填expectedPublicationRevision导致删除前400/10001；按Controller补唯一参数后通过，`017-a-backend-first.log`保留。首前端host测试桩把null-prototype schema透传DOM导致5失败/20未处理异常，API/model/component/composable78项已通过；修桩后补真实路由取消/身份/迟响应反例，最终14文件154项PASS，`017-a-unit-first.log`、`017-a-unit-final.log` |
| 生成契约 | 仅根`python3 scripts/generate-openapi-contracts.py`，71守卫PASS，`017-a-openapi.log`；输入SHA`19c5734610fc71bf2dd3335017292923e656152799b640c645e674bf98fa4aaa`，HTTP/双端TS字节未变（复用既有合同），两端api:check PASS |
| 前端静态与构建 | 专场154项、范围ESLint/vue-tsc/stylelint PASS，`017-a-lint-first.log`、`017-a-typecheck-first.log`、`017-a-stylelint.log`；根`pnpm build`含共享合同、Vite20.74秒及vue-tsc PASS，`017-a-build.log`；完整UI156文件1902项PASS（18.94秒），`017-a-all-ui.log`；真实浏览器首轮54.2秒失败于重开看板未先选中文本组件，软删POST0，此前真实双看板创建/保存/发布、share与App精确schema/READ grant均已通过，`017-a-browser.log`。修测试操作后同冻结候选新对象复验，第二轮38秒已实际软删204、终态router清理释放Chromium响应资源，测试后读204 body失败（`017-a-browser-qualified.log`）；修transport观测、不延迟终态业务导航，原事实保留，最终完整旅程已PASS，不SQL重置或重发既有写键 |
| 当前独占栈 | package PASS28.196秒，冻结JAR SHA`3ef75d92702f702562ef81b00ce0b413e9c043983da24d25ef4f47467df7ed3a`，`017-a-package.log`；仅核旧PID25019/旧JAR摘要与8088端口后替换为本人PID29123，保留PG5547专库/Redis14/生产OTA workers、独占TLS Broker58883/Kafka59092和既有OTA事实。新WebApp4017 PID26901真实GET200，实际build/register独占宿主1.0.0，制品SHA`563f40146b39e90183e9088461f1693c63c95195b956876586b7cf51f1626266`、描述SHA`0db644de2593f6fad0bbb44e82ddd16d84f4d27c85261cbcfa967701b029ba97`，`017-a-webapp-build.log`、`017-a-host-register-qualified.log`；首次登记相对registry被明确拒绝，改绝对路径后成功，不改产物 |
| 实际浏览器 | `e2e/dashboard-soft-delete-journey.spec.ts`最终1场PASS/1分钟，`logs/017-a-browser-final.log`；真实页面建存发布target/survivor/unknown三个看板，原生HTTP签发share、创建并发布双精确引用App及两READ grants，删除前全部200。target页面实际POST204后清编辑/绑定/preview/share/grant、路由与目录，管理detail/draft/history/version404/60034，旧分享404/60053、App此看板schema404/60023；其他看板精确schema/current200，App目录/版本和历史grant全文hash未变。新unknown实际204在CDP Response阶段ConnectionClosed只丢传输，UI冻结/原GET404仍保恢复；同原key/body/资源POST409后严格10014完成标记终态，三次删除POST无新键，浏览器存储无原键。204导航后响应体不可再从CDP读取，因此浏览器核状态及无Location/零或无Content-Length，空体另有上述真实MockMvc证据；409完成码由API解码后的严格终态和原键一致性证明，不额外重发写请求 |
| 运行材料及复现 | 公开配置SHA`5ccf6bc05c79132abdda81edf57f73509636e949c3297e9f86b88cb0c94c5a2a`、fixture SHA`14ea2c32c82bc9f3d36fd30e63f088a0616a457f6ee57a83385822de956b7bf7`，`017-a-config.json`/`017-a-runtime.json`/`017-a-fixture.json`；最终公开IDs/状态检查点`017-a-public-checkpoint-5ed76fac-e524-4c6c-b12a-87e4e9b27228`，只存公开身份/修订/状态，不存分享能力、App JWT、密码或原键/正文。Console目录设置`E2E_DASHBOARD_SOFT_DELETE_RUNTIME=logs/017-a-runtime.json E2E_DASHBOARD_SOFT_DELETE_FIXTURE=logs/017-a-fixture.json E2E_OWNER_EMAIL=e2e-012a@example.com E2E_BASE_URL=http://localhost:3017 PLAYWRIGHT_BROWSERS_PATH=.playwright-browsers E2E_RUN_DIR=logs/017-a-browser-final`运行`pnpm exec playwright test dashboard-soft-delete-journey.spec.ts`；重跑新对象保留旧事实，实际材料严格核本人PID/端口/候选/宿主及配置摘要 |
| 文档与提交 | 完整`pwsh scripts/docs-verify.ps1`含Java一致性PASS，819根/模块Markdown及23链接反例，`017-a-docs.log`；最终回执后`-SkipMaven`及`git diff --check`通过，`017-a-docs-receipt.log`。本片一次本地提交，不推送，提交号以Git定位本回执变更 |

Node22、Windows、远端CI、公司服务器、实物终端及正式交付NOTRUN；当前真实传播是Console浏览器与原生HTTP，不宣称实际匿名分享/App画布浏览器资格。父WP-07仍等017-B，WP-03默认MQTT矩阵及G3不继承本片结果；按统一顺序接续017-B。

### 017-B 本地软件回执

候选为`master / 780c73ed`加本片差异，macOS/Node26.7.0/pnpm11.22.0/Chromium1234。后端生产合同足够，本片未改生产Java或SQL；同片新增真实权限/生命周期及删除传播反例、Console软删除完整交互与A/B离线未采纳结果回归修复。删除允许未发布/发布/撤回等现有状态；仅改变应用目录删除标记/发布指针/修订，保留草稿、历史版本、精确看板关系、所引看板及其独立分享、用户历史grant。

| 实际验证 | 当前结果与证据 |
| --- | --- |
| 后端首轮与完整回归 | 新三反例首跑PASS，`logs/017-b-backend-first.log`41.443秒；完整5类120项PASS（75应用管理、14匿名分享、15精确schema、11current、5公开resolve），`017-b-backend-final.log`53.416秒。fresh daily25归档403/50017和撤员原ADMIN Bearer401/20020均零增量；真实管理POST204后原App JWT current/schema及匿名resolve404/60023；独立看板/分享200，草稿/version/ref/grant/share原事实保留、目录指针清空/修订+1/仅一删除审计，原键10014、异body10009。前置版本/分享是专库封存夹具，实际发布/签发由下方浏览器另验；不SQL伪删除 |
| Frontend及共享回归 | `017-b-unit-first.log`6文件170项PASS，host扩展7文件185PASS（`017-b-unit-host-first.log`），最终关联12文件265项PASS（`017-b-unit-regression.log`）；新整体404清view保id与child/key、离线未采纳真实deferred成功/错误后原404保键及首次明确拒绝、身份撤销、目录/compare/chooser迟响应、冻结全部编辑/导航、终态目录失败可重试。该源实际方案见上方现场补充，修A模型最小同源边界，不改017-A原始PASS资格。完整UI157文件1967项PASS（18.98秒），`017-b-all-ui.log`；scoped ESLint/vue-tsc/stylelint PASS，`017-b-lint-first.log`/`017-b-typecheck-first.log`/`017-b-stylelint.log`；本轮前端专场无首败 |
| 生成/构建 | 唯一根生成器71守卫PASS，`017-b-openapi.log`，输入SHA`eaa09ca19b4f48e8617da71176a7ac7e01d945b62c7b04e074f71891032e2d07`；HTTP与双端TS字节仍与017-A一致，两端api:check PASS。`pnpm build`共享合同/Vite13.43秒/vue-tsc PASS，`017-b-build.log`；JAR package PASS25.970秒，`017-b-package.log` |
| 冻结独占运行栈 | JAR SHA`a76901cbe031c456c5ed0af6b3e30e33cd7d00f0e7731312fab61ab178d33a09`，本人旧PID29123/旧JAR/8088端口三重核对后替换为PID33120；own PG5547专库/Redis14/TLS Broker58883/Kafka59092、OTA启动配置/worker及历史事实保持。复用017-A当前真实WebApp4017 PID26901、host1.0.0制品/描述固定摘要，HTTP/双TS未变，不将另一宿主构建冒称本片运行。公开配置与A同字节SHA`5ccf6bc05c79132abdda81edf57f73509636e949c3297e9f86b88cb0c94c5a2a`；`017-b-prepare.mjs`真实只读核own栈及项目、JWT/cookie仅RAM/业务POST0，`017-b-prepare.log`；新wx fixture SHA`99fd9a392c6f1dc65e8a6b00ab4c088a1b44d2496e46467d0c600ce1d46f1ed2`，新`017-b-runtime.json`严格绑定配置/fixture/JAR/PID/host描述 |
| 真实浏览器 | 首轮`017-b-browser.log`28.1秒FAIL，软删POST0：第二次create201后脚本仅等待任意UUID，误读未卸载旧草稿id，未等新草稿加载就编辑，PUT响应等待超时；API实际PUT正确，未修改业务或重放旧对象。修正spec为本次create公开id与名称精确等待、保存后修订1及表单完成等待，scoped lint PASS（`017-b-browser-lint-draft-qualified.log`）；新对象复跑`017-b-browser-qualified.log`1项PASS（1.0分钟）。真实UI创建/保存/发布看板与应用、保存未发布应用；管理204后原App三入口404/60023及管理四读取404/60030，而看板四读取、独立分享context/schema、READ grant均200且持久内容摘要一致，share只排除合法瞬时时间historyAnchorAt；历史授权目录仍包含ACTIVE/revision1。与017-A一样只核HTTP204/headers及10014严格终态避免CDP导航资源读取竞态；原键/正文等价只RAM计算，不放Playwright参数/公开checkpoint。未发布应用删除真实204 Response暂停时切`context.setOffline(true)`，真实offline晚响应后联网读取404仍保原恢复，原键10014终态；实际三次删除POST（目标、未知原请求及原键重试），恢复请求严格同key/body/resource；目录与编辑/compare/chooser终态清空、未知时编辑及导航冻结、无浏览器持久key。trace/video/screenshot关闭，JWT/能力/key只RAM，旧首败数据未重置 |
| 文档门禁 | 完整`pwsh scripts/docs-verify.ps1`含Java一致性PASS，`017-b-docs.log`30.510秒；最终回执后`-SkipMaven`和`git diff --check`PASS，`017-b-docs-receipt.log`（819文档/23语法案例），本片一次本地提交，不推送，提交号由Git定位本回执 |

Node22、Windows、远端CI、公司服务器、实物终端、真实WebApp画布浏览器及正式交付NOTRUN；native传播与Console浏览器只属本地软件。WP-07两片关闭本地软件范围，WP-03默认MQTT矩阵/G3不继承以上通过；按统一顺序接续BE-001-A设计。公开检查点`logs/017-b-public-checkpoint-01d0c147-317a-480d-87b7-1de867aeaaa6`：保留看板`01a11322-7068-724a-bd1d-79deaf70cdba`/版本`01a11322-7b98-7b6e-875d-595c2893f515`，已删应用`01a11322-7e15-7d39-bf00-fcb6a07cd9c1`/版本`01a11322-7f48-71ae-86de-bb61b2d94970`，未知后原键完成应用`01a11322-7fe0-7c7c-8cbc-90fcb23ac043`；不记录秘密。

### 本轮规划回执

仅新增七个工作包及十四个功能子片的计划，所有业务实施与业务验收均为NOTRUN。
验证候选为`d5e24018`加本轮两个文档差异，环境为macOS本机；根目录 `pwsh scripts/docs-verify.ps1` 退出0，
包含全仓Markdown路径检查及Java文档一致性测试，最终`Documentation verification passed`；`git diff --check`通过。
新增正文的38个本地链接及精确标题锚点人工脚本核对通过（README 8项、TODO工作包正文30项）。
原始门禁日志位于Console忽略目录 `logs/console-gap-plan-docs-1791298148229888000.log`，缺失时在平台根重跑上述文档命令；
日志不是业务验收证据。本轮未运行前端构建、单元、浏览器、业务后端、远端CI或部署验证；不继承审查轮契约检查为业务通过。
没有提交、推送或操作独立Jagonzn仓库；既有官网工作区修改保持原状。


## 分类复核回执

2026-10-06，平台`d5e24018`加本轮文档差异；重新扫描TODO-001至010的后端Controller/OpenAPI、前端API及页面消费者。
该次接口接线复核曾将001至009整体判为完成；后续页面交付复核发现003独立数量卡片遗漏，已撤销其父项完成标记。以下测试结果仅保留当时实际范围，不能证明未实现卡片通过；010仍保留扩展验收差额。
新增BACKEND_TODO仅承接原004的两个独立候选，保留所有原任务标题及第四轮历史证据；同步文档索引、Console README与AGENTS维护规则。
本轮没有业务源码修改，没有启动七个新工作包，没有修改平台当前执行轴。

| 实际验证 | 本轮结果 | 环境与证据 |
| --- | --- | --- |
| `pnpm build` | PASS，包含共享合同校验/构建、Vite生产构建和vue-tsc | macOS，Node26.7.0、pnpm11.22.0；不同于推荐Node22/pnpm11.9，不继承其工具链资格 |
| `pnpm test --maxWorkers=2` | PASS，123文件1237项，零失败 | 当前源码单元/组件回归；覆盖本轮复核的既有页面，不等于真实浏览器 |
| `pnpm api:check` | PASS，OpenAPI生成类型一致 | 只证明类型同步，不等于运行接口或页面闭环 |
| `pwsh scripts/docs-verify.ps1` | PASS，退出0，Java文档一致性16项通过 | 根目录完整文档门禁；包含模块及独立仓库入链检查 |
| 本地链接与精确标题锚点核对、`git diff --check` | PASS，三份任务/索引文档98处本地链接及标题逐项通过，差异无空白错误 | 保留旧标题，修正本文件旧Agent标题链接；首次检查因回执标题尚未写入失败，补齐后复验 |

Console忽略目录原始日志：`logs/todo-rescan-build-1791298744159466000.log`、
`logs/todo-rescan-tests-1791298744159466000.log`、`logs/todo-rescan-api-1791298744159466000.log`。

历史浏览器与真实后端资格沿各TODO原候选回执，本轮未重跑浏览器、业务后端整合、付费模型、Windows、远端CI或部署。
本轮只核对文件和运行前端本地验证，不读取项目Key，不操作共享服务或独立Jagonzn；全仓文档门禁可只读扫描Jagonzn文档。
构建期间既有依赖输出Node实验性localStorage及废弃API提示，退出0；不改写为Node22验证。
未提交、未推送；既有官网差异保持原状。

完整文档门禁原始日志：`logs/todo-rescan-docs-1791298802583732000.log`。


## 开发者工作台重构计划

### 定位与规划基线

目标是“围绕项目和设备开发流程的开发者工作台”，首屏回答：当前开发什么、下一步做什么、哪里需要处理。
继续使用Vue 3、TypeScript、Element Plus、Vue Router、Pinia、ECharts及既有SCSS/Tailwind；复用Art布局、业务域注册及现有API。
沿用“设备类型/物模型”业务实体，不额外建立“产品”数据模型。视觉采用浅色底、细边框、清晰主操作及适量留白；深色和自动主题保留。

本次以平台`1181c93c`加已有`deploy/README.md`工作区差异为规划基线。已核对本地package、布局配置、路由/菜单生成、概要源码、设备/项目API及根OpenAPI路径。
没有打开运行页面做视觉对照，也未核验涂鸦实时页面；用户提供的参考作为设计方向，不能作为本项目视觉验收证据。
以上为规划阶段回执；其后负责人明确授权6包7片连续实施，当前实施与验收结果见下方各切片回执。

| 源码事实 | 对计划的约束 |
| --- | --- |
| `MenuProcessor`在backend模式调用`/api/v1/system/menus`，`MenuCatalog`提供菜单，前端模块为兜底；双端已有菜单合同测试 | 新首页入口必须前后端同片交付；导航分组需核对双端与权限，不能只修改前端模块后宣称真实菜单已生效 |
| `HOME_PAGE_PATH`为空，首页由第一个有效菜单派生；概要为固定标签 | 登录落点、无项目落点、固定标签与旧标签恢复一起迁移，不能只改菜单顺序 |
| 概要消费后端聚合，已有设备总数、在线/告警设备数、严重度分布、比例、流量与统计时间 | 旧页保留为“项目概况”，保留`/dashboard/overview`深链及全部统计含义；不得再漏告警设备数卡片 |
| `setting.ts`与`page-presentation.scss`已有统一配置；当前默认侧栏230px、页面共享间距10px | 优先复用变量和组件；工作台宽松布局单独分层，避免全局放大导致表格、设计器、日志不可用；持久化设置须兼容 |
| 现有API提供项目、设备类型、设备、接入配置、消息/事件、规则、应用/看板及概要 | 首版复用读取与写入合同；不假设已有跨资源开发进度、跨端最近访问或全量待处理聚合接口 |

### 首页结构与状态规则

首屏骨架：全局顶栏（项目切换、帮助、账号）→ 当前项目与按权限显示的主操作 → 开发流程入口 → 最近访问与待处理摘要 → 接入帮助。
工作台新增独立页面，建议路由`/dashboard/workbench`；有项目且可访问时作为默认页。无项目时展示选择/创建项目入口，按现有权限保留邀请、项目回收站与恢复路径。

| 区域 | 内容与数据依据 | 交互及异常状态 |
| --- | --- | --- |
| 项目上下文 | 当前项目名称、角色、进入项目概况；一项最相关主操作，其他操作降为次级 | 无项目、无创建权限、已删除项目分别处理；换项目立即清除旧内容与旧请求结果 |
| 开发流程 | 定义物模型 → 创建设备/接入 → 上报调试 → 配置规则 → 应用看板；连接真实既有页面 | 表示建议路径，不是必须依次执行的向导；不能以“项目有一条规则”推断当前设备已配置完成，也不凭点击记录显示完成百分比 |
| 最近访问 | 首版使用本机、当前账号和项目内实际访问的设备类型/设备/应用引用，上限与过期策略在018-A冻结 | 清楚命名“本机最近访问”，可清空；不存密钥/令牌/业务正文；注销清除、身份代次隔离，进入前复核权限及对象存在；没有记录就显示快捷入口 |
| 待处理摘要 | 复用概要的告警设备数及已获准读取的用量/额度；保留数据生成时间和来源 | 不将设备数标为告警条数，不把失败/未知显示为0；若没有后端聚合就使用入口，不扫描全量分页拼总数 |
| 帮助与接入 | 与当前设备类型/协议有关的接入资料、消息调试和API帮助 | 文档必须在运行环境可访问；仓库相对文件路径不能直接充当浏览器帮助链接，部署方式在018-A确认 |

首页读取按模块独立加载、失败可重试；没有权限的模块不发请求。只加载必要小批量数据，不循环全表，不为每张卡重复读取同一概要。
“上报成功”必须有实际设备事实；在线仅代表当前连接状态，不能等价于物模型/上报/规则全流程成功。
所选类型/设备跨页面传参只携带允许的对象标识，到达页面后重新校验当前项目与权限；不通过URL传密钥或未确认的写操作。

### 导航与页面组织方案

采用全局顶栏、业务侧栏、页面内标签三个层次。侧栏保留中文文字与折叠模式，具体宽度在原型实际视口验证后冻结，不直接照搬图标窄栏。
工作标签页先保留；模块标签只表达同一个对象的子视图，避免同级内容同时出现在两套标签中。

| 一级入口 | 页面归属 | 迁移要求 |
| --- | --- | --- |
| 工作台 | 开发首页、项目概况 | 新增行动首页；旧概要完整保留，旧URL不跳走到另一含义的页面 |
| 设备开发 | 设备类型/物模型、设备列表与接入、设备组、拓扑、Modbus点位、消息调试、固件/OTA活动/作业/审计 | OTA作为组内工作区，保留既有读取/部署/受控信任权限；设备详情保留事件、历史、命令、影子、关联和只读Agent入口 |
| 规则与自动化 | 消息规则、自动化、手动场景、执行记录、任务调度 | 不合并底层业务实体，不把查看记录变成触发执行；失败反馈保留实际来源 |
| 运行与告警 | 告警规则、告警历史、通知组、通知模板及投递记录 | 保留显著处置入口，避免开发导向使已有告警功能难以发现；投递查询保持现有合同 |
| 应用与看板 | 应用管理、看板设计/版本/发布等现有入口、项目终端用户管理 | 终端用户与项目成员分开；草稿、发布、撤回、软删除、预览预算及旧分享拒绝均保留 |
| 项目与资源 | 项目列表/切换、成员/邀请、API Key、Webhook、设置/用量、项目回收站及留存导出、现有Agent项目配置 | 保留无项目访问路径及额度限制；本轮不关闭012对象账本债务或010-D真实模型资格 |
| 账号与平台工具（辅助入口） | 个人中心、套餐目录、系统状态、商业运营、自部署申请/审核等原有页面 | 按原身份与权限呈现，不混入普通项目开发步骤；不改变内部V1和暂停范围 |

以现有完整路由清单制作“旧菜单→新分组→原URL/路由名→所需权限→入口”映射，所有业务入口有去向。
优先保持叶子URL、路由名、域源码归属稳定，导航展示分组与实际路由注册解耦；若必须改树或路径，同片补兼容映射、面包屑、激活态及旧书签验证。
不能直接把现有绝对叶子路径塞进新父节点：当前路径校验/拼接有约束，须验证MenuProcessor、注册器及合同快照后选定迁移实现。

### 工作包与统一顺序

本次新增6个工作包、7个功能切片。设计、代码、后端接线、文档和验证属于各片内步骤，不按工序重复拆片。
负责人已明确授权6包7片连续推进；6包7片已完成并验证本地软件范围。逐片验证、本地提交、不推送；旧任务完成线和旧候选回执不继承为新UI验收。

| 顺序/工作包 | 切片 | 交付内容与范围 | 后端责任/前置 | 完成定义 |
| --- | --- | --- | --- | --- |
| ~~1 / WP-11 工作台首页~~ | ~~TODO-018-A~~ | 独立开发首页、最小样板视觉变量、开发入口、真实摘要、本机最近访问、帮助入口；旧概要更名呈现为项目概况 | BE-003的新增菜单入口/默认落点与Console同片；现有业务API复用，新增统计需求先核合同 | 新老项目/无项目/四角色可用，旧概要指标完整；换项目/换账号/迟响应隔离；登录、刷新及旧深链可用 |
| ~~2 / WP-12 导航与外壳~~ | ~~TODO-019-A~~ | 业务导航分组、顶栏项目上下文、面包屑、固定/历史标签兼容、折叠与窄屏；视觉变量推广至外壳 | 依赖018-A；BE-003的菜单兼容与权限核验，必要后端目录改动同片 | 全路由去向表覆盖，菜单双端一致；无项目及平台身份入口不丢失；受限按钮/路由不能越权 |
| ~~3 / WP-13 设备开发~~ | ~~TODO-020-A~~ | 类型列表与详情、基本信息/属性/事件/命令模型、发布版本、产品凭据及“继续创建设备”入口 | 依赖019-A；复用现有模型/单读/发布/凭据合同，预期无新API | 草稿编辑、发布、只读角色、并发/失败保留输入、一次性凭据行为回归；选中类型正确传递 |
| ~~4 / WP-13 设备开发~~ | ~~TODO-020-B~~ | 设备列表/详情组织、接入配置与凭据、上报/历史/事件/消息调试及下一步入口；组/拓扑/点位/OTA采用同一页面规范 | 依赖020-A；复用现有设备、消息/事件及OTA合同，预期无新API | 真实模拟器完成接入与上报，查看对应事件/消息；凭据关闭清理、读写权限、OTA受控入口及既有详情关联可用 |
| ~~5 / WP-14 规则与运行~~ | ~~TODO-021-A~~ | 规则/自动化/场景/任务的入口与状态组织；告警、通知及投递查询统一页面布局 | 依赖020-B；复用既有规则/执行/告警合同；不新增全局“待处理总数”接口 | 从设备带上下文进入配置，保存重读、明确操作结果并查看真实执行/投递记录；失败与无权限路径可恢复 |
| ~~6 / WP-15 应用与看板~~ | ~~TODO-022-A~~ | 应用/看板列表、编辑/预览/发布导航、终端用户与绑定授权入口 | 依赖021-A；复用应用/看板和终端用户合同；不改设计器引擎、发布或预算算法 | 样板设备到看板实际数据闭环；预览/发布/撤回/软删除及旧分享拒绝、终端用户权限仍正确 |
| ~~7 / WP-16 项目与资源~~ | ~~TODO-023-A~~ | 项目/成员/邀请、用量/额度、密钥/Webhook、恢复/导出及辅助工具页面规范；收尾跨模块一致性 | 依赖022-A；复用现有合同；未交付能力不借UI改版扩范围 | 无项目邀请/恢复、额度拒绝、凭据边界、平台权限入口回归；最终同候选主流程及所有受影响页面验收 |

018-A实施前先完成同片设计检查点：取现状基线，给出工作台与设备页代表性原型，包含空项目、已有设备、无权限和失败状态；确认骨架后再扩展。
初版采用14px正文、20–24px页面标题、8px间距级差、8–12px圆角、36px默认按钮作为候选；表格保留紧凑密度，数值在真实渲染后冻结。
共享组件按实际复用提取：页面标题/工具栏、流程入口、最近访问、状态与帮助区；不提前搭建第二套通用组件框架。
动效仅用于导航展开、模块加载切换和局部状态反馈，遵循减少动态效果设置，不加入装饰性大面积渐变/动画。

### 后端依赖分类与实施边界

已确认需要协同的是菜单入口和迁移合同，登记在[BE-003](BACKEND_TODO.md#BE-003%20开发者工作台菜单与兼容迁移)；它与018-A/019-A同片交付，不独立重复计数。
020至023以已有API完成页面组织，当前没有因重构新增的已确认领域接口缺口。
跨设备完整开发进度、跨端最近访问、全局待处理聚合暂不纳入首版；若后续需要，应先定义范围/权限/聚合口径，再新增后端待办，不用前端推测值替代。
若实施发现真实合同缺口，先在BACKEND_TODO登记来源、输入输出和反例，再将必要实现纳入所属功能片；OpenAPI仅经根脚本生成，不手改契约产物。

### 验收、回退与本轮回执

- 视觉：实施时真实查看1440×900、1280×800及窄屏关键流程，检查浅/深色、长中文名称、空列表、错误、100%/200%缩放与键盘焦点；截图与实际浏览器操作分别记录，不能以源码或类型检查代替视觉验收。
- 每片：执行类型检查、受影响lint/样式检查、必要组件/状态与权限反例、真实页面操作；按测试方针选择受影响模块与传播回归。菜单改动跑双端目录合同、身份集合、登录/无项目/项目切换/书签/标签恢复；后端改动按当前reactor带`-am`验证。
- 完整流程：物模型定义/发布 → 创建设备并获取接入配置 → 真实模拟器上报并可调试 → 配置规则且查执行结果 → 看板展示该设备数据；不把点击各入口视作业务闭环，不以mock证明设备摄取。
- 整合：最终同候选运行Console构建、静态/单元、API一致性及受影响浏览器矩阵；若共享导航/外壳影响全部旅程，运行完整默认矩阵，条件跳过逐项解释。本地、CI、公司服务器和硬件资格分别登记，不沿用旧候选通过结论。
- 回退：旧叶子URL和业务API优先保持；每片独立提交便于回退，不混入无关重构/依赖升级。涉及默认设置版本化时保留用户主题与偏好，不能清空全部本地存储解决兼容问题。
- 本轮状态：仅文档计划；业务页面/后端代码/接口生成/浏览器/业务测试/构建/提交/推送均NOTRUN。已有`deploy/README.md`修改保留，不纳入重构计划的完成认领。完整`pwsh scripts/docs-verify.ps1 -BaseRef HEAD`通过（821份根/模块文档、23项链接语法与Java文档一致性，Maven 1分07秒）；日志`logs/console-workbench-plan-docs-full.log`。回执更新后复核静态门禁与`git diff --check`；未运行页面视觉或业务功能验收。


### TODO-018-A 开发首页实施回执

候选`82b71089`工作区：新增真实开发首页、5步业务入口、当前项目/角色、同口径告警设备数摘要、7天/6条账号租户项目隔离的本机最近访问与内置接入帮助。旧概要保留原URL和全部统计；后端首菜单新增Workbench，四项目角色继承既有dashboard:read，无项目仍进入项目管理。最近资源的类型/设备/应用消费者分别随020/022交付，首页不伪造记录或进度。
后端菜单聚焦105项通过，稳定生成合同复跑通过；IAM及前置完整reactor1045次执行零失败/错误/跳过（`logs/workbench-018-iam-full.log`）。Console首页/存储/菜单/概要4文件40项通过；类型检查、专项ESLint/Stylelint通过。真实独占8090新JAR`f795a05f18eebf4305a1e3322d88c5e86e02dd14273e02219e93fcedfa301b48`、Vite3019；首页实际项目/统计、帮助、旧概要、物模型跳转和1440/1280/390视口通过（Console `logs/workbench-018-browser-4`与后续同名批次）。首轮英文关闭名称超时、第三轮抽屉选择器同时命中系统抽屉失败，已用明确对话框和实际关闭状态修正，原失败保留。截图已人工查看，等待有限动画结束后记录实际页面；不以源码判断视觉。
完整文档门禁`pwsh scripts/docs-verify.ps1 -BaseRef HEAD`通过821文档/23语法及Java文档一致性（`logs/workbench-018-docs.log`）。本片本地提交、不推送；深色/200%及全默认矩阵、其余资源接线的最终整合在023-A后完成，不继承旧WP03资格。018提交时状态：功能及限定专项通过，父重构整合当时未关闭；最终状态以023回执为准。

### TODO-019-A 导航与外壳实施回执

候选`0f0454de7`工作区：已授权菜单经只读投影归入6个业务领域及账号平台工具，叶子对象/路径/名称和原权限不变，隐藏页继续使用原深链。同步侧栏、横向/混合菜单、面包屑与激活态；首次恢复旧标签时只解除系统概要固定，保留用户其他固定标签、主题和后续重新固定。下表取自同候选双端菜单基线；“操作权限”不是重新定义路由授权。

| 原目录/路由名 | 新入口 | 原URL（保留） | 原操作权限合同 |
| --- | --- | --- | --- |
| Alarm / `AlarmHistory` | 运行与告警 | `/alarm/history` | alarm:maintain |
| Alarm / `AlarmNotificationGroups` | 运行与告警 | `/alarm/notification-groups` | alarm:manage |
| Alarm / `AlarmNotificationTemplates` | 运行与告警 | `/alarm/notification-templates` | alarm:manage |
| Alarm / `AlarmRules` | 运行与告警 | `/alarm/rules` | alarm:manage |
| Dashboard / `ApplicationManager` | 应用与看板 | `/dashboard/applications` | 沿用原菜单身份过滤，无新增授权 |
| 根 / `CommercialOperations` | 账号与平台工具 | `/commercial-operations` | 沿用原菜单身份过滤，无新增授权 |
| Dashboard / `DashboardDesigner` | 应用与看板 | `/dashboard/designer` | 沿用原菜单身份过滤，无新增授权 |
| Device / `DeviceGroups` | 设备开发 | `/device/groups` | device:create, device:delete, device:update |
| Device / `DeviceMessages` | 设备开发 | `/device/messages` | 沿用原菜单身份过滤，无新增授权 |
| Device / `DeviceModbusPoints` | 设备开发 | `/device/modbus-points` | device:update |
| Device / `DeviceTopology` | 设备开发 | `/device/topology` | device:update |
| Device / `DeviceTypes` | 设备开发 | `/device/types` | device:create, device:delete, device:update |
| Device / `Devices` | 设备开发 | `/device/list` | device:control, device:create, device:delete, device:update, enduser:read, rule:manage, rule:read, task:read |
| Exception / `Exception403` | 账号与平台工具 | `/exception/403` | 沿用原菜单身份过滤，无新增授权 |
| Exception / `Exception404` | 账号与平台工具 | `/exception/404` | 沿用原菜单身份过滤，无新增授权 |
| Exception / `Exception500` | 账号与平台工具 | `/exception/500` | 沿用原菜单身份过滤，无新增授权 |
| Rule / `MessageRules` | 规则与自动化 | `/rule/messages` | 沿用原菜单身份过滤，无新增授权 |
| Ota / `OtaAudits` | 设备开发 | `/ota/audits` | 沿用原菜单身份过滤，无新增授权 |
| Ota / `OtaCampaigns` | 设备开发 | `/ota/campaigns` | ota:deploy |
| Ota / `OtaFirmwares` | 设备开发 | `/ota/firmwares` | ota:deploy, ota:read |
| Ota / `OtaJobs` | 设备开发 | `/ota/jobs` | 沿用原菜单身份过滤，无新增授权 |
| Dashboard / `Overview` | 工作台 | `/dashboard/overview` | 沿用原菜单身份过滤，无新增授权 |
| 根 / `PlanCatalog` | 账号与平台工具 | `/plan-catalog` | 沿用原菜单身份过滤，无新增授权 |
| Project / `ProjectApiKeys` | 项目与资源 | `/project/api-keys` | integration:manage |
| Project / `ProjectEndUsers` | 应用与看板 | `/project/end-users` | enduser:manage |
| Project / `ProjectList` | 项目与资源 | `/project/list` | 沿用原菜单身份过滤，无新增授权 |
| Project / `ProjectMembers` | 项目与资源 | `/project/members` | member:invite, member:remove, member:update_role |
| Project / `ProjectSettings` | 项目与资源 | `/project/settings` | 沿用原菜单身份过滤，无新增授权 |
| Project / `ProjectWebhooks` | 项目与资源 | `/project/webhooks` | integration:manage |
| Rule / `RuleAutomations` | 规则与自动化 | `/rule/automations` | 沿用原菜单身份过滤，无新增授权 |
| Rule / `RuleExecutions` | 规则与自动化 | `/rule/executions` | 沿用原菜单身份过滤，无新增授权 |
| Rule / `RuleScenes` | 规则与自动化 | `/rule/scenes` | 沿用原菜单身份过滤，无新增授权 |
| 根 / `SelfHostedEnrollment` | 账号与平台工具 | `/self-hosted-enrollment` | 沿用原菜单身份过滤，无新增授权 |
| 根 / `SelfHostedReview` | 账号与平台工具 | `/self-hosted-review` | 沿用原菜单身份过滤，无新增授权 |
| 根 / `SystemStatus` | 账号与平台工具 | `/system-status` | 沿用原菜单身份过滤，无新增授权 |
| Task / `TaskJobs` | 规则与自动化 | `/task/jobs` | task:manage, task:run |
| 根 / `UserCenter` | 隐藏深链（保留） | `/system/user-center` | 沿用原菜单身份过滤，无新增授权 |
| Dashboard / `Workbench` | 工作台 | `/dashboard/workbench` | 沿用原菜单身份过滤，无新增授权 |

验证：4文件30项专项单元通过（`logs/workbench-019-unit-receipt2.log`），含无项目及四项目角色、运营/独立审核组合的真实菜单处理后逐叶投影核对，不新增或丢失叶子；新增标签迁移和面包屑反例。真实浏览器2项通过（`logs/workbench-019-resume.log`）：首页/项目概况、终端用户新归属、原类型URL刷新与面包屑；实际查看390px截图，修复文案孤字及开发工具悬浮覆盖。Vue DevTools改为显式`VITE_DEVTOOLS=true`开启，界面设置入口保留。全局类型/生产构建/样式已通过，最终全量回归随023整合。
首次019浏览器刷新后导航抢跑失败，已等待真实页面标题；随后测试进程中断、8090/3019停止导致登录超时，保留失败日志，恢复原专用栈后2项通过。pnpm包装器发生getter异常，直接使用本地已安装工具运行，未变更依赖。后端菜单实现和IAM验证沿用本次018同代码证据，未新增领域API。当前本片专项完成并验证；跨模块矩阵尚未关闭，不继承旧WP03结果。

### TODO-020-A 物模型至设备创建实施回执

候选`b9b56619`工作区：设备类型增加实际单读工作区，集中基本信息、物模型属性/事件/命令、发布状态和产品凭据入口；真实读取记录本机最近访问。已发布类型可接续创建设备。接收页只接受合法ID与当前项目上下文，单读核对已发布状态/身份/权限，消耗意图参数，不扫描全量目录；创建前后核验身份，失败保留输入，项目/身份改变清理表单和凭据。
专项5文件74项通过（原020-A日志）、全量173文件2174项通过（`logs/workbench-resume-unit-final.log`），类型/生产构建通过。真实浏览器1项通过（`logs/020-a-browser-final.log`）：真实API准备并发布模型，UI从类型继续创建设备，后端重读验证正确绑定。此用例不冒称模型编辑/发布UI全程；同设备完整UI闭环随023统一验证。首轮精确名称匹配超时：实际诊断证明表单仍显示，Element Plus必填星号进入输入可访问名称；已给名称/标识字段设置明确aria-label及aria-required，保留原必填校验。原超时、诊断与通过回执保留。全平台静态文档门禁通过821文档/23语法（`logs/workbench-resume-docs.log`）；本片本地提交、不推送。

### TODO-020-B 设备接入与调试实施回执

候选`ba8a01114`工作区：设备列表/详情新增接入、上报、消息调试、自动化与看板入口；接入配置保留原settings标签键。最近设备引用通过实际单读记录和重开，校验UUID/项目/权限/冲突ID；旧deviceId深链兼容，点击其他设备清理旧resourceId。消息列表/详情/诊断与分页目录均按项目、身份和请求代次隔离，失效来源不查询，移除错误上下文后可恢复。组/拓扑/Modbus点位/OTA四页采用同一工作区标题。首个消费者引入共享ConsoleWorkspaceHeader/useWorkspaceDeviceContext/usePagedDeviceCatalog改进，021/022复用，不改变后端合同。
9文件71项专项通过（`logs/020-b-unit-final.log`），类型/专项ESLint/Stylelint通过。真实严格TLS MQTT旅程1项通过，18.7秒（`logs/workbench-020b-first.log`）：实际上报、最近引用单读→接入配置→带设备上下文消息筛选→脱敏摘要/HEX→连接诊断→新项目切换后旧事实不可见。运行前独占守卫核对源码全量快照、JAR、进程/端口、容器与数据库，实际通过（`logs/workbench-guard-bound2.log`）。恢复仅启动已核身份的5个测试容器，不删除数据。首次运行清单缩进序列化超过16KiB，守卫按设计拒绝；压缩JSON后保留全量源码快照与全部校验，未放宽门禁。本片本地提交、不推送；完整默认/模拟器及新同设备闭环待023整合。

### TODO-021-A 规则与运行工作区实施回执

候选`d06465ca`加021至023工作区：消息规则/自动化/场景/执行/任务及告警规则/历史/通知组/模板统一标题与关联入口；执行来源参数准确进入对应标签。设备上下文先按当前项目和权限单读，只有用户明确创建才预选，不从URL触发写入；告警规则列表在项目切换时清空并拒绝迟响应，既有执行和投递语义不变。
专项9文件62项通过（`logs/021-a-unit.log`），最终全量174文件2190项通过（`logs/workbench-final-unit.log`）；构建、类型、ESLint/Stylelint及API一致性均通过。真实同设备开发闭环1项通过27.1秒（`logs/workbench-flow-third.log`）：UI创建发布模型/设备、严格TLS模拟器上报、UI保存启用透传规则、同设备MQTT消息ID关联真实成功执行及时间线、看板实际值。该整合旅程使用当前全部UI工作区，不声称仅此提交包含后续应用布局。首两轮分别因ElSelect占位文本不是可点击input、发布schema显示属性键而非维护名的测试选择器不匹配失败，原日志保留，修正为真实控件与实际模型合同后全程通过。未改业务接口/模拟器摄取/规则执行算法。本片本地提交、不推送，默认矩阵及规则通知等原条件门禁仍在023统一收尾。

### TODO-022-A 应用与看板工作区实施回执

候选`281bea75a`工作区：应用目录采用卡片与清晰开发步骤，草稿/看板/发布/终端用户入口按原权限呈现；实际读取应用后记录本机最近访问，并支持当前项目resourceId单读重开。看板显示经核验的来源设备，但不会擅自绑定或写入草稿；设计器引擎、发布/撤回/软删除、预览预算与旧分享拒绝逻辑保留。
专项7文件101项通过（`logs/022-a-unit.log`），最终全量2190项、构建/类型/样式/API一致性通过。真实应用专项1项通过6.7秒（`logs/workbench-022-first.log`）：UI创建应用→未保存展示名→新工作区头部跳转取消保留输入→确认离开→单读重开恢复服务端旧值→首页最近访问重开；监听断言没有隐式写请求。另同设备严格TLS开发闭环验证真实看板绑定、保存重载与实际数值（`logs/workbench-flow-third.log`）。草稿/删除/预算完整既有旅程归023同候选默认矩阵，不能由专项继承为全部发布资格。本片本地提交、不推送。

### TODO-023-A 项目资源与最终整合回执

最终受验候选为`4871e7d57`加本片工作区，5326份源码快照SHA-256为`b94e52a4fce276cfef2ac34d8fc575325bf19de7af9259e775ac36762572d1a4`；提交前逐文件复核无源码漂移。Node 26.7.0 / OpenJDK 21.0.12 / macOS Docker Desktop；专用后端8090、Console3019、WebApp4018、严格TLS Broker58884、模拟器8092。后端冻结JAR SHA-256为`f795a05f18eebf4305a1e3322d88c5e86e02dd14273e02219e93fcedfa301b48`，本轮后续没有Java/API变更。原始WP03清单保持不变，新执行用`workbench-*`清单重新绑定当前源码、进程和数据库，不把旧候选资格迁过来。

项目列表/成员/密钥/Webhook/设置与个人中心、套餐、系统状态、商业运营、自部署申请/审核统一标题和按权限显示的关联入口；设置先显示用量与资源。恢复/回收站/导出既有入口和额度拒绝保留，没有绕过对象账本、租户隔离、TLS或外部验收门禁。收尾根据实际深色/放大截图调整首页容器响应式网格，并裁剪不足宽度的顶栏导航区域，避免文字与项目切换重叠；设备类型页复用统一标题组件，截图等待真实加载遮罩退出。

2026-10-08项目设置视觉增量（`master / ac40f97f7`加未提交工作区）：主标题、副标题和横线沿用项目页面样式；用量、Agent配置及套餐子区使用分隔标题，说明统一12px信息提示与14px图标。保留关联入口、全部额度与单位、缺失状态、密钥配置/启停/删除、知识版本/发布/检索及个人集合报告操作，业务脚本和权限条件未改。知识正文与检索新增明确字段标签，批准操作及报告来源整理间距；窄屏用量表改为纵向排列以完整查看状态列。Console运行`pnpm exec vitest run tests/agentModelPanel.test.ts tests/projectKnowledgePanel.test.ts tests/personalFactCollectionPanel.test.ts tests/quotaApi.test.ts`取得4文件90项通过，`pnpm exec vue-tsc --noEmit`和上述5个Vue文件ESLint/Stylelint通过；Stylelint首轮属性顺序错误已修复。localhost:3006实际页面检查1280、760、390宽度及知识/本人记录只读刷新，390页面与卡片无横向溢出。完整文档门禁`pwsh scripts/docs-verify.ps1 -BaseRef ac40f97f7`与`git diff --check`通过，原始日志为`logs/project-settings-ui-docs.log`。此次仅本地视觉与聚焦回归，完整E2E、远端CI、提交及推送均NOTRUN；不得继承下表旧候选整合资格。

| 验证范围 | 当前结果 / 可复现命令与证据 |
| --- | --- |
| 静态与构建 | 已通过：共享合同check/build、`node node_modules/vite/bin/vite.js build`、`node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`、全量ESLint/Stylelint、`node node_modules/tsx/dist/cli.mjs scripts/check-api.ts`；Console `logs/workbench-final-*.log`；标题收尾后再次构建33.85秒、类型及全E2E lint/标题Stylelint通过（`workbench-final-build2/typecheck2/repair-lint/type-style.log`）。ESLint为0错误、1条既有unused-disable警告；pnpm包装器失败未通过修改依赖解决，使用已安装本地CLI |
| 单元 | 已通过：`node node_modules/vitest/vitest.mjs run`，174文件2190项；`logs/workbench-final-unit.log`及最终标题收尾后的`logs/workbench-final-unit2.log`（36.11秒），含023专项11文件53项的既有范围；新测试首轮超时来自动态导入链，移到模块顶层后保留原超时与断言，不放宽测试 |
| 后端菜单 / IAM | 018同片菜单105项与IAM完整reactor1045次执行通过；Console全身份菜单投影合同保持原叶子对象、路由与权限，未新造领域接口 |
| 文档 | 已通过：根`pwsh scripts/docs-verify.ps1 -BaseRef 82b710899`，821份根与模块文档、23个链接语法案例及Java文档一致性；`logs/workbench-final-docs.log`（Maven55.3秒）；最终回执写入后全量复核再次通过（Maven51.069秒），记录`logs/workbench-final-docs-close.log` |
| 默认浏览器矩阵 | 已通过本轮默认选场：74项中49 PASS、25条件SKIP、0失败、0 flaky，11.1分钟；`logs/workbench-default-final-clean.log`及`logs/workbench-default-final-clean/playwright.json`。命令`WORKBENCH_EVIDENCE_SUFFIX=final-clean python3 things-cloud-console/logs/workbench-run.py default`（平台根），底层`playwright test --workers=1 --max-failures=1 --grep-invert @simulator`；不是将分轮部分结果拼接 |
| 严格TLS开发闭环 | 最终同源码组合5项全部通过1.8分钟（`logs/workbench-simulator-final.log`及`logs/workbench-slice-simulator-final/playwright.json`）：新同设备UI闭环24.6秒、接入调试8.0秒、旅程3上报/当前值/历史/命令ACK21.4秒、旅程6网关级联32.2秒、旅程7App认领/共享/转移/解绑失权18.7秒。真实消息ID与规则执行、后端数值与看板显示关联；不含真实硬件资格 |
| 视觉和可访问性 | 实际1440×900、1280×800、390×844截图与首页3项通过（`logs/workbench-visual-polished2.log`）；深色、CSS200%放大、键盘Enter/Escape操作通过。CSS放大不是Windows/原生浏览器缩放资格；类型创建补明确aria-label以排除必填星号的名称歧义 |

整合发现与修复：默认矩阵首轮应用发布用固定名称误中历史同名记录，应用发布/组合用例改为本轮创建的精确ID；第二轮OTA审计假设项目没有历史对象复验记录，改用正式项目API创建独立项目，保留不可变审计。新项目API夹具创建后补真实列表重新载入，避免使用已挂载旧列表；OTA四页菜单改为设备开发分组，并验证四个真实叶子权限。专项四项全部通过38.9秒（`logs/workbench-ota-repair2.log`），随后从头重跑默认矩阵；第三轮运行至平台套餐入口时，旧测试未展开“账号与平台工具”；已逐个核查剩余侧栏消费者，增加按真实展开状态操作的共享助手，修复套餐/项目资源/运营审核旅程。平台与类型专项5项通过44.7秒（`logs/workbench-platform-repair.log`），2190项单元及构建/类型重新通过后，冻结相同源码从头运行最终矩阵。失败/中止日志全部保留，不把后续专项结果拼作矩阵通过。

额外环境反例：第一次最终冻结矩阵在`device-reported-order`失败（15 PASS / 13 SKIP / 45 NOTRUN），旧HTTP正文交付已确认、UI仍为新值14.75/接受序号2，但测试内Promise观察器未收到交付信号。实际Vite编译导入为`http/index.ts?t=1791377276723`，观察器动态导入无时间戳模块，证实HMR造成不同模块实例（`logs/workbench-order-hmr-diagnosis.txt`）。仅重启清单绑定的Console Vite，核验实际导入URL恢复一致，并重新绑定端口/进程；不修改产品、原测试12秒截止或瞬态回退断言。启动监听尚未就绪时守卫拒绝的尝试单独保留，不放宽守卫。冻结后原专项1项完整通过10.8秒（`logs/workbench-order-frozen2.log`），包含交付观察、瞬态回退监视与最终接受序号；后续同源码完整矩阵中的原用例再次通过6.0秒；矩阵最终49 PASS / 25条件SKIP，未凭失败快照补判。

默认矩阵中的条件门禁及恢复边界如下；它们不计入本轮新UI通过数，旧候选回执保持原范围，不因已有代码自动继承资格。

| 条件门禁 | 项数 | 本轮未具备的独立选场 / 恢复要求 |
| --- | --- | --- |
| Agent非空历史告警及010-C受审分析 | 1 + 9 | 专属事实夹具、独占真实HTTP合成受审材料；真实外部模型准入仍归010-D |
| 应用/看板软删除传播 | 2 | 独占候选、受管4017匿名宿主及公开项目材料；本轮4018用于普通发布/App旅程，不能改端口断言冒认该门禁 |
| 设备事件发生历史/类型单读资格 | 2 | 冻结查询候选、TLS摄取checkpoint及公开设备seed；与普通属性上报和类型接续旅程分开 |
| OTA基线登记/生命周期/元数据/下载/回退准备/信任导入 | 6 | 精确受控根与版本配置、真实READY发布物或公开预签/回退材料；普通OTA四页权限与真实API旅程不替代它们 |
| 资源包购买退款 | 1 | 专属后端资源包夹具；普通套餐/有效额度展示继续回归 |
| 产品凭据动态注册 | 1 | 产品专用栈及冻结候选；设备一次性凭据、关闭清理旅程独立 |
| 告警投递21条终态分页 | 1 | 专用告警栈与冻结评估材料；普通告警/通知收件箱继续回归 |
| 项目留存导出及存储额度拒绝 | 2 | 留存导出专用材料及启用存储额度的独立套餐夹具；012对象账本债务保持开放 |

本片及6包7片状态：已完成并验证本地软件范围，表内编号/工作包已划删除线；此前分片提交时的“待023整合”均由本次回执收束。25项条件跳过仍未取得当前候选资格，表中恢复要求保留开放，不划完成线。Windows、Node22、远端CI、公司服务器、真实硬件/signature、受审模型出站及R4暂停范围均未取得本次新资格；默认矩阵条件跳过不标PASS，012对象账本债务不因UI调整关闭。已有`deploy/README.md`修改保留，不纳入本片提交。

本地提交映射：018-A `0f0454de7`、019-A `b9b566192`、020-A `ba8a01114`、020-B `d06465cae`、021-A `281bea75a`、022-A `4871e7d57`；023-A由包含本回执的`feat(console): 完成项目资源工作区与开发流程整体验证`提交承载（Git历史可定位）。每片一次本地提交，不推送；Jagonzn独立仓库没有改动。

### 控制台界面调整整合回执


2026-10-10 App接入与项目终端用户局部优化（平台 `master / 75e2cc778` 加本轮未提交工作区）：沿用控制台现有分隔标题、12px提示条及配色；App接入弹窗桌面左右展示二维码/只读文本，窄屏上下排列，地址与项目标识、错误/超长入口与复制状态继续保留。当前账号名称与ID分层，账号/项目角色状态用标签，角色操作栏限制选择框宽度；目标项目角色显示“应用管理员（APP_ADMIN）/维护者（MAINTAINER）/操作员（OPERATOR）/观察者（OBSERVER）”，中文与ThingsX现有用词一致，提交值仍是原四个标识；本项目角色目录的项目角色列复用同一中英文显示函数，列宽增加到240px，过长内容悬停可读，未分配状态保留；角色列增量经真实本项目目录验证显示“应用管理员（APP_ADMIN）”，类型/ESLint/Stylelint及管理页18项回归通过，证据为同目录`role-column.log`与`role-column.jpg`。本项目接收号码使用分隔标题、两列等宽输入与提示条，窄屏单列；设备关系删除重复标题和重复用户ID，保留当前账号上下文；可选看板目录名称与ID改为同一行显示，授权事实的状态/修订及时间继续分层；操作按钮靠右，窄屏空间不足时按行换行，授权分页右对齐并保留原游标行为；按负责人要求不显示“当前页暂无授权记录。”，读取失败提示仍保留；该目录增量经真实三条看板名称/ID同行验证，14项授权目录组件回归及ESLint/Stylelint通过（`catalog-inline.log`、`catalog-inline.jpg`）。原E2E空态文字消费者同步改为等待目录`aria-busy=false`后核对零条授权且无读取失败提示；本轮未执行该完整授权写入E2E。随后按负责人要求移除刷新设备关系、刷新接收号码、刷新授权目录、刷新可选看板、刷新目录五个按钮及空操作栏；保留初始加载、身份/项目/用户切换、保存/解绑及授权变更后的读取，失败提示改为重新进入页面，不新增轮询或自动写重试。读取失败、延迟响应及目录清除的原测试改走范围切换与授权组件changed回调；首轮2项夹具缺少组件name已补齐，最终4文件45项回归、类型及ESLint/Stylelint通过（`remove-refresh-final.log`，首败`remove-refresh.log`保留）。真实页面确认五个按钮无入口、账号选择后号码输入恢复可用、三条看板目录自动加载（`remove-refresh.jpg`）。随后看板读取授权改为语义化表格，分列显示看板、权限、状态、原字符串修订、建立/更新/撤销时间与操作，状态使用中英文标签；名称仅从当前已加载的服务端看板目录匹配，历史/未载名称回退为“看板”并保留ID，不新增扫描或推导授权。可选看板也改为“看板/操作”两列表格，名称与ID同行，桌面行高实测53px、上下各8px；当前看板/用户改为分栏上下文。表格保留内部横向滚动，窄屏页面不横向溢出；ID过长省略并可悬停读取。专项14项回归、类型及ESLint/Stylelint/格式检查通过（`grant-tables-final.log`、`grant-tables-final-typecheck.log`）；中间表格版本6项旧“页面不含修订”定位被新增表头触发，改为直接验证零授权数据行，原合同/身份/延迟响应拒绝断言保留；2项样式顺序已修复，首败`grant-table.log`保留。E2E旧li与整句状态定位同步为具名表格/行、状态标签及修订单元格，本轮完整写入E2E仍NOTRUN。真实页面只读检查实际两条授权、三条可选看板及选择上下文，没有授予、撤销或更改角色；桌面与390窄屏证据见同目录`grant-tables-final-desktop.jpg`及`grant-tables-final-mobile.jpg`，最终可选列表三个名称/ID均同行。本次文档检查再次通过858份根/模块链接、23项语法回归及空白检查（`grant-tables-docs.log`，`-BaseRef HEAD -SkipMaven`）；HEAD..HEAD输出仍不作为未提交变更已入库的证据。看板选择与查看授权随后统一为直接打开既有授权弹窗：父页仅设置目标并调用暴露的打开方法，隐藏重复入口，把当前看板/用户上下文移入弹窗插槽；默认设计器入口保留，未新增嵌套弹窗。关闭后保留既有未知意图恢复，项目/身份/用户切换仍清除旧上下文。按负责人要求移除普通“刷新授权记录”按钮，成功写入后既有模型自动GET当前事实并通过changed更新外层目录；失败或未知操作不自动重写，恢复原操作与读取原事实入口保留。普通读取/冲突文案改为关闭重开，设计器E2E冲突后的读取改走关闭重开并选择原用户，原409/CAS断言保留。授权状态改为小标签，旁边12px显示原字符串“修订版本”，数据属性保留。两组件及模型3文件46项回归、类型、ESLint/Stylelint通过（`grant-dialog-status.log`、`grant-dialog-status-typecheck.log`）；中间1项测试桩没有Boolean类型把静态属性读成空字符串，改为显式绑定true后通过，首败`grant-dialog.log`保留。真实桌面/390窄屏验证两个入口、关闭重开、不同看板上下文、真实GET状态与无页面下方展开，358px窄屏弹窗scrollWidth=clientWidth；最后状态标签与删除刷新按钮证据为`grant-dialog-status.jpg`，其他见`grant-dialog-{desktop,mobile}.jpg`。实际页面只读取，自动写后读取通过原授予/撤销回归核对detail调用次数；完整授权写入E2E、远端CI、提交和推送仍NOTRUN。

2026-10-10负责人授权本地提交本轮改动、不推送。本次候选为平台 `master / 75e2cc778` 加15个Console源码/测试/文档文件，提交说明为 `feat(console): 优化项目接入与终端用户授权界面`。交付前最终七文件79项回归通过（`pnpm test tests/appProjectEntryDialog.test.ts tests/endUserManagement.test.ts tests/endUserNotificationContact.test.ts tests/endUserDevices.test.ts tests/endUserDashboardGrants.test.ts tests/dashboardGrantSession.test.ts tests/dashboardGrantModel.test.ts --maxWorkers=2`，`commit-unit.log`）；全改动Vue/TS的ESLint、Vue Stylelint、Prettier与`pnpm typecheck`通过（`commit-static.log`）。完整文档门禁 `pwsh scripts/docs-verify.ps1 -BaseRef 75e2cc77837a0ec41be54078e9db1fa2cad17c2f` 未使用SkipMaven，858份根/模块链接、23项语法回归、Java文档一致性及定向Maven BUILD SUCCESS通过（`commit-docs.log`）；中文提交消息以同一消息文件通过根守卫及真实commitlint。此前NOTRUN描述对应实施阶段，完整E2E、生产构建、远端CI和推送仍NOTRUN；Jagonzn独立仓库清洁且本轮未修改，不向退役Console远端交付。暂存/提交仅包含上述15个文件，日志与截图保持忽略；提交后以实际基线范围复验文档策略，不将HEAD..HEAD预检当作提交范围证明。


验证范围为这两处局部UI与原组件行为：`pnpm typecheck`、上述5个Vue文件及管理页测试的ESLint/Stylelint通过；执行已有 `appProjectEntryDialog、endUserManagement、endUserNotificationContact、endUserDevices、endUserDashboardGrants` 五文件47项回归，最终候选连续3次均PASS。首轮4处管理页旧整句定位失败，改为分别核对当前账号/状态区域，保留原身份、权限、确认、PATCH及未知结果断言，并在现有角色更新用例核对中文选项及原英文提交值；首轮10处Stylelint属性顺序/媒体写法已修复。真实localhost:3006查看1280桌面及390窄屏，打开真实项目App接入、刷新接收号码/可选看板、选择看板并打开固定用户授权弹窗；没有写入号码、修改角色、授予或撤销授权。页面362px容器scrollWidth=clientWidth，窄屏无页面横向溢出，表格保留自身横向滚动。二维码、复制/异常状态与账号切换由组件回归覆盖。本轮为局部自检，未独立视觉评审；保留原弹窗动效，未新增动效；仅删除重复设备关系标题/ID，其余说明保留。证据为本机忽略目录 `logs/project-entry-enduser-ui/` 的 `unit-final-{1,2,3}.log`、`typecheck.log`、`eslint.log`、`stylelint.log` 与桌面/窄屏截图。`pwsh scripts/docs-verify.ps1 -BaseRef HEAD -SkipMaven`通过858份根/模块文档链接、23项语法回归及空白检查（`docs.log`）；未提交范围不以HEAD..HEAD策略输出宣称已入库，Java文档一致性未重跑。打开固定用户授权弹窗后的浏览器日志有一条`[HTTP Error] Object`，日志未给出返回码，未将打开弹窗视为授权读取成功，也未修改授权错误处理；现有授权组件的读写资格另有专项回归。生产构建、完整E2E、远端CI、提交及推送均NOTRUN，Jagonzn及其他独立工程未修改；不继承下方历史验收资格。

~~控制台界面调整与本机 E2E 收尾~~：已完成并验证以下本地软件范围。本次回执承接负责人逐次页面标注及最终 E2E、修复、一次提交的指令，历史中间布局不作为最终验收样式。

2026-10-08负责人授权本地提交全部更新与新增文件，本次提交候选为平台 `master / ac40f97f7` 加131个Console文件差异（123个修改、8个新增），包含此前页面标注和全站审计实施；Jagonzn独立仓库无改动。汇总范围包括个人邀请/成员列表、设备游标分页/筛选列对齐/详情标签与空态分页、看板目录完整读取、任务与规则标签、通知/OTA/项目设置及统一标题/提示/弹窗抽屉样式；必要状态保护和测试保留。提交前 `pnpm test` 最终188文件2351项全部通过，类型检查、全改动源码/测试ESLint、Vue/SCSS Stylelint、源码与测试Prettier及 `git diff --check` 通过；首轮全量有6项旧夹具/定位失败（2345 PASS），仅补五个测试文件的ElAlert正文插槽、分隔组件及错误类型定位，原业务断言保留，47项专项及全量复验通过。证据目录 `logs/ui-commit-1791506762674603000/` 包含 `unit-full.log`（首败）、`fixture-focused.log`、`unit-final.log`、类型/静态/格式与完整文档门禁日志；提交消息通过平台中文Conventional Commit守卫。完整文档门禁 `pwsh scripts/docs-verify.ps1 -BaseRef ac40f97f7`（含Java文档一致性）通过；既有应用草稿读取失败仍待定位，本次完整E2E、生产构建、远端CI及推送NOTRUN。由包含本回执的 `feat(console): 统一管理界面样式与设备分页交互` 本地提交承载，不继承下方旧候选E2E资格。

2026-10-08全站内容层级增量（平台 `master / ac40f97f7` 加未提交工作区）：按已审计内容补齐看板/应用发布、分享与授权、API Key/产品凭据、OTA证明/下载/回退观察、规则历史、项目终端用户及诊断结果的分区标题与提示。普通说明统一12px、图标14px，警告/错误保留语义颜色；版本、ID、额度、时间、模型正文与编码仍作为业务内容。三个受限平台管理页沿用主副标题与底线，不改变权限或恢复暂停任务。业务弹窗限定可用高度、正文滚动、底栏固定；API Key/Webhook表单操作移到右侧底栏，字段限制就近说明；Webhook筛选与所属结果归入同一分区，设备类型固定名称列，OTA选择框补可见标签并压缩抽屉空态。业务Vue脚本与本轮前逐文件摘要一致，接口、查询、权限、恢复与秘密生命周期未改；测试夹具仅补齐提示正文插槽和分隔组件，不削弱原断言。

验证：最终34文件558项聚焦组件/状态回归连续三轮全部通过（每轮558 PASS，日志 `logs/console-presentation-1791466945499960000/final-focused-1.log` 至 `final-focused-3.log`）；首轮22文件中9项因旧ElAlert夹具未渲染默认正文插槽失败，修正夹具后保留原断言通过。类型检查、改动范围ESLint/Stylelint及Vue/SCSS/测试格式检查通过；浏览器只读抽查1280×720的API Key/Webhook/设备类型/OTA弹窗与抽屉，独立视觉评审后补底栏、字段说明和图标字号；390×720及390×520设备类型表单未溢出，短屏正文滚动且完整操作区在屏内。未签发密钥、生成凭据、保存/发布对象或改变业务数据。应用目录可读，但现有应用草稿仍报读取失败（审计阶段已存在），未放宽草稿校验或覆盖原文，草稿编辑区渲染验证未完成；受权限、数据与写入结果控制的分支以源码和聚焦回归核对，不冒称全部真实状态已验。完整E2E、生产构建、远端CI、提交与推送均NOTRUN，不继承下表旧候选资格。完整文档门禁 `pwsh scripts/docs-verify.ps1 -BaseRef ac40f97f7` 通过（含Java文档一致性），`git diff --check`通过，日志 `logs/console-presentation-1791466945499960000/docs-verify.log`。TODO保留既有历史排版，未为整体Prettier差异批量改写旧回执。

最终改动范围：未进入项目的区域筛选/“我的项目”导航与进入项目后的面包屑分别显示，头部统一白色及轻阴影；左侧菜单恢复可操作，工作标签栏暂时隐藏但保留代码，403/404/500从菜单隐藏并保留异常路由。项目列表恢复表格，“我创建的项目”及“我加入的项目”各占可用区域一半，标题采用28px常规字重、说明及分隔线，删除操作指南；行点击进入与操作按钮分别响应。添加项目和回收站为独立子菜单/页面；回收站移除刷新按钮，操作列不换行，留存导出弹窗实际内容宽度760px。

项目描述已贯通新增Flyway迁移 `V20261007_0100__project_description.sql`、领域/持久化、创建及响应合同、创建输入和名称后的列表列；字段 `description` 可选，默认空字符串、最多1000字符。项目套餐显示来自服务端按可见项目提供的真实订阅身份和状态，两端生成类型同步。个人中心标题在两种上下文中一致、进入项目后隐藏项目列表按钮；邀请一次加载完整游标集合，保留身份/迟响应/重复游标保护，移除分页及底线。系统状态总览按内容高度，运行依赖补标题、说明、横线；套餐比较表按真实额度和能力显示，修订版提示置于表格上方。登录欢迎语使用当前账号名称。

首页名称、满宽布局、440px套餐概况、无设备引导/有设备“我的资源”切换均按最终标注实现；资源按真实受权目录完整分页计数，不补造不支持的资源。资源“用户”来自终端用户目录，套餐“项目成员”来自当前项目成员，二者口径不同。运行摘要显示设备总数、在线、活跃及告警设备数；其下24小时消息量、流量和统计窗口在桌面一行显示，原摘要生成时间删除。项目概况保留互斥告警分布、单列图例及间距，流量/窗口移到首页；重复用量卡片删除。

候选及环境：平台 `master`，基线 `7f7f6e59267c17b436bae1155bd7564a38698fc2` 加本次工作区；5360个源码文件的全量冻结快照SHA-256为 `4d7e63ce3fb426866c419070b36fd81619e880a23bbd48fade21ff8f62d7c00e`；实际运行的固定后端JAR SHA-256为 `b6d777b2da882ff3b19432a3023a50aeff62c2404b12904b27cb0351108c250f`。macOS、Node26.7.0、Playwright Chromium；独占后端8090/Console3019/WebApp4018/模拟器8092，PostgreSQL5549数据库 `tc_console_wp03_1791335430604652000`、Redis56390、Kafka59093、EMQX严格TLS58884及私有版本化MinIO59001。运行守卫核对源码、JAR、进程/目录/监听端口、容器、数据库OID、公共配置及当前宿主制品，不借用日常3006/8080服务。

证据根目录为 `things-cloud-console/logs/console-ui-closeout-1791402295013829000/`；运行报告、日志及公开清单保留在忽略目录，详细结论由本条承载，凭据和缓存不提交。

| 验证 | 实际结果与证据 |
| --- | --- |
| Console静态与单元 | `pnpm build`、`pnpm typecheck`、`pnpm lint`、`pnpm lint:stylelint:check`、`pnpm api:check`通过；184文件2317项单元通过。首次构建/全量单元见 `static-unit-1791402579177436000.log`；修复后完整静态见 `static-final-1791402935070727000.log`；最终E2E选择器的类型/ESLint见 `typecheck-e2e-final-1791404212114452000.log`。ESLint零错误、保留设置组件一项既有无用禁用指令警告 |
| 后端及合同 | 项目管理11项、租户套餐摘要10项、描述迁移1项、OpenAPI74项，共96项相关测试通过，见 `backend-contract-1791402295013829000.log`。通过唯一生成器 `python3 scripts/generate-openapi-contracts.py` 生成平台OpenAPI及Console/WebApp类型，见 `openapi-generation-1791402295013829000.log`；WebApp按当前源码重新构建并在新的受管目录登记宿主制品，不覆盖旧不可变登记 |
| 完整默认E2E | 从头单次执行79项，53 PASS / 26条件SKIP / 0 FAIL / 0 NOTRUN / 0 flaky，11.7分钟。命令（平台根）`python3 things-cloud-console/logs/console-ui-closeout-1791402295013829000/run.py default`，实际 `playwright test --workers=1 --max-failures=1 --grep-invert @simulator`。Mac本机原始完整日志为`things-cloud-console/logs/console-ui-closeout-1791402295013829000/default-1791405150298562000.log`，原始JSON报告为`things-cloud-console/logs/workbench-default-ui-closeout-1791405150298562000/playwright.json`（忽略目录原件保留于Mac，本Windows工作区未同步），不将多轮部分结果拼成矩阵通过 |
| 真实HTTP行为契约 | `run.py contracts` 执行独占运行守卫后，`vitest run --config vitest.contract.config.ts` 的9项真实后端行为契约全部通过，覆盖认证/授权、验证错误、冲突、限流及幂等墓碑，见 `contracts-1791406081591774000.log`。最终独占守卫再通过，见 `guard-1791406102450056000.log` |
| 页面验收 | 独立平台布局用例真实遍历五个公共页面的进入项目前后两种上下文，检查菜单、白色/阴影、标题、等高列表及系统状态内容高度；首页同时覆盖1440/1280/390视口、深色、CSS200%放大与键盘入口、四指标、三统计卡及空/有设备切换。个人中心四角色、无项目账号及无分页、创建描述/列表行点击、回收站恢复/按钮/实际导出面板宽度、套餐比较表均在完整默认矩阵通过。此前新UI专项10项通过见 `slice-1791403299244735000.log`；变量与回收站最终专项2项通过见 `slice-1791404463620232000.log`，不重复计入默认通过数 |
| 补充真实旅程 | 两批同冻结源码共8项全部通过，0 SKIP。严格TLS旅程3/6/7三项通过1.3分钟（`simulator-1791405858641976000.log`）；开发闭环、接入调试、六类型原始属性历史、双会话告警刷新及当前READY发布证明五项通过53秒（`slice-1791405991085809000.log`）。命令（平台根）为同一 `run.py simulator journey-3.spec.ts journey-6.spec.ts journey-7.spec.ts` 及 `run.py slice developer-workflow.spec.ts device-access-debug.spec.ts device-property-history.spec.ts alarm-detail-refresh.spec.ts ota-release-proof.spec.ts`；真实MQTT及业务结果，不模拟核心成功返回，不代表硬件/签名设备验收 |
| 文档门禁 | 完整 `pwsh scripts/docs-verify.ps1 -BaseRef 7f7f6e59267c17b436bae1155bd7564a38698fc2` 通过，821份文档、23项链接语法回归及16项Java文档一致性测试，见 `docs-full-1791404541938955000.log`；本回执与索引变更后 `-SkipMaven` 文本门禁再次通过（`docs-final-text-1791406137533421000.log`）；跳过重复Maven仅因Java未再修改，不取代此前完整门禁 |

本轮失败及修复保留原始日志：构建发现首页mock缺活跃设备数字段，补齐真实合同；冷构建生成的ESLint配置缺ElMessage/ElMessageBox自动导入声明，在Vite配置中显式登记后重新构建/全量检查通过。新项目名称与“进入”按钮的非精确匹配、旧弹窗创建路径、个人中心/回收站旧选择器均改为当前真实控件；导出弹窗断言原来测到1280px遮罩，改测760px内部ElDialog内容，而非改变产品来迎合错误断言。

反复本机回归触发真实项目20个/看板100个套餐额度拒绝；仅通过正常OWNER成员移除及软删除HTTP清理本轮创建且经身份/时间/名称核验的夹具，保留旧记录和不可变事实，不提高额度、不SQL删库。新增创建项目旅程的afterEach仅清理该用例唯一名称项目。旧WebApp生成类型改变源码摘要后，分享读取按设计拒绝旧宿主登记；重新构建当前源码、在新的受管宿主目录登记并冷启动绑定的后端/WebApp后分享通过。

旧REST交错用例两次失败的证据在 `default-1791404511123695000.log` 和 `slice-1791405062910617000.log`；实际页面导入HTTP模块带 `?t=1791403832291`，观察器导入无时间戳模块，定位为Vite热更新导致两个模块实例，见 `order-hmr-diagnosis.txt`。仅冷启动绑定的测试Vite并核对实际导入URL一致，不改产品、12秒截止或瞬态回退断言；原用例专项通过10.2秒（`slice-1791405100176722000.log`），最终完整矩阵再次通过6.2秒。失败、中止及守卫拒绝日志保留，不回写为成功。

默认26项条件跳过包括[023回执中25项原独立门禁](#TODO-023-A%20项目资源与最终整合回执)和本轮默认未注入专属READY夹具的OTA公开发布证明。该公开证明在上述补充场中按当前受管真实发布物通过，默认报告仍保留SKIP，原25项独立门禁仍开放；012对象账本、010-D真实模型、SMTP专场、Node22/Windows/远端CI/公司服务器/真实硬件和R4暂停范围不因本轮UI/E2E取得资格。最终由包含本回执的本地提交承载全部代码、合同、测试及文档，不推送；Jagonzn独立仓库没有改动。

## 未接入管理接口补齐

2026-10-07基于`fd06c6b19`复核99个未引用入口：76个其他客户端/运行专用入口（含4个WS）、16个已有分页/集合/恢复合同替代、1个独立模型探针、2个明确重命名缺口、4个可补充或改善能力。负责人已授权按建议执行，以下5片覆盖6项能力；保留既有改版完成范围，不将新增能力倒写为已验证。后端接口均已提供，发现真实缺陷时由同片修复；不恢复R4暂停项或模型出站。

| 顺序 | 切片 | 实现与验收范围 | 后端责任 | 当前状态 |
| --- | --- | --- | --- | --- |
| 1 | ~~TODO-024-A~~ 应用与看板管理改名 | 接入两个PATCH；管理权限、名称校验、项目/身份隔离、失败输入保留，刷新目录/最近名称；不改变草稿与发布内容或修订 | 复用既有rename合同 | 已完成并验证本地软件范围 |
| 2 | ~~TODO-024-B~~ 告警详情新鲜度 | 打开/刷新详情按ID读取当前摘要与时间线，防止旧摘要配新事件；失权/切换/迟响应隔离、失败显式重试 | 复用告警单读与事件分页 | 已完成并验证本地软件范围 |
| 3 | ~~TODO-025-A~~ 原始属性历史 | 独立分页明细显示数值/文字/布尔/对象/数组及模型/质量事实；时间半开区间、套餐窗口、身份与游标隔离；保留原数值曲线 | 已补齐成功响应声明与双端生成类型；查询窗口不变 | 已完成并验证本地软件范围 |
| 4 | ~~TODO-026-A~~ OTA公开发布证明 | 管理端按需读取manifest/签名/指纹/制品摘要；明确公开材料不是设备验签结论；当前资格拒绝、刷新与切换隔离 | 复用release读取及受控资格 | 已完成并验证本地软件范围 |
| 5 | ~~TODO-027-A~~ 实时订阅票据工具 | 显式选择协议/设备/属性范围与签发；一次性秘密仅内存显示并关闭清除；原键未知结果边界、到期、权限与额度拒绝；不改现有实时协议 | 复用Console票据合同；生产默认关闭不变 | 已完成并验证本地软件范围 |

每片在提交前登记实际候选、验证结果及限制；完成编号划删除线。后续每个提交使用中文Conventional Commit标题加完整正文，包含改动/原因、实际验证和剩余限制，不能只有标题；已有提交不改写，本轮不推送。既有`deploy/README.md`差异保留。

### TODO-024-A 管理名称回执

已完成并验证本地软件范围。应用与看板目录接入独立PATCH及统一改名弹窗，按后端Unicode码点规则验证名称，原样保存并以纯文本显示；管理权限、项目与身份变化、网络未知结果均明确处理，不自动重放写请求。当前管理名称与已访问应用标签同步更新，最近访问时间/顺序保持，未访问对象不凭空加入记录。看板沿既有目录展示，没有新增最近访问实体。草稿展示名称、未保存编辑、草稿修订和发布修订保持原合同；后端业务实现未改。

候选为`master / fd06c6b19`加本轮已冻结差异；共同真实栈为本人8090/3019、PG5549数据库`tc_console_wp03_1791335430604652000`（OID29956）、Redis56390、Kafka59093、严格TLS Broker58884。新JAR SHA256为`4432463c7829f60f1aede63456c10492a236c0a978ad868b33701cbd2fb2cb1f`，完整5347份源文件快照、进程命令/监听与容器身份写入`logs/workbench-slice-unused-api-final/owned-runtime.json`及该目录公开源/配置快照；后续片沿同一联验候选，逐片提交只划各自文件，不将本地联验当远端CI。

专项4文件42项单元通过（`logs/todo024-rename-unit-final3.log`）；真实应用/看板两项分别3.8秒/8.1秒通过，证明远端草稿与发布字段不变、未保存输入保留，以及工作台已有最近访问标签更新。首轮应用E2E已通过业务断言，但离页确认后立即导航造成测试路由竞争，最近访问定位失败；修为等待看板路由完成后再进入工作台，未修改生产行为或放宽断言，首败保留在`logs/todo024-027-browser-first.log`。最终业务回归记录在`logs/todo024-027-browser-final.log`及对应Playwright报告。全量181文件2289项单元、构建、类型、专项ESLint/Stylelint通过；完整`pwsh scripts/docs-verify.ps1 -BaseRef fd06c6b19`通过821份文档、23链接语法案例及16项Java文档一致性测试（`logs/todo024a-docs.log`）。下一片为告警单读新鲜度；本片不新增后端版本规则，不推送、不继承正式部署或硬件资格。

### TODO-024-B 告警详情新鲜度回执

已完成并验证本地软件范围。打开或显式刷新告警抽屉时，先按实例ID读取当前摘要，再读取事件首屏；摘要读取失败显示不可用及刷新入口，不用旧列表内容冒充当前详情。关闭、切换实例/项目/身份，以及迟到的事件分页均按请求代次隔离，旧游标不带入新详情；摘要与事件是两次独立读取，不承诺原子快照。后端复用已有GET，不增加表、字段或写操作。

候选与真实栈沿024-A回执。专项12项（`logs/024b-unit.log`）及全量2289项单元通过；真实双浏览器会话中，B确认后A旧列表打开取得已确认摘要/事件，B清除后A显式刷新取得已清除事实，6.2秒通过。使用真实TLS MQTT产生告警，结束撤销本片设备凭据并清理本片规则，无通知发送。最终8项无跳过联验记录为`logs/todo024-027-browser-final.log`及`logs/workbench-slice-unused-api-final/playwright.json`。类型、ESLint、Stylelint和diff检查通过；完整`pwsh scripts/docs-verify.ps1 -BaseRef fd06c6b19`通过821份文档、23语法案例和16项Java文档一致性（`logs/todo024b-docs.log`）。下一片原始属性历史，当前结果不关闭旧告警投递专属门禁或取得远端CI资格。

### TODO-025-A 原始属性历史回执

已完成并验证本地软件范围。设备详情独立“原始属性历史”页签读取原始分页，展示NUMBER/TEXT/SWITCH/ENUM/OBJECT/LIST、采集时间、当时模型与质量标记，保留既有数值曲线。原始JSON通过有界严格解析保留整数/小数词法，纯文本显示对象与列表，不由JavaScript Number转换大整数。每页20条，游标绑定已应用的筛选；切换设备、身份、项目及关闭时取消并隔离旧响应。from包含、to排他，窗口仍由后端与租户套餐求交；接口不提供有效裁剪窗口元数据，页面不推测其边界，失败不显示成空数据。

发现并修复真实契约缺口：`DeviceTelemetryController.listProperties`运行端原有成功分页，但显式503声明遮住OpenAPI成功响应；补200/useReturnTypeSchema、针对性合同断言，并在既有结构矩阵精确登记新分页类型。未改变数据库、摄取、查询或额度行为，也未放宽全局结构检查。唯一入口`python3 scripts/generate-openapi-contracts.py`成功生成权威OpenAPI及Console/WebApp类型，73项真实生成测试零失败；首轮因分页矩阵未登记失败2项（新成功断言已通过），保留`logs/todo025-contract-generation.log`，修复后`todo025-contract-generation-final.log`通过。输入摘要`cccac81423f34c8889d70eb1919f074e0ba9e8061859d8a0e52ac84184a665f0`，OpenAPI摘要`ec19730e0d46082111ca0c1d6330ef618252d9ed6a2d452e643bbf0c578cfc85`；忽略键顺序后相对开片仅新增200响应与两个相关schema。

共同候选见024-A；后端当前reactor `./mvnw -pl things-cloud-bootstrap -am -DskipTests package`构建通过并实际启动新JAR，构建跳过测试不替代前述73项合同验证。专项17项与全量2289项单元通过；真实TLS MQTT六类型共24点，页面20/4分页、属性筛选/空页、大整数与脚本文字保真均通过，7.0秒。另有原设备REST/WS迟到顺序6.7秒及接入调试/项目切换9.6秒通过，证明保留原流程。记录见`logs/025a-unit.log`、`logs/todo025-backend-package.log`、`logs/todo024-027-browser-final.log`及最终公开源快照。构建、类型、双端api:check与专项静态通过；WebApp首个命令误用了Console的tsx入口，实际按其package脚本`node scripts/check-api.mjs`重新验证通过，首错保留。完整`pwsh scripts/docs-verify.ps1 -BaseRef fd06c6b19`通过821份文档、23语法案例与16项Java文档一致性（`logs/todo025a-docs.log`）。下一片OTA公开证明；本片没有扩大历史保留窗口或认领远端/硬件资格。

### TODO-026-A OTA公开发布证明回执

已完成并验证本地软件范围。固件页按需打开只读发布证明，复用GET release，展示制品大小/SHA-256、签名协议、指纹、发布时间与发布身份；展开后保留manifest/签名/SPKI精确Base64，支持复制公开材料。OWNER/ADMIN与ota:deploy、当前ACTIVE项目及READY固件先行复核，最终仍由后端裁决；70021/70022/70024、异常闭集响应、刷新、关闭和项目/身份切换均显式处理。展示公钥不建立设备信任，页面不宣称验签或升级资格，未新增下载签发或回退执行。

共同候选见024-A。当前自有8090栈原无READY/release，通过正式接口创建专属类型/模型并配置受控本地根、类型基线及签名器，再正式导入信任、登记基线、上传和发布。固件`01a116e4-760d-748f-8374-125378f1ebc1`达到READY，原发布`01a116e4-95bd-792f-9cfe-96d7364dafcc`达到COMMITTED，GET release200、只读数据库证明release仅1条；制品51字节，SHA256 `fe705962d556e2bf4a7d954476fb67e1cfe5d7d6776a2c67e3f66d2cf62e34ba`。公开配置/签名器进程身份、夹具和材料为`logs/026-a-ota-config-public.json`、`026-a-signer-runtime-public.json`、`026-a-proof-fixture-public.json`、`026-a-proof-public.json`；秘密不进入Git或报告。此为本机软件签名夹具，不代表真实设备、受控生产signer或公司服务器资格。

专项5文件110项、全量2289项单元、类型/ESLint/Stylelint均通过。真实浏览器4.8秒通过精确公开材料对照、显式刷新、关闭以及业务写请求0；1440与390宽度截图已人工读取检查，无横向溢出（最终Playwright目录的`release-proof-desktop.png`/`release-proof-mobile.png`）。准备首次漏带登录刷新cookie导致401，修为仅内存cookie；签名器首次因准备key尚未生成退出，随后在专有空闲54630启动。发布首次错误地用异步PREPARED后的旧生命周期判断失败，保留首败，只按原firmware/publication只读轮询取得READY/COMMITTED，未换键或重发发布。证据为`logs/026-a-prepare.log`、`026-a-publish.log`、`026-a-read-final.log`、`026-a-ready-database-public.log`及`logs/todo024-027-browser-final.log`。完整`pwsh scripts/docs-verify.ps1 -BaseRef fd06c6b19`通过821份文档、23语法案例与16项Java文档一致性（`logs/todo026a-docs.log`）。下一片实时票据；旧OTA正式下载/回退/硬件专属门禁不因本片通过而关闭。

### TODO-027-A 实时订阅票据回执与本轮收口

已完成并验证本地软件范围。消息调试页新增显式签发工具，首版选择**一个设备、1至50个当前不可变物模型属性**及WS/MQTT协议；后端原支持20设备/200属性的合同保持，页面未冒称已提供批量选择。读取真实binding-metadata冻结设备和版本，POST携带Idempotency-Key，仅发送一次，不经通用认证自动重放。未知结果、10014首次秘密不可重放及额度/身份/未启用/租约拒绝均明确提示，用户必须点击“明确创建新意图”再签发；旧票据仍可能有效并占额，关闭窗口不代表服务端撤销。

秘密只在当前弹窗内存，关闭、离线、身份/项目变化、卸载及保守到期计时清除，迟到结果不回填；不进入日志、URL、浏览器持久存储或报告。只展示连接参数，不自动连接，不替换现有设备WS；MQTT地址由管理员提供独立应用入口，页面不猜设备Broker地址。业务后端与生产默认关闭设置未改；仅本片自有8090测试启动配置启用票据，用于实际签发验收，不代表正式环境已启用。

API/状态与真实组件会话两文件25项通过（含过期、离线、切换用户/项目与在途迟响应），全量181文件2289项零失败（`logs/todo024-027-unit-final.log`，87.71秒）。最初新增组件测试的输入类型缺HTMLInputElement导致vue-tsc失败，已精确修复并复验；真实浏览器首轮WS签发/秘密清理成功，MQTT测试误点Element Plus被可见标签覆盖的原生radio而超时。改为点击可见标签并断言选中，未放宽验收、未改生产代码，保留`logs/todo024-027-browser-second.log`。最终WS与MQTT均取得真实201、精确模型与属性请求、关闭清理和持久存储无秘密，公开WS连接数未增加，9.3秒通过；trace/video/自动截图关闭，秘密断言在浏览器内只返回布尔。

五片共同最终验证：`logs/todo024-027-browser-final.log`及`logs/workbench-slice-unused-api-final/playwright.json`显示**8 PASS / 0 SKIP / 0 FAIL / 0 FLAKY，58.4秒**，覆盖6项新能力与原设备实时顺序/接入调试。源码5347文件冻结，当前JAR/数据库/容器/进程与公开配置身份见024-A及最终manifest。Console build、vue-tsc、改动范围ESLint/Stylelint、双端api:check、73项OpenAPI真实生成测试及各片完整文档门禁通过；初始2284项全量通过后按独立审查补会话/过期回归，再获2289项。此前默认49通过/25条件跳过保持其旧候选回执，本轮按改动传播范围运行上述8项，不把旧默认矩阵或条件跳过当当前资格。完整`pwsh scripts/docs-verify.ps1 -BaseRef fd06c6b19`通过821份文档、23语法案例与16项Java文档一致性（`logs/todo027a-docs.log`）；五条提交均在写入前验证完整正文，收尾按实际提交范围再次核对链接与diff。

本轮5片覆盖6项建议能力，编号已划删除线，单设备票据范围及各独立外部门禁按上述边界保留。提交映射：024-A `0e83ecc37`、024-B `96d51bba8`、025-A `204e07ce8`、026-A `eba4758ef`，027-A由包含本回执的`feat(console): 增加短期实时订阅票据工具`承载。五片均采用中文标题加说明改动/依据/验证/限制的正文，提交前通过真实commitlint，不改已有历史、不推送。既有`deploy/README.md`差异原样保留，Jagonzn独立仓库未修改。Node22、Windows、远端CI、公司服务器、真实设备/生产signer、模型出站及R4暂停范围均NOTRUN，不因这些页面补齐而放行。


## ThingsX App 项目接入

项目列表的 App 接入二维码功能随客户端 TL-02-C 交付，App 专属裁决、验证和限制统一登记在
[App 开发计划](../../../.private/thingslink-docs/things-link-flutter/docs/V1_PLAN.md#TL-02-C%20项目二维码接入)，本页仅保留导航，不重复开发流水账。

本机开发HTTP二维码及默认显示修复见[TL-02-E](../../../.private/thingslink-docs/things-link-flutter/docs/V1_PLAN.md#TL-02-E%20Console本机项目二维码)，记录继续归App知识库。
