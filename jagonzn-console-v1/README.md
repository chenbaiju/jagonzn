# Jagonzn Console V1

从 ThingsLink Console V1 复制的独立前端，保留原工程结构、页面与测试；本副本包名为 `@jagonzn/console-v1`。ThingsLink 源工程的私有文档、`AGENTS.md`、分析目录和实验目录未随副本复制。

## 当前运行

Vue3、TypeScript、Vite、Element Plus，单套图标；严格 JSON 复用同仓已生成的 `things-link-client-contracts` 与主仓 OpenAPI 生成物。

本机需要已挂载 Samsung 外设、Node 及 pnpm 11.9.0。默认开发端口 13016，后端代理默认 `localhost:8080`，可用 `CONSOLE_V1_API` 指定其他后端。

```sh
cd /Users/zhangguojian/IdeaProjects/thingslink/jagonzn/jagonzn-console-v1
pnpm install
pnpm dev
```

依赖目录使用本工程 `node_modules`；Vite/Vitest 缓存默认放在 `/Volumes/Samsung/Jagonzn/data/.private/workspaces/console-v1/main/runtime`，也可用 `CONSOLE_V1_OUTPUT` 指向自己的外置 runtime。不在源码目录生成 dist、日志或临时夹具。Windows 上同一外置目录映射为当前盘符下的 `D:\Volumes\Samsung`。

```sh
pnpm typecheck
pnpm test
pnpm build
```

产品品牌、页面文案和接口目标仍沿用复制时的 ThingsLink Console V1；后续按 jagonzn 产品需要单独调整。
