import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import {h} from 'vue'
import ElementPlus from 'element-plus'
import {createMemoryHistory,createRouter,RouterView,useRoute,type Router} from 'vue-router'
import {ApiError,invalidateIdentity,setAccessToken} from '../../src/core/http'
import DeviceSceneDefinitions from '../../src/features/rules/DeviceSceneDefinitions.vue'
const state=vi.hoisted(()=>({project:null as any,current:null as any,manage:null as any}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');state.project=ref('10000000-0000-4000-8000-000000000001');state.current=ref({status:'ACTIVE'});state.manage=ref(true);return {projectId:state.project,currentProject:state.current,can:()=>state.manage.value}})
const project='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000001',scene='30000000-0000-4000-8000-000000000001',version='40000000-0000-4000-8000-000000000001',execution='50000000-0000-4000-8000-000000000001'
let wrapper:VueWrapper|undefined,router:Router,port:any
function deferred(){let resolve!:(value:unknown)=>void,reject!:(cause:unknown)=>void;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function button(label:string){const node=[...document.querySelectorAll('button')].find(item=>item.textContent?.trim()===label);expect(node,label).toBeDefined();return new DOMWrapper(node!)}
async function setup(){
 port={read:vi.fn().mockResolvedValue({items:[{id:scene,name:'私有设备场景',status:'ACTIVE',activeVersionId:version,versionNumber:1,definitionVersion:9,deviceScope:{kind:'DEVICE',referenceId:device},hasDeviceAction:true,createdAt:'2026-10-26T00:00:00Z'}],hasMore:false,nextCursor:null}),run:vi.fn(),lookup:vi.fn(),definition:vi.fn()}
 router=createRouter({history:createMemoryHistory(),routes:[{path:'/devices/:id',component:{setup(){const route=useRoute();return ()=>route.query.tab==='scenes'?h(DeviceSceneDefinitions,{deviceId:String(route.params.id),deviceName:'设备',transport:port}):h('p','设备其它页签')}}},{path:'/away',component:{render:()=>h('p','已离开')}}]});await router.push(`/devices/${device}?tab=scenes`);await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await flushPromises();return wrapper
}
async function confirm(){await button('运行场景').trigger('click');await flushPromises();await button('确定运行').trigger('click');await flushPromises()}
beforeEach(()=>{state.manage.value=true;state.project.value=project;state.current.value={status:'ACTIVE'};setAccessToken('scene-route-fixture')})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;setAccessToken('');document.body.innerHTML=''})
it('设备场景在途和未知阻止真实tab及离开，404不解锁，精确同key回执后才放行',async()=>{
 await setup();const pending=deferred();port.run.mockReturnValue(pending.promise);await confirm();const key=port.run.mock.lastCall[4];expect(await router.push(`/devices/${device}?tab=overview`)).toBeTruthy();expect(await router.push('/away')).toBeTruthy();let event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);pending.reject(new ApiError('结果未知',0,undefined,undefined,true));await flushPromises();expect(await router.push('/away')).toBeTruthy();port.lookup.mockRejectedValueOnce(new ApiError('未找到',404));await button('核对同次执行结果').trigger('click');await flushPromises();expect(await router.push('/away')).toBeTruthy();expect(port.lookup.mock.lastCall.slice(0,3)).toEqual([project,scene,key]);port.lookup.mockResolvedValue({id:execution,sceneId:scene,deviceId:device,sceneVersionId:version,idempotencyKey:key,trigger:'MANUAL',status:'DISPATCHED'});await button('核对同次执行结果').trigger('click');await flushPromises();expect(await router.push('/away')).toBeUndefined();event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);expect(port.run).toHaveBeenCalledTimes(1);expect(port.lookup).toHaveBeenCalledTimes(2)
})
it('设备场景未知核对403清私有定义与对话框且允许退出，不重发运行',async()=>{
 const view=await setup();port.run.mockRejectedValue(new ApiError('未知',0,undefined,undefined,true));await confirm();port.lookup.mockRejectedValue(new ApiError('权限已撤销',403));await button('核对同次执行结果').trigger('click');await flushPromises();expect(view.find('.scene-card').exists()).toBe(false);expect(document.body.textContent).not.toContain('私有设备场景');expect(await router.push('/away')).toBeUndefined();expect(port.run).toHaveBeenCalledTimes(1);expect(port.lookup).toHaveBeenCalledTimes(1)
})
it('设备场景身份失效清旧搜索与在途上下文，不自动读取新身份或接收旧回执',async()=>{
 const view=await setup();await view.get('[aria-label="搜索场景名称或描述"]').setValue('私有筛选');await view.get('[aria-label="搜索场景名称或描述"]').trigger('keyup.enter');await flushPromises();const pending=deferred();port.run.mockReturnValue(pending.promise);await confirm();const reads=port.read.mock.calls.length;invalidateIdentity();await flushPromises();expect((view.get('[aria-label="搜索场景名称或描述"]').element as HTMLInputElement).value).toBe('');expect(view.find('.scene-card').exists()).toBe(false);expect(port.read).toHaveBeenCalledTimes(reads);expect(await router.push('/away')).toBeUndefined();pending.resolve({});await flushPromises();expect(router.currentRoute.value.path).toBe('/away');expect(port.lookup).not.toHaveBeenCalled();expect(port.run).toHaveBeenCalledTimes(1)
})

it.each(['在途','未知'] as const)('场景%s期间读取授权撤销清私有范围并允许退出，旧结果仍未知且不重发',async phase=>{
 const view=await setup();const pending=deferred();port.run.mockReturnValue(pending.promise);await confirm();if(phase==='未知'){pending.reject(new ApiError('结果未知',0,undefined,undefined,true));await flushPromises()}state.manage.value=false;await flushPromises();expect(view.find('.scene-card').exists()).toBe(false);expect(document.body.textContent).not.toContain('私有设备场景');expect(await router.push('/away')).toBeUndefined();expect(router.currentRoute.value.path).toBe('/away');const unload=new Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(false);if(phase==='在途'){pending.resolve({});await flushPromises()}expect(port.run).toHaveBeenCalledTimes(1);expect(port.lookup).not.toHaveBeenCalled();expect(port.definition).not.toHaveBeenCalled()
})
