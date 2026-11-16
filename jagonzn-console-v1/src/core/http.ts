import type { Schema } from './contracts'
import type { ApiUrl } from './paths'
import { RefreshCoordinator } from '../../../../things-link-console/src/utils/http/refresh-coordinator'

export class ApiError extends Error {
  constructor(message: string, public status = 0, public code?: number, public traceId?: string, public outcomeUnknown = false) { super(message) }
}
export class IdentityChanged extends Error { constructor() { super('页面身份已改变') } }
let token = '', epoch = 0
const listeners = new Set<() => void>()
let expireSession = () => { changeIdentity() }
export function onSessionExpired(fn: () => void) { expireSession = fn }
export const identityEpoch = () => epoch
export function assertIdentity(value: number) { if (value !== epoch) throw new IdentityChanged() }
export function changeIdentity(accessToken = '') { epoch++; token = accessToken; listeners.forEach(fn => fn()) }
export function invalidateIdentity() { epoch++; listeners.forEach(fn => fn()) }
export function onIdentityChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }
export function setAccessToken(value: string) { token = value }
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete'
/** 精确事故原件转义后的外层响应有独立预算，其他路径仍保持原上限。 */
function responseBudgetCeiling(path: string, method: Method): number {
  const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
  const instance = `/api/v1/projects/${uuid}/console/alarm-instances/${uuid}`
  return (method === 'get' && new RegExp(`^${instance}$`).test(path))
    || (method === 'post' && new RegExp(`^${instance}/(?:ack|clear)$`).test(path))
    || (method === 'get' && new RegExp(`^/api/v1/projects/${uuid}/console/alarm-logs/${uuid}/evaluation$`).test(path))
    ? 12 * 1024 * 1024 : 8 * 1024 * 1024
}
export type RequestOptions = {
  method?: Method; body?: unknown; query?: Record<string, unknown>; signal?: AbortSignal;
  headers?: Record<string, string>; authenticated?: boolean;
  /** 严格JSON/二进制上传使用原始正文，禁止先转成JS数字再序列化。 */
  rawBody?: BodyInit;
  responseType?: 'json' | 'text' | 'blob' | 'bytes';
  maxResponseBytes?: number;
  /** 仅固件原始正文允许延长上传等待；其它请求保持15秒上界。 */
  timeoutMs?: number;
}
const refresh = new RefreshCoordinator(async (identity: number) => {
  const result = await send<Schema<'LoginResponse'>>('/api/v1/auth/refresh', { method: 'post', authenticated: false }, identity)
  assertIdentity(identity)
  if (!result.accessToken) throw new ApiError('登录状态已失效', 401)
  token = result.accessToken
  return token
})
export async function restoreAccess() { const identity = epoch; await refresh.run(identity, () => assertIdentity(identity)) }

/** 在分配完整响应前限制字节数，Content-Length 缺失或不可信时仍逐块计数。 */
async function readBounded(response: Response, maximum: number, identity: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('Content-Length'))
  if (Number.isFinite(declared) && declared > maximum) { await response.body?.cancel(); throw new Error('响应超过允许大小') }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const part = await reader.read(); assertIdentity(identity)
      if (part.done) break
      length += part.value.byteLength
      if (length > maximum) { await reader.cancel(); throw new Error('响应超过允许大小') }
      chunks.push(part.value)
    }
  } catch (error) { await reader.cancel().catch(() => undefined); throw error }
  finally { reader.releaseLock() }
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return result
}
async function send<T>(path: string, options: RequestOptions, identity: number): Promise<T> {
  assertIdentity(identity)
  const url = new URL(path, window.location.origin)
  for (const [key, value] of Object.entries(options.query || {})) {
    for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined && item !== null && item !== '') url.searchParams.append(key, String(item))
  }
  const method = options.method || 'get'
  const maximum = options.maxResponseBytes ?? 2 * 1024 * 1024
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > responseBudgetCeiling(path, method)) throw new ApiError('响应大小限制无效')
  if (options.rawBody !== undefined && options.body !== undefined) throw new ApiError('原始正文与JSON正文不能同时使用')
  const headers = new Headers(options.headers)
  if (options.authenticated !== false && token) headers.set('Authorization', `Bearer ${token}`)
  const nativeBody = options.body instanceof FormData || options.body instanceof Blob || options.body instanceof ArrayBuffer || ArrayBuffer.isView(options.body)
  if (options.body !== undefined && !nativeBody && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const body = options.rawBody !== undefined ? options.rawBody : options.body === undefined ? undefined : nativeBody ? options.body as BodyInit : JSON.stringify(options.body)
  const timeout=options.timeoutMs??15000
  const maximumTimeout=method==='put'&&/^\/api\/v1\/projects\/[0-9a-f-]{36}\/ota\/firmwares\/[0-9a-f-]{36}\/uploads\/[0-9a-f-]{36}\/content$/i.test(path)?300000:15000
  if(!Number.isSafeInteger(timeout)||timeout<1||timeout>maximumTimeout)throw new ApiError('请求等待时间超出允许范围')
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout)
  let response: Response
  try {
    response = await fetch(url, { method: method.toUpperCase(), headers, credentials: 'include', body, signal })
  } catch (error) {
    assertIdentity(identity)
    if (options.signal?.aborted) throw error
    throw new ApiError('请求未完成，请重新读取核对结果', 0, undefined, undefined, method !== 'get')
  }
  assertIdentity(identity)
  if (!response.ok) {
    const detail = await readBounded(response, Math.min(maximum, 64 * 1024), identity)
      .then(bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))).catch(() => ({}))
    assertIdentity(identity)
    throw new ApiError(detail.message || `请求失败（${response.status}）`, response.status, detail.code, detail.traceId, method !== 'get' && response.status >= 500)
  }
  if (response.status === 204) return undefined as T
  try {
    const bytes = await readBounded(response, maximum, identity)
    assertIdentity(identity)
    if (options.responseType === 'bytes') return bytes as T
    if (options.responseType === 'blob') return new Blob([bytes as BlobPart], { type: response.headers.get('Content-Type') || 'application/octet-stream' }) as T
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return (options.responseType === 'text' ? text : JSON.parse(text)) as T
  } catch (error) {
    assertIdentity(identity)
    if (options.signal?.aborted) throw error
    throw new ApiError(error instanceof Error ? error.message : '服务响应无法读取', response.status, undefined, undefined, method !== 'get')
  }
}
/** 只读 GET 允许刷新后重读一次；写请求提前取得令牌，任何失败都不自动重放。 */
export function api<T = unknown>(path: ApiUrl<'get'>, options?: RequestOptions & { method?: 'get' }): Promise<T>
export function api<T = unknown>(path: ApiUrl<'post'>, options: RequestOptions & { method: 'post' }): Promise<T>
export function api<T = unknown>(path: ApiUrl<'put'>, options: RequestOptions & { method: 'put' }): Promise<T>
export function api<T = unknown>(path: ApiUrl<'patch'>, options: RequestOptions & { method: 'patch' }): Promise<T>
export function api<T = unknown>(path: ApiUrl<'delete'>, options: RequestOptions & { method: 'delete' }): Promise<T>
export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const identity = epoch
  let refreshed = false
  try {
    if (options.authenticated !== false && !token) { refreshed = true; await refresh.run(identity, () => assertIdentity(identity)) }
    const result = await send<T>(path, options, identity)
    assertIdentity(identity)
    return result
  }
  catch (error) {
    if (error instanceof ApiError && error.status === 401 && !refreshed && options.authenticated !== false && (!options.method || options.method === 'get')) {
      try {
        await refresh.run(identity, () => assertIdentity(identity))
        const result = await send<T>(path, options, identity)
        assertIdentity(identity)
        return result
      } catch (refreshError) {
        if (refreshError instanceof ApiError && refreshError.status === 401) { assertIdentity(identity); expireSession() }
        throw refreshError
      }
    }
    if (error instanceof ApiError && error.status === 401 && options.authenticated !== false) { assertIdentity(identity); expireSession() }
    throw error
  }
}
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : '操作未完成，请重试' }
