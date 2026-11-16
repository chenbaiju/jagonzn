# jagonzn-console

独立 jagonzn 浏览器前端，继承 ThingsCloud Console 当前源码、测试与资源，再做品牌、独立后端适配及本地菜单删减；当前已删除“套餐与权益”页面及其入口。cloud 仍为独立 Java 业务后端。

2026-11-16 已与主仓 `things-link-console`（HEAD `eea85d47d`）同步源码；保留登录插画、左上角 Logo、右上角头像、套餐与权益删除及本地端口/合同路径定制。同步范围和剩余差异见[复用与同步方案](../docs/console-reuse-and-evolution.md)。

## 本机启动

需要 Node >=20.19、pnpm 11.9.0。在仓库根依次执行：

```sh
pnpm --dir ../things-link-client-contracts install --frozen-lockfile
pnpm --dir jagonzn-console install --frozen-lockfile
pnpm --dir jagonzn-console dev
```

访问 http://127.0.0.1:13006。当前 `.env.development` 临时代理到本机 ThingsLink 平台后端 `http://127.0.0.1:8080`，暂不启动 jagonzn-service；恢复独立 service 时把 `VITE_API_PROXY_URL` 改回 `http://127.0.0.1:18080`。登录使用所连后端自己的账号与会话配置。生产构建使用同源 `/api`，部署层须将 HTTP 和 WebSocket 转发到对应后端。

## 验证与同步

```sh
pnpm --dir jagonzn-console build
pnpm --dir jagonzn-console api:check
pnpm --dir jagonzn-console test
```

共享合同包直接引用 ThingsLink 主仓的 `../../things-link-client-contracts`（相对本前端目录），不另复制。须保留 `thingslink/things-link-client-contracts` 与 `thingslink/jagonzn/jagonzn-console` 的目录关系。单独克隆 jagonzn 不包含此包，构建前需另行取得配套源码；这属于构建依赖，不是对后端进程的运行依赖。API 类型使用本仓库固定版本的 `docs/upstream/console-openapi.json`；`api:generate` 仅从该已交付合同生成 TypeScript，不启动或修改上游后端。

[复用与同步方案](../docs/console-reuse-and-evolution.md)记录版本、边界、后续精简方向和本次验证。上游 README/AGENTS/贡献指南保存在 `docs/upstream/things-cloud-*.md`，上游 TODO、E2E、合同测试及历史回执完整保留，但其平台相对路径和真实栈尚未逐项适配，不能作为本项目通过证明。旧静态页源码归档在 `../docs/upstream/static-console/`，原静态验证记录仍保留。

原 MIT LICENSE 保留；品牌定制不改写原作者和历史证据。
