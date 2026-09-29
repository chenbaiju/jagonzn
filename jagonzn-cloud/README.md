# jagonzn-cloud

jagonzn-cloud 定位为未来 jagonzn 定制化设备 SaaS 的业务后端，负责设备背后的业务规则与 API。智能锁场景包括人员与场所关系、谁能开哪把锁、有效时段、授权撤销、业务审计及告警处置。后续 `jagonzn-console` 是统一浏览器前端，分别使用 cloud 的业务 API 与 service 的技术/授权管理 API；见 [JADR-0007](../docs/adr/0007-unified-console-and-backend-boundary.md)。

原由本项目承担的 ThingsCloud 内核复用与设备接入职责已迁移到 **jagonzn-service**。cloud 后续通过版本化 API 与事件集成 service，不直接维护 MQTT／TCP 等设备连接，也不共用 service 的业务表。

## 当前状态

当前已有**第一项独立业务后端基础能力**：显式启用的私有 service 事件接收 API、独立 PostgreSQL Inbox/nonce 迁移与健康入口。它只持久接收并去重已验签的技术事件，尚未实现人员、场所、开锁权限、业务投影、命令或统一前端；`jagonzn-console` 仍不存在。合同见 [JADR-0009](../docs/adr/0009-cloud-private-event-inbox.md)。

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

本后端不内嵌 SaaS 网页，不迁入 ThingsCloud 平台前端；浏览器操作由后续 jagonzn-console 统一承担。当前不开发移动端、小程序或 cloud 自身的商业套餐；service 的自部署签名四档授权另按平台 ADR0216～0227 实施，不能与人员开锁权限混为一谈。

现有私有事件接收端不改变公开 Webhook 的私网目标拒绝策略，也不表示 service 已可向 cloud 可靠投递。

service 在 cloud 未部署或暂时不可达时仍应独立接入、存储和处理设备数据。当前 cloud 接收端只证明入站持久化，service 私网发送仍须另行开发和验证。

## 本地开发

安装 JDK 21、Docker 并配置 JAVA_HOME，在本目录使用 Maven Wrapper：

```powershell
.\mvnw.cmd test
.\mvnw.cmd spring-boot:run
```

Linux／macOS 对应使用 `./mvnw`。`test` 使用一次性 PostgreSQL 容器核对迁移、签名、重放、真实 HTTP 和中文注释。`spring-boot:run` 需要显式提供 `JAGONZN_CLOUD_DATABASE_URL`、`JAGONZN_CLOUD_DATABASE_USER`、`JAGONZN_CLOUD_DATABASE_PASSWORD`，指向 **cloud 自己的库**；不应使用 service 的数据库凭据。默认私有事件入口关闭，健康接口可用并不表示业务联动成功。

启用接收端还须设置 `JAGONZN_CLOUD_SERVICE_EVENTS_ENABLED=true`、来源部署/租户/项目 UUID、签名 `key-id` 与 32 字节密钥的 Base64，变量名见 `src/main/resources/application.properties`。缺任一绑定启动失败。测试环境可使用临时密钥；正式环境的密钥分发、轮换、内网 TLS 代理及 service 私网发送仍需独立实施和验收。应用端口不得直接暴露给设备网。

事件请求须携带 `X-ThingsCloud-Source-Deployment-Id`，接收端先验签再核对它与受控配置中的部署 ID；发送端适配和仍待完成的双端验收见 [JADR-0010](../docs/adr/0010-service-cloud-signed-event-forwarder.md)。

从本项目根目录执行启动命令时，Logback 默认写入本目录的 `logs/error`、`logs/warn`、`logs/info`、`logs/debug`，不与 service 共用日志目录。若由 IDE、服务管理器或 JAR 从其他工作目录启动，显式设置 `JAGONZN_CLOUD_LOG_PATH` 为本项目 `logs` 的绝对路径；旧的通用 `LOG_PATH` 不再控制本应用。

本项目新增或修改代码和配置时必须添加准确的中文注释；HTTP 或其他监听器不得占用 ThingsCloud 已配置端口。提交正文须用一句中文说明改动、验证与结论，见[知识库规范](../docs/README.md)。

## 架构知识库

- [知识库入口](../docs/README.md)
- [双项目架构主文档](../docs/jagonzn-system-architecture.md)
- [service 内核复用方案](../docs/jagonzn-service-backend-architecture.md)
- [原 cloud 文档职责迁移说明](../docs/jagonzn-cloud-backend-architecture.md)
