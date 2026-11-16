import {webcrypto} from 'node:crypto'
import {EditorView} from '@codemirror/view'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import CommandSend from '../../src/features/devices/DeviceCommandSend.vue'
import MessageDownlink from '../../src/features/devices/DeviceMessageDownlink.vue'
import {session,can} from '../../src/core/session'
import {ApiError,changeIdentity,identityEpoch} from '../../src/core/http'

// 保留真实会话、组件、编辑器及 prepare/提交/恢复适配器，仅替换 HTTP 传输。
const transport=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:transport.api}))
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',account='00000000-0000-4000-8000-000000000003',commandId='00000000-0000-4000-8000-000000000004',other='00000000-0000-4000-8000-000000000005'
const type='60000000-0000-4000-8000-000000000001',modelVersion='60000000-0000-4000-8000-000000000002'
const input='{"exact":9007199254740993,"decimal":0.1234567890123456789}'
const envelope=`{"method":"reboot","params":${input}}`
const path=`/api/v1/projects/${project}/devices/${device}/commands`
type Surface='command'|'debug'
let wrapper:VueWrapper<any>|undefined
let acceptedPost=false,replyDone=false
function wire(status='ACCEPTED'){
 const head=JSON.stringify({id:commandId,deviceId:device,connectionDeviceId:device,commandKey:'reboot',currentDefinitionName:'重启',repliedAt:null,status,attemptCount:1,maxAttempts:3,timeoutSeconds:30,failureCode:null,failureMessage:null,acceptedAt:'2026-10-24T01:00:00Z',dispatchedAt:null,acknowledgedAt:null,completedAt:null,attempts:[]})
 return new TextEncoder().encode(`${head.slice(0,-1)},"input":${input},"output":${status==='SUCCEEDED'?'false':'null'}}`)
}
function button(label:string){const result=wrapper!.findAll('button').find(x=>x.text()===label);if(!result)throw new Error('缺少按钮：'+label);return result}
function posts(){return transport.api.mock.calls.filter(([,options])=>options?.method==='post')}
function recoveries(){return transport.api.mock.calls.filter(([url])=>url===path+'/submissions/current')}
function replies(){return transport.api.mock.calls.filter(([url])=>url===path+'/'+commandId+'/reply')}
function editor(){const node=wrapper!.find('.cm-editor').element;const view=EditorView.findFromDOM(node as HTMLElement);if(!view)throw new Error('真实编辑器未就绪');return view}
async function open(surface:Surface,synchronous=false){
 wrapper=mount(surface==='command'?CommandSend:MessageDownlink,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus]}})
 await button(surface==='command'?'下发命令':'下发消息').trigger('click');await flushPromises()
 if(surface==='command'){
  await wrapper.get('input[placeholder="填写命令标识符"]').setValue('reboot')
  if(synchronous)await wrapper.get('[role="switch"]').trigger('click')
 }else{
  await wrapper.get('.el-select__wrapper').trigger('click');await flushPromises()
  const option=[...document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')].find(x=>x.textContent==='命令下发')
  if(!option)throw new Error('真实下拉选项未显示');option.click();await flushPromises()
 }
 await vi.waitFor(()=>expect(wrapper!.find('.cm-editor').exists()).toBe(true))
 if(surface==='command'){expect(wrapper!.find('.command-definition-error').exists()).toBe(false);expect(transport.api.mock.calls.filter(([url])=>url.endsWith('/thing-model-binding'))).toHaveLength(1)}
 const view=editor();view.dispatch({changes:{from:0,to:view.state.doc.length,insert:surface==='command'?input:envelope}});await flushPromises()
 await button('发送').trigger('click');await flushPromises()
}
async function unknown(surface:Surface){await open(surface);await vi.waitFor(()=>expect(wrapper!.text()).toContain('结果未知，请核对原请求'));expect(posts()).toHaveLength(1);expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true]);return posts()[0]![1]}
function sameScope(){const epoch=identityEpoch(),old=session.user!;session.user={...old,permissions:[...(old.permissions||[])]};expect(session.user).not.toBe(old);expect(identityEpoch()).toBe(epoch);expect(can('device:control')).toBe(true)}
beforeEach(()=>{
 vi.stubGlobal('crypto',webcrypto);transport.api.mockReset();changeIdentity();acceptedPost=false;replyDone=false
 session.ready=true;session.transitioning=false;session.user={accountId:account,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:control']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]
 transport.api.mockImplementation(async(url:string,options?:{method?:string})=>{
  if(url===`/api/v1/projects/${project}/devices/${device}/thing-model-binding`)return{deviceId:device,deviceTypeId:type,version:{id:modelVersion,deviceTypeId:type,schemaDigest:'a'.repeat(64),digestAlgorithm:'PG_JSONB_TEXT_V1_SHA256'}}
  if(url===`/api/v1/projects/${project}/device-types/${type}/thing-model-versions/${modelVersion}`)return new TextEncoder().encode(JSON.stringify({version:{id:modelVersion,deviceTypeId:type,schemaDigest:'a'.repeat(64),digestAlgorithm:'PG_JSONB_TEXT_V1_SHA256'},modelSnapshot:{commands:{}}}))
  if(url===path&&options?.method==='post'){if(acceptedPost)return wire();throw new ApiError('响应未确认',0,undefined,undefined,true)}
  if(url===path+'/submissions/current')return wire()
  if(url===path+'/'+commandId+'/reply')return wire(replyDone?'SUCCEEDED':'ACCEPTED')
  throw new Error('未授权的测试请求：'+url)
 })
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];vi.unstubAllGlobals();document.body.innerHTML=''})

it.each(['command','debug'] as const)('同scope %s UNKNOWN保原key、精确JSON及busy，关闭重开后只GET恢复',async surface=>{
 const original=await unknown(surface),key=original.headers['Idempotency-Key']
 expect(key).toMatch(/^[0-9a-f-]{36}$/)
 expect(original.rawBody).toContain('9007199254740993');expect(original.rawBody).toContain('0.1234567890123456789')
 sameScope();await flushPromises()
 expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true]);expect(wrapper!.text()).toContain('结果未知，请核对原请求');expect(recoveries()).toHaveLength(0)
 await button('取消').trigger('click');await button(surface==='command'?'下发命令':'下发消息').trigger('click');await flushPromises()
 await vi.waitFor(()=>expect(wrapper!.find('.cm-editor').exists()).toBe(true))
 expect(editor().state.doc.toString()).toBe(surface==='command'?input:envelope)
 expect(wrapper!.findAll('button').some(x=>x.text()==='发送')).toBe(false)
 await button('核对原请求').trigger('click');await vi.waitFor(()=>expect(wrapper!.emitted('saved')).toHaveLength(1))
 expect(posts()).toHaveLength(1);expect(recoveries()).toHaveLength(1)
 expect(recoveries()[0]![1]).toMatchObject({headers:{'Original-Request-Key':key},responseType:'bytes'})
 expect(recoveries()[0]![1].method).toBeUndefined();expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false])
})
it('同scope同步已受理保原commandId与busy，后继只读取原回复',async()=>{
 acceptedPost=true;await open('command',true)
 await vi.waitFor(()=>expect(wrapper!.text()).toContain('命令已受理，设备回复尚未确认'))
 expect(posts()).toHaveLength(1);expect(replies()).toHaveLength(1)
 sameScope();await flushPromises();expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true]);expect(wrapper!.text()).toContain('命令已受理，设备回复尚未确认')
 replyDone=true;await button('读取命令结果').trigger('click');await vi.waitFor(()=>expect(replies()).toHaveLength(2));await flushPromises()
 expect(posts()).toHaveLength(1);expect(recoveries()).toHaveLength(0);expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false])
 expect(wrapper!.text()).toContain('设备回复参数 JSON')
})
it.each((['command','debug'] as const).flatMap(surface=>(['permission','project','identity','device'] as const).map(reason=>({surface,reason}))))('真正scope失效：$surface/$reason清原意图，无恢复GET或第二次POST',async({surface,reason})=>{
 await unknown(surface)
 if(reason==='permission')session.user={...session.user!,permissions:['device:read']}
 else if(reason==='project')session.user={...session.user!,currentProjectId:other}
 else if(reason==='identity'){session.user={...session.user!,accountId:other};changeIdentity()}
 else await wrapper!.setProps({deviceId:other})
 await flushPromises();expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false]);expect(wrapper!.text()).not.toContain('结果未知，请核对原请求');expect(recoveries()).toHaveLength(0);expect(posts()).toHaveLength(1)
})
