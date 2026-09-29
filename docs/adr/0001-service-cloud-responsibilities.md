# JADR-0001：service 承担设备接入与 IoT 运行，cloud 承担后续 SaaS 业务

- 状态：已接受（jagonzn 项目范围）
- 归档日期：2026-09-24
- 依据：[双项目主架构 §1](../jagonzn-system-architecture.md#1.%20已明确的方向)、[知识库入口](../README.md)

## 背景

早期方案曾由 jagonzn-cloud 承担设备接入。主架构现已明确双项目职责，需要为后续开发者保存该拆分的理由和边界。

## 决策

`jagonzn-service` 是独立运行的设备接入与 IoT 服务，承担厂商适配、设备数据处理、技术告警、命令及设备结果等技术链路，并按实际交付状态装配 ThingsCloud 能力。`jagonzn-cloud` 是后续的定制化设备 SaaS，承担人员、场所、开锁权限与时段、业务审计和处置。当前先建设 service；cloud 的开发时间尚未确定。service 独立运行不以 cloud 或另一套 ThingsCloud 应用进程为前提。

## 备选与取舍

- 继续由 cloud 承担设备接入：与已裁定的技术运行/业务职责分界冲突，后续独立验证服务也无法清晰落位，因此不采用。
- 只建设 TCP 代理：不能覆盖原方案的设备管理、技术事件和命令结果等目标范围，因此不作为 service 定位。

## 影响与未完成项

两个应用目前仍以 Spring Boot 骨架为主；职责裁决不证明 ThingsCloud 内核已装配，亦不证明设备闭环已完成。实际阶段和验收以[进度总览](../PROJECT_PROGRESS.md)为准。

返回 [ADR 索引](README.md)。
