import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'
import TaskDebugLogPanel from '../../src/features/rules/TaskDebugLogPanel.vue'
import type { TaskDebugLogTransport } from '../../src/features/rules/task-debug-state'
import { session } from '../../src/core/session'
import { ApiError, changeIdentity } from '../../src/core/http'
import { taskDebugLogTransport } from '../../src/features/rules/task-debug-transport'
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
let wrapper:ReturnType<typeof mount>,transport:TaskDebugLogTransport
const row={key:'log',taskLabel:'已有历史任务',typeLabel:'—',countLabel:'—',deliveryLabel:'—',at:'2026-10-24T00:00:00Z'}
beforeEach(()=>{session.user={currentProjectId:'p',permissions:['task:read','task:manage']};transport={readRows:vi.fn().mockResolvedValue({rows:[row],clearToken:7}),readSwitch:vi.fn().mockResolvedValue({checked:false,writeToken:3}),changeSwitch:vi.fn().mockResolvedValue({checked:true,writeToken:4}),eraseTask:vi.fn().mockResolvedValue({checked:false,writeToken:4}),eraseProject:vi.fn().mockResolvedValue(8)}})
afterEach(()=>{wrapper?.unmount();document.body.innerHTML='';session.user=null})
async function open(jobId:string|undefined='r'){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<p />'}}]});await router.push('/rules/executions');await router.isReady();wrapper=mount(TaskDebugLogPanel,{props:{jobId,transport},attachTo:document.body,global:{plugins:[ElementPlus,router]}});await flushPromises()}
function button(label:string){const node=Array.from(document.body.querySelectorAll('button')).find(x=>x.textContent?.trim()===label);if(!node)throw Error('missing '+label);return node}
it('真实容器先确认再执行捕获CAS，未知结果撤框并锁住，再成功人工读取才能重新操作',async()=>{
 vi.mocked(transport.eraseTask).mockRejectedValueOnce(new ApiError('结果未知',0,undefined,undefined,true));await open();expect(wrapper.text()).toContain('2026-10-24');button('清空').click();await flushPromises();expect(transport.eraseTask).not.toHaveBeenCalled();button('取消').click();await flushPromises();expect(transport.eraseTask).not.toHaveBeenCalled();button('清空').click();await flushPromises();button('确定').click();await flushPromises();expect(transport.eraseTask).toHaveBeenCalledExactlyOnceWith('p','r',3);expect(button('清空').disabled).toBe(true);expect(wrapper.find('[role="switch"]').attributes('aria-disabled')).toBe('true');button('重新读取核对').click();await flushPromises();expect(button('清空').disabled).toBe(false);expect(transport.eraseTask).toHaveBeenCalledTimes(1)
})
it('读取到关闭状态仍显示历史，真实开关只修改调试许可并保留行，撤权立刻清数据',async()=>{
 await open();expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false');expect(wrapper.text()).toContain('2026-10-24');await wrapper.find('[role="switch"]').trigger('click');await flushPromises();expect(transport.changeSwitch).toHaveBeenCalledExactlyOnceWith('p','r',3,true);expect(wrapper.text()).toContain('2026-10-24');session.user={...session.user!,permissions:[]};await flushPromises();expect(wrapper.text()).not.toContain('2026-10-24');expect(wrapper.find('[role="switch"]').exists()).toBe(false);expect(button('清空').disabled).toBe(true)
})
it('控制读取失败不会出现关闭开关，独立重新读取成功后才显示实际状态',async()=>{
 vi.mocked(transport.readSwitch).mockRejectedValueOnce(new ApiError('控制读取失败',503));await open();expect(wrapper.find('[role="switch"]').exists()).toBe(false);expect(button('清空').disabled).toBe(true);button('重新读取').click();await flushPromises();expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false');expect(transport.changeSwitch).not.toHaveBeenCalled()
})
it('普通成员读取真实历史和控制状态，所有写入口禁用但允许刷新和真实页号读取',async()=>{
 session.user={...session.user!,permissions:['task:read']};await open();expect(wrapper.text()).toContain('2026-10-24');expect(wrapper.find('[role="switch"]').attributes('aria-disabled')).toBe('true');expect(button('清空').disabled).toBe(true);expect(button('刷新').disabled).toBe(false);const next=wrapper.find('[aria-label="下一页"]');await next.trigger('click');await flushPromises();expect(transport.readRows).toHaveBeenLastCalledWith('p','r',2,expect.any(AbortSignal));expect(transport.eraseTask).not.toHaveBeenCalled();expect(transport.changeSwitch).not.toHaveBeenCalled()
})
it('父对象被拒绝时发出denied并清除旧内容，不能把404显示为空页',async()=>{
 await open();vi.mocked(transport.readRows).mockRejectedValueOnce(new ApiError('任务已不可见',404));button('刷新').click();await flushPromises();expect(wrapper.emitted('denied')?.[0]?.[0]).toBeInstanceOf(ApiError);expect(wrapper.text()).not.toContain('2026-10-24');expect(wrapper.text()).not.toContain('暂无日志');expect(button('清空').disabled).toBe(true)
})
it('未知写入暂离页签再返回仍锁住，当前对象未变时仅人工刷新才能解锁',async()=>{
 vi.mocked(transport.eraseTask).mockRejectedValueOnce(new ApiError('未知',500));await open();button('清空').click();await flushPromises();button('确定').click();await flushPromises();await wrapper.setProps({inactive:true});await wrapper.setProps({inactive:false});await flushPromises();expect(button('清空').disabled).toBe(true);expect(transport.eraseTask).toHaveBeenCalledTimes(1);button('重新读取核对').click();await flushPromises();expect(button('清空').disabled).toBe(false)
})

it('历史设备数钻取使用精确日志只读页，零与未知分开，分页和范围失效不泄露迟到成员',async()=>{
 changeIdentity('task-log-fixture-never-sent')
 const job='00000000-0000-4000-8000-000000000099',log='00000000-0000-4000-8000-000000000055',execution='00000000-0000-4000-8000-000000000044',first='00000000-0000-4000-8000-000000000011',deleted='00000000-0000-4000-8000-000000000012'
 const at='2026-11-03T00:00:00Z',calls:{url:URL;init:RequestInit}[]=[]
 let deferred:((value:Response)=>void)|undefined,wait=false,missing=false
 const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
 const member=(id:string,name:string|null,readable:boolean)=>({deviceId:id,deviceName:name,deviceReadable:readable,targetStatus:'ACCEPTED',acceptedAt:at,completedAt:null})
 const details=(items:unknown[],nextCursor:string|null=null)=>({logId:log,jobId:job,executionId:execution,executionStartedAt:at,deviceCount:2,items,nextCursor,hasMore:!!nextCursor})
 const entry={id:log,jobId:job,jobName:'任务甲',definitionVersion:9,triggerType:'MANUAL',executionStartedAt:at,recordedAt:at,taskType:'COMMAND',deliveryMethod:null,terminalStatus:null,totalTargets:null,acceptedTargets:null,succeededTargets:null,failedTargets:null,skippedTargets:null,finishedAt:null,targetDeviceCount:2}
 session.user={...session.user!,permissions:['task:read','task:manage','device:read']};transport=taskDebugLogTransport
 vi.stubGlobal('fetch',vi.fn((input:unknown,init:RequestInit={})=>{
  const url=new URL(String(input),'http://fixture.test');calls.push({url,init})
  if(url.pathname.endsWith('/debug-log-control'))return Promise.resolve(response({enabled:false,version:3,projectGeneration:1,jobGeneration:1}))
  if(url.pathname.endsWith('/task-debug-logs'))return Promise.resolve(response({items:url.pathname.includes('/projects/q/')?[]:[entry,{...entry,id:'00000000-0000-4000-8000-000000000056',targetDeviceCount:0},{...entry,id:'00000000-0000-4000-8000-000000000057',targetDeviceCount:null}],hasMore:false,nextCursor:null,projectVersion:7}))
  if(url.pathname.endsWith(`/task-debug-logs/${log}/devices`)){
   if(missing)return Promise.resolve(response({message:'原日志已清空或不可读取'},404))
   if(wait)return new Promise<Response>(resolve=>{deferred=resolve})
   return Promise.resolve(response(url.searchParams.get('cursor')?details([member(deleted,null,false)]):details([member(first,'历史设备甲',true)],'next-member')))
  }
  throw new Error('未定义实际日志端口 '+url.pathname)
 }))
 await open(job)
 const links=()=>wrapper.findAll('[aria-label="查看 任务甲 的运行设备"]')
 expect(links()).toHaveLength(1);expect(wrapper.findAll('tbody tr').map(tr=>tr.findAll('td')[2]?.text())).toEqual(['2','0','—'])
 await links()[0]!.trigger('click');await flushPromises()
 expect(document.body.textContent).toContain('任务运行日志');expect(document.body.textContent).toContain('历史设备甲');expect(document.body.querySelector(`a[href="/devices/${first}"]`)).not.toBeNull()
 expect(calls.at(-1)!.url.pathname).toBe(`/api/v1/projects/p/task-debug-logs/${log}/devices`);expect(calls.at(-1)!.url.searchParams.get('limit')).toBe('20')
 const dialog=()=>Array.from(document.body.querySelectorAll('.el-dialog')).find(element=>element.querySelector('.el-dialog__title')?.textContent==='任务运行日志')!
 ;(dialog().querySelector('button[aria-label="下一页"]') as HTMLButtonElement).click();await flushPromises()
 expect(calls.at(-1)!.url.searchParams.get('cursor')).toBe('next-member');expect(dialog().textContent).toContain(deleted);expect(dialog().querySelector(`a[href="/devices/${deleted}"]`)).toBeNull();expect(dialog().textContent).not.toContain('历史设备甲')
 button('关闭').click();await flushPromises();wait=true;await links()[0]!.trigger('click');await flushPromises();expect(deferred).toBeDefined()
 session.user={...session.user!,currentProjectId:'q'};await flushPromises();deferred!(response(details([member(first,'迟到旧项目秘密',true)])));await flushPromises();expect(document.body.textContent).not.toContain('迟到旧项目秘密');expect(document.body.textContent).not.toContain('历史设备甲')
 session.user={...session.user!,currentProjectId:'p'};wait=false;missing=true;await flushPromises();await links()[0]!.trigger('click');await flushPromises();expect(dialog().textContent).toContain('原日志已清空或不可读取');expect(dialog().textContent).not.toContain('暂无设备')
 session.user={...session.user!,permissions:[]};await flushPromises();expect(document.body.textContent).not.toContain('原日志已清空或不可读取')
 expect(calls.every(({init})=>(init.method||'GET')==='GET'&&init.body===undefined)).toBe(true);expect(calls.some(({url})=>/\/(executions|runs|task-target-candidates)$/.test(url.pathname))).toBe(false)
 vi.unstubAllGlobals();changeIdentity()
})
