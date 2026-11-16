import {describe,it,expect} from 'vitest'
import {decodeCommandPage,decodeCommandDetail} from '../../src/features/devices/command-records-api'
const device='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002'
const encode=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
const item=()=>({id,deviceId:device,operationType:'COMMAND',commandKey:'reboot',status:'ACCEPTED',attemptCount:1,maxAttempts:3,acceptedAt:'2026-10-24T01:00:00Z',completedAt:null,dispatchedAt:null,repliedAt:null,currentDefinitionName:null})
const row=()=>decodeCommandPage(encode({items:[item()],nextCursor:null,hasMore:false}),device,24).items[0]!
const response=()=>({id,deviceId:device,connectionDeviceId:device,commandKey:'reboot',input:{},output:null,status:'ACCEPTED',attemptCount:1,maxAttempts:3,timeoutSeconds:30,failureCode:null,failureMessage:null,acceptedAt:'2026-10-24T01:00:00Z',dispatchedAt:null,repliedAt:null,acknowledgedAt:null,completedAt:null,attempts:[],currentDefinitionName:null})
describe('命令记录原字节读取',()=>{
 it('保留输入与回复的大整数/小数/指数及嵌套数组，转义内容仅作文本',()=>{
  const body=JSON.stringify(response()).replace('"input":{}','"input":{"n":9007199254740993,"v":[0.1234567890123456789,1e200,{"type":"JSON_NUMBER","lexical":"7","html":"<img src=x onerror=alert(1)>"}]}').replace('"output":null','"output":{"n":9007199254740995}')
  const result=decodeCommandDetail(new TextEncoder().encode(body),row())
  expect(result.inputText).toContain('9007199254740993');expect(result.inputText).toContain('0.1234567890123456789');expect(result.inputText).toContain('1e200');expect(result.inputText).toContain('"type": "JSON_NUMBER"');expect(result.outputText).toContain('9007199254740995')
 })
 it('整页拒绝串设备、重复ID、未知状态、非法数字计数与游标错配',()=>{
  const good={items:[item()],nextCursor:null,hasMore:false}
  for(const bad of [{...good,items:[{...item(),deviceId:id}]},{...good,items:[item(),item()]},{...good,items:[{...item(),status:'DONE'}]},{...good,items:[{...item(),attemptCount:4}]},{...good,items:[{...item(),attemptCount:'1'}]},{...good,hasMore:true},{...good,nextCursor:'next'},{...good,items:[{...item(),acceptedAt:'2026-02-30T00:00:00Z'}]}])expect(()=>decodeCommandPage(encode(bad),device,24)).toThrow()
 })
 it('终态可比摘要更新，但详情身份/命令键不得漂移，尝试序号不得重复',()=>{
  const result=decodeCommandDetail(encode({...response(),status:'FAILED',completedAt:'2026-10-24T01:00:10Z',failureCode:'DISPATCH_RETRY_EXHAUSTED'}),row())
  expect(result.status).toBe('FAILED');expect(result.acknowledgedAt).toBeNull();expect(result.outputText).toBeNull()
  const attempt={id,attemptNo:1,status:'PENDING',createdAt:'2026-10-24T01:00:00Z',deadlineAt:null,topic:null}
  for(const bad of [{...response(),id:device},{...response(),deviceId:id},{...response(),commandKey:'other'},{...response(),input:null},{...response(),attempts:[attempt,{...attempt,id:device}]},{...response(),attempts:[{...attempt,attemptNo:2}]},{...response(),attempts:[{...attempt,status:'DONE'}]}])expect(()=>decodeCommandDetail(encode(bad),row())).toThrow()
 })
 it('属性下发保持无命令键，拒绝伪装成模型命令',()=>{
  const property={...item(),operationType:'PROPERTY_SET',commandKey:null}
  const r=decodeCommandPage(encode({items:[property],nextCursor:null,hasMore:false}),device,24).items[0]!
  expect(decodeCommandDetail(encode({...response(),commandKey:null,input:{temperature:1}}),r).commandKey).toBeNull()
  expect(()=>decodeCommandPage(encode({items:[{...property,commandKey:'fake'}],nextCursor:null,hasMore:false}),device,24)).toThrow()
 })
 it('重复键/转义同键/无效UTF8/BOM/超预算/过深原文不进入展示',()=>{
  const body=JSON.stringify(response())
  for(const bad of [new TextEncoder().encode(body.replace('"input":{}','"input":{"n":1,"\\u006e":2}')),new TextEncoder().encode(body.replace('"input":{}','"input":{"n":1e400}')),new Uint8Array([0xff]),new Uint8Array([0xef,0xbb,0xbf,...encode(response())]),new TextEncoder().encode(' '.repeat(4*1024*1024+1)),new TextEncoder().encode(body.replace('"input":{}','"input":'+('{"a":'.repeat(17)+'{}'+'}'.repeat(17))))])expect(()=>decodeCommandDetail(bad,row())).toThrow()
 })
 it('名称明确为当前定义名，详情允许同原命令在列表后改名，null不从键补值',()=>{
  const summary=decodeCommandPage(encode({items:[{...item(),currentDefinitionName:'列表时当前名称'}],nextCursor:null,hasMore:false}),device,24).items[0]!
  expect(summary.currentDefinitionName).toBe('列表时当前名称');expect(decodeCommandDetail(encode({...response(),currentDefinitionName:'稍后当前名称'}),summary).currentDefinitionName).toBe('稍后当前名称');expect(row().currentDefinitionName).toBeNull()
 })
 it('当前名必须显式null或有效有界字符串，属性设置不能冒出命令定义名',()=>{
  const missing={...item()} as Record<string,unknown>;delete missing.currentDefinitionName
  for(const value of [missing,...[undefined,1,'','  ','名'.repeat(129)].map(currentDefinitionName=>({...item(),currentDefinitionName}))])expect(()=>decodeCommandPage(encode({items:[value],nextCursor:null,hasMore:false}),device,24)).toThrow()
  for(const currentDefinitionName of [undefined,false,'','名'.repeat(129)])expect(()=>decodeCommandDetail(encode({...response(),currentDefinitionName}),row())).toThrow()
  expect(()=>decodeCommandPage(encode({items:[{...item(),operationType:'PROPERTY_SET',commandKey:null,currentDefinitionName:'假名称'}],nextCursor:null,hasMore:false}),device,24)).toThrow()
 })
 it('发布及最终回复时钟保留精确原文；回复早于发布确认或超时后收到均不按状态改写',()=>{
  const dispatchedAt='2026-10-24T01:00:09.123456789Z',repliedAt='2026-10-24T01:00:08.987654321Z';const summary=decodeCommandPage(encode({items:[{...item(),status:'TIMED_OUT',dispatchedAt,repliedAt}],nextCursor:null,hasMore:false}),device,24).items[0]!;
  expect(summary.dispatchedAt).toBe(dispatchedAt);expect(summary.repliedAt).toBe(repliedAt);expect(decodeCommandDetail(encode({...response(),status:'TIMED_OUT',dispatchedAt,repliedAt}),summary).repliedAt).toBe(repliedAt)
 })
 it('新的阶段字段缺失或非法时整页/详情拒绝，显式null不从ACK及完成时钟补造',()=>{
  for(const key of ['dispatchedAt','repliedAt'])for(const value of [undefined,7,false,'2026-02-30T00:00:00Z','2026-10-24T09:00:00+08:00','2026-10-24T01:00:00']){const bad={...item(),[key]:value};expect(()=>decodeCommandPage(encode({items:[bad],nextCursor:null,hasMore:false}),device,24)).toThrow()}
  for(const repliedAt of [undefined,7,'not-time'])expect(()=>decodeCommandDetail(encode({...response(),repliedAt}),row())).toThrow()
  expect(decodeCommandDetail(encode({...response(),status:'TIMED_OUT',acknowledgedAt:'2026-10-24T01:00:04Z',completedAt:'2026-10-24T01:00:09Z'}),row()).repliedAt).toBeNull()
 })

})
