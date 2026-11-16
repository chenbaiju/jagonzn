import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { ElTable, ElTableColumn } from 'element-plus'
import Panel from '@/views/device/components/DeviceRuntimeLogs.vue'
import * as api from '@/api/device-runtime-logs'
const state = vi.hoisted(() => ({ user: {} as any }))
vi.mock('@/store/modules/user', () => ({ useUserStore: () => state.user }))
vi.mock('@/api/device-runtime-logs', () => ({ fetchDeviceRuntimeLogs: vi.fn() }))
let panel: VueWrapper
const page = {
  items: [
    {
      id: 'row1',
      message: '<script>never execute</script>',
      sequence: '9223372036854775807',
      uptimeMs: '9007199254740993',
      receivedAt: '2026-10-22T00:00:00Z'
    }
  ],
  effectiveFrom: '2026-10-21T00:00:00.123456789Z',
  effectiveTo: '2026-10-22T00:00:00.123456789Z',
  nextCursor: 'opaque'
}
const stubs = {
  ElAlert: { props: ['title'], template: '<p>{{title}}<slot/></p>' },
  ElForm: { template: '<form><slot/></form>' },
  ElFormItem: { template: '<div><slot/></div>' },
  ElSelect: true,
  ElButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' },
  ElTable: { props: ['data'], template: '<div>{{JSON.stringify(data)}}</div>' },
  ElTableColumn: true
}
function render() {
  panel = mount(Panel, {
    props: { projectId: 'p', deviceId: 'd', active: true },
    global: { stubs }
  })
}
const button = (text: string) => panel.findAll('button').find((b) => b.text() === text)!
beforeEach(() => {
  vi.resetAllMocks()
  state.user = reactive({
    info: { currentProjectId: 'p', userId: 'a', tenantId: 't', roles: ['OWNER'] }
  })
  vi.mocked(api.fetchDeviceRuntimeLogs).mockResolvedValue(page as any)
})
afterEach(() => panel?.unmount())
it('列表时间按东八区显示到秒，可空时间用占位符且不改写原始行', async () => {
  const rows = [
    Object.freeze({
      ...page.items[0],
      receivedAt: '2026-10-23T20:43:39.488199Z',
      occurredAt: '2026-10-23T21:44:40.123456789Z'
    }),
    Object.freeze({
      ...page.items[0],
      id: 'row2',
      receivedAt: '2026-10-24T04:44:40.123456789+08:00',
      occurredAt: null
    })
  ]
  vi.mocked(api.fetchDeviceRuntimeLogs).mockResolvedValue({ ...page, items: rows } as any)
  panel = mount(Panel, {
    props: { projectId: 'p', deviceId: 'd', active: true },
    global: {
      components: { ElTable, ElTableColumn },
      directives: { loading: () => {} },
      stubs: { ...stubs, ElTable: false, ElTableColumn: false, ElOption: true, ElEmpty: true }
    }
  })
  await flushPromises()
  const headers = panel.findAll('.el-table__header th').map((cell) => cell.text())
  expect(headers).toContain('平台接收')
  expect(headers).toContain('设备发生（可空）')
  expect(headers.join(' ')).not.toContain('UTC')
  const renderedRows = panel.findAll('.el-table__body tr')
  expect(
    renderedRows[0]
      .findAll('td')
      .slice(0, 2)
      .map((cell) => cell.text())
  ).toEqual(['2026-10-24 04:43:39', '2026-10-24 05:44:40'])
  expect(
    renderedRows[1]
      .findAll('td')
      .slice(0, 2)
      .map((cell) => cell.text())
  ).toEqual(['2026-10-24 04:44:40', '—'])
  expect(panel.findComponent(ElTable).props('data')).toEqual(rows)
})
it('独立诊断页按服务器首次窗口翻页，整数/纳秒不截断，正文只作为文本', async () => {
  render()
  await flushPromises()
  expect(panel.get('.el-card__header [data-testid="device-runtime-log-window"]').text()).toBe(
    '当前有效窗口 2026-10-21 08:00:00 至 2026-10-22 08:00:00（不包含）'
  )
  expect(panel.find('.el-card__body [data-testid="device-runtime-log-window"]').exists()).toBe(
    false
  )
  expect(panel.text()).toContain('9223372036854775807')
  expect(panel.find('script').exists()).toBe(false)
  await button('加载更多运行日志').trigger('click')
  await flushPromises()
  expect(api.fetchDeviceRuntimeLogs).toHaveBeenLastCalledWith('p', 'd', {
    from: page.effectiveFrom,
    to: page.effectiveTo,
    cursor: 'opaque'
  })
})
it.each(['VIEWER', 'OPERATOR'])('角色%s不读取或展示运行日志', async (role) => {
  state.user.info.roles = [role]
  render()
  await flushPromises()
  expect(api.fetchDeviceRuntimeLogs).not.toHaveBeenCalled()
  expect(panel.find('section').exists()).toBe(false)
})
it('设备/身份切换清空，并丢弃旧请求', async () => {
  let resolve!: (value: any) => void
  vi.mocked(api.fetchDeviceRuntimeLogs).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r
      })
  )
  render()
  await flushPromises()
  await panel.setProps({ deviceId: 'new-device', active: false })
  resolve(page)
  await flushPromises()
  expect(panel.text()).not.toContain('row1')
  expect(panel.find('[data-testid="device-runtime-log-window"]').exists()).toBe(false)
  expect(panel.find('section').exists()).toBe(false)
})
it('失败/不完整响应明确不可用，不把错误当空日志', async () => {
  vi.mocked(api.fetchDeviceRuntimeLogs).mockResolvedValue({ items: [{}] } as any)
  render()
  await flushPromises()
  expect(panel.text()).toContain('无法读取运行日志')
  expect(button('加载更多运行日志')).toBeUndefined()
})
