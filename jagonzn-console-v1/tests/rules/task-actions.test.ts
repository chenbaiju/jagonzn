import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { shallowMount, flushPromises } from '@vue/test-utils'
import { computed, defineComponent, h, inject, provide, type ComputedRef } from 'vue'
import { session } from '../../src/core/session'
import { ApiError } from '../../src/core/http'
const api = vi.hoisted(() => ({ listTasks: vi.fn(), saveTask: vi.fn(), saveTaskInformation: vi.fn(), deleteTask: vi.fn(), enableTask: vi.fn(), disableTask: vi.fn(), runTask: vi.fn(), taskExecutions: vi.fn() }))
vi.mock('../../src/features/rules/api', () => api)
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({query:{}}) }))
// 仅内部原型用例显式开放测试开关；正式路由默认和全局常量由独立路由用例验证。
vi.mock('../../src/core/replica-scope', () => ({ THINGSLINK_EXTRAS_VISIBLE: true }))
import Tasks from '../../src/features/rules/TasksPage.vue'
import TaskRunnerDialog from '../../src/features/rules/TaskRunnerDialog.vue'
const Table = defineComponent({ props: ['data'], setup(props, { slots }) { provide('row', computed(() => props.data?.[0])); return () => h('div', props.data?.length ? slots.default?.() : []) } })
const Column = defineComponent({ setup(_, { slots }) { const row = inject<ComputedRef>('row')!; return () => h('div', slots.default?.({ row: row.value })) } })
const Button = defineComponent({ props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' })
const Confirm = defineComponent({ props: ['title'], emits: ['confirm'], template: '<span><slot name="reference" /><button @click="$emit(\'confirm\')">确认</button></span>' })
const Panel = defineComponent({ template: '<div><slot /></div>' })
const Dialog = defineComponent({ props: ['modelValue'], template: '<section v-if="modelValue"><slot /><slot name="footer" /></section>' })
const options = { props: { internal: true }, global: { stubs: { PageHeader: Panel, AsyncState: Panel, ElTable: Table, ElTableColumn: Column, ElButton: Button, ElPopconfirm: Confirm, ElDialog: Dialog, ElInput: true, ElAlert: true, ElForm: true, ElFormItem: true, ElSelect: true, ElOption: true, ElSwitch: true } } }
let wrapper: ReturnType<typeof shallowMount>
const job = { id: 'j', name: '任务', status: 'PAUSED', version: 4, commandKey: 'set', input: {}, targetType: 'ALL_DEVICES', scheduleType: 'CRON', cronExpression: '0 * * * * *', timezone: 'Asia/Shanghai' }
beforeEach(() => { Object.values(api).forEach(fn => fn.mockReset()); session.user = JSON.parse('{"currentProjectId":"p","permissions":["task:read","task:manage","task:run"]}'); api.listTasks.mockResolvedValue([job]); api.taskExecutions.mockResolvedValue([]) })
afterEach(() => { wrapper?.unmount(); session.user = null })
function confirmation(title: string) { const found = wrapper.findAllComponents(Confirm).find(c => String(c.props('title')).includes(title)); if (!found) throw new Error('missing confirmation'); return found }
async function run() { const buttons = wrapper.findAll('button'); await buttons.find(b => ['运行','运行任务'].includes(b.text()))!.trigger('click'); const submit = wrapper.findAll('button').find(b => b.text() === '确定运行'); if (submit) await submit.trigger('click'); else { const runner=wrapper.findComponent(TaskRunnerDialog); if(runner.exists())runner.vm.$emit('run') } }
it('运行按钮未确认不执行，确认后只受理一次并回读', async () => {
  api.runTask.mockResolvedValue({ status: 'PENDING' }); wrapper = shallowMount(Tasks, options); await flushPromises()
  expect(api.runTask).not.toHaveBeenCalled(); await run(); await flushPromises()
  expect(api.runTask).toHaveBeenCalledExactlyOnceWith('p', 'j', undefined, false); expect(api.listTasks).toHaveBeenCalledTimes(1)
})
it('运行未知结果锁定后续确认，不自动重跑，失败回读不解锁', async () => {
  api.runTask.mockRejectedValue(new ApiError('未知', 0, undefined, undefined, true)); wrapper = shallowMount(Tasks, options); await flushPromises()
  await run(); await flushPromises(); await run(); await flushPromises(); expect(api.runTask).toHaveBeenCalledTimes(1)
  api.listTasks.mockRejectedValueOnce(new Error('读取失败')); const refresh = wrapper.findAll('button').find(b => b.text() === '刷新')!; await refresh.trigger('click'); await flushPromises(); await run(); expect(api.runTask).toHaveBeenCalledTimes(1)
})
it('移除保留当前控制面CAS，启用沿用无调用方CAS的现行接口', async () => {
  api.deleteTask.mockResolvedValue(undefined); api.enableTask.mockResolvedValue(job); wrapper = shallowMount(Tasks, options); await flushPromises()
  await confirmation('确认启用').find('button:last-child').trigger('click'); await flushPromises(); expect(api.enableTask).toHaveBeenCalledExactlyOnceWith('p', 'j')
  await confirmation('确认移除').find('button:last-child').trigger('click'); await flushPromises(); expect(api.deleteTask).toHaveBeenCalledExactlyOnceWith('p', 'j', 4)
})
it('VIEWER读取保留，运行与管理确认入口均消失', async () => {
  session.user = JSON.parse('{"currentProjectId":"p","permissions":["task:read"]}'); wrapper = shallowMount(Tasks, options); await flushPromises(); expect(wrapper.findAllComponents(Confirm)).toHaveLength(0); expect(api.listTasks).toHaveBeenCalledTimes(1)
})
it('运行途中卸载后不再读取旧任务目录', async () => {
  let resolve!: (value: unknown) => void; api.runTask.mockImplementation(() => new Promise(done => { resolve = done })); wrapper = shallowMount(Tasks, options); await flushPromises(); await run(); wrapper.unmount(); resolve({ id: 'e' }); await flushPromises(); expect(api.listTasks).toHaveBeenCalledTimes(1)
})
it('正式运行器对启用任务要求后端状态前置且不展示幂等键', async () => {
  api.listTasks.mockResolvedValue([{ ...job, status: 'ACTIVE' }]); api.runTask.mockResolvedValue({ status: 'EXPANDING' }); wrapper = shallowMount(Tasks, { ...options, props: { internal: false } }); await flushPromises(); await run(); await flushPromises(); expect(api.runTask).toHaveBeenCalledExactlyOnceWith('p', 'j', undefined, true); expect(wrapper.text()).not.toContain('幂等键')
})
it('正式运行器停用任务不能提交，内部兼容行为不渗入正式流程', async () => {
  wrapper = shallowMount(Tasks, { ...options, props: { internal: false } }); await flushPromises(); await run(); await flushPromises(); expect(api.runTask).not.toHaveBeenCalled()
})

it.each([['DEVICE_TYPE','已保存的设备类型目标'],['EXPLICIT_DEVICES','已保存的指定设备'],['DEVICE_GROUPS','已保存的多个设备组'],['FUTURE_TARGET','—']])('内部运行确认的%s不冒充所有设备目标', async (targetType,label) => {
 api.listTasks.mockResolvedValue([{...job,status:'ACTIVE',targetType}]); wrapper=shallowMount(Tasks,{...options,props:{internal:true}});await flushPromises();await wrapper.findAll('button').find(b=>b.text()==='运行')!.trigger('click');expect(wrapper.text()).toContain(label);expect(wrapper.text()).not.toContain('已保存的所有设备目标');expect(api.runTask).not.toHaveBeenCalled()
})
it('单组运行确认保留已保存的组身份，未知组不会显示undefined',async()=>{
 api.listTasks.mockResolvedValue([{...job,status:'ACTIVE',targetType:'DEVICE_GROUP',targetGroupId:'group-a'}]);wrapper=shallowMount(Tasks,{...options,props:{internal:true}});await flushPromises();await wrapper.findAll('button').find(b=>b.text()==='运行')!.trigger('click');expect(wrapper.text()).toContain('已保存设备组：group-a');expect(api.runTask).not.toHaveBeenCalled()
})

it.each([401,403,404])('信息写入%s时撤下目录对象和编辑弹窗',async(status)=>{
 api.saveTask.mockRejectedValueOnce(new ApiError('写入拒绝',status));wrapper=shallowMount(Tasks,options);await flushPromises();await wrapper.findAll('button').find(b=>b.text()==='编辑')!.trigger('click');expect(wrapper.findAllComponents(Dialog).some(c=>c.props('modelValue'))).toBe(true);const action=wrapper.findAll('button').find(b=>b.text()==='保存')!;await action.trigger('click');await flushPromises();expect(api.saveTask).toHaveBeenCalledTimes(1);expect(wrapper.findAllComponents(Dialog).some(c=>c.props('modelValue'))).toBe(false);expect(wrapper.findAll('button').some(b=>b.text()===job.name)).toBe(false);expect(api.listTasks).toHaveBeenCalledTimes(1)
})
it('运行写403时清除运行确认和目录对象，不回退旧任务重跑',async()=>{
 api.listTasks.mockResolvedValue([{...job,status:'ACTIVE'}]);api.runTask.mockRejectedValueOnce(new ApiError('无运行权限',403));wrapper=shallowMount(Tasks,{...options,props:{internal:false}});await flushPromises();await run();await flushPromises();expect(api.runTask).toHaveBeenCalledTimes(1);expect(wrapper.findAllComponents(Dialog).some(c=>c.props('modelValue'))).toBe(false);expect(api.listTasks).toHaveBeenCalledTimes(1)
})

it('技术执行记录在显式内部入口仍可用，不删除原后端读取能力',async()=>{
 wrapper=shallowMount(Tasks,options);await flushPromises();const logs=wrapper.findAll('button').find(b=>b.text()==='执行记录')!;await logs.trigger('click');await flushPromises();expect(api.taskExecutions).toHaveBeenCalledExactlyOnceWith('p','j',expect.any(AbortSignal));expect(wrapper.findAllComponents(Dialog).some(c=>c.props('modelValue'))).toBe(true)
})
