# 锁具日志与第三方JSON HTTP交付

本功能位于独立jagonzn仓库：service生成并留存自己的JT808协议日志，cloud接收并按配置投递第三方。只建设后端，不增加前端；未提供第三方真实合同及地址时出口默认关闭，可使用本机模拟JSON接口验证。设备现场接入继续暂停，测试产物、数据库数据、临时文件与原始日志保持外置，不提交、推送或部署。

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
jagonzn.jt808.logs.poll-millis=5000
jagonzn.cloud.private-delivery.url=https://<受控cloud主机>/api/v1/internal/service-events
jagonzn.cloud.private-delivery.source-deployment-id=<稳定部署UUID>
jagonzn.cloud.private-delivery.key-id=<密钥标识>
jagonzn.cloud.private-delivery.secret-base64=<私有32字节密钥的Base64>
```

cloud的`service-events`来源身份及项目配置必须与实际日志匹配。独立日志发送不要求开启原平台Kafka事件转发开关，也不扩展公开Webhook的事件类型。仅cloud返回约定的HTTP200持久签收才保存`.accepted`标记；不跟随重定向，TLS正常验真。未提供目标时只留存、不制造无限失败请求；已启用目标不可达时保留原件，定期重交同一事件，新nonce不改变业务事件ID。

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
