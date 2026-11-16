import { memoryStorage } from './commercialStorageFixture'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { computed, defineComponent, h, inject, provide, reactive } from 'vue'
import type { ComputedRef } from 'vue'
import Page from '@/views/tenant-governance/index.vue'
const mocks = vi.hoisted(() => ({
  user: { info: { userId: 'operator', buttons: ['tenant:govern'] as string[] } },
  list: vi.fn(),
  detail: vi.fn(),
  history: vi.fn(),
  change: vi.fn(),
  confirm: vi.fn(),
  warning: vi.fn()
}))
vi.mock('@/store/modules/user', () => ({ useUserStore: () => mocks.user }))
vi.mock('@/api/tenant-governance', () => ({
  fetchTenantSafetyDirectory: mocks.list,
  fetchTenantSafety: mocks.detail,
  fetchTenantSafetyHistory: mocks.history,
  changeTenantSafety: mocks.change
}))
vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: mocks.confirm },
  ElMessage: { warning: mocks.warning }
}))
const container = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.())
  }
})
const button = defineComponent({
  props: ['disabled'],
  setup(p, { slots, attrs }) {
    return () => h('button', { ...attrs, disabled: p.disabled }, slots.default?.())
  }
})
const input = defineComponent({
  props: ['modelValue', 'disabled'],
  emits: ['update:modelValue'],
  setup(p, { emit }) {
    return () =>
      h('input', {
        value: p.modelValue,
        disabled: p.disabled,
        onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value)
      })
  }
})
const title = defineComponent({
  props: ['title', 'description'],
  setup(p) {
    return () => h('div', p.title ?? p.description)
  }
})
const table = defineComponent({
  props: ['data'],
  setup(p, { slots }) {
    provide(
      'rows',
      computed(() => p.data ?? [])
    )
    return () => h('div', slots.default?.())
  }
})
const column = defineComponent({
  props: ['prop'],
  setup(p, { slots }) {
    const rows = inject<ComputedRef<Record<string, unknown>[]>>('rows')!
    return () =>
      h(
        'div',
        rows.value.map((row) =>
          slots.default ? slots.default({ row }) : h('span', String(row[p.prop] ?? ''))
        )
      )
  }
})
const target = '0199aabb-0000-7000-8000-000000000001'
const detail = {
  id: target,
  name: '目标租户',
  status: 'ACTIVE',
  securityVersion: '9007199254740993'
}
function page() {
  return mount(Page, {
    global: {
      stubs: {
        ConsoleWorkspaceHeader: container,
        ElCard: container,
        ElForm: container,
        ElFormItem: container,
        ElButton: button,
        ElInput: input,
        ElSelect: container,
        ElOption: true,
        ElAlert: title,
        ElEmpty: title,
        ElTable: table,
        ElTableColumn: column
      }
    }
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.user = reactive({ info: { userId: 'operator', buttons: ['tenant:govern'] } })
  vi.stubGlobal('localStorage', memoryStorage())
  mocks.list.mockResolvedValue({ items: [detail] })
  mocks.detail.mockResolvedValue(detail)
  mocks.history.mockResolvedValue({ items: [] })
  mocks.confirm.mockResolvedValue('confirm')
  mocks.change.mockImplementation(async (id, request) => ({
    ...request,
    tenantId: id,
    actorAccountId: 'operator',
    resultVersion: '9007199254740994'
  }))
})
describe('租户安全治理实际页面', () => {
  it('商业权限和项目角色不能代替独立治理权限', async () => {
    mocks.user.info.buttons = ['commercial:adjust']
    const w = page()
    await flushPromises()
    expect(w.text()).toContain('没有平台租户治理权限')
    expect(mocks.list).not.toHaveBeenCalled()
    expect(mocks.change).not.toHaveBeenCalled()
    w.unmount()
  })
  it('查询到选择到显式确认，提交精确原版本且不自报操作者', async () => {
    const w = page()
    await w
      .findAll('button')
      .find((x) => x.text() === '查询')!
      .trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledWith({
      tenantId: undefined,
      prefix: undefined,
      status: undefined,
      cursor: undefined,
      limit: 20
    })
    await w
      .findAll('button')
      .find((x) => x.text() === '查看与治理')!
      .trigger('click')
    await flushPromises()
    await w.findAll('input').at(-1)!.setValue('已核实安全风险')
    await w
      .findAll('button')
      .find((x) => x.text() === '核对并封禁')!
      .trigger('click')
    await flushPromises()
    expect(mocks.confirm.mock.calls[0]?.[0]).toContain(target)
    expect(mocks.change).toHaveBeenCalledTimes(1)
    const request = mocks.change.mock.calls[0]?.[1]
    expect(request.expectedVersion).toBe('9007199254740993')
    expect(request.reasonCode).toBe('ABUSE')
    expect(request.operatorId).toBeUndefined()
    expect(request.operationId).toMatch(/-7[0-9a-f]{3}-[89ab]/)
    expect(w.text()).toContain('操作已确认')
    w.unmount()
  })
  it('取消确认不会创建待确认记录或发出写请求', async () => {
    const w = page()
    await w
      .findAll('button')
      .find((x) => x.text() === '查询')!
      .trigger('click')
    await flushPromises()
    await w
      .findAll('button')
      .find((x) => x.text() === '查看与治理')!
      .trigger('click')
    await flushPromises()
    await w.findAll('input').at(-1)!.setValue('已核实')
    mocks.confirm.mockRejectedValue('cancel')
    await w
      .findAll('button')
      .find((x) => x.text() === '核对并封禁')!
      .trigger('click')
    await flushPromises()
    expect(mocks.change).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
    w.unmount()
  })
})
