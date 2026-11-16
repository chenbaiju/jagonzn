import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrap, login, logout, session, switchProject } from '@/core/session'
import { api, changeIdentity, IdentityChanged } from '@/core/http'

const firstProject = '11111111-1111-4111-8111-111111111111'
const secondProject = '22222222-2222-4222-8222-222222222222'
const thirdProject = '33333333-3333-4333-8333-333333333333'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
let serverProject = firstProject
const fetchMock = vi.fn()
function seed() {
  changeIdentity('initial-session')
  session.ready = true
  session.transitioning = false
  session.user = { email: 'old@example.test', currentProjectId: firstProject, permissions: ['device:read'] }
  session.projects = [{ id: firstProject, name: '旧项目' }]
  session.menus = [{ name: 'Devices' }]
}
function normal(url: URL, request: RequestInit): Promise<Response> {
  switch (url.pathname) {
    case '/api/v1/auth/login': return Promise.resolve(json({ accessToken: 'new-session' }))
    case '/api/v1/auth/refresh': return Promise.resolve(json({ accessToken: 'refreshed-session' }))
    case '/api/v1/auth/me': return Promise.resolve(json({ email: 'new@example.test', currentProjectId: serverProject, permissions: ['device:read'] }))
    case '/api/v1/projects': return Promise.resolve(json([firstProject, secondProject, thirdProject].map(id => ({ id, name: id }))))
    case '/api/v1/system/menus': return Promise.resolve(json([{ name: 'Devices' }]))
    case '/api/v1/auth/logout': return Promise.resolve(new Response(null, { status: 204 }))
    case '/api/v1/auth/switch-project':
      serverProject = JSON.parse(String(request.body)).projectId
      return Promise.resolve(json({ accessToken: 'project-session' }))
    default: throw new Error(`未声明的测试请求：${url.pathname}`)
  }
}
const calls = (path: string) => fetchMock.mock.calls.filter(([url]) => url.pathname === path)
beforeEach(() => { serverProject = firstProject; fetchMock.mockReset().mockImplementation(normal); vi.stubGlobal('fetch', fetchMock); seed() })
afterEach(() => { changeIdentity(); session.user = null; session.projects = []; session.menus = []; session.ready = false; session.transitioning = false; vi.unstubAllGlobals() })

describe('公共会话交错与失效清理', () => {
  it('当前身份初始化失败清除用户、项目及菜单', async () => {
    fetchMock.mockImplementation((url: URL, request: RequestInit) => url.pathname === '/api/v1/auth/refresh' ? Promise.reject(new TypeError('offline')) : normal(url, request))
    await bootstrap()
    expect(session.ready).toBe(true)
    expect(session.user).toBeNull()
    expect(session.projects).toEqual([])
    expect(session.menus).toEqual([])
  })

  it('较早的初始化失败不能清掉随后已完成的新登录', async () => {
    const oldRefresh = deferred<Response>()
    fetchMock.mockImplementation((url: URL, request: RequestInit) => url.pathname === '/api/v1/auth/refresh' ? oldRefresh.promise : normal(url, request))
    const oldBootstrap = bootstrap()
    await vi.waitFor(() => expect(calls('/api/v1/auth/refresh')).toHaveLength(1))
    await login('new@example.test', 'test-only-password')
    oldRefresh.resolve(json({}, 401))
    await oldBootstrap
    expect(session.user?.email).toBe('new@example.test')
    expect(session.projects).toHaveLength(3)
    expect(session.menus).toEqual([{ name: 'Devices' }])
  })

  it.each(['response', 'network'] as const)('旧退出的迟到%s不清除新会话', async outcome => {
    const oldResponse = deferred<Response>()
    fetchMock.mockImplementation((url: URL, request: RequestInit) => url.pathname === '/api/v1/auth/logout' ? oldResponse.promise : normal(url, request))
    const oldLogout = logout().catch(error => error)
    await vi.waitFor(() => expect(calls('/api/v1/auth/logout')).toHaveLength(1))
    await login('new@example.test', 'test-only-password')
    if (outcome === 'response') oldResponse.resolve(new Response(null, { status: 204 }))
    else oldResponse.reject(new TypeError('late network failure'))
    expect(await oldLogout).toBeInstanceOf(IdentityChanged)
    expect(session.user?.email).toBe('new@example.test')
    expect(session.projects).toHaveLength(3)
    expect(session.menus).toEqual([{ name: 'Devices' }])
  })

  it('旧项目切换失败不重读或结束正在进行的新切换', async () => {
    const oldResponse = deferred<Response>(), newResponse = deferred<Response>()
    fetchMock.mockImplementation((url: URL, request: RequestInit) => {
      if (url.pathname !== '/api/v1/auth/switch-project') return normal(url, request)
      return JSON.parse(String(request.body)).projectId === secondProject ? oldResponse.promise : newResponse.promise
    })
    const oldSwitch = switchProject(secondProject).catch(error => error)
    const newSwitch = switchProject(thirdProject)
    await vi.waitFor(() => expect(calls('/api/v1/auth/switch-project')).toHaveLength(2))
    oldResponse.resolve(json({ accessToken: 'old-project' }))
    try {
      expect(await oldSwitch).toBeInstanceOf(IdentityChanged)
      expect(calls('/api/v1/auth/me')).toHaveLength(0)
      expect(session.transitioning).toBe(true)
    } finally {
      serverProject = thirdProject
      newResponse.resolve(json({ accessToken: 'new-project' }))
      await newSwitch
    }
    expect(session.user?.currentProjectId).toBe(thirdProject)
    expect(session.transitioning).toBe(false)
  })

  it('真实401失效同时取消项目过渡状态', async () => {
    session.transitioning = true
    fetchMock.mockResolvedValue(json({ message: 'expired' }, 401))
    await expect(api('/api/v1/auth/logout', { method: 'post' })).rejects.toMatchObject({ status: 401 })
    expect(session.user).toBeNull()
    expect(session.projects).toEqual([])
    expect(session.menus).toEqual([])
    expect(session.transitioning).toBe(false)
  })

  it('当前退出即使网络失败仍清除本机会话且不重放', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    await expect(logout()).rejects.toMatchObject({ outcomeUnknown: true })
    expect(calls('/api/v1/auth/logout')).toHaveLength(1)
    expect(session.user).toBeNull()
    expect(session.projects).toEqual([])
    expect(session.menus).toEqual([])
  })

  it('正常项目切换只接收新项目会话并结束过渡', async () => {
    await switchProject(secondProject)
    expect(session.user?.currentProjectId).toBe(secondProject)
    expect(session.menus).toEqual([{ name: 'Devices' }])
    expect(session.transitioning).toBe(false)
    expect(calls('/api/v1/auth/switch-project')).toHaveLength(1)
    await api('/api/v1/projects')
    expect(fetchMock.mock.calls.at(-1)![1].headers.get('Authorization')).toBe('Bearer project-session')
  })

  it('刷新令牌在刷新页面后恢复访问令牌并加载会话', async () => {
    changeIdentity()
    await bootstrap()
    const refresh = calls('/api/v1/auth/refresh')
    expect(refresh).toHaveLength(1)
    const me = calls('/api/v1/auth/me')
    expect(me.at(-1)![1].headers.get('Authorization')).toBe('Bearer refreshed-session')
    expect(session.user?.email).toBe('new@example.test')
    expect(session.projects).toHaveLength(3)
    expect(session.ready).toBe(true)
  })

  it('当前切换被拒绝后可以重读仍有效的原项目，不静默丢掉原错误', async () => {
    fetchMock.mockImplementation((url: URL, request: RequestInit) => url.pathname === '/api/v1/auth/switch-project' ? Promise.resolve(json({ message: 'denied' }, 403)) : normal(url, request))
    await expect(switchProject(secondProject)).rejects.toMatchObject({ status: 403 })
    expect(session.user?.currentProjectId).toBe(firstProject)
    expect(session.transitioning).toBe(false)
    expect(calls('/api/v1/auth/me')).toHaveLength(1)
  })

  it.each(['login', 'switch'] as const)('已解析的旧%s响应在会话提交前被新身份取代时不能夺回会话', async action => {
    const parse = JSON.parse
    const accessToken = action === 'login' ? 'new-session' : 'project-session'
    const spy = vi.spyOn(JSON, 'parse').mockImplementation((text, reviver) => {
      const value = parse(text, reviver)
      if (text.includes(`"accessToken":"${accessToken}"`)) {
        // 两个真实微任务边界分别经过HTTP交付及会话提交，不依赖定时器等待。
        queueMicrotask(() => queueMicrotask(() => {
          changeIdentity('winning-session')
          session.user = { email: 'winning@example.test', currentProjectId: thirdProject, permissions: ['device:read'] }
          session.projects = [{ id: thirdProject, name: '后来的项目' }]
          session.menus = [{ name: 'Devices' }]
          session.transitioning = false
        }))
      }
      return value
    })
    try {
      const operation = action === 'login' ? login('old@example.test', 'test-only-password') : switchProject(secondProject)
      await expect(operation).rejects.toBeInstanceOf(IdentityChanged)
      expect(session.user?.email).toBe('winning@example.test')
      expect(session.user?.currentProjectId).toBe(thirdProject)
      expect(session.projects).toEqual([{ id: thirdProject, name: '后来的项目' }])
      expect(session.transitioning).toBe(false)
      expect(calls('/api/v1/auth/me')).toHaveLength(0)
    } finally { spy.mockRestore() }
  })
})
