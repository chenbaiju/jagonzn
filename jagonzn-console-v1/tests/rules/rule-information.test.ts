import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { session } from '../../src/core/session'
import { ApiError } from '../../src/core/http'
const api = vi.hoisted(() => ({ getRule: vi.fn(), getVersion: vi.fn(), ruleHistory: vi.fn(), getHealth: vi.fn(), saveRule: vi.fn(), saveRuleInformation: vi.fn(), pauseRule: vi.fn(), activateRule: vi.fn(), deleteRule: vi.fn(), debugRule: vi.fn(), push: vi.fn(), replace: vi.fn() }))
vi.mock('../../src/features/rules/api', () => api)
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'r' }, query: {} }), useRouter: () => ({ push: api.push, replace: api.replace }), onBeforeRouteLeave:()=>undefined,onBeforeRouteUpdate:()=>undefined }))
import Detail from '../../src/features/rules/RuleDetailPage.vue'
const Button = defineComponent({ props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' })
const Dialog = defineComponent({ props: ['modelValue'], template: '<section v-if="modelValue" role="dialog"><slot /><slot name="footer" /></section>' })
const Input = defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
const Panel = defineComponent({ template: '<div><slot /></div>' })
const Alert = defineComponent({ props: ['title'], template: '<div role="alert">{{ title }}<slot /></div>' })
const Switch = defineComponent({ props: ['modelValue', 'disabled'], emits: ['change'], template: '<button :disabled="disabled" @click="$emit(\'change\', !modelValue)">启用切换</button>' })
const options = { global: { renderStubDefaultSlot: true, stubs: { ElButton: Button, ElInput: Input, ElDialog: Dialog, PageHeader: Panel, AsyncState: Panel, SectionPanel: Panel, ElForm: Panel, ElFormItem: Panel, ElSelect: true, ElOption: true, ElTag: true, ElAlert: Alert, ElTabs: true, ElTabPane: true, ElPopconfirm: true, ElSwitch: Switch } } }
const row = { id: 'r', name: '原名称', description: '原描述', version: 9, activeVersionId: 'v', status: 'PAUSED' }
let wrapper: ReturnType<typeof shallowMount>
function identity(allowed = true) { session.user = JSON.parse(JSON.stringify({ currentProjectId: 'p', permissions: allowed ? ['rule:manage'] : ['rule:read'] })) }
function button(label: string) { const result = wrapper.findAll('button').find(item => item.text() === label); if (!result) throw new Error(`missing ${label}`); return result }
async function open() { wrapper = shallowMount(Detail, options); await flushPromises() }
beforeEach(() => {
  Object.values(api).forEach(fn => fn.mockReset()); identity(); api.getRule.mockResolvedValue(row)
  api.getVersion.mockRejectedValue(new Error('隐藏版本不可用')); api.ruleHistory.mockRejectedValue(new Error('隐藏历史不可用'))
})
afterEach(() => { wrapper?.unmount(); session.user = null })
it('正式信息只读元数据，两字段与CAS保存后按服务端回读，不追加源码版本', async () => {
  api.getRule.mockResolvedValueOnce(row).mockResolvedValue({ ...row, name: '服务端名称', version: 10 }); api.saveRuleInformation.mockResolvedValue({ name: '不采信的响应' })
  await open(); expect(api.getVersion).not.toHaveBeenCalled(); expect(api.ruleHistory).not.toHaveBeenCalled(); expect(api.getHealth).not.toHaveBeenCalled()
  await button('编辑').trigger('click'); const fields = wrapper.findAll('textarea'); expect(fields.map(item => item.element.value)).toEqual(['原名称', '原描述'])
  await fields[0].setValue('新名称'); await button('保存').trigger('click'); await flushPromises()
  expect(api.saveRuleInformation).toHaveBeenCalledWith('p', 'r', { name: '新名称', description: '原描述', expectedVersion: 9 }); expect(api.saveRule).not.toHaveBeenCalled()
  expect(api.getRule).toHaveBeenCalledTimes(2); expect(wrapper.text()).toContain('服务端名称'); expect(wrapper.text()).not.toContain('不采信的响应')
})
it('取消不写，未知修改关闭后仍锁定，失败回读不能解锁或自动重提', async () => {
  await open(); await button('编辑').trigger('click'); await button('取消').trigger('click'); expect(api.saveRuleInformation).not.toHaveBeenCalled()
  api.saveRuleInformation.mockRejectedValue(new ApiError('未知', 0, undefined, undefined, true)); await button('编辑').trigger('click'); await button('保存').trigger('click'); await flushPromises(); await button('取消').trigger('click')
  expect(button('编辑').attributes('disabled')).toBeDefined(); api.getRule.mockRejectedValueOnce(new ApiError('读取失败', 503)); await button('重新读取核对').trigger('click'); await flushPromises()
  expect(button('编辑').attributes('disabled')).toBeDefined(); expect(api.saveRuleInformation).toHaveBeenCalledTimes(1)
  await button('重新读取核对').trigger('click'); await flushPromises(); expect(button('编辑').attributes('disabled')).toBeUndefined()
})
it('修改在途撤权再授权后，旧结果不触发新身份的回读', async () => {
  let resolve!: (value: unknown) => void; api.saveRuleInformation.mockImplementation(() => new Promise(done => { resolve = done })); await open(); await button('编辑').trigger('click'); await button('保存').trigger('click')
  identity(false); await nextTick(); identity(); await flushPromises(); const calls = api.getRule.mock.calls.length; resolve({}); await flushPromises(); expect(api.getRule).toHaveBeenCalledTimes(calls); expect(wrapper.find('[role=dialog]').exists()).toBe(false)
})
it('卸载后迟到的信息保存不读旧详情', async () => {
  let resolve!: (value: unknown) => void; api.saveRuleInformation.mockImplementation(() => new Promise(done => { resolve = done })); await open(); await button('编辑').trigger('click'); await button('保存').trigger('click'); wrapper.unmount(); resolve({}); await flushPromises(); expect(api.getRule).toHaveBeenCalledTimes(1)
})
it('服务端写入失权立即清除缓存元数据与信息弹窗，不退回完整修订', async () => {
  api.saveRuleInformation.mockRejectedValue(new ApiError('服务端已撤权', 403)); await open(); await button('编辑').trigger('click'); await button('保存').trigger('click'); await flushPromises()
  expect(wrapper.find('[role=dialog]').exists()).toBe(false); expect(wrapper.text()).not.toContain('原名称'); expect(api.saveRule).not.toHaveBeenCalled(); expect(api.getVersion).not.toHaveBeenCalled()
})
it('草稿仅在启用时读取一个候选版本，信息编辑和停用不读取隐藏版本', async () => {
  api.getRule.mockResolvedValue({ ...row, status: 'DRAFT', activeVersionId: undefined }); api.ruleHistory.mockResolvedValue({ items: [{ id: 'latest' }] }); api.activateRule.mockResolvedValue({})
  await open(); expect(api.ruleHistory).not.toHaveBeenCalled(); await button('启用切换').trigger('click'); await flushPromises()
  expect(api.ruleHistory).toHaveBeenCalledWith('p', 'r', undefined, undefined, 1); expect(api.activateRule).toHaveBeenCalledWith('p', 'r', 'latest', 9); expect(api.getVersion).not.toHaveBeenCalled()
})
it('候选版本读取后发生撤权，不能继续向旧规则发启用请求', async () => {
  let resolve!: (value: unknown) => void; api.getRule.mockResolvedValue({ ...row, status: 'DRAFT', activeVersionId: undefined }); api.ruleHistory.mockImplementation(() => new Promise(done => { resolve = done }))
  await open(); await button('启用切换').trigger('click'); identity(false); await nextTick(); identity(); await flushPromises(); resolve({ items: [{ id: 'late' }] }); await flushPromises(); expect(api.activateRule).not.toHaveBeenCalled()
})
it('无候选版本时不伪装启用或静默发布，显示可核对错误', async () => {
  api.getRule.mockResolvedValue({ ...row, status: 'DRAFT', activeVersionId: undefined }); api.ruleHistory.mockResolvedValue({ items: [] }); await open(); await button('启用切换').trigger('click'); await flushPromises(); expect(api.activateRule).not.toHaveBeenCalled(); expect(wrapper.text()).toContain('没有可启用的规则版本')
})
