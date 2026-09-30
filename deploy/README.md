# jagonzn-service 本机独立启动

> 当前暂停面向商用服务器及真实域名的部署验收。以下本机隔离栈、合成网络、额度/用量及恢复测试仍可按其前置执行；不得把目标改为共享或正式服务器。正式签发、真实设备和完整 LAN 接收继续独立取证。

本目录是 jagonzn 自己的开发部署入口，Compose 项目名为 `jagonzn-service`，数据库为 `jagonzn`，不连接或修改 ThingsCloud 的 `tc-*` 容器、数据库和 `deploy/.env`。它只用于本机候选验证，不是生产发布或设备链路验收。

全内网双后端的本机只读预检使用 `python3 tests/audit-lan-readiness.py --service-ca <测试公开证书绝对路径>`；完整参数和放行边界见[全内网本机合同](../../docs/reuse-entry/THINGS_CLOUD_JAGONZN_LAN_LOCAL_READINESS.md)，隔离栈的目标入口与身份见[本机网络合同](../../docs/reuse-entry/THINGS_CLOUD_JAGONZN_LAN_NETWORK_CONTRACT.md)。当前 Compose 只运行 service 且网络允许默认出站，预检返回 BLOCKED 是正确结果；它不会停止现有栈或修改数据。

cloud 接收端另有[无互联网实验栈](lan-lab/README.md)，在单独 Compose 项目与数据库中验证私有事件签收、HTTPS 和无默认出站；它不会连接或重建本目录的 service 栈，不能与现有 rc4 service 回执拼接成双后端放行。

## 一键启动

在 PowerShell 7 中运行：

```powershell
cd D:\ThingsCloud\jagonzn\deploy
.\start.ps1
# 启用本机标准设备接入和测试证书：
.\start.ps1 -EnableAccess
```

首次运行会随机生成本目录的 `.env.local`、`application-local.properties` 和两个 EMQX 的 `base.local.hocon`，启动独立 PostgreSQL/TimescaleDB、Redis、Redpanda、MinIO、设备与应用 EMQX，创建 Kafka 主题和 MinIO 桶，打包并启动 `jagonzn-service` 容器。复用运行时 JAR 须已按[运行指南](../../docs/reuse-entry/THINGS_CLOUD_REUSE_RUNTIME_GUIDE.md)安装到本机 Maven 仓库。再次运行保留现有凭据和数据卷；不要手工删除 `.env.local` 后沿用旧数据卷，否则数据库、Redis 和 MinIO 密码会不一致。

若要在 IntelliJ 调试应用，运行 `./start.ps1 -Mode ide`，然后在 IDE 创建 `Remote JVM Debug` 配置并连接 `127.0.0.1:15005`。应用仍在独立 Linux 容器中运行，不需要手填环境变量。当前 Windows/Temurin 21.0.11 的 Kafka Selector 建立本机回环连接失败，直接点击 `JagonznServiceApplication` 的本地 Run 无法完整启动；脚本仍为该运行配置准备外置配置和日志路径，供修复本机 JDK 环境后使用。外置配置位于 `jagonzn/deploy/application-local.properties`，**不在** `src/main/resources` 中，因此不会进入 JAR；它已被 Git 忽略。现有的本机 JWT 密钥在首次生成时沿用，之后以 `.env.local` 为唯一来源。不要改用 `application-test.properties` 或 `test` profile 启动常驻服务，测试 profile 关闭了部分运行职责。

当前 Windows 的 GNU Make 缺少 `grep`/`awk`，原 `D:\ThingsCloud\deploy\Makefile` 不能直接在 PowerShell 下执行。本目录另有不依赖这些工具的入口，调用 `pwsh.exe`（PowerShell 7）：`make up` 等同 `./start.ps1`，`make access` 启用本机接入，`make smoke` 在已启动的接入栈中创建候选设备并验证协议和 OTA 草稿上传，`make integration-smoke` 验证本部署的公开 API Key、实时 WS/MQTT 与 Webhook 管理入口，`make fault` 追加一次可恢复的本机 Redpanda 故障注入，`make backup-check`/`make object-check` 验证本机数据库/单对象恢复，`make fingerprint` 生成候选摘要，`make ide` 启动带回环远程调试端口的应用容器，`make ps` 查看本栈，`make down` 停止并删除本栈容器但**保留数据卷与凭据**。直接使用 PowerShell 脚本不要求安装 Make。

本目录根部保留 `compose.yml` 和启动、停止、状态入口；验证脚本与 Java 探针统一放在 `tests/`，可选 Compose 叠加文件放在 `overlays/`。以下直接执行示例均以 `jagonzn/deploy` 为当前目录，Make 入口的用法不变。历史审计中的脚本 SHA-256 记录当时运行的字节；本次搬迁所需的路径修订会改变部分脚本摘要，重新运行时须记录现行文件摘要。

## 端口与变量来源

| 资源 | 本机地址 | 变量来源 |
| --- | --- | --- |
| jagonzn-service | `http://127.0.0.1:18080` | 不启用接入时直连应用；启用接入时由本机 Caddy 转发管理/健康 API，设备路径在明文端口返回 404 |
| 标准设备 HTTPS / TCP/TLS / CoAP/DTLS | `https://127.0.0.1:18443` / `127.0.0.1:18883` / `127.0.0.1:15684/udp` | 仅 `-EnableAccess`；证书在忽略目录 `certs.local/`，自签且仅供本机测试 |
| PostgreSQL/TimescaleDB | `127.0.0.1:15432/jagonzn` | owner `jagonzn`、应用角色 `jagonzn_app`，两个密码随机生成 |
| Redis | `127.0.0.1:16379` | 独立密码，`noeviction` |
| Redpanda | `127.0.0.1:29092` | 独立 Broker，显式创建同版本平台主题 |
| MinIO API / 控制台 | `http://127.0.0.1:19000` / `http://127.0.0.1:19001` | 初始化身份 `jagonzn` 仅用于本机资源供给；应用使用受限身份 `jagonzn_app`，不接收 root 密码 |
| 设备 EMQX MQTT / Dashboard | `127.0.0.1:21883` / `http://127.0.0.1:28083` | 设备持久上行；独立发布/会话 API 身份 |
| 应用 EMQX MQTT / Dashboard | `127.0.0.1:31883` / `http://127.0.0.1:38083` | ADR0179 `tc_application` zone、零离线会话、独立卷及实时发布/会话 API 身份；仅本机候选明文端口 |

`.env.local` 保存全部无默认值的 `JAGONZN_*` 凭据和容器内部地址；外置 Spring 配置把同一批凭据映射为 IDE 使用的宿主机地址。应用的 JWT、应用 JWT、Broker 回调、通知 Webhook 与公开 Webhook 签名密钥分别独立生成；公开 Webhook 密钥以 `local-v1` 为当前标识，只供本机候选，旧版 `.env.local` 会补入而不覆盖现有秘密。EMQX 回调模板与应用使用同一个 Broker 密钥。MQTT 发布与会话 API 使用不同身份，MinIO 应用策略只允许本部署的五个桶。本机一键启动显式启用公开 API Key、Webhook 和实时组件；`tests/smoke-public-integration.ps1` 验证短期私网限定 API Key 只读/撤销、WS 与应用 Broker MQTT 设备 HTTP 上报事件交付和 Webhook 管理，未提供真实外部 HTTPS 接收端，也不触发对外投递。脚本不会在终端输出密码或密钥。本机默认选择 `NONCOMMERCIAL` 并写入有限技术容量，详细合同见[非商业准入](../../docs/reuse-entry/THINGS_CLOUD_REUSE_NONCOMMERCIAL_CONTRACT.md)；这些数值只是本机测试值。更改端口、凭据或镜像版本时须同步审视 Compose、外置配置与 EMQX 模板；此候选暂不提供自动轮换。

从 `0.0.1-rc.20260927.2` 起，迁移 owner 首次启动会在数据库写入部署模式及自动化日硬限。已有记录和 `.env.local` 的 `JAGONZN_ENTITLEMENT_MODE`、`JAGONZN_TECHNICAL_DAILY_AUTOMATION_EXECUTION` 不一致时，应用会拒绝启动；调整这两项前须在维护窗口停止应用，由迁移 owner 受控更新 `sys_deployment_automation_entitlement` 的单行记录，再以相同配置启动并验证健康、自动化预约和权限。不要授予应用角色该表的直接读写权限，也不要把临时测试额度当作付费部署授权。

应用进程返回 `/actuator/health` 的 200 只表示健康入口可访问。首次迁移应在 `jagonzn` 库执行，必须核对迁移及 RLS。运行 `./tests/smoke-device-access.ps1` 需本机 Python、JDK 21、已缓存的 Californium Maven 依赖和 `-EnableAccess` 栈；它通过公开 API 创建 `reuse-*` 候选租户/设备，验证 HTTPS、MQTT、TCP/TLS、应用容器网络中的 CoAP/DTLS、同租户跨项目设备隔离，以及 OTA 固件草稿字节流上传到独立 MinIO，测试数据会留在独立本机库和对象桶。测试凭据只经进程 stdin 传递，不进入仓库或参数。真实设备与其他外部业务链路仍须按[运行指南](../../docs/reuse-entry/THINGS_CLOUD_REUSE_RUNTIME_GUIDE.md)单独验收。本机可运行 `./tests/backup-restore-check.ps1` 对当前库生成 Git 忽略的 `backups.local/` 备份并恢复到一次性库，校验迁移/结构/RLS/业务计数及六个 jagonzn 角色对业务关系的有效权限；恢复须保留 ACL，否则健康 200 仍可能伴随后台权限错误；`./tests/object-restore-check.ps1` 备份一次性 MinIO 对象并恢复到一次性桶，比对 SHA-256；`./tests/fingerprint-candidate.ps1` 生成 Git 忽略的 `artifacts.local/candidate-manifest.json`，标明本机 `SNAPSHOT` JAR 摘要与工作区状态。这些均不是生产级跨资源一致性恢复或正式不可变发布。本机服务日志始终落在 `jagonzn/jagonzn-service/logs`，启动脚本诊断日志可放本目录 `logs/`。

固定候选的 MQTT/TCP 命令下行可用 `python3 tests/smoke-command-downlink-v3a.py --candidate-jar <绝对路径> --candidate-sha256 <小写摘要>` 复验。要求 Python 3.11、已由 `./start.ps1 -EnableAccess` 启用的本机独立栈及现有 `.env.local`；脚本先后核对宿主和容器 JAR 摘要，创建一个项目及四台一次性设备，分别检查 MQTT/TCP 原设备回复成功、其他设备伪回执不改终态，以及不回复时三次下行后超时。它会留下带唯一前缀的测试账号/设备/命令记录，运行时应遵守现有注册及 REST 限流，不因测试调高限流。该脚本只证明本机固定候选范围，回执见[V3a](../../docs/reuse-entry/audits/G3-REUSE-V3a-mqtt-tcp-command-2026-09-27.md)。

HTTP/CoAP 命令领取与业务回复可用 `python3 tests/smoke-command-claim-v3b.py --candidate-jar <绝对路径> --candidate-sha256 <小写摘要> --maven-repo <候选Maven缓存目录>` 复验，另要求宿主 JDK 21 `javac`、缓存中的 Californium 3.14.0 及 SLF4J 2.0.18 JAR。脚本从 HTTPS 设备入口验证 HTTP 领取、租约、越权、回复重放/冲突；编译 `tests/SmokeCoapCommand.java` 后在应用容器网络中执行 DTLS 领取/回复；数据库核对 `ts_device_command_claim` 为一条已回复领取且没有推送尝试。两协议只声明设备主动领取，不提供服务端主动推送。探针自然等待每设备认证的 60 秒窗口，不调整限流；连续多次创建夹具还受同 IP 每 5 分钟 3 次注册保护。详情见[V3b 回执](../../docs/reuse-entry/audits/G3-REUSE-V3b-http-coap-claim-2026-09-27.md)。

三资源单节点故障可在**专用隔离栈**运行 `python3 tests/smoke-resource-fault-v3c.py --deploy-dir <独立deploy绝对路径> --candidate-jar <固定候选JAR绝对路径> --candidate-sha256 <小写摘要>`。探针先核对 Compose 项目 `jagonzn-service`、服务标签、健康和宿主/运行 JAR 摘要，仅依次停止本栈的 Redpanda、设备 EMQX、Redis 并在每段 `finally` 恢复；创建的项目、设备、命令和消息会保留在独立库，严禁在共享或生产栈运行。应用 Compose 显式设置 `SPRING_DATA_REDIS_TIMEOUT=2s` 与 `SPRING_DATA_REDIS_CONNECT_TIMEOUT=2s`：没有有界连接/读取超时，即使代码允许 Redis 短窗降级，设备请求也可能先超时；非 Compose 部署须提供等效有界配置并复验。故障、恢复、越权、重复和出站事实见[V3c 回执](../../docs/reuse-entry/audits/G3-REUSE-V3c-broker-redis-fault-2026-09-27.md)。

Windows 宿主机 UDP 验证使用 `./tests/smoke-device-access.ps1 -HostCoap`：CoAP 探针在宿主机 Java 进程运行，访问 Compose 发布的 `127.0.0.1:15684/udp`，并逐项检查响应、inbox、历史点和影子。默认不带该参数时仍在应用容器网络内运行；两种路径不能互相代替。结果与候选摘要见[Windows 宿主验证回执](../../docs/reuse-entry/audits/G3-REUSE-V3d-windows-host-udp-2026-09-27.md)。
