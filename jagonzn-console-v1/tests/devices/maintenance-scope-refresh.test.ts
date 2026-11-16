import {webcrypto} from 'node:crypto'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {createRouter,createMemoryHistory,RouterView,type Router} from 'vue-router'
import ElementPlus from 'element-plus'
import DeviceDetail from '../../src/features/devices/DeviceDetail.vue'
import DeviceMaintenanceDialog from '../../src/features/devices/DeviceMaintenanceDialog.vue'
import {session,can} from '../../src/core/session'
import {ApiError,changeIdentity,identityEpoch} from '../../src/core/http'
import type {DeviceMaintenanceState} from '../../src/features/devices/use-device-maintenance-action'

// 保留真实父页、路由、会话、维护对话框及设备适配器；只替换 HTTP 传输。
const transport=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:transport.api}))
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',account='00000000-0000-4000-8000-000000000003',other='00000000-0000-4000-8000-000000000004'
type Kind='remove'|'access'
const permissions=['device:read','device:update','device:delete']
const access=(enabled=true,configVersion='9')=>({protocol:'MQTT',enabled,configVersion,credentialVersion:'1',configured:true,allowedProtocols:['MQTT'],canManage:true})
let wrapper:VueWrapper<any>|undefined,router:Router,accessValue=access(),pending:ReturnType<typeof deferred>|undefined
let unexpected:string[]=[]
function deferred(){let reject!:(error:unknown)=>void;const promise=new Promise<never>((_resolve,j)=>{reject=j});return{promise,reject}}
function writes(){return transport.api.mock.calls.filter(([,options])=>['post','put','delete','patch'].includes(options?.method||''))}
function reads(suffix:string){return transport.api.mock.calls.filter(([url,options])=>url.endsWith(suffix)&&!options?.method)}
function dialog(kind:Kind){return wrapper!.findAllComponents(DeviceMaintenanceDialog).find(d=>d.props('state').kind===kind)!}
function state(kind:Kind):DeviceMaintenanceState{return dialog(kind).props('state')}
function button(label:string,scope:VueWrapper<any>=wrapper!){const found=scope.findAll('button').find(b=>b.text()===label);if(!found)throw new Error('缺少按钮：'+label);return found}
async function render(){
 router=createRouter({history:createMemoryHistory(),routes:[{path:'/devices/:deviceId',component:DeviceDetail},{path:'/devices',component:{template:'<p>设备列表</p>'}}]})
 await router.push(`/devices/${device}?tab=settings`);await router.isReady()
 wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus],stubs:{DeviceTags:true,DeviceTypeAssignment:true,DeviceStaticGroupMemberships:true}}})
 await flushPromises();expect(wrapper.text()).toContain('维护设备');expect(reads('/reference-profile')).toHaveLength(1)
}
function sameScope(){const epoch=identityEpoch(),original=session.user!;session.user={...original,permissions:[...permissions]};expect(session.user).not.toBe(original);expect(identityEpoch()).toBe(epoch);expect(can('device:delete')).toBe(true)}
async function start(kind:Kind){await button(kind==='remove'?'移除设备':'停用设备').trigger('click');await flushPromises();expect(state(kind).shown.value).toBe(true);await button('确定',dialog(kind)).trigger('click');await flushPromises();expect(writes()).toHaveLength(1)}
function assertOriginal(kind:Kind,options:any){if(kind==='remove'){expect(writes()[0]![0]).toBe(`/api/v1/projects/${project}/devices/${device}/removal`);expect(options).toMatchObject({method:'post',headers:{'Idempotency-Key':expect.stringMatching(/^[0-9a-f-]{36}$/)}});expect(options.body).toBeUndefined()}else{expect(writes()[0]![0]).toBe(`/api/v1/projects/${project}/devices/${device}/access-config`);expect(options).toMatchObject({method:'put',body:{protocol:'MQTT',enabled:false,expectedConfigVersion:'9'}})}}
beforeEach(()=>{
 vi.stubGlobal('crypto',webcrypto);changeIdentity();transport.api.mockReset();unexpected=[];pending=undefined;accessValue=access()
 session.ready=true;session.transitioning=false;session.user={accountId:account,currentProjectId:project,projectRole:'OWNER',permissions:[...permissions]} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'},{id:other,myRole:'OWNER',status:'ACTIVE'}]
 transport.api.mockImplementation(async(url:string,options?:{method?:string})=>{
  const match=url.match(/^\/api\/v1\/projects\/([0-9a-f-]+)\/devices\/([0-9a-f-]+)(.*)$/)
  if(match){const id=match[2]!,suffix=match[3]
   if(options?.method==='post'&&suffix==='/removal'||options?.method==='put'&&suffix==='/access-config'){if(pending)return pending.promise;throw new ApiError('响应未确认',0,undefined,undefined,true)}
   // 设置页会只读加载接入适配状态；本夹具未登记适配，按真实404显式处理，不进入未声明请求。
   if(!options?.method&&suffix==='/type-association/adaptation')throw new ApiError('未登记',404)
   if(!options?.method){if(suffix==='')return{id,name:'维护设备',status:'OFFLINE',deviceTypeId:null};if(suffix==='/logical-presence')return{deviceId:id,mode:'LEGACY_TRANSPORT',state:'OFFLINE',transportStatus:'OFFLINE',onlineTimeoutMinutes:null,observedAt:'2026-10-26T00:00:00Z',lastQualifiedCommunicationAt:null};if(suffix==='/reference-profile')return{deviceId:id,name:'维护设备',deviceKey:'device-key-01',businessKey:null,description:null,deviceTypeId:null,referenceVersion:'0',profileToken:'a'.repeat(64)};if(suffix==='/access-config')return{...accessValue,allowedProtocols:[...accessValue.allowedProtocols]}}
  }
  if(url.match(/^\/api\/v1\/projects\/[0-9a-f-]+\/alarms\/device-status$/)&&!options?.method)return{observedAt:'2026-10-27T00:00:00Z',devices:[{deviceId:router?.currentRoute.value.params.deviceId||device,modelVersionId:other,state:'NORMAL'}]}
  unexpected.push(url);throw new Error('未授权测试请求：'+url)
 })
})
afterEach(async()=>{pending?.reject(new ApiError('测试结束释放在途请求',0,undefined,undefined,true));await flushPromises();wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];vi.unstubAllGlobals();document.body.innerHTML='';expect(unexpected).toEqual([])})

it.each(['remove','access'] as const)('同scope %s UNKNOWN在真实父页保原确认和当前事实并只读核对',async kind=>{
 await render();await start(kind);const action=state(kind),original=writes()[0]![1];assertOriginal(kind,original)
 expect(action.review.value).toBe(true);expect(dialog(kind).text()).toContain('操作结果需要核对')
 const profiles=reads('/reference-profile').length;sameScope();await flushPromises()
 expect(reads('/reference-profile')).toHaveLength(profiles);expect(state(kind)).toBe(action)
 expect(action.review.value).toBe(true);expect(action.shown.value).toBe(true);expect(dialog(kind).text()).toContain('操作结果需要核对')
 await button('关闭',dialog(kind)).trigger('click');await button(kind==='remove'?'移除设备':'停用设备').trigger('click');await flushPromises()
 expect(action.review.value).toBe(true);expect(dialog(kind).findAll('button').some(b=>b.text()==='确定')).toBe(false)
 if(kind==='access')accessValue=access(false,'10')
 const before=reads(kind==='remove'?`/devices/${device}`:'/access-config').length
 await button('读取当前状态',dialog(kind)).trigger('click');await flushPromises()
 expect(reads(kind==='remove'?`/devices/${device}`:'/access-config')).toHaveLength(before+1);expect(action.checked.value).toBe(true)
 expect(writes()).toHaveLength(1);expect(writes()[0]![1]).toBe(original);expect(router.currentRoute.value.params.deviceId).toBe(device)
 if(kind==='access'){expect(action.currentAccess.value).toEqual(access(false,'10'));expect(action.canContinue.value).toBe(false);expect(dialog(kind).text()).toContain('当前状态：已停用');await button('结束核对',dialog(kind)).trigger('click');await button('恢复接入').trigger('click');expect(action.message.value).toBe('确认启用设备吗？');expect(writes()).toHaveLength(1)}
 else expect(dialog(kind).text()).toContain('当前设备仍存在')
})

it.each(['remove','access'] as const)('同scope %s 在途刷新不丢writing且晚到未知仍保原意图',async kind=>{
 pending=deferred();await render();await start(kind);const action=state(kind),original=writes()[0]![1];assertOriginal(kind,original)
 expect(action.writing.value).toBe(true);sameScope();await flushPromises()
 expect(action.writing.value).toBe(true);expect(action.review.value).toBe(true);expect(action.shown.value).toBe(true)
 expect(button('确定',dialog(kind)).attributes('disabled')).toBeDefined()
 pending.reject(new ApiError('晚到未知',0,undefined,undefined,true));await flushPromises()
 expect(action.writing.value).toBe(false);expect(action.review.value).toBe(true);expect(dialog(kind).text()).toContain('操作结果需要核对');expect(writes()).toHaveLength(1);expect(writes()[0]![1]).toBe(original)
})

it.each(['read','permission','project','device','identity','archive'] as const)('真正scope失效 %s 清旧确认且晚到回调不恢复',async reason=>{
 pending=deferred();await render();await start('remove');const action=state('remove'),oldConfirm=action.confirm.value
 if(reason==='read')session.user={...session.user!,permissions:['device:update','device:delete']}
 else if(reason==='permission')session.user={...session.user!,permissions:['device:read','device:update']}
 else if(reason==='project')session.user={...session.user!,currentProjectId:other}
 else if(reason==='device')await router.push(`/devices/${other}?tab=settings`)
 else if(reason==='identity'){session.user={...session.user!,accountId:other};changeIdentity()}
 else session.projects=session.projects.map(p=>p.id===project?{...p,status:'ARCHIVED'}:p)
 await flushPromises();expect(action.shown.value).toBe(false);expect(action.review.value).toBe(false);expect(action.writing.value).toBe(false)
 pending.reject(new ApiError('旧作用域晚到未知',0,undefined,undefined,true));await flushPromises();await oldConfirm()
 expect(action.review.value).toBe(false);expect(action.shown.value).toBe(false);expect(writes()).toHaveLength(1)
})
