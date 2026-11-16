import { afterEach, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { ElTable, ElTableColumn } from 'element-plus'
const api = vi.hoisted(() => ({ fetchDeviceEvent: vi.fn(), fetchDeviceEvents: vi.fn() }))
vi.mock('@/api/device-event-history', () => api)
import DeviceEventHistory from '@/views/device/components/DeviceEventHistory.vue'
const item = {
  messageId: 'event',
  deviceId: 'device',
  eventKey: 'alarm',
  level: 'WARNING',
  modelVersion: '1.0.0',
  thingModelVersionId: 'model',
  eligibility: 'CURRENT',
  occurredAt: '2026-10-06T00:00:00Z',
  receivedAt: '2026-10-06T00:00:01Z',
  acceptedAt: '2026-10-06T00:00:02Z',
  paramsRedacted: true,
  paramsText: '{"n":12345678901234567890123456789012345678,"text":"<script>bad</script>"}'
}
const windowFrom = '2026-07-25T08:43:39.488199Z'
const windowTo = '2026-10-23T08:43:39.488199Z'
const button = defineComponent({
  props: ['disabled', 'loading'],
  emits: ['click'],
  setup:
    (p, { slots, emit }) =>
    () =>
      h(
        'button',
        { disabled: p.disabled || p.loading, onClick: () => emit('click') },
        slots.default?.()
      )
})
const table = defineComponent({
  props: ['data'],
  setup:
    (p, { slots }) =>
    () =>
      h('div', p.data.length ? slots.default?.() : slots.empty?.())
})
const column = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h('div', slots.default?.({ row: item }))
})
let wrapper: ReturnType<typeof mount>
afterEach(() => wrapper?.unmount())
it('列表时间按东八区显示到秒，表头不标UTC且原始行时间保持精度', async () => {
  const row = Object.freeze({
    ...item,
    occurredAt: '2026-10-23T20:43:39.488199Z',
    receivedAt: '2026-10-24T04:44:40.123456789+08:00'
  })
  api.fetchDeviceEvents.mockResolvedValue({
    items: [row],
    nextCursor: null,
    windowFrom,
    windowTo,
    retentionDays: 90
  })
  wrapper = mount(DeviceEventHistory, {
    props: { projectId: 'project', deviceId: 'device', active: true },
    global: {
      components: { ElTable, ElTableColumn },
      directives: { loading: () => {} },
      stubs: {
        ElButton: button,
        ElForm: { template: '<form><slot/></form>' },
        ElFormItem: { template: '<div><slot/></div>' },
        ElInput: true,
        ElSelect: true,
        ElOption: true,
        ElAlert: true,
        ElEmpty: true
      }
    }
  })
  await flushPromises()
  const headers = wrapper.findAll('.el-table__header th').map((cell) => cell.text())
  expect(headers).toContain('发生时刻')
  expect(headers).toContain('接收时刻')
  expect(headers.join(' ')).not.toContain('UTC')
  const cells = wrapper.findAll('.el-table__body td')
  expect(cells[4].text()).toBe('2026-10-24 04:43:39')
  expect(cells[5].text()).toBe('2026-10-24 04:44:40')
  expect(wrapper.findComponent(ElTable).props('data')).toEqual([row])
})
it('详情是纯文本精确投影与脱敏说明，关闭宿主清旧内容；独立空态与错误', async () => {
  api.fetchDeviceEvents.mockResolvedValue({
    items: [item],
    nextCursor: null,
    windowFrom,
    windowTo,
    retentionDays: 90
  })
  api.fetchDeviceEvent.mockResolvedValue(item)
  wrapper = mount(DeviceEventHistory, {
    props: { projectId: 'project', deviceId: 'device', active: true },
    global: {
      directives: { loading: () => {} },
      stubs: {
        ElButton: button,
        ElForm: { template: '<form><slot/></form>' },
        ElFormItem: { template: '<div><slot/></div>' },
        ElInput: true,
        ElSelect: true,
        ElOption: true,
        ElTable: table,
        ElTableColumn: column,
        ElEmpty: { props: ['description'], template: '<p>{{description}}</p>' },
        ElAlert: { props: ['title'], template: '<p>{{title}}<slot /></p>' }
      }
    }
  })
  await flushPromises()
  const window = wrapper.get('.el-card__header [data-testid="device-event-history-window"]')
  expect(window.text()).toBe('当前有效窗口 2026-07-25 16:43:39 至 2026-10-23 16:43:39（不包含）')
  expect(wrapper.find('.el-card__body [data-testid="device-event-history-window"]').exists()).toBe(
    false
  )
  expect(wrapper.find('[aria-label="事件历史分页"]').exists()).toBe(true)
  await wrapper.get('[data-testid="device-event-detail-open"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('pre').text()).toContain('12345678901234567890123456789012345678')
  expect(wrapper.get('pre').text()).toContain('<script>bad</script>')
  expect(wrapper.find('script').exists()).toBe(false)
  expect(wrapper.text()).toContain('参数已按存储规则脱敏')
  const detail = wrapper.get('[data-testid="device-event-detail"]')
  expect(detail.text().replace(/\s+/g, ' ')).toContain(
    '2026-10-06 08:00:00 / 2026-10-06 08:00:01 / 2026-10-06 08:00:02'
  )
  expect(detail.text()).not.toContain('UTC')
  expect(item.acceptedAt).toBe('2026-10-06T00:00:02Z')
  await wrapper.setProps({ active: false })
  expect(wrapper.find('pre').exists()).toBe(false)
  expect(wrapper.find('[data-testid="device-event-history-window"]').exists()).toBe(false)
  api.fetchDeviceEvents.mockResolvedValue({
    items: [],
    nextCursor: null,
    windowFrom,
    windowTo,
    retentionDays: 90
  })
  await wrapper.setProps({ active: true })
  await flushPromises()
  expect(wrapper.text()).toContain('当前可读窗口内暂无事件')
  expect(wrapper.find('[aria-label="事件历史分页"]').exists()).toBe(false)
  api.fetchDeviceEvents.mockRejectedValue(new Error('private'))
  await wrapper.get('[data-testid="device-event-history-refresh"]').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('读取不可用')
  expect(wrapper.text()).not.toContain('private')
})
