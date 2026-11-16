import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Managed from '../../src/features/alarms/ManagedAlarmLogExportDialog.vue'
import { alarmLogExportApi, type AlarmLogExport, type AlarmLogExportQuery } from '../../src/features/alarms/alarm-log-export-api'
import { session } from '../../src/core/session'
import { changeIdentity } from '../../src/core/http'
import { project, device, other, rule, row } from './device-alarm-history-fixture'

vi.mock('../../src/features/alarms/alarm-log-export-api', async original => ({
  ...await original<typeof import('../../src/features/alarms/alarm-log-export-api')>(),
  alarmLogExportApi: { read: vi.fn() },
}))
let wrapper: ReturnType<typeof mount> | undefined
const item = { log: row, deviceTypeName: '传感器' }
async function setup(filters: AlarmLogExportQuery, result: AlarmLogExport) {
  session.user = { currentProjectId: project, permissions: ['alarm:read'] }
  vi.mocked(alarmLogExportApi.read).mockResolvedValue(result)
  const download = vi.fn()
  wrapper = mount(Managed, { props: { modelValue: true, filters, download }, global: {
    plugins: [ElementPlus], stubs: { ElDialog: {
      props: ['modelValue'], template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    } },
  } })
  await wrapper.findAll('button').find(button => button.text() === '导出')!.trigger('click')
  await flushPromises()
  return { w: wrapper, download }
}
afterEach(() => { wrapper?.unmount(); wrapper = undefined; session.user = null; changeIdentity(); vi.resetAllMocks() })

describe('固定设备和规则的导出入站范围', () => {
  it.each(['device', 'rule'] as const)('任一%s范围外事件令整包失败，不下载前面的合法行', async mismatch => {
    const filters = { deviceId: device, ruleId: rule }
    const wrong = { ...item, log: { ...row, id: other,
      ...(mismatch === 'device' ? { deviceId: other } : { ruleId: other }) } }
    const { w, download } = await setup(filters, { items: [item, wrong], limit: 1000, truncated: false })
    expect(alarmLogExportApi.read).toHaveBeenCalledExactlyOnceWith(project, filters, expect.any(AbortSignal))
    expect(download).not.toHaveBeenCalled()
    expect(w.text()).toContain('范围外')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
  it.each([{ deviceId: device }, { deviceId: device, ruleId: rule }, {}] satisfies AlarmLogExportQuery[])(
    '合法固定范围或无设备规则筛选仍可完整下载：%j', async filters => {
      const { w, download } = await setup(filters, { items: [item], limit: 1000, truncated: false })
      expect(alarmLogExportApi.read).toHaveBeenCalledExactlyOnceWith(project, filters, expect.any(AbortSignal))
      expect(download).toHaveBeenCalledOnce()
      expect(download.mock.calls[0]![0].text).toContain(row.deviceName)
      expect(w.emitted('update:modelValue')).toEqual([[false]])
    },
  )
})
