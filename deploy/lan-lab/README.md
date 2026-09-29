# cloud 无互联网接收端实验栈

本目录只验证 `jagonzn-cloud` 的独立 PostgreSQL、容器内无默认互联网路由、回环受信 HTTPS 与私有事件 Inbox。它不连接或改动现有 `jagonzn-service` 栈；也不声称完成 service→cloud 投递、统一前端、设备协议或正式客户授权。全内网正式放行条件见[专项合同](../../../docs/reuse-entry/THINGS_CLOUD_JAGONZN_LAN_LOCAL_READINESS.md)。

先在 `jagonzn/jagonzn-cloud` 执行 `./mvnw verify` 构建 JAR。然后在本目录执行：

```sh
python3 prepare.py
docker compose --env-file .env.local -f compose.yml config --quiet
docker compose --env-file .env.local -f compose.yml up -d
python3 smoke.py
```

`.env.local`、`certs.local/` 与 `logs/` 被 Git 忽略。`prepare.py` 首次生成稳定测试 UUID、随机数据库密码、32 字节签名密钥和七天自签证书；再次执行保留原文件。不要将测试签名或证书用作正式客户授权。`smoke.py` 验证 Docker 三容器只有一个 `internal: true` 网络且均无宿主发布端口，公网 IP 与明文管理端口不可达；再启动同网的临时客户端，以受信证书向 HTTPS 代理发起签名 POST、重复、重放、篡改，并核对独立库中唯一持久事件。HTTPS 代理只转发受控事件和健康路径。本实验没有提供宿主浏览器入口，不能替代正式目标局域网路由测试。

探针会等待 cloud HTTPS 健康入口就绪，请求还包含与配置一致的来源部署标识。它使用 Python 测试客户端，不等于 service 的 Kafka 消费与 Java HTTPS 发送已经跨双库运行；发送适配的聚焦边界见 [JADR-0010](../../docs/adr/0010-service-cloud-signed-event-forwarder.md)。

实验结束可运行 `docker compose --env-file .env.local -f compose.yml down`，保留独立数据卷和凭据；清理卷会丢失接收事实，须先单独核对数据保留要求。当前 service Compose 的公网出站与明文管理口未因本实验改变，正式全内网双后端测试须另用同固定候选的完整隔离栈。

2026-09-28 后续环境说明：为复验 TEST 授权交接，已将当时未被任何容器挂载的 `jagonzn-cloud-lan-lab_cloud-postgres-data` 先完整打包、校验并保存在被 Git 忽略的 `tools/reuse-entry/target/shc-volume-archive-20260928/cloud-lan-lab-postgres.tar`（SHA-256 `7a25d1a893c7970cfb2188226788874ffede75b74478a0a7c02ff8802ab10e27`），随后从 Docker 删除该卷。上段是实验操作的一般保留方式，**现有 Docker 卷已不在**；若要复核旧接收数据，必须先从归档恢复，不能直接运行 `up` 并将新空卷当作原数据。归档不属于正式客户备份。
