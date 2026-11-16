import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { nextTick } from 'vue'
import { session } from '../../src/core/session'
import { ApiError, changeIdentity } from '../../src/core/http'
import ProjectMembersPage from '../../src/features/project-members/ProjectMembersPage.vue'

const mock = vi.hoisted(() => ({
  listMembers: vi.fn(), updateRole: vi.fn(), remove: vi.fn(), transferOwner: vi.fn(), leave: vi.fn(),
  listInvitations: vi.fn(), createInvitation: vi.fn(), resendInvitation: vi.fn(), revokeInvitation: vi.fn(),
  loadSession: vi.fn()
}))
vi.mock('../../src/features/project-members/project-member-api', async original => {
  const source = await original<typeof import('../../src/features/project-members/project-member-api')>()
  return { ...source, projectMemberApi: mock }
})
vi.mock('../../src/core/session', async original => {
  const source = await original<typeof import('../../src/core/session')>()
  return { ...source, loadSession: mock.loadSession }
})
const project = '00000000-0000-4000-8000-000000000001'
const self = '00000000-0000-4000-8000-000000000002', other = '00000000-0000-4000-8000-000000000003'
const owner = { accountId: self, email: 'owner@example.com', displayName: '所有者', role: 'OWNER', joinedAt: '2026-01-01T00:00:00Z' }
const operator = { accountId: other, email: 'op@example.com', displayName: '操作员', role: 'OPERATOR', joinedAt: '2026-01-02T00:00:00Z' }
const invitation = {
  id: '00000000-0000-4000-8000-000000000004', projectId: project, projectName: '项目A', targetEmail: 'invite@example.com',
  role: 'VIEWER', status: 'PENDING', revision: 1, expiresAt: '2026-01-03T00:00:00Z', deliveryChannel: 'EMAIL',
  deliveryStatus: 'SENT', createdAt: '2026-01-01T00:00:00Z', code: null
}
let wrapper: ReturnType<typeof mount> | undefined, router: Router

async function render() {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/project-members', component: ProjectMembersPage },
      { path: '/projects', component: { template: '<p>我的项目</p>' } }
    ]
  })
  await router.push('/project-members')
  await router.isReady()
  wrapper = mount(ProjectMembersPage, { attachTo: document.body, global: { plugins: [ElementPlus, router] } })
  await flushPromises(); await nextTick(); await flushPromises()
}
function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text && !item.closest('.hidden-columns'))
  if (!found) throw new Error(`缺少按钮：${text}`)
  return found
}
function setInput(label: string, value: string) {
  const el = document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null
  if (!el) throw new Error(`缺少输入：${label}`)
  el.value = value
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  Object.values(mock).forEach(fn => fn.mockReset())
  changeIdentity()
  session.ready = true
  session.transitioning = false
  session.user = { accountId: self, currentProjectId: project, projectRole: 'OWNER', permissions: ['member:read','member:invite','member:update_role','member:remove'] } as never
  session.projects = [{ id: project, myRole: 'OWNER', status: 'ACTIVE' }]
  mock.listMembers.mockResolvedValue([owner, operator])
  mock.listInvitations.mockResolvedValue({ items: [invitation], nextCursor: null, hasMore: false })
  mock.updateRole.mockResolvedValue(undefined); mock.remove.mockResolvedValue(undefined); mock.transferOwner.mockResolvedValue(undefined); mock.leave.mockResolvedValue(undefined)
  mock.createInvitation.mockResolvedValue(invitation); mock.resendInvitation.mockResolvedValue(invitation); mock.revokeInvitation.mockResolvedValue(undefined); mock.loadSession.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.restoreAllMocks(); wrapper?.unmount(); wrapper = undefined
  session.user = null; session.projects = []; document.body.innerHTML = ''
})

describe('项目成员与邀请页面', () => {
  it('显示成员、角色、加入时间和待接受邀请', async () => {
    await render()
    expect(wrapper!.text()).toContain('项目成员与邀请(2)')
    expect(wrapper!.text()).toContain('所有者')
    expect(wrapper!.text()).toContain('op@example.com')
    expect(wrapper!.text()).toContain('操作员')
    expect(wrapper!.text()).toContain('invite@example.com')
    expect(wrapper!.text()).toContain('项目成员是 ThingsLink 控制台身份')
    expect(mock.listMembers).toHaveBeenCalledWith(project)
  })

  it('无 member:read 显示禁止态且不请求', async () => {
    session.user = { accountId: self, currentProjectId: project, projectRole: 'OWNER', permissions: [] } as never
    await render()
    expect(wrapper!.text()).toContain('没有此内容的读取权限')
    expect(mock.listMembers).not.toHaveBeenCalled()
    expect(mock.listInvitations).not.toHaveBeenCalled()
  })

  it('修改角色按当前成员提交并重新读取', async () => {
    await render()
    button('修改角色').click(); await flushPromises(); await nextTick()
    button('保存').click(); await flushPromises(); await nextTick()
    expect(mock.updateRole).toHaveBeenCalledWith(project, other, 'OPERATOR')
    expect(mock.listMembers).toHaveBeenCalledTimes(2)
  })

  it('移除成员经确认后只解除项目关联', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await render()
    button('移除').click(); await flushPromises(); await nextTick()
    expect(confirm.mock.calls[0]?.[0]).toContain('不删除账号')
    expect(mock.remove).toHaveBeenCalledWith(project, other)
    expect(mock.listMembers).toHaveBeenCalledTimes(2)
  })

  it('创建邀请后重新读取邀请列表，不直接加入成员', async () => {
    await render()
    button('邀请成员').click(); await flushPromises()
    setInput('邀请成员邮箱', 'invite@example.com')
    button('创建邀请').click(); await flushPromises(); await nextTick()
    expect(mock.createInvitation).toHaveBeenCalledWith(project, { email: 'invite@example.com', role: 'OPERATOR' })
    expect(mock.listMembers).toHaveBeenCalledTimes(1)
    expect(mock.listInvitations).toHaveBeenCalledTimes(2)
  })

  it('撤回待接受邀请经确认后刷新', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await render()
    button('撤回').click(); await flushPromises(); await nextTick()
    expect(confirm).toHaveBeenCalled()
    expect(mock.revokeInvitation).toHaveBeenCalledWith(project, invitation.id)
    expect(mock.listInvitations).toHaveBeenCalledTimes(2)
  })

  it('转让所有权经确认后重新读取会话和成员', async () => {
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await render()
    button('转让所有权').click(); await flushPromises(); await nextTick()
    expect(confirm).toHaveBeenCalled()
    expect(mock.transferOwner).toHaveBeenCalledWith(project, other)
    expect(mock.loadSession).toHaveBeenCalled()
  })

  it('改角色结果未知时重新读取成员目录且不重发', async () => {
    mock.updateRole.mockRejectedValueOnce(new ApiError('响应丢失', 0, undefined, undefined, true))
    await render()
    button('修改角色').click(); await flushPromises(); await nextTick()
    button('保存').click(); await flushPromises(); await nextTick()
    expect(mock.updateRole).toHaveBeenCalledTimes(1)
    expect(mock.listMembers).toHaveBeenCalledTimes(2)
    expect(document.body.textContent).toContain('结果未知')
    expect(document.body.textContent).toContain('已重新读取成员目录核对')
  })

  it('移除成员结果未知时重新读取成员目录且不重发', async () => {
    mock.remove.mockRejectedValueOnce(new ApiError('响应丢失', 0, undefined, undefined, true))
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const warning = vi.spyOn(ElMessage, 'warning')
    await render()
    button('移除').click(); await flushPromises(); await nextTick()
    expect(mock.remove).toHaveBeenCalledTimes(1)
    expect(mock.listMembers).toHaveBeenCalledTimes(2)
    expect(warning.mock.calls[0]?.[0]).toContain('结果未知')
  })

  it('创建邀请结果未知时重新读取邀请列表且不重发', async () => {
    mock.createInvitation.mockRejectedValueOnce(new ApiError('响应丢失', 0, undefined, undefined, true))
    const warning = vi.spyOn(ElMessage, 'warning')
    await render()
    button('邀请成员').click(); await flushPromises()
    setInput('邀请成员邮箱', 'invite@example.com')
    button('创建邀请').click(); await flushPromises(); await nextTick()
    expect(mock.createInvitation).toHaveBeenCalledTimes(1)
    expect(mock.listInvitations).toHaveBeenCalledTimes(2)
    expect(mock.listMembers).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('结果未知')
    expect(warning).not.toHaveBeenCalled()
  })

  it('转让所有权结果未知时重新读取会话和成员目录', async () => {
    mock.transferOwner.mockRejectedValueOnce(new ApiError('响应丢失', 0, undefined, undefined, true))
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const warning = vi.spyOn(ElMessage, 'warning')
    await render()
    button('转让所有权').click(); await flushPromises(); await nextTick()
    expect(mock.transferOwner).toHaveBeenCalledTimes(1)
    expect(mock.loadSession).toHaveBeenCalledTimes(1)
    expect(mock.listMembers).toHaveBeenCalledTimes(2)
    expect(warning.mock.calls[0]?.[0]).toContain('结果未知')
  })

  it('退出结果未知时重新读取会话，仍是成员则刷新目录', async () => {
    session.user = { accountId: other, currentProjectId: project, projectRole: 'OPERATOR', permissions: ['member:read'] } as never
    session.projects = [{ id: project, myRole: 'OPERATOR', status: 'ACTIVE' }]
    mock.listMembers.mockResolvedValue([owner, { ...operator, accountId: other }])
    mock.leave.mockRejectedValueOnce(new ApiError('响应丢失', 0, undefined, undefined, true))
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const warning = vi.spyOn(ElMessage, 'warning')
    await render()
    button('退出项目').click(); await flushPromises(); await nextTick()
    expect(mock.leave).toHaveBeenCalledTimes(1)
    expect(mock.loadSession).toHaveBeenCalledTimes(1)
    expect(mock.listMembers).toHaveBeenCalledTimes(2)
    expect(router.currentRoute.value.path).toBe('/project-members')
    expect(warning.mock.calls[0]?.[0]).toContain('结果未知')
  })

  it('退出结果未知且会话已无该项目时返回项目列表', async () => {
    session.user = { accountId: other, currentProjectId: project, projectRole: 'OPERATOR', permissions: ['member:read'] } as never
    session.projects = [{ id: project, myRole: 'OPERATOR', status: 'ACTIVE' }]
    mock.listMembers.mockResolvedValue([owner, { ...operator, accountId: other }])
    mock.leave.mockRejectedValueOnce(new ApiError('响应丢失', 0, undefined, undefined, true))
    mock.loadSession.mockImplementationOnce(async () => { session.projects = [] })
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await render()
    button('退出项目').click(); await flushPromises(); await nextTick()
    expect(mock.leave).toHaveBeenCalledTimes(1)
    expect(mock.loadSession).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.path).toBe('/projects')
  })

  it('非所有者退出项目经确认后返回项目列表', async () => {
    session.user = { accountId: other, currentProjectId: project, projectRole: 'OPERATOR', permissions: ['member:read'] } as never
    session.projects = [{ id: project, myRole: 'OPERATOR', status: 'ACTIVE' }]
    mock.listMembers.mockResolvedValue([owner, { ...operator, accountId: other }])
    const confirm = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    await render()
    button('退出项目').click(); await flushPromises(); await nextTick()
    expect(confirm).toHaveBeenCalled()
    expect(mock.leave).toHaveBeenCalledWith(project)
    expect(router.currentRoute.value.path).toBe('/projects')
  })
})
