import {it,expect,vi,afterEach,beforeEach} from 'vitest'
import {ElMessage} from 'element-plus'
import {mount,flushPromises} from '@vue/test-utils'
import {defineComponent} from 'vue'
import TaskRunnerDialog from '../../src/features/rules/TaskRunnerDialog.vue'
import {session} from '../../src/core/session'
import {changeIdentity} from '../../src/core/http'
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002'
const Panel=defineComponent({props:['title'],template:'<div>{{title}}<slot name="label"/><slot/><slot name="footer"/></div>'})
const Group=defineComponent({props:['modelValue','disabled'],emits:['update:modelValue'],template:'<div><button :disabled="disabled" @click="$emit(\'update:modelValue\',\'all\')">所有目标设备</button><button :disabled="disabled" @click="$emit(\'update:modelValue\',\'selected\')">指定目标设备</button></div>'})
const Button=defineComponent({props:['disabled','loading'],template:'<button :disabled="disabled || loading"><slot/></button>'})
const Select=defineComponent({props:['modelValue','disabled'],emits:['update:modelValue'],template:'<select multiple :value="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\',Array.from($event.target.selectedOptions).map(o=>o.value))"><slot/></select>'})
const Option=defineComponent({props:['value','label'],template:'<option :value="value">{{label}}</option>'})
const task={tags:{},actionType:'COMMAND' as const,id:'j',name:'任务',status:'ACTIVE' as const,version:4,targetType:'DEVICE_TYPE' as const,targetDeviceTypeId:a}
let wrapper:ReturnType<typeof mount>
const stubs={ElDialog:Panel,ElForm:Panel,ElFormItem:Panel,ElAlert:Panel,ElRadioGroup:Group,ElRadio:true,ElButton:Button,ElSelect:Select,ElOption:Option,ElTooltip:Panel,ElIcon:Panel}
function button(text:string){return wrapper.findAll('button').find(b=>b.text()===text)!}
beforeEach(()=>{vi.spyOn(ElMessage,'error')})
afterEach(()=>{wrapper?.unmount();ElMessage.closeAll();vi.restoreAllMocks();session.user=null})
function open(extra={}){session.user=JSON.parse('{"currentProjectId":"p","permissions":["task:read","task:run"]}');const loader=vi.fn().mockResolvedValue({options:[{id:a,label:'已保存甲'},{id:b,label:'已保存乙'}],hasMore:false});wrapper=mount(TaskRunnerDialog,{props:{modelValue:true,task,loadCandidates:loader,...extra},global:{stubs}});return loader}
it('云函数任务显示基础类型和子类型，普通命令类型不重复',async()=>{
 open({task:{...task,commandKey:'write_tag'}})
 expect(wrapper.findAll('.task-runner-value').map(value=>value.text())).toEqual(['任务','命令下发'])
 await wrapper.setProps({task:{...task,actionType:'COMMAND_FUNCTION'}})
 expect(wrapper.findAll('.task-runner-value').map(value=>value.text())).toEqual(['任务','命令下发 - 云函数命令下发'])
 expect(wrapper.get('[aria-label="选择目标类型说明"]').attributes('tabindex')).toBe('0')
})
it('所有目标不额外查询候选且取消无运行，确认只发所有保存范围意图',async()=>{const loader=open();await button('取消').trigger('click');expect(wrapper.emitted('run')).toBeUndefined();expect(loader).not.toHaveBeenCalled();await button('确定').trigger('click');expect(wrapper.emitted('run')).toEqual([[]]);expect(loader).not.toHaveBeenCalled()})
it('指定目标只加载保存范围候选，空选择不运行，确认发实际选中集合',async()=>{const loader=open();await button('指定目标设备').trigger('click');await flushPromises();expect(loader).toHaveBeenCalledWith(undefined,expect.any(AbortSignal));await button('确定').trigger('click');expect(wrapper.emitted('run')).toBeUndefined();await wrapper.find('select').setValue([b]);await button('确定').trigger('click');expect(wrapper.emitted('run')).toEqual([[[b]]]);expect(wrapper.text()).not.toContain('所有设备目标')})
it('busy与unknown锁阻止重复提交和关闭',async()=>{open({busy:true,locked:true,error:'服务端运行结果仍待核对',task:{...task,status:'PAUSED'}});await button('确定').trigger('click');await button('取消').trigger('click');expect(wrapper.emitted('run')).toBeUndefined();expect(wrapper.emitted('update:modelValue')).toBeUndefined();expect(wrapper.text()).toContain('服务端运行结果仍待核对');expect(ElMessage.error).not.toHaveBeenCalled();expect(button('确定').attributes('disabled')).toBeDefined()})
it('停用任务可点确定但显示明确拒绝并保留弹窗，不发运行意图',async()=>{open({task:{...task,status:'PAUSED'}});expect(button('确定').attributes('disabled')).toBeUndefined();await button('确定').trigger('click');expect(wrapper.emitted('run')).toBeUndefined();expect(ElMessage.error).toHaveBeenCalledExactlyOnceWith('任务已停用，无法运行');expect(wrapper.text()).not.toContain('任务已停用，无法运行');expect(wrapper.emitted('update:modelValue')).toBeUndefined()})

it('同任务版本变化撤下候选并使旧确认失效，重新打开才可运行',async()=>{open();await button('指定目标设备').trigger('click');await flushPromises();await wrapper.find('select').setValue([a]);await wrapper.setProps({task:{...task,version:5}});await button('确定').trigger('click');expect(wrapper.emitted('run')).toBeUndefined();expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);expect(wrapper.find('select').exists()).toBe(false);await wrapper.setProps({modelValue:false});await wrapper.setProps({modelValue:true});await button('确定').trigger('click');expect(wrapper.emitted('run')).toEqual([[]])})
it('身份失效即时撤下候选，旧请求迟到不能恢复旧确认',async()=>{let resolve!:(v:unknown)=>void;open({loadCandidates:()=>new Promise(done=>{resolve=done})});await button('指定目标设备').trigger('click');await flushPromises();changeIdentity();await flushPromises();resolve({options:[{id:a,label:'旧身份设备'}],hasMore:false});await flushPromises();await button('确定').trigger('click');expect(wrapper.emitted('run')).toBeUndefined();expect(wrapper.find('select').exists()).toBe(false);expect(wrapper.text()).not.toContain('旧身份设备')})
it('项目切换且父弹窗尚未响应关闭时也拒绝旧运行意图',async()=>{open();session.user={...session.user!,currentProjectId:'another'};await flushPromises();await button('确定').trigger('click');expect(wrapper.emitted('run')).toBeUndefined();expect(wrapper.emitted('update:modelValue')).toEqual([[false]])})
it('隐藏弹窗不能以残留按钮提交',async()=>{open({modelValue:false});await button('确定').trigger('click');expect(wrapper.emitted('run')).toBeUndefined()})

it('同版状态在打开后变为停用，最终确认重新检查当前状态',async()=>{open();await wrapper.setProps({task:{...task,status:'PAUSED'}});await button('确定').trigger('click');expect(wrapper.emitted('run')).toBeUndefined();expect(ElMessage.error).toHaveBeenCalledExactlyOnceWith('任务已停用，无法运行');expect(wrapper.text()).not.toContain('任务已停用，无法运行')})
