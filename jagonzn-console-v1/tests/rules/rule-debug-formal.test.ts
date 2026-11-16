import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import ElementPlus from 'element-plus'
import { session } from '../../src/core/session'
import { changeIdentity } from '../../src/core/http'
import { ruleRoutes } from '../../src/features/rules/routes'
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
const rule='00000000-0000-4000-8000-000000000099',other='00000000-0000-4000-8000-000000000098',device='00000000-0000-4000-8000-000000000044'
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
let wrapper:ReturnType<typeof mount>, fetcher=vi.fn(), controlVersion=3, enabled=false, projectVersion=7, empty=false
function permissions(manage=true){session.user={...session.user!,currentProjectId:'p',permissions:manage?['rule:manage','rule:read','device:read']:['rule:read']}}
function normal(input:unknown,init:RequestInit={}){
 const url=new URL(String(input),'http://fixture.test'),path=url.pathname,method=init.method||'GET'
 const control=()=>({enabled,version:controlVersion,projectGeneration:1,ruleGeneration:1})
 if(method==='GET' && path==='/api/v1/projects/p/message-rule-debug-logs'){const id=url.searchParams.get('ruleId')||rule;return Promise.resolve(json({items:empty?[]:[{id:'00000000-0000-4000-8000-000000000055',ruleId:id,ruleName:id===rule?'规则甲':'规则乙',deviceId:device,deviceName:'设备甲',ruleType:null,sourceKind:'ACTION',operationType:'device-command',resultCode:'ACTION_COMMITTED',occurredAt:'2026-10-24T00:00:00Z',recordedAt:'2026-10-24T00:00:01Z'}],hasMore:false,nextCursor:null,projectVersion}))}
 if(path.endsWith('/debug-log-control')){if(method==='PUT'){const body=JSON.parse(String(init.body));enabled=body.enabled;controlVersion++}return Promise.resolve(json(control()))}
 if(method==='DELETE' && path.endsWith('/debug-logs')){empty=true;controlVersion++;return Promise.resolve(json(control()))}
 if(method==='DELETE' && path==='/api/v1/projects/p/message-rule-debug-logs'){empty=true;projectVersion++;return Promise.resolve(json({version:projectVersion}))}
 if(method==='GET' && path.endsWith('/version-history'))return Promise.resolve(json({items:[],nextCursor:null}))
 if(method==='GET' && [rule,other].some(id=>path===`/api/v1/projects/p/message-rules/${id}`)){const id=path.split('/').at(-1)!;return Promise.resolve(json({id,name:id===rule?'规则甲':'规则乙',description:'真实规则描述',version:9,status:'ACTIVE'}))}
 throw new Error('未定义夹具，禁止回退：'+method+' '+path)
}
beforeEach(()=>{controlVersion=3;enabled=false;projectVersion=7;empty=false;changeIdentity('fixture-token-never-sent');permissions();fetcher=vi.fn(normal);vi.stubGlobal('fetch',fetcher)})
afterEach(()=>{wrapper?.unmount();document.body.innerHTML='';session.user=null;vi.unstubAllGlobals();changeIdentity()})
async function open(path:string){const router=createRouter({history:createMemoryHistory(),routes:[...ruleRoutes,{path:'/devices/:deviceId',component:{template:'<p />'}}]});await router.push(path);await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[ElementPlus,router]}});await flushPromises();return router}
function button(label:string){const node=Array.from(document.body.querySelectorAll('button')).find(b=>b.textContent?.trim()===label);if(!node)throw Error('missing '+label);return node}
function writes(){return fetcher.mock.calls.filter(([,init])=>init?.method!=='GET')}
function paths(){return fetcher.mock.calls.map(([url])=>new URL(String(url),'http://fixture.test').pathname)}
function pending(){let resolve!:(value:Response)=>void;const promise=new Promise<Response>(yes=>{resolve=yes});return {promise,resolve}}
it('正式项目路由只读新缓冲并显示六列，query internal/ruleId不打开旧审计或改变全项目范围',async()=>{
 await open('/rules/executions?internal=true&ruleId='+other);expect(wrapper.findAll('th').map(n=>n.text())).toEqual(['设备名称','规则名称','规则类型','操作类型','执行时间','执行结果']);expect(paths()).toEqual(['/api/v1/projects/p/message-rule-debug-logs']);expect(new URL(String(fetcher.mock.calls[0][0]),'http://fixture.test').searchParams.has('ruleId')).toBe(false);expect(wrapper.text()).toContain('已提交');expect(wrapper.text()).not.toContain('尝试次数');expect(wrapper.find('[aria-label="每页数量"]').exists()).toBe(false);expect(wrapper.find('.tl-pager__page').exists()).toBe(false)
})
it('正式详情日志延迟到页签打开才读取，两套独立控制和规则CAS不混用',async()=>{
 const router=await open(`/rules/messages/${rule}`);expect(paths()).toEqual([`/api/v1/projects/p/message-rules/${rule}`,`/api/v1/projects/p/message-rules/${rule}/version-history`,`/api/v1/projects/p/message-rules/${rule}`]);await router.push(`/rules/messages/${rule}?tab=logs`);await flushPromises();expect(wrapper.findAll('th').map(n=>n.text())).toEqual(['设备名称','操作类型','执行时间','执行结果']);expect(paths()).toHaveLength(5);expect(wrapper.text()).not.toContain('查看执行记录');await wrapper.find('[role="switch"]').trigger('click');await flushPromises();expect(writes()).toHaveLength(1);expect(JSON.parse(String(writes()[0][1]!.body))).toEqual({expectedVersion:3,enabled:true});expect(wrapper.text()).toContain('设备甲');expect(paths().some(path=>path.includes('version-history'))).toBe(true);expect(paths().some(path=>path.includes('rule-executions'))).toBe(false)
})
it('项目清空确认使用项目version7，成功后真实读空仍保留六列表头且不碰旧执行',async()=>{
 await open('/rules/executions');button('清空').click();await flushPromises();expect(writes()).toHaveLength(0);button('确定').click();await flushPromises();expect(writes()).toHaveLength(1);expect(new URL(String(writes()[0][0]),'http://fixture.test').searchParams.get('expectedVersion')).toBe('7');expect(writes()[0][1]!.body).toBeUndefined();expect(wrapper.text()).toContain('暂无日志');expect(wrapper.findAll('th')).toHaveLength(6);expect(paths().filter(path=>path.includes('rule-executions'))).toHaveLength(0)
})
it('仅旧运行事实读取权限不能请求管理调试缓冲，旧审计也不作为正式回退',async()=>{
 permissions(false);await open('/rules/executions');expect(fetcher).not.toHaveBeenCalled();expect(wrapper.text()).toContain('读取权限');expect(button('清空').disabled).toBe(true)
})
it('真实父页撤权使日志容器离开后，恢复权限自动GET不能丢失在途写的核对锁',async()=>{
 const wait=pending();fetcher.mockImplementation((input,init)=>init?.method==='PUT'?wait.promise:normal(input,init));await open(`/rules/messages/${rule}?tab=logs`);await wrapper.find('[role="switch"]').trigger('click');await flushPromises();permissions(false);await flushPromises();expect(wrapper.text()).not.toContain('设备甲');controlVersion=4;enabled=true;wait.resolve(json({enabled,version:controlVersion,projectGeneration:1,ruleGeneration:1}));await flushPromises();permissions();await flushPromises();expect(button('清空').disabled).toBe(true);button('重新读取核对').click();await flushPromises();expect(button('清空').disabled).toBe(false);expect(writes()).toHaveLength(1)
})
it('日志写403清除整个正式详情缓存与确认，不继续展示之前授权读取的规则描述',async()=>{
 fetcher.mockImplementation((input,init)=>init?.method==='DELETE'?Promise.resolve(json({message:'当前角色无权管理'},403)):normal(input,init));await open(`/rules/messages/${rule}?tab=logs`);button('清空').click();await flushPromises();button('确定').click();await flushPromises();expect(wrapper.text()).not.toContain('设备甲');expect(wrapper.text()).not.toContain('规则甲');expect(wrapper.text()).toContain('当前角色无权管理');expect(writes()).toHaveLength(1)
})
it('切换规则后迟到写响应不能覆盖新控制或重读旧规则',async()=>{
 const wait=pending();fetcher.mockImplementation((input,init)=>init?.method==='PUT'?wait.promise:normal(input,init));const router=await open(`/rules/messages/${rule}?tab=logs`);await wrapper.find('[role="switch"]').trigger('click');await flushPromises();await router.push(`/rules/messages/${other}?tab=logs`);await flushPromises();const count=fetcher.mock.calls.length;wait.resolve(json({enabled:true,version:4,projectGeneration:1,ruleGeneration:1}));await flushPromises();expect(wrapper.text()).toContain('规则乙');expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false');expect(fetcher).toHaveBeenCalledTimes(count)
})
it('切换页签保留在途/未知写的核对锁，返回日志不因自动GET解锁',async()=>{
 const wait=pending();fetcher.mockImplementation((input,init)=>init?.method==='PUT'?wait.promise:normal(input,init));const router=await open(`/rules/messages/${rule}?tab=logs`);await wrapper.find('[role="switch"]').trigger('click');await flushPromises();await router.push(`/rules/messages/${rule}?tab=settings`);await flushPromises();controlVersion=4;enabled=true;wait.resolve(json({enabled,version:controlVersion,projectGeneration:1,ruleGeneration:1}));await flushPromises();await router.push(`/rules/messages/${rule}?tab=logs`);await flushPromises();expect(button('清空').disabled).toBe(true);button('重新读取核对').click();await flushPromises();expect(button('清空').disabled).toBe(false);expect(writes()).toHaveLength(1)
})
it('详情元信息未找到时不发任何调试读取或展示缓存',async()=>{
 fetcher.mockImplementation(()=>Promise.resolve(json({message:'规则不存在'},404)));await open(`/rules/messages/${rule}?tab=logs`);expect(fetcher).toHaveBeenCalledTimes(1);expect(wrapper.text()).toContain('规则不存在');expect(wrapper.text()).not.toContain('设备甲')
})
it('保留规则管理但撤销设备读取菜单权限时即时移除设备链接',async()=>{
 await open('/rules/executions');expect(wrapper.find(`a[href="/devices/${device}"]`).exists()).toBe(true);session.user={...session.user!,permissions:['rule:manage','rule:read']};await flushPromises();expect(wrapper.find(`a[href="/devices/${device}"]`).exists()).toBe(false);expect(wrapper.text()).toContain('设备甲');expect(fetcher).toHaveBeenCalledTimes(1)
})
it('正式项目空日志按page1/2/3/2/1发实际GET，下一页不受hasMorefalse限制',async()=>{
 empty=true;await open('/rules/executions');const previous=()=>document.body.querySelector<HTMLButtonElement>('button[aria-label="上一页"]')!,next=()=>document.body.querySelector<HTMLButtonElement>('button[aria-label="下一页"]')!;expect(previous().disabled).toBe(true);expect(next().disabled).toBe(false);next().click();await flushPromises();next().click();await flushPromises();previous().click();await flushPromises();expect(previous().disabled).toBe(false);previous().click();await flushPromises();expect(previous().disabled).toBe(true);expect(next().disabled).toBe(false);const requests=fetcher.mock.calls.map(([url])=>new URL(String(url),'http://fixture.test'));expect(requests.map(url=>url.searchParams.get('page'))).toEqual(['1','2','3','2','1']);expect(requests.every(url=>url.pathname.endsWith('/message-rule-debug-logs') && !url.searchParams.has('cursor'))).toBe(true);expect(writes()).toHaveLength(0);expect(wrapper.find('.tl-pager__page').exists()).toBe(false);expect(wrapper.find('[aria-label="每页数量"]').exists()).toBe(false)
})
it('正式空日志在page3清空成功重新请求page1，取消确认不写或改变当前位置',async()=>{
 empty=true;await open('/rules/executions');const next=()=>document.body.querySelector<HTMLButtonElement>('button[aria-label="下一页"]')!;next().click();await flushPromises();next().click();await flushPromises();button('清空').click();await flushPromises();button('取消').click();await flushPromises();expect(writes()).toHaveLength(0);expect(fetcher.mock.calls).toHaveLength(3);button('清空').click();await flushPromises();button('确定').click();await flushPromises();const gets=fetcher.mock.calls.filter(([,init])=>init?.method==='GET').map(([url])=>new URL(String(url),'http://fixture.test'));expect(gets.map(url=>url.searchParams.get('page'))).toEqual(['1','2','3','1']);expect(writes()).toHaveLength(1);expect(document.body.querySelector<HTMLButtonElement>('button[aria-label="上一页"]')!.disabled).toBe(true)
})
it('正式按页读取中切项目使旧页失效，新范围真实page1且迟到旧数据不显示',async()=>{
 empty=true;const wait=pending();fetcher.mockImplementation((input,init)=>{const url=new URL(String(input),'http://fixture.test');if(url.pathname.includes('/projects/p/') && url.searchParams.get('page')==='2')return wait.promise;return normal(String(input).replace('/projects/q/','/projects/p/'),init)});await open('/rules/executions');document.body.querySelector<HTMLButtonElement>('button[aria-label="下一页"]')!.click();await flushPromises();session.user={...session.user!,currentProjectId:'q'};await flushPromises();expect(new URL(String(fetcher.mock.calls.at(-1)![0]),'http://fixture.test').pathname).toBe('/api/v1/projects/q/message-rule-debug-logs');expect(new URL(String(fetcher.mock.calls.at(-1)![0]),'http://fixture.test').searchParams.get('page')).toBe('1');wait.resolve(json({items:[{id:'00000000-0000-4000-8000-000000000055',ruleId:rule,ruleName:'旧项目秘密',deviceId:null,deviceName:null,ruleType:null,sourceKind:'ATTEMPT',operationType:null,resultCode:'ENGINE_FAILURE',occurredAt:'2026-10-24T00:00:00Z',recordedAt:'2026-10-24T00:00:01Z'}],hasMore:false,nextCursor:null,projectVersion:7}));await flushPromises();expect(wrapper.text()).not.toContain('旧项目秘密');expect(document.body.querySelector<HTMLButtonElement>('button[aria-label="上一页"]')!.disabled).toBe(true);expect(writes()).toHaveLength(0)
})

it('日志在途和跨页签未知状态阻止父编辑/移除，人工日志核对后才恢复',async()=>{
 const wait=pending();fetcher.mockImplementation((input,init)=>init?.method==='PUT'?wait.promise:normal(input,init));const router=await open(`/rules/messages/${rule}?tab=logs`);await wrapper.find('[role="switch"]').trigger('click');await flushPromises();expect(button('编辑').disabled).toBe(true);
 await router.push(`/rules/messages/${rule}?tab=settings`);await flushPromises();expect(button('移除规则').disabled).toBe(true);expect(button('编辑').disabled).toBe(true);
 wait.resolve(json({message:'结果未知'},500));await flushPromises();expect(button('移除规则').disabled).toBe(true);await router.push(`/rules/messages/${rule}?tab=logs`);await flushPromises();expect(button('编辑').disabled).toBe(true);fetcher.mockImplementation((input,init)=>String(input).endsWith('/debug-log-control') && (init?.method||'GET')==='GET'?Promise.resolve(json({message:'控制读取失败'},500)):normal(input,init));button('重新读取核对').click();await flushPromises();expect(button('编辑').disabled).toBe(true);fetcher.mockImplementation(normal);button('重新读取核对').click();await flushPromises();expect(button('编辑').disabled).toBe(false);expect(writes()).toHaveLength(1)
})
it('日志清空确认期间保护父编辑，取消后恢复且不产生写入',async()=>{
 await open(`/rules/messages/${rule}?tab=logs`);button('清空').click();await flushPromises();expect(button('编辑').disabled).toBe(true);
 button('取消').click();await flushPromises();expect(button('编辑').disabled).toBe(false);expect(writes()).toHaveLength(0)
})
it('父信息编辑未结束时切入日志不读取或开放子写入口，取消后正常读取',async()=>{
 const router=await open(`/rules/messages/${rule}`);button('编辑').click();await flushPromises();const calls=fetcher.mock.calls.length;await router.push(`/rules/messages/${rule}?tab=logs`);await flushPromises();expect(fetcher).toHaveBeenCalledTimes(calls);button('取消').click();await flushPromises();expect(fetcher.mock.calls.length).toBeGreaterThan(calls);expect(button('清空').disabled).toBe(false);expect(writes()).toHaveLength(0)
})

it.each([
 null,
 {id:other,name:'错误规则秘密',version:9,status:'ACTIVE'},
 {id:rule,name:'错误规则秘密',version:0,status:'ACTIVE'},
 {id:rule,name:'错误规则秘密',version:-1,status:'ACTIVE'},
 {id:rule,name:'错误规则秘密',version:1.5,status:'ACTIVE'},
 {id:rule,name:'错误规则秘密',version:Number.MAX_SAFE_INTEGER,status:'ACTIVE'},
 {id:rule,name:'错误规则秘密',version:'9',status:'ACTIVE'},
 {id:rule,name:'错误规则秘密',version:9,status:'NEW_UNKNOWN_STATE'},
 {id:rule,name:'错误规则秘密',version:9},
])('父规则身份/版本/状态损坏时不显示错误对象或读取其日志 %#',async broken=>{
 fetcher.mockImplementation(()=>Promise.resolve(json(broken)));await open(`/rules/messages/${rule}?tab=logs`);expect(fetcher).toHaveBeenCalledTimes(1);expect(wrapper.text()).not.toContain('错误规则秘密');expect(wrapper.text()).toContain('规则返回身份、版本或状态不完整');expect(wrapper.find('[role="switch"]').exists()).toBe(false);expect(writes()).toHaveLength(0)
})
it('父定义错误后人工重试只采信匹配对象，恢复真实日志读取而不发写入',async()=>{
 fetcher.mockImplementationOnce(()=>Promise.resolve(json({id:other,name:'错误规则秘密',version:9,status:'ACTIVE'})));await open(`/rules/messages/${rule}?tab=logs`);expect(wrapper.text()).not.toContain('错误规则秘密');expect(fetcher).toHaveBeenCalledTimes(1);button('重新读取').click();await flushPromises();expect(wrapper.text()).toContain('规则甲');expect(wrapper.find('[role="switch"]').exists()).toBe(true);expect(writes()).toHaveLength(0)
})

it('旧对象人工核对的迟到完成不能解开新对象未知修改的锁',async()=>{
 const wait=pending();let oldReads=0;fetcher.mockImplementation((input,init)=>{const path=new URL(String(input),'http://fixture.test').pathname;if((init?.method||'GET')==='GET' && path.endsWith(`/message-rules/${rule}`) && ++oldReads===3)return wait.promise;if(init?.method==='PUT')return Promise.reject(new TypeError('隔离拒绝写入'));return normal(input,init)});
 const router=await open(`/rules/messages/${rule}`);button('编辑').click();await flushPromises();button('保存').click();await flushPromises();button('取消').click();await flushPromises();expect(button('编辑').disabled).toBe(true);button('重新读取核对').click();await flushPromises();
 await router.push(`/rules/messages/${other}`);await vi.waitFor(()=>expect(Array.from(document.body.querySelectorAll('button')).some(node=>node.textContent?.trim()==='编辑')).toBe(true));button('编辑').click();await flushPromises();button('保存').click();await flushPromises();button('取消').click();await flushPromises();expect(button('编辑').disabled).toBe(true);
 const calls=fetcher.mock.calls.length;wait.resolve(json({id:rule,name:'规则甲',version:9,status:'ACTIVE',targetType:'ALL_DEVICES',scheduleType:'CRON',timezone:'Asia/Shanghai',commandKey:'hidden-command',input:{}}));await flushPromises();expect(button('编辑').disabled).toBe(true);expect(fetcher).toHaveBeenCalledTimes(calls);expect(writes()).toHaveLength(2)
})
