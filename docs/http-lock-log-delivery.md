# 锁具日志与第三方JSON HTTP交付

本功能位于独立jagonzn仓库：service生成并留存自己的JT808协议日志，cloud接收并按配置投递第三方。只建设后端，不增加前端；未提供第三方真实合同及地址时出口默认关闭，可使用本机模拟JSON接口验证。2026-10-29已完成既有日志验证、普通候选真机自动交付及带发送范围保护候选的新真机复验；最新一轮只交付2条新开关日志，无历史补交。较早未带保护的一轮准备阶段曾误补交历史至隔离模拟环境，失败证据继续保留，不作所有历史轮次均无误补交的声明。测试产物、数据库数据、临时文件与原始日志保持外置；当前已按后继授权开放接口1的单一路径临时测试转发，不上传或替换线上业务JAR，不提交或推送。

2026-10-29后继已确认作业系统的两个方向：接口1为第三方POST给cloud，仅接收、校验并打印/保存JSON日志；接口2为cloud向第三方POST开关锁记录。接口1已在服务器`34.80.56.185`的HTTP80入口开放临时无鉴权接收路径，后端运行在本机外盘；接口2六字段及按记录uuid去重已确定，发送URL仍未提供，发送端保持关闭。未触发真机动作或发送真实第三方。实现和73项本地回归见下方[作业系统双向HTTP合同](#作业系统双向HTTP合同)。

## 作业系统双向HTTP合同

### 接口1：接收作业开锁任务JSON

由第三方调用`POST http://34.80.56.185:80/azy/task/receiveSafetyProSystemTask`，`Content-Type: application/json`，无需Authorization、Bearer、登录、用户或租户上下文。按负责人最新要求，原预备令牌方案已从接收代码移除。接口只接收并保存JSON，不创建自动开锁任务、不下发设备命令、不授予开锁权限、不写ThingsLink业务表。

现有Nginx仅新增默认HTTP80中该精确POST路径，经服务器回环26881和SSH转发到本机cloud `127.0.0.1:18081`；其他IP请求维持444，既有API/Console的HTTP308跳转保持一致。`nginx -t`和reload通过，无鉴权公网POST实测HTTP200、`code=200`，原始字节落盘并打印JSON。后端和隧道须保持本机在线，这是临时测试入口；没有在云端上传/部署cloud JAR。应用兼容路径`/api/v1/partner/work-unlock-tasks`仍仅在本机提供，未新增其公网路由。先前`10.128.198.6:8060`已撤销，不是当前地址或接口2发送目标。

字段为`uuid/planBeginTime/planEndTime/lockNum/phoneNum/title/lineName/lineKm/sealOffBeginTime/sealOffEndTime/sealOffNum`，见[合法JSON示例](../deploy/lab/work-unlock-task-request.example.json)。计划时间采用`yyyy-MM-dd HH:mm`，开始早于结束；标题限定所提供的七种，线名及里程仅展示。封锁时间和命令号在调令未下达前可缺省、null或空字符串；有值则校验格式。原示例中的单引号、缺少逗号及`2025-12-0408: 00`须按合法JSON和声明格式填写，不自动猜测纠错。

```properties
jagonzn.cloud.work-tasks.enabled=true
jagonzn.cloud.work-tasks.external-root=<已核验外盘根>
jagonzn.cloud.work-tasks.journal-directory=<专属0700外盘目录>
```

启用时须配置日志位置，环境变量分别为`JAGONZN_CLOUD_WORK_TASKS_ENABLED/EXTERNAL_ROOT/JOURNAL_DIRECTORY`；没有令牌、用户或租户配置前置。目录须归当前用户所有并由本实例独占。每次接收的原始JSON字节以0600文件`task-<接收标识>.json`原子保存并fsync后才返回成功；上限10000条原件或64MiB，不静默清理。同一作业uuid再次推送时逐次另存，保留后续补充的封锁参数，不擅自覆盖旧数据。此处只是请求日志，不认领作业计划的业务去重或执行。

成功为HTTP200、`{"code":200,"msg":"成功"}`；参数错误为HTTP400，日志持久化失败为HTTP503，两者响应均为`{"code":500,"msg":"失败"}`。控制台及Logback打印接收JSON，手机号沿用脱敏；完整原件保存在专属外置日志目录，不依赖异步Logback完成持久化。当前不增加数据库表或前端。

### 接口2：发送开关锁记录JSON

由cloud向第三方提供的URL发送HTTP POST。使用专用`payloadProfile=WORK_LOCK_RECORD_V1`，输出严格六字段，不发送内部租户、设备凭据、原厂报文或派发意图。当前指定IMEI和固定手机号只保存在外盘私有准备配置，仓库示例均为合成值；命令号未确定时`sealOffNum`留空字符串，不虚构编号。

| 字段 | 来源与语义 |
| --- | --- |
| uuid | 本条稳定事件ID去掉连字符得到32位标识；开锁和关锁分别有自己的ID，重试不重新生成，不使用作业主键合并两条记录 |
| optime | 本次开/关锁事件的`occurredAt`转为北京时间，输出`yyyy-MM-dd HH:mm`，不改写为发送或重试时刻 |
| lockState | `UNLOCK_REPORTED`→`开锁`，`LOCK_REPORTED`→`关锁`；鉴权、授时、状态快照、ACK及命令意图不转换成动作记录 |
| lockNum | 由外置constants显式配置，当前使用负责人指定的IMEI，不根据设备UUID或MAC猜填 |
| phoneNum | 外置constants中的固定手机号；不被接口1传入的手机号自动覆盖 |
| sealOffNum | 外置constants中明确的调令命令号，当前为空；后续修改只影响新任务，已入队正文继续冻结 |

目标格式见[合成配置示例](../deploy/lab/work-lock-record-target.example.json)：必须POST、HTTP成功码200且JSON数值`/code=200`，并明确`idempotencySupported=true`。已按负责人确认采用接收方对正文uuid去重的合同；HTTP200业务失败、其他非合同成功响应及超时均按原任务有界重试，相同uuid、正文及幂等键不变，不跟随重定向。次数由`maxAttempts`限制；业务失败耗尽记录`PARTNER_RETRY_EXHAUSTED`并打印“需联系接口提供方”，网络未知耗尽保留`RESULT_UNKNOWN`含义，不声称对方一定未收到，也不自动联系外部人员。通用连接器的旧策略保持原样。

同时必须固定`deviceId`及cloud首次接收时间窗口`receivedNotBefore/receivedNotAfter`。入队SQL在LIMIT之前筛选来源/租户/项目、设备、明确开关类型和窗口，既有历史、其他设备及伴随事件不会抢占首批。新目标默认不会通过缺省窗口放开全部历史；同目标ID改设备、窗口或格式时暂停旧范围领取，不改写旧正文。service原有发送范围保护继续生效，两端都不自动补交历史。示例使用合成身份、未来窗口和不可用演示域名，不能直接作为正式配置。

实际私有准备文件在外盘`.private/deployment-session/work-lock-record-contract-20261029/prepared-target.private.json`，包含已指定IMEI、手机号、空命令号及两个接口的方向；发送URL和启用时间窗口留空，`enabled=false`。接收端已启用，无鉴权配置与`partner-http-openapi.json`及`inbound-live/接口1-对接说明.txt`均已更新，可转交对接方，不含私有凭据。接口1本机cloud与独立接收数据库`jagonzn_cloud_work_inbound_20261029`持续运行，原始JSON保存在`incoming-task-journal`，stdout/文件日志在`inbound-live`。接口2仍需提供发送URL、确认其鉴权和允许的新交付范围；发送端沿用受控HTTPS规则，明文HTTP仅用于回环模拟。


### 本轮验证与边界

独立外盘Lima/VZ环境新建cloud测试库`jagonzn_cloud_http_work_record_20261029`，未访问service或ThingsLink业务表。最终73项cloud回归全部通过、0失败/错误/跳过并打包成功。发送端使用真实PG和回环HTTP接收端，验证六字段、北京时间、开关独立uuid、业务500/非成功HTTP/超时重推同正文、按正文uuid仅写一次、重试耗尽、历史和设备隔离及旧目标快照兼容；接收端通过两个MVC HTTP路由验证无鉴权接收、参数、原始字节外置持久化、重复作业补充日志及写失败不返回成功；另有真实公网HTTP POST确认无身份/租户信息即可保存并返回成功。

未发送任何真实锁具历史或触发物理命令，当前运行中的带保护service未重启或替换，旧三组日志及签收标记保持不变。原始报告、Mock HTTP收发、接收原件、私有配置和候选摘要统一见外盘`.private/deployment-session/work-lock-record-contract-20261029/receipt.json`。本轮只改jagonzn-cloud及配套测试/示例/说明，并按最新授权启用单一路径临时HTTP转发；没有修改ThingsLink业务代码、表、迁移或业务JAR，未提交或推送。公网测试是合成任务日志，不构成开锁授权或动作。

## 职责与现有平台边界

`jagonzn-service`的专属扩展`Jt808LogJournal`按已核对的DM08-V(A)协议保存逐条事实，`Jt808LogForwarder`通过既有HTTPS/HMAC私有入口交给cloud。cloud沿用`/api/v1/internal/service-events`验签、部署/租户/项目范围检查、持久Inbox和重放防护；收到日志不等于第三方收到，更不代表物理动作成功。

固定ThingsLink `260fa694`的新协议公开上行标准化器目前只生成属性信封，不能将锁日志直接塞进该入口冒充标准事件。这个事实已在本轮向负责人汇报，见[JPF-004补充](PLATFORM_CAPABILITY_FEEDBACK.md#6.%20JPF-004：厂商协议适配与公共扩展边界)。本实现只在Jagonzn专属外置日志和cloud自有表中保存扩展事实，不调用平台内部事件写表，也不修改ThingsLink源码、数据库表、函数或历史迁移。平台原属性、凭据、预算、命令控制及未知结果不重发的约束保留。

第三方接口发生变化只调整cloud连接器配置；若未来要把日志纳入ThingsLink原生设备事件合同，仍须负责人评审后由ThingsLink开发者交付正式入口。

## 日志范围与JSON语义

服务端已完成身份校验后，覆盖当前支持的注册/鉴权、心跳、0200状态、0201查询、0001应答、控制/查询下发意图及未知消息元数据。所有已识别的E2原因0～15均保存，包含厂家明确报告的开锁、关锁、低电、剪断、拆盖、开锁失败、唤醒、重启、移动、卡操作及密码操作。错误鉴权、非法帧不会成为可信业务日志；未知消息只保留类型/流水等元数据，不泄露未经解释的报文体。

- `UNLOCK_REPORTED`、`LOCK_REPORTED`分别来自E2明确的原因1、2，不从门磁变化猜测历史动作。
- 定时快照为`STATUS_REPORTED`，查询为`QUERY_RESPONSE`；卡或密码操作仍保留其实际原因和门磁字段，不伪装成远程开锁成功。
- 下行只记录`COMMAND_DISPATCH_REQUESTED`与`physicalResult=UNCONFIRMED`；收到0001记录`DEVICE_ACK`，不因此生成实物开关锁成功。
- E1仍按厂家当前启用的开锁计数处理，不当成尚未启用的厂家日志闭环序列号。扩展分配自己的`sourceSequence`用于排序，不能替代厂家保证。

私有日志事件包含`schemaVersion=1`、稳定`eventId`、`eventType=jagonzn.lock.log`、可信tenant/project/device、`occurredAt`、首次`receivedAt`、扩展`sourceSequence`及payload。payload含logType、UP/DOWN、厂家消息ID/流水与允许公开的解释字段；不含平台密钥、JT808鉴权码、卡号、人脸、ICCID或完整厂家报文。

完全相同的厂家报文摘要在同一保留日志范围内沿用首次事件ID及时间；厂家没有启用可靠记录号时，不能承诺跨无限历史的恰好一次识别。只保存设备实际提供的日志，不能恢复设备从未上报的动作。真实固件互通、断电数据及厂家全日志完整性仍待现场验收。

## service外置留存与交付开关

默认两个开关均关闭。启用日志留存须设置：

```properties
jagonzn.jt808.logs.enabled=true
jagonzn.jt808.logs.directory=<已核验外盘内的0700日志目录>
```

目录须存在、归当前用户所有、独占使用；原件及签收标记0600，原子写入并fsync。上限4096条日志或64MiB，满时拒绝确认新日志，不能静默删除。当前没有自动归档/删除；长时间运行前需要明确保留、归档及容量政策。签收后原件继续保留，未签收可在重启后补交，不能删除原件清空未知状态。

启用向cloud交付还须设置以下独立开关与现有私有身份配置：

```properties
jagonzn.jt808.logs.delivery-enabled=true
jagonzn.jt808.logs.delivery-scope-file=<外盘内0600私有范围文件绝对路径>
jagonzn.jt808.logs.poll-millis=5000
jagonzn.cloud.private-delivery.url=https://<受控cloud主机>/api/v1/internal/service-events
jagonzn.cloud.private-delivery.source-deployment-id=<稳定部署UUID>
jagonzn.cloud.private-delivery.key-id=<密钥标识>
jagonzn.cloud.private-delivery.secret-base64=<私有32字节密钥的Base64>
```

cloud的`service-events`来源身份及项目配置必须与实际日志匹配。独立日志发送不要求开启原平台Kafka事件转发开关，也不扩展公开Webhook的事件类型。未开启交付时只留存；开启后缺少目标或范围文件会拒绝启动，不回退为全量补交。仅cloud返回约定的HTTP200持久签收才保存范围内日志的`.accepted`标记；不跟随重定向，TLS正常验真。已启用目标不可达时保留原件，定期重交同一事件，新nonce不改变业务事件ID。

### 发送范围与启动保护

2026-10-29针对历史误补交增加`Jt808LogDeliveryScope`，仅在service内实现，默认交付开关仍关闭。启用交付必须提供独立范围文件，不能只设置`delivery-enabled=true`。示例中的UUID、路径、序号和UTC窗口须根据当次明确范围填写，不使用占位值直接启动：

```json
{
  "schemaVersion": 1,
  "scopeId": "<本轮唯一UUID>",
  "mode": "NEW_ONLY",
  "journalDirectory": "<外盘日志目录的真实绝对路径>",
  "cloudUrl": "https://<受控cloud主机>/api/v1/internal/service-events",
  "sourceDeploymentId": "<稳定部署UUID>",
  "tenantId": "<租户UUID>",
  "projectId": "<项目UUID>",
  "deviceId": "<设备UUID>",
  "afterSequence": 0,
  "receivedNotBefore": "<UTC窗口起点>",
  "receivedNotAfter": "<UTC窗口终点>",
  "logTypes": ["UNLOCK_REPORTED", "LOCK_REPORTED"]
}
```

文件须为当前用户所有的外盘普通文件，权限0600、最大16KiB，不允许符号链接、未知字段、缺失/非法身份、非整数序号或空类型集合。日志真实目录、HTTPS目标和来源部署必须分别与实际日志实例及最终生效配置完全一致；例如旧`JAGONZN_JT808_LOGS_DIRECTORY`覆盖到历史目录，而范围文件固定新目录时，启动直接失败，不发送或伪造签收。范围文件是受控输入，不能从继承环境变量临时生成来替代当次确认。

`NEW_ONLY`首次启用时，`afterSequence`必须等于该目录持久计数器的当前值：新空目录为0；有58条既有日志且计数器为58时填58，只允许之后的新事件。启动会连同已签收原件检查计数器一致性，删除计数文件不能伪装成空目录。校验及范围摘要持久化在JT808监听开始前完成；若日志仍在增长，应先停止写入再准备新范围，启动检测到序号不一致则保留原件并拒绝发送。

确认摘要以`delivery-scope-<scopeId>.sha256`存于日志目录，权限0600并原子持久化。重启必须复用同一范围文件字节和scopeId，允许范围内尚未签收的日志继续重试，不重算起点、跳过待交付日志或扩大成全历史。修改已确认文件后不能沿用原scopeId；新增范围须重新明确边界，首次仍从当时当前序号之后开始。此模式不提供历史补交或全量发送开关，也不自动续期接收窗口；窗口只筛选事件`receivedAt`，已在窗口内产生的待交付事件可在窗口结束后继续按原范围重试。

每次发送前复核范围文件摘要、权限、日志目录身份和范围确认摘要。删除/修改文件、替换目录、删除/篡改确认均停止发送并保留原件。筛选要求序号大于起点、tenant/project/device精确一致、类型在白名单内且首次接收时间位于闭区间窗口；先筛选再取最多10条，不能因前面58条旧待交付占满批次而让新日志永远无法发送。范围外原件不删除、不移动、不生成`.accepted`。历史文件与已确认范围均不能由发送器擅自清理。

源码候选已完成175项JT808/迁移聚焦测试及打包，涵盖真实Spring环境变量优先级复现、58条旧日志保护、新日志可达、身份/类型/时间窗口、重启保留稳定事件和新nonce、运行中/批次间范围变更、确认与目录替换等。首轮32项聚焦中有1项测试夹具错误：从已失败的AssertableApplicationContext读取环境被拒绝；移至初始化器核对后，后继175项全部通过，首败及报告原件保留。软件回归回执位于外盘`.private/deployment-session/jt808-delivery-scope-guard-20261029/receipt.json`；当时未替换运行中service或触发真机动作。后继已按新授权完成[带保护候选的真机复验](#带保护候选的真机复验)，两次验证分别绑定各自证据，不修改ThingsLink或cloud业务代码，也不撤回先前误补交失败记录。

## cloud连接器配置

cloud只访问自己的`jagonzn_cloud`数据库，V2迁移新增`cloud_http_log_delivery`，不共享service业务表。管理员准备0600私有JSON目标文件后启用：

```properties
jagonzn.cloud.http-delivery.enabled=true
jagonzn.cloud.http-delivery.targets-file=<私有JSON目标文件绝对路径>
jagonzn.cloud.http-delivery.poll-millis=1000
```

[完整回环测试配置](../deploy/lab/http-log-targets.example.json)使用合成UUID与本机地址，仅为演示。运行本机明文模拟接口时须同时设置`jagonzn.cloud.http-delivery.loopback-test=true`；生产目标必须HTTPS并将连接器的`loopbackTest`设为false。正式配置由管理员审批固定目标，不提供未鉴权的任意URL写入接口。

| 字段 | 含义 |
| --- | --- |
| id / revision | 稳定目标标识与配置版本；一个事件对一个目标只创建一份原任务 |
| sourceDeploymentId / tenantId / projectId | 精确来源范围，不跨租户/项目广播 |
| url / method | 受控完整地址；方法POST或PUT |
| eventTypes | 选择来源事件，锁日志使用`jagonzn.lock.log` |
| fieldMappings | 输出JSON字段名到来源JSON Pointer的映射；空映射保留整个事件 |
| constants | 额外JSON常量，不覆盖已配置的映射字段 |
| headers | 普通HTTP头；认证类头禁止写明文值 |
| secretHeaderEnvironment | HTTP头名到环境变量名，例如Authorization→PARTNER_AUTH_HEADER；环境变量值含完整Bearer前缀 |
| successStatuses | 按第三方合同确定的2xx接收状态集合 |
| successPointer / successValue | 可选业务JSON判断，例如`/received`等于true；空指针表示仅按状态码 |
| idempotencySupported | 对方明确支持稳定幂等键后才能设true；不是本系统单方面的保证 |
| maxAttempts / timeoutSeconds | 总尝试上限1～10，响应超时1～30秒 |

目标文件当前在应用启动时读取。改配置后重启cloud，对新事件生效；已创建任务冻结原目标版本和正文，不能将旧事件在重试时悄悄发往新地址。同一目标ID改变来源范围时，旧范围任务暂停领取；不要复用ID来自动重放历史。新目标启用会处理Inbox中与其范围/类型匹配的保留事件，不承诺找回已被外部清理的历史。

## 可靠状态与打印

签名受理在cloud事务提交后打印`接收成功_来源事件已持久保存`及脱敏JSON。独立Worker从Inbox生成唯一待投递任务，在事务外执行HTTP；每个目标独立推进、每份任务有独占租约。任务状态为`PENDING/SENDING/RETRY_WAIT/DELIVERED/UNCERTAIN/FAILED`。

- 每次实际发送打印方法、交付ID和请求JSON；收到响应打印HTTP状态及响应JSON。
- 成功码和可选业务JSON条件均满足、任务状态成功提交后，才打印`发送成功_第三方已按合同接收`。
- 202默认是待确认，不能当成第三方业务完成。普通4xx或业务拒绝为失败；429/5xx、网络超时等只在已有幂等合同且未耗尽尝试时自动重试，否则保留UNCERTAIN。
- 对方收到但本地状态未提交、或进程重启遗留发送租约时，同样按幂等合同恢复；不会把数据库失败重新包装成确定的远端失败。
- 始终携带稳定`X-Jagonzn-Event-Id`及`Idempotency-Key`，请求正文在任务创建时冻结。没有第三方去重合同不能声称HTTP恰好一次交付。
- 重试可能使交付乱序；事件保留设备时间与扩展序号供对账，不承诺所有目标全局有序。未交付关键日志不能用普通清理脚本删除；当前需运维核对UNCERTAIN/FAILED，不提供未鉴权的重放HTTP入口。

诊断不打印认证头，JSON中的密码/令牌/卡号等递归脱敏，普通打印最多8192字符并标明截断；第三方响应读取上限64KiB，请求上限256KiB。TLS验证保持启用，HTTP重定向不跟随。特殊第三方签名或非通用JSON协议在合同明确后通过专用适配实现，不提前开放任意脚本。

## 验证与实际边界

在jagonzn根先运行`python3 -B scripts/check-storage.py`，然后使用[后端验证入口](../scripts/verify-http-lock-logs.py)分别执行cloud和service；入口固定核对专用外置Lima/Docker，准备独立cloud测试库，Maven缓存、构建、JUnit和真实JVM临时目录均在外盘。每轮使用新的`--run`标识保留首败。

[双JAR验证入口](../scripts/smoke-http-lock-logs.py)使用两个实际JAR、正常service/真实Kafka与数据库、HTTPS签名cloud及本机模拟第三方。只使用合成国密锁，验证开/关日志分别经POST/PUT交付、重复帧不增加日志、接收/发送成功打印及数据库状态提交；所有自建应用和模拟接口在结束时停止，原件不删除。实际候选、数量、失败及结果见外盘`.private/deployment-session/http-lock-log-20261028/receipt.json`。

本地通过不代表真实锁具日志完整性或真实第三方已联通；接口地址、字段和认证合同未定，正式出口保持默认关闭。具体后端代码、日志与SQL均在jagonzn自身工程，未修改ThingsLink业务代码、表、函数或迁移，未启动公网、提交或推送。

### 两条既有真机日志的本机HTTP联调

2026-10-29按当次授权，固定代码提交`01b2bef048071ad6dc68e50b3c0c18aa57a9810a`，只选扩展序号56的`UNLOCK_REPORTED`及57的`LOCK_REPORTED`。保留原事件ID、时间、正文及门磁判断依据，将字节一致的副本交给service候选JAR中的现有`Jt808LogJournal`/`Jt808LogForwarder`，在独立JVM运行同步交付；没有启用真机service的持续补交开关，也没有重启该进程或下发设备命令。这验证了实际发送组件及真实日志，不冒充运行中service的全量调度验收。

cloud从该提交重新打包，以正常应用启动，在已核验Samsung外盘Lima/VZ环境中新建独立数据库`jagonzn_cloud_real_http_20261029_r3`，正常执行自身迁移。第三方为仅监听回环的JSON模拟接口，测试结果为`PASS_SELECTED_REAL_LOGS_LOCAL_HTTP`：

| 验证项 | 实际结果 |
| --- | --- |
| service→cloud | TLS验真、HMAC签名和范围检查通过；Inbox准确保存2条原事件，副本获得签收标记；此阶段第三方关闭，出站任务0条 |
| cloud→模拟第三方 | POST字段映射及PUT完整事件均通过HTTP200和JSON业务条件；2条事件×2个目标共4份任务为DELIVERED，打印实际请求和响应JSON |
| 重复交付 | 使用新nonce重复提交同样的2条事件；Inbox仍2条、任务仍4份、第三方仍4次写入；没有重建正文或增加投递 |
| 超时与重启恢复 | 模拟对方先持久接收、响应延迟超过1秒；2份幂等任务持久为RETRY_WAIT后终止并重启本轮独占cloud，各重试1次后DELIVERED；每条正文及幂等键一致，对方每条只写入1次 |
| 无幂等合同 | 相同超时下2份任务各尝试1次后保留UNCERTAIN，重启后仍不盲重发；不将模拟端已写入的事实伪装成本端已确认成功 |

最终Inbox只有这2条事件；4个测试目标共8份任务，其中6份DELIVERED、2份为故障注入预期的UNCERTAIN。模拟接口共收到10次请求、产生8次唯一写入，目标之间的独立写入不计为同一目标重复。原有58条日志摘要及0个签收标记未改变，没有补交其余历史。本轮自建cloud进程和模拟接口均已停止，隔离库、原件及日志保留在外盘；无需修改业务代码，未发现需交ThingsLink开发者修复的业务问题。

证据位于外盘`.private/deployment-session/http-real-lock-log-20261029/summary.json`及`attempt3/receipt.json`，包含候选JAR摘要、原件保留核对、数据库读回、模拟端请求/实际写入和收发日志；`attempt3/cloud-logs/info/info.log`为应用文件日志。前两次首败分别为本机JVM代理未排除回环地址、验证脚本截断psql多行JSON，原始失败记录分别保留在根目录和`attempt2`，未改业务代码或SQL状态制造通过。真实第三方地址、认证、字段及幂等合同仍待确定，本机通过不替代其验收。

### 运行中service自动交付新真机日志

2026-10-29后继按当次授权准备一次新真机开关锁，使用正常service进程的`Jt808LogForwarder`后台调度，不再由独立发送组件读取副本。候选JAR沿用上节固定摘要，原协议状态、身份和绑定保留；本轮service使用新的外盘日志目录，cloud与模拟第三方使用独立会话及数据库，不改变ThingsLink业务代码或迁移。

准备阶段发生一次范围失败：继承的`JAGONZN_JT808_LOGS_DIRECTORY`环境变量优先于新配置文件，导致58条既有日志被误补交到本轮隔离测试库，并向本机POST/PUT模拟接口产生116份写入，违反“不补交历史”的要求。这次不能标记通过或声称没有历史补交。现场尚未操作、未提交开锁，未发送真实第三方；停止自建cloud/模拟接口并恢复service后，58个误生成的签收标记移入外盘失败证据目录，原58条日志摘要及原0个签收标记已恢复。失败库和模拟端收件原件保留，没有删除记录或改写为成功；此首因是本轮运行配置错误，不是已确认的ThingsLink业务缺陷。

纠正后的会话同时固定环境变量和配置文件中的新日志目录，并在发送关闭时先以`lsof`确认service实际持有新目录的独占日志锁、没有打开旧目录，确认cloud及模拟接口均为0条后，再重启启用自动发送并重复核验。模拟接口拒绝原58条事件ID，监视器发现旧事件或旧签收标记变化即停止。失败及恢复证据统一保存在外盘`.private/deployment-session/jt808-live-http-20261029/scope-failure-recovery.json`；新会话的目录核验及后继真机结果位于同目录下的`attempt2`，不与失败库混算。

纠正后真机新链路结果为`PASS_NEW_PHYSICAL_CYCLE_AUTOMATIC_HTTP`：13:53:00仅通过正常命令API提交一次开锁，正常service进程取得新鲜门磁闭合基线后派发一次；同一命令关联的两条新日志按序为`UNLOCK_REPORTED/OPEN`、`LOCK_REPORTED/CLOSED`，原生命令为SUCCEEDED、attemptCount=1。现场回复“完成”，不额外推定其单独确认过语音或独立锁舌传感器。命令输出仍标注厂家门磁判据、协议ACK未收到及独立锁舌位置UNKNOWN，不把HTTP投递成功当作物理执行依据。

| 新会话验证 | 实际结果 |
| --- | --- |
| 实际自动交付 | 正常service进程的后台发送线程直接读取新日志目录；未复制日志、未调用独立发送组件；留存8条新事件并取得8个cloud签收标记 |
| cloud独立入库 | 正常HTTPS/HMAC入口保存8条新事件，事件ID和JSON正文逐条与service原件一致，与原58条事件ID无交集 |
| 模拟第三方 | POST/PUT各收到完整JSON；8条事件共16份DELIVERED、各尝试1次、16次独立写入；其中本次命令的2条开关日志对应4份成功交付 |
| 原状态回归 | 既有12条命令历史、旧控制记录及人工核对原件、鉴权码和身份保持不变；旧58条日志字节及0个签收标记保持恢复后的状态 |
| 收尾范围 | 停止本轮cloud与模拟接口，恢复原service配置和默认关闭的自动补交；新日志、隔离库及失败证据外置保留；没有关锁下发或开锁重发 |

8条新事件包括鉴权、两次建立基线的ALARM、授时请求、命令派发意图、开锁、关锁及休眠通知；不把这些伴随事件混称为8次开关锁。新会话使用独立数据库`jagonzn_cloud_live_http_20261029_r2`。逐事件三端JSON核对、命令状态和前后历史比较、实际进程及目录锁、收发JSON和退出恢复记录分别见`attempt2/verification.json`、`cycle-events.json`、`cycle-deliveries.json`、`cloud-inbox.json`、`partner-requests.json`及`restored.json`；总回执含准备阶段范围失败，不抹去误补交事实。未修改业务代码或ThingsLink源码/迁移，正式第三方合同仍待确定。

#### 带保护候选的真机复验

2026-10-29后继按当次授权，将带保护的service候选替换本机测试实例，SHA-256为`c1ff388e549a90fafb4f62fce874c6c670fda6e5b72043a8f75eb9eae83835a4`，与175项软件回归及打包候选一致。未上传服务器JAR或更改线上服务；沿用已存在的临时`34.80.56.185:6808`入口及原绑定、鉴权码和协议状态。

范围文件为独立外盘0600文件，`NEW_ONLY`、新目录起点0，精确绑定本次部署/租户/项目/设备和接收窗口，类型仅允许`UNLOCK_REPORTED/LOCK_REPORTED`。先关闭发送确认新目录独占锁与空Inbox，再开启保护并核对服务实际生成的范围确认摘要，现场操作前cloud及模拟接口均为0条。新事件由正常service后台线程自动发送，没有复制日志或手工调用发送组件。

| 验证项 | 实际结果 |
| --- | --- |
| 单次新命令 | 新鲜闭合基线后仅提交、派发1次开锁，原生命令SUCCEEDED；后继OPEN/CLOSED两条日志关联同一命令，没有关锁下发或开锁重发 |
| 发送范围 | service保存8条本轮新事件，仅2条开关日志被cloud签收；其余6条鉴权、授时、基线ALARM、派发意图及休眠等记录无签收标记、未对外发送 |
| cloud→模拟第三方 | 独立库`jagonzn_cloud_guarded_live_20261029`只有2条Inbox事件，POST/PUT共4份DELIVERED，各尝试1次、模拟端4次唯一写入；原事件ID和JSON正文三端一致 |
| 历史保护 | 原58条日志及上一轮8条日志目录、全部文件摘要和签收标记逐项不变；本轮从准备到退出无旧事件混入或历史补交 |
| 状态回归 | 既有13条原生命令历史、旧控制记录与人工核对原件、身份及鉴权码保持不变；完成依据仍为厂家门磁变化，协议ACK缺失和独立锁舌位置UNKNOWN保持如实表达 |
| 收尾 | cloud和模拟接口停止；本机保留新候选健康运行，配置文件及环境变量均明确关闭本轮自动交付，新日志及范围确认原件外置保留 |

本轮结果为`PASS_GUARDED_REAL_CYCLE_AUTOMATIC_HTTP`。现场原答为“完成”，未额外推定单独确认过语音或独立锁舌传感器。总回执位于外盘`.private/deployment-session/jt808-guarded-live-http-20261029/receipt.json`；范围与实际启动证明、逐事件/HTTP回执、命令状态和保留新候选证据分别见同目录`delivery-scope.json`、`scope-startup-proof.json`、`verification.json`、`cycle-events.json`、`cycle-deliveries.json`、`partner-requests.json`及`retained.json`。当前只通过本机测试候选与模拟第三方，真实第三方合同仍未确定；未提交、推送或线上部署，先前未保护候选的误补交记录继续保留。
