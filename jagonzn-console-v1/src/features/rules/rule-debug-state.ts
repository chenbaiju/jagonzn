import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { can, projectId } from '@/core/session'
import { ApiError, IdentityChanged, errorMessage, identityEpoch, onIdentityChange } from '@/core/http'
import { useResource } from '@/core/use-resource'
import { cas } from './models'
import type { DebugLogDisplayRow } from './RuleDebugLogTable.vue'

/** 转换后的展示投影；正式HTTP适配器必须先用生成Schema读取校验，不能将此当服务端DTO。 */
export type DebugLogRead = { rows: readonly DebugLogDisplayRow[]; continuation?: string; clearToken: number }
export type DebugSwitchRead = { checked: boolean; writeToken: number }
/** 不包含URL或服务端字段假定；由正式生成合同适配器转换到展示投影后接入。 */
export type DebugLogTransport = {
  readRows: (project: string, rule: string | undefined, cursor: string | undefined, signal: AbortSignal) => Promise<DebugLogRead>
  readNumberedRows?: (project: string, rule: string | undefined, page: number, signal: AbortSignal) => Promise<DebugLogRead>
  readSwitch: (project: string, rule: string, signal: AbortSignal) => Promise<DebugSwitchRead>
  changeSwitch: (project: string, rule: string, token: number, checked: boolean) => Promise<DebugSwitchRead>
  eraseRule: (project: string, rule: string, token: number) => Promise<DebugSwitchRead>
  eraseProject: (project: string, token: number) => Promise<number>
}

/** 正式项目页和详情页共用意图/读取状态；父对象暂不可用或离开页签时保留未核对写入锁。 */
export function useRuleDebugLogState(rule: Ref<string | undefined>, transport: DebugLogTransport, available: Ref<boolean> = ref(true)) {
  const allowed = computed(() => available.value && can('rule:manage'))
  const cursors = ref<(string | undefined)[]>([undefined]), busy = ref(false), locked = ref(false), writeError = ref('')
  const browsePage = ref(1)
  // 当前真实GET使用limit24、最大offset10000；页数预算不是数据总数或原站上限。
  const maxBrowsePage = Math.floor(10000 / 24) + 1
  const intent = ref<{ project: string; rule: string | undefined; token: number; identity: number; generation: number }>()
  let generation = 0, active = true
  const page = useResource(async signal => {
    const value = transport.readNumberedRows
      ? await transport.readNumberedRows(projectId.value, rule.value, browsePage.value, signal)
      : await transport.readRows(projectId.value, rule.value, cursors.value.at(-1), signal)
    if (!Array.isArray(value.rows) || value.continuation !== undefined && (typeof value.continuation !== 'string' || !value.continuation || value.continuation.length > 8192 || cursors.value.includes(value.continuation))) throw new Error('日志分页不完整，请刷新后重试')
    cas(value.clearToken)
    return value
  })
  const control = useResource(async signal => {
    if (!rule.value) throw new Error('未指定规则')
    return checkedControl(await transport.readSwitch(projectId.value, rule.value, signal))
  })
  function checkedControl(value: DebugSwitchRead): DebugSwitchRead {
    if (typeof value.checked !== 'boolean') throw new Error('调试状态不完整，请重新读取')
    cas(value.writeToken)
    return value
  }
  function advancedControl(value: DebugSwitchRead, previous: number, checked?: boolean): DebugSwitchRead {
    checkedControl(value)
    if (value.writeToken !== previous + 1 || checked !== undefined && value.checked !== checked) throw new Error('调试状态响应不匹配，请重新读取核对')
    return value
  }
  function capture() {
    const project = projectId.value, id = rule.value, epoch = identityEpoch(), currentGeneration = generation
    return () => active && generation === currentGeneration && identityEpoch() === epoch && projectId.value === project && rule.value === id && allowed.value
  }
  function reset() {
    generation++; intent.value = undefined; busy.value = false; locked.value = false; writeError.value = ''
    cursors.value = [undefined]; browsePage.value = 1; page.clear(); control.clear()
  }
  const dispose = onIdentityChange(reset)
  onScopeDispose(() => { active = false; dispose() })
  watch([projectId, rule, allowed], (current, previous) => {
    const retainLock = !!previous && current[0] === previous[0] && current[1] === previous[1] && (busy.value || locked.value)
    reset(); locked.value = retainLock
    if (retainLock) writeError.value = '请重新读取核对最新日志与调试状态'
    if (projectId.value && allowed.value) void reload(false)
  }, { immediate: true })
  watch(page.error, cause => { if (cause instanceof ApiError && [401,403,404].includes(cause.status)) { page.data.value = undefined; control.clear(); intent.value = undefined } })
  watch(control.error, cause => { if (cause instanceof ApiError && [401,403,404].includes(cause.status)) { control.data.value = undefined; page.clear(); intent.value = undefined } })

  const ready = computed(() => allowed.value && !!projectId.value && !busy.value && !locked.value && !page.loading.value && !page.error.value && !!page.data.value && (!rule.value || !control.loading.value && !control.error.value && !!control.data.value))
  const displayPage = computed(() => transport.readNumberedRows ? browsePage.value : cursors.value.length)
  const hasNext = computed(() => !!page.data.value && !page.error.value && (transport.readNumberedRows ? browsePage.value < maxBrowsePage : !!page.data.value.continuation))
  async function reload(manual = true) {
    if (!projectId.value || !allowed.value || busy.value) return
    const current = capture()
    intent.value = undefined; cursors.value = [undefined]; browsePage.value = 1
    await Promise.all([page.reload(), ...(rule.value ? [control.reload()] : [])])
    if (current() && manual && !page.loading.value && !page.error.value && page.data.value && (!rule.value || !control.loading.value && !control.error.value && control.data.value)) { locked.value = false; writeError.value = '' }
  }
  async function retryControl() { if (rule.value && allowed.value && !busy.value) await control.reload() }
  async function write(action: () => Promise<DebugSwitchRead | undefined>, cleared: boolean) {
    if (!ready.value) return
    const current = capture(); busy.value = true; writeError.value = ''
    try {
      const value = await action()
      if (!current()) return
      if (value) control.data.value = checkedControl(value)
      intent.value = undefined
      if (cleared) { cursors.value = [undefined]; browsePage.value = 1; page.clear(); await page.reload() }
    } catch (cause) {
      if (!current() || cause instanceof IdentityChanged) return
      writeError.value = errorMessage(cause); intent.value = undefined
      if (!(cause instanceof ApiError) || cause.outcomeUnknown || cause.status === 0 || cause.status === 409 || cause.status >= 500) locked.value = true
      if (cause instanceof ApiError && [401,403,404].includes(cause.status)) { control.clear(); page.clear(); page.error.value = cause }
    } finally { if (current()) busy.value = false }
  }
  async function toggle(checked: boolean) {
    if (!ready.value || intent.value || !rule.value || !control.data.value || checked === control.data.value.checked) return
    const project = projectId.value, id = rule.value, token = control.data.value.writeToken
    await write(async () => advancedControl(await transport.changeSwitch(project, id, token, checked), token, checked), false)
  }
  function openClear() {
    if (!ready.value || intent.value) return
    const token = rule.value ? control.data.value?.writeToken : page.data.value?.clearToken
    try { intent.value = { project: projectId.value, rule: rule.value, token: cas(token), identity: identityEpoch(), generation } }
    catch (cause) { writeError.value = errorMessage(cause) }
  }
  function cancelClear() { if (!busy.value) intent.value = undefined }
  async function confirmClear() {
    const selected = intent.value
    if (!ready.value || !selected || selected.project !== projectId.value || selected.rule !== rule.value || selected.identity !== identityEpoch() || selected.generation !== generation) return
    await write(async () => {
      if (selected.rule) return advancedControl(await transport.eraseRule(selected.project, selected.rule, selected.token), selected.token)
      const token = await transport.eraseProject(selected.project, selected.token)
      if (cas(token) !== selected.token + 1) throw new Error('清空响应不匹配，请重新读取核对')
      return undefined
    }, true)
  }
  async function next() {
    if (!allowed.value || page.loading.value || busy.value || intent.value || page.error.value) return
    if (transport.readNumberedRows) {
      if (!hasNext.value) return
      browsePage.value++; await page.reload(); return
    }
    const cursor = page.data.value?.continuation
    if (!cursor) return
    cursors.value.push(cursor); await page.reload()
  }
  async function previous() {
    if (!allowed.value || displayPage.value < 2 || page.loading.value || busy.value || intent.value) return
    if (transport.readNumberedRows) browsePage.value--
    else cursors.value.pop()
    await page.reload()
  }
  return { allowed, page, control, busy, locked, writeError, intent, ready, cursors, browsePage, displayPage, hasNext, reload, retryControl, toggle, openClear, cancelClear, confirmClear, next, previous }
}
