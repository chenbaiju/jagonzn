import { beforeEach, describe, expect, it, vi } from 'vitest'
import { projectMemberApi } from '../../src/features/project-members/project-member-api'

const mock = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('../../src/core/http', async original => ({ ...await original<typeof import('../../src/core/http')>(), api: mock.api }))
const project = '00000000-0000-4000-8000-000000000001', account = '00000000-0000-4000-8000-000000000002'
const member = { accountId: account, email: 'a@example.com', displayName: '张三', role: 'OPERATOR', joinedAt: '2026-01-01T00:00:00Z' }
const invitation = {
  id: '00000000-0000-4000-8000-000000000003', projectId: project, projectName: '项目A', targetEmail: 'b@example.com',
  role: 'VIEWER', status: 'PENDING', revision: 1, expiresAt: '2026-01-02T00:00:00Z', deliveryChannel: 'EMAIL',
  deliveryStatus: 'SENT', createdAt: '2026-01-01T00:00:00Z'
}

beforeEach(() => mock.api.mockReset())

describe('项目成员与邀请合同消费', () => {
  it('读取成员目录并解码角色与加入时间', async () => {
    mock.api.mockResolvedValueOnce([member])
    expect(await projectMemberApi.listMembers(project)).toEqual([member])
    expect(mock.api).toHaveBeenCalledWith(`/api/v1/projects/${project}/members`, { signal: undefined })
  })

  it('角色修改、移除、转让和退出使用正式方法和路径', async () => {
    mock.api.mockResolvedValue(undefined)
    await projectMemberApi.updateRole(project, account, 'ADMIN')
    expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/members/${account}`, { method: 'patch', body: { role: 'ADMIN' }, signal: undefined })
    await projectMemberApi.remove(project, account)
    expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/members/${account}`, { method: 'delete', signal: undefined })
    await projectMemberApi.transferOwner(project, account)
    expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/members/${account}/transfer-owner`, { method: 'post', signal: undefined })
    await projectMemberApi.leave(project)
    expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/members/me`, { method: 'delete', signal: undefined })
    await expect(projectMemberApi.updateRole(project, account, 'OWNER' as never)).rejects.toThrow('角色无效')
  })

  it('邀请分页、创建、重发和撤回使用正式合同', async () => {
    mock.api.mockResolvedValueOnce({ items: [invitation], nextCursor: 'next', hasMore: true })
    const page = await projectMemberApi.listInvitations(project, undefined)
    expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/invitations`, { query: { limit: 20 }, signal: undefined })
    expect(page.items[0]!.code).toBeNull()
    mock.api.mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false })
    await projectMemberApi.listInvitations(project, 'cursor-1')
    expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/invitations`, { query: { limit: 20, cursor: 'cursor-1' }, signal: undefined })
    mock.api.mockResolvedValueOnce(invitation)
    expect(await projectMemberApi.createInvitation(project, { email: ' b@example.com ', role: 'VIEWER' })).toMatchObject({ targetEmail: 'b@example.com', role: 'VIEWER' })
    expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/invitations`, { method: 'post', body: { email: 'b@example.com', role: 'VIEWER' }, signal: undefined })
    mock.api.mockResolvedValueOnce({ ...invitation, deliveryStatus: 'RESENT' })
    await projectMemberApi.resendInvitation(project, invitation.id)
    expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/invitations/${invitation.id}/resend`, { method: 'post', signal: undefined })
    mock.api.mockResolvedValueOnce(undefined)
    await projectMemberApi.revokeInvitation(project, invitation.id)
    expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/invitations/${invitation.id}`, { method: 'delete', signal: undefined })
  })

  it('坏成员角色、坏邀请版本和缺失续页游标拒绝', async () => {
    mock.api.mockResolvedValueOnce([{ ...member, role: 'SUPER' }])
    await expect(projectMemberApi.listMembers(project)).rejects.toThrow('项目成员角色无效')
    mock.api.mockResolvedValueOnce({ items: [{ ...invitation, revision: 1.5 }], nextCursor: null, hasMore: false })
    await expect(projectMemberApi.listInvitations(project, undefined)).rejects.toThrow('项目邀请版本无效')
    mock.api.mockResolvedValueOnce({ items: [invitation], nextCursor: null, hasMore: true })
    await expect(projectMemberApi.listInvitations(project, undefined)).rejects.toThrow('续页游标')
  })
})
