import {webcrypto} from 'node:crypto'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElSelect,ElTable,ElMessageBox,type TableInstance} from 'element-plus'
import Users from '../../src/features/devices/DeviceUserAssociations.vue'
import {session,can} from '../../src/core/session'
import {ApiError,changeIdentity,identityEpoch} from '../../src/core/http'
const mock=vi.hoisted(()=>({http:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:mock.http}))
const project='11111111-1111-4111-8111-111111111111',device='22222222-2222-4222-8222-222222222222',user='33333333-3333-4333-8333-333333333333',binding='44444444-4444-4444-8444-444444444444',other='55555555-5555-4555-8555-555555555555'
type Action='ADD'|'REMOVE'
type Sent={path:string;rawBody:string;key:string;body:{operationId:string;appUserIds?:string[];bindingIds?:string[]}}
const row=()=>({bindingId:binding,appUserId:user,displayName:'现有关联',username:'existing',lastVisitedAt:null})
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
const page=(items:unknown[])=>bytes({items,hasMore:false,nextCursor:null})
let wrapper:VueWrapper<any>|undefined,sent:Sent|undefined,recoveryStatus:number|undefined,recoveryReady=false,pending:Promise<never>|undefined
function button(label:string){const found=wrapper!.findAll('button').find(b=>b.text().trim()===label);if(!found)throw new Error('缺按钮 '+label);return found}
function posts(){return mock.http.mock.calls.filter(([,options])=>options?.method==='post')}
function operationReads(){return mock.http.mock.calls.filter(([path])=>String(path).includes('/user-association-operations/'))}
function refreshSameScope(){const epoch=identityEpoch();session.user={...session.user!,permissions:[...(session.user!.permissions||[])]};expect(identityEpoch()).toBe(epoch);expect(can('enduser:manage')).toBe(true)}
async function render(){wrapper=mount(Users,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{DeviceLearningResource:true}}});await flushPromises()}
async function submit(action:Action){
 if(action==='ADD'){await button('添加关联用户').trigger('click');await flushPromises();wrapper!.findComponent(ElSelect).vm.$emit('update:modelValue',[other]);await flushPromises();await button('添加').trigger('click')}
 else{(wrapper!.findComponent(ElTable).vm as unknown as TableInstance).toggleRowSelection(row(),true);await flushPromises();await button('移除关联用户').trigger('click')}
 await flushPromises();expect(posts()).toHaveLength(1);expect(sent).toBeDefined();return Object.freeze({...sent!,body:{...sent!.body}})
}
async function reachUnknown(action:Action){await render();const original=await submit(action);await vi.waitFor(()=>expect(wrapper!.text()).toContain('结果未确认'));expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true]);expect(operationReads()).toHaveLength(1);return original}
async function recoverOriginal(original:Sent,action:Action){
 recoveryReady=true;await button('重新核对').trigger('click');await flushPromises();expect(posts()).toHaveLength(1);expect(operationReads()).toHaveLength(2)
 expect(operationReads()[1]![0]).toBe(`/api/v1/projects/${project}/devices/${device}/user-association-operations/${original.body.operationId}`)
 expect(sent).toEqual(original);expect(JSON.parse(original.rawBody)).toEqual(action==='ADD'?{operationId:original.body.operationId,appUserIds:[other]}:{operationId:original.body.operationId,bindingIds:[binding]});expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false])
}
beforeEach(()=>{
 vi.stubGlobal('crypto',webcrypto);vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','enduser:read','enduser:manage']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]
 sent=undefined;recoveryReady=false;recoveryStatus=undefined;pending=undefined
 vi.spyOn(ElMessageBox,'confirm').mockResolvedValue('confirm' as Awaited<ReturnType<typeof ElMessageBox.confirm>>)
 mock.http.mockImplementation(async(path:string,options:Record<string,any>)=>{
  if(options?.method==='post'){sent={path,rawBody:options.rawBody,key:options.headers['Idempotency-Key'],body:JSON.parse(options.rawBody)};if(pending)return pending;throw new ApiError('回复未确认',0,undefined,undefined,true)}
  if(path.includes('/user-association-operations/')){if(recoveryStatus)throw new ApiError('无权限',recoveryStatus);if(!recoveryReady)throw new ApiError('未定位原件',404);const action=sent!.body.appUserIds?'ADD':'REMOVE',targets=sent!.body.appUserIds||sent!.body.bindingIds!;return bytes({operationId:sent!.body.operationId,deviceId:device,action,targetIds:targets,bindingIds:[binding],completedAt:'2026-10-27T00:00:00Z'})}
  if(path.endsWith('/user-association-candidates'))return page([{appUserId:other,displayName:'候选',username:'candidate'}])
  if(path.endsWith('/user-associations'))return page([row()])
  throw new Error('测试未授权请求 '+path)
 })
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;ElMessageBox.close();session.user=null;session.projects=[];vi.restoreAllMocks();vi.unstubAllGlobals();document.body.innerHTML=''})
it.each(['ADD','REMOVE'] as const)('真实session等值刷新保留%s UNKNOWN原件与busy，人工GET不二次写',async action=>{
 const original=await reachUnknown(action),beforeReads=mock.http.mock.calls.length;refreshSameScope();await flushPromises()
 expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true]);expect(mock.http).toHaveBeenCalledTimes(beforeReads);expect(button('添加关联用户').attributes('disabled')).toBeDefined()
 if(action==='ADD'){await button('取消').trigger('click');await flushPromises();expect(button('添加关联用户').attributes('disabled')).toBeDefined()}
 expect(button('重新核对')).toBeDefined();await recoverOriginal(original,action)
})
it.each(['ADD','REMOVE'] as const)('真实session等值刷新不清%s在途请求，迟到UNKNOWN后只核原件',async action=>{
 let reject!:(cause:unknown)=>void;pending=new Promise<never>((_,r)=>{reject=r});await render();const original=await submit(action);expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true]);refreshSameScope();await flushPromises();expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true]);expect(posts()).toHaveLength(1)
 reject(new ApiError('迟到未知',0,undefined,undefined,true));await flushPromises();await vi.waitFor(()=>expect(operationReads()).toHaveLength(1));expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true]);await recoverOriginal(original,action)
})
it.each(['permission','project','account-identity'] as const)('真正%s失效仍清UNKNOWN和busy，不复用旧操作',async reason=>{
 await reachUnknown('ADD');if(reason==='permission')session.user={...session.user!,permissions:['device:read','enduser:read']};else if(reason==='project')session.user={...session.user!,currentProjectId:other};else{changeIdentity();session.user={...session.user!,accountId:other}}
 await flushPromises();expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false]);expect(wrapper!.text()).not.toContain('重新核对');expect(posts()).toHaveLength(1);expect(operationReads()).toHaveLength(1)
})
it.each([401,403])('同scope刷新后的人工恢复GET实际%s继续清旧原件',async status=>{
 await reachUnknown('REMOVE');refreshSameScope();await flushPromises();expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true]);recoveryStatus=status;await button('重新核对').trigger('click');await flushPromises();expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false]);expect(wrapper!.text()).not.toContain('重新核对');expect(posts()).toHaveLength(1);expect(operationReads()).toHaveLength(2)
})
