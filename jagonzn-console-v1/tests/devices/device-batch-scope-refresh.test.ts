import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView,type Router} from 'vue-router'
import ElementPlus,{ElDropdown} from 'element-plus'
import {session} from '../../src/core/session'
import {changeIdentity,identityEpoch} from '../../src/core/http'
import DeviceList from '../../src/features/devices/DeviceList.vue'
import DeviceBatchActions from '../../src/features/devices/DeviceBatchActions.vue'

const mock=vi.hoisted(()=>({directory:vi.fn(),types:vi.fn(),groups:vi.fn(),device:vi.fn(),access:vi.fn(),prepare:vi.fn(),write:vi.fn(),observe:vi.fn()}))
vi.mock('../../src/features/devices/api',async original=>{const source=await original<typeof import('../../src/features/devices/api')>();return{...source,devicesApi:{...source.devicesApi,directory:mock.directory,types:mock.types,groups:mock.groups}}})
vi.mock('../../src/features/devices/device-batch-api',async original=>({...await original<typeof import('../../src/features/devices/device-batch-api')>(),readBatchDevice:mock.device,readBatchAccess:mock.access,prepareBatchRow:mock.prepare,writeBatchRow:mock.write,observeBatchRow:mock.observe}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const project=id(90),account=id(91),permissions=['device:read','device:update','device:delete','enduser:read','enduser:manage']
const access=Object.freeze({protocol:'MQTT',enabled:true,configVersion:'9007199254740993',credentialVersion:'2',configured:true,allowedProtocols:['MQTT'],canManage:true})
let wrapper:ReturnType<typeof mount>|undefined,router:Router
function button(label:string){const found=wrapper!.findAll('button').find(b=>b.text()===label);if(!found)throw new Error('找不到按钮：'+label);return found}
function batch(){return wrapper!.getComponent(DeviceBatchActions)}
function unload(){const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented}
function selected(){return wrapper!.findAll('.device-card input[type="checkbox"]').map(input=>(input.element as HTMLInputElement).checked)}
async function setupUnknown(){
 router=createRouter({history:createMemoryHistory(),routes:[{path:'/devices',component:DeviceList},{path:'/projects',component:{template:'<p>我的项目</p>'}},{path:'/devices/:id',component:{template:'<p>设备详情</p>'}}]})
 await router.push('/devices');await router.isReady()
 wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await flushPromises()
 for(const card of wrapper.findAll('.device-card'))await card.get('input[type="checkbox"]').setValue(true)
 await flushPromises();expect(batch().props('deviceIds')).toEqual([id(1),id(2)])
 batch().getComponent(ElDropdown).vm.$emit('command','disable');await flushPromises()
 await button('确定').trigger('click');await flushPromises()
 expect(mock.write).toHaveBeenCalledTimes(1);expect(batch().text()).toContain('待核对');expect(batch().text()).toContain('未执行')
 await button('关闭').trigger('click');await flushPromises()
 expect(button('核对上次操作').exists()).toBe(true);expect(selected()).toEqual([true,true]);expect(unload()).toBe(true)
}
beforeEach(()=>{
 Object.values(mock).forEach(fn=>fn.mockReset());changeIdentity();session.ready=true;session.transitioning=false
 session.user={accountId:account,currentProjectId:project,permissions:[...permissions]} as never;session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}]
 const items=[1,2].map(n=>({id:id(n),name:'设备'+n,status:'ONLINE',deviceTypeId:null}))
 mock.directory.mockResolvedValue({items,total:'2',page:1,limit:24,alarmObservations:items.map(d=>({deviceId:d.id,modelVersionId:id(99),observedAt:'2026-10-24T00:00:00Z',state:'NORMAL',highestSeverity:null})),referenceIdentities:items.map(d=>({deviceId:d.id,businessKey:d.name,version:'0',updatedAt:'2026-10-24T00:00:00Z'})),displayFacts:items.map(d=>({deviceId:d.id,deviceTypeId:null,deviceTypeName:null,staticGroups:[],lastDataReportAt:null,enabled:true}))})
 mock.types.mockResolvedValue({items:[],hasMore:false});mock.groups.mockResolvedValue([])
 mock.device.mockImplementation(async(_project,device)=>({id:device,name:'设备'+device.slice(-1)}));mock.access.mockResolvedValue(access)
 mock.prepare.mockImplementation(async(_project,device)=>({id:device,name:'设备'+device.slice(-1),status:'READY',detail:'待确认',access}))
 mock.write.mockRejectedValueOnce(new Error('写后结果未确认'));mock.observe.mockResolvedValue('当前停用，配置版本9007199254740994；原请求结果仍未确认')
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML=''})

it.each(['user','projects'] as const)('同值%s快照替换保留UNKNOWN原行、选择与父导航锁，只人工观察不续写',async kind=>{
 await setupUnknown();const epoch=identityEpoch(),reads={device:mock.device.mock.calls.length,access:mock.access.mock.calls.length,prepare:mock.prepare.mock.calls.length,directory:mock.directory.mock.calls.length}
 const original=mock.write.mock.calls[0]!
 if(kind==='user')session.user={...session.user!,permissions:[...permissions]}
 else session.projects=session.projects.map(value=>({...value}))
 await flushPromises()
 expect(identityEpoch()).toBe(epoch);expect(session.user?.accountId).toBe(account);expect(session.user?.currentProjectId).toBe(project)
 expect(button('核对上次操作').exists()).toBe(true);expect(selected()).toEqual([true,true]);expect(batch().props('deviceIds')).toEqual([id(1),id(2)])
 expect(unload()).toBe(true);expect(button('刷新').attributes('disabled')).toBeDefined();expect(button('导出').attributes('disabled')).toBeDefined()
 await router.push('/projects');await flushPromises();expect(router.currentRoute.value.path).toBe('/devices')
 expect(mock.write).toHaveBeenCalledTimes(1);expect(mock.observe).not.toHaveBeenCalled()
 expect({device:mock.device.mock.calls.length,access:mock.access.mock.calls.length,prepare:mock.prepare.mock.calls.length,directory:mock.directory.mock.calls.length}).toEqual(reads)
 await button('核对上次操作').trigger('click');await flushPromises()
 expect(wrapper!.findAll('.batch-device-list li').map(li=>li.text())).toEqual([expect.stringContaining('设备1待核对'),expect.stringContaining('设备2未执行')])
 expect(button('已核对，结束本次操作').attributes('disabled')).toBeDefined()
 await button('读取当前状态').trigger('click');await flushPromises()
 expect(mock.observe).toHaveBeenCalledTimes(1)
 const observed=mock.observe.mock.calls[0]!
 expect(observed[0]).toBe(original[0]);expect(observed[1]).toMatchObject({id:id(1),access:original[1].access});expect(observed[1].access).toBe(original[1].access)
 expect(observed[2]).toBe('disable');expect(observed[3]).toBe(original[3]);expect(mock.write).toHaveBeenCalledTimes(1)
 expect(unload()).toBe(true);expect(button('已核对，结束本次操作').attributes('disabled')).toBeUndefined()
 await button('已核对，结束本次操作').trigger('click');await flushPromises()
 expect(unload()).toBe(false);expect(selected()).toEqual([false,false])
 await router.push('/projects');await flushPromises();expect(router.currentRoute.value.path).toBe('/projects');expect(mock.write).toHaveBeenCalledTimes(1)
})
it.each(['identity','project','manage'] as const)('真正%s失效清除旧UNKNOWN且不观察或续写',async kind=>{
 await setupUnknown()
 if(kind==='identity')changeIdentity()
 else if(kind==='project')session.user={...session.user!,currentProjectId:id(99)}
 else session.user={...session.user!,permissions:permissions.filter(value=>value!=='device:update')}
 await flushPromises();expect(wrapper!.text()).not.toContain('核对上次操作');expect(unload()).toBe(false)
 await router.push('/projects');await flushPromises();expect(router.currentRoute.value.path).toBe('/projects')
 expect(mock.write).toHaveBeenCalledTimes(1);expect(mock.observe).not.toHaveBeenCalled()
})
