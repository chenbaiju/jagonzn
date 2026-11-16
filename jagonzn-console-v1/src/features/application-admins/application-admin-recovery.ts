import { isUuid } from './application-admin-model'

const prefix = 'tl.application-admin.create-recovery.'
const version = 1
/** 每次页面运行态初始化生成一次；刷新或重新加载后必然不同。 */
const runtimeId = newRuntimeId()
const loginPattern = /^[A-Za-z0-9_.@+-]{1,64}$/
/** 恢复记录只用于同一登录会话内核对；超过窗口即视为过期并删除。 */
export const ADMIN_CREATE_RECOVERY_TTL_MS = 30 * 60 * 1000
const futureSkewMs = 60 * 1000

/**
 * 创建结果未确认时的最小持久上下文：项目、操作者、登录名、幂等键和请求时间。
 * 邮箱、手机号、描述、标签、权限和口令只允许留在当前页面内存，不写入存储。
 *
 * <p>页面刷新后运行态和会话计数都会重建，既有会话合同没有可跨刷新读取的会话标识，
 * 因此只能降级为“待核对提示”：保留登录名和请求时间，丢弃幂等键与会话计数。
 * 该提示仍要求显式核对，提交保持禁用，不会自动换键重发。
 */
export type AdminCreateRecovery = Readonly<{
  version: 1
  projectId: string
  accountId: string
  /** 同一运行态内有效；刷新恢复的提示为 null。 */
  sessionEpoch: number | null
  /** 同一运行态内保留；刷新恢复的提示为 null，绝不用于重发。 */
  idempotencyKey: string | null
  loginName: string
  requestedAt: string
}>

function newRuntimeId(): string {
  const generated = globalThis.crypto?.randomUUID?.()
  return generated || `runtime-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function newIdempotencyKey(): string {
  const generated = globalThis.crypto?.randomUUID?.()
  return generated || `admin-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function storageKey(projectId: string) { return `${prefix}${projectId}` }
function validRequestedAt(value: unknown, now: number): value is string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return false
  const requested = Date.parse(value)
  return requested <= now + futureSkewMs && now - requested <= ADMIN_CREATE_RECOVERY_TTL_MS
}

function decode(value: unknown, projectId: string, accountId: string, sessionEpoch: number, now: number): AdminCreateRecovery | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (row.version !== version || row.projectId !== projectId || !isUuid(row.projectId)) return null
  if (row.accountId !== accountId || !isUuid(row.accountId)) return null
  if (typeof row.loginName !== 'string' || !loginPattern.test(row.loginName)) return null
  if (!validRequestedAt(row.requestedAt, now)) return null
  const base = { version, projectId, accountId, loginName: row.loginName, requestedAt: row.requestedAt } as const
  if (!('runtimeId' in row)) {
    // 刷新后的降级提示只允许保留最小非秘密字段；混入幂等键或会话计数即为坏记录。
    if ('idempotencyKey' in row || 'sessionEpoch' in row) return null
    return Object.freeze({ ...base, sessionEpoch: null, idempotencyKey: null })
  }
  if (typeof row.runtimeId !== 'string' || row.runtimeId.length > 128) return null
  if (row.runtimeId !== runtimeId) {
    // 新的页面运行态：不能证明是同一会话，但同账号同项目仍保留最小核对提示。
    return Object.freeze({ ...base, sessionEpoch: null, idempotencyKey: null })
  }
  if (row.sessionEpoch !== sessionEpoch || !Number.isSafeInteger(row.sessionEpoch) || (row.sessionEpoch as number) < 0) {
    // 同一运行态内会话已改变（退出重登、切换项目）：按既有会话合同作废。
    return null
  }
  if (typeof row.idempotencyKey !== 'string' || !row.idempotencyKey || row.idempotencyKey.length > 128) return null
  return Object.freeze({ ...base, sessionEpoch, idempotencyKey: row.idempotencyKey })
}

/** 只把最小上下文写入当前标签页会话；返回是否成功写入。 */
export function saveAdminCreateRecovery(record: AdminCreateRecovery): boolean {
  if (!isUuid(record.projectId) || !isUuid(record.accountId)
    || typeof record.sessionEpoch !== 'number' || !Number.isSafeInteger(record.sessionEpoch) || record.sessionEpoch < 0
    || typeof record.idempotencyKey !== 'string' || !record.idempotencyKey || record.idempotencyKey.length > 128
    || !loginPattern.test(record.loginName) || !validRequestedAt(record.requestedAt, Date.now())) return false
  const minimal = {
    version,
    runtimeId,
    projectId: record.projectId,
    accountId: record.accountId,
    sessionEpoch: record.sessionEpoch,
    idempotencyKey: record.idempotencyKey,
    loginName: record.loginName,
    requestedAt: record.requestedAt
  }
  try { sessionStorage.setItem(storageKey(record.projectId), JSON.stringify(minimal)); return true }
  catch { return false }
}

/**
 * 读取待核对记录。账号、项目和有效期必须匹配；同一运行态还要求会话计数一致。
 * 刷新后运行态重建时降级为仅含登录名和请求时间的提示，并立即把幂等键与会话计数
 * 从存储中移除，避免后续任何路径复用旧键。
 */
export function readAdminCreateRecovery(projectId: string, accountId: string, sessionEpoch: number, now = Date.now()): AdminCreateRecovery | null {
  if (!isUuid(projectId) || !isUuid(accountId) || !Number.isSafeInteger(sessionEpoch) || sessionEpoch < 0) return null
  try {
    const raw = sessionStorage.getItem(storageKey(projectId))
    if (!raw) return null
    const record = decode(JSON.parse(raw), projectId, accountId, sessionEpoch, now)
    if (!record) { sessionStorage.removeItem(storageKey(projectId)); return null }
    if (record.idempotencyKey === null) {
      // 重写失败不应吞掉本次已经确认的提示；最坏情况是旧键在存储中多留到下次读取。
      try {
        sessionStorage.setItem(storageKey(projectId), JSON.stringify({
          version, projectId, accountId, loginName: record.loginName, requestedAt: record.requestedAt
        }))
      } catch { /* 提示仍返回 */ }
    }
    return record
  } catch { return null }
}

export function clearAdminCreateRecovery(projectId: string): void {
  try { sessionStorage.removeItem(storageKey(projectId)) } catch { /* 清理失败不改变页面事实 */ }
}
