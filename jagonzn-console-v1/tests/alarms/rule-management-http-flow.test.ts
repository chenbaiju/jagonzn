import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {changeIdentity,IdentityChanged,setAccessToken} from '../../src/core/http'
import {alarmRuleManagementApi} from '../../src/features/alarms/alarm-rule-management-api'
import {AlarmRuleJsonNumber} from '../../src/features/alarms/alarm-rule-json'
import {exactThreshold,managementProject,managementResponse,managementRule} from './rule-management-fixture'
beforeEach(()=>setAccessToken('bounded-test-token'))
afterEach(()=>{vi.unstubAllGlobals();changeIdentity()})
describe('真实HTTP封装与配置客户端的内存fetch接线',()=>{
 it('GET文本→编辑名称→PUT原始JSON→GET精确回读，普通JSON负对照确实丢精度',async()=>{
  let version=0;const writes:string[]=[]
  const fetch=vi.fn(async(url:URL,options:RequestInit)=>{expect(url.pathname).toBe(`/api/v1/projects/${managementProject}/console/alarm-rules/${managementRule}`);expect(new Headers(options.headers).get('Authorization')).toBe('Bearer bounded-test-token');if(options.method==='PUT'){writes.push(String(options.body));expect(new Headers(options.headers).get('Content-Type')).toBe('application/json');version++}return new Response(managementResponse(version),{status:200,headers:{'Content-Type':'application/json'}})})
  vi.stubGlobal('fetch',fetch)
  const initial=await alarmRuleManagementApi.get(managementProject,managementRule)
  const saved=await alarmRuleManagementApi.update(managementProject,managementRule,{version:initial.version,name:'更新名称',enabled:initial.enabled,configuration:initial.configuration})
  const fresh=await alarmRuleManagementApi.get(managementProject,managementRule)
  expect(saved.version).toBe(1);expect(fresh.version).toBe(1);expect(writes).toHaveLength(1);expect(writes[0]).toContain(`"value":${exactThreshold}`);expect(fresh.configuration.expression.terms[0]!.value).toEqual({kind:'CONSTANT',value:new AlarmRuleJsonNumber(exactThreshold)})
  expect(JSON.stringify(JSON.parse(managementResponse()))).not.toContain(exactThreshold);expect(fetch).toHaveBeenCalledTimes(3)
 })
 it('写响应传输损坏/超预算一律结果未知，并且没有刷新或自动重放',async()=>{for(const body of [new Uint8Array([0xc3,0x28]),new Uint8Array(98305)]){const fetch=vi.fn().mockResolvedValue(new Response(body,{status:200}));vi.stubGlobal('fetch',fetch);await expect(alarmRuleManagementApi.setEnabled(managementProject,managementRule,{version:0,enabled:true})).rejects.toMatchObject({outcomeUnknown:true});expect(fetch).toHaveBeenCalledTimes(1)}})
 it('写500保留服务失败与结果未知，写409为确定冲突，均不重放',async()=>{for(const status of [500,409]){const fetch=vi.fn().mockResolvedValue(new Response('{"message":"实际服务拒绝"}',{status}));vi.stubGlobal('fetch',fetch);await expect(alarmRuleManagementApi.remove(managementProject,managementRule,{version:0})).rejects.toMatchObject({status,message:'实际服务拒绝',outcomeUnknown:status===500});expect(fetch).toHaveBeenCalledTimes(1)}})
 it('身份切换使迟到完整响应失效，不能成为新页面资料',async()=>{let finish!:(response:Response)=>void;vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve})));const pending=alarmRuleManagementApi.get(managementProject,managementRule);changeIdentity('new-test-token');finish(new Response(managementResponse()));await expect(pending).rejects.toBeInstanceOf(IdentityChanged)})
})
