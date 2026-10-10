/** 本机独立 service 的真实浏览器联调；凭据仅写入被忽略的 .local 文件，报告不含令牌。 */
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const origin = 'http://127.0.0.1:13006'
const root = resolve(import.meta.dirname, '../..')
const logs = resolve(root, 'deploy/logs/console-live')
mkdirSync(logs, { recursive: true })
const fixturePath = resolve(logs, 'fixture.local.json')
const fixture = existsSync(fixturePath)
  ? JSON.parse(readFileSync(fixturePath, 'utf8'))
  : {
      email: `console-${Date.now()}@jagonzn.example.test`,
      password: `Jg!9${randomBytes(18).toString('base64url')}`
    }
writeFileSync(fixturePath, JSON.stringify(fixture), { mode: 0o600 })
const report = {
  origin,
  backend: 'http://127.0.0.1:18080',
  pages: [],
  requests: [],
  scriptErrors: []
}
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  context.setDefaultTimeout(20000)
  context.setDefaultNavigationTimeout(20000)
  const api = async (path, data, token, method = 'POST') => {
    const response = await context.request.fetch(origin + path, {
      method,
      data,
      headers: { Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    })
    if (!response.ok())
      throw new Error(
        `${method} ${path}: ${response.status()} ${(await response.text()).slice(0, 500)}`
      )
    return response.status() === 204 ? null : response.json()
  }
  if (!fixture.verified) {
    if (!fixture.registered) {
      await api('/api/v1/auth/register', {
        email: fixture.email,
        password: fixture.password,
        displayName: 'jagonzn 本机联调'
      })
      fixture.registered = true
      writeFileSync(fixturePath, JSON.stringify(fixture), { mode: 0o600 })
    }
    let verification
    for (let i = 0; i < 30 && !verification; i++) {
      // Python 标准邮件解析器负责 MIME 解码；令牌只在内存中用于正式验证 API。
      verification = execFileSync(
        'python3',
        [
          '-c',
          `
import email, pathlib, re, html, sys
from email import policy
for p in pathlib.Path(sys.argv[1]).glob('*.eml'):
 m=email.message_from_bytes(p.read_bytes(),policy=policy.default)
 if sys.argv[2] not in str(m.get('To','')): continue
 for part in m.walk():
  if part.get_content_type() not in ('text/html','text/plain'): continue
  content=part.get_content()
  match=re.search(r'https?://[^\\s<>"\\x27]+/auth/verify-email\\?token=[^\\s<>"\\x27]+',html.unescape(content))
  if match: print(match.group());sys.exit(0)
`,
          resolve(root, 'deploy/logs/smtp-test.local'),
          fixture.email
        ],
        { encoding: 'utf8' }
      ).trim()
      if (!verification) await new Promise((r) => setTimeout(r, 1000))
    }
    if (!verification) throw new Error('没有收到隔离 SMTP 验证邮件')
    if (!verification.startsWith(origin + '/#')) throw new Error('验证邮件未指向 jagonzn Console')
    const token = new URLSearchParams(verification.split('?')[1]).get('token')
    await api('/api/v1/auth/email/verify', { token })
    fixture.verified = true
    writeFileSync(fixturePath, JSON.stringify(fixture), { mode: 0o600 })
  }
  // 通过正式 API 创建明确标注的空项目；不插入设备或伪造业务统计。
  console.log('准备本机隔离账号及项目')
  const prepared = await api('/api/v1/auth/login', {
    email: fixture.email,
    password: fixture.password
  })
  const projects = await api('/api/v1/projects', undefined, prepared.accessToken, 'GET')
  let project = projects.find((p) => p.name === 'jagonzn Console 联调')
  if (!project)
    project = await api(
      '/api/v1/projects',
      {
        name: 'jagonzn Console 联调',
        region: 'sh-1',
        timezone: 'Asia/Shanghai',
        description: '独立 Docker 数据库中的本机验证项目，无真实设备'
      },
      prepared.accessToken
    )
  await api('/api/v1/auth/logout', {})
  await context.clearCookies()
  const page = await context.newPage()
  page.on('pageerror', (error) => report.scriptErrors.push(error.message))
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (url.pathname.startsWith('/api/'))
      report.requests.push({
        origin: url.origin,
        path: url.pathname,
        method: response.request().method(),
        status: response.status()
      })
  })
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.port === '8080')
      report.scriptErrors.push('检测到 ThingsCloud 8080 请求: ' + url.origin + url.pathname)
  })
  console.log('执行真实浏览器登录')
  await page.goto(origin + '/#/auth/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input').first().fill(fixture.email)
  await page.locator('input[type=password]').fill(fixture.password)
  // 等待登录入场动画稳定，再按真实坐标拖动；明确验证结果，避免未通过滑块就等待登录请求。
  await page.locator('.dv_handler').hover()
  const handle = await page.locator('.dv_handler').boundingBox()
  const track = await page.locator('.drag_verify').boundingBox()
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(track.x + track.width - 2, handle.y + handle.height / 2, { steps: 25 })
  await page.mouse.up()
  await page.locator('.drag_verify').getByText('验证成功', { exact: true }).waitFor()
  const login = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/auth/login') && r.request().method() === 'POST'
  )
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const loginResponse = await login
  if (loginResponse.status() !== 200) throw new Error('浏览器登录失败: ' + loginResponse.status())
  const session = await loginResponse.json()
  await page.waitForURL((url) => !url.hash.includes('/auth/login'))
  console.log('浏览器登录已成功')
  const direct = await context.request.get('http://127.0.0.1:18080/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${session.accessToken}` }
  })
  const proxied = await api('/api/v1/auth/me', undefined, session.accessToken, 'GET')
  if (!direct.ok() || JSON.stringify(await direct.json()) !== JSON.stringify(proxied))
    throw new Error('代理与独立 service 身份响应不一致')
  report.identity = { projectId: project.id, proxyMatchesDirectService: true }
  // 从真实项目列表进入；切换会触发整页重载，先等待状态再等待新菜单，不读取已销毁文档的响应体。
  await page.goto(origin + '/#/project/list', { waitUntil: 'domcontentloaded' })
  const enter = page.getByRole('button', { name: '进入项目：jagonzn Console 联调', exact: true })
  await enter.waitFor()
  if (await enter.isEnabled()) {
    const switched = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/switch-project'))
    const menu = page.waitForResponse(
      (r) => r.url().endsWith('/api/v1/system/menus') && r.status() === 200
    )
    await enter.click()
    if ((await switched).status() !== 200) throw new Error('项目切换失败')
    await menu
  }
  console.log('已进入项目，代理身份一致')
  await page.waitForTimeout(1000)
  const routes = [
    '/dashboard/workbench',
    '/dashboard/overview',
    '/device/list',
    '/device/groups',
    '/device/types',
    '/alarm/history',
    '/alarm/rules',
    '/rule/automations',
    '/rule/scenes',
    '/task/jobs',
    '/dashboard/applications',
    '/project/list',
    '/project/members',
    '/project/end-users',
    '/project/settings',
    '/ota/firmwares'
  ]
  const startAt = process.env.JAGONZN_SMOKE_FROM ? routes.indexOf(process.env.JAGONZN_SMOKE_FROM) : 0
  if (startAt < 0) throw new Error('未知的起始页面')
  for (const route of routes.slice(startAt)) {
    const start = report.requests.length
    // 强制新文档导航，验证刷新 Cookie 恢复和目标页真实读取，避免旧页过渡态被当作新页面。
    console.log('检查页面 ' + route)
    const endpoints = {
      '/dashboard/workbench': '/overview',
      '/dashboard/overview': '/overview/trends',
      '/device/list': '/devices/search',
      '/device/groups': '/device-groups',
      '/device/types': '/device-types/search',
      '/alarm/history': '/alarms',
      '/alarm/rules': '/alarm-rules',
      '/rule/automations': '/automations',
      '/rule/scenes': '/scenes',
      '/task/jobs': '/task-jobs',
      '/dashboard/applications': '/applications',
      '/project/list': '/projects',
      '/project/members': '/members',
      '/project/end-users': '/end-users',
      '/project/settings': '/quota',
      '/ota/firmwares': '/ota/firmwares'
    }
    const expectedData = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname.endsWith(endpoints[route]) &&
        r.request().method() === 'GET' &&
        r.status() === 200,
      { timeout: 30000 }
    )
    await page.goto(origin + '/?smoke=' + Date.now() + '#' + route, {
      waitUntil: 'domcontentloaded'
    })
    if (route === '/dashboard/applications') {
      await page.getByTestId('application-directory-refresh').click()
    }
    await expectedData
    await page.waitForTimeout(2500)
    const text = await page.locator('body').innerText()
    const current = report.requests.slice(start)
    // 内存访问令牌在整页刷新后消失；只接受随后 refresh 与 me 均成功的预期会话恢复。
    const recovered =
      current.some((r) => r.path === '/api/v1/auth/refresh' && r.status === 200) &&
      current.some((r) => r.path === '/api/v1/auth/me' && r.status === 200)
    const bad = current.filter(
      (r) => r.status >= 400 && !(r.path === '/api/v1/auth/me' && r.status === 401 && recovered)
    )
    report.pages.push({
      route,
      actualHash: new URL(page.url()).hash,
      title: await page.title(),
      apiRequests: report.requests.length - start,
      expectedDataPath: endpoints[route],
      sessionRecovered: recovered,
      failures: bad,
      visibleError: /加载失败|请求失败|服务器错误|服务异常/.test(text)
    })
    await page.screenshot({
      path: resolve(logs, route.replaceAll('/', '_') + '.png'),
      fullPage: true,
      animations: 'disabled'
    })
    // 正常节奏联调，不通过关闭后端限流来放行测试。
    await page.waitForTimeout(4500)
  }
  report.apiOrigins = [...new Set(report.requests.map((r) => r.origin))]
  report.passed =
    report.pages.every(
      (p) =>
        p.actualHash === '#' + p.route && !p.failures.length && !p.visibleError && p.apiRequests > 0
    ) &&
    !report.scriptErrors.length &&
    report.apiOrigins.every((o) => o === origin)
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        pages: report.pages,
        apiOrigins: report.apiOrigins,
        scriptErrors: report.scriptErrors
      },
      null,
      2
    )
  )
  if (!report.passed) process.exitCode = 1
} catch (error) {
  report.error = error.message
  console.error(error.message)
  process.exitCode = 1
} finally {
  writeFileSync(resolve(logs, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()
}
