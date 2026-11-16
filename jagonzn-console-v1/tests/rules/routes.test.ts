import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { session } from '../../src/core/session'
import { ruleRoutes } from '../../src/features/rules/routes'
const api = vi.hoisted(() => ({ getRule: vi.fn(), getVersion: vi.fn(), ruleHistory: vi.fn(), getHealth: vi.fn(), saveRule: vi.fn(), pauseRule: vi.fn(), activateRule: vi.fn(), deleteRule: vi.fn(), debugRule: vi.fn(), getRuleUsageStatistics: vi.fn(), getConsoleRuleDebugLogs: vi.fn(), getConsoleRuleDebugControl: vi.fn() }))
vi.mock('../../src/features/rules/api', () => api)
let wrapper: ReturnType<typeof mount>
beforeEach(() => {
  Object.values(api).forEach(fn => fn.mockReset()); session.user = JSON.parse('{"currentProjectId":"p","projectRole":"OWNER","permissions":["rule:manage"]}'); session.projects=[{id:'p',status:'ACTIVE',myRole:'OWNER'}]
  api.getRule.mockImplementation(async (_project, id) => ({ id, name: id, version: 8, activeVersionId: `version-${id}`, status: 'PAUSED' }))
  api.ruleHistory.mockResolvedValue({ items: [] }); api.getHealth.mockResolvedValue({})
  api.getVersion.mockImplementation(async (_project, _id, version) => ({ id: version, source: version, actions: [] }))
  api.getConsoleRuleDebugLogs.mockResolvedValue({items:[],hasMore:false,nextCursor:null,projectVersion:1});api.getConsoleRuleDebugControl.mockResolvedValue({enabled:false,version:1,projectGeneration:1,ruleGeneration:1})
})
afterEach(() => { wrapper?.unmount(); session.user = null })
const Tabs = defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<nav :data-current="modelValue"><button @click="$emit(\'update:modelValue\', \'rule\')">规则页签</button><slot /></nav>' })
const stubs = { RuleDebugLogPanel: true, ElButton: true, ElTag: true, ElPopconfirm: true, ElTabs: Tabs, ElTabPane: true, ElSelect: true, ElOption: true, ElDialog: true, ElAlert: true, ElInput: true, ElSkeleton: true, ElEmpty: true, ElIcon: true, ElRadioGroup: true, ElRadioButton: true }
it('正式深链只按路由标识读元信息，不因隐藏源码版本接口阻断详情', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: ruleRoutes }); await router.push('/rules/messages/direct?internal=true&tab=versions'); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [router], stubs } }); await flushPromises()
  expect(api.getRule).toHaveBeenCalledWith('p', 'direct', expect.any(AbortSignal)); expect(api.ruleHistory).toHaveBeenCalled(); expect(wrapper.text()).toContain('direct'); expect(wrapper.text()).not.toContain('version-direct'); expect(api.getHealth).not.toHaveBeenCalled()
  await router.push('/rules/messages/next'); await flushPromises(); expect(api.getRule).toHaveBeenLastCalledWith('p', 'next', expect.any(AbortSignal)); expect(wrapper.text()).not.toContain('version-direct'); expect(api.getHealth).not.toHaveBeenCalled()
})
it('同页切详情后旧读取迟到不能覆盖新标识', async () => {
  let resolve!: (value: unknown) => void; api.getRule.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  const router = createRouter({ history: createMemoryHistory(), routes: ruleRoutes }); await router.push('/rules/messages/old'); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [router], stubs } }); await flushPromises(); await router.push('/rules/messages/new'); await flushPromises()
  resolve({ id: 'old', name: '旧规则', version: 2, activeVersionId: 'version-old' }); await flushPromises()
  expect(wrapper.text()).toContain('new'); expect(wrapper.text()).not.toContain('旧规则'); expect(api.getRule.mock.calls[0][2].aborted).toBe(true)
})

it('公共复刻策略关闭时，即使路由误传internal也不能开放高级界面', async () => {
  const record = ruleRoutes.find(r => r.path === '/rules/messages/:id')!
  if (!('component' in record) || !record.component) throw new Error('缺少详情组件')
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: record.path, component: record.component, props: { internal: true } }] }); await router.push('/rules/messages/protected'); await router.isReady(); wrapper = mount(RouterView, { global: { plugins: [router], stubs } }); await flushPromises(); expect(api.getHealth).not.toHaveBeenCalled(); expect(wrapper.text()).not.toContain('沙箱调试'); expect(wrapper.text()).not.toContain('version-protected')
})
it('规则公开页签恢复URL，切换不会重读或丢失其它查询，非法数组回默认', async () => {
  const router = createRouter({ history: createMemoryHistory(), routes: ruleRoutes }); await router.push('/rules/messages/direct?tab=settings&from=directory'); await router.isReady()
  wrapper = mount(RouterView, { global: { plugins: [router], stubs } }); await flushPromises()
  expect(wrapper.find('nav').attributes('data-current')).toBe('settings')
  await wrapper.find('nav button').trigger('click'); await flushPromises(); expect(router.currentRoute.value.query).toEqual({ from: 'directory' }); expect(api.getRule).toHaveBeenCalled()
  await router.push('/rules/messages/direct?tab=logs'); await flushPromises(); expect(wrapper.find('nav').attributes('data-current')).toBe('logs')
  await router.push('/rules/messages/direct?tab=settings&tab=versions&internal=true'); await flushPromises(); expect(wrapper.find('nav').attributes('data-current')).toBe('rule'); expect(api.getHealth).not.toHaveBeenCalled()
})
it('原站stat深链加载正式规则曲线，不开放TL健康或源码入口', async () => {
  api.getRuleUsageStatistics.mockResolvedValue({ from: '2026-10-23T00:00:00Z', to: '2026-10-24T00:00:00Z', items: Array.from({ length: 24 }, (_, index) => ({ hour: new Date(Date.parse('2026-10-23T00:00:00Z') + index * 3600000).toISOString(), calls: 0, actions: null })) })
  const router = createRouter({ history: createMemoryHistory(), routes: ruleRoutes }); await router.push('/rules/messages/direct?tab=stat'); await router.isReady(); wrapper = mount(RouterView, { global: { plugins: [router], stubs } }); await flushPromises()
  expect(wrapper.find('nav').attributes('data-current')).toBe('statistics'); expect(wrapper.text()).toContain('规则调用次数'); expect(wrapper.text()).toContain('操作执行次数'); expect(api.getRuleUsageStatistics).toHaveBeenCalledWith('p','direct',1,expect.any(AbortSignal)); expect(api.getHealth).not.toHaveBeenCalled(); expect(wrapper.text()).not.toContain('version-direct')
})
