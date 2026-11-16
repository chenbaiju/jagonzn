/**
 * 未登录可访问的认证页面。
 *
 * 这些页面在会话尚未建立时也必须允许停留，否则守卫会把注册、找回口令
 * 和邮件链接页一并送回登录页。
 */
export const PUBLIC_AUTH_PATHS = new Set([
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/reset-password',
  '/auth/verify-email'
])

export function isPublicAuthPath(path: string) {
  return PUBLIC_AUTH_PATHS.has(path)
}

/** 后端邮件链接使用 hash 形式，且只签发这两个发件用途的地址。 */
const LEGACY_HASH_PATHS = new Set(['/auth/verify-email', '/auth/reset-password'])

/**
 * 把 `/#/auth/reset-password?token=...` 还原为普通路径。
 *
 * 平台邮件适配器按旧 Console 的 hash 路由拼链接；V1 使用 history 路由，
 * 若不还原，Vue Router 看到的是空 hash，会落到根路径并被守卫送回登录页。
 * 必须在创建 router 之前执行，且只接受两个已知的邮件承接路径。
 */
export function normalizeLegacyAuthHash() {
  if (typeof window === 'undefined') return
  const raw = window.location.hash
  if (!raw.startsWith('#/')) return
  const [path, query] = raw.slice(1).split('?', 2)
  if (!LEGACY_HASH_PATHS.has(path)) return
  window.history.replaceState(null, '', query ? `${path}?${query}` : path)
}
