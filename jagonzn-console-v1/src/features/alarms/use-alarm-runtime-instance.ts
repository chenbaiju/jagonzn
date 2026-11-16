import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { can, currentProject, projectId, session } from '../../core/session'
import { ApiError, errorMessage, identityEpoch, onIdentityChange } from '../../core/http'
import { alarmRuntimeInstanceApi, type AlarmRuntimeInstanceIdentity, type AlarmRuntimeInstanceSnapshot, type AlarmRuntimeClearContent } from './alarm-runtime-instance-api'

/** 当前事故的页面会话；历史日志仍读原事件，不以这里的最新状态覆盖历史。 */
export function useAlarmRuntimeInstance(identity: () => AlarmRuntimeInstanceIdentity | undefined, visible: () => boolean = () => true) {
  const value = shallowRef<AlarmRuntimeInstanceSnapshot>(), error = ref(''), loading = ref(false), writing = ref(false)
  const denied = ref(false), review = ref(false), checked = ref(false), confirming = ref(false)
  const readable = computed(() => !!projectId.value && !!identity()?.instanceId && can('alarm:read') && !denied.value)
  const writable = computed(() => readable.value && can('alarm:maintain') && currentProject.value?.status === 'ACTIVE')
  const canClear = computed(() => visible() && writable.value && !!value.value && value.value.conditionState !== 'CLEARED' && value.value.version < 2147483647 && !loading.value && !writing.value && !review.value && !confirming.value)
  const canContinue = computed(() => visible() && readable.value && review.value && checked.value && !!value.value && !loading.value && !writing.value)
  let generation = 0, request = 0, disposed = false, controller: AbortController | undefined
  let selected: { project: string; expected: AlarmRuntimeInstanceIdentity; before: AlarmRuntimeInstanceSnapshot; generation: number; epoch: number } | undefined
  const current = (g: number, epoch: number) => !disposed && generation === g && epoch === identityEpoch()
  function erase() { request++; controller?.abort(); value.value = undefined; error.value = ''; loading.value = false; checked.value = false; selected = undefined; confirming.value = false }
  function reset() { generation++; erase(); writing.value = false; denied.value = false; review.value = false }
  function refuse(cause: unknown) { erase(); denied.value = true; error.value = errorMessage(cause) }
  async function read(explicit = false) {
    if (!visible() || !readable.value || writing.value || confirming.value) return
    const expected = identity(); if (!expected) return
    const g = generation, epoch = identityEpoch(), seq = ++request, project = projectId.value
    controller?.abort(); const active = new AbortController(); controller = active
    value.value = undefined; checked.value = false; error.value = ''; loading.value = true
    try {
      const result = await alarmRuntimeInstanceApi.read(project, Object.freeze({ ...expected }), active.signal)
      if (!current(g, epoch) || seq !== request || !visible() || !readable.value) return
      value.value = result; checked.value = explicit && review.value
    } catch (cause) {
      if (!current(g, epoch) || seq !== request || active.signal.aborted) return
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) refuse(cause)
      else error.value = errorMessage(cause)
    } finally { if (current(g, epoch) && seq === request) loading.value = false }
  }
  /** 先冻结原事故版本，再由页面展示原站确认框；确认期间不换成后来的版本。 */
  function beginClear() {
    if (!canClear.value || !value.value) return false
    selected = { project: projectId.value, expected: Object.freeze({ ...identity()! }), before: value.value, generation, epoch: identityEpoch() }
    confirming.value = true; return true
  }
  function cancelClear() { if (!writing.value) { selected = undefined; confirming.value = false } }
  async function confirmClear(content?:AlarmRuntimeClearContent) {
    const intent = selected
    if (!intent || !confirming.value || !visible() || !writable.value || writing.value || review.value || !current(intent.generation, intent.epoch)) return false
    writing.value = true; review.value = true; checked.value = false; error.value = ''
    controller?.abort(); const active = new AbortController(); controller = active
    try {
      const result = await alarmRuntimeInstanceApi.clear(intent.project, intent.before, active.signal, content)
      if (!current(intent.generation, intent.epoch) || !visible() || !writable.value || active.signal.aborted) return false
      value.value = result; review.value = false; return true
    } catch (cause) {
      if (!current(intent.generation, intent.epoch) || !visible() || active.signal.aborted) return false
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) refuse(cause)
      else { value.value = undefined; error.value = errorMessage(cause) }
      return false
    } finally {
      if (current(intent.generation, intent.epoch)) { selected = undefined; confirming.value = false; writing.value = false }
    }
  }
  /** 明确读当前事实不证明原请求历史结果；必须由用户再次选择才解除本地写保护。 */
  function continueWithCurrent() { if (!canContinue.value) return false; review.value = false; checked.value = false; return true }
  const changed = () => { reset(); if (visible()) void read() }
  const stop = onIdentityChange(changed)
  watch(() => [projectId.value, identity()?.instanceId, identity()?.ruleId, identity()?.deviceId, session.user?.accountId, can('alarm:read'), can('alarm:maintain'), currentProject.value?.status], changed, { immediate: true, flush: 'sync' })
  watch(visible, shown => { erase(); if (shown) void read() }, { flush: 'sync' })
  onScopeDispose(() => { disposed = true; reset(); stop() })
  return { value, error, loading, writing, denied, review, confirming, readable, writable, canClear, canContinue, reload: () => read(false), reread: () => read(true), beginClear, cancelClear, confirmClear, continueWithCurrent }
}
