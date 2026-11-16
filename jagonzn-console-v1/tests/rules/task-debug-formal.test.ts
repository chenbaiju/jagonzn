import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import ElementPlus from 'element-plus'
import { session } from '../../src/core/session'
import { changeIdentity } from '../../src/core/http'
import { ruleRoutes } from '../../src/features/rules/routes'
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
const job='00000000-0000-4000-8000-000000000099',other='00000000-0000-4000-8000-000000000098'
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
let wrapper:ReturnType<typeof mount>,fetcher=vi.fn(),controlVersion=3,enabled=false,projectVersion=7,empty=false
function permissions(manage=true,read=true){session.user={...session.user!,currentProjectId:'p',permissions:read?(manage?['task:read','task:manage','task:run']:['task:read']):[]}}
const row=(id=job)=>({id:'00000000-0000-4000-8000-000000000055',jobId:id,jobName:id===job?'任务甲':'任务乙',definitionVersion:9,triggerType:'SCHEDULE',executionStartedAt:'2026-10-24T00:00:00Z',recordedAt:'2026-10-24T00:00:01Z',taskType:null,deliveryMethod:null,terminalStatus:null,totalTargets:null,acceptedTargets:null,succeededTargets:null,failedTargets:null,skippedTargets:null,finishedAt:null})
function normal(input:unknown,init:RequestInit={}){
 const url=new URL(String(input),'http://fixture.test'),path=url.pathname,method=init.method||'GET'
 const control=()=>({enabled,version:controlVersion,projectGeneration:1,jobGeneration:1})
 if(method==='GET' && path==='/api/v1/projects/p/task-debug-logs')return Promise.resolve(json({items:empty?[]:[row(url.searchParams.get('jobId')||job)],hasMore:false,nextCursor:null,projectVersion}))
 if(path.endsWith('/debug-log-control')){if(method==='PUT'){enabled=JSON.parse(String(init.body)).enabled;controlVersion++}return Promise.resolve(json(control()))}
 if(method==='DELETE' && path.endsWith('/debug-logs')){empty=true;controlVersion++;return Promise.resolve(json(control()))}
 if(method==='DELETE' && path==='/api/v1/projects/p/task-debug-logs'){empty=true;projectVersion++;return Promise.resolve(json({version:projectVersion}))}
 if(method==='GET' && [job,other].some(id=>path===`/api/v1/projects/p/task-jobs/${id}`)){const id=path.split('/').at(-1)!;return Promise.resolve(json({id,name:id===job?'任务甲':'任务乙',description:'当前任务描述',version:9,status:'ACTIVE',targetType:'ALL_DEVICES',scheduleType:'CRON',timezone:'Asia/Shanghai',commandKey:'hidden-command',input:{secret:true}}))}
 if(path.endsWith('/app-visibility'))return Promise.resolve(json({taskId:job,version:3,projectDeviceDetails:false,userSettings:false,userDetails:false}))
 throw new Error('未定义夹具，禁止网络回退 '+method+' '+path)
}
beforeEach(()=>{changeIdentity('fixture-never-sent');permissions();controlVersion=3;enabled=false;projectVersion=7;empty=false;fetcher.mockReset().mockImplementation(normal);vi.stubGlobal('fetch',fetcher)})
afterEach(()=>{wrapper?.unmount();document.body.innerHTML='';vi.unstubAllGlobals();session.user=null;changeIdentity()})
async function open(path:string){const router=createRouter({history:createMemoryHistory(),routes:ruleRoutes});await router.push(path);await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[ElementPlus,router]}});await flushPromises();return router}
function button(label:string){const node=Array.from(document.body.querySelectorAll('button')).find(x=>(x.textContent?.trim()===label||label==='运行'&&x.textContent?.trim()==='打开运行器'));if(!node)throw Error('missing '+label);return node}
const paths=()=>fetcher.mock.calls.map(([input])=>new URL(String(input),'http://fixture.test').pathname)
const writes=()=>fetcher.mock.calls.filter(([,init])=>init?.method && init.method!=='GET')
function pending(){let resolve!:(value:Response)=>void;const promise=new Promise<Response>(yes=>{resolve=yes});return{promise,resolve}}
it('正式项目路由读独立日志六列，query不授予内部能力或偷换全项目范围',async()=>{
 await open('/task-runs?internal=true&jobId='+other);expect(wrapper.findAll('th').map(n=>n.text())).toEqual(['任务名称','任务类型','来源','执行时间','下发设备数','下发方式']);expect(paths()).toEqual(['/api/v1/projects/p/task-debug-logs']);expect(new URL(String(fetcher.mock.calls[0][0]),'http://fixture.test').searchParams.has('jobId')).toBe(false);expect(wrapper.text()).toContain('任务甲');expect(wrapper.find('[aria-label="每页数量"]').exists()).toBe(false);expect(wrapper.find('.tl-pager__page').exists()).toBe(false);expect(wrapper.text()).not.toContain('hidden-command')
})
it('正式详情延迟到日志页签才读，调试token3不混任务定义9，关闭保留历史',async()=>{
 const router=await open(`/tasks/jobs/${job}`);expect(paths()).toEqual([`/api/v1/projects/p/task-jobs/${job}`,`/api/v1/projects/p/task-jobs/${job}/app-visibility`]);await router.push(`/tasks/jobs/${job}?tab=logs`);await flushPromises();expect(wrapper.findAll('th').map(n=>n.text())).toEqual(['来源','运行时间','运行设备数']);expect(paths()).toHaveLength(4);expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false');await wrapper.find('[role="switch"]').trigger('click');await flushPromises();expect(JSON.parse(String(writes()[0][1]!.body))).toEqual({expectedVersion:3,enabled:true});await wrapper.find('[role="switch"]').trigger('click');await flushPromises();expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false');expect(wrapper.text()).toContain('2026-10-24 08:00:00');expect(paths().some(path=>path.endsWith('/executions')||path.endsWith('/runs'))).toBe(false)
})
it('普通成员可读项目和任务日志，不能切开关/清空，缺少读取权限不发网络',async()=>{
 permissions(false);const router=await open('/task-runs');expect(wrapper.text()).toContain('任务甲');expect(button('清空').disabled).toBe(true);await router.push(`/tasks/jobs/${job}?tab=logs`);await flushPromises();expect(wrapper.find('[role="switch"]').attributes('aria-disabled')).toBe('true');expect(button('清空').disabled).toBe(true);permissions(false,false);await flushPromises();const calls=fetcher.mock.calls.length;await router.push('/task-runs');await flushPromises();expect(fetcher).toHaveBeenCalledTimes(calls);expect(wrapper.text()).toContain('读取权限');expect(writes()).toHaveLength(0)
})
it('项目清空使用项目token7，取消不写，成功后真实空读保留六列且无执行审计调用',async()=>{
 await open('/task-runs');button('清空').click();await flushPromises();button('取消').click();await flushPromises();expect(writes()).toHaveLength(0);button('清空').click();await flushPromises();button('确定').click();await flushPromises();expect(writes()).toHaveLength(1);const request=writes()[0];expect(new URL(String(request[0]),'http://fixture.test').searchParams.get('expectedVersion')).toBe('7');expect(request[1]!.body).toBeUndefined();expect(wrapper.text()).toContain('暂无日志');expect(wrapper.findAll('th')).toHaveLength(6);expect(paths().some(path=>path.endsWith('/executions'))).toBe(false)
})
it('撤管理权时仍可读，恢复管理后的自动GET保留在途写锁直到人工核对',async()=>{
 const wait=pending();fetcher.mockImplementation((input,init)=>init?.method==='PUT'?wait.promise:normal(input,init));await open(`/tasks/jobs/${job}?tab=logs`);await wrapper.find('[role="switch"]').trigger('click');await flushPromises();permissions(false);await flushPromises();expect(wrapper.text()).toContain('2026-10-24 08:00:00');controlVersion=4;enabled=true;wait.resolve(json({enabled,version:controlVersion,projectGeneration:1,jobGeneration:1}));await flushPromises();permissions();await flushPromises();expect(button('清空').disabled).toBe(true);button('重新读取核对').click();await flushPromises();expect(button('清空').disabled).toBe(false);expect(writes()).toHaveLength(1)
})
it.each([401,403,404])('日志写%s清整个父详情缓存与确认，不留旧授权任务名称/描述',async status=>{
 fetcher.mockImplementation((input,init)=>init?.method==='DELETE'?Promise.resolve(json({message:'当前任务不可管理'},status)):normal(input,init));await open(`/tasks/jobs/${job}?tab=logs`);button('清空').click();await flushPromises();button('确定').click();await flushPromises();expect(wrapper.text()).not.toContain('任务甲');expect(wrapper.text()).not.toContain('当前任务描述');expect(wrapper.text()).not.toContain('2026-10-24 08:00:00');expect(wrapper.text()).toContain(status===401?'读取权限':'当前任务不可管理');if(status===401)expect(session.user).toBeNull();expect(writes()).toHaveLength(1)
})
it('切任务后迟到写不能覆盖新控制或重读旧对象',async()=>{
 const wait=pending();fetcher.mockImplementation((input,init)=>init?.method==='PUT'?wait.promise:normal(input,init));const router=await open(`/tasks/jobs/${job}?tab=logs`);await wrapper.find('[role="switch"]').trigger('click');await flushPromises();await router.push(`/tasks/jobs/${other}?tab=logs`);await flushPromises();const calls=fetcher.mock.calls.length;wait.resolve(json({enabled:true,version:4,projectGeneration:1,jobGeneration:1}));await flushPromises();expect(wrapper.text()).toContain('任务乙');expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false');expect(fetcher).toHaveBeenCalledTimes(calls)
})
it('同任务切页签保留未知在途写锁，自动GET不能代替人工核对',async()=>{
 const wait=pending();fetcher.mockImplementation((input,init)=>init?.method==='PUT'?wait.promise:normal(input,init));const router=await open(`/tasks/jobs/${job}?tab=logs`);await wrapper.find('[role="switch"]').trigger('click');await flushPromises();await router.push(`/tasks/jobs/${job}?tab=settings`);await flushPromises();controlVersion=4;enabled=true;wait.resolve(json({enabled,version:4,projectGeneration:1,jobGeneration:1}));await flushPromises();await router.push(`/tasks/jobs/${job}?tab=logs`);await flushPromises();expect(button('清空').disabled).toBe(true);button('重新读取核对').click();await flushPromises();expect(button('清空').disabled).toBe(false);expect(writes()).toHaveLength(1)
})
it('元信息未找到或返回其它任务身份时，不发日志读取',async()=>{
 fetcher.mockImplementation(()=>Promise.resolve(json({message:'任务不存在'},404)));const router=await open(`/tasks/jobs/${job}?tab=logs`);expect(fetcher).toHaveBeenCalledTimes(1);expect(wrapper.text()).toContain('任务不存在');fetcher.mockImplementation(()=>Promise.resolve(json({id:job,name:'错误身份'})));await router.push(`/tasks/jobs/${other}?tab=logs`);await flushPromises();expect(fetcher).toHaveBeenCalledTimes(2);expect(wrapper.findAll('th')).toHaveLength(0);expect(wrapper.text()).toContain('任务返回身份不完整');expect(wrapper.text()).not.toContain('错误身份')
})
it('正式空日志1/2/3/2/1真实GET、无假游标，成功清空从当前页回1',async()=>{
 empty=true;await open('/task-runs');const previous=()=>document.body.querySelector<HTMLButtonElement>('button[aria-label="上一页"]')!,next=()=>document.body.querySelector<HTMLButtonElement>('button[aria-label="下一页"]')!;expect(previous().disabled).toBe(true);expect(next().disabled).toBe(false);next().click();await flushPromises();next().click();await flushPromises();previous().click();await flushPromises();previous().click();await flushPromises();expect(previous().disabled).toBe(true);expect(fetcher.mock.calls.map(([input])=>new URL(String(input),'http://fixture.test').searchParams.get('page'))).toEqual(['1','2','3','2','1']);next().click();await flushPromises();button('清空').click();await flushPromises();button('确定').click();await flushPromises();expect(new URL(String(fetcher.mock.calls.at(-1)![0]),'http://fixture.test').searchParams.get('page')).toBe('1');expect(previous().disabled).toBe(true);expect(writes()).toHaveLength(1)
})
it('当前页读取中切项目使旧页无效，新范围从1读且迟到旧数据不显示',async()=>{
 empty=true;const wait=pending();fetcher.mockImplementation((input,init)=>{const url=new URL(String(input),'http://fixture.test');if(url.pathname.includes('/projects/p/') && url.searchParams.get('page')==='2')return wait.promise;return normal(String(input).replace('/projects/q/','/projects/p/'),init)});await open('/task-runs');document.body.querySelector<HTMLButtonElement>('button[aria-label="下一页"]')!.click();await flushPromises();session.user={...session.user!,currentProjectId:'q'};await flushPromises();const latest=new URL(String(fetcher.mock.calls.at(-1)![0]),'http://fixture.test');expect(latest.pathname).toBe('/api/v1/projects/q/task-debug-logs');expect(latest.searchParams.get('page')).toBe('1');wait.resolve(json({items:[{...row(),jobName:'旧项目秘密'}],hasMore:false,nextCursor:null,projectVersion:7}));await flushPromises();expect(wrapper.text()).not.toContain('旧项目秘密');expect(writes()).toHaveLength(0)
})

it('日志在途和跨页签未知状态阻止父编辑/移除，人工日志核对后才恢复',async()=>{
 const wait=pending();fetcher.mockImplementation((input,init)=>init?.method==='PUT'?wait.promise:normal(input,init));const router=await open(`/tasks/jobs/${job}?tab=logs`);await wrapper.find('[role="switch"]').trigger('click');await flushPromises();expect(button('编辑').disabled).toBe(true);expect(button('运行').disabled).toBe(true);
 await router.push(`/tasks/jobs/${job}?tab=settings`);await flushPromises();expect(button('移除任务').disabled).toBe(true);expect(button('编辑').disabled).toBe(true);
 wait.resolve(json({message:'结果未知'},500));await flushPromises();expect(button('移除任务').disabled).toBe(true);await router.push(`/tasks/jobs/${job}?tab=logs`);await flushPromises();expect(button('编辑').disabled).toBe(true);fetcher.mockImplementation((input,init)=>String(input).endsWith('/debug-log-control') && (init?.method||'GET')==='GET'?Promise.resolve(json({message:'控制读取失败'},500)):normal(input,init));button('重新读取核对').click();await flushPromises();expect(button('编辑').disabled).toBe(true);fetcher.mockImplementation(normal);button('重新读取核对').click();await flushPromises();expect(button('编辑').disabled).toBe(false);expect(writes()).toHaveLength(1)
})
it('日志清空确认期间保护父编辑，取消后恢复且不产生写入',async()=>{
 await open(`/tasks/jobs/${job}?tab=logs`);button('清空').click();await flushPromises();expect(button('编辑').disabled).toBe(true);expect(button('运行').disabled).toBe(true);
 button('取消').click();await flushPromises();expect(button('编辑').disabled).toBe(false);expect(writes()).toHaveLength(0)
})
it('父信息编辑未结束时切入日志不读取或开放子写入口，取消后正常读取',async()=>{
 const router=await open(`/tasks/jobs/${job}`);button('编辑').click();await flushPromises();const calls=fetcher.mock.calls.length;await router.push(`/tasks/jobs/${job}?tab=logs`);await flushPromises();expect(fetcher).toHaveBeenCalledTimes(calls);button('取消').click();await flushPromises();expect(fetcher.mock.calls.length).toBeGreaterThan(calls);expect(button('清空').disabled).toBe(false);expect(writes()).toHaveLength(0)
})

it('旧对象人工核对的迟到完成不能解开新对象未知修改的锁',async()=>{
 const wait=pending();let oldReads=0;fetcher.mockImplementation((input,init)=>{const path=new URL(String(input),'http://fixture.test').pathname;if((init?.method||'GET')==='GET' && path.endsWith(`/task-jobs/${job}`) && ++oldReads===3)return wait.promise;if(init?.method==='PUT')return Promise.reject(new TypeError('隔离拒绝写入'));return normal(input,init)});
 const router=await open(`/tasks/jobs/${job}`);button('编辑').click();await flushPromises();button('保存').click();await flushPromises();button('取消').click();await flushPromises();expect(button('编辑').disabled).toBe(true);button('重新读取核对').click();await flushPromises();
 await router.push(`/tasks/jobs/${other}`);await flushPromises();button('编辑').click();await flushPromises();button('保存').click();await flushPromises();button('取消').click();await flushPromises();expect(button('编辑').disabled).toBe(true);
 const calls=fetcher.mock.calls.length;wait.resolve(json({id:job,name:'任务甲',version:9,status:'ACTIVE',targetType:'ALL_DEVICES',scheduleType:'CRON',timezone:'Asia/Shanghai',commandKey:'hidden-command',input:{}}));await flushPromises();expect(button('编辑').disabled).toBe(true);expect(fetcher).toHaveBeenCalledTimes(calls);expect(writes()).toHaveLength(2)
})

it('日志类型取冻结原执行类别，未知类型及未证数量方式保持破折号',async()=>{
 fetcher.mockImplementation((input,init)=>new URL(String(input),'http://fixture.test').pathname==='/api/v1/projects/p/task-debug-logs'?Promise.resolve(json({items:[{...row(),taskType:'CLOUD_UPDATE_FUNCTION'},{...row(),id:'00000000-0000-4000-8000-000000000056',taskType:'constructor'}],hasMore:false,nextCursor:null,projectVersion})):normal(input,init));
 await open('/task-runs');const cells=wrapper.findAll('tbody tr').map(tr=>tr.findAll('td').map(td=>td.text()));
 expect(cells.map(row=>row[1])).toEqual(['属性更新','—']);expect(cells.map(row=>row[2])).toEqual(['定时','定时']);expect(cells.every(row=>row[4]==='—'&&row[5]==='—')).toBe(true);expect(writes()).toHaveLength(0)
})
