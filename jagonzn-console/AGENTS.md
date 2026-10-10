# jagonzn-console 工作约定

- 本目录属于独立 jagonzn 仓库，遵循根 AGENTS.md；不得修改上游平台源码或数据库。
- 先读 README.md 与 ../docs/console-reuse-and-evolution.md。完整复制上游，暂不按未来精简方案删除菜单。
- 产品运行只连接 jagonzn-service；cloud 业务接入另行决定。保留 API 合同、共享包标识及 MIT 版权，不做全局字符串替换。
- 上游基线见 ../docs/console-upstream.json；更新通过 ../scripts/console-upstream.py 生成三方合并候选，禁止整目录覆盖本地定制。
- docs/TODO.md、docs/BACKEND_TODO.md 和 docs/upstream 中的授权、通过记录仅属于上游历史，不能视为本项目授权或验收。
- 保留上游全部测试和脚本。涉及平台 Maven、数据库或隔离栈的脚本未适配前不得直接运行；禁止因此修改 ThingsCloud。
- 本项目本机端口 13006，后端 18080；生产环境同源 /api 反代至 jagonzn-service。构建成功不等于登录、全部菜单或设备业务通过。
