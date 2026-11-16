import type {
  TenantSafetyView,
  TenantSafetyRequest,
  TenantSafetyOperation,
  TenantSafetyPage,
  TenantSafetyHistory
} from '@/api/tenant-governance'
export interface PendingTenantSafety {
  tenantId: string
  request: TenantSafetyRequest
}
export interface TenantSafetyState {
  items: TenantSafetyView[]
  nextCursor: string | null
  selected: TenantSafetyView | null
  history: TenantSafetyOperation[]
  historyCursor: string | null
  pending: PendingTenantSafety | null
  busy: boolean
  error: string
  result: TenantSafetyOperation | null
}
export const tenantSafetyState = (): TenantSafetyState => ({
  items: [],
  nextCursor: null,
  selected: null,
  history: [],
  historyCursor: null,
  pending: null,
  busy: false,
  error: '',
  result: null
})
interface Ports {
  list(params: {
    tenantId?: string
    prefix?: string
    status?: string
    cursor?: string
    limit?: number
  }): Promise<TenantSafetyPage>
  detail(id: string): Promise<TenantSafetyView>
  history(
    id: string,
    params?: { cursor?: string; operationId?: string; limit?: number }
  ): Promise<TenantSafetyHistory>
  change(id: string, request: TenantSafetyRequest): Promise<TenantSafetyOperation>
  save(value: PendingTenantSafety): void
  remove(id: string): void
  key(): string
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const v7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const version = (s: unknown): s is string =>
  typeof s === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(s) && BigInt(s) <= 9223372036854775807n
export function validatePendingSafety(value: unknown): PendingTenantSafety {
  const p = value as PendingTenantSafety | null
  if (
    !p ||
    typeof p.tenantId !== 'string' ||
    !uuid.test(p.tenantId) ||
    !v7.test(p.request?.operationId ?? '') ||
    !version(p.request?.expectedVersion) ||
    !['SUSPEND', 'RESTORE'].includes(p.request?.action ?? '') ||
    typeof p.request?.reason !== 'string' ||
    !p.request.reason.trim() ||
    p.request.reason.length > 512 ||
    (p.request.action === 'SUSPEND'
      ? !['ABUSE', 'COMPROMISED', 'OTHER_SECURITY'].includes(p.request.reasonCode ?? '') ||
        !!p.request.banOperationId
      : p.request.reasonCode !== 'REMEDIATED' || !uuid.test(p.request.banOperationId ?? ''))
  )
    throw new Error('原申请记录不完整，已阻止新操作，请核对原申请编号。')
  return {
    tenantId: p.tenantId,
    request: {
      operationId: p.request.operationId,
      action: p.request.action,
      expectedVersion: p.request.expectedVersion,
      reasonCode: p.request.reasonCode,
      reason: p.request.reason,
      banOperationId: p.request.banOperationId
    }
  }
}
/** 单代次模型；先持久化原意图，未知结果只查询/按原内容重试，迟到响应不写入后来身份。 */
export function createTenantSafetyModel(ports: Ports, state = tenantSafetyState()) {
  let epoch = 0
  let recoveryAttempted = false
  let ambiguous = false
  const preparedEpochs = new WeakMap<object, number>()
  const fail = () => {
    state.error = '请求未确认，请查询原申请或重新读取状态。'
  }
  function invalidate() {
    epoch++
    Object.assign(state, tenantSafetyState())
    recoveryAttempted = false
    ambiguous = false
  }
  async function list(params: Parameters<Ports['list']>[0]) {
    if (state.busy || state.pending) return
    const ticket = epoch
    state.busy = true
    state.error = ''
    try {
      const p = await ports.list(params)
      if (ticket !== epoch) return
      state.items = p.items ?? []
      state.nextCursor = p.nextCursor ?? null
      state.selected = null
      state.history = []
    } catch {
      if (ticket === epoch) fail()
    } finally {
      if (ticket === epoch) state.busy = false
    }
  }
  async function select(id: string) {
    if (state.busy || state.pending || !uuid.test(id)) return
    const ticket = ++epoch
    state.busy = true
    state.selected = null
    state.history = []
    state.historyCursor = null
    state.error = ''
    try {
      const p = await ports.detail(id)
      if (ticket !== epoch) return
      if (p.id !== id || !version(p.securityVersion)) throw new Error('invalid target')
      state.selected = p
      const h = await ports.history(id, { limit: 20 })
      if (ticket !== epoch) return
      state.history = h.items ?? []
      state.historyCursor = h.nextCursor ?? null
    } catch {
      if (ticket === epoch) fail()
    } finally {
      if (ticket === epoch) state.busy = false
    }
  }
  function prepare(
    action: 'SUSPEND' | 'RESTORE',
    reasonCode: string,
    reason: string
  ): PendingTenantSafety {
    const s = state.selected
    if (
      state.busy ||
      state.pending ||
      !s?.id ||
      !version(s.securityVersion) ||
      s.deletedAt ||
      (action === 'SUSPEND' ? s.status !== 'ACTIVE' : s.status !== 'SUSPENDED' || !s.banOperationId)
    )
      throw new Error('状态已变化，请重新读取。')
    const p = validatePendingSafety({
      tenantId: s.id,
      request: {
        operationId: ports.key(),
        action,
        reasonCode,
        reason: reason.trim(),
        expectedVersion: s.securityVersion,
        banOperationId: action === 'RESTORE' ? s.banOperationId : undefined
      }
    })
    preparedEpochs.set(p, epoch)
    return p
  }
  function accept(p: PendingTenantSafety, result: TenantSafetyOperation) {
    if (
      result.operationId !== p.request.operationId ||
      result.tenantId !== p.tenantId ||
      result.action !== p.request.action ||
      result.expectedVersion !== p.request.expectedVersion ||
      result.reasonCode !== p.request.reasonCode ||
      result.reason !== p.request.reason ||
      (result.banOperationId ?? null) !== (p.request.banOperationId ?? null)
    )
      throw new Error('回执与原申请不匹配')
    ports.remove(p.request.operationId!)
    state.result = result
    state.pending = null
    state.selected = null
    state.history = []
    recoveryAttempted = false
    ambiguous = false
  }
  async function send(p: PendingTenantSafety) {
    const ticket = epoch
    state.busy = true
    state.error = ''
    try {
      const r = await ports.change(p.tenantId, p.request)
      if (ticket === epoch) accept(p, r)
    } catch (error) {
      if (ticket !== epoch) return
      const code = (error as { code?: number } | null)?.code
      if (!ambiguous && code !== undefined && [10001, 10004, 50064, 50065, 50066].includes(code)) {
        ports.remove(p.request.operationId!)
        state.pending = null
        state.selected = null
        state.history = []
        state.error = '本次申请已明确拒绝，请重新查询当前状态后确认。'
      } else {
        ambiguous = true
        fail()
      }
    } finally {
      if (ticket === epoch) state.busy = false
    }
  }
  async function submit(value: PendingTenantSafety) {
    if (state.busy || state.pending) return
    if (preparedEpochs.get(value) !== epoch) throw new Error('确认已失效，请重新核对。')
    const p = validatePendingSafety(value)
    if (
      state.selected?.id !== p.tenantId ||
      state.selected.securityVersion !== p.request.expectedVersion
    )
      throw new Error('确认期间目标已变化，请重新读取。')
    ports.save(p)
    state.pending = p
    recoveryAttempted = false
    ambiguous = false
    await send(p)
  }
  function restore(value: unknown) {
    if (state.busy || state.pending) throw new Error('已有待确认申请')
    const p = validatePendingSafety(value)
    epoch++
    state.pending = p
    state.selected = null
    state.history = []
    state.result = null
    recoveryAttempted = false
    ambiguous = true
    return p
  }
  async function recover() {
    if (state.busy || !state.pending) return
    const p = state.pending
    const ticket = epoch
    state.busy = true
    state.error = ''
    try {
      const h = await ports.history(p.tenantId, { operationId: p.request.operationId, limit: 1 })
      if (ticket !== epoch) return
      recoveryAttempted = true
      const r = h.items?.[0]
      if (r) accept(p, r)
      else state.error = '尚未查到原回执，这不能证明原事务已结束；可继续查询或按原内容重试。'
    } catch {
      if (ticket === epoch) fail()
    } finally {
      if (ticket === epoch) state.busy = false
    }
  }
  async function retryOriginal() {
    if (state.busy || !state.pending || !recoveryAttempted) return
    await send(validatePendingSafety(state.pending))
  }
  async function moreHistory() {
    if (state.busy || state.pending || !state.selected?.id || !state.historyCursor) return
    const ticket = epoch
    const id = state.selected.id
    state.busy = true
    try {
      const h = await ports.history(id, { cursor: state.historyCursor, limit: 20 })
      if (ticket !== epoch) return
      state.history.push(...(h.items ?? []))
      state.historyCursor = h.nextCursor ?? null
    } catch {
      if (ticket === epoch) fail()
    } finally {
      if (ticket === epoch) state.busy = false
    }
  }
  return {
    state,
    invalidate,
    list,
    select,
    prepare,
    submit,
    restore,
    recover,
    retryOriginal,
    moreHistory
  }
}
/** UUIDv7操作身份；随机部分来自浏览器密码学随机源，不含账号或设备秘密。 */
export function tenantSafetyOperationId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let time = BigInt(Date.now())
  for (let i = 5; i >= 0; i--) {
    bytes[i] = Number(time & 255n)
    time >>= 8n
  }
  bytes[6] = (bytes[6]! & 15) | 112
  bytes[8] = (bytes[8]! & 63) | 128
  const h = [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
export function tenantSafetyPendingStorage(storage: Storage, accountId: string) {
  const prefix = `tc-tenant-safety:${accountId}:`
  const keys = () =>
    Array.from({ length: storage.length }, (_, i) => storage.key(i))
      .filter((k): k is string => !!k?.startsWith(prefix))
      .sort()
  return {
    first: () => {
      const k = keys()[0]
      return k ? validatePendingSafety(JSON.parse(storage.getItem(k) ?? 'null')) : null
    },
    save: (p: PendingTenantSafety) => {
      const clean = validatePendingSafety(p)
      const k = prefix + clean.request.operationId
      if (keys().some((x) => x !== k)) throw new Error('另有待确认申请')
      storage.setItem(k, JSON.stringify(clean))
    },
    remove: (id: string) => storage.removeItem(prefix + id)
  }
}
