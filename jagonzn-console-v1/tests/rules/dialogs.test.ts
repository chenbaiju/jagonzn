import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { session } from '../../src/core/session'
import { ApiError } from '../../src/core/http'
const api = vi.hoisted(() => ({ getRule: vi.fn(), getVersion: vi.fn(), ruleHistory: vi.fn(), getHealth: vi.fn(), saveRule: vi.fn(), pauseRule: vi.fn(), activateRule: vi.fn(), deleteRule: vi.fn(), debugRule: vi.fn(), listRules: vi.fn(), listTasks: vi.fn(), saveTask: vi.fn(), deleteTask: vi.fn(), enableTask: vi.fn(), disableTask: vi.fn(), runTask: vi.fn(), taskExecutions: vi.fn(), push: vi.fn() }))
vi.mock('../../src/features/rules/api', () => api)
// 仅内部原型用例显式开放测试开关；正式路由默认和全局常量由独立路由用例验证。
vi.mock('../../src/core/replica-scope', () => ({ THINGSLINK_EXTRAS_VISIBLE: true }))
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'r' }, query:{} }), useRouter: () => ({ push: api.push }), onBeforeRouteLeave:()=>undefined,onBeforeRouteUpdate:()=>undefined }))
import Detail from '../../src/features/rules/RuleDetailPage.vue'
import List from '../../src/features/rules/RulesPage.vue'
import Tasks from '../../src/features/rules/TasksPage.vue'
const Button = defineComponent({ props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' })
const Dialog = defineComponent({ props: ['modelValue'], template: '<section v-if="modelValue" role="dialog"><slot /><slot name="footer" /></section>' })
const Input = defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
const Panel = defineComponent({ template: '<div><slot /><slot name="status" /></div>' })
let wrapper: ReturnType<typeof shallowMount>
function identity(manage = true) { session.user = JSON.parse(JSON.stringify({ currentProjectId: 'p', permissions: manage ? ['rule:manage'] : ['rule:read'] })) }
const options = { props: { internal: true }, global: { renderStubDefaultSlot: true, stubs: { ElButton: Button, ElInput: Input, ElDialog: Dialog, PageHeader: Panel, AsyncState: Panel, SectionPanel: Panel, ElForm: Panel, ElFormItem: Panel, ElSelect: true, ElOption: true, ElTag: true, ElAlert: true, ElTabs: true, ElTabPane: true, ElPopconfirm: true, ElTable: defineComponent({ template: '<div />' }) } } }
function button(text: string) { const found = wrapper.findAll('button').find(b => b.text() === text); if (!found) throw new Error(`missing button ${text}`); return found }
beforeEach(() => {
  Object.values(api).forEach(mock => mock.mockReset()); identity()
  api.getRule.mockResolvedValue({ id: 'r', name: '原名称', description: '说明', version: 9, activeVersionId: 'v', status: 'ACTIVE' })
  api.ruleHistory.mockResolvedValue({ items: [{ id: 'v', versionNumber: 3 }] })
  api.getHealth.mockResolvedValue({})
  api.getVersion.mockResolvedValue({ id: 'v', versionNumber: 3, source: 'return input;', actions: [{ nodeType: 'one', config: { keep: [1, 2] } }, { nodeType: 'two', config: {} }] })
  api.listRules.mockResolvedValue({ items: [] }); api.listTasks.mockResolvedValue([])
})
afterEach(() => { wrapper?.unmount(); session.user = null; session.projects = [] })
it('编辑回填完整版本，取消不发送写请求', async () => {
  wrapper = shallowMount(Detail, options); await flushPromises(); await button('编辑').trigger('click')
  expect(wrapper.findAll('textarea').map(e => e.element.value)).toEqual(['原名称', '说明', 'return input;', JSON.stringify([{ nodeType: 'one', config: { keep: [1, 2] } }, { nodeType: 'two', config: {} }], null, 2)])
  await button('取消').trigger('click'); expect(wrapper.find('[role=dialog]').exists()).toBe(false); expect(api.saveRule).not.toHaveBeenCalled()
})
it('修订提交全动作和控制面CAS，成功后重新读取', async () => {
  api.saveRule.mockResolvedValue({ id: 'r' }); wrapper = shallowMount(Detail, options); await flushPromises(); await button('编辑').trigger('click')
  await wrapper.findAll('textarea')[0].setValue('新名称'); await button('保存新版本').trigger('click'); await flushPromises()
  expect(api.saveRule).toHaveBeenCalledWith('p', 'r', expect.objectContaining({ name: '新名称', expectedVersion: 9, actions: [{ nodeType: 'one', config: { keep: [1, 2] } }, { nodeType: 'two', config: {} }] }))
  expect(api.getRule).toHaveBeenCalledTimes(2)
})
it('未知结果锁定写入，核对只读不重提', async () => {
  api.saveRule.mockRejectedValue(new ApiError('未知', 0, undefined, undefined, true)); wrapper = shallowMount(Detail, options); await flushPromises(); await button('编辑').trigger('click'); await button('保存新版本').trigger('click'); await flushPromises()
  expect(button('保存新版本').attributes('disabled')).toBeDefined(); await button('保存新版本').trigger('click'); expect(api.saveRule).toHaveBeenCalledTimes(1)
  await button('重新读取核对').trigger('click'); await flushPromises(); expect(api.saveRule).toHaveBeenCalledTimes(1); expect(api.getRule).toHaveBeenCalledTimes(2)
})
it('保存途中撤权关闭弹窗，成功迟到不重开或重读旧详情', async () => {
  let resolve!: (value: unknown) => void; api.saveRule.mockImplementation(() => new Promise(done => { resolve = done }))
  wrapper = shallowMount(Detail, options); await flushPromises(); await button('编辑').trigger('click'); await button('保存新版本').trigger('click'); identity(false); await nextTick(); resolve({ id: 'r' }); await flushPromises()
  expect(wrapper.find('[role=dialog]').exists()).toBe(false); expect(api.getRule).toHaveBeenCalledTimes(1)
})
it('沙箱校验输入，结果归属选定不可变版本', async () => {
  api.debugRule.mockResolvedValue({ status: 'SUCCEEDED', outputJson: '{}' }); wrapper = shallowMount(Detail, options); await flushPromises(); await button('沙箱调试').trigger('click'); await wrapper.find('textarea').setValue('{'); await button('调试').trigger('click'); expect(api.debugRule).not.toHaveBeenCalled()
  await wrapper.find('textarea').setValue('{}'); await button('调试').trigger('click'); await flushPromises(); expect(api.debugRule).toHaveBeenCalledWith('p', 'r', 'v', '{}'); expect(wrapper.find('[role=dialog]').text()).toContain('SUCCEEDED')
})
it('创建入口进入独立完整路由，不在列表内建草稿', async () => {
  wrapper = shallowMount(List, options); await flushPromises(); await button('创建规则').trigger('click')
  expect(api.push).toHaveBeenCalledWith('/rules/messages/create'); expect(api.saveRule).not.toHaveBeenCalled()
})
it('创建入口不依赖列表内未知写状态，列表不重复提交', async () => {
  api.saveRule.mockRejectedValue(new ApiError('未知', 0, undefined, undefined, true)); wrapper = shallowMount(List, options); await flushPromises(); await button('创建规则').trigger('click')
  expect(api.push).toHaveBeenCalledWith('/rules/messages/create'); expect(api.saveRule).not.toHaveBeenCalled()
})

function taskIdentity() { session.user = JSON.parse('{"currentProjectId":"p","permissions":["task:read","task:manage"]}'); session.projects = [{ id: 'p', timezone: 'Asia/Shanghai' }] }
it('任务创建保留项目时区，默认停用，成功回读', async () => {
  taskIdentity(); api.saveTask.mockResolvedValue({ id: 'new' }); wrapper = shallowMount(Tasks, options); await flushPromises(); await button('创建任务').trigger('click')
  const inputs = wrapper.findAll('textarea'); await inputs[1].setValue('任务'); await inputs[3].setValue('2026-11-01T01:00:00Z'); await inputs[5].setValue('set'); await inputs[6].setValue('{"value":1}'); await button('保存').trigger('click'); await flushPromises()
  expect(api.saveTask).toHaveBeenCalledWith('p', '', expect.objectContaining({ name: '任务', timezone: 'Asia/Shanghai', scheduleType: 'ONCE', enabled: false, input: { value: 1 } })); expect(api.listTasks).toHaveBeenCalledTimes(2)
})
it('项目时区缺失时不猜测默认值且不创建', async () => {
  taskIdentity(); session.projects = []; wrapper = shallowMount(Tasks, options); await flushPromises(); await button('创建任务').trigger('click'); expect(wrapper.find('[role=dialog]').exists()).toBe(false); expect(api.saveTask).not.toHaveBeenCalled()
})
it('任务创建中的无效JSON保留输入，不发送写请求', async () => {
  taskIdentity(); wrapper = shallowMount(Tasks, options); await flushPromises(); await button('创建任务').trigger('click'); await wrapper.findAll('textarea')[6].setValue('[]'); await button('保存').trigger('click'); await flushPromises(); expect(api.saveTask).not.toHaveBeenCalled(); expect(wrapper.findAll('textarea')[6].element.value).toBe('[]')
})
it('保存途中卸载后不再读取旧详情', async () => {
  let resolve!: (value: unknown) => void; api.saveRule.mockImplementation(() => new Promise(done => { resolve = done })); wrapper = shallowMount(Detail, options); await flushPromises(); await button('编辑').trigger('click'); await button('保存新版本').trigger('click'); wrapper.unmount(); resolve({ id: 'r' }); await flushPromises(); expect(api.getRule).toHaveBeenCalledTimes(1)
})
it('撤权再授权不接收原编辑器的迟到保存', async () => {
  let resolve!: (value: unknown) => void; api.saveRule.mockImplementation(() => new Promise(done => { resolve = done })); wrapper = shallowMount(Detail, options); await flushPromises(); await button('编辑').trigger('click'); await button('保存新版本').trigger('click'); identity(false); await nextTick(); identity(true); await flushPromises(); resolve({ id: 'r' }); await flushPromises(); expect(api.getRule).toHaveBeenCalledTimes(2)
})
it('服务器失权回读清除已缓存源码，不保留旧详情对象', async () => {
  wrapper = shallowMount(Detail, options); await flushPromises(); api.getRule.mockRejectedValueOnce(new ApiError('无权', 403)); const page = wrapper.vm as unknown as { reread: () => Promise<void>; resource: { data: { value: unknown } } }; await page.reread(); await flushPromises(); expect(page.resource.data.value).toBeUndefined()
})

it('正式规则详情隐藏TL版本、健康、沙箱和源码编辑入口', async () => {
  wrapper = shallowMount(Detail, { ...options, props: { internal: false } }); await flushPromises()
  expect(wrapper.text()).not.toContain('连续失败'); expect(wrapper.text()).not.toContain('沙箱调试'); expect(wrapper.text()).not.toContain('版本 3'); expect(api.getHealth).not.toHaveBeenCalled()
  await button('编辑').trigger('click'); expect(wrapper.findAll('textarea').map(input => input.element.value)).toEqual(['原名称', '说明']); expect(wrapper.text()).not.toContain('规则源码')
})
it('正式任务编辑隐藏TL命令/CRON/幂等键，保留原站名称说明编辑', async () => {
  taskIdentity(); wrapper = shallowMount(Tasks, { ...options, props: { internal: false } }); await flushPromises(); expect(wrapper.text()).toContain('创建任务'); expect(wrapper.text()).not.toContain('幂等键'); expect(wrapper.text()).not.toContain('CRON')
})
