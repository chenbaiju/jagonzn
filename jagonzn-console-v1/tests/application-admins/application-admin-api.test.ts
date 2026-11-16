import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applicationAdminApi } from '../../src/features/application-admins/application-admin-api'
import { createInput, emptyDraft, validateCreateDraft } from '../../src/features/application-admins/application-admin-model'

const mock = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('../../src/core/http', async original => ({ ...await original<typeof import('../../src/core/http')>(), api: mock.api }))
const project = '00000000-0000-4000-8000-000000000001', admin = '00000000-0000-4000-8000-000000000002'
const permissions = {
  operateDevice: true, editDeviceInfo: false, viewDeviceCertificate: false, editDeviceGroup: false,
  toggleDeviceSchedule: false, toggleDeviceAlarmRule: false, createUser: false, editUserInfo: false,
  resetUserPassword: false, editUserStatus: false, assignUserDevice: false, assignUserDashboard: false
}
const row = {
  id: admin, name: '管理员A', loginName: 'Admin.A', permissions,
  email: null, phone: null, description: null, tags: [{ name: '部门', value: '品控' }],
  status: 'ACTIVE', revision: '0', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z'
}

beforeEach(() => mock.api.mockReset())

describe('应用管理员目录合同消费', () => {
  it('使用项目目录路径、20条游标页并解码12项权限', async () => {
    mock.api.mockResolvedValueOnce({ items: [row], nextCursor: 'next', hasMore: true })
    const page = await applicationAdminApi.list(project, undefined)
    expect(mock.api).toHaveBeenCalledWith(`/api/v1/projects/${project}/application-admins`, { query: { limit: 20 }, signal: undefined })
    expect(page.items[0]).toMatchObject({ id: admin, name: '管理员A', loginName: 'Admin.A', revision: '0', email: null })
    expect(page.items[0]!.permissions.operateDevice).toBe(true)
    expect(page.nextCursor).toBe('next')
  })

  it('续页传递不透明游标', async () => {
    mock.api.mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false })
    await applicationAdminApi.list(project, 'cursor-1')
    expect(mock.api).toHaveBeenCalledWith(`/api/v1/projects/${project}/application-admins`, { query: { limit: 20, cursor: 'cursor-1' }, signal: undefined })
  })

  it('缺失权限、额外权限、坏时间或缺失续页游标拒绝', async () => {
    mock.api.mockResolvedValueOnce({ items: [{ ...row, permissions: { operateDevice: true } }], nextCursor: null, hasMore: false })
    await expect(applicationAdminApi.list(project, undefined)).rejects.toThrow('权限必须为12项')
    mock.api.mockResolvedValueOnce({ items: [{ ...row, permissions: { ...permissions, future: true } }], nextCursor: null, hasMore: false })
    await expect(applicationAdminApi.list(project, undefined)).rejects.toThrow('权限必须为12项')
    mock.api.mockResolvedValueOnce({ items: [{ ...row, createdAt: 'bad' }], nextCursor: null, hasMore: false })
    await expect(applicationAdminApi.list(project, undefined)).rejects.toThrow('创建时间格式无效')
    mock.api.mockResolvedValueOnce({ items: [row], nextCursor: null, hasMore: true })
    await expect(applicationAdminApi.list(project, undefined)).rejects.toThrow('续页游标')
  })

  it('创建携带幂等键并拒绝空键或非法输入', async () => {
    const draft = { ...emptyDraft(), name: ' 管理员A ', loginName: ' Admin.A ', password: 'Admin-Secret-123', email: ' a@example.com ' }
    const input = createInput(draft)
    mock.api.mockResolvedValueOnce(row)
    await applicationAdminApi.create(project, input, 'key-1')
    expect(mock.api).toHaveBeenCalledWith(`/api/v1/projects/${project}/application-admins`, {
      method: 'post', body: input, headers: { 'Idempotency-Key': 'key-1' }, signal: undefined
    })
    await expect(applicationAdminApi.create(project, input, '')).rejects.toThrow('幂等键无效')
    expect(validateCreateDraft({ ...draft, loginName: 'bad login' })).toContain('登录名')
    expect(validateCreateDraft({ ...draft, password: 'short' })).toContain('8至128')
    expect(validateCreateDraft({ ...draft, tags: [{ name: '', value: '值无名称' }] })).toContain('标签名称')
  })

  it('详情、编辑、状态、改密和软删使用正式方法和路径', async () => {
    mock.api.mockResolvedValue(row)
    await applicationAdminApi.get(project, admin)
    expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/application-admins/${admin}`, { signal: undefined })
    const update = { name: '管理员B', permissions, email: null, phone: null, description: null, tags: [], expectedRevision: '1' }
    await applicationAdminApi.update(project, admin, update)
    expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/application-admins/${admin}`, { method: 'put', body: update, signal: undefined })
    await applicationAdminApi.changeStatus(project, admin, 'DISABLED', '2')
    expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/application-admins/${admin}/status`, { method: 'patch', body: { status: 'DISABLED', expectedRevision: '2' }, signal: undefined })
    await applicationAdminApi.resetPassword(project, admin, 'Reset-Secret-456', '3')
    expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/application-admins/${admin}/password`, { method: 'put', body: { password: 'Reset-Secret-456', expectedRevision: '3' }, signal: undefined })
    mock.api.mockResolvedValueOnce(undefined)
    await applicationAdminApi.delete(project, admin, '4')
    expect(mock.api).toHaveBeenLastCalledWith(`/api/v1/projects/${project}/application-admins/${admin}`, { method: 'delete', query: { expectedRevision: '4' }, signal: undefined })
  })
})
