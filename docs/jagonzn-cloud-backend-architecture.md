# jagonzn-cloud 架构职责变更说明

> 更新日期：2026-09-20。原 2026-09-18 设备接入定位已被替代；保留本路径以兼容既有链接。

原文档提出的 ThingsCloud 内核 JAR、多协议设备接入、遥测、规则、告警、任务、Worker、Webhook、Outbox、数据库兼容、MinIO、无限商业额度及真实计量方案，现由 **jagonzn-service** 承接。

这不是将 cloud 项目改名为 service。两个项目保留为独立应用：

- **jagonzn-service**：独立部署的 IoT 接入与运行服务，保存设备事实并可靠转发；无需 ThingsCloud 应用或 cloud 同时运行。
- **jagonzn-cloud**：jagonzn 定制化设备 SaaS 后端，负责人员、场所、谁能开锁、允许时段、业务审计与处置等。现已开始[私有事件 Inbox](adr/0009-cloud-private-event-inbox.md)，业务模型和命令仍待开发。

请从以下文档继续阅读：

1. [双项目架构与分阶段实施方案](jagonzn-system-architecture.md)：当前职责、上下行合同、数据归属、私有部署预留与实施顺序的主文档。
2. [service 后端复用与独立部署方案](jagonzn-service-backend-architecture.md)：原方案迁移后的完整内核复用说明。
3. [知识库入口](README.md)：文档索引与状态约定。

两个应用目前均为 Spring Boot 骨架；本次职责迁移仅更新文档，不表示接入能力或 SaaS 已经实现。
