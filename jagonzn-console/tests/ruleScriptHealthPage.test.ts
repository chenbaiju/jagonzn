import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, enableAutoUnmount } from '@vue/test-utils'
import { computed, defineComponent, h, inject, provide, reactive, type ComputedRef } from 'vue'
import Page from '@/views/rule/messages/index.vue'
import * as api from '@/api/rule-management'
import { HttpError } from '@/utils/http/error'
import { invalidateIdentity } from '@/utils/http/identity-scope'
import type { components } from '@/types/api/schema'

const mocks = vi.hoisted(() => ({
  user: {} as Record<string, unknown>,
  confirm: vi.fn<(...args: unknown[]) => Promise<'confirm'>>()
}))
vi.mock('@/store/modules/user', () => ({ useUserStore: () => mocks.user }))
vi.mock('@/api/rule-management', () => ({
  ruleCatalog: vi.fn(),
  listRules: vi.fn(),
  getRule: vi.fn(),
  ruleHistory: vi.fn(),
  getRuleScriptHealth: vi.fn(),
  activateRule: vi.fn(),
  saveRule: vi.fn(),
  pauseRule: vi.fn(),
  deleteRule: vi.fn(),
  debugRule: vi.fn()
}))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: mocks.confirm } }))

enableAutoUnmount(afterEach)
const identity = () =>
  mocks.user as {
    isLogin: boolean
    info: { userId: string; tenantId: string; currentProjectId: string; buttons: string[] }
  }
type Health = components['schemas']['RuleScriptHealthView']
const rule = () => ({
  id: 'rule-a',
  name: '温度处理',
  status: 'PAUSED',
  activeVersionId: 'active-v',
  version: 9
})
const health = (): Health => ({
  ruleId: 'rule-a',
  status: 'PAUSED',
  activeVersionId: 'active-v',
  version: 9,
  executionGeneration: 3,
  consecutiveFailures: 5,
  failureThreshold: 5,
  failureGapSeconds: 600,
  lastScriptFailureAt: '2026-10-22T01:00:00Z',
  autoPausedAt: '2026-10-22T01:00:00Z',
  pauseReason: 'SCRIPT_FAILURE_THRESHOLD'
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, failed) => {
    resolve = done
    reject = failed
  })
  return { promise, resolve, reject }
}
const Table = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  setup(props, { slots }) {
    provide(
      'rows',
      computed(() => props.data)
    )
    return () => h('div', slots.default?.())
  }
})
const Column = defineComponent({
  setup(_, { slots }) {
    const rows = inject<ComputedRef<unknown[]>>('rows')!
    return () =>
      h(
        'div',
        rows.value.map((row) => slots.default?.({ row }))
      )
  }
})
const Action = defineComponent({
  props: ['label', 'disabled'],
  emits: ['click'],
  setup(props, { emit }) {
    return () =>
      h('button', { disabled: props.disabled, onClick: () => emit('click') }, props.label)
  }
})
const Dialog = defineComponent({
  props: ['modelValue'],
  emits: ['close', 'update:modelValue'],
  setup(props, { slots }) {
    return () => (props.modelValue ? h('section', slots.default?.()) : null)
  }
})
const Alert = defineComponent({
  props: ['title', 'label'],
  setup(props, { slots }) {
    return () => h('div', [props.title, props.label, slots.default?.()])
  }
})
function page() {
  return mount(Page, {
    global: {
      directives: { loading: () => {} },
      stubs: {
        ConsoleWorkspaceHeader: true,
        ConsoleFilterBar: true,
        RuleNodeEditor: true,
        ConsoleTableAction: Action,
        ConsoleStatusTag: true,
        ElCard: { template: '<div><slot /></div>' },
        ElAlert: Alert,
        ElTable: Table,
        ElTableColumn: Column,
        ElDialog: Dialog,
        ElButton: {
          props: ['disabled'],
          template: '<button :disabled="disabled"><slot /></button>'
        },
        ...Object.fromEntries(
          ['ElForm', 'ElFormItem', 'ElDivider', 'ElDescriptions', 'ElTag'].map((name) => [
            name,
            { template: '<div><slot /></div>' }
          ])
        ),
        ElDescriptionsItem: Alert,
        ElInput: true,
        ElSelect: true,
        ElOption: true
      }
    }
  })
}
async function open(wrapper: ReturnType<typeof page>) {
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '管理')!
    .trigger('click')
  await flushPromises()
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.user = reactive({
    isLogin: true,
    info: {
      userId: 'owner',
      tenantId: 'tenant-a',
      currentProjectId: 'project-a',
      buttons: ['rule:manage']
    }
  })
  vi.mocked(api.ruleCatalog).mockResolvedValue({ actions: [] })
  vi.mocked(api.listRules).mockResolvedValue({ items: [{ ...rule(), version: 7 }] })
  vi.mocked(api.getRule).mockResolvedValue(rule())
  vi.mocked(api.ruleHistory).mockResolvedValue({
    items: [
      { id: 'draft-v', versionNumber: 4, source: 'input => input' },
      { id: 'active-v', versionNumber: 3, source: 'input => input' }
    ]
  })
  vi.mocked(api.getRuleScriptHealth).mockResolvedValue(health())
  mocks.confirm.mockResolvedValue('confirm')
})
describe('规则脚本健康与显式恢复', () => {
  it('打开详情读取持久健康而非逐行查询并展示自动暂停来源', async () => {
    const wrapper = page()
    await flushPromises()
    expect(api.getRuleScriptHealth).not.toHaveBeenCalled()
    await open(wrapper)
    expect(api.getRuleScriptHealth).toHaveBeenCalledExactlyOnceWith('project-a', 'rule-a')
    expect(wrapper.get('[data-testid="script-health"]').text()).toContain('连续脚本失败')
    expect(wrapper.get('[data-testid="script-health"]').text()).toContain('5 / 5')
    expect(wrapper.get('[data-testid="script-health"]').text()).toContain('脚本连续失败自动暂停')
    expect(wrapper.get('[data-testid="script-health"]').text()).toContain('600')
    wrapper.unmount()
  })
  it('显式恢复原活动版本使用最新一致CAS且读取真实重置结果', async () => {
    const wrapper = page()
    await open(wrapper)
    let confirmedMessage = ''
    mocks.confirm.mockImplementation((message) => {
      confirmedMessage = String((message as () => { children: unknown })().children)
      return Promise.resolve('confirm')
    })
    const active = { ...rule(), status: 'ACTIVE', version: 10 }
    vi.mocked(api.activateRule).mockResolvedValue(active)
    vi.mocked(api.getRule).mockResolvedValue(active)
    vi.mocked(api.getRuleScriptHealth).mockResolvedValue({
      ...health(),
      status: 'ACTIVE',
      version: 10,
      executionGeneration: 4,
      consecutiveFailures: 0,
      lastScriptFailureAt: undefined,
      autoPausedAt: undefined,
      pauseReason: undefined
    })
    await wrapper.get('[data-testid="restore-rule"]').trigger('click')
    await flushPromises()
    expect(mocks.confirm).toHaveBeenCalledWith(expect.any(Function), '确认人工恢复', {
      customClass: 'console-rule-feedback'
    })
    expect(confirmedMessage).toContain('不补跑历史消息或死信')
    expect(api.activateRule).toHaveBeenCalledExactlyOnceWith('project-a', 'rule-a', 'active-v', 9)
    expect(wrapper.get('[data-testid="script-health"]').text()).toContain('0 / 5')
    expect(wrapper.get('[data-testid="script-health"]').text()).not.toContain(
      '脚本连续失败自动暂停'
    )
    expect(api.ruleHistory).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
  it('状态冲突不换新CAS自动重试，必须显式刷新再确认', async () => {
    const wrapper = page()
    await open(wrapper)
    vi.mocked(api.activateRule).mockRejectedValue(new HttpError('conflict', 40034))
    await wrapper.get('[data-testid="restore-rule"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('状态或版本已变化')
    expect(wrapper.get('[data-testid="restore-rule"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="script-health"]').text()).toContain('5 / 5')
    vi.mocked(api.getRule).mockResolvedValue({ ...rule(), version: 10 })
    vi.mocked(api.getRuleScriptHealth).mockResolvedValue({ ...health(), version: 10 })
    await wrapper.get('[data-testid="refresh-script-health"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="restore-rule"]').attributes('disabled')).toBeUndefined()
    expect(api.activateRule).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
  it('网络结果未知保留原观测且查询不认领上次恢复成功', async () => {
    const wrapper = page()
    await open(wrapper)
    vi.mocked(api.activateRule).mockRejectedValue(
      new HttpError('lost', 503, { outcomeUnknown: true })
    )
    await wrapper.get('[data-testid="restore-rule"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="script-health"]').text()).toContain('5 / 5')
    expect(wrapper.get('[data-testid="restore-rule"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[data-testid="refresh-script-health"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('不证明上次操作成功或其归因')
    expect(api.activateRule).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
  it('详情健康快照冲突先阻断，刷新一致后才允许确认', async () => {
    vi.mocked(api.getRuleScriptHealth).mockResolvedValue({ ...health(), version: 10 })
    const wrapper = page()
    await open(wrapper)
    expect(wrapper.text()).toContain('详情与健康状态不一致')
    expect(wrapper.get('[data-testid="restore-rule"]').attributes('disabled')).toBeDefined()
    vi.mocked(api.getRule).mockResolvedValue({ ...rule(), version: 10 })
    await wrapper.get('[data-testid="refresh-script-health"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="restore-rule"]').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
  it.each(['missing', 'unsafe', 'unknown-reason'] as const)(
    '健康%s不伪造计数或允许恢复',
    async (kind) => {
      const value =
        kind === 'missing'
          ? { ...health(), consecutiveFailures: undefined }
          : kind === 'unsafe'
            ? { ...health(), version: Number.MAX_SAFE_INTEGER + 1 }
            : { ...health(), pauseReason: 'UNKNOWN' }
      if (kind === 'unsafe')
        vi.mocked(api.getRule).mockResolvedValue({ ...rule(), version: value.version })
      vi.mocked(api.getRuleScriptHealth).mockResolvedValue(value)
      const wrapper = page()
      await open(wrapper)
      expect(wrapper.text()).toContain('健康状态不可用')
      expect(wrapper.get('[data-testid="restore-rule"]').attributes('disabled')).toBeDefined()
      expect(api.activateRule).not.toHaveBeenCalled()
      wrapper.unmount()
    }
  )
  it('普通暂停不推测为脚本自动暂停，读取失败不显示零失败', async () => {
    vi.mocked(api.getRuleScriptHealth).mockResolvedValue({
      ...health(),
      consecutiveFailures: 2,
      autoPausedAt: undefined,
      pauseReason: undefined
    })
    const wrapper = page()
    await open(wrapper)
    expect(wrapper.text()).toContain('未记录脚本自动暂停原因')
    vi.mocked(api.getRuleScriptHealth).mockRejectedValue(new HttpError('private', 503))
    await wrapper.get('[data-testid="refresh-script-health"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('脚本健康读取失败')
    expect(wrapper.text()).not.toContain('0 / 5')
    expect(wrapper.get('[data-testid="restore-rule"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
  it.each(['project', 'account', 'permission'] as const)('%s变更使旧健康请求失效', async (kind) => {
    const pending = deferred<Health>()
    vi.mocked(api.getRuleScriptHealth).mockReturnValue(pending.promise)
    const wrapper = page()
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '管理')!
      .trigger('click')
    if (kind === 'project') {
      identity().info.currentProjectId = 'project-b'
      identity().info.currentProjectId = 'project-a'
    } else if (kind === 'account') identity().info.userId = 'other'
    else identity().info.buttons = ['rule:read']
    pending.resolve(health())
    await flushPromises()
    expect(wrapper.find('[data-testid="script-health"]').exists()).toBe(false)
    expect(api.activateRule).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it.each(['close', 'identity'] as const)(
    '%s发生在确认中时不发送恢复且不接受重复点击',
    async (kind) => {
      const wrapper = page()
      await open(wrapper)
      const confirm = deferred<'confirm'>()
      mocks.confirm.mockReturnValue(confirm.promise)
      await wrapper.get('[data-testid="restore-rule"]').trigger('click')
      await wrapper.get('[data-testid="restore-rule"]').trigger('click')
      expect(mocks.confirm).toHaveBeenCalledTimes(1)
      if (kind === 'close') wrapper.findComponent(Dialog).vm.$emit('update:modelValue', false)
      else invalidateIdentity()
      expect(
        String((mocks.confirm.mock.calls[0][0] as () => { children: unknown })().children)
      ).not.toContain('温度处理')
      confirm.resolve('confirm')
      await flushPromises()
      expect(api.activateRule).not.toHaveBeenCalled()
      expect(wrapper.find('[data-testid="script-health"]').exists()).toBe(false)
      wrapper.unmount()
    }
  )
  it('取消不发送，归档拒写后仍可刷新健康', async () => {
    const wrapper = page()
    await open(wrapper)
    mocks.confirm.mockRejectedValueOnce('cancel')
    await wrapper.get('[data-testid="restore-rule"]').trigger('click')
    await flushPromises()
    expect(api.activateRule).not.toHaveBeenCalled()
    vi.mocked(api.activateRule).mockRejectedValue(new HttpError('archived', 50017))
    await wrapper.get('[data-testid="restore-rule"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('项目当前只读')
    await wrapper.get('[data-testid="refresh-script-health"]').trigger('click')
    await flushPromises()
    expect(api.getRuleScriptHealth).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid="restore-rule"]').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
  it('失权健康读取清除规则私有信息', async () => {
    vi.mocked(api.getRuleScriptHealth).mockRejectedValue(new HttpError('denied', 40033))
    const wrapper = page()
    await open(wrapper)
    expect(wrapper.find('[data-testid="script-health"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('温度处理')
    expect(api.activateRule).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('成功响应身份不匹配仍保持未知，不伪造恢复或清零', async () => {
    const wrapper = page()
    await open(wrapper)
    vi.mocked(api.activateRule).mockResolvedValue({
      ...rule(),
      id: 'other-rule',
      status: 'ACTIVE',
      version: 10
    })
    await wrapper.get('[data-testid="restore-rule"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="restore-rule"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="script-health"]').text()).toContain('5 / 5')
    expect(api.getRuleScriptHealth).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
  it('健康刷新详情失败即撤销旧许可，不继续拿旧CAS恢复', async () => {
    const wrapper = page()
    await open(wrapper)
    vi.mocked(api.getRule).mockRejectedValue(new HttpError('read unavailable', 503))
    await wrapper.get('[data-testid="refresh-script-health"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('无法取得完整规则健康状态')
    expect(wrapper.get('[data-testid="restore-rule"]').attributes('disabled')).toBeDefined()
    expect(api.activateRule).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('保存后使用后继真实观测更新列表，不回写保存响应旧状态', async () => {
    const wrapper = page()
    await open(wrapper)
    vi.mocked(api.saveRule).mockResolvedValue({ ...rule(), version: 10 })
    vi.mocked(api.getRule).mockResolvedValue({ ...rule(), version: 11, status: 'ACTIVE' })
    vi.mocked(api.getRuleScriptHealth).mockResolvedValue({
      ...health(),
      status: 'ACTIVE',
      version: 11,
      consecutiveFailures: 0,
      autoPausedAt: undefined,
      pauseReason: undefined
    })
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '保存新版本')!
      .trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(Table).props('data')).toEqual([
      expect.objectContaining({ version: 11, status: 'ACTIVE' })
    ])
    expect(wrapper.get('[data-testid="script-health"]').text()).toContain('0 / 5')
    wrapper.unmount()
  })
  it('详情和健康即使互相匹配也不能换成请求之外的规则', async () => {
    vi.mocked(api.getRule).mockResolvedValue({
      ...rule(),
      id: 'foreign-rule',
      name: 'other-tenant-secret'
    })
    vi.mocked(api.getRuleScriptHealth).mockResolvedValue({ ...health(), ruleId: 'foreign-rule' })
    const wrapper = page()
    await open(wrapper)
    expect(wrapper.text()).toContain('规则读取身份不匹配')
    expect(wrapper.text()).not.toContain('other-tenant-secret')
    expect(wrapper.find('[data-testid="script-health"]').exists()).toBe(false)
    expect(api.activateRule).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it.each([
    { kind: 'refresh', first: 'detail', denied: 'health' },
    { kind: 'open', first: 'history', denied: 'health' },
    { kind: 'open', first: 'history', denied: 'detail' },
    { kind: 'open', first: 'detail', denied: 'history' }
  ] as const)(
    '$kind/$first/$denied并发读先临时失败后失权仍清除原规则信息',
    async ({ kind, first, denied }) => {
      const wrapper = page()
      if (kind === 'refresh') await open(wrapper)
      else await flushPromises()
      const pending = deferred<never>()
      if (denied === 'health') vi.mocked(api.getRuleScriptHealth).mockReturnValue(pending.promise)
      else if (denied === 'detail') vi.mocked(api.getRule).mockReturnValue(pending.promise)
      else vi.mocked(api.ruleHistory).mockReturnValue(pending.promise)
      if (first === 'detail')
        vi.mocked(api.getRule).mockRejectedValue(new HttpError('temporarily unavailable', 503))
      else vi.mocked(api.ruleHistory).mockRejectedValue(new HttpError('history unavailable', 503))
      if (kind === 'refresh')
        await wrapper.get('[data-testid="refresh-script-health"]').trigger('click')
      else
        await wrapper
          .findAll('button')
          .find((button) => button.text() === '管理')!
          .trigger('click')
      await flushPromises()
      expect(wrapper.findComponent(Table).props('data')).toEqual([
        expect.objectContaining({ id: 'rule-a', name: '温度处理' })
      ])
      pending.reject(new HttpError('forbidden', 40033))
      await flushPromises()
      expect(
        wrapper.findComponent(Table).props('data'),
        'AUTHORITY_DENIAL_MUST_ERASE_CURRENT_RULES'
      ).toEqual([])
      expect(wrapper.find('[data-testid="script-health"]').exists()).toBe(false)
      expect(api.activateRule).not.toHaveBeenCalled()
      wrapper.unmount()
    }
  )
  it('并发读旧上下文晚到失权不清除新项目列表', async () => {
    const wrapper = page()
    await open(wrapper)
    const pending = deferred<Health>()
    vi.mocked(api.getRuleScriptHealth).mockReturnValue(pending.promise)
    vi.mocked(api.getRule).mockRejectedValue(new HttpError('temporarily unavailable', 503))
    await wrapper.get('[data-testid="refresh-script-health"]').trigger('click')
    await flushPromises()
    vi.mocked(api.listRules).mockResolvedValue({ items: [{ id: 'rule-b', name: '新项目规则' }] })
    identity().info.currentProjectId = 'project-b'
    await flushPromises()
    pending.reject(new HttpError('old forbidden', 40033))
    await flushPromises()
    expect(wrapper.findComponent(Table).props('data')).toEqual([
      { id: 'rule-b', name: '新项目规则' }
    ])
    expect(wrapper.find('[data-testid="script-health"]').exists()).toBe(false)
    expect(api.activateRule).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
