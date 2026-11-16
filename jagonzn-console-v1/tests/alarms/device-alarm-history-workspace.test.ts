import { alarmLogEvaluationApi } from '../../src/features/alarms/alarm-log-evaluation-api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { session } from '../../src/core/session'
import { ApiError, changeIdentity } from '../../src/core/http'
import { alarmTransitionLogApi } from '../../src/features/alarms/alarm-transition-log-api'
import { useDeviceAlarmHistory } from '../../src/features/alarms/use-device-alarm-history'
import { project, device, other, rule, event, row, legacyEvaluation } from './device-alarm-history-fixture'
vi.mock('../../src/features/alarms/alarm-transition-log-api', () => ({ alarmTransitionLogApi: { page: vi.fn(), get: vi.fn() } }))
vi.mock('../../src/features/alarms/alarm-log-evaluation-api', () => ({ alarmLogEvaluationApi: { get: vi.fn() } }))
let scope: ReturnType<typeof effectScope> | undefined
async function setup(options: { rule?: string; ruleOnly?: boolean; visible?: boolean; permissions?: string[] } = {}) {
  vi.mocked(alarmLogEvaluationApi.get).mockResolvedValue(legacyEvaluation())
  session.user = { accountId: project, currentProjectId: project, permissions: options.permissions ?? ['device:read', 'alarm:read'] }
  vi.mocked(alarmTransitionLogApi.page).mockImplementation(async (_project, query) => ({
    items: [row], page: query?.page ?? 1, limit: 24, total: '49',
  }))
  vi.mocked(alarmTransitionLogApi.get).mockResolvedValue(row)
  const id = ref(options.ruleOnly ? undefined : device), ruleId = ref(options.rule), visible = ref(options.visible ?? true)
  scope = effectScope()
  const w = scope.run(() => useDeviceAlarmHistory(() => id.value, () => ruleId.value, () => visible.value))!
  await flushPromises()
  return { w, id, ruleId, visible }
}
afterEach(() => { scope?.stop(); scope = undefined; vi.resetAllMocks(); session.user = null; changeIdentity() })
describe('设备不可变告警历史的固定范围与迟到隔离', () => {
  it('设备与可选规则固定进入真实分页请求，筛选参数不能覆盖', async () => {
    const { w } = await setup({ rule })
    expect(alarmTransitionLogApi.page).toHaveBeenCalledExactlyOnceWith(project,
      { deviceId: device, ruleId: rule, page: 1, limit: 24 }, expect.any(AbortSignal))
    await w.setFilters({ status: 'ok', deviceId: other, ruleId: other } as never)
    expect(alarmTransitionLogApi.page).toHaveBeenLastCalledWith(project,
      { status: 'ok', from: undefined, before: undefined, deviceId: device, ruleId: rule, page: 1, limit: 24 }, expect.any(AbortSignal))
  })
  it('设备列表回错任一设备时整页拒绝，不截取为假成功', async () => {
    const { w } = await setup()
    vi.mocked(alarmTransitionLogApi.page).mockResolvedValue({ items: [{ ...row, deviceId: other }], total: '1', page: 1, limit: 24 })
    await w.reload()
    expect(w.list.data.value).toBeUndefined()
    expect(String(w.error.value)).toContain('范围外')
  })
  it('规则子历史也逐行核对原规则', async () => {
    const { w } = await setup({ rule })
    vi.mocked(alarmTransitionLogApi.page).mockResolvedValue({ items: [{ ...row, ruleId: other }], total: '1', page: 1, limit: 24 })
    await w.reload()
    expect(w.list.data.value).toBeUndefined()
    expect(String(w.error.value)).toContain('范围外')
  })
  it('类型规则历史可包含不同设备，丢失规则范围后停止读取', async () => {
    const { w, ruleId } = await setup({ rule, ruleOnly: true, permissions: ['alarm:read'] })
    expect(alarmTransitionLogApi.page).toHaveBeenCalledExactlyOnceWith(project,
      { deviceId: undefined, ruleId: rule, page: 1, limit: 24 }, expect.any(AbortSignal))
    vi.mocked(alarmTransitionLogApi.get).mockResolvedValue({ ...row, deviceId: other })
    await w.openLog(event)
    expect(w.detail.data.value?.deviceId).toBe(other)
    vi.mocked(alarmTransitionLogApi.get).mockResolvedValue({ ...row, ruleId: other })
    await w.openLog(event)
    expect(String(w.detail.error.value)).toContain('范围外')
    ruleId.value = undefined
    await w.reload()
    expect(w.list.data.value).toBeUndefined()
    expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(1)
  })
  it('详情只读当前已核验列表事件ID，不拿事故ID或其他ID直达', async () => {
    const { w } = await setup()
    await w.openLog(row.instanceId)
    expect(alarmTransitionLogApi.get).not.toHaveBeenCalled()
    await w.openLog(event)
    expect(alarmTransitionLogApi.get).toHaveBeenCalledExactlyOnceWith(project, event, expect.any(AbortSignal))
    expect(w.detail.data.value?.id).toBe(event)
  })
  it('详情回错设备拒绝，不显示其维护或通知资料', async () => {
    const { w } = await setup()
    vi.mocked(alarmTransitionLogApi.get).mockResolvedValue({ ...row, deviceId: other })
    await w.openLog(event)
    expect(w.detail.data.value).toBeUndefined()
    expect(String(w.detail.error.value)).toContain('范围外')
  })
  it('换设备时中止旧请求并清筛选与详情，旧响应不能填充新范围', async () => {
    const { w, id } = await setup()
    await w.setFilters({ status: 'ok' }); await w.openLog(event)
    let done!: (value: any) => void
    vi.mocked(alarmTransitionLogApi.page).mockImplementationOnce(() => new Promise(resolve => { done = resolve }))
      .mockResolvedValueOnce({ items: [], total: '0', page: 1, limit: 24 })
    const pending = w.reload(); id.value = other
    await flushPromises(); done({ items: [row], total: '49', page: 1, limit: 24 }); await pending
    expect(w.query.value.deviceId).toBe(other); expect(w.filters.value).toEqual({})
    expect(w.selectedLogId.value).toBe(''); expect(w.detail.data.value).toBeUndefined()
    expect(w.list.data.value?.items).toEqual([])
  })
  it('隐藏不再读取，重新显示保留筛选但重读，关闭隐藏前的详情', async () => {
    const { w, visible } = await setup()
    await w.setFilters({ status: 'pending' }); await w.openLog(event)
    visible.value = false
    const count = vi.mocked(alarmTransitionLogApi.page).mock.calls.length
    await w.refresh(); await w.openLog(event)
    expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(count)
    expect(w.selectedLogId.value).toBe(''); expect(w.list.data.value).toBeUndefined()
    visible.value = true; await flushPromises()
    expect(w.filters.value.status).toBe('pending')
    expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(count + 1)
  })
  it('撤设备读权限即清全部私有资料，不因alarm读权限仍在而继续', async () => {
    const { w } = await setup(); await w.openLog(event)
    session.user = { ...session.user!, permissions: ['alarm:read'] }
    await flushPromises(); const count = vi.mocked(alarmTransitionLogApi.page).mock.calls.length
    await w.reload(); await w.openLog(event)
    expect(w.readable.value).toBe(false); expect(w.list.data.value).toBeUndefined(); expect(w.detail.data.value).toBeUndefined()
    expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(count)
  })
  it('同项目同设备换账号清资料与筛选，不沿用旧账号响应', async () => {
    const { w } = await setup(); await w.setFilters({ status: 'ok' }); await w.openLog(event)
    vi.mocked(alarmTransitionLogApi.page).mockResolvedValue({ items: [], total: '0', page: 1, limit: 24 })
    session.user = { ...session.user!, accountId: other }
    await flushPromises()
    expect(w.filters.value).toEqual({}); expect(w.selectedLogId.value).toBe('')
    expect(w.detail.data.value).toBeUndefined(); expect(w.list.data.value?.total).toBe('0')
  })
  it('详情403拒读后清列表，普通重试不能恢复旧私有状态', async () => {
    const { w } = await setup()
    vi.mocked(alarmTransitionLogApi.get).mockRejectedValue(new ApiError('禁止读取', 403))
    await w.openLog(event)
    const calls = vi.mocked(alarmTransitionLogApi.page).mock.calls.length
    await w.reload(); await w.openLog(event)
    expect(w.denied.value).toBe(true); expect(w.list.data.value).toBeUndefined(); expect(w.detail.data.value).toBeUndefined()
    expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(calls)
  })
  it('只有实际total允许分页，分页仍固定设备/规则与24条', async () => {
    const { w } = await setup({ rule })
    await w.selectPage(3); await w.selectPage(4)
    expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(2)
    expect(alarmTransitionLogApi.page).toHaveBeenLastCalledWith(project,
      { deviceId: device, ruleId: rule, page: 3, limit: 24 }, expect.any(AbortSignal))
    await w.refresh(); expect(w.page.value).toBe(1)
  })
  it('初始隐藏或缺设备权限不调用', async () => {
    await setup({ visible: false }); expect(alarmTransitionLogApi.page).not.toHaveBeenCalled()
  })
  it('原件只在已核列表和对应详情成功后读取，列表多行及错详情不产生原件请求', async () => {
    const { w } = await setup({ rule })
    const second = { ...row, id: other }
    vi.mocked(alarmTransitionLogApi.page).mockResolvedValue({ items: [row, second], total: '2', page: 1, limit: 24 })
    await w.reload()
    expect(w.list.data.value?.items).toHaveLength(2)
    expect(alarmLogEvaluationApi.get).not.toHaveBeenCalled()
    let detailReady!: (value: typeof row) => void
    vi.mocked(alarmTransitionLogApi.get).mockImplementationOnce(() => new Promise(resolve => { detailReady = resolve }))
    const selected = w.openLog(event)
    await flushPromises()
    expect(alarmTransitionLogApi.get).toHaveBeenCalledExactlyOnceWith(project, event, expect.any(AbortSignal))
    expect(alarmLogEvaluationApi.get).not.toHaveBeenCalled()
    detailReady(row); await selected
    expect(alarmLogEvaluationApi.get).toHaveBeenCalledExactlyOnceWith(project, row, expect.any(AbortSignal))
    expect(w.evaluation.data.value).toEqual(legacyEvaluation(row))
    vi.mocked(alarmLogEvaluationApi.get).mockClear()
    vi.mocked(alarmTransitionLogApi.get).mockResolvedValueOnce({ ...second, deviceId: other })
    await w.openLog(other)
    expect(w.detail.data.value).toBeUndefined()
    expect(w.evaluation.data.value).toBeUndefined()
    expect(String(w.detail.error.value)).toContain('范围外')
    expect(alarmLogEvaluationApi.get).not.toHaveBeenCalled()
    vi.mocked(alarmTransitionLogApi.page).mockResolvedValueOnce({ items: [{ ...row, ruleId: other }], total: '1', page: 1, limit: 24 })
    await w.reload(); await w.openLog(event)
    expect(w.list.data.value).toBeUndefined()
    expect(alarmTransitionLogApi.get).toHaveBeenCalledTimes(2)
    expect(alarmLogEvaluationApi.get).not.toHaveBeenCalled()
  })
  it('原件延迟期间换设备、identity或隐藏后，晚回均不能复活旧事件和详情', async () => {
    for (const transition of ['device', 'identity', 'hide'] as const) {
      scope?.stop(); scope = undefined; vi.resetAllMocks()
      const { w, id, visible } = await setup({ rule })
      let finish!: (value: ReturnType<typeof legacyEvaluation>) => void
      vi.mocked(alarmLogEvaluationApi.get).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      const pending = w.openLog(event)
      await flushPromises()
      expect(alarmLogEvaluationApi.get).toHaveBeenCalledExactlyOnceWith(project, row, expect.any(AbortSignal))
      const signal = vi.mocked(alarmLogEvaluationApi.get).mock.calls[0]![2]!
      vi.mocked(alarmTransitionLogApi.page).mockResolvedValue({ items: [], total: '0', page: 1, limit: 24 })
      if (transition === 'device') id.value = other
      if (transition === 'identity') changeIdentity('replacement-identity-fixture-only')
      if (transition === 'hide') visible.value = false
      await flushPromises()
      expect(signal.aborted).toBe(true)
      expect(w.selectedLogId.value).toBe('')
      expect(w.detail.data.value).toBeUndefined()
      expect(w.evaluation.data.value).toBeUndefined()
      finish(legacyEvaluation(row)); await pending; await flushPromises()
      expect(w.selectedLogId.value).toBe('')
      expect(w.detail.data.value).toBeUndefined()
      expect(w.evaluation.data.value).toBeUndefined()
      expect(w.list.data.value?.items ?? []).toEqual([])
      expect(alarmLogEvaluationApi.get).toHaveBeenCalledTimes(1)
    }
  })
  it('原件GET403清除列表详情与原件并锁定拒读，普通重读不能再次请求', async () => {
    const { w } = await setup({ rule })
    vi.mocked(alarmLogEvaluationApi.get).mockRejectedValueOnce(new ApiError('原件禁止读取', 403))
    await w.openLog(event)
    expect(alarmTransitionLogApi.get).toHaveBeenCalledExactlyOnceWith(project, event, expect.any(AbortSignal))
    expect(alarmLogEvaluationApi.get).toHaveBeenCalledExactlyOnceWith(project, row, expect.any(AbortSignal))
    expect(w.denied.value).toBe(true); expect(w.readable.value).toBe(false)
    expect(w.list.data.value).toBeUndefined(); expect(w.detail.data.value).toBeUndefined()
    expect(w.evaluation.data.value).toBeUndefined(); expect(w.selectedLogId.value).toBe('')
    expect(w.error.value).toMatchObject({ status: 403, message: '原件禁止读取' })
    const pages = vi.mocked(alarmTransitionLogApi.page).mock.calls.length
    await w.reload(); await w.refresh(); await w.openLog(event)
    expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(pages)
    expect(alarmTransitionLogApi.get).toHaveBeenCalledTimes(1)
    expect(alarmLogEvaluationApi.get).toHaveBeenCalledTimes(1)
    expect(w.list.data.value).toBeUndefined(); expect(w.detail.data.value).toBeUndefined()
    expect(w.evaluation.data.value).toBeUndefined()
  })
})
