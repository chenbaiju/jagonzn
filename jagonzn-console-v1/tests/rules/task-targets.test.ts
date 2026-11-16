import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { createRouter,createMemoryHistory,RouterView } from 'vue-router'
import { mount,flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { session } from '../../src/core/session'
import { ApiError } from '../../src/core/http'
import { ruleRoutes } from '../../src/features/rules/routes'
import TaskChoiceSelect from '../../src/features/rules/TaskChoiceSelect.vue'
const api=vi.hoisted(()=>({getTask:vi.fn(),saveTaskInformation:vi.fn(),saveTaskTargets:vi.fn(),deleteTask:vi.fn()}))
const choices=vi.hoisted(()=>({taskChoices:vi.fn(),selectedTaskChoices:vi.fn()}))
vi.mock('../../src/features/rules/api',()=>api)
vi.mock('../../src/features/rules/task-choices',()=>choices)
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002'
const job={id:'j',name:'任务',description:'原描述',version:4,status:'ACTIVE',targetType:'EXPLICIT_DEVICES',targetDeviceIds:[a],scheduleType:'ONCE',runAt:'2020-01-01T00:00:00Z',timezone:'Asia/Shanghai',commandKey:'hidden',input:{x:2}}
const Button=defineComponent({props:['disabled','loading'],template:'<button :disabled="disabled || loading"><slot /></button>'})
const Panel=defineComponent({props:['title'],template:'<div>{{ title }}<slot /></div>'})
const Dialog=defineComponent({props:['modelValue','title'],template:'<section v-if="modelValue" role="dialog"><h3>{{ title }}</h3><slot /><slot name="footer" /></section>'})
const Group=defineComponent({props:['modelValue','disabled'],emits:['update:modelValue'],template:'<div><button v-for="item in [[\'devices\',\'设备\'],[\'device-types\',\'设备类型\'],[\'device-groups\',\'设备组\']]" :disabled="disabled" @click="$emit(\'update:modelValue\',item[0])">{{item[1]}}</button></div>'})
const Select=defineComponent({props:['modelValue','multiple','disabled'],emits:['update:modelValue'],template:'<select :multiple="multiple" :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\',multiple ? Array.from($event.target.selectedOptions).map(option=>option.value) : $event.target.value)"><slot /></select>'})
const Option=defineComponent({props:['value','label'],template:'<option :value="value">{{label}}</option>'})
const stubs={ElButton:Button,ElDialog:Dialog,ElForm:Panel,ElFormItem:Panel,ElAlert:Panel,ElRadioGroup:Group,ElRadio:true,ElSelect:Select,ElOption:Option,ElInput:true,ElTabs:Panel,ElTabPane:true,ElIcon:true}
let wrapper:ReturnType<typeof mount>
function button(text:string){const value=wrapper.findAll('button').find(b=>b.text()===text);if(!value)throw new Error('missing '+text);return value}
function targetEdit(){return wrapper.find('button[aria-label="编辑目标"]')}
async function open(){const router=createRouter({history:createMemoryHistory(),routes:ruleRoutes});await router.push('/tasks/jobs/j');await router.isReady();wrapper=mount(RouterView,{global:{plugins:[router],stubs}});await flushPromises();return router}
beforeEach(()=>{vi.clearAllMocks();session.user=JSON.parse('{"currentProjectId":"p","permissions":["task:read","task:manage"]}');api.getTask.mockReset().mockResolvedValue(job);api.saveTaskTargets.mockReset().mockResolvedValue({});choices.taskChoices.mockReset().mockResolvedValue({options:[{id:a,label:'甲'},{id:b,label:'乙'}],hasMore:false});choices.selectedTaskChoices.mockReset().mockResolvedValue([{id:a,label:'甲'}])})
afterEach(()=>{wrapper?.unmount();session.user=null})
it('目标弹窗按正式三种来源编辑，保存CAS和隐藏计划/动作原件，成功只采信GET',async()=>{
 api.getTask.mockResolvedValueOnce(job).mockResolvedValueOnce({...job,version:5,targetType:'DEVICE_GROUPS',targetDeviceIds:[],targetGroupIds:[a,b]});await open();await targetEdit().trigger('click');await flushPromises();expect(wrapper.find('[role="dialog"]').text()).toContain('设置目标设备');await button('设备组').trigger('click');await flushPromises();await wrapper.find('select').setValue([a,b]);await button('确定').trigger('click');await flushPromises();expect(api.saveTaskTargets).toHaveBeenCalledWith('p','j',expect.objectContaining({targetType:'DEVICE_GROUPS',targetGroupIds:[a,b],targetDeviceIds:undefined,targetDeviceTypeId:undefined,expectedVersion:4,runAt:job.runAt,commandKey:'hidden',input:{x:2}}));expect(api.getTask).toHaveBeenCalledTimes(2);expect(wrapper.find('[role="dialog"]').exists()).toBe(false);expect(wrapper.text()).toContain('多个设备组')
})
it('类型选择只保存一个类型，设备/组残留不进入请求',async()=>{
 await open();await targetEdit().trigger('click');await button('设备类型').trigger('click');await flushPromises();await wrapper.find('select').setValue(b);await button('确定').trigger('click');await flushPromises();expect(api.saveTaskTargets).toHaveBeenCalledWith('p','j',expect.objectContaining({targetType:'DEVICE_TYPE',targetDeviceTypeId:b,targetDeviceIds:undefined,targetGroupIds:undefined,targetGroupId:undefined}))
})
it('取消或清空集合不能写入，旧ALL不会假保存空的所有设备目标',async()=>{
 api.getTask.mockResolvedValue({...job,targetType:'ALL_DEVICES',targetDeviceIds:[]});await open();await targetEdit().trigger('click');await flushPromises();await button('确定').trigger('click');expect(api.saveTaskTargets).not.toHaveBeenCalled();expect(wrapper.text()).toContain('请选择有效设备');await button('取消').trigger('click');expect(wrapper.find('[role="dialog"]').exists()).toBe(false);expect(api.saveTaskTargets).not.toHaveBeenCalled()
})
it('目标保存未知后锁定，失败回读不能恢复编辑，也不重放',async()=>{
 api.saveTaskTargets.mockRejectedValueOnce(new ApiError('未知',0,undefined,undefined,true));await open();await targetEdit().trigger('click');await flushPromises();await button('确定').trigger('click');await flushPromises();expect(button('确定').attributes('disabled')).toBeDefined();await button('取消').trigger('click');expect(targetEdit().attributes('disabled')).toBeDefined();api.getTask.mockRejectedValueOnce(new ApiError('读取失败',503));await button('重新读取核对').trigger('click');await flushPromises();expect(api.saveTaskTargets).toHaveBeenCalledTimes(1);expect(wrapper.find('button[aria-label="编辑目标"]').exists()).toBe(false)
})
it.each([401,403,404])('目标保存%s撤下缓存对象和所有确认',async(status)=>{
 api.saveTaskTargets.mockRejectedValueOnce(new ApiError('目标写已拒绝',status));await open();await targetEdit().trigger('click');await flushPromises();await button('确定').trigger('click');await flushPromises();expect(wrapper.find('[role="dialog"]').exists()).toBe(false);expect(wrapper.text()).not.toContain('ID：j');expect(wrapper.text()).toContain('目标写已拒绝')
})
it('写入等待期间撤权后迟到成功不回读，恢复管理权仍锁定',async()=>{
 let resolve!:(v:unknown)=>void;api.saveTaskTargets.mockImplementationOnce(()=>new Promise(done=>{resolve=done}));await open();await targetEdit().trigger('click');await flushPromises();await button('确定').trigger('click');session.user={...session.user!,permissions:['task:read']};await flushPromises();resolve({});await flushPromises();session.user={...session.user!,permissions:['task:read','task:manage']};await flushPromises();expect(targetEdit().attributes('disabled')).toBeDefined();expect(api.getTask).toHaveBeenCalledTimes(1)
})
it('VIEWER没有目标编辑入口，候选读取403不能留旧弹窗',async()=>{
 session.user={...session.user!,permissions:['task:read']};await open();expect(targetEdit().exists()).toBe(false);session.user={...session.user!,permissions:['task:read','task:manage']};await flushPromises();choices.taskChoices.mockRejectedValueOnce(new ApiError('候选无权',403));await targetEdit().trigger('click');await flushPromises();expect(wrapper.find('[role="dialog"]').exists()).toBe(false);expect(wrapper.text()).toContain('候选无权')
})
it('加载更多合并候选但不改变已选目标',async()=>{
 choices.taskChoices.mockResolvedValueOnce({options:[{id:a,label:'甲'}],hasMore:true,nextCursor:'next'}).mockResolvedValueOnce({options:[{id:b,label:'乙'}],hasMore:false});wrapper=mount(TaskChoiceSelect,{props:{kind:'devices',modelValue:[a]},global:{stubs}});await flushPromises();await button('加载更多').trigger('click');await flushPromises();expect(wrapper.findAll('option').map(o=>o.text())).toEqual(['甲','乙']);expect(wrapper.emitted('update:modelValue')).toBeUndefined();expect(choices.taskChoices).toHaveBeenLastCalledWith('p','devices','next',expect.any(AbortSignal))
})
it('切来源后旧候选迟到不能混入新类型选项',async()=>{
 let resolve!:(v:unknown)=>void;choices.taskChoices.mockImplementationOnce(()=>new Promise(done=>{resolve=done})).mockResolvedValueOnce({options:[{id:b,label:'类型乙'}],hasMore:false});wrapper=mount(TaskChoiceSelect,{props:{kind:'devices',modelValue:[]},global:{stubs}});await flushPromises();const signal=choices.taskChoices.mock.calls[0][3];await wrapper.setProps({kind:'device-types'});await flushPromises();resolve({options:[{id:a,label:'旧设备'}],hasMore:false});await flushPromises();expect(signal.aborted).toBe(true);expect(wrapper.text()).toContain('类型乙');expect(wrapper.text()).not.toContain('旧设备')
})

it('大量已选ID只补有限选项节点，完整选择集合仍保留给CAS保存',async()=>{
 const selected=Array.from({length:101},(_,i)=>`00000000-0000-4000-8000-${i.toString(16).padStart(12,'0')}`);wrapper=mount(TaskChoiceSelect,{props:{kind:'devices',modelValue:selected},global:{stubs}});await flushPromises();expect(wrapper.findAll('option').length).toBeLessThanOrEqual(22);expect(wrapper.findComponent(TaskChoiceSelect).props('modelValue')).toEqual(selected);expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})
