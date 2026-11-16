import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DeviceCreate from '../../src/features/devices/DeviceCreate.vue'
import {invalidateIdentity,setAccessToken} from '../../src/core/http'

const P='00000000-0000-4000-8000-000000000001',P2='00000000-0000-4000-8000-000000000002'
const D='00000000-0000-4000-8000-000000000101',D2='00000000-0000-4000-8000-000000000102',G='00000000-0000-4000-8000-000000000201'
const name='创建测试设备'
const state=vi.hoisted(()=>({project:null as any,create:vi.fn(),profile:vi.fn(),push:vi.fn(),fetch:vi.fn()}))
vi.mock('vue-router',()=>({useRouter:()=>({push:state.push})}))
vi.mock('../../src/core/session',async()=>{const{ref}=await import('vue');state.project=ref('00000000-0000-4000-8000-000000000001');return{projectId:state.project,can:()=>true}})
vi.mock('../../src/features/devices/api',async original=>{const source=await original<typeof import('../../src/features/devices/api')>();return{...source,devicesApi:{...source.devicesApi,createProfile:state.create,profile:state.profile}}})
vi.mock('../../src/features/devices/use-options',async()=>{const{ref}=await import('vue');return{useDeviceOptions:()=>({types:{data:ref(),error:ref(),loading:ref(false)},groups:{data:ref([{id:'00000000-0000-4000-8000-000000000201',name:'监测组',type:'STATIC'}]),error:ref()},allTypes:ref([]),moreTypes:vi.fn()})}})

const profile=(device=D)=>({deviceId:device,name,deviceKey:'device-key-01',businessKey:null,description:null,deviceTypeId:null,referenceVersion:'1',profileToken:'a'.repeat(64)})
const snapshot=(device=D,tags:Array<{key:string;value:string}>=[])=>({deviceId:device,revision:'9007199254740993',tags})
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
type Pending={url:URL;signal:AbortSignal;resolve:(value:Response)=>void}
let wrapper:ReturnType<typeof mount>|undefined,pending:Pending[],deferTags:boolean,tagPayload:unknown,tagStatus:number,member:boolean,events:string[]
async function setup(tags:Array<[string,string]>=[]){
 wrapper=mount(DeviceCreate,{global:{plugins:[ElementPlus]}})
 await wrapper.get('input[aria-label="设备名称"]').setValue(name)
 for(let i=0;i<tags.length;i++){
  if(i>0)await wrapper.findAll('button').find(button=>button.text()==='添加标签')!.trigger('click')
  await wrapper.get(`input[aria-label="标签名称${i+1}"]`).setValue(tags[i]![0])
  await wrapper.get(`input[aria-label="标签值${i+1}"]`).setValue(tags[i]![1])
 }
 return wrapper
}
const tagCalls=()=>state.fetch.mock.calls.filter(([input])=>new URL(String(input)).pathname.endsWith('/tag-set'))
beforeEach(()=>{
 vi.clearAllMocks();setAccessToken('fixture-access');state.project.value=P;pending=[];deferTags=false;tagPayload=snapshot();tagStatus=200;member=true;events=[]
 state.create.mockImplementation(async(project:string)=>{events.push('CREATE');return profile(project===P?D:D2)})
 state.profile.mockImplementation(async(_project:string,device:string)=>{events.push('PROFILE');return profile(device)})
 state.fetch.mockImplementation(async(input:unknown,options:RequestInit)=>{
  const url=new URL(String(input));if(options.method!=='GET')throw new Error('Fixture blocks every additional mutation')
  if(url.pathname.endsWith('/tag-set')){events.push('TAGS');if(deferTags)return new Promise<Response>(resolve=>pending.push({url,signal:options.signal!,resolve}));return json(tagPayload,tagStatus)}
  if(url.pathname.endsWith('/static-groups/'+G)){events.push('GROUP');return json({projectId:P,deviceId:D,groupId:G,name:'监测组',member})}
  throw new Error('Fixture blocks unexpected path '+url.pathname)
 });vi.stubGlobal('fetch',state.fetch)
})
afterEach(async()=>{wrapper?.unmount();for(const request of pending)request.resolve(json(snapshot()));await flushPromises();vi.unstubAllGlobals()})

describe('创建后的标签全集权威回读',()=>{
 it('同一次POST携带标签与选中组，精确全集与成员只读核对后才导航',async()=>{
  tagPayload=snapshot(D,[{key:'批次',value:'甲'},{key:'部门',value:'品控部'}]);const w=await setup([['部门','品控部'],['批次','甲']])
  w.findComponent({name:'ElCascader'}).vm.$emit('update:modelValue',G);await flushPromises();await w.get('form').trigger('submit');await flushPromises()
  expect(state.create).toHaveBeenCalledTimes(1);expect(state.create.mock.calls[0]?.[1]).toMatchObject({groupId:G,tags:{批次:'甲',部门:'品控部'}})
  expect(events,w.text()).toEqual(['CREATE','PROFILE','TAGS','GROUP']);expect(tagCalls()).toHaveLength(1);expect(state.fetch.mock.calls.every(([,options])=>options.method==='GET')).toBe(true)
  expect(state.push).toHaveBeenCalledWith('/devices/'+D)
 })
 it('未填标签也必须取得完整空集合；不能把profile没有tags当已确认',async()=>{
  tagPayload={deviceId:D,revision:'0',tags:[]};const w=await setup();await w.get('form').trigger('submit');await flushPromises()
  expect(tagCalls()).toHaveLength(1);expect(state.push).toHaveBeenCalledWith('/devices/'+D)
 })
 it.each([
  {label:'错值',value:snapshot(D,[{key:'部门',value:'另一值'}])},
  {label:'缺失已提交标签',value:snapshot(D,[])},
  {label:'额外标签',value:snapshot(D,[{key:'部门',value:'品控部'},{key:'未提交',value:'额外'}])},
  {label:'别设备同内容',value:snapshot(D2,[{key:'部门',value:'品控部'}])},
  {label:'缺失全集字段',value:{deviceId:D,revision:'1'}},
 ])('$label保留已受理未知保护，绝不重POST或提前导航',async({value})=>{
  tagPayload=value;const w=await setup([['部门','品控部']]);await w.get('form').trigger('submit');await flushPromises()
  expect(state.push).not.toHaveBeenCalled();expect(w.text()).toContain('不要重复提交');expect(tagCalls()).toHaveLength(1)
  await w.get('form').trigger('submit');await flushPromises();expect(state.create).toHaveBeenCalledTimes(1);expect(tagCalls()).toHaveLength(1)
  expect((w.get('input[aria-label="标签名称1"]').element as HTMLInputElement).value).toBe('部门')
 })
 it.each([404,500])('标签GET返回%s仍是已创建待核对，不能旧接口空降级或再次创建',async status=>{
  tagStatus=status;tagPayload={message:'读取失败'};const w=await setup();await w.get('form').trigger('submit');await flushPromises()
  expect(state.push).not.toHaveBeenCalled();expect(w.text()).toContain('不要重复提交');await w.get('form').trigger('submit');await flushPromises();expect(state.create).toHaveBeenCalledTimes(1);expect(tagCalls()).toHaveLength(1)
 })
 it('核对已发送标签快照，回读前改草稿不替换本次意图',async()=>{
  deferTags=true;const w=await setup([['部门','品控部']]);await w.get('form').trigger('submit');await flushPromises();expect(pending).toHaveLength(1)
  await w.get('input[aria-label="标签值1"]').setValue('稍后编辑');pending[0]!.resolve(json(snapshot(D,[{key:'部门',value:'品控部'}])));await flushPromises()
  expect(state.push).toHaveBeenCalledWith('/devices/'+D);expect(state.create.mock.calls[0]?.[1].tags).toEqual({部门:'品控部'})
 })
 it('切项目取消旧读，旧finally不能解锁新项目仍在核对的创建',async()=>{
  deferTags=true;const w=await setup();await w.get('form').trigger('submit');await flushPromises();expect(pending).toHaveLength(1)
  state.project.value=P2;await flushPromises();expect(pending[0]!.signal.aborted).toBe(true);await w.get('input[aria-label="设备名称"]').setValue(name);await w.get('form').trigger('submit');await flushPromises();expect(pending).toHaveLength(2)
  pending[0]!.resolve(json(snapshot(D)));await flushPromises();expect(state.push).not.toHaveBeenCalled();await w.get('form').trigger('submit');await flushPromises();expect(state.create).toHaveBeenCalledTimes(2)
  pending[1]!.resolve(json(snapshot(D2)));await flushPromises();expect(state.push.mock.calls).toEqual([['/devices/'+D2]])
 })
 it('身份改变立即清草稿并取消旧标签读，迟到响应不导航',async()=>{
  deferTags=true;const w=await setup([['部门','品控部']]);await w.get('form').trigger('submit');await flushPromises();expect(pending).toHaveLength(1)
  invalidateIdentity();await flushPromises();expect(pending[0]!.signal.aborted).toBe(true);expect((w.get('input[aria-label="设备名称"]').element as HTMLInputElement).value).toBe('')
  pending[0]!.resolve(json(snapshot(D,[{key:'部门',value:'品控部'}])));await flushPromises();expect(state.push).not.toHaveBeenCalled()
 })
 it('卸载取消读；忽略abort的迟到响应也不能继续导航',async()=>{
  deferTags=true;const w=await setup();await w.get('form').trigger('submit');await flushPromises();expect(pending).toHaveLength(1)
  w.unmount();wrapper=undefined;expect(pending[0]!.signal.aborted).toBe(true);pending[0]!.resolve(json(snapshot()));await flushPromises();expect(state.push).not.toHaveBeenCalled()
 })
 it('所选组未得到成员事实时仍待核对，不能用第二次写补出假原子成功',async()=>{
  member=false;const w=await setup();w.findComponent({name:'ElCascader'}).vm.$emit('update:modelValue',G);await flushPromises();await w.get('form').trigger('submit');await flushPromises()
  expect(state.push).not.toHaveBeenCalled();expect(events).toEqual(['CREATE','PROFILE','TAGS','GROUP']);expect(w.text()).toContain('不要重复提交');await w.get('form').trigger('submit');expect(state.create).toHaveBeenCalledTimes(1)
 })
})
