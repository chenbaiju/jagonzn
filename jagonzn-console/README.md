# Jagonzn Console 测试页面

独立 Vue 3 + Vite 测试页。无需登录，没有操作控件、业务 API 请求或模拟业务数据。

```powershell
Set-Location D:\ThingsCloud\jagonzn\jagonzn-console
pnpm install
pnpm dev
```

访问 `http://127.0.0.1:13006/`。端口固定，仅监听本机回环。

`pnpm build` 生成 `dist/`；`pnpm preview` 在同一端口预览构建结果，使用前先停止开发服务。

此页只显示前端自身状态。[001 实施记录](docs/TEST_EXECUTION_20260929.md)与[002 测试回执](docs/TEST_EXECUTION_20260929.md)记录实际范围：五个浏览器场景通过，静态构建另在隔离实验栈用 HTTPS 13007 完成网络预检，测试结束后保留 HTTP 13006 开发页。正式 Console、管理员合同和完整 LAN 验收仍待完成。
