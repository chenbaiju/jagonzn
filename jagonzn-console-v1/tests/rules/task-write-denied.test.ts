import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { session } from '../../src/core/session'
import { ApiError } from '../../src/core/http'
import { ruleRoutes } from '../../src/features/rules/routes'
const api = vi.hoisted(() => ({ getTask: vi.fn(), deleteTask: vi.fn(), saveTaskInformation: vi.fn(), getTaskUsageStatistics: vi.fn(), taskExecutions: vi.fn() }))
vi.mock('../../src/features/rules/api', () => api)
const job = { id: 'j', name: '任务', description: '原描述', version: 4, status: 'ACTIVE', targetType: 'ALL_DEVICES', scheduleType: 'CRON', cronExpression: '0 * * * * *', timezone: 'Asia/Shanghai', commandKey: 'set', input: { value: 1 } }
const Button = defineComponent({ props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' })
const Dialog = defineComponent({ props: ['modelValue'], template: '<section v-if="modelValue" role="dialog"><slot /><slot name="footer" /></section>' })
const Input = defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' })
const Panel = defineComponent({ props:['title'], template: '<div>{{ title }}<slot /></div>' })
const Tabs = defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<nav :data-current="modelValue"><button @click="$emit(\'update:modelValue\', \'task\')">任务页签</button><slot /></nav>' })
const stubs = { ElButton: Button, ElDialog: Dialog, ElInput: Input, ElForm: Panel, ElFormItem: Panel, ElAlert: Panel, ElTabs: Tabs, ElTabPane: true, ElSkeleton: true, ElEmpty: true, ElIcon: true, ElRadioGroup: true, ElRadioButton: true }
let wrapper: ReturnType<typeof mount>
function button(text: string) { const b = wrapper.findAll('button').find(item => item.text() === text); if (!b) throw new Error('missing '+text); return b }
async function open(path = '/tasks/jobs/j') { const router = createRouter({ history: createMemoryHistory(), routes: ruleRoutes }); await router.push(path); await router.isReady(); wrapper = mount(RouterView, { global: { plugins: [router], stubs } }); await flushPromises(); return router }
beforeEach(() => { api.getTask.mockReset(); api.saveTaskInformation.mockReset(); session.user = JSON.parse('{"currentProjectId":"p","permissions":["task:read","task:manage"]}'); api.getTask.mockResolvedValue(job) })
afterEach(() => { wrapper?.unmount(); session.user = null })
it.each([401,403,404])('信息保存%s清除缓存任务和信息弹窗，保留拒绝原因',async(status)=>{
 api.saveTaskInformation.mockRejectedValueOnce(new ApiError('任务写入已拒绝',status));await open();await button('编辑').trigger('click');expect(wrapper.find('[role="dialog"]').exists()).toBe(true);await button('保存').trigger('click');await flushPromises();expect(api.saveTaskInformation).toHaveBeenCalledTimes(1);expect(wrapper.find('[role="dialog"]').exists()).toBe(false);expect(wrapper.text()).not.toContain('ID：j');expect(wrapper.text()).toContain('任务写入已拒绝');expect(api.getTask).toHaveBeenCalledTimes(1)
})
