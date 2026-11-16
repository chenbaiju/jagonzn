import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import {createMemoryHistory,createRouter,RouterView,type Router} from 'vue-router'
import ElementPlus,{ElDropdown,ElSelect} from 'element-plus'
import {session} from '../../src/core/session'
import {changeIdentity} from '../../src/core/http'
import DeviceList from '../../src/features/devices/DeviceList.vue'
import DeviceBatchActions from '../../src/features/devices/DeviceBatchActions.vue'

const mock=vi.hoisted(()=>({directory:vi.fn(),types:vi.fn(),groups:vi.fn(),device:vi.fn(),access:vi.fn(),prepare:vi.fn(),write:vi.fn(),observe:vi.fn(),staticGroups:vi.fn(),decodeGroups:vi.fn(),candidates:vi.fn()}))
vi.mock('../../src/features/devices/api',async original=>{const source=await original<typeof import('../../src/features/devices/api')>();return{...source,devicesApi:{...source.devicesApi,directory:mock.directory,types:mock.types,groups:mock.groups}}})
vi.mock('../../src/features/devices/device-batch-api',async original=>({...await original<typeof import('../../src/features/devices/device-batch-api')>(),readBatchDevice:mock.device,readBatchAccess:mock.access,prepareBatchRow:mock.prepare,writeBatchRow:mock.write,observeBatchRow:mock.observe}))
vi.mock('../../src/features/devices/static-group-membership-api',()=>({readStaticGroups:mock.staticGroups,decodeStaticGroups:mock.decodeGroups}))
vi.mock('../../src/features/devices/user-associations-api',()=>({readUserCandidates:mock.candidates}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const project=id(90),group=id(91),permissions=['device:read','device:update','device:delete','enduser:read','enduser:manage']
let wrapper:ReturnType<typeof mount>|undefined,router:Router
function deferred<T>(){let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((r,j)=>{resolve=r;reject=j});return{promise,resolve,reject}}
function row(device=id(1)){return{id:device,name:'设备'+device.slice(-1),status:'READY',detail:'待确认'}}
function unload(){const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented}
function button(label:string){const found=wrapper!.findAll('button').find(b=>b.text()===label);if(!found)throw new Error('找不到按钮：'+label);return found}
function batch(){return wrapper!.getComponent(DeviceBatchActions)}
async function action(kind='remove'){batch().getComponent(ElDropdown).vm.$emit('command',kind);await flushPromises()}
async function submit(){await button('移除').trigger('click');await flushPromises()}
async function leave(){await router.push('/projects');await flushPromises()}
async function setup(count=1){
 router=createRouter({history:createMemoryHistory(),routes:[{path:'/devices',component:DeviceList},{path:'/projects',component:{template:'<p>我的项目</p>'}},{path:'/devices/:id',component:{template:'<p>设备详情</p>'}}]})
 await router.push('/devices');await router.isReady()
 wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await flushPromises()
 for(const card of wrapper.findAll('.device-card').slice(0,count))await card.get('input[type="checkbox"]').setValue(true)
 await flushPromises();expect(batch().props('deviceIds')).toHaveLength(count)
}
beforeEach(()=>{
 Object.values(mock).forEach(f=>f.mockReset());changeIdentity();session.ready=true;session.transitioning=false
 session.user={currentProjectId:project,permissions:[...permissions]} as never;session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}]
 const items=[1,2].map(n=>({id:id(n),name:'设备'+n,status:'ONLINE',deviceTypeId:null}))
 mock.directory.mockResolvedValue({items,total:'2',page:1,limit:24,alarmObservations:items.map(d=>({deviceId:d.id,modelVersionId:id(99),observedAt:'2026-10-24T00:00:00Z',state:'NORMAL',highestSeverity:null})),referenceIdentities:items.map(d=>({deviceId:d.id,businessKey:d.name,version:'0',updatedAt:'2026-10-24T00:00:00Z'})),displayFacts:items.map(d=>({deviceId:d.id,deviceTypeId:null,deviceTypeName:null,staticGroups:[],lastDataReportAt:null,enabled:true}))})
 mock.types.mockResolvedValue({items:[],hasMore:false});mock.groups.mockResolvedValue([])
 mock.device.mockImplementation(async(_project,device)=>({id:device,name:'设备'+device.slice(-1)}));mock.access.mockResolvedValue({enabled:true})
 mock.prepare.mockImplementation(async(_project,device)=>row(device));mock.write.mockResolvedValue(undefined);mock.observe.mockResolvedValue('当前事实已读取；原请求结果仍未知')
 mock.decodeGroups.mockReturnValue({items:[{groupId:group,name:'测试组'}],hasMore:false,nextAfterGroupId:null})
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML=''})

it('实际目录子组件写在途阻挡跨页，确定完成后释放',async()=>{
 const pending=deferred<void>();mock.write.mockReturnValueOnce(pending.promise);await setup();await action();await submit()
 expect(mock.write).toHaveBeenCalledTimes(1);await leave();expect(router.currentRoute.value.path).toBe('/devices')
 pending.resolve();await flushPromises();expect(batch().text()).toContain('已完成');expect(unload()).toBe(false)
 await leave();expect(router.currentRoute.value.path).toBe('/projects');expect(mock.write).toHaveBeenCalledTimes(1)
})
it('实际写在途beforeunload保护，卸载时移除监听',async()=>{
 const pending=deferred<void>();mock.write.mockReturnValueOnce(pending.promise);await setup();await action();await submit()
 expect(unload()).toBe(true);wrapper!.unmount();wrapper=undefined;expect(unload()).toBe(false)
 pending.resolve();await flushPromises();expect(mock.write).toHaveBeenCalledTimes(1)
})
it('未知关闭、核对读中及失败不放行，读成功后显式结束才释放且不重放',async()=>{
 mock.write.mockRejectedValueOnce(new Error('结果未确认'));await setup(2);await action();await submit();expect(batch().text()).toContain('未执行')
 await button('关闭').trigger('click');await flushPromises();expect(button('核对上次操作').exists()).toBe(true)
 expect(unload()).toBe(true);await leave();expect(router.currentRoute.value.path).toBe('/devices')
 await button('核对上次操作').trigger('click');await flushPromises()
 const checking=deferred<string>();mock.observe.mockReturnValueOnce(checking.promise);await button('读取当前状态').trigger('click');await flushPromises()
 expect(unload()).toBe(true);await leave();expect(router.currentRoute.value.path).toBe('/devices')
 checking.reject(new Error('核对失败'));await flushPromises();expect(button('已核对，结束本次操作').attributes('disabled')).toBeDefined()
 await leave();expect(router.currentRoute.value.path).toBe('/devices')
 await button('读取当前状态').trigger('click');await flushPromises();expect(button('已核对，结束本次操作').attributes('disabled')).toBeUndefined()
 expect(unload()).toBe(true);await leave();expect(router.currentRoute.value.path).toBe('/devices')
 await button('已核对，结束本次操作').trigger('click');await flushPromises();expect(unload()).toBe(false)
 await leave();expect(router.currentRoute.value.path).toBe('/projects');expect(mock.write).toHaveBeenCalledTimes(1);expect(mock.observe).toHaveBeenCalledTimes(2)
 expect(mock.observe.mock.calls.every(call=>call[1].id===id(1))).toBe(true)
})
it.each([false,true])('普通未提交确认可离开、取消=%s，始终零写',async cancel=>{
 await setup();await action();expect(button('移除').exists()).toBe(true)
 if(cancel){await button('取消').trigger('click');await flushPromises()}
 expect(unload()).toBe(false);await leave();expect(router.currentRoute.value.path).toBe('/projects');expect(mock.write).not.toHaveBeenCalled()
})
it('一次提交的延迟分组预检可离开，迟到预检不续写',async()=>{
 const preparing=deferred<ReturnType<typeof row>>();mock.prepare.mockReturnValueOnce(preparing.promise);await setup();await action('add-group')
 batch().getComponent(ElSelect).vm.$emit('update:modelValue',group);await flushPromises();await button('提交').trigger('click');await flushPromises()
 expect(mock.prepare).toHaveBeenCalledTimes(1);expect(mock.write).not.toHaveBeenCalled();expect(unload()).toBe(false)
 await leave();expect(router.currentRoute.value.path).toBe('/projects');preparing.resolve(row());await flushPromises();expect(mock.write).not.toHaveBeenCalled()
})
const losses=['identity','project','read','manage','role','transition'] as const
function loseScope(kind:typeof losses[number]){
 if(kind==='identity')changeIdentity()
 else if(kind==='project')session.user={...session.user!,currentProjectId:id(99)}
 else if(kind==='role')session.projects=[{id:project,status:'ACTIVE',myRole:'VIEWER'}]
 else if(kind==='transition')session.transitioning=true
 else session.user={...session.user!,permissions:permissions.filter(p=>p!==(kind==='read'?'device:read':'device:delete'))}
}
it.each(losses.flatMap(loss=>['writing','unknown'].map(phase=>({loss,phase}))))('$phase 时 $loss 失效释放，迟到不续写、不核对旧范围',async({loss,phase})=>{
 const pending=deferred<void>();mock.write.mockReturnValueOnce(pending.promise);await setup(2);await action();await submit();expect(mock.write).toHaveBeenCalledTimes(1)
 if(phase==='unknown'){pending.reject(new Error('结果未知'));await flushPromises();await button('关闭').trigger('click');await flushPromises()}
 loseScope(loss);await flushPromises();expect(unload()).toBe(false);await leave();expect(router.currentRoute.value.path).toBe('/projects')
 if(phase==='writing'){pending.resolve();await flushPromises()}
 expect(mock.write).toHaveBeenCalledTimes(1);expect(mock.observe).not.toHaveBeenCalled()
})
