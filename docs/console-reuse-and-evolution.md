# Console 完整复用、上游同步与后续精简方案

更新日期：2026-10-10。

## 当前决定与职责

负责人已确认前端目录为独立的 `jagonzn-console`，不是 Java 后端 `jagonzn-cloud`。为减少重复开发，当前完整复制 ThingsCloud Console 的受版本控制文件，暂不执行菜单精简；产品显示名改为 `jagonzn`，开发请求默认连接独立 `jagonzn-service`（18080），前端使用 13006。cloud 保持现有业务后端职责，本次不增加其业务接口或页面。

本决定恢复此前暂停的 Console 全量复制；既有静态测试页与其回执只证明当时的静态候选，不作为新 Console 的验收。保留 JADR-0007 的统一前端与双后端分工，当前仅接 service，不声称 cloud 登录/业务合同已经完成。

## 已接受、暂不实施的精简方向

面向使用者，后续考虑首页、设备、告警、设置四个公共区域，个人中心放头像菜单。首页合并总体概况；设备提供通用列表、搜索、状态与分组；告警提供列表与详情；设置按已具备接口提供组织、管理成员及通知信息。暂不新建复杂场所、业务人员、角色配置或插件框架。

应用管理、看板设计器、自动化、场景、任务、设备模型、消息日志、拓扑、Modbus、OTA、API Key、Webhook 暂时全部保留在复制源码中，不在本轮删减。未来是否显示由明确业务需要和权限决定。部署激活、授权和诊断仍需保留管理员恢复路径。

设备范围包括锁、断路器、烟感、水位检测等；具体设备操作、通行时段及人员权限等在对应设备接入后再讨论，不提前实现。此节是后续产品方向，不是当前开发清单。

## 完整复制范围与品牌边界

- 上游版本及路径映射以 [console-upstream.json](console-upstream.json) 为准，首次来源为 ThingsCloud `fb349e1f80649a2f795c6645e291fc90cb31a3b8`。读取已提交版本；首次核对 Console/共享包范围无未提交改动。
- 复制全部前端源码、测试、脚本、文档、配置及资源；缓存、node_modules、构建输出、日志、密钥、本机配置和 Git 元数据不作为源码复制。
- 按负责人后续确认，共享 `things-cloud-client-contracts` 直接引用现有 `../../things-cloud-client-contracts`（相对前端目录），不复制副本。包名和 imports 保持兼容；这是构建源码依赖，不是对 ThingsCloud 后端进程的依赖。独立克隆须另行取得配套共享包，不能宣称仅克隆 jagonzn 即可完整构建。
- 固定 OpenAPI 快照保存为 `docs/upstream/console-openapi.json`。前端类型从该快照生成，不能用页面代码猜测后端合同，也不能在本任务内修改平台源码、表或迁移。
- 修改产品标题、系统显示名、导出作者默认值、公共帮助链接和前端刷新协调/最近访问命名空间。保留 MIT LICENSE、原作者、历史记录、字体文件名、协议字段、API 路径及共享包名，不做全局字符串替换。
- 上游工作约定和贡献入口另存 `jagonzn-console/docs/upstream/things-cloud-*.md`，当前入口改为本项目说明。旧静态页源码归档到 `docs/upstream/static-console/`，原测试回执保留。

## 上游更新方式

采用固定版本基线加三方合并，不采用重复覆盖目录，也暂不拆共享 UI 框架。三个输入分别是上次上游版本、本地当前定制、新上游提交。共享合同包不由此工具复制或合并，其实际工作区变更会直接影响下次构建；变更共享包后仍须重新核验 Console 和 service 的合同兼容性。本地品牌、代理和后续页面修改可与上游改进共同演进；同一处修改必须处理冲突。同步方向为 ThingsCloud → jagonzn，本项目改进不自动反写平台。

在 jagonzn 根目录执行（将路径与提交替换为实际候选）：

```sh
python3 scripts/console-upstream.py --source /path/to/ThingsCloud --revision UPSTREAM_COMMIT --output /tmp/jagonzn-console-candidate
```

工具只生成仓外 `files/`、`report.json`、冲突原件和 `console-upstream.next.json`，不修改工作区、不自动提交或推送。上游仓库须保留旧基线与新候选 Git 对象；独立克隆可使用 ThingsCloud 的只读克隆作为来源，不要求启动平台后端。候选输出目录必须尚不存在。

维护流程：

1. 先保存当前本地开发，选择一个明确的上游提交；不要对未提交工作做覆盖式同步。
2. 阅读 changed/deleted/conflicts，解决全部冲突；删除项单独确认消费者与恢复来源。对 API、合同和依赖变化做兼容审查。
3. 将审阅后的候选文件逐项合入，保留本地独有文件。涉及接口的新功能先确认 jagonzn-service 装配版本支持；缺能力时登记平台反馈，不能偷偷把请求转向 ThingsCloud。
4. 完成构建、类型、单元和必要的 service 联调，再用 next 清单替换当前清单并一起提交。若只挑选部分变更，不得直接推进完整上游基线，应保留旧基线并记录挑选内容。

“应该同步”表示建立可重复的更新流程，不承诺所有上游变化零冲突或未经测试自动上线。本轮不创建定时同步任务。单纯界面优化通常可以独立接纳；依赖新 API 的优化必须与 service 合同一起核验。

## 运行、验证与剩余范围

开发浏览器请求使用同源 `/api`，Vite HTTP/WebSocket 代理到 `127.0.0.1:18080`；生产部署必须提供对应反代。保留服务端菜单、权限与会话校验，不用前端模式绕过。后端未运行或功能版本不匹配时如实报错，不切回 ThingsCloud 后端。

上游 E2E、合同测试与脚本完整保存，其中平台 Maven、数据库、相对路径及隔离栈尚未全部适配。上游历史 PASS 不代表 jagonzn PASS；不得直接运行可能操作平台数据库的夹具。手机项目入口本机地址改到 18080，其移动端兼容性另行验证。

### 首次复制阶段验证（macOS 本机，Node 26.7.0 / pnpm 11.9.0）

- `pnpm --dir jagonzn-console install --frozen-lockfile`：通过；实际 link 指向现有父仓库 `things-cloud-client-contracts`，jagonzn 内副本已撤销。锁文件由 pnpm 重新生成；同步清单不包含共享包复制映射。
- `pnpm --dir jagonzn-console build`：共享合同一致性检查、合同构建、Vite 构建及 Vue/TypeScript 检查通过。最终输出见本机 `jagonzn-console/logs/reuse-shared-build.log`。
- `pnpm --dir jagonzn-console api:check`：固定 OpenAPI 与生成类型一致。
- `pnpm --dir jagonzn-console test`：最终 193 个测试文件、2387 项测试通过，使用直接引用的共享合同包。首次 192 文件/2364 项通过、1 文件因菜单快照缺失未运行；已将同版本快照纳入同步并修正路径，失败未当成通过。最终输出见本机 `jagonzn-console/logs/reuse-shared-test.log`。
- `python3 -m unittest discover -s scripts -p test_console_upstream.py`：7 项通过，覆盖单方定制、非重叠合并、文本冲突、双方删除冲突、二进制冲突和新增文件模式。
- 同基线生成同步候选：无文件改动、删除或冲突；证明重复检查不会覆盖本地品牌与代理定制。
- 本机 Chrome 无头浏览器访问 `http://127.0.0.1:13006/`：跳转登录页、标题为“登录 - jagonzn”，页面脚本错误为 0。报告及截图在本机 `logs/reuse-browser.json`、`logs/reuse-login.png`。Playwright 默认浏览器未安装，改用本机 Chrome；首次等待 networkidle 超时，改为明确等待登录输入框后取得结果，未将超时记录作为通过。
- `git diff --check` 通过；未修改 ThingsCloud Console 或共享合同包的受跟踪源码。本轮未提交、未推送。

首次复制时的剩余范围（后续结果见下节）：当时 18080 无运行中的 service，因此真实登录、HTTP/WebSocket 业务联调、全部菜单、真实设备和正式部署为 NOTRUN。前端全量文件保留不证明 service 当前装配版本兼容上游每个接口。旧静态网络测试不适用于新页面，原静态验收脚本须在新的验收范围内另行调整。


## 真实 service 联调与运行时同步（2026-10-10）

本节接续首次复制时的 NOTRUN 状态。用户已授权启动独立 jagonzn-service、真实登录及主要页面联调，并核对运行时是否继承当前上游能力；不包含真机适配、正式客户或生产放行。

### 版本与继承结论

源码基线为 ThingsCloud `fb349e1f80649a2f795c6645e291fc90cb31a3b8`。原 Maven 缓存中 runtime JAR 时间为 10 月 4 日；当前源码持续更新，`0.0.1-SNAPSHOT` 坐标本身不证明制品同步，更不会更新已运行进程。本次通过受支持的 runtime 入口重新 install 并打包 service，未修改平台源码。

实际修复：

- service 显式 Flyway 目录漏接 `assistant`，补为 14 个生产迁移域；发行方 `issuer` 不进入独立服务。新增迁移域覆盖测试，防止以后只更新依赖却漏迁移。
- jagonzn Kafka 初始化漏接 `tc.device.event.normalized`，导致新运行时因 missingTopicsFatal 拒绝启动；已补齐至同版本上游的 25 个主题及对应分区/保留期，未关闭该校验。
- Console URL、会话 Origin 及看板来源配置指向 13006，开发 API 代理仍为 18080；启动脚本支持 macOS/Linux Wrapper，并增加 `-ConsoleSmoke` 使用内网 SMTP 接收器。
- 初次启动与补齐迁移的重打包重叠，运行容器读取变化中的 target JAR 导致类加载异常。现改为摘要命名的固定 JAR 副本；启动先完成构建再切换容器挂载，后续 Maven clean/package 不改写运行制品。初次失败没有通过修复迁移历史或删除数据库掩盖。

当前运行 JAR SHA-256：`397387974761ddf88cf9fedee5fa7e49b4799014f3781895ecc4c87d86c20e5d`。包内 18 个平台模块逐一匹配本次上游构建，356 个迁移资源（含 SQL 附属配置）内容核对通过；数据库实际成功执行 355 条迁移，最新版本 `20261010.0200`。这证明本次候选的制品、迁移与部署配置同步，不证明所有硬件和业务能力均已验收。

### 隔离与访问

Compose 项目为 `jagonzn-service`，应用只在 `jagonzn-service_jagonzn` 网络中运行；PostgreSQL、Redis、Redpanda、EMQX 与 MinIO 均为独立容器。数据库 `jagonzn-service-postgres-1` 映射 `127.0.0.1:15432`，库名/owner 为 `jagonzn`，应用以 `jagonzn_app` 连接；数据卷与 `tc-postgres` 不同。未连接或修改平台业务数据库，无 `thingscloud*` 数据库角色。

启动：

```sh
JAVA_HOME=$(/usr/libexec/java_home -v 21) pwsh -NoProfile -File deploy/start.ps1 -ConsoleSmoke
pnpm --dir jagonzn-console dev
```

上述 JAVA_HOME 获取命令仅用于 macOS；Windows/Linux 使用各自 JDK 21 环境执行同一 PowerShell 入口。`-ConsoleSmoke` 的邮件仅保存在忽略的 `deploy/logs/smtp-test.local`，不投递外网；不将其当成生产邮件设施。正常用户访问 `http://127.0.0.1:13006/`，应用健康入口为 `http://127.0.0.1:18080/actuator/health`。

### 可重复验证与后续更新

```sh
# 先在 ThingsCloud 源码根的 things-cloud 目录构建配套运行时；不需要启动平台应用。
./mvnw -pl things-cloud-runtime,things-cloud-issuer -am -DskipTests install
# 回到 jagonzn 根；issuer 仅供本项目测试依赖，不打入 service 运行包。
./jagonzn-service/mvnw -f jagonzn-service/pom.xml -Dtest=JagonznMigrationNamespaceTests test
python3 scripts/audit-service-inheritance.py --source .. --output deploy/logs/service-inheritance.json
node jagonzn-console/scripts/jagonzn-live-smoke.mjs
```

更新流程为：固定上游提交 → 构建安装对应模块 → 保存独立库可恢复备份（已有数据时）→ service clean/package → 审计模块哈希、迁移目录/内容、Kafka 配置 → 使用固定制品重建应用容器 → 验证迁移及 Console 真实路径。不能只更新 Console 或共享合同包就宣称 service 已同步；不能自动执行 Flyway repair 或删除数据卷以跳过升级失败。

审计工具会报告模块不一致、漏迁移域及主题配置差异；须在上游构建完成后运行，源码提交号本身不代替编译证明。正式交付仍需非 SNAPSHOT 的不可变制品与完整兼容矩阵。

最终矩阵分两段完成，共 **16/16 页面通过**：首页、项目概况、设备列表、设备组、设备类型、告警历史、告警规则、自动化、手动场景、任务调度、应用管理、项目列表、项目成员、终端用户、项目设置、OTA 固件。每页等待对应真实业务 API 返回 200，并核对当前路由、页面错误和截图；应用管理按现有交互点击“读取应用目录”。测试项目没有设备，空列表与零统计不证明设备业务完成。

登录链路通过真实注册 → 本机 SMTP 邮箱验证 → 浏览器输入账号/密码及拖动滑块 → 登录 → 页面选择项目 → HttpOnly Cookie 整页刷新恢复。登录令牌 issuer 为 `jagonzn`。观察到的浏览器 API 来源只有 `http://127.0.0.1:13006`，代理与直接访问 18080 的身份响应一致；本机 8080 无后端监听，应用容器环境只连接自身网络中的中间件。此结论限定本轮观察范围，不代表任意未来部署配置自动合格。

实际前端修复与失败保留：

- `useAuth` 原本仅查菜单按钮 authList，告警规则菜单未列 alarm:read，导致合法用户不读取列表。jagonzn 副本改为实时采用 /auth/me.permissions 映射的会话权限；3 项回归覆盖读取、撤权和空会话，平台反馈为 JPF-005，未修改上游。
- 共享合同从副本改为直引后，旧 Vite 仍缓存已撤销路径，导致设备/应用页加载失败；重启并强制重建预构建缓存后恢复。改变 link 布局后必须重启开发服务。
- 首轮固定延时截到旧页面；改为独立文档加载并等待目标业务接口。整页恢复时 auth/me 的一次 401，仅在随后 refresh=200、me=200 时归类为正常恢复。
- 快速反复整页加载曾触发后端 429，未关闭限流；按正常节奏复测通过。应用目录需要用户主动读取，修正测试动作后通过。失败报告保存在 first-report、reload-report、stale-vite-report、permission-report，未抹除失败证据。

最终验证：前端构建/类型检查通过；194 个测试文件、2390 项单元测试通过；迁移 SQL 同源与迁移域覆盖 2 项通过；18 模块/356 迁移资源/25 主题审计通过；PowerShell 与新增脚本语法、Git diff 检查通过。没有执行全量硬件、公开 MQTT/WS 设备链路或生产验收；保留运行日志中的 MQTT 会话扫描告警供对应协议验收时核对，不能将 Console 页面通过扩大为所有协议已通过。上游及 tc-* 受跟踪配置未修改；首次联调结束时尚未提交或推送，后续提交前复核见下节。

汇总矩阵为 `deploy/logs/console-live/full-matrix.json`，分段报告 first-ten-pages 与 report 保留，截图与脱敏 API 轨迹同目录；原始隔离事实在 `deploy/logs/console-live/isolation.json`，模块清单在 `deploy/logs/service-inheritance.json`。测试账号由真实注册及邮箱验证创建，凭据仅保存在权限 0600、Git 忽略的 `deploy/logs/console-live/fixture.local.json`。

## 提交前界面与功能一致性复核

对照本机 ThingsCloud 当前 HEAD `fb349e1f80649a2f795c6645e291fc90cb31a3b8`，上游工作区干净；这是本次实际源码基线，不声称已追踪远端未来更新。逐文件读取上游受控文件并计算摘要，详见[差异清单](upstream/console-parity-audit.json)。900 个 Console 文件均存在，877 个逐字节相同，23 个存在经过核对的本地适配；另固定的 OpenAPI 与菜单快照均与该提交相同。

| 范围 | 上游文件数 | 内容完全一致 | 差异解释 |
| --- | ---: | ---: | --- |
| 页面 views | 115 | 114 | 手机入口提示改为 service 18080；复核补齐 Android 映射端口提示 |
| 组件 components | 98 | 97 | Excel 导出作者默认值改为 jagonzn |
| 路由 router | 29 | 29 | 无菜单/路由删减 |
| API | 57 | 57 | 请求合同保持一致 |
| 业务模型 features | 36 | 36 | 无业务模型删减 |
| 静态资源 assets | 75 | 75 | 样式、字体、图片保持一致 |
| 语言 locales | 2 | 2 | 文案字典保持一致 |
| 上游 E2E | 108 | 108 | 全部保留；不将保留等同于执行通过 |

其余差异逐项归类为：公共端口/代理、品牌标题/链接/导出作者、刷新锁与最近访问命名空间、共享包直引与配套锁文件、快照路径和相应测试、项目工作约定/说明，以及已登记 JPF-005 的会话权限修复。Vite 移除不存在的 crypto-js 预构建项，不移除实际依赖或业务功能；开发服务器固定回环 13006。页面结构、布局、路由和功能入口保留上游设计，但品牌与权限缺陷修复使两者并非完全零差异。

证据边界：以上是全量源码一致性核对，结合 jagonzn 真实浏览器页面验证；未启动第二套 ThingsCloud 后端做双站逐像素或全部业务操作对照。设备命令、复杂看板编辑、所有角色权限矩阵、完整上游 E2E、真机和生产资格均不能由本次结果推导。

本次复核另将启动脚本的系统识别改为 Windows_NT 环境值，避免旧 PowerShell 中不存在 $IsWindows 导致严格模式异常；仅 macOS PowerShell 语法已检查，未认领 Windows 实机启动。复跑首次浏览器未发出登录请求而超时，保存 review-login-timeout.json；测试补充拖动前等待滑块稳定及拖动后确认“验证成功”，没有绕过验证组件或后端鉴权。

提交前检查：前端构建/类型通过，194 文件/2390 单元测试通过，OpenAPI 检查通过，迁移测试2项及同步合并测试7项通过；运行时审计再次确认18模块、356资源、14迁移域、25主题一致。原始日志在 deploy/logs/console-review-*.log 与 service-review-tests.log；不提交凭据、Cookie、SMTP邮件、数据库、缓存或构建产物。GitHub CI 结果独立于本机测试，本仓库当前没有 .github/workflows，本次不声称远端 CI 已通过。

最终复跑一次完成真实浏览器登录及 **16/16 页面**，各页面对应业务 API 成功且无页面脚本错误；代理身份与直连18080一致，观察到的 API 来源仅为13006。脱敏结果和18模块摘要归档到[联调验证摘要](upstream/console-service-verification.json)，与[源码差异清单](upstream/console-parity-audit.json)随本次实现共同提交，原始日志与首次失败继续本机保留。已目视检查设备列表截图的品牌、侧栏、筛选、表格与空态；不宣称双站像素对比通过。

## 品牌图片与登录页定制

负责人补充界面差异范围，并明确不额外设计 Logo：直接使用提供的 `5a40a530cdfdd.png`，完整保留上方 JAGONZN 英文与下方“简工智能”中文，不重绘；后续按负责人要求通过两个显示视窗将完整英文行和中文行横向排列，原图不改写；仓内原图为 `jagonzn-console/src/assets/images/brand/jagonzn-original.png`。登录页左上角和移动端头部使用完整标识，菜单使用横向完整标识，不再显示“安智云”三个字，顶部用户入口与个人资料默认头像使用同一原图，按位置等比缩放；已有用户自定义头像仍沿用上游行为。

登录左侧插画替换为负责人提供的 `5a58185714d00.jpg`，仓内为 `company-building.jpg`，后续按负责人要求以 cover 铺满左侧模块，并增加轻微模糊和渐变遮罩；下方文字为“深圳简工智能科技有限公司”和“粤ICP备17016010号”。小屏仍遵循上游隐藏左侧图片区的行为。菜单、页面、表单、请求与权限逻辑保持此前已验证版本，仅以上品牌呈现适配；既有独立 service 连接和 JPF-005 修复继续保留。

两份图片按原字节复制入仓，浏览器复验桌面/手机登录、真实登录后的菜单和个人资料头像；构建及类型检查通过。截图保留于本机 `deploy/logs/console-live/brand-*.png`，品牌变更及本节验证记录一起纳入本次提交。前述900文件差异清单绑定品牌更新前的提交候选，不作为本轮新增图片和样式的零差异证明。

登录图片铺满版本：桌面横向标识宽320px，菜单展开188px，手机头部220px；菜单收起和头像保留完整双行图以适配窄位。铺满时照片按区域比例裁切，顶部浅色遮罩保证蓝色标识可见，底部深色遮罩承托白色公司名与备案号。其余页面与业务逻辑不变。

## 2026-10-28 ThingsLink运行时同步与JT808扩展迁入

负责人重新下载独立`chenbaiju/jagonzn`仓库，基线`59a006124632e63a2f857cab6c0442afed1b7001`且片前干净；本次授权恢复service维护，核对其上游同步并迁入JT808扩展。现行平台名称为ThingsLink；ThingsCloud是本工程改名前标识，历史Git、签名或私有合同名称不代表连接thingscloud.xyz参考产品。

核对确认需要更新：旧POM仍依赖`com.things.cloud:things-cloud-runtime`，配置、Java导入、生成SQL角色映射、启动脚本及继承审计也绑定旧命名；旧文档只记录10月10日355条迁移的运行结果。同一个`0.0.1-SNAPSHOT`版本号不会自动接收当前内核。当前以ThingsLink已提交`260fa694876fce1b728ba87a4b91466765942aac`为唯一上游候选，使用既有固定提交检出的后端源码（该后端范围无dirty差额）和本轮独占Maven仓库安装依赖；主工作区其他未提交后继不纳入。

实际变更：service切换到`com.things.link:things-link-runtime`及同源entitlement/仅测试issuer，Java导入与配置前缀改为`com.things.link`、`things-link.*`；生成SQL仍只做既有六种角色的`thingslink_*→jagonzn_*`确定性映射。本机启动脚本和继承审计同步新前缀/路径。首轮完整测试编译发现旧`FlywayCompatibilityConfiguration`已退役，改接`FlywayMigrationConfiguration`，保留顺序迁移与乱序拒绝，不新增repair或历史白名单。角色断言同时检查旧/新平台前缀残留。Kafka现有25主题与当前上游完全相同，不改主题配置。

已有签名封套的`issuerId=thingscloud`、`thingscloud.v1.*`密钥标识，以及service/cloud配对私有合同的`X-ThingsCloud-Source-Deployment-Id`头名暂保留。它们是已存在的信任/线格式，不是产品展示名称；本次不单方更改签名身份或cloud接收合同。正式信任锚本来仍未交付，不以这些兼容标识宣称正式授权通过。

JT808原独立工程的4个文件及全部空目录已从ThingsLink的`things-link-device-sdk/jt808/adapter/`移除，SDK索引恢复；上级厂家文档与两张图片保持。Java骨架迁入`jagonzn-service/src/main/java/com/jagonzn/service/extension/jt808/`，包名为`com.jagonzn.service.extension.jt808`，使用service现有POM，不保留独立适配器JAR或MQTT桥接进程。迁入时`jagonzn.jt808.enabled=false`仅预留缺省关闭开关，没有监听或协议实现；后继帧/国密实现和实际测试结果见[JT808计划](jt808-development-plan.md)。后继在该包内通过运行时受支持应用端口扩展，不修改ThingsLink源码、表或既有标准TCP实现。

验证：service主源码与完整测试源码编译、可执行JAR打包通过；迁移集合/域、申请/信任锚及私有转发相关7类16项全部通过，0失败/错误/跳过。新JAR中18个ThingsLink模块逐一匹配当前固定上游构建，14域/548条SQL加1份附属配置逐字节符合角色映射，25个主题/分区/保留期一致；旧things-cloud模块JAR未混入。实际模块与service摘要见[service当前清单](service-upstream.json)，不是正式不可变发行物。未改动ThingsLink后端源码；上游构建、service生成物和首败保留在已核外盘`/Volumes/Samsung/ThingsLink/testing/jagonzn-sync-20261028/`，构建通过`jagonzn.build.directory`显式外置。

复现时，先从固定ThingsLink检出使用其Wrapper安装`things-link-runtime,things-link-issuer -am`到专用Maven仓库，再在本仓执行：

```bash
./jagonzn-service/mvnw -f jagonzn-service/pom.xml   -Dmaven.repo.local=/Volumes/Samsung/ThingsLink/testing/jagonzn-sync-20261028/maven-repository   -Djagonzn.build.directory=/Volumes/Samsung/ThingsLink/testing/jagonzn-sync-20261028/service-build   -Dtest=JagonznMigrationNamespaceTests,EnrollmentRequestCommandTests,PackagedIssuerTrustTests,SignedGrantImportCommandTests,SignedGrantRuntimeConfigurationTests,PrivateCloudEventForwarderTests,PrivateCloudEventHttpsTests test
```

本次没有运行独立PG/Redis上下文、历史数据库升级、全service回归、Console/cloud更新、JT808真机或公网部署。静态复查将上下文测试的旧bean名称断言同步为现行`orderedMigrationStrategy`；这项上下文测试仍未运行。改名后的同版本SQL可能影响旧库Flyway校验和，必须取得实际旧库备份并做隔离兼容验证后才允许启动升级；不能仅把355与548的差值当成可直接追加的迁移。未连接、修复或修改旧库，未关闭许可/配额/安全守卫。两仓改动分别保留本地，未提交、推送或更改独立仓库关系。
