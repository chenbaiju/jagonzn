# jagonzn-service

jagonzn-service 是 jagonzn 的设备接入与运行服务，当前通过平台普通运行时 JAR 复用 ThingsCloud 后端内核，目标是独立承担多协议接入、设备管理、遥测、规则、技术告警、任务、命令和可靠信息转发。

service 不内嵌独立的浏览器管理页面，但必须保留受控设备及授权管理 API 和无前端时可用的运维/恢复入口；后续由 `jagonzn-console` 统一呈现技术操作，并集成 `jagonzn-cloud` 的业务操作。当前已有免登录静态测试页，正式管理功能尚未开发，见 [JADR-0007](../docs/adr/0007-unified-console-and-backend-boundary.md)。

jagonzn 是 ThingsCloud 租户，禁止修改 ThingsCloud 的任何代码或数据库表；仅通过已有受支持能力开发自身设备适配并验证。平台不足及建议登记到[独立反馈文档](../docs/PLATFORM_CAPABILITY_FEEDBACK.md)，由 ThingsCloud 自行评审。

TCP 智能锁是既有业务场景，首台验证设备以项目进度文档中的裁定为准；范围不限于 TCP，也不只是透传报文。MQTT／EMQX、HTTP、TCP、CoAP、Kafka／Redpanda、Worker、Webhook、Outbox、PostgreSQL／TimescaleDB、Redis、MinIO 等按已交付能力和装配需要复用。

## 当前状态

当前已引入 `com.things.cloud:things-cloud-runtime:0.0.1-SNAPSHOT` 本地候选，形成约 194 MB 的独立可执行 JAR。独立 `jagonzn` 库的空库/历史升级、权限 RLS、管理 HTTP 授权和最小健康入口已通过本地测试；真实 EMQX/Kafka/MinIO 标准设备链路、非商业模式、不可变制品及恢复仍未验收。当前进度以[项目总览](../docs/PROJECT_PROGRESS.md)为准。

现已新增默认关闭的[单项目 cloud 签名事件发送适配](../docs/adr/0010-service-cloud-signed-event-forwarder.md)。平台内部来源、外部 service 装配、封套与真实回环 HTTPS 取得聚焦回执；真实 Kafka 到 cloud 独立库、断线积压、跨项目、密钥轮换和正式授权仍待验。该适配不使用公开 Webhook 私网目标例外。

| 配置 | 当前值 |
| --- | --- |
| Maven 坐标 | `com.jagonzn.service:jagonzn-service` |
| 版本 | `0.0.1-SNAPSHOT` |
| Spring Boot | `4.1.0` |
| Java | `21` |
| HTTP 默认端口 | `18080`，避开 ThingsCloud bootstrap 的 `8080` |

ThingsCloud 是版本基准。2026-09-24 已按负责人要求将本项目 Spring Boot parent 从 4.1.1 对齐到 4.1.0；jagonzn-cloud 已是 4.1.0。平台候选装配及可重复验证见[运行指南](../../docs/reuse-entry/THINGS_CLOUD_REUSE_RUNTIME_GUIDE.md)。

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

Linux／macOS 对应使用 `./mvnw`。构建前须从同版本 ThingsCloud 源码或正式制品仓库安装运行时依赖；启动前须提供[运行指南](../../docs/reuse-entry/THINGS_CLOUD_REUSE_RUNTIME_GUIDE.md)列明的 jagonzn 独立库、密钥及中间件配置。测试成功不代表真实设备链路已完成。

从本项目根目录执行启动命令时，Logback 默认写入本目录的 `logs/error`、`logs/warn`、`logs/info`、`logs/debug`，不与 cloud 共用日志目录。若由 IDE、服务管理器或 JAR 从其他工作目录启动，显式设置 `JAGONZN_SERVICE_LOG_PATH` 为本项目 `logs` 的绝对路径；旧的通用 `LOG_PATH` 不再控制本服务。

应用启动后，`GET /actuator/health` 返回最小健康状态。该入口表示当前进程可响应，不包含数据库、ThingsCloud 内核或设备连接的就绪保证。`env`、`metrics` 等 Actuator 端点未公开。服务使用 Tomcat NIO2；本机 Windows/Temurin 21.0.11 下默认 NIO 的 selector 管道无法建立，片内验收见[实施记录 J0-1](../docs/progress/J0.md)。

本项目新增或修改代码和配置时必须添加准确的中文注释；新增协议监听器也须避开 ThingsCloud 已配置端口。提交正文须用一句中文说明改动、验证与结论，见[知识库规范](../docs/README.md)。

- [知识库入口](../docs/README.md)
- [双项目架构主文档](../docs/jagonzn-system-architecture.md)
- [service 内核复用方案](../docs/jagonzn-service-backend-architecture.md)
