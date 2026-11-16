import { beforeEach, describe, expect, it, vi } from 'vitest'
import { changeIdentity, identityEpoch } from '../../src/core/http'
import {
  ADMIN_CREATE_RECOVERY_TTL_MS,
  clearAdminCreateRecovery,
  readAdminCreateRecovery,
  saveAdminCreateRecovery,
  type AdminCreateRecovery
} from '../../src/features/application-admins/application-admin-recovery'

const project = '00000000-0000-4000-8000-000000000001'
const account = '00000000-0000-4000-8000-000000000002'
const other = '00000000-0000-4000-8000-000000000003'
const requestedAt = new Date().toISOString()
const now = Date.parse(requestedAt)
const record: AdminCreateRecovery = {
  version: 1, projectId: project, accountId: account, sessionEpoch: 4,
  idempotencyKey: 'key-1', loginName: 'Admin.A', requestedAt
}
const key = `tl.application-admin.create-recovery.${project}`

beforeEach(() => sessionStorage.clear())

describe('创建未知结果恢复记录最小化', () => {
  it('只持久化项目、操作者、会话、登录名、幂等键和请求时间', () => {
    expect(saveAdminCreateRecovery(record)).toBe(true)
    const raw = JSON.parse(sessionStorage.getItem(key) || '{}')
    expect(Object.keys(raw).sort()).toEqual(['accountId','idempotencyKey','loginName','projectId','requestedAt','runtimeId','sessionEpoch','version'])
    expect(readAdminCreateRecovery(project, account, 4, now)).toEqual(record)
  })

  it('调用方传入的邮箱、标签、权限和口令不会落盘', () => {
    const withForm = {
      ...record, email: 'admin@example.com', phone: '13800000000', description: '描述',
      tags: [{ name: '部门', value: '品控' }], permissions: { operateDevice: true }, password: 'Admin-Secret-123'
    } as unknown as AdminCreateRecovery
    expect(saveAdminCreateRecovery(withForm)).toBe(true)
    const raw = sessionStorage.getItem(key) || ''
    for (const secret of ['admin@example.com','13800000000','描述','部门','品控','operateDevice','permissions','password','Admin-Secret-123'])
      expect(raw).not.toContain(secret)
  })

  it('更换账号后不读取并删除旧记录', () => {
    saveAdminCreateRecovery(record)
    expect(readAdminCreateRecovery(project, other, 4, now)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('同一运行态中计数不同（退出重登/同账号新会话）不读取并删除旧记录', () => {
    saveAdminCreateRecovery(record)
    expect(readAdminCreateRecovery(project, account, 5, now)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
    saveAdminCreateRecovery({ ...record, sessionEpoch: identityEpoch() })
    changeIdentity()
    expect(readAdminCreateRecovery(project, account, identityEpoch(), now)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('应用重新初始化后计数相同也只降级为登录名和时间提示，幂等键立即丢弃', async () => {
    saveAdminCreateRecovery({ ...record, sessionEpoch: 0 })
    vi.resetModules()
    const fresh = await import('../../src/features/application-admins/application-admin-recovery')
    expect(fresh.readAdminCreateRecovery(project, account, 0, now)).toEqual({
      version: 1, projectId: project, accountId: account, sessionEpoch: null,
      idempotencyKey: null, loginName: 'Admin.A', requestedAt
    })
    const raw = sessionStorage.getItem(key) || ''
    expect(raw).toContain('Admin.A')
    expect(raw).not.toContain('runtimeId')
    expect(raw).not.toContain('idempotencyKey')
    expect(raw).not.toContain('sessionEpoch')
    expect(fresh.readAdminCreateRecovery(project, account, 0, now)).toMatchObject({ loginName: 'Admin.A', idempotencyKey: null })
  })

  it('降级提示只允许最小字段，混入幂等键或会话计数视为坏记录', () => {
    const minimal = { version: 1, projectId: project, accountId: account, loginName: 'Admin.A', requestedAt }
    sessionStorage.setItem(key, JSON.stringify({ ...minimal, idempotencyKey: 'key-1' }))
    expect(readAdminCreateRecovery(project, account, 0, now)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
    sessionStorage.setItem(key, JSON.stringify({ ...minimal, sessionEpoch: 0 }))
    expect(readAdminCreateRecovery(project, account, 0, now)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('降级提示同样受账号、项目和有效期约束', async () => {
    saveAdminCreateRecovery({ ...record, sessionEpoch: 0 })
    vi.resetModules()
    const fresh = await import('../../src/features/application-admins/application-admin-recovery')
    expect(fresh.readAdminCreateRecovery(project, other, 0, now)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
    saveAdminCreateRecovery({ ...record, sessionEpoch: 0 })
    vi.resetModules()
    const expired = await import('../../src/features/application-admins/application-admin-recovery')
    expect(expired.readAdminCreateRecovery(project, account, 0, now + ADMIN_CREATE_RECOVERY_TTL_MS + 1)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('换项目后不读取旧项目记录，旧项目记录仍保持最小上下文', () => {
    saveAdminCreateRecovery(record)
    const otherProject = '00000000-0000-4000-8000-000000000005'
    expect(readAdminCreateRecovery(otherProject, account, 4, now)).toBeNull()
    expect(sessionStorage.getItem(key)).not.toBeNull()
    expect(readAdminCreateRecovery(project, account, 4, now)).toEqual(record)
  })

  it('超过有效期后不读取并删除旧记录', () => {
    saveAdminCreateRecovery(record)
    expect(readAdminCreateRecovery(project, account, 4, now + ADMIN_CREATE_RECOVERY_TTL_MS + 1)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('未来请求时间、坏 JSON 或非法上下文不会被恢复', () => {
    saveAdminCreateRecovery(record)
    const stored = JSON.parse(sessionStorage.getItem(key) || '{}')
    sessionStorage.setItem(key, JSON.stringify({ ...stored, requestedAt: new Date(now + 120_000).toISOString() }))
    expect(readAdminCreateRecovery(project, account, 4, now)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
    sessionStorage.setItem(key, '{bad json')
    expect(readAdminCreateRecovery(project, account, 4, now)).toBeNull()
    expect(saveAdminCreateRecovery({ ...record, loginName: 'bad login' })).toBe(false)
    clearAdminCreateRecovery(project)
    expect(sessionStorage.getItem(key)).toBeNull()
  })
})
