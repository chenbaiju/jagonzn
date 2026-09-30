# jagonzn 双后端本机内网基础栈

此目录对应 `G3-SHC-JAG-LAN-STACK-1`。它以独立 Compose 项目启动 service、cloud、各自数据库和内部依赖，并仅向宿主回环发布两个管理 HTTPS 入口。当前仍是 `SNAPSHOT` 基础栈：cloud 私有事件发送、签名权益、设备入口和 console 均未启用，不能据此关闭完整内网验收。

私有事件实验另叠加 `private-delivery.compose.yml`，以服务持久 Outbox、Kafka 和 cloud 独立库核对两个项目、断线恢复与 HMAC 轮换；不改变上述基础栈的默认关闭配置。[JADR-0011](../../docs/adr/0011-private-cloud-delivery-scope-rotation-and-recovery.md)规定范围和失败处置。合成 Outbox 事实不代表真实设备上报或 cloud 业务已处理。

2026-09-29 已另提供 `console-test.compose.yml`：它单独启动免登录静态页和 HTTPS 代理，显式接入已经存在的上述两个实验网络，不叠加到后端文件（规避 Compose v5 多层 `extra_hosts` 合并错误）。先指定 `LAN_CONSOLE_TEST_DIST` 为构建目录、`LAN_CONSOLE_TEST_CONFIG_DIR` 为包含两个 Console Caddyfile 和 `certs.local` 的目录，再单独执行 `docker compose -f <console-test.compose.yml绝对路径> up -d`。路径须对 Docker daemon 可见；默认回环 HTTPS 13007 保留原 HTTP 13006。不要使用 `--remove-orphans` 或删除既有实验卷。实际[静态页与网络回执](../../jagonzn-console/docs/TEST_EXECUTION_20260929.md)只关闭 Console 网络前置，不提供正式登录/授权/业务功能。

## 建立与启动

在仓库根目录构建两个 JAR：

```sh
cd jagonzn/jagonzn-service && ./mvnw -DskipTests package
cd ../jagonzn-cloud && ./mvnw -DskipTests package
```

回到仓库根目录，生成此目录中被 Git 忽略的独立凭据、EMQX 配置、内部 SMTP 测试接收器字节码和 30 天本机证书：

```sh
python3 jagonzn/deploy/lan-acceptance/prepare.py
cd jagonzn/deploy
docker compose --env-file lan-acceptance/.env.local -f compose.yml -f lan-acceptance/compose.yml up -d postgres redis redpanda minio emqx emqx-app cloud-postgres
docker compose --env-file lan-acceptance/.env.local -f compose.yml -f lan-acceptance/compose.yml run --rm redpanda-init
docker compose --env-file lan-acceptance/.env.local -f compose.yml -f lan-acceptance/compose.yml run --rm minio-init
docker compose --env-file lan-acceptance/.env.local -f compose.yml -f lan-acceptance/compose.yml --profile app up -d app cloud smtp-sink service-https cloud-https cloud-management-https
```

启动时的 Docker 网络必须保持 `jagonzn-lan-acceptance_jagonzn` 为 `internal: true`。仅两个管理代理接入额外宿主回环桥接网；代理启动先删除其默认路由。服务及中间件均无宿主发布端口，两个管理入口分别为 `https://127.0.0.1:18444` 和 `https://127.0.0.1:18445`，使用 `certs.local/lan.crt` 建立本机信任。cloud 的私有事件代理 `cloud-https:8443` 只在内部网络，管理代理拒绝 `/api/v1/internal/*`。

从仓库根目录运行 `python3 jagonzn/deploy/lan-acceptance/create-tenant.py`，通过 service HTTPS 注册并核对一个业务租户。账号凭据只写入被忽略的 `owner.local.json`（0600）。随后运行 `python3 jagonzn/deploy/lan-acceptance/activate-owner.py`：它经本项目内部 SMTP 接收器取得重发验证邮件，只在内存中提取并消费一次性令牌，再按真实登录与项目 API 建立一个项目。邮件原件留在被忽略的私有目录，脚本收紧文件权限；令牌、口令和访问令牌不输出。重跑只核对已验证身份及现有项目，不生成第二个。此本机邮箱流程仍不是发行方的客户归属审查。部署申请另用 service JAR 的 `--prepare-enrollment <仓库外受限目录> <业务租户UUID>` 生成，目录含现场私钥，须独立备份；仅 `.tcshreq` 可传给发行方。

## 核对与保留

用 `curl --cacert jagonzn/deploy/lan-acceptance/certs.local/lan.crt https://127.0.0.1:18444/actuator/health` 与对应 `18445` 核对两个 HTTPS 入口。用 `docker ps` 核对仅两条 `127.0.0.1` 端口映射；逐容器检查 `/proc/net/route` 中无目的地 `00000000`。宿主访问两代理的 `/api/v1/internal/*` 应返回 Caddy 的空体 `404`。这些检查只覆盖基础栈，不能代替协议、事件/命令、断线恢复、签名导入或套餐限额测试。

在 `jagonzn/deploy` 执行同一 Compose 文件与环境参数的 `--profile app down` 可停止此项目；不要加 `-v`，以保留隔离数据库、申请绑定和本机回执。旧 `jagonzn-service` 与 `jagonzn-cloud-lan-lab` 项目不属于本栈。仓库外现场身份、此目录被忽略的凭据及数据库卷必须作为同一实验恢复集管理。

## 私有事件实验

先执行 `prepare-delivery.py --deployment-id <已生成部署UUID> --tenant-id <业务租户UUID>`。脚本从已验证的管理员通过受控 service API 核对首项目并建立第二项目，创建 0600 的 `.env.delivery.local`、轮换交叠与最终配置，以及只信任本机 cloud 证书的 Java truststore；重复运行拒绝覆盖既有密钥。两项目属于同一业务租户。三个 `.env.delivery*.local`、信任材料和管理员口令都被 Git 忽略，禁止把内容打印到回执。

在 `jagonzn/deploy` 目录，按基础栈已有的 `compose.yml` 和 `lan-acceptance/compose.yml` 再加 `-f lan-acceptance/private-delivery.compose.yml`，同时传 `--env-file lan-acceptance/.env.local --env-file lan-acceptance/.env.delivery.local`，先 `up -d --no-deps cloud`，再 `--profile app up -d --no-deps app`。`LAN_DELIVERY_SERVICE_JAR` 和 `LAN_DELIVERY_CLOUD_JAR` 可指向已固定候选的绝对 JAR 路径；启动和后续脚本都必须传相同的两个路径，核对容器内 SHA-256 后才可称同候选验证。运行 `python3 jagonzn/deploy/lan-acceptance/smoke-private-delivery.py`：它写入明确标记的**合成**持久来源，核对两项目 outbox→Kafka→cloud 双库、私有 HTTPS 断线、接收端持续 401、旧新密钥交叠与旧钥撤销。运行器结束后接收端和发送端均处于 `lan-v2`，若中途失败，应按 `.env.delivery.local` 重新装配两端或完成轮换后再重跑，不要只换一端。

当前 Docker Desktop 磁盘若低于隔离 Redpanda 的 5 GiB 写入保护阈值，Outbox 会持久重试而不发布。只有确认此项目的 Broker、主机可用空间与短时合成流量后，才可为实验脚本传 `--temporary-low-disk-threshold`：脚本检查隔离 Broker 的原阈值及剩余空间，在 `finally` 恢复 5 GiB；结束后仍须独立复核。不能把降阈值的回执当成正式容量资格。`smoke-private-poison.py` 会在精确分区尾部投递一条合成超长封套、将原始字节与 SHA-256 保存到 0700/0600 私有归档、核对位点滞留，再停止 service 并仅推进该分区的一个 offset；它只允许在这个隔离实验项目中运行，生产毒消息必须按 JADR-0011 的人工审批处置。真实设备 ingress 属于独立进程装配，单在应用进程开启 `JAGONZN_DEVICE_HTTP_ENABLED` 不能证明设备接入；私有事件脚本故意不伪装这条链。

## 无害技术命令实验

`private-command.compose.yml` **替代**上节的 `private-delivery.compose.yml` 作第三层，包含相同私有事件配置，同时在隔离 service 启用 MQTT 持久交接，并以无默认路由的代理将设备 Broker 的 `1883` 仅映射到宿主回环 `21884`。不使用旧 `jagonzn-service` 栈占用的 `21883`。此叠加只供 `G3-SHC-JAG-TECH-COMMAND-LAB-1`；不启用物理开锁命令，也不将 MQTT 设备口公开到公网。

先按上节准备已验证的隔离 owner、两项目白名单和 `.env.delivery.local`，并启动基础依赖。在 `jagonzn/deploy` 设置同一固定源码构建的 service/cloud JAR 绝对路径及其 SHA-256，然后执行：

```sh
export LAN_DELIVERY_SERVICE_JAR=/absolute/path/to/jagonzn-service-candidate.jar
export LAN_DELIVERY_CLOUD_JAR=/absolute/path/to/jagonzn-cloud-candidate.jar
SERVICE_SHA=$(shasum -a 256 "$LAN_DELIVERY_SERVICE_JAR" | cut -d ' ' -f 1)
CLOUD_SHA=$(shasum -a 256 "$LAN_DELIVERY_CLOUD_JAR" | cut -d ' ' -f 1)
docker compose --env-file lan-acceptance/.env.local --env-file lan-acceptance/.env.delivery.local -f compose.yml -f lan-acceptance/compose.yml -f lan-acceptance/private-command.compose.yml --profile app up -d app cloud mqtt-lab-proxy
python3 lan-acceptance/smoke-private-command.py --candidate-jar "$LAN_DELIVERY_SERVICE_JAR" --candidate-sha256 "$SERVICE_SHA" --cloud-candidate-jar "$LAN_DELIVERY_CLOUD_JAR" --cloud-candidate-sha256 "$CLOUD_SHA"
```

仅当隔离 Redpanda 的 `storage_min_free_bytes` 原值为 5 GiB 且 Docker 卷剩余空间超过 200 MiB 时，才可为最后一行加 `--temporary-low-disk-threshold`；脚本恢复原阈值后仍须用 `docker exec jagonzn-lan-acceptance-redpanda-1 rpk cluster config get storage_min_free_bytes` 独立核对。脚本使用 Python 3.10+，在首项目创建一次性无害命令及两台模拟 MQTT 设备，核对非目标回复拒绝、目标 ACK 非终态、成功终态、同事件 ID 重投去重和 cloud 私网入口停启补送。成功回执只证明模拟设备的技术链及 cloud Inbox 持久，不能替代正常磁盘容量、真实设备/开锁、cloud 业务授权或完整双后端内网放行。
