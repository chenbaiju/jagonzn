import { computed, shallowReactive } from 'vue'
import type { Schema } from './contracts'
import { api, assertIdentity, changeIdentity, identityEpoch, restoreAccess, invalidateIdentity, onSessionExpired } from './http'

export const session = shallowReactive({ ready: false, transitioning: false, user: null as Schema<'CurrentUserResponse'> | null, projects: [] as Schema<'ProjectResponse'>[], menus: [] as Schema<'MenuNodeResponse'>[] })
export const currentProject = computed(() => session.projects.find(p => p.id === session.user?.currentProjectId))
export const projectId = computed(() => session.user?.currentProjectId || '')
export function needsLogin() { return session.ready && !session.user && !session.transitioning }
export function can(permission: string) { return session.user?.permissions?.includes(permission) === true }
export function hasMenu(name: string) {
  const find = (nodes: Schema<'MenuNodeResponse'>[]): boolean => nodes.some(node => node.name === name || find(node.children || []))
  return find(session.menus)
}
function clearSession() { session.user = null; session.projects = []; session.menus = []; session.transitioning = false }
onSessionExpired(() => { changeIdentity(); clearSession(); session.ready = true })
export async function loadSession() {
  const epoch = identityEpoch()
  const user = await api<Schema<'CurrentUserResponse'>>('/api/v1/auth/me')
  const [projects, menus] = await Promise.all([api<Schema<'ProjectResponse'>[]>('/api/v1/projects'), api<Schema<'MenuNodeResponse'>[]>('/api/v1/system/menus')])
  assertIdentity(epoch); session.user = user; session.projects = projects; session.menus = menus; session.ready = true
}
export async function bootstrap() {
  const identity = identityEpoch()
  try { await restoreAccess(); await loadSession() }
  catch { if (identity === identityEpoch()) { clearSession(); session.ready = true } }
}
export async function login(email: string, password: string) {
  changeIdentity(); const identity = identityEpoch(); clearSession()
  const response = await api<Schema<'LoginResponse'>>('/api/v1/auth/login', { method: 'post', body: { email, password }, authenticated: false })
  assertIdentity(identity)
  if (!response.accessToken) throw new Error('登录响应未包含令牌')
  changeIdentity(response.accessToken); await loadSession()
}
export async function switchProject(id: string) {
  session.transitioning = true
  invalidateIdentity(); session.user = null; session.menus = []
  let identity = identityEpoch()
  try {
    const response = await api<Schema<'LoginResponse'>>('/api/v1/auth/switch-project', { method: 'post', body: { projectId: id } })
    assertIdentity(identity)
    if (!response.accessToken) throw new Error('项目切换未完成，请重新登录')
    changeIdentity(response.accessToken); identity = identityEpoch(); await loadSession()
  } catch (error) {
    if (identity === identityEpoch()) await loadSession().catch(() => { if (identity === identityEpoch()) clearSession() })
    throw error
  } finally { if (identity === identityEpoch()) session.transitioning = false }
}
export async function logout() {
  const identity = identityEpoch()
  try { await api('/api/v1/auth/logout', { method: 'post' }) }
  finally { if (identity === identityEpoch()) { changeIdentity(); clearSession(); session.ready = true } }
}
