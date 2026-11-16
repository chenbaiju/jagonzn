import {configureTaskCommand} from './task-command-config-fixture'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {DOMWrapper,flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DeviceTaskCreateDialog from '../../src/features/rules/DeviceTaskCreateDialog.vue'
import DeviceTaskDefinitions from '../../src/features/rules/DeviceTaskDefinitions.vue'
import {ApiError,changeIdentity} from '../../src/core/http'
import type {Schema} from '../../src/core/contracts'
const state=vi.hoisted(()=>({project:null as any,current:null as any,manage:null as any,push:vi.fn()}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');state.project=ref('10000000-0000-4000-8000-000000000001');state.current=ref({timezone:'Asia/Shanghai'});state.manage=ref(true);return {session:{ready:true,transitioning:false,user:{accountId:'00000000-0000-4000-8000-0000000000aa'},projects:[],menus:[]},projectId:state.project,currentProject:state.current,can:(permission:string)=>permission==='task:read'||permission==='task:manage'&&state.manage.value}})
vi.mock('vue-router',()=>({onBeforeRouteLeave:()=>{},onBeforeRouteUpdate:()=>{},useRouter:()=>({push:state.push})}))
const project='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000001',other='20000000-0000-4000-8000-000000000002',job='30000000-0000-4000-8000-000000000001'
const response=(body:Schema<'SaveTaskJobRequest'>)=>({...body,id:job,status:'PAUSED',version:1,tags:{},createdAt:'2026-10-25T00:00:00Z',updatedAt:'2026-10-25T00:00:00Z'} as Schema<'TaskJobResponse'>)
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
let w:VueWrapper|undefined,port:any,saved:Schema<'TaskJobResponse'>
const button=(label:string)=>{const element=[...document.querySelectorAll('button')].find(node=>node.textContent?.trim()===label);expect(element,label).toBeDefined();return new DOMWrapper(element!)}
const field=(label:string)=>new DOMWrapper(document.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!)
async function fill(){await field('新任务名称').setValue(' 测温任务 ');await configureTaskCommand(w!,' sample ','{"间隔":30,"校准":{"b":2,"a":1}}')}
async function setup(){w=mount(DeviceTaskCreateDialog,{attachTo:document.body,props:{deviceId:device,deviceName:'机房设备',transport:port},global:{plugins:[ElementPlus]}});await flushPromises();await fill();return w}
describe('当前设备任务创建与权威回读',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.project.value=project;state.current.value={timezone:'Asia/Shanghai'};state.manage.value=true;port={read:vi.fn().mockResolvedValue({items:[],hasMore:false,nextCursor:null}),create:vi.fn().mockImplementation((_p:string,_d:string,body:Schema<'SaveTaskJobRequest'>)=>{saved=response(body);return Promise.resolve(saved)}),definition:vi.fn().mockImplementation(()=>Promise.resolve({...saved,input:{校准:{a:1,b:2},间隔:30}})),preference:vi.fn().mockResolvedValue({deviceId:device,definitionVersion:1,version:1,allowed:true}),change:vi.fn(),run:vi.fn()}})
 afterEach(()=>{w?.unmount();w=undefined;document.body.innerHTML=''})
 it('当前设备创建入口走完整页并保留来源参数，不在列表内发POST',async()=>{
  w=mount(DeviceTaskDefinitions,{attachTo:document.body,props:{deviceId:device,transport:port},global:{plugins:[ElementPlus]}});await flushPromises();await button('创建任务').trigger('click');await flushPromises();expect(state.push).toHaveBeenCalledExactlyOnceWith({path:'/tasks/jobs/create',query:{source:'device',deviceId:device}});expect(port.create).not.toHaveBeenCalled();expect(port.definition).not.toHaveBeenCalled();expect(document.querySelector('[aria-label="新任务名称"]')).toBeNull()
 })
 it('已受理但定义错值保留表单并锁提交/关闭，不能第二次POST',async()=>{
  port.definition.mockImplementation(()=>Promise.resolve({...saved,targetDeviceIds:[other]}));const view=await setup();await button('创建').trigger('click');await flushPromises();expect(document.body.textContent).toContain('定义回读不一致');expect(document.body.textContent).toContain('不要重复创建');expect(field('新任务名称').element.value).toBe(' 测温任务 ');expect(button('创建').attributes('disabled')).toBeDefined();expect(button('取消').attributes('disabled')).toBeDefined();await button('创建').trigger('click');expect(port.create).toHaveBeenCalledTimes(1);expect(port.preference).not.toHaveBeenCalled();expect(view.emitted('created')).toBeUndefined();expect(view.emitted('close')).toBeUndefined()
 })
 it('创建回执本身错范围不继续读取，网络未知同样不重试',async()=>{
  port.create.mockImplementation((_p:string,_d:string,body:Schema<'SaveTaskJobRequest'>)=>Promise.resolve({...response(body),targetType:'ALL_DEVICES'}));await setup();await button('创建').trigger('click');await flushPromises();expect(document.body.textContent).toContain('提交范围不一致');expect(port.definition).not.toHaveBeenCalled();w!.unmount();document.body.innerHTML='';port.create.mockRejectedValueOnce(new ApiError('连接中断',0,undefined,undefined,true));const view=await setup();await button('创建').trigger('click');await flushPromises();expect(button('创建').attributes('disabled')).toBeDefined();expect(document.body.textContent).toContain('不要重复创建');expect(view.emitted('created')).toBeUndefined();expect(port.create).toHaveBeenCalledTimes(2)
 })
 it('切设备丢弃迟到POST；身份改变中止已开始回读且不发偏好/第二POST',async()=>{
  const write=deferred<Schema<'TaskJobResponse'>>();port.create.mockImplementation((_p:string,_d:string,body:Schema<'SaveTaskJobRequest'>)=>{saved=response(body);return write.promise});const view=await setup();await button('创建').trigger('click');await view.setProps({deviceId:other});write.resolve(saved);await flushPromises();expect(port.definition).not.toHaveBeenCalled();expect(view.emitted('created')).toBeUndefined();expect(view.emitted('close')).toHaveLength(1)
  view.unmount();document.body.innerHTML='';const read=deferred<Schema<'TaskJobResponse'>>();port.create.mockImplementation((_p:string,_d:string,body:Schema<'SaveTaskJobRequest'>)=>{saved=response(body);return Promise.resolve(saved)});port.definition.mockReturnValue(read.promise);const next=await setup();await button('创建').trigger('click');await flushPromises();const signal=port.definition.mock.lastCall[2] as AbortSignal;changeIdentity();read.resolve(saved);await flushPromises();expect(signal.aborted).toBe(true);expect(port.preference).not.toHaveBeenCalled();expect(next.emitted('created')).toBeUndefined();expect(port.create).toHaveBeenCalledTimes(2)
 })
 it('不安全JSON数字/缺项目时区/撤管理权限均零POST，不猜UTC',async()=>{
  await setup();const invalid=await configureTaskCommand(w!,'sample','{"值":9007199254740993}');expect(document.body.textContent).toContain('无法精确提交');expect(port.create).not.toHaveBeenCalled();await invalid.findAllComponents({name:'ElButton'}).find(x=>x.text()==='取消')!.trigger('click');await flushPromises();state.current.value={};await button('创建').trigger('click');await flushPromises();expect(document.body.textContent).toContain('项目时区不可用');expect(port.create).not.toHaveBeenCalled();state.current.value={timezone:'Asia/Shanghai'};state.manage.value=false;await flushPromises();await button('创建').trigger('click');expect(port.create).not.toHaveBeenCalled()
 })
 it('创建后偏好错误设备不能当关联确认；明确400允许修正但不自动重放',async()=>{
  port.create.mockRejectedValueOnce(new ApiError('命令不存在',400));const view=await setup();await button('创建').trigger('click');await flushPromises();expect(button('创建').attributes('disabled')).toBeUndefined();expect(port.create).toHaveBeenCalledTimes(1);port.preference.mockResolvedValue({deviceId:other,definitionVersion:1,version:1,allowed:true});await button('创建').trigger('click');await flushPromises();expect(document.body.textContent).toContain('设备关联未能核实');expect(button('创建').attributes('disabled')).toBeDefined();expect(view.emitted('created')).toBeUndefined();expect(port.create).toHaveBeenCalledTimes(2)
 })
})
