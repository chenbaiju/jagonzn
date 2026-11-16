import { expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import Page from '@/views/alarm/rules/index.vue'

const { fetchSearchDevices } = vi.hoisted(() => ({ fetchSearchDevices: vi.fn() }))
vi.mock('@/api/device', () => ({
  fetchSearchDevices,
  fetchDeviceDetail: vi.fn(),
  fetchDeviceTypePage: vi.fn()
}))
vi.mock('@/api/alarm', () => ({
  fetchAlarmRules: vi.fn().mockResolvedValue({ items: [] })
}))
vi.mock('@/hooks/core/useAuth', () => ({ useAuth: () => ({ hasAuth: () => true }) }))
vi.mock('@/store/modules/user', () => ({
  useUserStore: () => ({ isLogin: true, info: { currentProjectId: 'project-1', buttons: [] } })
}))
vi.mock('@/composables/useWorkspaceDeviceContext', () => ({
  useWorkspaceDeviceContext: () => ({
    device: ref(),
    loading: ref(false),
    error: ref(),
    requested: ref(false),
    reload: vi.fn()
  })
}))
vi.mock('element-plus', () => ({ ElMessage: {}, ElMessageBox: {} }))

it('Element Plus 的滚动位置事件使用实际下拉尺寸按需翻页，缺少滚动容器时不请求', async () => {
  fetchSearchDevices
    .mockResolvedValueOnce({ items: [{ id: 'device-1' }], hasMore: true, nextCursor: 'next' })
    .mockResolvedValueOnce({ items: [{ id: 'device-2' }], hasMore: false })
  const wrap = document.createElement('div')
  Object.defineProperties(wrap, {
    scrollHeight: { value: 500 },
    clientHeight: { value: 200 }
  })
  const scrollbar = { wrapRef: undefined as HTMLElement | undefined }
  const Select = defineComponent({
    name: 'ElSelect',
    emits: ['popup-scroll'],
    setup(_, { expose }) {
      expose({ scrollbarRef: scrollbar })
      return () => h('div')
    }
  })
  const slots = { template: '<div><slot /></div>' }
  const page = shallowMount(Page, {
    global: {
      stubs: {
        ElDialog: slots,
        ElForm: slots,
        ElFormItem: slots,
        ElSelect: Select,
        ElTable: true,
        ElDrawer: true
      },
      directives: { loading: () => {} }
    }
  })
  await flushPromises()
  expect(fetchSearchDevices).toHaveBeenCalledTimes(1)
  const select = page.getComponent({ ref: 'ruleDeviceSelectRef' })
  select.vm.$emit('popup-scroll', { scrollTop: 0, scrollLeft: 0 })
  await flushPromises()
  expect(fetchSearchDevices).toHaveBeenCalledTimes(1)

  scrollbar.wrapRef = wrap
  wrap.scrollTop = 0
  select.vm.$emit('popup-scroll', { scrollTop: 0, scrollLeft: 0 })
  await flushPromises()
  expect(fetchSearchDevices).toHaveBeenCalledTimes(1)

  wrap.scrollTop = 260
  select.vm.$emit('popup-scroll', { scrollTop: 260, scrollLeft: 0 })
  await flushPromises()
  expect(fetchSearchDevices).toHaveBeenCalledTimes(2)
  expect(fetchSearchDevices).toHaveBeenLastCalledWith('project-1', {
    keyword: undefined,
    cursor: 'next',
    limit: 50
  })
  select.vm.$emit('popup-scroll', { scrollTop: 260, scrollLeft: 0 })
  await flushPromises()
  expect(fetchSearchDevices).toHaveBeenCalledTimes(2)
  page.unmount()
})
