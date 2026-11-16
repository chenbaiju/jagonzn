import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { ruleDebugLogTransport } from '../../src/features/rules/rule-debug-transport'
import { getConsoleRuleDebugLogs, setConsoleRuleDebugControl, clearConsoleRuleDebugLogs } from '../../src/features/rules/api'
import { changeIdentity } from '../../src/core/http'
import { session } from '../../src/core/session'
const rule='00000000-0000-4000-8000-000000000099',device='00000000-0000-4000-8000-000000000044',log='00000000-0000-4000-8000-000000000055'
const row={id:log,ruleId:rule,ruleName:'规则',deviceId:device,deviceName:'设备',ruleType:null,sourceKind:'ACTION',operationType:'device-command',resultCode:'ACTION_COMMITTED',occurredAt:'2026-10-24T00:00:00Z',recordedAt:'2026-10-24T00:00:01Z'}
const page={items:[row],hasMore:false,nextCursor:null,projectVersion:7},control={enabled:false,version:3,projectGeneration:1,ruleGeneration:1}
const fetcher=vi.fn(),response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
const signal=()=>new AbortController().signal
function request(index=0){const [url,init]=fetcher.mock.calls[index];return {url:new URL(url,'http://fixture.test'),init}}
beforeEach(()=>{changeIdentity('fixture-token-never-sent');session.user={currentProjectId:'p',permissions:['rule:manage','device:read']};fetcher.mockReset();vi.stubGlobal('fetch',fetcher)})
afterEach(()=>{vi.unstubAllGlobals();session.user=null;changeIdentity()})
it('493真实适配器读取独立日志路径，编码rule/cursor/24和取消信号，不调用不可变审计或设备补查',async()=>{
 fetcher.mockResolvedValue(response(page));const abort=new AbortController();const value=await ruleDebugLogTransport.readRows('p',rule,'opaque+/=&',abort.signal);const req=request();expect(req.url.pathname).toBe('/api/v1/projects/p/message-rule-debug-logs');expect(Object.fromEntries(req.url.searchParams)).toEqual({ruleId:rule,cursor:'opaque+/=&',limit:'24'});expect(req.init.method).toBe('GET');expect(req.init.body).toBeUndefined();expect(req.init.headers.get('Authorization')).toBe('Bearer fixture-token-never-sent');abort.abort();expect(req.init.signal.aborted).toBe(true);expect(value).toEqual({rows:[{key:log,deviceLabel:'设备',deviceHref:`/devices/${device}`,ruleLabel:'规则',ruleHref:`/rules/messages/${rule}`,typeLabel:'—',operationLabel:'下发命令',at:row.occurredAt,resultLabel:'已提交',failed:false}],clearToken:7,continuation:undefined});expect(fetcher).toHaveBeenCalledTimes(1)
})
it('正式page适配器按1/2/3/2/1发不同GET，空页不伪造cursor或hasMore并保留取消信号',async()=>{
 fetcher.mockImplementation(()=>Promise.resolve(response({...page,items:[]})));const controller=new AbortController();for(const number of [1,2,3,2,1]){const result=await ruleDebugLogTransport.readNumberedRows!('p',rule,number,controller.signal);expect(result.rows).toEqual([]);expect(result.continuation).toBeUndefined()};expect(fetcher.mock.calls.map(([url])=>Object.fromEntries(new URL(String(url),'http://fixture.test').searchParams))).toEqual([1,2,3,2,1].map(number=>({ruleId:rule,limit:'24',page:String(number)})));expect(fetcher.mock.calls.every(([,init])=>init.method==='GET' && init.body===undefined)).toBe(true);controller.abort();expect(request(4).init.signal.aborted).toBe(true)
})
it.each([0,-1,418,1.5,Number.MAX_SAFE_INTEGER])('非法实际page不发请求 %#',async(number)=>{
 await expect(ruleDebugLogTransport.readNumberedRows!('p',rule,number,signal())).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled()
})
it('page与cursor客户端也互斥，预算内末页417请求真实页号',async()=>{
 expect(()=>getConsoleRuleDebugLogs('p',rule,'opaque',signal(),1)).toThrow();expect(fetcher).not.toHaveBeenCalled();fetcher.mockResolvedValue(response({...page,items:[]}));await ruleDebugLogTransport.readNumberedRows!('p',rule,417,signal());expect(request().url.searchParams.get('page')).toBe('417');expect(request().url.searchParams.has('cursor')).toBe(false)
})
it('5个真实生成操作分别使用独立控制CAS和项目CAS，PUT只有必填二字段，DELETE无正文无自动幂等重放',async()=>{
 fetcher.mockResolvedValueOnce(response(control)).mockResolvedValueOnce(response({...control,enabled:true,version:4})).mockResolvedValueOnce(response({...control,version:4})).mockResolvedValueOnce(response({version:8}));expect(await ruleDebugLogTransport.readSwitch('p',rule,signal())).toEqual({checked:false,writeToken:3});await ruleDebugLogTransport.changeSwitch('p',rule,3,true);await ruleDebugLogTransport.eraseRule('p',rule,3);expect(await ruleDebugLogTransport.eraseProject('p',7)).toBe(8);expect(request().url.pathname).toBe(`/api/v1/projects/p/message-rules/${rule}/debug-log-control`);const put=request(1);expect(put.init.method).toBe('PUT');expect(JSON.parse(put.init.body)).toEqual({expectedVersion:3,enabled:true});expect(put.init.headers.get('Idempotency-Key')).toBeNull();const clear=request(2);expect(clear.url.pathname).toBe(`/api/v1/projects/p/message-rules/${rule}/debug-logs`);expect(Object.fromEntries(clear.url.searchParams)).toEqual({expectedVersion:'3'});expect(clear.init.method).toBe('DELETE');expect(clear.init.body).toBeUndefined();const project=request(3);expect(project.url.pathname).toBe('/api/v1/projects/p/message-rule-debug-logs');expect(Object.fromEntries(project.url.searchParams)).toEqual({expectedVersion:'7'});expect(project.init.method).toBe('DELETE');expect(project.init.body).toBeUndefined()
})
it('失败尝试显示业务失败标签，未知规则/操作类型不补猜，动作提交不冒设备ACK',async()=>{
 fetcher.mockResolvedValue(response({...page,items:[{...row,sourceKind:'ATTEMPT',operationType:null,resultCode:'ENGINE_FAILURE',ruleType:'PROPERTY_REPORT'}]}));const value=await ruleDebugLogTransport.readRows('p',rule,undefined,signal());expect(value.rows[0]).toMatchObject({resultLabel:'执行失败',failed:true,typeLabel:'—',operationLabel:'—'});expect(value.rows[0]).not.toHaveProperty('resultCode');expect(value.rows[0]).not.toHaveProperty('recordedAt');fetcher.mockResolvedValue(response({...page,items:[{...row,sourceKind:'FUTURE',operationType:'future-operation'}]}));expect((await ruleDebugLogTransport.readRows('p',rule,undefined,signal())).rows[0]).toMatchObject({resultLabel:'—',operationLabel:'—'})
})
it('已删设备名称空仍保留真实UUID但无假链接；无device读取权限不输出设备链接',async()=>{
 fetcher.mockResolvedValueOnce(response({...page,items:[{...row,deviceName:null}]}));expect((await ruleDebugLogTransport.readRows('p',rule,undefined,signal())).rows[0]).toMatchObject({deviceLabel:device,deviceHref:undefined});session.user={...session.user!,permissions:['rule:manage']};fetcher.mockResolvedValue(response(page));expect((await ruleDebugLogTransport.readRows('p',rule,undefined,signal())).rows[0].deviceHref).toBeUndefined()
})
it('来源没有设备时接受真实null并显示未知，不从规则定义伪造设备',async()=>{
 fetcher.mockResolvedValue(response({...page,items:[{...row,deviceId:null,deviceName:null,sourceKind:'ATTEMPT',operationType:null,resultCode:'ENGINE_FAILURE'}]}));expect((await ruleDebugLogTransport.readRows('p',rule,undefined,signal())).rows[0]).toMatchObject({deviceLabel:'—',deviceHref:undefined,resultLabel:'执行失败',failed:true});expect(fetcher).toHaveBeenCalledTimes(1)
})
it.each([null,{}, {...page,items:null},{...page,hasMore:true},{...page,items:[],hasMore:true,nextCursor:'next'}, {...page,nextCursor:123},{...page,hasMore:true,nextCursor:'x'.repeat(8193)}, {...page,projectVersion:Number.MAX_SAFE_INTEGER}, {...page,items:[row,row]}, {...page,items:[{...row,id:'bad'}]}, {...page,items:[{...row,ruleId:'00000000-0000-4000-8000-000000000098'}]}, {...page,items:[{...row,deviceId:'bad'}]}, {...page,items:[{...row,deviceId:null,deviceName:'伪造名字'}]}, {...page,items:[{...row,occurredAt:'2026-10-24 08:00:00'}]}, {...page,items:[{...row,resultCode:'secret exception body'}]}])('坏页/跨规则行拒绝整体，不变成空页或部分成功 %#',async(value)=>{
 fetcher.mockResolvedValue(response(value));await expect(ruleDebugLogTransport.readRows('p',rule,undefined,signal())).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);expect(request().url.pathname).toContain('/message-rule-debug-logs')
})
it.each([null,{...control,enabled:null},{...control,version:0},{...control,projectGeneration:0},{...control,ruleGeneration:1.5}])('坏控制读取不伪造off或CAS %#',async(value)=>{
 fetcher.mockResolvedValue(response(value));await expect(ruleDebugLogTransport.readSwitch('p',rule,signal())).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1)
})
it('项目清空坏2xx响应仍失败，不能当已清空',async()=>{fetcher.mockResolvedValue(response(null));await expect(ruleDebugLogTransport.eraseProject('p',7)).rejects.toThrow('返回格式不完整');expect(fetcher).toHaveBeenCalledTimes(1)})
it('409和网络未知保留错误且只发一次，不回退不可变日志或补发写入',async()=>{
 fetcher.mockResolvedValueOnce(response({code:10009,message:'已变化'},409));await expect(ruleDebugLogTransport.eraseRule('p',rule,3)).rejects.toMatchObject({status:409});expect(fetcher).toHaveBeenCalledTimes(1);fetcher.mockReset().mockRejectedValueOnce(new TypeError('fixture network lost'));await expect(ruleDebugLogTransport.changeSwitch('p',rule,3,true)).rejects.toMatchObject({outcomeUnknown:true,status:0});expect(fetcher).toHaveBeenCalledTimes(1)
})
it('非法CAS和超长游标在HTTP前拒绝',()=>{
 expect(()=>setConsoleRuleDebugControl('p',rule,0,true)).toThrow('版本');expect(()=>clearConsoleRuleDebugLogs('p',rule,Number.MAX_SAFE_INTEGER)).toThrow('版本');expect(()=>getConsoleRuleDebugLogs('p',rule,'x'.repeat(8193))).toThrow('游标');expect(fetcher).not.toHaveBeenCalled()
})

it('已知六类规则复用目录名称，未知空值及原型键仍显示破折号且不补查',async()=>{
 const names=['属性上报预处理','属性上报','属性下发预处理','属性下发','事件上报','自定义上报'],kinds=['ATTRS_RPT_PREPROC','ATTRS_RPT','ATTRS_PUSH_PREPROC','ATTRS_PUSH','EVENT_RPT','DATA_RPT',null,'FUTURE_KIND','toString','__proto__'];fetcher.mockResolvedValue(response({...page,items:kinds.map((ruleType,index)=>({...row,id:'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),ruleType}))}));const value=await ruleDebugLogTransport.readRows('p',undefined,undefined,signal());expect(value.rows.map(item=>item.typeLabel)).toEqual([...names,'—','—','—','—']);expect(fetcher).toHaveBeenCalledTimes(1);expect(request().url.pathname).toBe('/api/v1/projects/p/message-rule-debug-logs');expect(value.rows.every(item=>item.operationLabel==='下发命令'&&item.resultLabel==='已提交')).toBe(true)
})

it('URL真实动作诊断区分已发送、拒绝与未知，未知不冒成功或补发请求',async()=>{
 const codes=['URL_ACCEPTED','URL_REFUSED','URL_UNKNOWN','URL_REJECTED']
 fetcher.mockResolvedValue(response({...page,items:codes.map((resultCode,index)=>({...row,id:'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),operationType:'external-url-forward',resultCode}))}))
 const value=await ruleDebugLogTransport.readRows('p',rule,undefined,signal())
 expect(value.rows.map(item=>[item.operationLabel,item.resultLabel,item.failed,item.failureCode])).toEqual([
  ['转发到 URL','已发送',false,undefined],['转发到 URL','发送失败',true,'URL_REFUSED'],['转发到 URL','结果未知',false,undefined],['转发到 URL','未发送',true,'URL_REJECTED'],
 ])
 expect(value.rows.every(item=>item.deviceHref===`/devices/${device}`&&item.ruleHref===`/rules/messages/${rule}`)).toBe(true)
 expect(fetcher).toHaveBeenCalledTimes(1);expect(request().init.method).toBe('GET');expect(request().init.body).toBeUndefined()
})

it('MQTT真实动作诊断保持Broker受理、拒绝和未知，不补发请求',async()=>{
 const codes=['MQTT_ACCEPTED','MQTT_REFUSED','MQTT_UNKNOWN','MQTT_REJECTED']
 fetcher.mockResolvedValue(response({...page,items:codes.map((resultCode,index)=>({...row,id:'00000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),operationType:'external-mqtt-forward',resultCode}))}))
 const value=await ruleDebugLogTransport.readRows('p',rule,undefined,signal())
 expect(value.rows.map(item=>[item.operationLabel,item.resultLabel,item.failed,item.failureCode])).toEqual([
  ['转发到 MQTT','已发送',false,undefined],['转发到 MQTT','发送失败',true,'MQTT_REFUSED'],['转发到 MQTT','结果未知',false,undefined],['转发到 MQTT','未发送',true,'MQTT_REJECTED'],
 ])
 expect(fetcher).toHaveBeenCalledTimes(1);expect(request().init.method).toBe('GET');expect(request().init.body).toBeUndefined()
})
