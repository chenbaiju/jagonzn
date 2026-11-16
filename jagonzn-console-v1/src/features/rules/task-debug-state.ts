import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { can, projectId } from '@/core/session'
import { ApiError, IdentityChanged, errorMessage, identityEpoch, onIdentityChange } from '@/core/http'
import { useResource } from '@/core/use-resource'
import { cas } from './models'
import type { TaskDebugLogDisplayRow } from './TaskDebugLogTable.vue'

/** 展示端口不定义网络路径或服务端DTO；正式适配器须从唯一生成合同校验转换。 */
export type TaskDebugLogRead = { rows: readonly TaskDebugLogDisplayRow[]; clearToken: number }
export type TaskDebugDeviceRead = { logKey: string; jobKey: string; executionKey: string; at: string; deviceCount: number; rows: readonly { key: string; label: string; readable: boolean; status: string; acceptedAt: string | null; completedAt: string | null; otaLabel?: string; otaVersion?: string }[]; continuation?: string }
export type TaskDebugSwitchRead = { checked: boolean; writeToken: number }
export type TaskDebugLogTransport = {
  readDevices?: (project: string, log: string, cursor: string | undefined, signal: AbortSignal) => Promise<TaskDebugDeviceRead>
  readRows: (project: string, job: string | undefined, page: number, signal: AbortSignal) => Promise<TaskDebugLogRead>
  readSwitch: (project: string, job: string, signal: AbortSignal) => Promise<TaskDebugSwitchRead>
  changeSwitch: (project: string, job: string, token: number, checked: boolean) => Promise<TaskDebugSwitchRead>
  eraseTask: (project: string, job: string, token: number) => Promise<TaskDebugSwitchRead>
  eraseProject: (project: string, token: number) => Promise<number>
}

/** 成员可读，管理者可写；同对象隐藏或撤去管理权时保留在途写核对锁。 */
export function useTaskDebugLogState(job: Ref<string | undefined>, transport: TaskDebugLogTransport, available: Ref<boolean> = ref(true)) {
  const allowed = computed(() => available.value && can('task:read'))
  const manage = computed(() => allowed.value && can('task:manage'))
  const browsePage = ref(1), busy = ref(false), locked = ref(false), writeError = ref('')
  // 正式后端limit24、最大offset10000的预算；不是数据总数或原站页数上限。
  const maxBrowsePage = Math.floor(10000 / 24) + 1
  const intent = ref<{ project: string; job: string | undefined; token: number; identity: number; generation: number }>()
  let generation = 0, active = true
  const page = useResource(async signal => {
    const value = await transport.readRows(projectId.value, job.value, browsePage.value, signal)
    if (!value || !Array.isArray(value.rows) || value.rows.length > 24) throw new Error('任务日志返回不完整，请重新读取')
    cas(value.clearToken)
    return value
  })
  function checkedControl(value: TaskDebugSwitchRead): TaskDebugSwitchRead {
    if (!value || typeof value.checked !== 'boolean') throw new Error('调试状态不完整，请重新读取')
    cas(value.writeToken)
    return value
  }
  const deviceLog = ref<string>(), deviceCursors = ref<(string | undefined)[]>([undefined])
  const devices = useResource(async signal => {
    if (!deviceLog.value || !transport.readDevices) throw new Error('任务运行设备读取入口不完整')
    const result = await transport.readDevices(projectId.value, deviceLog.value, deviceCursors.value.at(-1), signal)
    if (result.logKey !== deviceLog.value || job.value && result.jobKey.toLowerCase() !== job.value.toLowerCase()) throw new Error('任务运行日志身份不一致，请重新读取')
    return result
  })
  function closeDevices() { deviceLog.value = undefined; deviceCursors.value = [undefined]; devices.clear() }
  async function openDevices(key: string) {
    if (!allowed.value || !projectId.value || !page.data.value?.rows.some(row => row.key === key && row.deviceCount != null && row.deviceCount > 0)) return
    closeDevices(); deviceLog.value = key; await devices.reload()
  }
  async function nextDevices() {
    if (!allowed.value || devices.loading.value || !devices.data.value?.continuation) return
    deviceCursors.value.push(devices.data.value.continuation); await devices.reload()
  }
  async function previousDevices() {
    if (!allowed.value || devices.loading.value || deviceCursors.value.length < 2) return
    deviceCursors.value.pop(); await devices.reload()
  }
  const control = useResource(async signal => {
    if (!job.value) throw new Error('未指定任务')
    return checkedControl(await transport.readSwitch(projectId.value, job.value, signal))
  })
  function advancedControl(value: TaskDebugSwitchRead, previous: number, checked?: boolean): TaskDebugSwitchRead {
    checkedControl(value)
    if (value.writeToken !== previous + 1 || checked !== undefined && value.checked !== checked) throw new Error('调试状态响应不匹配，请重新读取核对')
    return value
  }
  function capture(writing = false) {
    const project = projectId.value, id = job.value, epoch = identityEpoch(), currentGeneration = generation
    return () => active && generation === currentGeneration && epoch === identityEpoch() && project === projectId.value && id === job.value && allowed.value && (!writing || manage.value)
  }
  function reset() {
    generation++; intent.value = undefined; busy.value = false; locked.value = false; writeError.value = ''
    browsePage.value = 1; page.clear(); control.clear(); closeDevices()
  }
  const dispose = onIdentityChange(reset)
  onScopeDispose(() => { active = false; dispose() })
  watch([projectId, job, allowed, manage], (current, previous) => {
    const retainLock = !!previous && current[0] === previous[0] && current[1] === previous[1] && (busy.value || locked.value)
    reset(); locked.value = retainLock
    if (retainLock) writeError.value = '请重新读取核对最新任务日志与调试状态'
    if (projectId.value && allowed.value) void reload(false)
  }, { immediate: true })
  watch(page.error, cause => { if (cause instanceof ApiError && [401,403,404].includes(cause.status)) { page.data.value = undefined; control.clear(); intent.value = undefined } })
  watch(control.error, cause => { if (cause instanceof ApiError && [401,403,404].includes(cause.status)) { control.data.value = undefined; page.clear(); intent.value = undefined } })
  const ready = computed(() => manage.value && !!projectId.value && !busy.value && !locked.value && !page.loading.value && !page.error.value && !!page.data.value && (!job.value || !control.loading.value && !control.error.value && !!control.data.value))
  const hasNext = computed(() => !!page.data.value && !page.error.value && browsePage.value < maxBrowsePage)
  async function reload(manual = true) {
    if (!projectId.value || !allowed.value || busy.value) return
    const current = capture()
    intent.value = undefined; browsePage.value = 1; closeDevices()
    await Promise.all([page.reload(), ...(job.value ? [control.reload()] : [])])
    if (current() && manual && !page.loading.value && !page.error.value && page.data.value && (!job.value || !control.loading.value && !control.error.value && control.data.value)) { locked.value = false; writeError.value = '' }
  }
  async function retryControl() { if (job.value && allowed.value && !busy.value) await control.reload() }
  async function write(action: () => Promise<TaskDebugSwitchRead | undefined>, cleared: boolean) {
    if (!ready.value) return
    const current = capture(true); busy.value = true; writeError.value = ''
    try {
      const value = await action()
      if (!current()) return
      if (value) control.data.value = checkedControl(value)
      intent.value = undefined
      if (cleared) { closeDevices(); browsePage.value = 1; page.clear(); await page.reload() }
    } catch (cause) {
      if (!current() || cause instanceof IdentityChanged) return
      writeError.value = errorMessage(cause); intent.value = undefined
      if (!(cause instanceof ApiError) || cause.outcomeUnknown || cause.status === 0 || cause.status === 409 || cause.status >= 500) locked.value = true
      if (cause instanceof ApiError && [401,403,404].includes(cause.status)) { control.clear(); page.clear(); page.error.value = cause }
    } finally { if (current()) busy.value = false }
  }
  async function toggle(checked: boolean) {
    if (!ready.value || intent.value || !job.value || !control.data.value || checked === control.data.value.checked) return
    const project = projectId.value, id = job.value, token = control.data.value.writeToken
    await write(async () => advancedControl(await transport.changeSwitch(project, id, token, checked), token, checked), false)
  }
  function openClear() {
    if (!ready.value || intent.value) return
    const token = job.value ? control.data.value?.writeToken : page.data.value?.clearToken
    try { intent.value = { project: projectId.value, job: job.value, token: cas(token), identity: identityEpoch(), generation } }
    catch (cause) { writeError.value = errorMessage(cause) }
  }
  function cancelClear() { if (!busy.value) intent.value = undefined }
  async function confirmClear() {
    const selected = intent.value
    if (!ready.value || !selected || selected.project !== projectId.value || selected.job !== job.value || selected.identity !== identityEpoch() || selected.generation !== generation) return
    await write(async () => {
      if (selected.job) return advancedControl(await transport.eraseTask(selected.project, selected.job, selected.token), selected.token)
      const token = await transport.eraseProject(selected.project, selected.token)
      if (cas(token) !== selected.token + 1) throw new Error('清空响应不匹配，请重新读取核对')
      return undefined
    }, true)
  }
  async function next() {
    if (!allowed.value || page.loading.value || busy.value || intent.value || !hasNext.value) return
    browsePage.value++; await page.reload()
  }
  async function previous() {
    if (!allowed.value || browsePage.value < 2 || page.loading.value || busy.value || intent.value) return
    browsePage.value--; await page.reload()
  }
  return { deviceLog, deviceCursors, devices, openDevices, closeDevices, nextDevices, previousDevices, allowed, manage, page, control, busy, locked, writeError, intent, ready, browsePage, hasNext, reload, retryControl, toggle, openClear, cancelClear, confirmClear, next, previous }
}
