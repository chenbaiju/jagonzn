import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {defineComponent,watch} from 'vue'
import {session} from '../../src/core/session'
import SceneTaskRunDialog from '../../src/features/rules/SceneTaskRunDialog.vue'
import {automationTaskNode} from '../../src/features/rules/automation-editor-draft'
const project='10000000-0000-4000-8000-000000000001',deviceA='10000000-0000-4000-8000-000000000004',deviceB='10000000-0000-4000-8000-000000000005',taskA='10000000-0000-7000-8000-000000000011',taskB='10000000-0000-7000-8000-000000000012'
const api=vi.hoisted(()=>({readSceneDeviceTasks:vi.fn(),readSceneTaskName:vi.fn()}))
vi.mock('../../src/features/rules/scene-editor-api',()=>api)
const Button=defineComponent({props:['disabled','loading','link'],template:'<button :disabled="disabled||loading"><slot/></button>'})
const Dialog=defineComponent({props:['modelValue','title'],template:'<section role="dialog"><h3>{{title}}</h3><slot/><slot name="footer"/></section>'})
const Panel=defineComponent({props:['label'],template:'<div><span>{{label}}</span><slot/></div>'})
const Select=defineComponent({
 props:['modelValue','disabled','loading'],emits:['update:modelValue'],inheritAttrs:false,
 template:'<div><select v-bind="$attrs" :value="modelValue" :disabled="disabled||loading" @change="$emit(\'update:modelValue\',$event.target.value)"><option value=""/><slot/></select><slot name="footer"/></div>'
})
const Option=defineComponent({props:['label','value'],template:'<option :value="value">{{label}}</option>'})
const Alert=defineComponent({props:['title'],template:'<aside role="alert">{{title}}<slot/></aside>'})
const Target=defineComponent({
 props:['initialId','disabled'],emits:['selected','busy'],
 setup(props,{emit}){
  watch(()=>props.initialId,id=>{if(id)emit('selected',{id,name:id===deviceA?'设备A':'设备B',projectId:project})},{immediate:true})
  return{choose:(id:string,name:string)=>emit('selected',{id,name,projectId:project})}
 },
 template:'<div><button v-for="id in [\'A\',\'B\']" :key="id" @click="choose(id===\'A\'?\'10000000-0000-4000-8000-000000000004\':\'10000000-0000-4000-8000-000000000005\',id===\'A\'?\'设备A\':\'设备B\')">选择设备{{id}}</button></div>'
})
const stubs={ElButton:Button,ElDialog:Dialog,ElForm:Panel,ElFormItem:Panel,ElSelect:Select,ElOption:Option,ElAlert:Alert,RuleActionDeviceTarget:Target}
let wrapper:ReturnType<typeof mount>|undefined
function row(id:string,name:string,status='ACTIVE'){return{id,name,status,version:4,targetType:'EXPLICIT_DEVICES',createdAt:'2026-11-16T00:00:00Z',actionType:'COMMAND',commandKey:'pub03_cmd'}}
function open(value?:unknown){wrapper=mount(SceneTaskRunDialog,{props:{mode:'automation',value:value as never},global:{stubs}});return wrapper}
function target(){return wrapper!.findComponent(Target)}
function chooseDevice(id:string,name:string){target().vm.$emit('selected',{id,name,projectId:project})}
function taskSelect(){return wrapper!.get('[aria-label="选择任务"]')}
function save(){return wrapper!.findAll('button').find(value=>value.text()==='确定')!}
beforeEach(()=>{session.user={currentProjectId:project,permissions:['rule:manage','device:read']};session.projects=[{id:project,status:'ACTIVE'}];api.readSceneDeviceTasks.mockReset();api.readSceneTaskName.mockReset();api.readSceneTaskName.mockResolvedValue({id:taskA,name:'任务A',status:'ACTIVE'});api.readSceneDeviceTasks.mockResolvedValue({items:[row(taskA,'任务A'),row(taskB,'任务B')],hasMore:false,nextCursor:null})})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[]})
describe('自动化执行任务动作弹窗选择稳定性',()=>{
 it('同设备重复 selected 不清空已选任务，保存写入当前任务',async()=>{
  open();chooseDevice(deviceA,'设备A');await flushPromises()
  await taskSelect().setValue(taskA);expect((taskSelect().element as HTMLSelectElement).value).toBe(taskA)
  chooseDevice(deviceA,'设备A');await flushPromises()
  expect(api.readSceneDeviceTasks).toHaveBeenCalledTimes(1)
  expect((taskSelect().element as HTMLSelectElement).value).toBe(taskA)
  await save().trigger('click')
  expect(wrapper!.emitted('save')?.[0]?.[0]).toEqual({nodeType:automationTaskNode,config:{deviceId:deviceA,taskId:taskA}})
 })
 it('编辑回填在任务不在当前页时保留已选任务与名称',async()=>{
  api.readSceneDeviceTasks.mockResolvedValue({items:[row(taskB,'任务B')],hasMore:false,nextCursor:null})
  open({nodeType:automationTaskNode,config:{deviceId:deviceA,taskId:taskA}});await flushPromises()
  expect((taskSelect().element as HTMLSelectElement).value).toBe(taskA)
  expect(wrapper!.text()).toContain('任务A')
  await save().trigger('click')
  expect(wrapper!.emitted('save')?.[0]).toEqual([{nodeType:automationTaskNode,config:{deviceId:deviceA,taskId:taskA}},'设备A','任务A'])
 })
 it('切换设备清空旧任务，分页加载保留当前选择',async()=>{
  api.readSceneDeviceTasks.mockResolvedValueOnce({items:[row(taskA,'任务A')],hasMore:true,nextCursor:'cursor-1'})
  open();chooseDevice(deviceA,'设备A');await flushPromises()
  await taskSelect().setValue(taskA)
  api.readSceneDeviceTasks.mockResolvedValueOnce({items:[row(taskB,'任务B')],hasMore:false,nextCursor:null})
  const more=wrapper!.findAll('button').find(value=>value.text()==='加载更多')!
  await more.trigger('click');await flushPromises()
  expect((taskSelect().element as HTMLSelectElement).value).toBe(taskA)
  expect(api.readSceneDeviceTasks).toHaveBeenLastCalledWith(project,deviceA,'cursor-1',expect.any(AbortSignal),expect.arrayContaining(['cursor-1']))
  chooseDevice(deviceB,'设备B');await flushPromises()
  expect((taskSelect().element as HTMLSelectElement).value).toBe('')
  expect(wrapper!.text()).toContain('任务B')
 })
})
