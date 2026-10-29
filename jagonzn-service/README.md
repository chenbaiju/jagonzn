# jagonzn-service

jagonzn-service 是 jagonzn 的设备接入与运行服务，当前通过平台普通运行时 JAR 复用 ThingsLink 后端内核，目标是独立承担多协议接入、设备管理、遥测、规则、技术告警、任务、命令和可靠信息转发。

service 不内嵌独立的浏览器管理页面，但必须保留受控设备及授权管理 API 和无前端时可用的运维/恢复入口；后续由 `jagonzn-console` 统一呈现技术操作，并集成 `jagonzn-cloud` 的业务操作。当前已完整复用 Console，真实联调与运行时同步见[专题记录](../docs/console-reuse-and-evolution.md)，旧静态页回执不代替新候选验证，见 [JADR-0007](../docs/adr/0007-unified-console-and-backend-boundary.md)。

jagonzn 是 ThingsLink 租户，禁止修改 ThingsLink 的任何代码或数据库表；仅通过已有受支持能力开发自身设备适配并验证。平台不足及建议登记到[独立反馈文档](../docs/PLATFORM_CAPABILITY_FEEDBACK.md)，由 ThingsLink 自行评审。

TCP 智能锁是既有业务场景，首台验证设备以项目进度文档中的裁定为准；范围不限于 TCP，也不只是透传报文。MQTT／EMQX、HTTP、TCP、CoAP、Kafka／Redpanda、Worker、Webhook、Outbox、PostgreSQL／TimescaleDB、Redis、MinIO 等按已交付能力和装配需要复用。

## 当前状态

已完成[门磁与命令关联真机闭环](src/main/java/com/jagonzn/service/extension/jt808/README.md#门磁上报与命令结果关联)：显式开启门磁确认模式后，唯一在途命令、同连接新鲜相反基线和有效期内对应原因的目标状态变化可经平台公开回复端口完成命令。11:10:43真机OPEN报告对应的开锁任务已进入`SUCCEEDED`，实际派发1次；后续CLOSED日志关联同一命令。协议ACK仍缺失且输出明确保留此事实，六条历史超时不改写。133项聚焦测试通过，内核18个JAR未改；仅本机候选联调，未提交、推送或部署。开关默认关闭，严格基线和关联限制见专题，不将状态满足冒称设备回传命令ID或独立锁舌传感。

锁舌到位能力已完成[协议核对及新候选真机复验](src/main/java/com/jagonzn/service/extension/jt808/README.md#锁舌到位能力核对)：负责人已与嵌入式确认，本型号以门磁动作判断开合锁。service按真实门磁上报自动形成`lock_state=OPEN/CLOSED`，标明来源`MANUFACTURER_DOOR_CONTACT`；无门磁字段则保持未知。后继本机启动123项测试通过的候选，真机10:49:06/10:49:08的原因1/2已自动生成OPEN/CLOSED和开关锁日志，正常平台历史false→true及最终影子true均通过，现场过程和“门已关闭”语音为辅助核对。当前TCP没有独立锁舌到位反馈，门磁不动时不能靠等候5秒推算锁舌动作；指令ACK仍缺失，命令超时保留。公网仅一条开锁，无关锁或重复开锁；未改ThingsLink业务代码、提交、推送或部署，候选及原件见专题外盘回执。

JT808已新增默认关闭的[独立日志留存及cloud交付](../docs/http-lock-log-delivery.md)：逐条保存已认证协议事实和明确开关锁原因，外置原件保留稳定事件ID/扩展序号，通过私有HTTPS/HMAC入口交给cloud。它是Jagonzn扩展日志，不冒充ThingsLink标准设备事件；控制意图和ACK仍不等于物理成功。2026-10-29已按负责人请求恢复真机调试，第三方地址及合同未定时不发送正式请求。

自动交付现须配置独立的`jagonzn.jt808.logs.delivery-scope-file`（环境变量`JAGONZN_JT808_LOG_DELIVERY_SCOPE_FILE`），固定真实日志目录、目标和部署/设备身份、起始序号、接收窗口及类型；缺失或被环境变量覆盖成不匹配的目录时拒绝启动发送，不自动补交历史。首次`NEW_ONLY`从目录当前序号之后开始，同一范围重启保留未签收事件；范围外原件不删、不写签收标记。配置、迁移说明及本轮回归只维护于[发送范围与启动保护](../docs/http-lock-log-delivery.md#发送范围与启动保护)。

2026-10-29仅在service继续[真机下行与主动状态联调](src/main/java/com/jagonzn/service/extension/jt808/README.md#后继下行与主动状态联调)：已真实读出V1.9、2026-06-17；门磁分离/贴合产生的`0x0200`逐条受理，正常平台历史已记录false→true，影子门磁true、电量100。已按协议区分休眠通知和查询回执，睡眠期间暂停新下行，原因15只记通用报警及门磁事实。当前116项聚焦测试通过，18个ThingsLink内核JAR保持原字节。后继[单次远程开锁与自动合锁](src/main/java/com/jagonzn/service/extension/jt808/README.md#单次远程开锁与自动合锁)曾收到现场成功反馈，负责人随后更正上轮只是操作门磁、未确认锁舌动作，故撤回实物通过结论；公网仅一条`0x8500`且无关锁命令，缺少控制应答及开合锁原因上报，平台仍超时，后继固定门磁、仅触摸按键唤醒的独立测试已明确观察电机动作、锁舌缩回及约5秒自动伸出，实际分离并贴回磁铁后已收到原因1/2的开关日志，正常属性历史和影子通过；协议ACK仍缺失，平台保留超时，需厂家核实。本轮继续仅在service增加带证据摘要的当前锁住核对及脱敏拒收阶段日志，121项聚焦测试通过，未改cloud或平台业务源码、表、迁移及JAR，未提交、推送或部署。下方旧候选的停止/未验口径保留其历史范围，不覆盖本条。


2026-10-28已更新至`com.things.link:things-link-runtime:0.0.1-SNAPSHOT`固定上游提交`260fa694876fce1b728ba87a4b91466765942aac`，`entitlement`和仅测试使用的`issuer`依赖同源；Java引用、`things-link.*`配置、构建角色映射和本机启动脚本已对应更新。18个内核JAR逐字节匹配该提交构建，14域/548条SQL及1份附属迁移配置、25个主题一致；service打包及16项聚焦测试通过。[固定清单](../docs/service-upstream.json)绑定实际模块与service JAR摘要，不能仅凭SNAPSHOT坐标认定同步。

JT808扩展集中在[专属包](src/main/java/com/jagonzn/service/extension/jt808/README.md)，复用本service构建与运行进程，开关`jagonzn.jt808.enabled`缺省关闭。[开发测试计划](../docs/jt808-development-plan.md)已补国密注册鉴权、会话接管、状态上报及命令关联；查询结果与开锁ACK/未知严格区分。文档参数已核对并私有外置，真实固件匹配待验。软件回环后已在外置独立数据库、Kafka等中间件上完成正常service联调；模拟国密终端的注册鉴权、属性历史/影子、查询、控制超时不重发、重启去重与凭据撤销通过。测试应用已停止，数据及中间件保留；历史库兼容和真机仍未验，未部署6808、提交或推送。[详细同步与边界](../docs/console-reuse-and-evolution.md#2026-10-28%20ThingsLink运行时同步与JT808扩展迁入)保留上轮结果，下方2026-10-10及更早的制品/运行结果是历史。

2026-10-10 已按上游 `fb349e1f8` 重建当前本机运行时，使用独立 Docker 数据库启动；14 个迁移域、355 条数据库迁移及25个 Kafka主题已核对。具体模块/制品摘要和 Console 验证见[专题记录](../docs/console-reuse-and-evolution.md)。后续平台源码变化不会自动更新本服务，须重新构建依赖、打包、核对迁移并重建容器。以下早期接收材料保留原限定范围。

当前已引入 `com.things.cloud:things-cloud-runtime:0.0.1-SNAPSHOT` 本地候选，形成约 194 MB 的独立可执行 JAR。独立 `jagonzn` 库的空库/历史升级、权限 RLS、管理 HTTP 授权和最小健康入口已通过本地测试；真实 EMQX/Kafka/MinIO 标准设备链路、非商业模式、不可变制品及恢复仍未验收。当前进度以[项目总览](../docs/PROJECT_PROGRESS.md)为准。

现已新增默认关闭的[单项目 cloud 签名事件发送适配](../docs/adr/0010-service-cloud-signed-event-forwarder.md)。平台内部来源、外部 service 装配、封套与真实回环 HTTPS 取得聚焦回执；真实 Kafka 到 cloud 独立库、断线积压、跨项目、密钥轮换和正式授权仍待验。该适配不使用公开 Webhook 私网目标例外。

| 配置 | 当前值 |
| --- | --- |
| Maven 坐标 | `com.jagonzn.service:jagonzn-service` |
| 版本 | `0.0.1-SNAPSHOT` |
| Spring Boot | `4.1.0` |
| Java | `21` |
| HTTP 默认端口 | `18080`，避开 ThingsCloud bootstrap 的 `8080` |

ThingsLink 是当前版本基准。以下2026-09-24为改名前历史： 已按负责人要求将本项目 Spring Boot parent 从 4.1.1 对齐到 4.1.0；jagonzn-cloud 已是 4.1.0。当前平台候选装配及可重复验证见[运行时同步记录](../docs/console-reuse-and-evolution.md#2026-10-28%20ThingsLink运行时同步与JT808扩展迁入)。

## 自部署待审申请

cloud 私有事件适配仅供两后端受控部署：须同时显式启用 `JAGONZN_CLOUD_INTERNAL_EVENT_SOURCE_ENABLED` 与 `JAGONZN_CLOUD_PRIVATE_DELIVERY_ENABLED`，并配置精确 HTTPS 目标、稳定部署/租户/项目 UUID、双方一致的 key ID 与 32 字节密钥。变量名见 `src/main/resources/application.properties`，cloud 接收端的对应配置见 [cloud 说明](../jagonzn-cloud/README.md)。当前只绑定一个项目，未经完整双库验收不得把它用作正式现场事件交付；service 不因 cloud 不可达而停止本地设备受理。

首个业务租户建立后，管理员取其真实 UUID，在权限受限的父目录下运行：

```text
java -jar target/jagonzn-service-0.0.1-SNAPSHOT.jar --prepare-enrollment <专用身份目录> <业务租户UUID>
```

命令生成并固定 `deployment-identity.bin`、`enrollment-request.tcshreq`。相同目录和租户重复执行返回同一封套；不同租户或损坏文件不会被覆盖。仅将 `.tcshreq` 文件交给 ThingsCloud 运营人员登记，**不要传递或提交整个身份目录**；目录含部署私钥，需要单独安全备份并保持仅管理员可访问。无可验证私有权限的文件系统会拒绝生成。当前仅在 macOS/POSIX 做本机验证，Windows ACL 与正式制品仍须单独回执。申请登记只到 `PENDING`，不包含套餐、签发或运行时限制；见 [JADR-0006](../docs/adr/0006-local-enrollment-identity-file.md)。

## 职责

- 管理设备技术身份、凭据、协议绑定、心跳、连接和设备数据。
- 保存逐次开锁等设备事件，处理技术规则与报警，提供技术命令执行与回执能力。
- 通过版本化事件和命令合同集成未来 jagonzn-cloud 或其他业务系统。
- 在 cloud 未部署时继续完成本地接入与处理；已配置接收方故障时按合同积压、重试和补发。
- 目标是保留租户、项目、权限与真实计量，同时由平台正式交付非商业准入策略；当前该策略尚未完成，见 [JPF-003](../docs/PLATFORM_CAPABILITY_FEEDBACK.md)。

谁能开锁、允许时段、人员与场所关系属于未来 jagonzn-cloud 业务。service 仍需验证调用权限与操作范围；无限商业额度不意味着绕过鉴权。

## 已知接入边界

ThingsCloud 已有标准 TCP/TLS 和逐条受理确认，但不自动支持厂家私有 TCP 帧。开锁记录和设备自报报警需要补齐可靠设备事件能力；不能将标准属性接入等同于事件闭环。TCP 跨实例 D-190 已开发、验证并关闭；jagonzn 独立部署仍需形成自身装配与设备验收证据，不能将此写成 D-190 未完成。

## 部署目标

只部署 service 与必要中间件即可运行，不需要同时部署 ThingsCloud 应用、三个平台前端或 jagonzn-cloud。JAR 不包含中间件服务端；具体部署角色、端口、证书与容量在实施阶段确认。

## 开发与知识库

本机独立中间件及应用的一键候选入口见 [jagonzn 部署说明](../deploy/README.md)。该入口自动生成被 Git 忽略的外置配置和独立凭据；手动执行下面的 Maven 命令前仍须先准备运行资源与配置。

安装 JDK 21，在本目录使用 Maven Wrapper：

```powershell
.\mvnw.cmd verify
.\mvnw.cmd spring-boot:run
```

Linux／macOS 对应使用 `./mvnw`。构建前须从同版本 ThingsCloud 源码或正式制品仓库安装运行时依赖；启动前须提供[运行指南](../../.private/thingslink-docs/docs/reuse-entry/THINGS_LINK_REUSE_RUNTIME_GUIDE.md)列明的 jagonzn 独立库、密钥及中间件配置。测试成功不代表真实设备链路已完成。

从本项目根目录执行启动命令时，Logback 默认写入本目录的 `logs/error`、`logs/warn`、`logs/info`、`logs/debug`，不与 cloud 共用日志目录。若由 IDE、服务管理器或 JAR 从其他工作目录启动，显式设置 `JAGONZN_SERVICE_LOG_PATH` 为本项目 `logs` 的绝对路径；旧的通用 `LOG_PATH` 不再控制本服务。

应用启动后，`GET /actuator/health` 返回最小健康状态。该入口表示当前进程可响应，不包含数据库、ThingsCloud 内核或设备连接的就绪保证。`env`、`metrics` 等 Actuator 端点未公开。服务使用 Tomcat NIO2；本机 Windows/Temurin 21.0.11 下默认 NIO 的 selector 管道无法建立，片内验收见[实施记录 J0-1](../docs/progress/J0.md)。

本项目新增或修改代码和配置时必须添加准确的中文注释；新增协议监听器也须避开 ThingsCloud 已配置端口。提交正文须用一句中文说明改动、验证与结论，见[知识库规范](../docs/README.md)。

- [知识库入口](../docs/README.md)
- [双项目架构主文档](../docs/jagonzn-system-architecture.md)
- [service 内核复用方案](../docs/jagonzn-service-backend-architecture.md)
