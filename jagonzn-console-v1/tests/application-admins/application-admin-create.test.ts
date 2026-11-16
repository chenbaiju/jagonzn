import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import { session } from '../../src/core/session'
import { ApiError, changeIdentity, identityEpoch } from '../../src/core/http'
import ApplicationAdminCreatePage from '../../src/features/application-admins/ApplicationAdminCreatePage.vue'
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
  operateDevice: true, editDeviceInfo: true, viewDeviceCertificate: true, editDeviceGroup: true,
  toggleDeviceSchedule: true, toggleDeviceAlarmRule: true, createUser: true, editUserInfo: true,
  resetUserPassword: true, editUserStatus: true, assignUserDevice: true, assignUserDashboard: true
}
const row = {
  id: admin, name: '管理员A', loginName: 'Admin.A', permissions,
  email: null, phone: null, description: null, tags: [], status: 'ACTIVE', revision: '0',
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
}
let wrapper: ReturnType<typeof mount> | undefined, router: Router

async function render() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admins', component: { template: '<p>管理员目录</p>' } },
      { path: '/admins/:adminId', component: { template: '<p>管理员详情</p>' } },
      { path: '/admin_add', component: ApplicationAdminCreatePage }
    ]
  })
  await router.push('/admin_add')
  await router.isReady()
  wrapper = mount(ApplicationAdminCreatePage, { attachTo: document.body, global: { plugins: [ElementPlus, router] } })
  await flushPromises()
  await nextTick()
  await flushPromises()
}
function setInput(label: string, value: string) {
  const el = document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null
  if (!el) throw new Error(`缺少输入：${label}`)
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text)
  if (!found) throw new Error(`缺少按钮：${text}`)
  return found
}
function clickCheckbox(text: string) {
  const label = [...document.querySelectorAll<HTMLElement>('.el-checkbox__label')].find(item => item.textContent?.trim() === text)
  if (!label) throw new Error(`缺少复选项：${text}`)
  label.click()
}

beforeEach(() => {
  Object.values(mock).forEach(fn => fn.mockReset())
  sessionStorage.clear()
  changeIdentity()
  session.ready = true
  session.transitioning = false
  session.user = { accountId: project, currentProjectId: project, projectRole: 'OWNER', permissions: [] } as never
  session.projects = [{ id: project, myRole: 'OWNER', status: 'ACTIVE' }]
  mock.create.mockResolvedValue(row)
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

describe('创建应用管理员', () => {
  it('按原站字段创建并携带幂等键，成功后进入详情回读', async () => {
    await render()
    setInput('管理员名称', '管理员A')
    setInput('管理员登录名', 'Admin.A')
    setInput('管理员登录密码', 'Admin-Secret-123')
    setInput('管理员邮箱', 'admin@example.com')
    setInput('标签名称 1', '部门')
    setInput('标签值 1', '品控')
    clickCheckbox('全选')
    await nextTick()
    button('创建').click()
    await flushPromises()
    await nextTick()
    expect(mock.create).toHaveBeenCalledTimes(1)
    const [calledProject, input, key] = mock.create.mock.calls[0]!
    expect(calledProject).toBe(project)
    expect(key).toEqual(expect.any(String))
    expect(input).toMatchObject({ name: '管理员A', loginName: 'Admin.A', email: 'admin@example.com', tags: [{ name: '部门', value: '品控' }] })
    expect(input.permissions).toEqual(permissions)
    expect(input.password).toBe('Admin-Secret-123')
    expect(router.currentRoute.value.path).toBe(`/admins/${admin}`)
  })

  it('单项权限按12位结构提交，未选项保持 false', async () => {
    await render()
    setInput('管理员名称', '管理员A')
    setInput('管理员登录名', 'Admin.A')
    setInput('管理员登录密码', 'Admin-Secret-123')
    clickCheckbox('操作设备')
    await nextTick()
    expect(wrapper!.text()).toContain('已选 1/12')
    button('创建').click()
    await flushPromises()
    const input = mock.create.mock.calls[0]![1]
    expect(input.permissions).toEqual({ ...permissions, operateDevice: true, editDeviceInfo: false, viewDeviceCertificate: false, editDeviceGroup: false, toggleDeviceSchedule: false, toggleDeviceAlarmRule: false, createUser: false, editUserInfo: false, resetUserPassword: false, editUserStatus: false, assignUserDevice: false, assignUserDashboard: false })
  })

  it('登录名重复的明确拒绝显示冲突且不自动重试', async () => {
    mock.create.mockRejectedValueOnce(new ApiError('登录名已存在', 409, 60071))
    await render()
    setInput('管理员名称', '管理员A')
    setInput('管理员登录名', 'Admin.A')
    setInput('管理员登录密码', 'Admin-Secret-123')
    button('创建').click()
    await flushPromises()
    await nextTick()
    expect(wrapper!.text()).toContain('登录名已存在')
    expect(mock.create).toHaveBeenCalledTimes(1)
  })

  it('创建结果未知时只持久化最小上下文并禁止自动重试', async () => {
    mock.create.mockRejectedValueOnce(new ApiError('响应丢失', 0, undefined, undefined, true))
    await render()
    setInput('管理员名称', '管理员A')
    setInput('管理员登录名', 'Admin.A')
    setInput('管理员登录密码', 'Admin-Secret-123')
    setInput('管理员邮箱', 'admin@example.com')
    setInput('标签名称 1', '部门')
    setInput('标签值 1', '品控')
    clickCheckbox('操作设备')
    await nextTick()
    button('创建').click()
    await flushPromises()
    await nextTick()
    expect(mock.create).toHaveBeenCalledTimes(1)
    expect(wrapper!.text()).toContain('创建结果未知')
    const raw = sessionStorage.getItem(`tl.application-admin.create-recovery.${project}`) || ''
    expect(raw).toContain('Admin.A')
    for (const value of ['Admin-Secret-123','admin@example.com','部门','品控','operateDevice','permissions','email','password'])
      expect(raw).not.toContain(value)
    expect(button('创建').disabled).toBe(true)
  })

  it('重新进入创建页只回填登录名，表单内容与口令留空', async () => {
    saveAdminCreateRecovery({
      version: 1, projectId: project, accountId: project, sessionEpoch: identityEpoch(),
      idempotencyKey: 'key-1', loginName: 'Admin.A', requestedAt: new Date().toISOString()
    })
    await render()
    expect(wrapper!.text()).toContain('有一次创建结果未确认')
    expect((document.querySelector('input[aria-label="管理员登录名"]') as HTMLInputElement).value).toBe('Admin.A')
    expect((document.querySelector('input[aria-label="管理员名称"]') as HTMLInputElement).value).toBe('')
    expect((document.querySelector('input[aria-label="管理员登录密码"]') as HTMLInputElement).value).toBe('')
    expect((document.querySelector('input[aria-label="管理员邮箱"]') as HTMLInputElement).value).toBe('')
    expect(button('创建').disabled).toBe(true)
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    button('清除恢复记录并重新开始').click()
    await flushPromises()
    await nextTick()
    expect(sessionStorage.getItem(`tl.application-admin.create-recovery.${project}`)).toBeNull()
    expect(button('创建').disabled).toBe(false)
  })

  it('刷新后只保留登录名和时间提示，提交不重新开放', async () => {
    sessionStorage.setItem(`tl.application-admin.create-recovery.${project}`, JSON.stringify({
      version: 1, projectId: project, accountId: project, loginName: 'Admin.A', requestedAt: new Date().toISOString()
    }))
    await render()
    expect(wrapper!.text()).toContain('有一次创建结果未确认')
    expect(wrapper!.text()).toContain('页面已重新加载')
    expect(wrapper!.text()).toContain('不会自动重发')
    expect((document.querySelector('input[aria-label="管理员登录名"]') as HTMLInputElement).value).toBe('Admin.A')
    expect((document.querySelector('input[aria-label="管理员名称"]') as HTMLInputElement).value).toBe('')
    expect((document.querySelector('input[aria-label="管理员登录密码"]') as HTMLInputElement).value).toBe('')
    expect(button('创建').disabled).toBe(true)
    expect(mock.create).not.toHaveBeenCalled()
  })

  it('退出或切换身份后不再展示旧恢复记录', async () => {
    saveAdminCreateRecovery({
      version: 1, projectId: project, accountId: project, sessionEpoch: identityEpoch(),
      idempotencyKey: 'key-1', loginName: 'Admin.A', requestedAt: new Date().toISOString()
    })
    await render()
    expect(wrapper!.text()).toContain('有一次创建结果未确认')
    changeIdentity()
    await nextTick()
    await flushPromises()
    expect(wrapper!.text()).not.toContain('有一次创建结果未确认')
    expect(button('创建').disabled).toBe(false)
  })

  it('有未提交内容时取消需确认并返回目录', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await render()
    setInput('管理员名称', '未提交草稿')
    button('取消').click()
    await flushPromises()
    await nextTick()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/admins')
    expect(mock.create).not.toHaveBeenCalled()
  })

  it('非 OWNER/ADMIN 显示禁止态且不提交', async () => {
    session.user = { accountId: project, currentProjectId: project, projectRole: 'VIEWER', permissions: [] } as never
    session.projects = [{ id: project, myRole: 'VIEWER', status: 'ACTIVE' }]
    await render()
    expect(wrapper!.text()).toContain('没有此内容的读取权限')
    expect(mock.create).not.toHaveBeenCalled()
  })

  it('短口令在本地拒绝，不发请求', async () => {
    await render()
    setInput('管理员名称', '管理员A')
    setInput('管理员登录名', 'Admin.A')
    setInput('管理员登录密码', 'short')
    button('创建').click()
    await flushPromises()
    expect(wrapper!.text()).toContain('8至128')
    expect(mock.create).not.toHaveBeenCalled()
  })
})
