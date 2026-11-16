import { api } from '@/core/http'

export type ProjectRole = 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER'
export type AssignableRole = Exclude<ProjectRole, 'OWNER'>
export type ProjectMember = Readonly<{
  accountId: string
  email: string
  displayName: string
  role: ProjectRole
  joinedAt: string
}>
export type ProjectInvitation = Readonly<{
  id: string
  projectId: string
  projectName: string
  targetEmail: string
  role: ProjectRole
  status: string
  revision: number
  expiresAt: string
  deliveryChannel: string
  deliveryStatus: string
  createdAt: string
  code: string | null
}>
export type InvitationPage = Readonly<{ items: readonly ProjectInvitation[]; nextCursor: string | null; hasMore: boolean }>

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const roles: readonly ProjectRole[] = ['OWNER','ADMIN','OPERATOR','VIEWER']
const assignable: readonly AssignableRole[] = ['ADMIN','OPERATOR','VIEWER']
const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}响应不完整`)
  return value as Record<string, unknown>
}
function text(value: unknown, label: string, maximum = 255): string {
  if (typeof value !== 'string' || !value || value.length > maximum) throw new Error(`${label}格式无效`)
  return value
}
function role(value: unknown): ProjectRole {
  if (typeof value !== 'string' || !roles.includes(value as ProjectRole)) throw new Error('项目成员角色无效')
  return value as ProjectRole
}
function dateTime(value: unknown, label: string): string {
  if (typeof value !== 'string' || !time.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${label}格式无效`)
  return value
}
function member(value: unknown): ProjectMember {
  const row = object(value, '项目成员')
  if (typeof row.accountId !== 'string' || !uuid.test(row.accountId)) throw new Error('项目成员账号 ID 无效')
  if (typeof row.joinedAt !== 'string') throw new Error('项目成员加入时间格式无效')
  return Object.freeze({
    accountId: row.accountId,
    email: text(row.email, '项目成员邮箱', 254),
    displayName: text(row.displayName, '项目成员显示名', 128),
    role: role(row.role),
    joinedAt: row.joinedAt
  })
}
function invitation(value: unknown): ProjectInvitation {
  const row = object(value, '项目邀请')
  if (typeof row.id !== 'string' || !uuid.test(row.id) || typeof row.projectId !== 'string' || !uuid.test(row.projectId)) throw new Error('项目邀请 ID 无效')
  if (typeof row.revision !== 'number' || !Number.isSafeInteger(row.revision) || row.revision < 0) throw new Error('项目邀请版本无效')
  if (row.code !== undefined && row.code !== null && typeof row.code !== 'string') throw new Error('项目邀请码格式无效')
  return Object.freeze({
    id: row.id,
    projectId: row.projectId,
    projectName: text(row.projectName, '项目名称', 128),
    targetEmail: text(row.targetEmail, '邀请邮箱', 254),
    role: role(row.role),
    status: text(row.status, '邀请状态', 32),
    revision: row.revision,
    expiresAt: dateTime(row.expiresAt, '邀请到期时间'),
    deliveryChannel: text(row.deliveryChannel, '邀请投递渠道', 32),
    deliveryStatus: text(row.deliveryStatus, '邀请投递状态', 32),
    createdAt: dateTime(row.createdAt, '邀请创建时间'),
    code: typeof row.code === 'string' && row.code ? row.code : null
  })
}
function requireProject(project: string) { if (!uuid.test(project)) throw new Error('请选择当前项目') }
function requireAccount(accountId: string) { if (!uuid.test(accountId)) throw new Error('项目成员账号 ID 无效') }

export const projectMemberApi = {
  async listMembers(project: string, signal?: AbortSignal): Promise<ProjectMember[]> {
    requireProject(project)
    const value = await api<unknown>(`/api/v1/projects/${project}/members`, { signal })
    if (!Array.isArray(value) || value.length > 1000) throw new Error('项目成员目录响应不完整')
    return value.map(member)
  },
  async updateRole(project: string, accountId: string, next: AssignableRole, signal?: AbortSignal): Promise<void> {
    requireProject(project); requireAccount(accountId)
    if (!assignable.includes(next)) throw new Error('项目成员角色无效')
    await api<void>(`/api/v1/projects/${project}/members/${accountId}`, { method: 'patch', body: { role: next }, signal })
  },
  async remove(project: string, accountId: string, signal?: AbortSignal): Promise<void> {
    requireProject(project); requireAccount(accountId)
    await api<void>(`/api/v1/projects/${project}/members/${accountId}`, { method: 'delete', signal })
  },
  async transferOwner(project: string, accountId: string, signal?: AbortSignal): Promise<void> {
    requireProject(project); requireAccount(accountId)
    await api<void>(`/api/v1/projects/${project}/members/${accountId}/transfer-owner`, { method: 'post', signal })
  },
  async leave(project: string, signal?: AbortSignal): Promise<void> {
    requireProject(project)
    await api<void>(`/api/v1/projects/${project}/members/me`, { method: 'delete', signal })
  },
  async listInvitations(project: string, cursor: string | undefined, signal?: AbortSignal): Promise<InvitationPage> {
    requireProject(project)
    const value = object(await api<unknown>(`/api/v1/projects/${project}/invitations`, { query: { limit: 20, ...(cursor ? { cursor } : {}) }, signal }), '项目邀请')
    if (!Array.isArray(value.items) || value.items.length > 100 || typeof value.hasMore !== 'boolean'
      || (value.nextCursor !== null && typeof value.nextCursor !== 'string')) throw new Error('项目邀请分页不完整')
    if (value.hasMore && (typeof value.nextCursor !== 'string' || !value.nextCursor)) throw new Error('项目邀请续页游标缺失')
    return Object.freeze({ items: Object.freeze(value.items.map(invitation)), nextCursor: value.nextCursor as string | null, hasMore: value.hasMore })
  },
  async createInvitation(project: string, body: { email: string; role: AssignableRole }, signal?: AbortSignal): Promise<ProjectInvitation> {
    requireProject(project)
    const email = body.email.trim()
    if (!email || email.length > 254 || !email.includes('@')) throw new Error('邀请邮箱格式无效')
    if (!assignable.includes(body.role)) throw new Error('项目邀请角色无效')
    return invitation(await api<unknown>(`/api/v1/projects/${project}/invitations`, { method: 'post', body: { email, role: body.role }, signal }))
  },
  async resendInvitation(project: string, invitationId: string, signal?: AbortSignal): Promise<ProjectInvitation> {
    requireProject(project); if (!uuid.test(invitationId)) throw new Error('项目邀请 ID 无效')
    return invitation(await api<unknown>(`/api/v1/projects/${project}/invitations/${invitationId}/resend`, { method: 'post', signal }))
  },
  async revokeInvitation(project: string, invitationId: string, signal?: AbortSignal): Promise<void> {
    requireProject(project); if (!uuid.test(invitationId)) throw new Error('项目邀请 ID 无效')
    await api<void>(`/api/v1/projects/${project}/invitations/${invitationId}`, { method: 'delete', signal })
  }
}
