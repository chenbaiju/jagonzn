#!/usr/bin/env node
// 只验证免登录静态测试页，不调用业务 API，也不代表正式 Console 验收。
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { createRequire } = require('node:module');

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`缺少参数 ${name}`);
  return process.argv[index + 1];
}

const devUrl = option('--url');
const dist = path.resolve(option('--dist'));
const evidence = path.resolve(option('--evidence-dir'));
const executablePath = option('--chromium');
const { chromium } = createRequire(path.resolve(option('--playwright-package')))('@playwright/test');
const results = [];
let browser, server;

async function inspectPage(origin, name, viewport, reload = false) {
  // 每个检查使用新的匿名上下文，防止沿用登录 Cookie 或本地存储。
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [], failedRequests = [], responses = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} (${message.location().url})`); });
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('request', request => requests.push({ url: request.url(), type: request.resourceType() }));
  page.on('response', response => responses.push({ url: response.url(), status: response.status() }));
  const result = { name, status: 'FAIL', viewport, reload, errors, failedRequests, responses, requests };
  results.push(result);
  const navigation = await page.goto(origin, { waitUntil: 'networkidle' });
  assert.equal(navigation.status(), 200);
  await page.getByRole('heading', { name: '页面已加载', exact: true }).waitFor();
  if (reload) {
    const response = await page.reload({ waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.getByRole('heading', { name: '页面已加载', exact: true }).waitFor();
  }
  assert.equal(await page.title(), 'Jagonzn Console · 测试页面');
  assert.equal(page.url(), origin);
  assert.equal(await page.locator('button, input, form, select, textarea').count(), 0);
  assert.equal((await context.cookies()).length, 0);
  const layout = await page.evaluate(() => {
    const card = document.querySelector('.test-card').getBoundingClientRect();
    return {
      viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      cardLeft: card.left, cardRight: card.right, cardWidth: card.width,
      localStorageKeys: Object.keys(localStorage), sessionStorageKeys: Object.keys(sessionStorage),
      note: document.querySelector('.note').textContent
    };
  });
  assert.deepEqual(layout.localStorageKeys, []);
  assert.deepEqual(layout.sessionStorageKeys, []);
  assert.equal(layout.note, '此页面用于前端访问测试，后端连接状态尚未检测。');
  assert(layout.scrollWidth <= layout.viewportWidth, '出现横向溢出');
  assert(layout.cardLeft >= 16 && layout.cardRight <= layout.viewportWidth - 16, '卡片缺少边距');
  assert.deepEqual(errors, []);
  assert.deepEqual(failedRequests, []);
  assert(responses.length >= 2, '未观察到静态资源加载');
  assert(responses.every(response => response.status < 400), '静态资源出现 HTTP 错误');
  assert(requests.every(request => new URL(request.url).origin === new URL(origin).origin), '出现外部请求');
  assert(!requests.some(request => ['xhr', 'fetch'].includes(request.type)), '出现业务请求');
  await page.screenshot({ path: path.join(evidence, `${name}.png`), fullPage: true });
  Object.assign(result, { status: 'PASS', layout });
  await context.close();
}

(async () => {
  await fs.mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath });
  // 本机临时 HTTP 服务只托管实际构建目录，退出时关闭，不代理任何 API。
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
      const file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(dist + path.sep)) { response.writeHead(403).end(); return; }
      response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const productionUrl = `http://127.0.0.1:${server.address().port}/`;
  await inspectPage(devUrl, 'dev-desktop', { width: 1440, height: 900 });
  await inspectPage(devUrl, 'dev-mobile-320', { width: 320, height: 740 });
  await inspectPage(devUrl, 'dev-anonymous-reload', { width: 1280, height: 800 }, true);
  await inspectPage(productionUrl, 'dist-desktop', { width: 1440, height: 900 });
  await inspectPage(productionUrl, 'dist-mobile-375', { width: 375, height: 812 });
  console.log(`PASS ${results.length}/${results.length} 静态页面浏览器场景`);
})().catch(error => {
  results.push({ name: 'execution', status: 'FAIL', detail: error.stack });
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await fs.mkdir(evidence, { recursive: true });
  await fs.writeFile(path.join(evidence, 'browser-results.json'), JSON.stringify({
    scope: 'ANONYMOUS_STATIC_CONSOLE_ONLY', checkedAt: new Date().toISOString(), results
  }, null, 2));
});
