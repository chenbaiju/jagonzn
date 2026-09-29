# JADR-0002：jagonzn 以租户模型进行独立同构部署，版本向 ThingsCloud 对齐

- 状态：已接受（jagonzn 项目范围）
- 归档日期：2026-09-24
- 依据：[隔离验证部署 §1—2](../tenant-validation-and-contract-evolution.md)、[进度总览 §1、§3](../PROJECT_PROGRESS.md)

## 背景

jagonzn 是 ThingsCloud 项目中的一个租户。以真实租户、项目和设备归属验证厂商设备，才能检验平台的认证、权限和业务链路。设备试验又需要与 ThingsCloud 原部署的数据和凭据隔离。

## 决策

`jagonzn-service` 独立运行，另建名为 `jagonzn` 的数据库，与 ThingsCloud 原数据库完全隔离；该库使用**所复用 ThingsCloud 正式版本**对应的相同表结构、权限和原样迁移。设备验证数据留在该库，不实时回写原数据库。ThingsCloud 是版本源头；jagonzn-service、jagonzn-cloud 及其兼容的 Java/Spring Boot 与内核依赖向所选基线对齐，不能为适配 jagonzn 而改动 ThingsCloud 版本。若出现不兼容，暂停相关集成并登记证据。

## 备选与取舍

- 直接接入 ThingsCloud 原数据库：无法维持裁定的数据隔离和验证边界，因此不采用。
- 为 jagonzn 自行改平台迁移或版本：会使同构和兼容结论失真，也越过平台变更权限，因此不采用；权限边界见 [JADR-0003](0003-platform-change-authority.md)。

## 影响与未完成项

独立数据库本身不能证明运行资源完全隔离；消息队列、缓存、对象存储、连接凭据和角色仍需按正式交付合同核对。当前内核装配、空库迁移和隔离验收尚未完成，详见[阶段 1 前置条件](../PROJECT_PROGRESS.md#3.%20当前阶段：基线核对与最小合同冻结)。

返回 [ADR 索引](README.md)。
