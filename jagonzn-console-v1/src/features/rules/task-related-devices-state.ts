import { computed, nextTick, onScopeDispose, ref, watch, type Ref } from 'vue'
import { can, projectId } from '@/core/session'
import { ApiError, IdentityChanged, errorMessage, identityEpoch, onIdentityChange } from '@/core/http'
import { useResource } from '@/core/use-resource'
import { cas } from './models'
import type { TaskRelatedDeviceDisplayRow } from './TaskRelatedDevicesView.vue'

/** 生成合同经正式适配器校验后的展示投影，不是网络DTO。 */
export type RelatedDeviceRow = TaskRelatedDeviceDisplayRow & { writeToken: number }
export type RelatedDeviceRead = { rows: readonly RelatedDeviceRow[]; definitionToken: number; continuation?: string }
export type RelatedDeviceChange = { key: string; scheduled: boolean; writeToken: number; definitionToken: number }
export type RelatedDevicesTransport = {
  readRows: (project: string, job: string, definition: number, cursor: string | undefined, signal: AbortSignal) => Promise<RelatedDeviceRead>
  changeSchedule: (project: string, job: string, key: string, definition: number, preference: number, allowed: boolean) => Promise<RelatedDeviceChange>
  runRows: (project: string, job: string, definition: number, keys: readonly string[]) => Promise<void>
}

/** 管理、手动执行权限独立；人工核对必须先成功更新父定义，再读同一页偏好。 */
export function useTaskRelatedDevicesState(job: Ref<string>, definition: Ref<number | undefined>, enabled: Ref<boolean>, transport: RelatedDevicesTransport,
  refreshContext: () => Promise<void>, available: Ref<boolean> = ref(true),runPolicy:'REQUIRE_ENABLED'|'CURRENT_DEVICE_MANUAL'='REQUIRE_ENABLED') {
  const allowed = computed(() => available.value && can('task:read'))
  const manage = computed(() => allowed.value && can('task:manage'))
  const runnable = computed(() => allowed.value && (runPolicy==='CURRENT_DEVICE_MANUAL'||enabled.value) && can('task:run'))
  const cursors = ref<(string | undefined)[]>([undefined]), selected = ref<string[]>([])
  const writerBusy = ref(false), rereading = ref(false), locked = ref(false), writeError = ref(''), notice = ref('')
  const busy = computed(() => writerBusy.value || rereading.value)
  let generation = 0, refreshId = 0, active = true
  const known = new Set<string>()
  const validDefinition = () => Number.isSafeInteger(definition.value) && definition.value! > 0 && Number.isSafeInteger(definition.value! + 1)
  const page = useResource(async signal => {
    const token = cas(definition.value)
    const value = await transport.readRows(projectId.value, job.value, token, cursors.value.at(-1), signal)
    if (!value || !Array.isArray(value.rows) || value.rows.length > 24 || value.definitionToken !== token) throw new Error('任务设备页返回不完整，请重新读取任务')
    const keys = new Set<string>()
    for (const row of value.rows) {
      if (!row || typeof row.key !== 'string' || !row.key || keys.has(row.key) || typeof row.label !== 'string' || !row.label.trim() || typeof row.scheduled !== 'boolean') throw new Error('任务设备页身份不完整，请重新读取')
      keys.add(row.key); cas(row.writeToken)
    }
    if (value.continuation !== undefined && (typeof value.continuation !== 'string' || !value.continuation || !value.rows.length || value.continuation.length > 8192 || cursors.value.includes(value.continuation))) throw new Error('任务设备分页未形成推进，请刷新后重试')
    return value
  })
  watch(page.data, value => {
    if (!allowed.value || !value || value.definitionToken !== definition.value) return
    // 只保留已选设备和当前页，至多10000+24个键，不随无穷浏览积累整个项目。
    known.clear(); for (const key of selected.value) known.add(key)
    for (const row of value.rows) known.add(row.key)
  })
  function reset(cancelRefresh = false) {
    generation++; writerBusy.value = false; locked.value = false; writeError.value = ''; notice.value = ''; selected.value = []; known.clear(); cursors.value = [undefined]; page.clear()
    if (cancelRefresh) { refreshId++; rereading.value = false }
  }
  const dispose = onIdentityChange(() => reset(true))
  onScopeDispose(() => { active = false; dispose() })
  watch([projectId, job, definition, allowed, manage, runnable], (current, previous) => {
    const same = !!previous && current[0] === previous[0] && current[1] === previous[1]
    const retain = same && (writerBusy.value || locked.value)
    reset(!same); locked.value = retain
    if (retain) writeError.value = '请重新读取任务与设备核对最新状态'
    if (projectId.value && job.value && allowed.value && validDefinition() && !rereading.value) void reload(false)
    else if (projectId.value && job.value && allowed.value && !validDefinition()) page.error.value = new Error('任务版本无法安全读取，请重新读取任务')
  }, { immediate: true })
  watch(page.error, cause => { if (cause instanceof ApiError && [401,403,404].includes(cause.status)) { page.data.value = undefined; selected.value = []; known.clear() } })
  const readReady = computed(() => allowed.value && !!projectId.value && !!job.value && validDefinition() && !busy.value && !locked.value && !page.loading.value && !page.error.value && !!page.data.value)
  const canManage = computed(() => manage.value && readReady.value)
  const canRun = computed(() => runnable.value && readReady.value)
  function capture() {
    const project = projectId.value, id = job.value, epoch = identityEpoch(), scope = generation, token = definition.value
    return () => active && epoch === identityEpoch() && scope === generation && project === projectId.value && id === job.value && token === definition.value && allowed.value
  }
  async function reload(manual = true) {
    if (!projectId.value || !job.value || !allowed.value || busy.value) return
    const project = projectId.value, id = job.value, epoch = identityEpoch(), refresh = ++refreshId
    const sameObject = () => active && project === projectId.value && id === job.value && epoch === identityEpoch() && can('task:read')
    if (manual) {
      rereading.value = true
      try { await refreshContext(); await nextTick() }
      catch (cause) {
        if (sameObject() && refresh === refreshId && !(cause instanceof IdentityChanged)) { writeError.value = errorMessage(cause); page.clear(); page.error.value = cause }
        if (refresh === refreshId) rereading.value = false
        return
      }
    }
    if (!sameObject() || refresh !== refreshId || !allowed.value || !validDefinition()) { if (refresh === refreshId) rereading.value = false; return }
    const current = capture()
    selected.value = []; known.clear(); cursors.value = [undefined]
    await page.reload()
    if (current() && manual && !page.error.value && page.data.value) { locked.value = false; writeError.value = ''; notice.value = '' }
    if (refresh === refreshId) rereading.value = false
  }
  function select(keys: readonly string[]) {
    if (!canRun.value || !Array.isArray(keys)) return
    if (keys.length > 10000 || keys.some(key => !known.has(key)) || new Set(keys).size !== keys.length) { writeError.value = '请选择当前任务范围内的有效设备'; return }
    selected.value = [...keys]
  }
  function failed(cause: unknown) {
    writeError.value = errorMessage(cause); selected.value = []
    if (!(cause instanceof ApiError) || cause.outcomeUnknown || cause.status === 0 || cause.status === 409 || cause.status >= 500) locked.value = true
    if (cause instanceof ApiError && [401,403,404].includes(cause.status)) { page.clear(); page.error.value = cause; known.clear() }
  }
  async function toggle(key: string, checked: boolean) {
    const row = page.data.value?.rows.find(row => row.key === key)
    if (!canManage.value || !row || typeof checked !== 'boolean' || row.scheduled === checked) return
    const current = capture(), project = projectId.value, id = job.value, token = cas(definition.value), previous = cas(row.writeToken)
    writerBusy.value = true; writeError.value = ''; notice.value = ''; selected.value = []
    try {
      const value = await transport.changeSchedule(project, id, key, token, previous, checked)
      if (!current() || !manage.value) return
      if (!value || value.key !== key || value.scheduled !== checked || value.definitionToken !== token || cas(value.writeToken) !== previous + 1) throw new Error('设备定时偏好响应不匹配，请重新读取核对')
      const old = page.data.value
      if (old) page.data.value = { ...old, rows: old.rows.map(item => item.key === key ? { ...item, scheduled: checked, writeToken: value.writeToken } : item) }
    } catch (cause) { if (current() && !(cause instanceof IdentityChanged)) failed(cause) }
    finally { if (current()) writerBusy.value = false }
  }
  async function run(keys: readonly string[]) {
    if (!canRun.value || !Array.isArray(keys) || !keys.length || keys.length > 10000 || new Set(keys).size !== keys.length || keys.some(key => !known.has(key))) return
    const current = capture(), project = projectId.value, id = job.value, token = cas(definition.value), frozen = [...keys]
    writerBusy.value = true; writeError.value = ''; notice.value = ''; selected.value = []
    try { await transport.runRows(project, id, token, frozen); if (current() && runnable.value) notice.value = '执行已受理' }
    catch (cause) { if (current() && !(cause instanceof IdentityChanged)) failed(cause) }
    finally { if (current()) writerBusy.value = false }
  }
  async function next() {
    const cursor = page.data.value?.continuation
    if (!allowed.value || busy.value || page.loading.value || page.error.value || !cursor) return
    cursors.value.push(cursor); await page.reload()
  }
  async function previous() {
    if (!allowed.value || busy.value || page.loading.value || cursors.value.length < 2) return
    cursors.value.pop(); await page.reload()
  }
  return { allowed, manage, runnable, page, cursors, selected, busy, locked, writeError, notice, readReady, canManage, canRun, reload, select, toggle, run, next, previous }
}
