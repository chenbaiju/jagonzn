/** 应用管理员是项目级第三类账号；12 项权限位与原站 /admin_add 固定对应。 */
export const permissionKeys = [
  'operateDevice','editDeviceInfo','viewDeviceCertificate','editDeviceGroup',
  'toggleDeviceSchedule','toggleDeviceAlarmRule','createUser','editUserInfo',
  'resetUserPassword','editUserStatus','assignUserDevice','assignUserDashboard'
] as const

export type PermissionKey = typeof permissionKeys[number]
export type ApplicationAdminPermissions = Readonly<Record<PermissionKey, boolean>>

export const permissionGroups: readonly Readonly<{
  label: string
  items: readonly Readonly<{key: PermissionKey; label: string}>[]
}>[] = [
  { label: '设备', items: [
    { key: 'operateDevice', label: '操作设备' },
    { key: 'editDeviceInfo', label: '编辑设备信息' },
    { key: 'viewDeviceCertificate', label: '查看设备证书' },
    { key: 'editDeviceGroup', label: '编辑设备分组' }
  ] },
  { label: '任务', items: [{ key: 'toggleDeviceSchedule', label: '启用/禁用设备定时任务' }] },
  { label: '告警规则', items: [{ key: 'toggleDeviceAlarmRule', label: '启用/禁用设备告警规则' }] },
  { label: '用户', items: [
    { key: 'createUser', label: '创建用户' },
    { key: 'editUserInfo', label: '编辑用户信息' },
    { key: 'resetUserPassword', label: '重设用户密码' },
    { key: 'editUserStatus', label: '编辑用户状态' },
    { key: 'assignUserDevice', label: '给用户分配设备' },
    { key: 'assignUserDashboard', label: '给用户分配看板' }
  ] }
]

export type ApplicationAdminTag = Readonly<{name: string; value: string}>
export type ApplicationAdminStatus = 'ACTIVE' | 'DISABLED'
export type ApplicationAdmin = Readonly<{
  id: string
  name: string
  loginName: string
  permissions: ApplicationAdminPermissions
  email: string | null
  phone: string | null
  description: string | null
  tags: readonly ApplicationAdminTag[]
  status: ApplicationAdminStatus
  revision: string
  createdAt: string
  updatedAt: string
}>

export type ApplicationAdminPage = Readonly<{
  items: readonly ApplicationAdmin[]
  nextCursor: string | null
  hasMore: boolean
}>

export type AdminDraft = {
  name: string
  loginName: string
  password: string
  permissions: Record<PermissionKey, boolean>
  email: string
  phone: string
  description: string
  tags: {name: string; value: string}[]
}

export type CreateAdminInput = Readonly<{
  name: string
  loginName: string
  password: string
  permissions: ApplicationAdminPermissions
  email: string | null
  phone: string | null
  description: string | null
  tags: readonly ApplicationAdminTag[]
}>

export type UpdateAdminInput = Readonly<{
  name: string
  permissions: ApplicationAdminPermissions
  email: string | null
  phone: string | null
  description: string | null
  tags: readonly ApplicationAdminTag[]
  expectedRevision: string
}>

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const loginPattern = /^[A-Za-z0-9_.@+-]{1,64}$/
const revisionPattern = /^(0|[1-9][0-9]{0,18})$/
const maximumRevision = 9223372036854775807n
const controlPattern = /[\u0000-\u001f\u007f-\u009f]/

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value)
}

export function emptyPermissions(): Record<PermissionKey, boolean> {
  return Object.fromEntries(permissionKeys.map(key => [key, false])) as Record<PermissionKey, boolean>
}

export function allPermissions(value: boolean): Record<PermissionKey, boolean> {
  return Object.fromEntries(permissionKeys.map(key => [key, value])) as Record<PermissionKey, boolean>
}

export function copyPermissions(source: ApplicationAdminPermissions): Record<PermissionKey, boolean> {
  return Object.fromEntries(permissionKeys.map(key => [key, source[key]])) as Record<PermissionKey, boolean>
}

export function permissionCount(source: ApplicationAdminPermissions): number {
  return permissionKeys.reduce((total, key) => total + (source[key] ? 1 : 0), 0)
}

/** 只接受恰好 12 个布尔键；缺失、额外键或非布尔值都视为坏回执。 */
export function decodePermissions(value: unknown): ApplicationAdminPermissions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('应用管理员权限不完整')
  const row = value as Record<string, unknown>
  const keys = Object.keys(row)
  if (keys.length !== permissionKeys.length) throw new Error('应用管理员权限必须为12项')
  for (const key of permissionKeys) if (typeof row[key] !== 'boolean') throw new Error('应用管理员权限必须为布尔值')
  for (const key of keys) if (!(permissionKeys as readonly string[]).includes(key)) throw new Error('应用管理员权限包含未知项')
  return Object.freeze(Object.fromEntries(permissionKeys.map(key => [key, row[key] as boolean])) as Record<PermissionKey, boolean>)
}

export function emptyDraft(): AdminDraft {
  return { name: '', loginName: '', password: '', permissions: emptyPermissions(), email: '', phone: '', description: '', tags: [{ name: '', value: '' }] }
}

export function draftFromAdmin(admin: ApplicationAdmin): AdminDraft {
  return {
    name: admin.name,
    loginName: admin.loginName,
    password: '',
    permissions: copyPermissions(admin.permissions),
    email: admin.email || '',
    phone: admin.phone || '',
    description: admin.description || '',
    tags: admin.tags.length ? admin.tags.map(tag => ({ name: tag.name, value: tag.value })) : [{ name: '', value: '' }]
  }
}

function requireText(value: unknown, maximum: number, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label}格式无效`)
  const text = value.trim()
  if (!text || text.length > maximum || controlPattern.test(text)) throw new Error(`${label}为1至${maximum}字符且不能包含控制字符`)
  return text
}

function optionalText(value: unknown, maximum: number, label: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new Error(`${label}格式无效`)
  const text = value.trim()
  if (!text) return null
  if (text.length > maximum || controlPattern.test(text)) throw new Error(`${label}最多${maximum}字符且不能包含控制字符`)
  return text
}

export function validateRevision(value: unknown): string {
  if (typeof value !== 'string' || !revisionPattern.test(value) || BigInt(value) > maximumRevision) throw new Error('应用管理员版本格式无效')
  return value
}

/** 口令长度按字符和 UTF-8 字节双重限制；不回显、不裁剪。 */
export function validatePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128 || new TextEncoder().encode(value).length > 72)
    throw new Error('登录密码需为8至128字符且UTF-8不超过72字节')
  return value
}

export function normalizeTags(value: unknown): ApplicationAdminTag[] {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) throw new Error('应用管理员标签格式无效')
  if (value.length > 32) throw new Error('应用管理员标签不能超过32项')
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`第${index + 1}个标签格式无效`)
    const row = item as Record<string, unknown>
    const name = requireText(row.name, 64, `第${index + 1}个标签名称`)
    if (row.value !== undefined && typeof row.value !== 'string') throw new Error(`第${index + 1}个标签值格式无效`)
    const raw = typeof row.value === 'string' ? row.value : ''
    if (raw.length > 128 || controlPattern.test(raw)) throw new Error(`第${index + 1}个标签值最多128字符且不能包含控制字符`)
    return Object.freeze({ name, value: raw.trim() })
  })
}

/** 表单里的空标签行不提交；只填值不填名称仍按错误处理。 */
export function draftTags(draft: AdminDraft): ApplicationAdminTag[] {
  return normalizeTags(draft.tags.filter(tag => tag.name.trim() !== '' || tag.value.trim() !== ''))
}

export function createInput(draft: AdminDraft): CreateAdminInput {
  const loginName = draft.loginName.trim()
  if (!loginPattern.test(loginName)) throw new Error('登录名需为1至64位字母、数字或 _ . @ + -')
  return {
    name: requireText(draft.name, 64, '名称'),
    loginName,
    password: validatePassword(draft.password),
    permissions: Object.freeze({ ...draft.permissions }),
    email: optionalText(draft.email, 255, '邮箱'),
    phone: optionalText(draft.phone, 32, '手机号'),
    description: optionalText(draft.description, 500, '描述'),
    tags: Object.freeze(draftTags(draft))
  }
}

export function updateInput(draft: AdminDraft, expectedRevision: string): UpdateAdminInput {
  return {
    name: requireText(draft.name, 64, '名称'),
    permissions: Object.freeze({ ...draft.permissions }),
    email: optionalText(draft.email, 255, '邮箱'),
    phone: optionalText(draft.phone, 32, '手机号'),
    description: optionalText(draft.description, 500, '描述'),
    tags: Object.freeze(draftTags(draft)),
    expectedRevision: validateRevision(expectedRevision)
  }
}

export function validateCreateDraft(draft: AdminDraft): string {
  try {
    createInput(draft)
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : '请检查创建内容'
  }
}

export function validateUpdateDraft(draft: AdminDraft): string {
  try {
    updateInput(draft, '0')
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : '请检查编辑内容'
  }
}

/** 目录项严格解码；联系方式允许 null，与运行时响应一致。 */
export function decodeAdmin(value: unknown): ApplicationAdmin {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('应用管理员响应不完整')
  const row = value as Record<string, unknown>
  if (!isUuid(row.id)) throw new Error('应用管理员 ID 格式无效')
  const name = requireText(row.name, 64, '名称')
  if (typeof row.loginName !== 'string' || !loginPattern.test(row.loginName)) throw new Error('应用管理员登录名格式无效')
  if (row.status !== 'ACTIVE' && row.status !== 'DISABLED') throw new Error('应用管理员状态无效')
  const email = row.email === null || row.email === undefined ? null : optionalText(row.email, 255, '邮箱')
  const phone = row.phone === null || row.phone === undefined ? null : optionalText(row.phone, 32, '手机号')
  const description = row.description === null || row.description === undefined ? null : optionalText(row.description, 500, '描述')
  const tags = normalizeTags(row.tags)
  return Object.freeze({
    id: row.id,
    name,
    loginName: row.loginName,
    permissions: decodePermissions(row.permissions),
    email,
    phone,
    description,
    tags: Object.freeze(tags),
    status: row.status,
    revision: validateRevision(row.revision),
    createdAt: requireTime(row.createdAt, '创建时间'),
    updatedAt: requireTime(row.updatedAt, '更新时间')
  })
}

function requireTime(value: unknown, label: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(`应用管理员${label}格式无效`)
  return value
}

export function decodeAdminPage(value: unknown): ApplicationAdminPage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('应用管理员目录响应不完整')
  const row = value as Record<string, unknown>
  if (!Array.isArray(row.items) || row.items.length > 100) throw new Error('应用管理员目录项数量无效')
  if (typeof row.hasMore !== 'boolean' || (row.nextCursor !== null && typeof row.nextCursor !== 'string')) throw new Error('应用管理员目录分页不完整')
  if (row.hasMore && (typeof row.nextCursor !== 'string' || !row.nextCursor)) throw new Error('应用管理员目录续页游标缺失')
  return Object.freeze({ items: Object.freeze(row.items.map(decodeAdmin)), nextCursor: row.nextCursor as string | null, hasMore: row.hasMore })
}
