# JADR-0012：本机 TEST 授权只通过测试类路径装配到 service 运行时

- 状态：已接受（2026-09-28）；动态双后端验收仍以专项回执为准。
- 依据：[JADR-0005](0005-signed-self-hosted-entitlement.md)、[平台 ADR0224](../../../docs/adr/0224-self-hosted-local-test-issuer-isolation.md)、[本机内网合同](../../../docs/reuse-entry/THINGS_CLOUD_JAGONZN_LAN_LOCAL_READINESS.md)。

## 四维审计

| 维度 | 结论 |
| --- | --- |
| 事实依据 | 既有 TEST 签发使用 `thingscloud-local-test`，普通 `PackagedIssuerTrust` 只读取发行物固定的 `thingscloud` 公钥；本机交接测试此前手动构造导入服务，没有验证显式签名模式的 Spring 装配。 |
| 逻辑连贯性 | 交接测试中的导入成功不能推出普通 JAR 已有测试公钥，也不能推出真实 service 热路径已按完整四档受理。给正式解析器增加测试发行方会扩大客户发行物的信任域。 |
| 信息缺口 | 正式公钥、受控文件和完整 19 项额度/16 项能力接线仍缺；Docker 当前剩余容量不足以把本包的轻量装配测试扩大为同候选双后端动态回执。 |
| 观点区分 | TEST/正式分离及发行物固定信任根来自既有 ADR；Spring 条件装配属于通用实现机制；使用测试类路径 Bean 给真实导入服务注入当轮临时公钥是本 ADR 的限定实现选择。 |

## 决策

普通 `jagonzn-service` 的签名模式默认且只读取 JAR 内固定正式公钥。额外的 `trust-source=local-test` 仅使该固定公钥 Bean 不装配，**不会**从文件、环境变量或授权封套自动信任任何公钥；普通 JAR 因缺少测试类路径 Bean 而启动失败。`LocalTestIssuerTrustConfiguration` 只存在于 `src/test/java`，由显式本机交接测试导入，并从当轮仓库外临时目录读取 TEST 公钥。测试 Spring 上下文仍创建原 `SelfHostedGrantImportService` 和现场身份 Bean，避免继续手工拼装整个运行时。

本包只验证装配、拒绝与普通 JAR 的材料隔离。测试源码路径不等于客户可发行制品；TEST 文件不能导入正式客户 JAR。后续本机全内网实验须在同一固定测试候选中实测签名导入、正常进程启动、业务热路径额度及双后端链路，逐项保留失败边界。正式 `G3-SHC-2a/2b/5a` 仍以正式受控公钥和客户文件独立验收。

## 未采用方案

- 让普通解析器接受 `thingscloud-local-test` 或从授权文件自带公钥建立信任：会把可改写的输入变成签发权威。
- 将临时测试公钥写入 `src/main/resources` 或普通 JAR：会混淆实验资格与发行资格。
- 仅继续手动创建导入服务：不能发现 service 签名模式的启动装配缺陷。
