import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import { session } from '../../src/core/session'
import { ApiError, changeIdentity } from '../../src/core/http'
import ApplicationAdminDetailPage from '../../src/features/application-admins/ApplicationAdminDetailPage.vue'

const mock = vi.hoisted(() => ({
  list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), changeStatus: vi.fn(), resetPassword: vi.fn(), delete: vi.fn()
}))
vi.mock('../../src/features/application-admins/application-admin-api', async original => {
  const source = await original<typeof import('../../src/features/application-admins/application-admin-api')>()
  return { ...source, applicationAdminApi: mock }
})
const project = '00000000-0000-4000-8000-000000000001', admin = '00000000-0000-4000-8000-000000000002'
const permissions = {
  operateDevice: true, editDeviceInfo: false, viewDeviceCertificate: false, editDeviceGroup: false,
  toggleDeviceSchedule: false, toggleDeviceAlarmRule: false, createUser: true, editUserInfo: false,
  resetUserPassword: false, editUserStatus: false, assignUserDevice: false, assignUserDashboard: false
}
const row = {
  id: admin, name: '管理员A', loginName: 'Admin.A', permissions,
  email: 'admin@example.com', phone: '13800000000', description: '项目级管理员', tags: [{ name: '部门', value: '品控' }],
  status: 'ACTIVE', revision: '0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
}
let wrapper: ReturnType<typeof mount> | undefined, router: Router

async function render() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admins', component: { template: '<p>管理员目录</p>' } },
      { path: '/admins/:adminId', component: ApplicationAdminDetailPage }
    ]
  })
  await router.push(`/admins/${admin}`)
  await router.isReady()
  wrapper = mount(ApplicationAdminDetailPage, { attachTo: document.body, global: { plugins: [ElementPlus, router] } })
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

beforeEach(() => {
  Object.values(mock).forEach(fn => fn.mockReset())
  sessionStorage.clear()
  changeIdentity()
  session.ready = true
  session.transitioning = false
  session.user = { accountId: project, currentProjectId: project, projectRole: 'OWNER', permissions: [] } as never
  session.projects = [{ id: project, myRole: 'OWNER', status: 'ACTIVE' }]
  mock.get.mockResolvedValue(row)
  mock.update.mockResolvedValue({ ...row, name: '管理员B', revision: '1' })
  mock.changeStatus.mockResolvedValue({ ...row, status: 'DISABLED', revision: '1' })
  mock.resetPassword.mockResolvedValue({ ...row, revision: '1' })
  mock.delete.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  wrapper?.unmount()
  wrapper = undefined
  session.user = null
  session.projects = []
  document.body.innerHTML = ''
})

describe('应用管理员详情与编辑', () => {
  it('回读资料、标签和12项权限，并标明权限只是配置证据', async () => {
    await render()
    expect(mock.get).toHaveBeenCalledWith(project, admin, expect.any(AbortSignal))
    expect(wrapper!.text()).toContain('管理员A')
    expect(wrapper!.text()).toContain('Admin.A')
    expect(wrapper!.text()).toContain('admin@example.com')
    expect(wrapper!.text()).toContain('部门：品控')
    expect(wrapper!.text()).toContain('操作设备')
    expect(wrapper!.text()).toContain('给用户分配看板')
    expect(wrapper!.text()).toContain('权限位当前只作为账号配置保存和回读')
  })

  it('编辑按最近读取的 revision 保存并回读', async () => {
    mock.get.mockResolvedValueOnce(row).mockResolvedValue({ ...row, name: '管理员B', revision: '1' })
    await render()
    button('编辑').click()
    await flushPromises()
    setInput('管理员名称', '管理员B')
    button('保存').click()
    await flushPromises()
    await nextTick()
    expect(mock.update).toHaveBeenCalledWith(project, admin, expect.objectContaining({ name: '管理员B', expectedRevision: '0' }))
    expect(mock.update).toHaveBeenCalledTimes(1)
    expect(wrapper!.text()).toContain('管理员B')
  })

  it('编辑取消有未保存内容时确认后丢弃，不发写请求', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await render()
    button('编辑').click()
    await flushPromises()
    setInput('管理员名称', '未保存草稿')
    button('取消').click()
    await flushPromises()
    await nextTick()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(mock.update).not.toHaveBeenCalled()
    expect(wrapper!.text()).toContain('管理员A')
  })

  it('CAS 冲突停止保存、不覆盖他人修改，并允许重新读取', async () => {
    mock.update.mockRejectedValueOnce(new ApiError('版本冲突', 409, 60073))
    await render()
    button('编辑').click()
    await flushPromises()
    setInput('管理员名称', '管理员B')
    button('保存').click()
    await flushPromises()
    await nextTick()
    expect(wrapper!.text()).toContain('保存被拒绝')
    expect(mock.update).toHaveBeenCalledTimes(1)
    expect(button('保存').disabled).toBe(true)
    button('重新读取最新资料').click()
    await flushPromises()
    expect(wrapper!.text()).toContain('管理员A')
  })

  it('停用按当前 revision 提交并重新读取', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await render()
    button('停用').click()
    await flushPromises()
    await nextTick()
    expect(mock.changeStatus).toHaveBeenCalledWith(project, admin, 'DISABLED', '0')
    expect(mock.get).toHaveBeenCalledTimes(2)
  })

  it('重设密码不回显新口令并按 revision 提交', async () => {
    await render()
    button('重设密码').click()
    await flushPromises()
    setInput('新管理员密码', 'Reset-Secret-456')
    setInput('确认新管理员密码', 'Reset-Secret-456')
    button('确认重设').click()
    await flushPromises()
    await nextTick()
    expect(mock.resetPassword).toHaveBeenCalledWith(project, admin, 'Reset-Secret-456', '0')
    expect(document.body.textContent || '').not.toContain('Reset-Secret-456')
  })

  it('两次新密码不一致时本地拒绝', async () => {
    await render()
    button('重设密码').click()
    await flushPromises()
    setInput('新管理员密码', 'Reset-Secret-456')
    setInput('确认新管理员密码', 'Reset-Secret-789')
    button('确认重设').click()
    await flushPromises()
    expect(mock.resetPassword).not.toHaveBeenCalled()
    expect(document.body.textContent || '').toContain('两次输入的新密码不一致')
  })

  it('删除经确认后软删并返回目录', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await render()
    button('删除').click()
    await flushPromises()
    await nextTick()
    expect(mock.delete).toHaveBeenCalledWith(project, admin, '0')
    expect(router.currentRoute.value.path).toBe('/admins')
  })

  it('非 OWNER/ADMIN 显示禁止态且不读取详情', async () => {
    session.user = { accountId: project, currentProjectId: project, projectRole: 'OPERATOR', permissions: [] } as never
    session.projects = [{ id: project, myRole: 'OPERATOR', status: 'ACTIVE' }]
    await render()
    expect(wrapper!.text()).toContain('没有此内容的读取权限')
    expect(mock.get).not.toHaveBeenCalled()
  })
})
