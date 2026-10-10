# jagonzn-console

独立 jagonzn 浏览器前端，完整继承 ThingsCloud Console 当前源码、菜单、测试与资源，再做品牌及独立后端适配；暂不实施菜单精简。cloud 仍为独立 Java 业务后端。

## 本机启动

需要 Node >=20.19、pnpm 11.9.0。在仓库根依次执行：

```sh
pnpm --dir ../things-cloud-client-contracts install --frozen-lockfile
pnpm --dir jagonzn-console install --frozen-lockfile
pnpm --dir jagonzn-console dev
```

访问 http://127.0.0.1:13006，开发代理默认连接 http://127.0.0.1:18080 的 jagonzn-service。登录需要实际运行的 service 及正确的会话 Origin/Cookie 配置；不使用 ThingsCloud 8080 作为替代。生产构建使用同源 `/api`，部署层须将 HTTP 和 WebSocket 转发到 jagonzn-service。

## 验证与同步

```sh
pnpm --dir jagonzn-console build
pnpm --dir jagonzn-console api:check
pnpm --dir jagonzn-console test
```

共享合同包直接引用 `../../things-cloud-client-contracts`（相对本前端目录），不另复制。须保留 `ThingsCloud/things-cloud-client-contracts` 与 `ThingsCloud/jagonzn/jagonzn-console` 的目录关系。单独克隆 jagonzn 不包含此包，构建前需另行取得配套源码；这属于构建依赖，不是对 ThingsCloud 后端进程的运行依赖。API 类型使用本仓库固定版本的 `docs/upstream/console-openapi.json`；`api:generate` 仅从该已交付合同生成 TypeScript，不启动或修改上游后端。

[复用与同步方案](../docs/console-reuse-and-evolution.md)记录版本、边界、后续精简方向和本次验证。上游 README/AGENTS/贡献指南保存在 `docs/upstream/things-cloud-*.md`，上游 TODO、E2E、合同测试及历史回执完整保留，但其平台相对路径和真实栈尚未逐项适配，不能作为本项目通过证明。旧静态页源码归档在 `../docs/upstream/static-console/`，原静态验证记录仍保留。

原 MIT LICENSE 保留；品牌定制不改写原作者和历史证据。
