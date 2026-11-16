import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus, { ElDropdown, ElMessage } from 'element-plus'
import App from '@/App.vue'
import Shell from '@/layout/ConsoleShell.vue'
import { login, session, switchProject } from '@/core/session'
import { changeIdentity } from '@/core/http'

const project = '11111111-1111-4111-8111-111111111111'
const nextProject = '22222222-2222-4222-8222-222222222222'
const json = (body: unknown) => new Response(JSON.stringify(body))
function deferred() {
  let resolve!: (response: Response) => void
  const promise = new Promise<Response>(yes => { resolve = yes })
  return { promise, resolve }
}
let view: VueWrapper | undefined
const fetchMock = vi.fn()
function response(url: URL): Promise<Response> {
  if (url.pathname === '/api/v1/auth/refresh') return Promise.resolve(json({ accessToken: 'initial-refresh' }))
  if (url.pathname === '/api/v1/auth/logout') return Promise.resolve(new Response(null, { status: 204 }))
  if (url.pathname === '/api/v1/auth/login') return Promise.resolve(json({ accessToken: 'new-user' }))
  if (url.pathname === '/api/v1/auth/me') return Promise.resolve(json({ email: 'new@example.test', currentProjectId: nextProject, permissions: ['device:read'] }))
  if (url.pathname === '/api/v1/projects') return Promise.resolve(json([{ id: project, name: '原项目' }, { id: nextProject, name: '新项目' }]))
  if (url.pathname === '/api/v1/system/menus') return Promise.resolve(json([{ name: 'Devices' }]))
  throw new Error(`未声明的导航测试请求：${url.pathname}`)
}
async function navigation() {
  const router = createRouter({ history: createMemoryHistory(), routes: ['/devices', '/login', '/projects', '/device-queries'].map(path => ({ path, component: { template: '<div>测试页面</div>' } })) })
  await router.push('/devices'); await router.isReady()
  return router
}
beforeEach(() => {
  changeIdentity('initial-session')
  session.ready = true; session.transitioning = false
  session.user = { email: 'old@example.test', currentProjectId: project, permissions: ['device:read'] }
  session.projects = [{ id: project, name: '原项目' }]; session.menus = [{ name: 'Devices' }]
  fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { view?.unmount(); view = undefined; ElMessage.closeAll(); changeIdentity(); session.user = null; session.projects = []; session.menus = []; session.ready = false; session.transitioning = false; vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('公共壳会话导航', () => {
  it('首次深链导航尚未提交时，初始化失效不能用启动占位根路径覆盖登录目标', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    const target = '/devices/11111111-1111-4111-8111-111111111111?tab=settings'
    const history = createMemoryHistory()
    history.push(target)
    const router = createRouter({ history, routes: [
      { path: '/devices/:id', component: { template: '<div>设备详情</div>' } },
      { path: '/login', component: { template: '<div>登录</div>' } }
    ] })
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    router.beforeEach(async to => { if (to.path.startsWith('/devices/')) await pending })
    session.ready = false; session.user = null
    view = mount(App, { global: { plugins: [router] } })
    try {
      await flushPromises(); await flushPromises()
      expect(router.currentRoute.value.path).not.toBe('/login')
    } finally { release() }
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(router.currentRoute.value.query.redirect).toBe(target)
  })

  it('实际控制台路由在项目过渡期间不误判为未登录', async () => {
    const { router } = await import('@/router')
    await router.push('/login')
    session.user = null; session.transitioning = true
    await router.push('/devices')
    expect(router.currentRoute.value.path).toBe('/devices')
  })

  it('实际控制台路由在会话失效且没有项目过渡时仍拒绝设备深链', async () => {
    const { router } = await import('@/router')
    await router.push('/login')
    session.user = null
    await router.push('/devices?sort=name')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/devices?sort=name')
  })

  it('失效的初始化返回时仍有新项目切换在进行，不跳到登录页', async () => {
    const oldRefresh = deferred(), switching = deferred()
    fetchMock.mockImplementation((url: URL) => url.pathname === '/api/v1/auth/refresh' ? oldRefresh.promise : url.pathname === '/api/v1/auth/switch-project' ? switching.promise : response(url))
    const router = await navigation()
    view = mount(App, { global: { plugins: [router] } })
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.pathname === '/api/v1/auth/refresh')).toBe(true))
    const pending = switchProject(nextProject)
    oldRefresh.resolve(json({ accessToken: 'old-refresh' }))
    try {
      await flushPromises()
      expect(session.transitioning).toBe(true)
      expect(router.currentRoute.value.path).toBe('/devices')
    } finally { switching.resolve(json({ accessToken: 'next-project' })); await pending }
  })

  it('从真实账号菜单发起的旧退出完成后不跳走新登录页面，也不误报清会话', async () => {
    const oldLogout = deferred()
    fetchMock.mockImplementation((url: URL) => url.pathname === '/api/v1/auth/logout' ? oldLogout.promise : response(url))
    const router = await navigation(), errors = vi.spyOn(ElMessage, 'error')
    view = mount(Shell, { global: { plugins: [router, ElementPlus] } })
    view.findAllComponents(ElDropdown).at(-1)!.vm.$emit('command', 'logout')
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.pathname === '/api/v1/auth/logout')).toBe(true))
    await login('new@example.test', 'test-only-password')
    oldLogout.resolve(new Response(null, { status: 204 }))
    await flushPromises()
    expect(session.user?.email).toBe('new@example.test')
    expect(router.currentRoute.value.path).toBe('/devices')
    expect(errors).not.toHaveBeenCalled()
  })

  it('成功退出后清除会话并返回登录页', async () => {
    fetchMock.mockImplementation((url: URL) => Promise.resolve(response(url)))
    const router = await navigation()
    view = mount(Shell, { global: { plugins: [router, ElementPlus] } })
    view.findAllComponents(ElDropdown).at(-1)!.vm.$emit('command', 'logout')
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(session.user).toBeNull()
    expect(session.projects).toEqual([])
    expect(fetchMock.mock.calls.filter(([url]) => url.pathname === '/api/v1/auth/logout')).toHaveLength(1)
  })

  it('GET 401 且刷新失败后清除会话并带着当前深链回登录页', async () => {
    fetchMock.mockImplementation((url: URL) => Promise.resolve(response(url)))
    const router = await navigation()
    view = mount(App, { global: { plugins: [router] } })
    await vi.waitFor(() => expect(session.user?.email).toBe('new@example.test'))
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ message: '登录已失效' }), { status: 401 })))
    const { api } = await import('@/core/http')
    await expect(api('/api/v1/projects')).rejects.toMatchObject({ status: 401 })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(router.currentRoute.value.query.redirect).toBe('/devices')
    expect(session.user).toBeNull()
    expect(session.ready).toBe(true)
  })

  it('当前初始化失败仍进入登录页并清除旧项目名称', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    const router = await navigation()
    view = mount(App, { global: { plugins: [router] } })
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/login'))
    expect(session.user).toBeNull()
    expect(session.projects).toEqual([])
    expect(session.menus).toEqual([])
  })
})
