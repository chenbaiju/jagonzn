import {api} from '@/core/http'
import {
  decodeAdmin,
  decodeAdminPage,
  isUuid,
  validatePassword,
  validateRevision,
  type ApplicationAdmin,
  type ApplicationAdminPage,
  type ApplicationAdminStatus,
  type CreateAdminInput,
  type UpdateAdminInput
} from './application-admin-model'

type AdminBase = `/api/v1/projects/${string}/application-admins`
type AdminTarget = `${AdminBase}/${string}`
const base = (project: string): AdminBase => {
  if (!isUuid(project)) throw new Error('请选择当前项目')
  return `/api/v1/projects/${project}/application-admins`
}
const target = (project: string, adminId: string): AdminTarget => {
  if (!isUuid(adminId)) throw new Error('应用管理员 ID 格式无效')
  return `${base(project)}/${adminId}`
}
const keyPattern = /^.{1,128}$/s

export const applicationAdminApi = {
  async list(project: string, cursor: string | undefined, signal?: AbortSignal): Promise<ApplicationAdminPage> {
    return decodeAdminPage(await api<unknown>(base(project), { query: { limit: 20, ...(cursor ? { cursor } : {}) }, signal }))
  },

  async get(project: string, adminId: string, signal?: AbortSignal): Promise<ApplicationAdmin> {
    return decodeAdmin(await api<unknown>(target(project, adminId), { signal }))
  },

  async create(project: string, input: CreateAdminInput, idempotencyKey: string, signal?: AbortSignal): Promise<ApplicationAdmin> {
    if (typeof idempotencyKey !== 'string' || !keyPattern.test(idempotencyKey)) throw new Error('创建幂等键无效')
    return decodeAdmin(await api<unknown>(base(project), {
      method: 'post', body: input, headers: { 'Idempotency-Key': idempotencyKey }, signal
    }))
  },

  async update(project: string, adminId: string, input: UpdateAdminInput, signal?: AbortSignal): Promise<ApplicationAdmin> {
    return decodeAdmin(await api<unknown>(target(project, adminId), { method: 'put', body: input, signal }))
  },

  async changeStatus(project: string, adminId: string, status: ApplicationAdminStatus, expectedRevision: string, signal?: AbortSignal): Promise<ApplicationAdmin> {
    if (status !== 'ACTIVE' && status !== 'DISABLED') throw new Error('应用管理员状态只能为 ACTIVE 或 DISABLED')
    return decodeAdmin(await api<unknown>(`${target(project, adminId)}/status`, {
      method: 'patch', body: { status, expectedRevision: validateRevision(expectedRevision) }, signal
    }))
  },

  async resetPassword(project: string, adminId: string, password: string, expectedRevision: string, signal?: AbortSignal): Promise<ApplicationAdmin> {
    return decodeAdmin(await api<unknown>(`${target(project, adminId)}/password`, {
      method: 'put', body: { password: validatePassword(password), expectedRevision: validateRevision(expectedRevision) }, signal
    }))
  },

  async delete(project: string, adminId: string, expectedRevision: string, signal?: AbortSignal): Promise<void> {
    await api<void>(target(project, adminId), { method: 'delete', query: { expectedRevision: validateRevision(expectedRevision) }, signal })
  }
}
