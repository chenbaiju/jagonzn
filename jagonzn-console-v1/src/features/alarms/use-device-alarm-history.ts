import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { can, projectId, session } from '../../core/session'
import { ApiError, onIdentityChange } from '../../core/http'
import { useResource } from '../../core/use-resource'
import { alarmTransitionLogApi, type AlarmLog, type AlarmLogQuery } from './alarm-transition-log-api'
import { alarmLogEvaluationApi } from './alarm-log-evaluation-api'

export type DeviceAlarmHistoryFilters = Pick<AlarmLogQuery, 'status' | 'from' | 'before'>
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** 请求和回读均核验设备、规则或两者的交集，至少需要一个有效范围。 */
export function useDeviceAlarmHistory(device: () => string | undefined, rule: () => string | undefined = () => undefined,
  visible: () => boolean = () => true) {
  const page = ref(1), limit = 24, filters = shallowRef<DeviceAlarmHistoryFilters>({}), selectedLogId = ref('')
  const denied = ref(false), refusal = shallowRef<unknown>()
  const readable = computed(() => {
    const deviceId = device(), ruleId = rule()
    return !!projectId.value && can('alarm:read') && !denied.value
      && (deviceId === undefined ? !!ruleId : uuid.test(deviceId) && can('device:read'))
      && (ruleId === undefined || uuid.test(ruleId))
  })
  const query = computed<AlarmLogQuery>(() => ({ ...filters.value, deviceId: device(), ...(rule() === undefined ? {} : { ruleId: rule() }) }))
  function matches(row: AlarmLog, expectedDevice: string | undefined, expectedRule: string | undefined) {
    if (expectedDevice !== undefined && row.deviceId !== expectedDevice || expectedRule !== undefined && row.ruleId !== expectedRule) {
      throw new Error('告警历史返回了当前设备或规则范围外的事件')
    }
    return row
  }
  const list = useResource(async signal => {
    const expectedDevice = device(), expectedRule = rule()
    const result = await alarmTransitionLogApi.page(projectId.value, { ...query.value, page: page.value, limit }, signal)
    result.items.forEach(row => matches(row, expectedDevice, expectedRule))
    return result
  })
  const detail = useResource(async signal => {
    const expectedDevice = device(), expectedRule = rule(), id = selectedLogId.value
    return matches(await alarmTransitionLogApi.get(projectId.value, id, signal), expectedDevice, expectedRule)
  })
  const evaluation = useResource(async signal => {
    const expected = detail.data.value
    if (!expected || expected.id !== selectedLogId.value) throw new Error('请重新读取告警事件')
    return alarmLogEvaluationApi.get(projectId.value, expected, signal)
  })
  const error = computed(() => refusal.value ?? list.error.value)
  function closeLog() { selectedLogId.value = ''; detail.clear(); evaluation.clear() }
  function erase() { list.clear(); closeLog() }
  function reset() { page.value = 1; filters.value = {}; denied.value = false; refusal.value = undefined; erase() }
  async function reload() {
    if (!visible() || !readable.value) return
    erase()
    await list.reload()
  }
  /** 已核对的维护写入只刷新当前列表，不把仍在查看的不可变事件详情一并关闭。 */
  async function refreshMaintenance() {
    if (!visible() || !readable.value) return
    await list.reload()
  }
  async function refresh() { if (readable.value && visible()) { page.value = 1; await reload() } }
  async function setFilters(value: DeviceAlarmHistoryFilters) {
    if (!readable.value || !visible()) return
    filters.value = Object.freeze({ status: value.status, from: value.from, before: value.before })
    page.value = 1
    await reload()
  }
  async function selectPage(value: number) {
    const total = list.data.value?.total
    if (!readable.value || !visible() || list.loading.value || total === undefined || !Number.isSafeInteger(value)
      || value < 1 || value > 2147483647 || value === page.value
      || BigInt(value) > ((BigInt(total) + BigInt(limit) - 1n) / BigInt(limit) || 1n)) return
    page.value = value
    await reload()
  }
  async function openLog(id: string) {
    if (!readable.value || !visible() || !list.data.value?.items.some(row => row.id === id)) return
    closeLog(); selectedLogId.value = id
    await detail.reload()
    if (readable.value && visible() && selectedLogId.value === id && detail.data.value?.id === id) await evaluation.reload()
  }
  watch([list.error, detail.error, evaluation.error], errors => {
    const cause = errors.find(value => value instanceof ApiError && [401, 403, 404].includes(value.status))
    if (cause) { refusal.value = cause; denied.value = true; erase() }
  }, { flush: 'sync' })
  watch(() => [projectId.value, device(), rule(), session.user?.accountId, can('device:read'), can('alarm:read')],
    () => { reset(); void reload() }, { immediate: true, flush: 'sync' })
  watch(visible, shown => { erase(); if (shown) void reload() }, { flush: 'sync' })
  const stopIdentity = onIdentityChange(() => { reset(); void reload() })
  onScopeDispose(() => { erase(); stopIdentity() })
  return { page, limit, filters, query, readable, denied, error, list, detail, evaluation, selectedLogId,
    reload, refreshMaintenance, refresh, setFilters, selectPage, openLog, closeLog }
}
