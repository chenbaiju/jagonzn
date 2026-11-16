import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {defineComponent,h,ref} from 'vue'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView,type Router} from 'vue-router'
import ElementPlus from 'element-plus'
import Removal from '../../src/features/device-types/DeviceTypeRemoveDevicesDialog.vue'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity} from '../../src/core/http'

const state=vi.hoisted(()=>({api:vi.fn(),profile:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
vi.mock('../../src/features/devices/api',async original=>{const source=await original<typeof import('../../src/features/devices/api')>();return{...source,devicesApi:{...source.devicesApi,profile:state.profile}}})
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const project=uuid(100),type=uuid(200),other=uuid(300)
const selected=[{id:uuid(1),name:'待移除设备1'},{id:uuid(2),name:'待移除设备2'}]
const current=new Map<string,string|null>()
const receipts=new Map<string,Uint8Array>()
const bytes=(id:string,value:string|null)=>new TextEncoder().encode(JSON.stringify({deviceId:id,deviceTypeId:value,modelVersionId:value===null?null:uuid(400),retainedDeviceTypeId:value===null?type:null,retainedModelVersionId:value===null?uuid(400):null,revision:value===null?'1':'0',bindingEpoch:'0',state:value===null?'DETACHED':'ASSOCIATED'}))
const puts=()=>state.api.mock.calls.filter(call=>call[1]?.method==='put')
const operations=()=>state.api.mock.calls.filter(call=>call[0].includes('/operations/'))
const profile=(id:string)=>({deviceId:id,name:'当前名称',deviceKey:'device-key-01',deviceTypeId:current.get(id)??null,description:'原说明',businessKey:'原标识',referenceVersion:'0',profileToken:'a'.repeat(64)})
let wrapper:VueWrapper|undefined,router:Router,component:VueWrapper
async function setup(devices=selected){
 const parent=defineComponent({setup(){const shown=ref(true);return()=>h(Removal,{open:shown.value,deviceTypeId:type,devices,'onUpdate:open':value=>{shown.value=value}})}})
 router=createRouter({history:createMemoryHistory(),routes:[{path:'/type',component:parent},{path:'/other',component:{template:'<p>其他页面</p>'}}]})
 await router.push('/type');await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await flushPromises();component=wrapper.findComponent(Removal)
}
function button(label:string){const node=[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(node=>node.textContent?.trim()===label);if(!node)throw new Error('缺少按钮 '+label);return new DOMWrapper(node)}
async function click(label:string){await button(label).trigger('click');await flushPromises()}
beforeEach(()=>{
 changeIdentity();vi.clearAllMocks();receipts.clear();current.clear();selected.forEach(row=>current.set(row.id,type))
 session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]
 state.profile.mockImplementation(async(_project:string,id:string)=>profile(id))
 state.api.mockImplementation(async(path:string,options:{method?:string;body?:{deviceTypeId:string|null;operationKey:string}})=>{
  if(path.includes('/operations/')){const result=receipts.get(path.split('/').at(-1)!);if(!result)throw new ApiError('原操作尚无回执',404);return result}
  const id=path.split('/').at(-2)!
  if(options.method!=='put')return bytes(id,current.get(id)??null)
  current.set(id,options.body!.deviceTypeId);const receipt=bytes(id,options.body!.deviceTypeId);receipts.set(options.body!.operationKey,receipt);return receipt
 })
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})

it('原站提示确认取消零写，版本化设备按完整关联前提逐台移除且回读刷新',async()=>{
 await setup();expect(state.profile).not.toHaveBeenCalled();expect(document.body.textContent).toContain('确认从设备类型中移除吗？')
 await click('取消');expect(state.api).not.toHaveBeenCalled();expect(component.emitted('changed')).toBeUndefined()
 wrapper!.unmount();wrapper=undefined;await setup();await click('确定')
 expect(puts()).toHaveLength(2);expect(state.profile).toHaveBeenCalledTimes(2)
 for(const call of puts())expect(call[1].body).toEqual({operationKey:expect.any(String),revision:'0',expectedDeviceTypeId:type,expectedModelVersionId:uuid(400),deviceTypeId:null,modelVersionId:null})
 expect(puts()[0]![1].headers['Idempotency-Key']).not.toBe(puts()[1]![1].headers['Idempotency-Key'])
 expect(component.emitted('changed')).toHaveLength(1);expect(component.emitted('update:open')?.at(-1)).toEqual([false]);expect(current.get(uuid(1))).toBeNull();expect(current.get(uuid(2))).toBeNull()
})

it('并发换型不修改另一类型，后端内容冲突保留当前类型并显示失败原因',async()=>{
 current.set(uuid(1),other);const defaultApi=state.api.getMockImplementation()!;state.api.mockImplementation((path,options)=>options.method==='put'?Promise.reject(new ApiError('关联前提已变化',409)):defaultApi(path,options))
 await setup();await click('确定');expect(puts()).toHaveLength(1);expect(current.get(uuid(1))).toBe(other);expect(current.get(uuid(2))).toBe(type)
 expect(document.body.textContent).toContain('设备类型已经变化');expect(document.body.textContent).toContain('关联前提已变化');expect(component.emitted('changed')).toBeUndefined()
 await click('关闭');expect(puts()).toHaveLength(1)
})

it('首台未知停止后续设备、阻止导航，降为只读后仅GET核对不重发',async()=>{
 const defaultApi=state.api.getMockImplementation()!;state.api.mockImplementation((path,options)=>options.method==='put'?Promise.reject(new ApiError('网络结果未知',0,undefined,undefined,true)):defaultApi(path,options));await setup();await click('确定')
 expect(puts()).toHaveLength(1);expect(state.profile).not.toHaveBeenCalled();expect(document.body.textContent).toContain('未执行');expect(component.emitted('changed')).toBeUndefined()
 await router.push('/other');expect(router.currentRoute.value.path).toBe('/type')
 session.user={...session.user!,projectRole:'VIEWER',permissions:['device:read']};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];await flushPromises();current.set(uuid(1),null)
 await click('核对移除结果');expect(puts()).toHaveLength(1);expect(document.body.textContent).toContain('未关联设备类型')
 await click('采用当前结果并刷新');expect(component.emitted('changed')).toHaveLength(1);expect(puts()).toHaveLength(1);expect(current.get(uuid(2))).toBe(type)
})

it('坏2xx保留未知，不重复发送或冒成功',async()=>{
 const defaultApi=state.api.getMockImplementation()!;state.api.mockImplementation((path,options)=>options.method==='put'?Promise.resolve(new TextEncoder().encode('{}')):defaultApi(path,options));await setup([selected[0]!]);await click('确定')
 expect(document.body.textContent).toContain('待核对');expect(component.emitted('changed')).toBeUndefined();await click('核对移除结果');expect(puts()).toHaveLength(1)
})

it('写后回读失败停止后续设备，核对只读取当前类型不重复PUT',async()=>{
 state.profile.mockRejectedValueOnce(new ApiError('回读失败',503))
 await setup();await click('确定');expect(puts()).toHaveLength(1);expect(current.get(uuid(1))).toBeNull();expect(current.get(uuid(2))).toBe(type)
 expect(document.body.textContent).toContain('待核对');expect(component.emitted('changed')).toBeUndefined();await click('核对移除结果');expect(puts()).toHaveLength(1);expect(component.emitted('changed')).toHaveLength(1)
})

it('写在途双击只发一次，换项目后迟到响应不能回填或刷新新范围',async()=>{
 let finish!:(value:Uint8Array)=>void;const defaultApi=state.api.getMockImplementation()!;state.api.mockImplementation((path,options)=>options.method==='put'?new Promise(resolve=>{finish=resolve}):defaultApi(path,options));await setup([selected[0]!]);button('确定').element.click();button('确定').element.click();await flushPromises();expect(puts()).toHaveLength(1)
 session.projects=[{id:other,myRole:'OWNER',status:'ACTIVE'}];session.user={...session.user!,currentProjectId:other};await flushPromises();finish(bytes(uuid(1),null));await flushPromises();expect(component.emitted('changed')).toBeUndefined();expect(state.profile).not.toHaveBeenCalled()
})

it('网络未知后通过原operationKey固定回执确认，不重发PUT或凭当前状态推断成功',async()=>{
 const defaultApi=state.api.getMockImplementation()!
 state.api.mockImplementation(async(path,options)=>{const result=await defaultApi(path,options);if(options.method==='put')throw new ApiError('响应丢失',0,undefined,undefined,true);return result})
 await setup([selected[0]!]);await click('确定');expect(puts()).toHaveLength(1);expect(document.body.textContent).toContain('待核对')
 await click('核对移除结果');expect(puts()).toHaveLength(1);expect(operations()).toHaveLength(1);expect(component.emitted('changed')).toHaveLength(1);expect(component.emitted('update:open')?.at(-1)).toEqual([false])
})
