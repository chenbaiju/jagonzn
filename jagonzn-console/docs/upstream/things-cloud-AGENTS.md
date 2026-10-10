# Console 工作约定

> 当前联调范围以 `docs/TODO.md` 与 `docs/BACKEND_TODO.md` 为准：商用服务器/域名验收和 SIM 对接暂停；保留套餐额度、用量与隔离 CI。暂停外部验收不等于关闭安全校验或取消业务测试。

- Console 是 `chenbaiju/things-cloud` 平台的普通目录，全部源码、测试、文档和资源统一交付到平台 `master`；不保留独立 `.git`、gitlink、远端或镜像同步机制。
- Console 变更直接在平台仓库核对和提交，推送须取得当次授权。停止向已退出交付的 `chenbaiju/things-cloud-console` 提交、推送或触发 CI，原独立历史归档见平台 `.github/CI.md`；远端删除由负责人处理。
- 先读 README、`docs/TODO.md`、`docs/BACKEND_TODO.md` 和 Git 状态；只修改当前任务范围，保留已有工作。
- 后端、共享合同及 Console 使用同一平台候选，按 README 配套；不从旧独立远端拉取代码或使用固定旧后端代替当前候选。
- 保留上游 MIT 版权声明。提交前核对忽略规则，不提交依赖缓存、日志、构建产物或部署密钥。
- CI 先构建再跑静态与单元检查，之后运行真实隔离栈；本机通过、远端 CI 和正式设备验收分别报告。
- CI 文件在平台根 `.github/workflows/{console,e2e}.yml`，仅由手动 `workflow_dispatch` 启动；E2E 自带静态前置作业，不配置自动触发或 `workflow_call`，本目录不再保存 `.github`。
- 后端已就绪的Console任务及完成回执维护在 `docs/TODO.md`，必须先完善后端的需求维护在 `docs/BACKEND_TODO.md`；后端交付后迁入Console队列，完成项划编号删除线并记录实际验证，不追加逐次开发日志；中文 Conventional Commit 说明改动与实际验证。

- 后端与Console任务由同一执行者统一接手，两个TODO按依赖是否具备分类；获准实施的完整功能片包含必要后端、生成契约、页面、文档和验证，不以等待其他后端人员为由搁置。当前轮次若明确仅规划或审阅，反馈后等待执行指令，不提前编码。
