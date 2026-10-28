# things-cloud-console

面向 IoT 平台的浏览器管理控制台，使用 Vue 3、TypeScript、Vite 和 Element Plus 构建。源码随 [ThingsCloud 平台](https://github.com/chenbaiju/things-cloud) 的 `master` 统一维护，本目录不再是独立 Git 仓库。

## 项目用途

控制台通过后端 API 管理租户与项目、设备及物模型、遥测与告警、规则与自动化、看板应用、OTA 和套餐资源。登录会话、权限判断、设备数据与任务执行由后端提供；前端消费接口与权限，不内置一套模拟业务后端。现有接口上的页面任务见 [Console 待办](../TODO.md)，须先补后端的需求见 [后端依赖待办](../BACKEND_TODO.md)，页面存在不代表对应外部设备或生产环境已验收。

Console 首页是围绕项目和设备开发流程的工作台，提供物模型、设备接入、上报调试、规则、应用看板入口，以及真实项目摘要和本机最近访问。原概要保留为“项目概况”，原URL继续可用；页面组织、切片和验证边界见[开发者工作台记录](../TODO.md#开发者工作台重构计划)。

## 仓库结构

| 目录                                     | 内容                                       |
| ---------------------------------------- | ------------------------------------------ |
| `src/`                                   | 页面、组件、路由、状态管理、API 与生成类型 |
| `tests/`                                 | 单元、组件及客户端合同测试                 |
| `e2e/`                                   | Playwright 浏览器旅程与测试夹具            |
| `scripts/`                               | 契约检查、隔离栈启动与证据工具             |
| `docs/`                                  | Console 待办及后端能力缺口                 |
| `docs/upstream/`                         | 上游模板历史与已退役精简脚本的非执行归档   |
| `public/`                                | 不经模块转换的静态资源                     |
| `../.github/workflows/{console,e2e}.yml` | 平台根目录的手动静态/单元与真实隔离栈 E2E  |

### 根目录文件分类

文件扩展名表示工具使用的格式，不表示临时文件。Console 根目录保留工具默认发现的配置和项目入口；业务源码放 `src/`，验证代码放 `tests/`、`e2e/`、`scripts/`，上游资料放 `docs/upstream/`。不要按 `*.ts`、`*.json`、`*.cjs` 等扩展名整体删除或加入 Git 忽略。

| 文件 | 实际用途与调用关系 | 处置 |
| --- | --- | --- |
| `package.json` | pnpm 命令、依赖、Node要求与提交向导入口 | 保留并跟踪 |
| `pnpm-lock.yaml` | 锁定依赖版本；本机和CI的 `--frozen-lockfile` 安装读取它 | 保留并跟踪，不手改或格式化 |
| `pnpm-workspace.yaml` | pnpm 11依赖构建脚本允许/拒绝清单；不是多余工作区文件 | 保留并跟踪 |
| `index.html` | Vite应用入口，挂载 `#app` 并加载 `src/main.ts` | 保留并跟踪 |
| `vite.config.ts` | 构建、代理、别名、Vue/样式/自动导入插件；开发与构建直接消费 | 保留并跟踪 |
| `tsconfig.json` | TypeScript、Vue语言服务、类型检查及路径映射 | 保留并跟踪 |
| `.env`、`.env.development`、`.env.production` | Vite按模式读取的公共默认值；本轮核对变量为端口、版本、API地址和前端开关 | 保留并跟踪，禁止存储秘密；本机覆盖使用被忽略的 `*.local` |
| `eslint.config.mjs` | ESLint默认发现；读取自动导入全局定义，支持Vue与TypeScript | 保留并跟踪 |
| `.prettierrc`、`.prettierignore` | Prettier及编辑器的格式规则与排除范围 | 保留并跟踪 |
| `.stylelintrc.cjs`、`.stylelintignore` | Stylelint的Vue/SCSS规则与排除范围 | 保留并跟踪 |
| `vitest.config.ts` | `pnpm test` 默认发现的单元/组件测试配置 | 保留并跟踪；测试基础设施不是运行垃圾 |
| `vitest.contract.config.ts` | `pnpm test:contract` 显式读取，真实后端行为契约独立于单元测试 | 保留并跟踪 |
| `playwright.config.ts` | 浏览器测试、Runner及配置回归读取；还受源文件快照、摘要和独占运行守卫绑定 | 保留原位并跟踪，不为目录美观破坏证据路径 |
| `commitlint.config.cjs` | `pnpm commit` 的cz-git本地向导配置；实际平台提交守卫以平台根配置为准 | 保留并跟踪 |
| `.gitignore`、`.gitattributes` | Git产物排除、源码属性及生成API类型的差异展示 | 保留并跟踪 |
| `README.md`、`README.zh-CN.md` | 主项目说明及兼容中文入口；中文入口链接主说明，不维护两套正文 | 保留并跟踪 |
| `AGENTS.md`、`CONTRIBUTING.md` | 工作约定和GitHub可发现的贡献入口 | 保留并跟踪 |
| `LICENSE` | 上游MIT版权与许可文本 | 保留原声明并跟踪 |
| 原 `CHANGELOG.md`、`CHANGELOG.zh-CN.md` | 上游模板的发布历史，不是ThingsCloud当前产品进度 | 迁入 `docs/upstream/`，保留正文并修正相对入链 |

`.mjs` 使用ES模块，`.cjs` 使用CommonJS，`.ts` 可表达类型化配置；当前依赖和工具分别读取这些格式，不能为了统一后缀而直接互换。根目录的HTML是应用入口，业务JSON、测试JSON和生成JSON也须按消费者区分。

### 本机产物与Git隔离

下面的路径已被 Git 忽略，本轮未发现它们被平台索引跟踪；Git忽略只控制版本管理，不会让IDE或文件管理器隐藏这些文件。

| 路径 | 用途 | 清理条件 |
| --- | --- | --- |
| `node_modules/`、`.playwright-browsers/` | 已安装依赖与浏览器缓存 | 可按需重装；整理目录不执行缓存删除 |
| `dist/`、`dist-ssr/` | 构建输出 | 可重新构建，不能误作源码 |
| `.auto-import.json`、`src/types/import/` | Vite插件生成的ESLint全局变量与类型声明 | 必须先通过开发/构建再生成；ESLint实际读取前者，不能只删不补 |
| `logs/`、`test-results/`、`playwright-report/` | 调试日志、运行材料及浏览器报告 | 按证据保留要求处理，不自动删除历史记录 |
| `.e2e-evidence/` | 按候选隔离的原始验收证据与摘要绑定材料 | 不能按普通缓存清空；沿证据工具契约导出/保留 |
| `manifest/` | 本机模拟器消息确认记录 | 保留当前运行材料，不随目录整理清空 |
| `.idea/`、`.DS_Store`、`*.local` | 本机IDE/系统状态与本机配置 | 不提交；现有文件保持原位 |

Prettier与Git忽略是两套规则。本轮在 `.prettierignore` 补齐运行报告、日志、原始证据、生成声明及上游归档的排除，避免 `pnpm lint:prettier` 批量改写摘要绑定文件。受控证据包和正式回执仍沿原工具维护，不因目录被忽略就视为可丢弃。

### 上游历史与退役工具

- 原模板历史迁入 [英文更新日志](CHANGELOG.md) 与 [中文更新日志](CHANGELOG.zh-CN.md)；当前产品进度仍查 [Console待办](../TODO.md)。只修正迁移所需的相对链接，不删除版权或重写历史内容。原路径和原始内容可由平台提交 `a36a10181` 恢复；历史审计清单中的旧路径保持当时候选含义，不重写不可变记录。
- 原 `scripts/clean-dev.ts` 是模板初始化工具，调用链只有 `package.json` 的 `clean:dev`。它会删除README/模板目录并重写路由、语言、快捷入口和菜单，已不适合当前业务工程。本轮移除命令入口，将原文件逐字节保留为 [非执行归档](clean-dev.ts.txt)，不运行精简操作。新克隆继续使用正常开发、构建和验证命令。
- 所有其他配置、源码、测试与工具均保留；未创建嵌套Git，不排除测试代码，未删除本机缓存或运行证据。本轮审计与验证记录见 [工程目录整理](../TODO.md#工程目录整理)。

## 开发准备

推荐 Node.js 22；pnpm 使用 `package.json` 固定的 11.9.0。Console、`things-cloud-client-contracts`、`docs/openapi.json`、后端与 WebApp 都由同一平台提交提供。完整 E2E 还需要 Java 21、Docker Compose 和 Python 3；开发者需要平台仓库读取权限。

在全新的目录中克隆平台即可（以下适用于 Bash / Git Bash）：

```bash
git clone https://github.com/chenbaiju/things-cloud.git things-cloud-workspace
cd things-cloud-workspace
pnpm --dir things-cloud-client-contracts install --frozen-lockfile
cd things-cloud-console
pnpm install --frozen-lockfile
pnpm dev
```

不再克隆独立 Console、初始化嵌套 `.git` 或执行双仓库同步。Console 的代码、测试、文档及资源直接在平台根按范围暂存与提交；推送按当次授权执行到平台 `master`。原独立 Git 历史已归档，恢复边界及本次迁移记录见 [CI 执行约定](../../../../.private/thingslink-docs/.github/CI.md#Console%20单仓库交付与手动%20CI)。

开发服务器默认使用 `http://localhost:3006`，API 代理默认指向 `http://localhost:8080`。 `pnpm dev` 只启动前端；后端须另按平台运行说明准备。生产部署通过同站反向代理访问 API。本机覆盖配置放 `.env.development.local`；`VITE_` 变量会进入浏览器产物，不存放秘密。

## 构建与验证

从配套工作区的 Console 目录执行：

```bash
pnpm build                 # 共享合同、生产构建与类型检查
pnpm test                  # 单元与组件测试
pnpm api:check             # OpenAPI 生成类型一致性
pnpm lint                  # ESLint
pnpm lint:stylelint:check   # 样式检查
```

干净检出先执行 `build`，让 Vite 生成后续检查依赖的声明。独立类型检查可使用 `pnpm typecheck`。完整 E2E 仅在专用测试环境执行，它会启动真实依赖、后端、模拟器及前端并创建测试数据：

```bash
pnpm --dir ../things-cloud-webapp install --frozen-lockfile
PLAYWRIGHT_BROWSERS_PATH="$PWD/.playwright-browsers" pnpm exec playwright install chromium
./scripts/run-e2e-tests.sh --with-simulator
```

## 手动 CI

平台根目录的 [console.yml](../../../../.github/workflows/console.yml) 和 [e2e.yml](../../../../.github/workflows/e2e.yml) 只允许 `workflow_dispatch`，提交、推送和 PR 均不自动启动。两项都检出本次手动运行的同一平台 SHA，Console、后端、共享合同与 WebApp 不再分别取版本，也不需要独立仓库读取后端的 SSH Secret。

`console` 执行构建、单元与静态检查。`console-e2e` 在自身工作流内先执行相同的前置验证，通过后启动真实隔离栈和完整默认浏览器旅程，失败保留报告与日志；不通过 `workflow_call` 增加额外入口。本目录不再保存 `.github`。

本地从平台根运行 `bash verify/sh/verify-console.sh` 或 `bash verify/sh/verify-console-e2e.sh`，默认九项聚合也包含它们。结果范围、日志和环境要求见 [本地验证说明](../../../../.private/thingslink-docs/tools/verification/README.md)，实际 GitHub 运行统一登记到 [CI 台账](../../../../.private/thingslink-docs/.github/CI.md)，不代表正式设备或生产环境放行。

## 文档与许可证

- [Console 文档入口](../README.md)
- [平台前端架构](https://github.com/chenbaiju/things-cloud/blob/master/docs/FRONTEND_ARCHITECTURE.md)（需私有仓库权限）
- [上游 MIT 许可证](../../LICENSE)：保留原版权声明；本仓库不宣称原模板的演示站点或支持渠道由当前维护者提供。

暂停中的专属测试与恢复命令见[第四轮测试接续](../TODO.md#第四轮测试接续)；保存测试代码不等于对应业务验收通过。

开发调试工具：需要Vue DevTools时可在本机环境设置`VITE_DEVTOOLS=true`后启动Vite；默认关闭悬浮调试控件，避免遮挡工作区和窄屏验收。此选项不改变业务权限或接口。
