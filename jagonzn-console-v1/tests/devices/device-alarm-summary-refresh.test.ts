import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Detail from '../../src/features/devices/DeviceDetail.vue'
const state=vi.hoisted(()=>({project:null as any,route:null as any,readable:null as any,session:null as any,core:vi.fn(),profile:vi.fn(),summary:vi.fn(),rules:vi.fn(),http:vi.fn()}))
vi.mock('vue-router',async()=>{const {reactive}=await import('vue');state.route=reactive({params:{deviceId:'00000000-0000-4000-8000-000000000002'},query:{tab:'alarms'}});return{useRoute:()=>state.route,useRouter:()=>({push:vi.fn(),replace:vi.fn(),beforeEach:()=>()=>{}})}})
vi.mock('../../src/core/session',async()=>{const {ref,reactive}=await import('vue');state.project=ref('00000000-0000-4000-8000-000000000001');state.readable=ref(true);state.session=reactive({user:{accountId:'actor',projectRole:'OWNER'}});return{projectId:state.project,currentProject:ref({status:'ACTIVE'}),session:state.session,can:(p:string)=>p==='device:read'?state.readable.value:['alarm:read','alarm:maintain'].includes(p)}})
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.http}))
vi.mock('../../src/features/devices/api',()=>({devicePath:(p:string,d:string)=>`/api/v1/projects/${p}/devices/${d}`,devicesApi:{read:state.core,profile:state.profile,type:vi.fn(),access:vi.fn()}}))
vi.mock('../../src/features/devices/page-alarm-status',async()=>({...await vi.importActual('../../src/features/devices/page-alarm-status'),pageAlarmStatus:state.summary}))
vi.mock('../../src/features/devices/device-alarm-rules-api',async()=>({...await vi.importActual('../../src/features/devices/device-alarm-rules-api'),readDeviceAlarmRules:state.rules}))
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',rule='00000000-0000-4000-8000-000000000004',incident='00000000-0000-4000-8000-000000000005'
const row=(id=device,active=true)=>({id:rule,name:'自有规则',enabled:true,version:0,level:'NORMAL',sourceKind:'DEVICE',manualClearAllowed:true,deviceAllowed:true,deviceAllowanceVersion:0,notificationGroups:[],customerChannels:[],incident:active?{instanceId:incident,ruleId:rule,deviceId:id,conditionState:'ACTIVE',version:0}:null})
const page=(id=device,active=true)=>({deviceId:id,items:[row(id,active)],total:'1',page:1,limit:24})
const clearBoundary={name:'AlarmRuntimeClearDialog',props:['modelValue','identity'],emits:['cleared','update:modelValue'],template:'<div v-if="modelValue"><button data-clear-success @click="$emit(\'cleared\')">模拟明确解除成功</button><button data-clear-cancel @click="$emit(\'update:modelValue\',false)">取消解除</button></div>'}
let wrapper:ReturnType<typeof mount>|undefined
function button(label:string){return wrapper!.findAll('button').find(b=>b.text()===label)!}
async function render(){wrapper=mount(Detail,{attachTo:document.body,global:{plugins:[ElementPlus],stubs:{DeviceCodeDialog:true,DeviceAlarmHistory:true,ManagedAlarmRuleChoicesEditor:true,AlarmRuntimeClearDialog:clearBoundary}}});await flushPromises();wrapper.findComponent({name:'ElRadioGroup'}).vm.$emit('update:modelValue','rules');await flushPromises();return wrapper}
async function openClear(){await button('解除告警').trigger('click');await flushPromises()}
function deferred(){let resolve!:(value:any)=>void;const promise=new Promise<any>(r=>resolve=r);return{promise,resolve}}
beforeEach(()=>{vi.clearAllMocks();state.summary.mockReset();state.rules.mockReset();state.project.value=project;state.route.params.deviceId=device;state.route.query={tab:'alarms'};state.readable.value=true;state.core.mockImplementation((_p:string,d:string)=>Promise.resolve({id:d,name:'当前设备',status:'OFFLINE'}));state.profile.mockImplementation((_p:string,d:string)=>Promise.resolve({deviceId:d,name:'当前设备',deviceKey:'device-key-01',businessKey:null,description:null,deviceTypeId:null,referenceVersion:'0',profileToken:'a'.repeat(64)}));state.summary.mockImplementation((_p:string,ids:string[])=>Promise.resolve({states:{[ids[0]!]: 'ACTIVE'},unavailable:0}));state.rules.mockImplementation((_p:string,d:string)=>Promise.resolve(page(d)))})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;document.body.innerHTML=''})
describe('人工解除明确成功的三层摘要读取传播',()=>{
 it.each(['NORMAL','ACTIVE'] as const)('成功后仅重读摘要并采用权威%s，不重取设备主体',async status=>{
  await render();expect(wrapper!.get('.device-meta').text()).toContain('告警中');await openClear()
  state.rules.mockResolvedValueOnce(page(device,false));state.summary.mockResolvedValueOnce({states:{[device]:status},unavailable:0})
  await wrapper!.get('[data-clear-success]').trigger('click');await flushPromises()
  expect(state.rules).toHaveBeenCalledTimes(2);expect(state.summary).toHaveBeenCalledTimes(2);expect(state.summary.mock.calls[1]!.slice(0,2)).toEqual([project,[device]])
  expect(wrapper!.get('.device-meta').text()).toContain(status==='NORMAL'?'无告警':'告警中');expect(state.core).toHaveBeenCalledTimes(1);expect(state.profile).toHaveBeenCalledTimes(1)
 })
 it('取消或仍无明确成功时不重读摘要',async()=>{
  await render();await openClear();expect(state.summary).toHaveBeenCalledTimes(1)
  await wrapper!.get('[data-clear-cancel]').trigger('click');await flushPromises();expect(state.summary).toHaveBeenCalledTimes(1);expect(state.rules).toHaveBeenCalledTimes(1);expect(state.core).toHaveBeenCalledTimes(1)
 })
 it.each(['device','project','permission'] as const)('%s变化后旧成功事件不得启动摘要或列表读取',async mode=>{
  await render();await openClear();const stale=wrapper!.findComponent({name:'AlarmRuntimeClearDialog'}).vm.$.vnode.props!.onCleared as ()=>void
  if(mode==='device')state.route.params.deviceId=other
  else if(mode==='project')state.project.value=other
  else state.readable.value=false
  await flushPromises();const summaries=state.summary.mock.calls.length,rules=state.rules.mock.calls.length
  stale();await flushPromises();expect(state.summary).toHaveBeenCalledTimes(summaries);expect(state.rules).toHaveBeenCalledTimes(rules)
 })
 it('解除后旧设备摘要迟到不得覆盖新设备，也不额外读取主体',async()=>{
  const late=deferred();await render();await openClear();state.summary.mockReturnValueOnce(late.promise)
  await wrapper!.get('[data-clear-success]').trigger('click');await flushPromises();expect(state.summary).toHaveBeenCalledTimes(2)
  state.summary.mockResolvedValueOnce({states:{[other]:'ACTIVE'},unavailable:0});state.route.params.deviceId=other;await flushPromises()
  late.resolve({states:{[device]:'NORMAL'},unavailable:0});await flushPromises()
  expect(wrapper!.get('.device-meta').text()).toContain('告警中');expect(state.summary).toHaveBeenCalledTimes(3);expect(state.core).toHaveBeenCalledTimes(2)
 })
})
