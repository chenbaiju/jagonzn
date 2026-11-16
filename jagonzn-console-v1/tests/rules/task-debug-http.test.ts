import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { taskDebugLogTransport } from '../../src/features/rules/task-debug-transport'
import { getConsoleTaskDebugLogs, setConsoleTaskDebugControl, clearConsoleTaskDebugLogs } from '../../src/features/rules/api'
import { changeIdentity } from '../../src/core/http'
import { session } from '../../src/core/session'
const job='00000000-0000-4000-8000-000000000099',log='00000000-0000-4000-8000-000000000055'
const row={id:log,jobId:job,jobName:'任务',definitionVersion:9,triggerType:'SCHEDULE',executionStartedAt:'2026-10-24T00:00:00Z',recordedAt:'2026-10-24T00:00:01Z',taskType:null,deliveryMethod:null,terminalStatus:null,totalTargets:null,acceptedTargets:null,succeededTargets:null,failedTargets:null,skippedTargets:null,finishedAt:null}
const page={items:[row],hasMore:false,nextCursor:null,projectVersion:7},control={enabled:false,version:3,projectGeneration:1,jobGeneration:1}
const fetcher=vi.fn(),response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
const signal=()=>new AbortController().signal
function request(index=0){const [url,init]=fetcher.mock.calls[index];return {url:new URL(url,'http://fixture.test'),init}}
beforeEach(()=>{changeIdentity('fixture-token-never-sent');session.user={currentProjectId:'p',permissions:['task:read','task:manage']};fetcher.mockReset();vi.stubGlobal('fetch',fetcher)})
afterEach(()=>{vi.unstubAllGlobals();session.user=null;changeIdentity()})
it('正式517适配器只读独立缓冲，按1/2/3/2/1传页号和取消信号，不读不可变执行',async()=>{
 fetcher.mockImplementation(()=>Promise.resolve(response(page)));const abort=new AbortController();for(const number of [1,2,3,2,1])expect((await taskDebugLogTransport.readRows('p',job,number,abort.signal)).rows[0]).toEqual({key:log,taskLabel:'任务',taskHref:`/tasks/jobs/${job}`,typeLabel:'—',sourceLabel:'定时',at:row.executionStartedAt,countLabel:'—',deliveryLabel:'—'});expect(fetcher.mock.calls.map(([url])=>Object.fromEntries(new URL(String(url),'http://fixture.test').searchParams))).toEqual([1,2,3,2,1].map(page=>({jobId:job,limit:'24',page:String(page)})));expect(request().url.pathname).toBe('/api/v1/projects/p/task-debug-logs');expect(request().init.headers.get('Authorization')).toBe('Bearer fixture-token-never-sent');abort.abort();expect(request(4).init.signal.aborted).toBe(true);expect(fetcher.mock.calls.every(([,init])=>init.method==='GET' && init.body===undefined)).toBe(true)
})
it('五正式操作使用独立管理CAS，PUT只有必填二字段，DELETE无正文且不自动重放',async()=>{
 fetcher.mockResolvedValueOnce(response(control)).mockResolvedValueOnce(response({...control,enabled:true,version:4})).mockResolvedValueOnce(response({...control,version:4})).mockResolvedValueOnce(response({version:8}));expect(await taskDebugLogTransport.readSwitch('p',job,signal())).toEqual({checked:false,writeToken:3});await taskDebugLogTransport.changeSwitch('p',job,3,true);await taskDebugLogTransport.eraseTask('p',job,3);expect(await taskDebugLogTransport.eraseProject('p',7)).toBe(8);expect(request().url.pathname).toBe(`/api/v1/projects/p/task-jobs/${job}/debug-log-control`);expect(request(1).init.method).toBe('PUT');expect(JSON.parse(request(1).init.body)).toEqual({expectedVersion:3,enabled:true});expect(request(1).init.headers.get('Idempotency-Key')).toBeNull();expect(request(2).url.pathname).toBe(`/api/v1/projects/p/task-jobs/${job}/debug-logs`);expect(request(2).url.searchParams.get('expectedVersion')).toBe('3');expect(request(3).url.pathname).toBe('/api/v1/projects/p/task-debug-logs');expect(request(3).url.searchParams.get('expectedVersion')).toBe('7');expect([request(2),request(3)].every(r=>r.init.method==='DELETE' && r.init.body===undefined)).toBe(true)
})
it('真实终态零或正数汇总不直接变成Source运行设备数，MANUAL也不猜任务类型/下发方式',async()=>{
 fetcher.mockResolvedValueOnce(response({...page,items:[{...row,terminalStatus:'FAILED',totalTargets:0,acceptedTargets:0,succeededTargets:0,failedTargets:0,skippedTargets:0,finishedAt:'2026-10-24T00:00:02Z'}]}));expect((await taskDebugLogTransport.readRows('p',job,1,signal())).rows[0].countLabel).toBe('—');fetcher.mockResolvedValue(response({...page,items:[{...row,triggerType:'MANUAL',terminalStatus:'PARTIAL_FAILED',totalTargets:3,acceptedTargets:2,succeededTargets:1,failedTargets:1,skippedTargets:1,finishedAt:'2026-10-24T00:00:02Z',taskType:'future',deliveryMethod:'future'}]}));const value=await taskDebugLogTransport.readRows('p',job,1,signal());expect(value.rows[0]).toMatchObject({typeLabel:'—',countLabel:'—',deliveryLabel:'—'});expect(value.rows[0]).not.toHaveProperty('acceptedTargets');expect(value.rows[0]).not.toHaveProperty('terminalStatus')
})
it('普通成员有链接，撤去读取权限后投影不生成越权任务链接',async()=>{
 session.user={...session.user!,permissions:['task:read']};fetcher.mockImplementation(()=>Promise.resolve(response(page)));expect((await taskDebugLogTransport.readRows('p',undefined,1,signal())).rows[0].taskHref).toBe(`/tasks/jobs/${job}`);session.user={...session.user!,permissions:[]};expect((await taskDebugLogTransport.readRows('p',undefined,1,signal())).rows[0].taskHref).toBeUndefined()
})
it('仅用真实DATA冻结配置显示推送方式，其它类型或未知协议保持未知',async()=>{
 for(const [taskType,deliveryMethod,label] of [
  ['DATA_DOWNLINK','MQTT','MQTT'],['DATA_DOWNLINK_FUNCTION','TCP','TCP'],
  ['COMMAND','TCP','—'],['PROPERTY_SET','MQTT','—'],['future','MQTT','—'],
  ['DATA_DOWNLINK','future','—'],['DATA_DOWNLINK',null,'—'],[null,'TCP','—'],
 ]){
  fetcher.mockResolvedValueOnce(response({...page,items:[{...row,taskType,deliveryMethod}]}))
  expect((await taskDebugLogTransport.readRows('p',job,1,signal())).rows[0].deliveryLabel).toBe(label)
 }
})
it.each([null,{}, {...page,items:null},{...page,hasMore:true},{...page,items:[],hasMore:true,nextCursor:'next'},{...page,nextCursor:123},{...page,hasMore:true,nextCursor:'x'.repeat(2049)},{...page,projectVersion:Number.MAX_SAFE_INTEGER},{...page,items:[row,row]},{...page,items:[{...row,id:'bad'}]},{...page,items:[{...row,jobId:'00000000-0000-4000-8000-000000000098'}]},{...page,items:[{...row,jobName:' '}]},{...page,items:[{...row,executionStartedAt:'2026-10-24 08:00:00'}]},{...page,items:[{...row,triggerType:'exception body'}]},{...page,items:[{...row,definitionVersion:0}]},{...page,items:[{...row,totalTargets:0}]},{...page,items:[{...row,terminalStatus:'FAILED'}]},{...page,items:[{...row,terminalStatus:'future',totalTargets:0,acceptedTargets:0,succeededTargets:0,failedTargets:0,skippedTargets:0,finishedAt:'2026-10-24T00:00:02Z'}]}])('坏页或跨任务行整体拒绝，不降级空日志 %#',async(value)=>{
 fetcher.mockResolvedValue(response(value));await expect(taskDebugLogTransport.readRows('p',job,1,signal())).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1)
})
it.each([-1,1.5,2147483648,null])('终态非法计数整体拒绝 %#',async(number)=>{
 fetcher.mockResolvedValue(response({...page,items:[{...row,terminalStatus:'FAILED',totalTargets:number,acceptedTargets:0,succeededTargets:0,failedTargets:0,skippedTargets:0,finishedAt:'2026-10-24T00:00:02Z'}]}));await expect(taskDebugLogTransport.readRows('p',job,1,signal())).rejects.toThrow()
})
it.each([0,-1,418,1.5,Number.MAX_SAFE_INTEGER])('非法有界page在网络前拒绝 %#',async(number)=>{
 await expect(taskDebugLogTransport.readRows('p',job,number,signal())).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled()
})
it.each([null,{...control,enabled:null},{...control,jobGeneration:0},{...control,projectGeneration:Number.MAX_SAFE_INTEGER+1},{...control,version:Number.MAX_SAFE_INTEGER}])('坏控制响应拒绝，不推断off %#',async(value)=>{
 fetcher.mockResolvedValue(response(value));await expect(taskDebugLogTransport.readSwitch('p',job,signal())).rejects.toThrow()
})
it('cursor与page互斥，长度2048和末页417按正式合同；非法CAS或布尔值无网络',async()=>{
 expect(()=>getConsoleTaskDebugLogs('p',job,'cursor',signal(),1)).toThrow();expect(()=>getConsoleTaskDebugLogs('p',job,'x'.repeat(2049))).toThrow();expect(()=>setConsoleTaskDebugControl('p',job,0,true)).toThrow();expect(()=>setConsoleTaskDebugControl('p',job,3,'true' as unknown as boolean)).toThrow();expect(()=>clearConsoleTaskDebugLogs('p',job,Number.MAX_SAFE_INTEGER)).toThrow();expect(fetcher).not.toHaveBeenCalled();fetcher.mockImplementation(()=>Promise.resolve(response({...page,items:[]})));await getConsoleTaskDebugLogs('p',undefined,'x'.repeat(2048),signal());expect(request().url.searchParams.get('cursor')).toHaveLength(2048);await taskDebugLogTransport.readRows('p',undefined,417,signal());expect(request(1).url.searchParams.get('page')).toBe('417')
})
it('409与传输中断各发一次，不降级到永久执行或自动重放',async()=>{
 fetcher.mockResolvedValueOnce(response({message:'状态已变化'},409));await expect(taskDebugLogTransport.eraseTask('p',job,3)).rejects.toMatchObject({status:409});expect(fetcher).toHaveBeenCalledTimes(1);fetcher.mockReset().mockRejectedValueOnce(new TypeError('fixture network lost'));await expect(taskDebugLogTransport.changeSwitch('p',job,3,true)).rejects.toMatchObject({outcomeUnknown:true,status:0});expect(fetcher).toHaveBeenCalledTimes(1)
})
