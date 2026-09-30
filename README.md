# jagonzn

面向设备接入与业务应用的独立项目，由设备运行服务、业务后端和浏览器前端组成。
当前优先验证隔离部署、平台能力复用和设备接入；智能锁、烟感等设备适配仍需冻结型号与协议并完成真机验证。

源码仓库：[chenbaiju/jagonzn](https://github.com/chenbaiju/jagonzn)。

## 模块与职责

| 模块 | 职责 | 当前边界 |
| --- | --- | --- |
| [jagonzn-service](jagonzn-service/README.md) | 复用平台运行时，承担设备接入、技术数据、告警、命令及事件转发 | 已有本地装配和隔离验证候选，正式制品与完整接收尚未完成 |
| [jagonzn-cloud](jagonzn-cloud/README.md) | 承接人员、场所、权限和业务处置 | 已有私有签名事件 Inbox；人员、场所及开锁业务仍待开发 |
| [jagonzn-console](jagonzn-console/README.md) | 统一呈现技术管理与业务操作 | 当前仅免登录静态测试页，没有业务 API 请求或正式管理功能 |
| [deploy](deploy/README.md) | 本机独立部署、网络实验及验证工具 | 用于隔离候选验证，不代表生产交付 |
| [docs](docs/README.md) | 架构、进度、ADR、能力反馈与实施债务 | 当前状态以项目进度为准 |

service 使用独立的 `jagonzn` 数据库，cloud 使用独立的 `jagonzn_cloud` 数据库。
两者通过受支持的接口和版本化事件集成，不直接共享业务表。service 的设备运行不以 cloud 在线为前提。

## 当前进度

已有内核本地装配、标准协议属性链路、双后端事件交付及部分 TEST 权益的限定验证记录。
**阶段 1 正式接收仍未通过**：正式运行时制品、完整授权与管理界面、完整 LAN 矩阵和真实设备闭环仍有前置缺口。
本机测试结果不代表正式签发、全部设备兼容或生产环境放行。
详细结论统一维护在 [项目进度](docs/PROJECT_PROGRESS.md) 和 [实施债务](docs/IMPLEMENTATION_DEBT.md)。

## 获取源码

```bash
git clone https://github.com/chenbaiju/jagonzn.git
cd jagonzn
```

这是独立 Git 仓库。后端基线为 Java 21、Spring Boot 4.1.0；两个 Java 应用各自带 Maven Wrapper，根目录没有聚合 POM。
`jagonzn-service` 依赖 `com.things.cloud:things-cloud-runtime`，构建前须取得与 POM 一致的运行时依赖及迁移资源。
这些依赖当前来自受控的平台制品或本地 Maven 仓库，公开克隆本项目不等于已具备完整后端运行环境。

## 先运行静态前端

安装 Node.js 22 和 `package.json` 指定的 pnpm 11.8.0，在仓库根运行：

```bash
pnpm --dir jagonzn-console install --frozen-lockfile
pnpm --dir jagonzn-console dev
```

访问 `http://127.0.0.1:13006/`。该页面只用于前端访问验证，不连接后端，也不显示伪造业务状态。
构建使用 `pnpm --dir jagonzn-console build`；预览使用 `pnpm --dir jagonzn-console preview`，与开发服务共用端口，须先停止开发服务。

## 后端构建与本机部署

具备 JDK 21、Docker 和匹配的运行时依赖后，分别进入应用目录执行：

```bash
cd jagonzn-service
./mvnw verify
cd ../jagonzn-cloud
./mvnw verify
```

Windows 使用对应目录下的 `.\mvnw.cmd verify`。集成测试会使用一次性容器，不能把缺失平台制品造成的构建失败解释为设备验证结果。

本机独立 service 栈由 PowerShell 7 启动：

```powershell
cd deploy
./start.ps1
# 需要验证标准设备接入时使用：
# ./start.ps1 -EnableAccess
```

此入口准备 service 所需的数据库、缓存、消息服务和对象存储，不会同时启动完整 cloud 与业务 Console。
service HTTP 默认端口为 `18080`；cloud 内部 HTTP 默认端口为 `18081`，须另行配置独立数据库。
完整前置、端口、日志、凭据生成及停止方式见 [部署说明](deploy/README.md)。

配置和私钥保存在 Git 忽略的本机文件中；不要提交 `.env.local`、部署身份目录、数据库备份或授权私钥。

## 设计与协作

- [架构主文档](docs/jagonzn-system-architecture.md)：模块职责、数据权威和上下行边界。
- [架构决策](docs/adr/README.md)：已经裁定的长期约束。
- [平台能力反馈](docs/PLATFORM_CAPABILITY_FEEDBACK.md)：受支持接口不足、证据与改进建议。
- [工作约定](AGENTS.md)：文档维护、验证边界和仓库规则。

本项目通过受支持的接口与配置复用 ThingsCloud，不直接修改平台源码、原数据库或历史迁移。
文档中指向配套平台的跨仓库资料需要相应访问权限；本仓库的功能状态以已有代码和可追溯验证为准。
