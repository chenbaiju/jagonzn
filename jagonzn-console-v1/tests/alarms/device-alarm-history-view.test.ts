import { alarmLogEvaluationApi } from '../../src/features/alarms/alarm-log-evaluation-api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import ElementPlus from 'element-plus'
import Page from '../../src/features/alarms/DeviceAlarmHistory.vue'
import { alarmTransitionLogApi } from '../../src/features/alarms/alarm-transition-log-api'
import { alarmLogMaintenanceApi } from '../../src/features/alarms/alarm-log-maintenance-api'
import { session } from '../../src/core/session'
import { ApiError, changeIdentity } from '../../src/core/http'
import { project, device, other, rule, event, row, legacyEvaluation } from './device-alarm-history-fixture'
vi.mock('../../src/features/alarms/alarm-transition-log-api', () => ({ alarmTransitionLogApi: { page: vi.fn(), get: vi.fn() } }))
vi.mock('../../src/features/alarms/alarm-log-maintenance-api', async original => ({
  ...await original<typeof import('../../src/features/alarms/alarm-log-maintenance-api')>(),
  alarmLogMaintenanceApi: { read: vi.fn(), save: vi.fn() },
}))
vi.mock('../../src/features/alarms/alarm-log-evaluation-api', () => ({ alarmLogEvaluationApi: { get: vi.fn() } }))
let wrapper: ReturnType<typeof mount> | undefined
let maintenance = { eventId: event, version: 0, alarmReason: '', solution: '', remark: '',
  updatedBy: null as string | null, createdAt: null as string | null, updatedAt: null as string | null }
async function setup(options: { normal?: boolean; maintain?: boolean; ruleId?: string } = {}) {
  vi.mocked(alarmLogEvaluationApi.get).mockResolvedValue(legacyEvaluation())
  session.user = { accountId: project, currentProjectId: project, permissions: ['device:read', 'alarm:read', ...(options.maintain ? ['alarm:maintain'] : [])] }
  session.projects = [{ id: project, status: 'ACTIVE' }]
  const current = () => ({ ...row, ...(options.normal === false ? { state: 'alerting', level: 3, clearReason: null } : {}),
    maintenanceAlarmReason: maintenance.alarmReason, maintenanceSolution: maintenance.solution, maintenanceRemark: maintenance.remark })
  vi.mocked(alarmTransitionLogApi.page).mockImplementation(async (_project, query) => ({ items: [current()], total: '49', page: query?.page ?? 1, limit: 24 }))
  vi.mocked(alarmTransitionLogApi.get).mockImplementation(async () => current())
  vi.mocked(alarmLogMaintenanceApi.read).mockImplementation(async () => ({ ...maintenance }))
  vi.mocked(alarmLogMaintenanceApi.save).mockImplementation(async (_project, _event, body) => {
    maintenance = { eventId: event, ...body, version: body.version + 1, updatedBy: project,
      createdAt: '2026-10-24T00:00:00Z', updatedAt: '2026-10-24T00:01:00Z' }
    return { ...maintenance }
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Page },
    { path: '/devices/:deviceId', component: { template: '<div>设备</div>' } }] })
  await router.push('/'); await router.isReady()
  wrapper = mount(Page, { props: { deviceId: device, ...(options.ruleId ? { ruleId: options.ruleId } : {}) },
    slots: { leading: '<span>告警历史</span>' }, global: { plugins: [ElementPlus, router], stubs: {
      ElDialog: { props: ['modelValue', 'title'], template: '<div v-if="modelValue" class="dialog-fixture"><h2>{{title}}</h2><slot/><slot name="footer"/></div>' },
      ManagedAlarmLogExportDialog: { props: ['modelValue', 'filters'], template: '<div v-if="modelValue" class="export-fixture">{{JSON.stringify(filters)}}</div>' },
    } } })
  await flushPromises()
  return wrapper
}
afterEach(() => {
  wrapper?.unmount(); wrapper = undefined; vi.resetAllMocks(); session.user = null; session.projects = []; changeIdentity()
  maintenance = { eventId: event, version: 0, alarmReason: '', solution: '', remark: '', updatedBy: null, createdAt: null, updatedAt: null }
})
describe('设备历史时间轴与维护通知接线', () => {
  it('使用不可变时间轴并支持卡片正文/键盘打开，只读事件ID不逐行读维护', async () => {
    maintenance.alarmReason = '<img src=x onerror=alert(1)>\n原因'
    const w = await setup()
    expect(w.find('.history-card').text()).toContain('原因')
    expect(w.find('.history-card img').exists()).toBe(false)
    expect(alarmTransitionLogApi.get).not.toHaveBeenCalled(); expect(alarmLogMaintenanceApi.read).not.toHaveBeenCalled()
    await w.find('.alarm-info').trigger('keydown', { key: 'Enter' }); await flushPromises()
    expect(alarmTransitionLogApi.get).toHaveBeenCalledExactlyOnceWith(project, event, expect.any(AbortSignal))
    expect(w.find('.dialog-fixture').text()).toContain('告警已人工解除')
    expect(alarmLogMaintenanceApi.read).toHaveBeenCalledExactlyOnceWith(project, event, expect.any(AbortSignal))
    expect(w.find('.failed-text').attributes('aria-label')).toContain('DEAD_LETTER')
  })
  it('正常详情空维护显示三项无和三个编辑入口，读者不显示编辑', async () => {
    const w = await setup({ maintain: true })
    await w.find('.alarm-state').trigger('click'); await flushPromises()
    expect(w.findAll('.alarm-maintenance-detail p').map(p => p.text())).toEqual(['无', '无', '无'])
    expect(w.findAll('.alarm-maintenance-detail button')).toHaveLength(3)
    session.user = { ...session.user!, permissions: ['device:read', 'alarm:read'] }; await flushPromises()
    expect(w.findAll('.alarm-maintenance-detail button')).toHaveLength(0)
  })
  it('告警中详情只允许原因和备注，不显示解决方案编辑', async () => {
    const w = await setup({ maintain: true, normal: false })
    await w.find('.notify-icon-item').trigger('click'); await flushPromises()
    expect(w.find('.detail-state').text()).toBe('紧急告警')
    expect(w.findAll('.alarm-maintenance-detail button').map(button => button.attributes('aria-label')))
      .toEqual(['编辑告警原因', '编辑其它备注'])
  })
  it('详情维护核对成功后只关闭编辑层，保留原详情并刷新维护与时间轴', async () => {
    const w = await setup({ maintain: true })
    await w.find('.alarm-state').trigger('click'); await flushPromises()
    await w.find('[aria-label="编辑其它备注"]').trigger('click'); await flushPromises()
    const fields = w.findAll('textarea'); expect(fields).toHaveLength(3)
    await fields[0]!.setValue('原因'); await fields[1]!.setValue('方案'); await fields[2]!.setValue('备注')
    const submit = w.findAll('.dialog-fixture button').find(button => button.text() === '提交')!
    await submit.trigger('click'); await flushPromises()
    expect(alarmLogMaintenanceApi.save).toHaveBeenCalledExactlyOnceWith(project, event,
      { version: 0, alarmReason: '原因', solution: '方案', remark: '备注' })
    expect(alarmLogMaintenanceApi.read).toHaveBeenCalledTimes(4)
    expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(2)
    expect(w.find('.history-card').text()).toContain('方案')
    expect(w.findAll('textarea')).toHaveLength(0)
    expect(w.findAll('.dialog-fixture')).toHaveLength(1)
    expect(w.find('.dialog-fixture h2').text()).toBe('查看告警详情')
    expect(w.findAll('.alarm-maintenance-detail p').map(p => p.text())).toEqual(['原因', '方案', '备注', project])
    expect(alarmTransitionLogApi.get).toHaveBeenCalledTimes(1)
    expect(alarmLogEvaluationApi.get).toHaveBeenCalledTimes(1)
  })
  it('从时间轴直接维护只刷新列表，不额外打开事件详情或重读求值原件', async () => {
    const w = await setup({ maintain: true })
    await w.findAll('button').find(button => button.text() === '维护')!.trigger('click'); await flushPromises()
    await w.findAll('textarea')[2]!.setValue('直接维护后的备注')
    await w.findAll('.dialog-fixture button').find(button => button.text() === '提交')!.trigger('click'); await flushPromises()
    expect(alarmLogMaintenanceApi.save).toHaveBeenCalledTimes(1)
    expect(alarmLogMaintenanceApi.read).toHaveBeenCalledTimes(2)
    expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(2)
    expect(alarmTransitionLogApi.get).not.toHaveBeenCalled()
    expect(alarmLogEvaluationApi.get).not.toHaveBeenCalled()
    expect(w.findAll('.dialog-fixture')).toHaveLength(0)
    expect(w.find('.history-card').text()).toContain('直接维护后的备注')
  })
  it('维护已核对后刷新列表遭撤权仍清除保留详情，不重放写入', async () => {
    const w = await setup({ maintain: true })
    await w.find('.alarm-state').trigger('click'); await flushPromises()
    await w.find('[aria-label="编辑其它备注"]').trigger('click'); await flushPromises()
    await w.findAll('textarea')[2]!.setValue('撤权后不应继续显示的备注')
    vi.mocked(alarmTransitionLogApi.page).mockRejectedValueOnce(new ApiError('读取权限已撤销', 403))
    await w.findAll('.dialog-fixture button').find(button => button.text() === '提交')!.trigger('click'); await flushPromises()
    expect(alarmLogMaintenanceApi.save).toHaveBeenCalledTimes(1)
    expect(w.findAll('.dialog-fixture')).toHaveLength(0)
    expect(w.text()).not.toContain('撤权后不应继续显示的备注')
    expect(w.text()).not.toContain('触发值')
  })
  it('日期/状态筛选和导出固定当前设备，规则子历史不提供设备全局导出', async () => {
    const w = await setup()
    expect(w.findAllComponents({ name: 'ElOption' }).find(option => option.props('value') === 'alerting')!.props('label')).toBe('告警')
    w.findComponent({ name: 'ElSelect' }).vm.$emit('update:modelValue', 'pending'); await flushPromises()
    const range = [new Date('2026-10-23T00:00:00Z'), new Date('2026-10-24T00:00:00Z')]
    const callsBeforeRangeCommit = vi.mocked(alarmTransitionLogApi.page).mock.calls.length
    w.findComponent({ name: 'ElDatePicker' }).vm.$emit('update:modelValue', range); await flushPromises()
    expect(alarmTransitionLogApi.page).toHaveBeenCalledTimes(callsBeforeRangeCommit)
    w.findComponent({ name: 'ElDatePicker' }).vm.$emit('change', range); await flushPromises()
    const exportButton = w.findAll('button').find(button => button.text() === '导出')!
    await exportButton.trigger('click'); await flushPromises()
    expect(w.find('.export-fixture').text()).toContain(device)
    expect(w.find('.export-fixture').text()).toContain('2026-10-23T00:00:00.000Z')
    await w.setProps({ visible: false }); await w.setProps({ visible: true }); await flushPromises()
    expect(w.findComponent({ name: 'ElDatePicker' }).props('modelValue')).toEqual([new Date('2026-10-23T00:00:00Z'), new Date('2026-10-24T00:00:00Z')])
    await w.setProps({ ruleId: rule }); await flushPromises()
    expect(w.findAllComponents({ name: 'ElOption' }).find(option => option.props('value') === 'alerting')!.props('label')).toBe('全部告警')
    expect(w.findAll('button').some(button => button.text() === '导出')).toBe(false)
    expect(w.findComponent({ name: 'ElDatePicker' }).props('modelValue')).toBeNull()
  })
  it('换设备立即销毁维护表单和详情，不把同一页签旧草稿带给新设备', async () => {
    const w = await setup({ maintain: true })
    await w.find('.alarm-state').trigger('click'); await flushPromises()
    await w.find('[aria-label="编辑其它备注"]').trigger('click'); await flushPromises()
    await w.findAll('textarea')[2]!.setValue('旧设备私有草稿')
    vi.mocked(alarmTransitionLogApi.page).mockResolvedValue({ items: [], total: '0', page: 1, limit: 24 })
    await w.setProps({ deviceId: other }); await flushPromises()
    expect(w.findAll('textarea')).toHaveLength(0)
    expect(w.text()).not.toContain('旧设备私有草稿')
    expect(w.findAll('.dialog-fixture')).toHaveLength(0)
    expect(alarmLogMaintenanceApi.save).not.toHaveBeenCalled()
  })
})
