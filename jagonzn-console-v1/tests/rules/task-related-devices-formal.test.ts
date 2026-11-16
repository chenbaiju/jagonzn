import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import ElementPlus from 'element-plus'
import { session } from '../../src/core/session'
import { changeIdentity } from '../../src/core/http'
import { ruleRoutes } from '../../src/features/rules/routes'
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
const job='00000000-0000-4000-8000-000000000099',other='00000000-0000-4000-8000-000000000098'
const a='00000000-0000-4000-8000-000000000044',b='00000000-0000-4000-8000-000000000045'
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
let wrapper:ReturnType<typeof mount>,fetcher=vi.fn(),definition=9,preference=3,scheduled=true,active=true,lastRunAt:string|null=null
function permissions(manage=true,run=true,read=true){session.user={...session.user!,currentProjectId:'p',permissions:[...(read?['task:read']:[]),...(manage?['task:manage']:[]),...(run?['task:run']:[]),'device:read']}}
const entry=(deviceId=a)=>({deviceId,name:deviceId===a?'设备甲':'设备乙',allowed:deviceId===a?scheduled:false,version:deviceId===a?preference:2,lastRunAt:deviceId===a?lastRunAt:null,acceptedAt:"2099-12-31T00:00:00Z"})
function normal(input:unknown,init:RequestInit={}){
 const url=new URL(String(input),'http://fixture.test'),path=url.pathname,method=init.method||'GET'
 if(method==='GET' && [job,other].some(id=>path===`/api/v1/projects/p/task-jobs/${id}`)){const id=path.split('/').at(-1)!;return Promise.resolve(json({id,name:id===job?'任务甲':'任务乙',description:'当前任务说明',version:definition,status:active?'ACTIVE':'PAUSED',targetType:'ALL_DEVICES',scheduleType:'CRON',timezone:'Asia/Shanghai',commandKey:'hidden-command',input:{secret:true}}))}
 if(method==='GET' && path.endsWith('/device-schedules'))return Promise.resolve(json({items:[entry(),entry(b)],definitionVersion:definition,hasMore:false,nextCursor:null}))
 if(method==='PUT' && path.endsWith('/device-schedules/'+a)){scheduled=JSON.parse(String(init.body)).allowed;preference++;return Promise.resolve(json({deviceId:a,allowed:scheduled,version:preference,definitionVersion:definition}))}
 if(method==='POST' && path.endsWith('/runs'))return Promise.resolve(json({id:'00000000-0000-4000-8000-000000000010',jobId:job,status:'DISPATCHING'},202))
 if(path.endsWith('/app-visibility'))return Promise.resolve(json({taskId:job,version:9,projectDeviceDetails:false,userSettings:false,userDetails:false}))
 throw new Error('未定义夹具，禁止网络回退 '+method+' '+path)
}
beforeEach(()=>{changeIdentity('fixture-never-sent');permissions();definition=9;preference=3;scheduled=true;active=true;lastRunAt=null;fetcher.mockReset().mockImplementation(normal);vi.stubGlobal('fetch',fetcher)})
afterEach(()=>{wrapper?.unmount();document.body.innerHTML='';vi.unstubAllGlobals();session.user=null;changeIdentity()})
async function open(path=`/tasks/jobs/${job}?tab=devices`){const router=createRouter({history:createMemoryHistory(),routes:ruleRoutes});await router.push(path);await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[ElementPlus,router]}});await flushPromises();return router}
function button(label:string){const node=Array.from(document.body.querySelectorAll('button')).find(x=>(x.textContent?.trim()===label||label==='运行'&&x.textContent?.trim()==='打开运行器')||x.getAttribute('aria-label')===label);if(!node)throw Error('missing '+label);return node}
const paths=()=>fetcher.mock.calls.map(([input])=>new URL(String(input),'http://fixture.test').pathname)
const writes=()=>fetcher.mock.calls.filter(([,init])=>init?.method && init.method!=='GET')
function pending(){let resolve!:(value:Response)=>void,reject!:(cause:unknown)=>void;const promise=new Promise<Response>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
it('实际父路由正规投影本任务最后运行时间，空记录仍空且不映射受理时间',async()=>{
 lastRunAt="2026-11-02T01:02:03Z";const router=await open(`/tasks/jobs/${job}`);expect(paths()).toEqual([`/api/v1/projects/p/task-jobs/${job}`,`/api/v1/projects/p/task-jobs/${job}/app-visibility`]);await router.push(`/tasks/jobs/${job}?tab=devices`);await flushPromises();expect(wrapper.findAll('th').map(n=>n.text())).toEqual(['','设备名称','任务最后运行时间','手动执行任务','允许定时运行']);expect(wrapper.findAll('[aria-label="最后运行时间未知"]')).toHaveLength(1);expect(wrapper.text()).toContain('2026-11-02 09:02:03');expect(wrapper.text()).not.toContain('2099');expect(wrapper.text()).not.toContain('hidden-command');expect(wrapper.find('.tl-pager').exists()).toBe(false);const url=new URL(String(fetcher.mock.calls.at(-1)![0]),'http://fixture.test');expect(url.searchParams.get('expectedDefinitionVersion')).toBe('9');expect(url.searchParams.get('limit')).toBe('24');expect(writes()).toHaveLength(0)
})
it('实际PUT携带独立偏好3和父定义9，同值不重放且更新一行',async()=>{
 await open();await wrapper.find('[aria-label="允许 设备甲 定时运行"]').trigger('click');await flushPromises();expect(writes()).toHaveLength(1);expect(JSON.parse(String(writes()[0][1]!.body))).toEqual({allowed:false,expectedVersion:3,expectedDefinitionVersion:9});expect(wrapper.find('[aria-label="允许 设备甲 定时运行"]').attributes('aria-checked')).toBe('false');expect(wrapper.find('[aria-label="允许 设备乙 定时运行"]').attributes('aria-checked')).toBe('false');expect(fetcher.mock.calls).toHaveLength(3)
})
it('定时关闭设备仍可手动运行，实际POST只提交当前设备子集与定义9',async()=>{
 await open();button('运行 设备乙').click();await flushPromises();expect(writes()).toHaveLength(1);const request=writes()[0];expect(JSON.parse(String(request[1]!.body))).toEqual({deviceIds:[b],expectedVersion:9});expect(new URL(String(request[0]),'http://fixture.test').searchParams.get('requireEnabled')).toBe('true');expect(document.body.textContent).toContain('执行已受理');expect(wrapper.findAll('[aria-label="最后运行时间未知"]')).toHaveLength(2)
})
it('设备在途同步阻止父页运行、编辑、目标、移除，切页签迟到后仍需核对',async()=>{
 const wait=pending();fetcher.mockImplementation((input,init)=>init?.method==='POST'?wait.promise:normal(input,init));const router=await open();button('运行 设备甲').click();expect(writes()).toHaveLength(1);button('运行').click();await flushPromises();expect(document.body.querySelector('.el-dialog')).toBeNull();expect(button('运行').disabled).toBe(true);expect(button('编辑').disabled).toBe(true);await router.push(`/tasks/jobs/${job}?tab=task`);await flushPromises();expect(button('编辑目标').disabled).toBe(true);await router.push(`/tasks/jobs/${job}?tab=settings`);await flushPromises();expect(button('移除任务').disabled).toBe(true);wait.resolve(json({id:'late'},202));await flushPromises();expect(button('移除任务').disabled).toBe(true);expect(wrapper.text()).toContain('设备操作结果尚未核对');button('核对设备状态').click();await flushPromises();expect(router.currentRoute.value.query.tab).toBe('devices');expect(button('运行').disabled).toBe(false);expect(writes()).toHaveLength(1);expect(paths().filter(p=>!p.endsWith('/app-visibility')).slice(-2)).toEqual([`/api/v1/projects/p/task-jobs/${job}`,`/api/v1/projects/p/task-jobs/${job}/device-schedules`])
})
it('实际网络未知不重放，父级核对失败继续锁住，成功后才恢复全部入口',async()=>{
 fetcher.mockImplementation((input,init)=>init?.method==='PUT'?Promise.reject(new TypeError('offline')):normal(input,init));await open();await wrapper.find('[aria-label="允许 设备甲 定时运行"]').trigger('click');await flushPromises();expect(button('运行').disabled).toBe(true);fetcher.mockImplementation((input,init)=>String(input).endsWith('/'+job)?Promise.resolve(json({message:'任务读取失败'},503)):normal(input,init));button('核对设备状态').click();await flushPromises();expect(wrapper.text()).toContain('任务读取失败');expect(wrapper.findAll('button').some(node=>['运行','打开运行器'].includes(node.text())&&!node.attributes('disabled'))).toBe(false);expect(writes()).toHaveLength(1);fetcher.mockImplementation(normal);button('核对设备状态').click();await flushPromises();expect(button('运行').disabled).toBe(false);expect(writes()).toHaveLength(1)
})
it('普通成员只读实际偏好，只有运行权可手动运行，整体暂停禁止手动但不误判设备偏好',async()=>{
 permissions(false,false);await open();expect(wrapper.text()).toContain('设备甲');expect(wrapper.find('[role="switch"]').attributes('aria-disabled')).toBe('true');expect(button('运行 设备乙').disabled).toBe(true);permissions(false,true);await flushPromises();expect(button('运行 设备乙').disabled).toBe(false);active=false;button('刷新').click();await flushPromises();expect(button('运行 设备乙').disabled).toBe(true);expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true');expect(writes()).toHaveLength(0)
})
it.each([401,403,404])('实际偏好写%s清整个父页身份和旧设备名称',async status=>{
 fetcher.mockImplementation((input,init)=>init?.method==='PUT'?Promise.resolve(json({message:'设备不可管理'},status)):normal(input,init));await open();await wrapper.find('[role="switch"]').trigger('click');await flushPromises();expect(wrapper.text()).not.toContain('任务甲');expect(wrapper.text()).not.toContain('设备甲');expect(wrapper.text()).not.toContain('当前任务说明');if(status===401)expect(session.user).toBeNull();expect(writes()).toHaveLength(1)
})
it('读取越权或父身份不匹配不读设备，不把坏页当空页',async()=>{
 fetcher.mockImplementation(()=>Promise.resolve(json({id:other,name:'其它身份'})));await open();expect(fetcher).toHaveBeenCalledTimes(1);expect(wrapper.text()).not.toContain('其它身份');expect(wrapper.text()).toContain('任务返回身份不完整');expect(wrapper.text()).not.toContain('暂无数据')
})
it('切任务后的迟到请求不能覆盖新父页或让新任务保留旧锁',async()=>{
 const wait=pending();fetcher.mockImplementation((input,init)=>init?.method==='PUT'?wait.promise:normal(input,init));const router=await open();await wrapper.find('[role="switch"]').trigger('click');await router.push(`/tasks/jobs/${other}?tab=devices`);await flushPromises();const calls=fetcher.mock.calls.length;wait.resolve(json({deviceId:a,allowed:false,version:4,definitionVersion:9}));await flushPromises();expect(wrapper.text()).toContain('任务乙');expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true');expect(button('运行').disabled).toBe(false);expect(fetcher).toHaveBeenCalledTimes(calls)
})
