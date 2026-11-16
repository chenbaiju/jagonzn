import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import { session } from '../../src/core/session'
import { changeIdentity, identityEpoch } from '../../src/core/http'
import ApplicationAdminsDirectory from '../../src/features/application-admins/ApplicationAdminsDirectory.vue'
import { saveAdminCreateRecovery } from '../../src/features/application-admins/application-admin-recovery'

const mock = vi.hoisted(() => ({
  list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), changeStatus: vi.fn(), resetPassword: vi.fn(), delete: vi.fn()
}))
vi.mock('../../src/features/application-admins/application-admin-api', async original => {
  const source = await original<typeof import('../../src/features/application-admins/application-admin-api')>()
  return { ...source, applicationAdminApi: mock }
})
const project = '00000000-0000-4000-8000-000000000001', admin = '00000000-0000-4000-8000-000000000002'
const permissions = {
  operateDevice: true, editDeviceInfo: true, viewDeviceCertificate: false, editDeviceGroup: false,
  toggleDeviceSchedule: false, toggleDeviceAlarmRule: false, createUser: true, editUserInfo: false,
  resetUserPassword: false, editUserStatus: false, assignUserDevice: false, assignUserDashboard: false
}
const row = {
  id: admin, name: '管理员A', loginName: 'Admin.A', permissions,
  email: 'admin@example.com', phone: null, description: null, tags: [], status: 'ACTIVE', revision: '0',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
}
let wrapper: ReturnType<typeof mount> | undefined, router: Router

async function render() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admins', component: ApplicationAdminsDirectory },
      { path: '/admins/:adminId', component: { template: '<p>管理员详情</p>' } },
      { path: '/admin_add', component: { template: '<p>创建管理员</p>' } }
    ]
  })
  await router.push('/admins')
  await router.isReady()
  wrapper = mount(ApplicationAdminsDirectory, { attachTo: document.body, global: { plugins: [ElementPlus, router] } })
  await flushPromises()
  await nextTick()
  await flushPromises()
}
function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text)
  if (!found) throw new Error(`缺少按钮：${text}`)
  return found
}

beforeEach(() => {
  Object.values(mock).forEach(fn => fn.mockReset())
  sessionStorage.clear()
  changeIdentity()
  session.ready = true
  session.transitioning = false
  session.user = { accountId: project, currentProjectId: project, projectRole: 'OWNER', permissions: [] } as never
  session.projects = [{ id: project, myRole: 'OWNER', status: 'ACTIVE' }]
  mock.list.mockResolvedValue({ items: [row], nextCursor: null, hasMore: false })
  mock.changeStatus.mockResolvedValue({ ...row, status: 'DISABLED', revision: '1' })
})
afterEach(() => {
  vi.restoreAllMocks()
  wrapper?.unmount()
  wrapper = undefined
  session.user = null
  session.projects = []
  sessionStorage.clear()
  document.body.innerHTML = ''
})

describe('应用管理员目录', () => {
  it('显示名称、登录名、状态、权限计数和联系方式', async () => {
    await render()
    expect(wrapper!.text()).toContain('管理员(1)')
    expect(wrapper!.text()).toContain('管理员A')
    expect(wrapper!.text()).toContain('Admin.A')
    expect(wrapper!.text()).toContain('3/12')
    expect(wrapper!.text()).toContain('admin@example.com')
    expect(wrapper!.text()).toContain('什么是管理员账号？')
  })

  it('空目录显示原站管理员说明和创建入口', async () => {
    mock.list.mockResolvedValue({ items: [], nextCursor: null, hasMore: false })
    await render()
    expect(wrapper!.text()).toContain('管理员(0)')
    expect(wrapper!.text()).toContain('项目级应用的管理员')
    expect(wrapper!.text()).toContain('平台为项目级应用提供了内置的管理员账号系统')
    expect([...document.querySelectorAll('button')].filter(item => item.textContent?.trim() === '创建管理员')).toHaveLength(2)
  })

  it('非 OWNER/ADMIN 显示禁止态且不请求目录', async () => {
    session.user = { accountId: project, currentProjectId: project, projectRole: 'OPERATOR', permissions: [] } as never
    session.projects = [{ id: project, myRole: 'OPERATOR', status: 'ACTIVE' }]
    await render()
    expect(wrapper!.text()).toContain('没有此内容的读取权限')
    expect(mock.list).not.toHaveBeenCalled()
  })

  it('创建结果未确认时显示恢复提示，同名账号只标为线索', async () => {
    saveAdminCreateRecovery({
      version: 1, projectId: project, accountId: project, sessionEpoch: identityEpoch(),
      idempotencyKey: 'key-1', loginName: 'admin.a', requestedAt: new Date().toISOString()
    })
    await render()
    expect(wrapper!.text()).toContain('有一次创建结果未确认')
    expect(wrapper!.text()).toContain('同名账号只作调查线索')
    expect(wrapper!.text()).toContain('同名线索')
  })

  it('停用经确认后按 revision 提交并重新读取', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await render()
    button('停用').click()
    await flushPromises()
    await nextTick()
    expect(mock.changeStatus).toHaveBeenCalledWith(project, admin, 'DISABLED', '0')
    expect(mock.list).toHaveBeenCalledTimes(2)
  })

  it('加载更多按游标追加并去重', async () => {
    mock.list.mockResolvedValueOnce({ items: [row], nextCursor: 'n', hasMore: true })
      .mockResolvedValueOnce({ items: [{ ...row, id: '00000000-0000-4000-8000-000000000003', name: '管理员B', loginName: 'Admin.B' }], nextCursor: null, hasMore: false })
    await render()
    button('加载更多').click()
    await flushPromises()
    await nextTick()
    expect(mock.list).toHaveBeenLastCalledWith(project, 'n')
    expect(wrapper!.text()).toContain('管理员B')
  })

  it('详情入口导航到独立详情页', async () => {
    await render()
    button('详情').click()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe(`/admins/${admin}`)
  })

  it('项目切换后清空旧目录并读取新项目', async () => {
    const second = '00000000-0000-4000-8000-000000000004'
    mock.list.mockResolvedValueOnce({ items: [row], nextCursor: null, hasMore: false })
      .mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false })
    await render()
    expect(mock.list).toHaveBeenLastCalledWith(project, undefined, expect.any(AbortSignal))
    session.user = { accountId: project, currentProjectId: second, projectRole: 'OWNER', permissions: [] } as never
    session.projects = [{ id: second, myRole: 'OWNER', status: 'ACTIVE' }]
    await nextTick()
    await flushPromises()
    await nextTick()
    expect(mock.list).toHaveBeenLastCalledWith(second, undefined, expect.any(AbortSignal))
    expect(wrapper!.text()).toContain('管理员(0)')
    expect(wrapper!.text()).not.toContain('Admin.A')
  })
})
