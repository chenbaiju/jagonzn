# 002：静态测试页与 Console 内网预检回执（2026-09-29）

## 授权、范围与四维审计

负责人要求推进相关测试，无需继续等待指令。本片只检查已交付的免登录静态页面和 Console 网络前置条件，不复制原 Console/共享包，不开发登录、授权或业务界面，不运行后端全量，不提交或推送。

| 维度 | 结论 |
| --- | --- |
| 事实依据 | [001 测试页](TEST_PAGE_20260929.md)规定免登录、无操作、无业务请求；[LAN 网络合同](../../../docs/reuse-entry/THINGS_CLOUD_JAGONZN_LAN_NETWORK_CONTRACT.md)规定隔离网络和受信 HTTPS，端口属于可调整实施选择。 |
| 逻辑连贯性 | 前端渲染、容器路由、证书、技术健康与正式业务资格分别记录；匿名静态页不会证明初始化、签名导入、完整套餐或 cloud 业务已实现。 |
| 信息缺口 | 本片静态访问条件已具备；正式管理员、跨服务身份、业务 API、全量权益、正式授权和真机输入仍缺，不推定其存在。 |
| 观点区分 | 免登录和继续测试来自负责人；信任链/主机名、HTTP 资源和隔离路由是检查事实；保留 HTTP 13006、另用 HTTPS 13007、采用独立 Compose 配置是本轮实施选择。 |

## 候选与环境

2026-09-29 22:23 起（北京时间）执行，核心动态检查于 22:37 完成，收尾时间另见证据清单。前端执行时 HEAD 为 `5c52570aab97e85a8b84c0d7d65137a63d37ae75`，含既有未提交修改和本轮测试页/工具，未认领为不可变发行制品。后端仍复用前批 `7f8416fe95f7f922c93dd61a01cfd574b28ada92` 工作树生成的候选，源码归属见[本地专项回执](../../../docs/reuse-entry/THINGS_CLOUD_LOCAL_TEST_EXECUTION_20260929.md)，没有在本片重新构建。Vue 3.5.22、Vite 7.1.7、Vue 插件 6.0.1；实际浏览器沿用本机已有 Playwright/Chrome for Testing 测试工具，没有复制原项目或其业务依赖。

- 开发页：`http://127.0.0.1:13006/`，原 Vite 终端保持运行。
- 本轮 Console HTTPS：`https://127.0.0.1:13007/`，仅用于实验；最终已停止本轮实验容器，当前查看入口仍为 HTTP 13006。
- `console-test.compose.yml` 单独启动两个 Caddy 容器，接入既有 `jagonzn-lan-acceptance` 网络。静态 `console` 仅在 internal 网络，HTTPS 代理额外接入受控回环桥并删除默认路由；无业务 API 代理。
- 原 14 个实验容器按原配置恢复启动，再加两个静态容器。service/cloud 原候选 JAR 摘要保持 `c7998480716a51c794d8377a4a1de353f29dbc08f4be034420d7e740a3496640` / `e76d88c377825dc8e2087b1624b2ebaf4a412778422404e48d24a6bb9f04d246`；不重建或拼接原 shc1 资格。

| 固定证据 | SHA-256 |
| --- | --- |
| 构建首页 `dist/index.html` | `7462d65e9ca09780e2b9bd0414d1b03fe1866149b6f19591dd8aff7598d41443` |
| 测试公开证书原字节 | `622ce10bcfa59a7c7a08ca0f14a4a8abe1309c8d7e8c6991956476b0ad536a30` |
| Caddy 两容器镜像 ID | `4c6e91c6ed0e2fa03efd5b44747b625fec79bc9cd06ac5235a779726618e530d` |
| 两容器实际合成配置 | `7cea9be8ab811b82c332d34f28e44dc36b1354313bd2a18410cb59ca9aa633ed` |

合成配置、测试私钥、身份及授权文件保留在原仓外私有卷，不写入文档。证据清单及其摘要见仓库 `logs/docs/jagonzn-console-evidence-manifest-20260929.json`。

## 实际测试结果

以下计数各归自己的入口，重复场景/重叠检查不相加为唯一用例数量。日志路径相对仓库根；均被 Git 忽略。

| 测试 | 结果 | 证据 |
| --- | --- | --- |
| 补图标后的实际生产构建 | 退出 0，11 个模块 | `jagonzn/jagonzn-console/logs/build-favicon-20260929.log` |
| Chromium 开发页桌面、320px 手机、匿名刷新；构建产物桌面、375px 手机 | **5/5**；标题与 Vue 挂载正确，无登录跳转/操作控件、Cookie/会话、业务请求、外部资源、脚本错误或横向溢出 | `jagonzn/jagonzn-console/logs/browser-20260929/browser-results.json` 及五张截图 |
| 受信 HTTPS 与静态网络检查 | **14/14**；两容器无默认 IPv4/IPv6 出站路由、只发布回环端口；首页及三个资源字节/MIME 一致；未知 CA 和错误主机名拒绝；API 路径 404；静态容器可读取两后端内网健康入口 | `logs/docs/jagonzn-console-static-lan-20260929.json` |
| 原 `audit-lan-readiness.py` 用本轮新参数完整重跑 | **15 PASS/0 FAIL**，退出 0；此前 `process_console`、`route_console`、`console_https` 均 PASS，新增 `network_exclusive_console` 也 PASS | `logs/docs/jagonzn-lan-readiness-console-static-20260929.json` |
| 两后端停止后的静态访问，Console/代理重启后复核 | 最终稳定重跑 **16/16**；后端停止/不可达，而 HTTPS 静态页及资源仍可读取，代理重启后再次无默认路由 | `logs/docs/jagonzn-console-static-restart-20260929.json`、`logs/docs/jagonzn-console-static-outage-stable-20260929.json` |

原预检的 11 PASS/3 FAIL 文件保留为历史快照，不覆盖。新预检比历史多一项，是因为 Console 存在后才执行其独占网络检查。授权检查仍仅证明 TEST 文件存在及摘要一致，不证明该普通业务进程已经导入或激活。

### 失败与修正记录

1. 首次浏览器检查发现默认 `/favicon.ico` 404。新增本项目 `public/favicon.svg` 并在 HTML 声明，重新构建后五场景通过；失败 JSON 保留于 `jagonzn/jagonzn-console/logs/browser-before-fix-20260929/`。
2. Console 文件作为第四层合并时，Compose 报 `services.emqx.extra_hosts must be a mapping`，没有据此更新后端配置。改用单独、显式复用原实验网络的两容器 Compose 文件验证/启动成功；未使用 `--remove-orphans`，未删除原容器或卷。
3. 首次后端停止检查未完成时，执行者提前重启了静态容器；cloud 不可达检查未按预期退出，首轮 **15 PASS/1 FAIL、退出 1**。该轮不计通过，证据 `logs/docs/jagonzn-console-static-outage-20260929.json` 保留。待重启完成后两次完整检查均 **16/16、退出 0**；测试工具补充失败退出码诊断。

## 复测入口

浏览器入口为 `jagonzn/deploy/tests/console-static-browser.cjs`，参数 `--url`、`--dist`、`--evidence-dir`、`--chromium` 和 `--playwright-package` 均为实际本机绝对路径；每个场景创建新的匿名上下文，退出后关闭临时构建产物 HTTP 服务。

静态网络检查入口为 `jagonzn/deploy/tests/console-static-lan.py`，参数 `--url`、`--ca`、`--dist`、`--evidence`；两后端确已停止时另加 `--expect-backends-stopped`。脚本只读，不启停容器，不改变证书或后端配置。

独立 Console 部署需要已有实验网络和本机证书，指定 `LAN_CONSOLE_TEST_DIST`、`LAN_CONSOLE_TEST_CONFIG_DIR` 的绝对路径后单独运行 `docker compose -f <console-test.compose.yml绝对路径> up -d`。这些路径来自原私有 POSIX 状态卷；不能直接把 Windows 路径当作 Docker daemon 内路径。本轮回环 HTTPS 端口为 13007，正式目标仍以网络合同和后续候选为准。

## 完成边界与收尾

本片完成静态页和 Console 网络前置条件，**不关闭完整 LAN 实验或正式客户资格**。真实 Chromium 覆盖的是 HTTP 开发页和本机 HTTP 构建产物；HTTPS 信任/主机名由标准 TLS 客户端显式信任本次公开测试证书验证，未安装系统或浏览器根、未使用跳过 TLS 校验。浏览器直接信任 HTTPS 后的正式业务页面仍待相应工作包。

正式管理员、初始化/授权 API、同候选动态导入、全部 19 额度/16 能力、cloud 业务、其余协议/真机与正式签发仍按原计划登记。V5g 专用栈和 `tc-*` 未被本轮启停；V5g 保持等待真实 UTC 午夜。本轮 16 个 LAN 实验容器及工具探针最终停止，保留全部卷、候选、证书、身份和成功/失败证据；HTTP 开发页继续运行。未提交或推送。

收尾文档检查采用 `scripts/docs-verify.ps1 -SkipMaven`：23 项 Markdown 回归、平台文档本地链接及 Git 空白检查通过，未运行 Maven；jagonzn 27 份 Markdown 本地链接与两份测试工具语法也通过。此轮没有重跑 Java 文档测试或后端全量。
