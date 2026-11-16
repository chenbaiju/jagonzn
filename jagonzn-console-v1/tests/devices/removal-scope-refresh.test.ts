import {webcrypto,createHash} from 'node:crypto'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import CurrentRemoval from '../../src/features/devices/CurrentPropertyRemovalAction.vue'
import HistoryRemoval from '../../src/features/devices/PropertyHistoryRemovalAction.vue'
import {session,can} from '../../src/core/session'
import {ApiError,changeIdentity,identityEpoch} from '../../src/core/http'
import {pendingHistoryKey} from '../../src/features/devices/property-history-removal-api'

// 保留真实会话、组件和移除适配器，只替换 HTTP 传输；不执行真实删除。
const transport=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:transport.api}))
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',account='00000000-0000-4000-8000-000000000003',model='00000000-0000-4000-8000-000000000004',operation='00000000-0000-4000-8000-000000000005',other='00000000-0000-4000-8000-000000000006'
const base=`/api/v1/projects/${project}/devices/${device}`
type Surface='current'|'history'
let wrapper:VueWrapper<any>|undefined
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v))
const posts=()=>transport.api.mock.calls.filter(([,o])=>o?.method==='post')
const gets=()=>transport.api.mock.calls.filter(([,o])=>o?.method!=='post')
function currentReceipt(){return bytes({operationId:operation,projectId:project,deviceId:device,modelVersionId:model,removedAt:'2026-10-24T01:00:00Z',observations:[{propertyKey:'temperature',reportedRevision:'1',removedPlatformOperationId:null,reportedValueRemoved:true}]})}
function historyReceipt(id:string){return bytes({operationId:id,projectId:project,deviceId:device,mode:'ALL',from:null,to:null,state:'QUEUED',phase:'RAW',rawRows:0,aggregateRows:0,platformOperations:0,rebuildWindows:0,batchesAttempted:0,acceptedAt:'2026-10-24T01:00:00Z',updatedAt:'2026-10-24T01:00:00Z',completedAt:null,failureCode:null})}
function button(label:string){return wrapper!.findAll('button').find(b=>b.text()===label)}
async function click(label:string){const b=button(label);expect(b,`按钮 ${label}`).toBeDefined();await b!.trigger('click');await flushPromises()}
async function start(surface:Surface){
 wrapper=mount(surface==='current'?CurrentRemoval:HistoryRemoval,{props:surface==='current'?{deviceId:device,modelVersionId:model,keys:['temperature']}:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus]}})
 await click(surface==='current'?'移除属性':'删除属性历史数据')
 if(surface==='history')await click('提交')
 await click(surface==='current'?'确认':'确认删除')
 await vi.waitFor(()=>expect(posts()).toHaveLength(1))
}
function sameScope(){const epoch=identityEpoch(),old=session.user!;session.user={...old,permissions:[...(old.permissions||[])]};expect(identityEpoch()).toBe(epoch);expect(can('device:control')).toBe(true);expect(can('device:delete')).toBe(true)}
beforeEach(()=>{
 vi.stubGlobal('crypto',webcrypto);transport.api.mockReset();sessionStorage.clear();changeIdentity()
 session.ready=true;session.transitioning=false;session.user={accountId:account,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:control','device:delete']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]
 transport.api.mockImplementation(async(url:string,o?:{method?:string})=>{
  if(o?.method==='post')throw new ApiError('响应未确认',0,undefined,undefined,true)
  if(url===base+'/current-properties/removals/current')return currentReceipt()
  if(url===base+'/platform-properties/current')return bytes({projectId:project,deviceId:device,modelVersionId:model,values:[{propertyKey:'temperature',state:'NO_VALUE',sourceKind:null,value:null,modelVersionId:null,occurredAt:null,updatedAt:null,operationId:null,reportedRevision:null}]})
  if(url.startsWith(base+'/property-history-removals/'))return historyReceipt(url.split('/').at(-1)!)
  throw new Error('未授权测试请求：'+url)
 })
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];sessionStorage.clear();vi.unstubAllGlobals();document.body.innerHTML=''})

it.each(['current','history'] as const)('同scope %s UNKNOWN保持原操作和弹窗，仅显式GET恢复',async surface=>{
 await start(surface);await vi.waitFor(()=>expect(wrapper!.text()).toContain(surface==='current'?'本次操作不能再次提交':'不会重新提交删除'))
 const original=posts()[0]![1],id=surface==='history'?JSON.parse(original.rawBody).operationId:undefined
 sameScope();await flushPromises()
 expect(wrapper!.find('[role="dialog"]').isVisible()).toBe(true)
 expect(wrapper!.text()).toContain(surface==='current'?'本次操作不能再次提交':'不会重新提交删除')
 expect(gets()).toHaveLength(0)
 if(surface==='current')expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true])
 else expect(sessionStorage.getItem(pendingHistoryKey(account,project,device)!)).toBe(id)
 await click(surface==='current'?'核对原请求':'查询原操作')
 expect(posts()).toHaveLength(1)
 if(surface==='current'){
  expect(gets()[0]![1].headers).toEqual({'Original-Request-Key':original.headers['Idempotency-Key'],'X-Request-Body-SHA256':createHash('sha256').update(original.rawBody).digest('hex')})
  expect(gets()).toHaveLength(2);expect(wrapper!.emitted('saved')).toHaveLength(1);expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false])
 }else{expect(gets()).toHaveLength(1);expect(gets()[0]![0]).toContain(id);expect(wrapper!.text()).toContain('等待处理');expect(wrapper!.emitted('changed')).toBeUndefined()}
})
it.each(['current','history'] as const)('同scope %s 在途不被中止，迟到UNKNOWN仍绑定唯一原请求',async surface=>{
 let reject!:(e:unknown)=>void
 transport.api.mockImplementationOnce(()=>new Promise((_,r)=>{reject=r}))
 await start(surface);sameScope();await flushPromises()
 expect(wrapper!.find('[role="dialog"]').isVisible()).toBe(true)
 if(surface==='current')expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true])
 else expect(posts()[0]![1].signal.aborted).toBe(false)
 reject(new ApiError('响应未确认',0,undefined,undefined,true));await flushPromises()
 expect(button(surface==='current'?'核对原请求':'查询原操作')).toBeDefined();expect(posts()).toHaveLength(1);expect(gets()).toHaveLength(0)
})
it.each((['current','history'] as const).flatMap(surface=>(['permission','identity','project','device'] as const).map(reason=>({surface,reason}))))('真正scope失效 $surface/$reason 清弹窗，迟到回执不推进旧操作',async({surface,reason})=>{
 let resolve!:(v:Uint8Array)=>void;transport.api.mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
 await start(surface);const id=surface==='history'?JSON.parse(posts()[0]![1].rawBody).operationId:undefined
 if(reason==='permission')session.user={...session.user!,permissions:['device:read']}
 else if(reason==='identity'){session.user={...session.user!,accountId:other};changeIdentity()}
 else if(reason==='project')session.user={...session.user!,currentProjectId:other}
 else await wrapper!.setProps({deviceId:other})
 await flushPromises();resolve(surface==='current'?currentReceipt():historyReceipt(id));await flushPromises()
 expect(wrapper!.findAll('[role="dialog"]').every(d=>!d.isVisible())).toBe(true);expect(posts()).toHaveLength(1);expect(gets()).toHaveLength(0)
 expect(wrapper!.emitted(surface==='current'?'saved':'changed')).toBeUndefined()
 if(surface==='current')expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false])
})
