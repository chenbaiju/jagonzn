# jagonzn-cloud

jagonzn-cloud 定位为未来 jagonzn 定制化设备 SaaS 的业务后端，负责设备背后的业务规则与 API。智能锁场景包括人员与场所关系、谁能开哪把锁、有效时段、授权撤销、业务审计及告警处置。后续 `jagonzn-console` 是统一浏览器前端，分别使用 cloud 的业务 API 与 service 的技术/授权管理 API；见 [JADR-0007](../docs/adr/0007-unified-console-and-backend-boundary.md)。

原由本项目承担的 ThingsLink 内核复用与设备接入职责已迁移到 **jagonzn-service**。cloud 后续通过版本化 API 与事件集成 service，不直接维护 MQTT／TCP 等设备连接，也不共用 service 的业务表。

平台现行名称为 ThingsLink，旧工程名为 ThingsCloud，与 thingscloud.xyz 产品区分。本模块自身的 `jagonzn-cloud`、`com.jagonzn.cloud`、数据库名及 `jagonzn.cloud.*` 配置表示本项目的业务后端，不随上游品牌更名。

## 当前状态

当前已有**第一项独立业务后端基础能力**：显式启用的私有 service 事件接收 API、独立 PostgreSQL Inbox/nonce 迁移与健康入口。它只持久接收并去重已验签的技术事件，尚未实现人员、场所、开锁权限、业务投影、命令或统一前端；`jagonzn-console` 当前仅有免登录静态测试页。合同见 [JADR-0009](../docs/adr/0009-cloud-private-event-inbox.md)。

| 配置项 | 当前值 |
| --- | --- |
| Maven 坐标 | `com.jagonzn.cloud:jagonzn-cloud` |
| 项目版本 | `0.0.1-SNAPSHOT` |
| Spring Boot | `4.1.0` |
| Java 编译基线 | `21` |
| 应用名称 | `jagonzn-cloud` |
| 内部 HTTP 端口 | `18081`；默认只绑定 `127.0.0.1`，内网 HTTPS 由受控代理终止 |
| 数据库 | 独立 `jagonzn_cloud` PostgreSQL；必须显式配置连接，不能使用 service 数据库 |

POM 中的 `<modelVersion>4.0.0</modelVersion>` 是 Maven 模型版本，不是 Spring Boot 版本。

## 后续职责

- 管理 SaaS 客户、人员、组织、门锁与场所的业务关系。
- 决定人员开锁权限、允许时段及撤权，形成授权后的业务操作。
- 消费 service 的设备状态、开锁记录、技术报警与命令结果，维护业务投影和审计。
- 向 service 提交带幂等键与有效期的命令，根据真实回执更新结果。
- 处理结合人员授权与业务上下文的告警、工单和通知。

service 保持设备凭据、连接、遥测、技术告警和命令执行事实的权威；cloud 不复制或直接修改这些技术事实。人员权限也不能下沉成协议编解码器中的业务判断。

## 当前不建设的内容

本后端不内嵌 SaaS 网页，不迁入 ThingsLink 平台前端；浏览器操作由后续 jagonzn-console 统一承担。当前不开发移动端、小程序或 cloud 自身的商业套餐；service 的自部署签名四档授权另按平台 ADR0216～0227 实施，不能与人员开锁权限混为一谈。

现有私有事件接收端不改变公开 Webhook 的私网目标拒绝策略，也不表示 service 已可向 cloud 可靠投递。

service 在 cloud 未部署或暂时不可达时仍应独立接入、存储和处理设备数据。当前 cloud 接收端只证明入站持久化，service 私网发送仍须另行开发和验证。

## 本地开发

安装 JDK 21并配置JAVA_HOME。构建前先在jagonzn根执行`python3 scripts/check-storage.py`，准备本机已核验的外盘Maven缓存；service或其他模块的源码无需修改。以jagonzn根为工作目录运行无数据库的名称兼容检查：

```text
./jagonzn-cloud/mvnw -f jagonzn-cloud/pom.xml \
  -Dmaven.repo.local=<本机外盘Maven缓存绝对路径> \
  -Dtest=CloudServiceEventHeaderTests test
```

尖括号为本机路径占位，不是可直接执行的参数。Windows使用本模块`mvnw.cmd`及对应Python命令。默认构建输出为外盘映射下的`.private/workspaces/cloud-build`，也可用`-Djagonzn.build.directory`指定本项目已核外盘内的独立目录；validate检查输出与缓存，Surefire在JVM启动前设置外盘临时目录并外置测试日志。

不带`-Dtest`的全模块`test`会使用一次性PostgreSQL容器核对迁移、签名、重放、真实HTTP和中文注释，需先核对Docker及数据库数据也在外盘。本轮没有运行这些数据库测试。`spring-boot:run`需要显式提供`JAGONZN_CLOUD_DATABASE_URL`、`JAGONZN_CLOUD_DATABASE_USER`、`JAGONZN_CLOUD_DATABASE_PASSWORD`，指向 **cloud自己的库**；不应使用service数据库凭据。默认私有事件入口关闭，健康接口可用并不表示业务联动成功。

启用接收端还须设置 `JAGONZN_CLOUD_SERVICE_EVENTS_ENABLED=true`、来源部署/租户/项目 UUID、签名 `key-id` 与 32 字节密钥的 Base64，变量名见 `src/main/resources/application.properties`。缺任一绑定启动失败。测试环境可使用临时密钥；正式环境的密钥分发、轮换、内网 TLS 代理及 service 私网发送仍需独立实施和验收。应用端口不得直接暴露给设备网。

事件请求使用`X-ThingsLink-Delivery-Id`、`Timestamp`、`Nonce`、`Signature`、`Key-Id`及`Source-Deployment-Id`六个头（后五项同样带`X-ThingsLink-`前缀）。接收端先验签，再核对部署ID与受控配置；签名正文及版本保持原合同。

service发送端和cloud接收端统一使用上述六个ThingsLink头，来源部署头的旧名称遗漏已修正。接收端不再设置旧工程名称别名；全旧格式或缺少新来源部署头的混合格式均拒绝，每个必需新头恰好一份，重复值也不能通过。发送端适配和仍待完成的双端验收见[JADR-0010](../docs/adr/0010-service-cloud-signed-event-forwarder.md)。

2026-10-28已遍查本模块源码、配置、SQL、Maven/Wrapper和说明文件。6项cloud名称合同检查通过，覆盖新头、旧格式拒绝、重复/冲突头及验签/来源拒绝；6项service签名/真实回环HTTPS检查另外通过，断言实际发出的六个头全部使用ThingsLink名称。两组测试分别保留范围，不等于完整业务联调。当前原件见外盘独立`cloud-thingslink-header-fix-20261028`验证目录；最初名称检查的原始日志保留在`cloud-thingslink-rename-20261028`。本地已有`target/`历史生成物没有手工改名或删除，不作为当前候选证据；未运行完整应用、数据库或部署。

从本项目根目录执行启动命令时，Logback 默认写入本目录的 `logs/error`、`logs/warn`、`logs/info`、`logs/debug`，不与 service 共用日志目录。若由 IDE、服务管理器或 JAR 从其他工作目录启动，显式设置 `JAGONZN_CLOUD_LOG_PATH` 为本项目 `logs` 的绝对路径；旧的通用 `LOG_PATH` 不再控制本应用。

本项目新增或修改代码和配置时必须添加准确的中文注释；HTTP 或其他监听器不得占用 ThingsLink 已配置端口。提交正文须用一句中文说明改动、验证与结论，见[知识库规范](../docs/README.md)。

## 架构知识库

- [知识库入口](../docs/README.md)
- [双项目架构主文档](../docs/jagonzn-system-architecture.md)
- [service 内核复用方案](../docs/jagonzn-service-backend-architecture.md)
- [原 cloud 文档职责迁移说明](../docs/jagonzn-cloud-backend-architecture.md)
