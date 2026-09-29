# JADR-0004：jagonzn 选择方案 A，请 ThingsCloud 评审并提供正式复用入口

- 状态：已接受（jagonzn 项目范围）；ThingsCloud 受理/交付状态：未记录
- 归档日期：2026-09-24
- 依据：[进度变更 JCH-008](../PROJECT_PROGRESS.md#10.%20变更记录)、[正式复用入口交付需求](../../../docs/reuse-entry/THINGS_CLOUD_REUSE_ENTRY_REQUEST.md)

## 背景

jagonzn-service 要在独立进程和同构数据库中复用 ThingsCloud 已交付能力。目前仅有仓库模块和骨架构建证据，尚无面向外部应用的正式装配、版本、迁移及运行合同。

## 决策

jagonzn 负责人选择**方案 A**：向 ThingsCloud 提交[正式复用入口需求](../../../docs/reuse-entry/THINGS_CLOUD_REUSE_ENTRY_REQUEST.md)，由 ThingsCloud 自行评审并提供受支持的制品、装配方式、原样迁移和运行合同；jagonzn 在正式交付后按同一版本基线接收、装配和验证。正式入口可以由平台选择 Starter/BOM 或等效方式，本决策不指定其内部实现，也不授权 jagonzn 修改平台代码或表。

## 备选与取舍

- 方案 B：jagonzn 自行拼装现有 JAR、全包扫描或复制平台配置来推进集成。此做法缺少受支持的完整运行和升级合同，也越过 [JADR-0003](0003-platform-change-authority.md) 的权限边界，因此未选。
- 等待通用协议扩展能力全部完成后再确定复用入口：会混合两个不同的阶段门；正式入口先解决既有能力的独立复用，设备合同仍在相应阶段单独裁定，因此未选。

## 影响与未完成项

本决策是 **jagonzn 选择请求与接收路径**，不表示 ThingsCloud 已受理、采纳、排期或交付。具体制品坐标、迁移版本、运行角色、商业策略和升级/回滚机制仍待 ThingsCloud 正式回答；[JPF-001、JPF-003](../PLATFORM_CAPABILITY_FEEDBACK.md)仍未关闭，阶段 1 的依赖功能切片不得以本 ADR 代替交付证据。

返回 [ADR 索引](README.md)。
