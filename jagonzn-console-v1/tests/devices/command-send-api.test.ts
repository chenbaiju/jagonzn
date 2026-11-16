import {beforeEach,describe,it,expect,vi} from 'vitest'
const state=vi.hoisted(()=>({api:vi.fn(),binding:vi.fn()}))
vi.mock('@/core/http',()=>({api:state.api,ApiError:class ApiError extends Error{constructor(message:string,public status=0,public code?:number,public traceId?:string,public outcomeUnknown=false){super(message)}}}))
vi.mock('@/features/devices/api',()=>({devicePath:(p:string,d:string)=>`/api/v1/projects/${p}/devices/${d}`,devicesApi:{binding:state.binding}}))
import {commandChoices,submitCommand,waitCommandReply,validateCommandInput} from '@/features/devices/command-send-api'
const id='11111111-1111-4111-8111-111111111111',device='22222222-2222-4222-8222-222222222222'
const bytes=(value:unknown)=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value))
const response=()=>({id,deviceId:device,connectionDeviceId:device,commandKey:'reboot',currentDefinitionName:'重启',repliedAt:null,input:{},output:null,status:'ACCEPTED',attemptCount:1,maxAttempts:3,timeoutSeconds:30,failureCode:null,failureMessage:null,acceptedAt:'2026-10-24T01:00:00Z',dispatchedAt:null,acknowledgedAt:null,completedAt:null,attempts:[]})
describe('命令发送与原命令等待的独立字节合同',()=>{
 beforeEach(()=>{state.api.mockReset();state.binding.mockReset()})
 it('只POST一次，原始输入精度不经JS数值重写，再GET同一命令等待',async()=>{
  state.api.mockResolvedValueOnce(bytes(response())).mockResolvedValueOnce(bytes({...response(),status:'SUCCEEDED',output:false}))
  const signal=new AbortController().signal,input='{"exact":9007199254740993,"decimal":0.1234567890123456789}'
  const accepted=await submitCommand('project',device,'reboot',input,'key',signal)
  expect(state.api.mock.calls[0]![1]).toMatchObject({method:'post',rawBody:`{"commandKey":"reboot","input":${input}}`,headers:{'Idempotency-Key':'key'}})
  expect((await waitCommandReply('project',accepted,signal)).outputText).toBe('false')
  expect(state.api.mock.calls[1]![0]).toBe(`/api/v1/projects/project/devices/${device}/commands/${id}/reply`)
  expect(state.api.mock.calls[1]![1].method).toBeUndefined();expect(state.api).toHaveBeenCalledTimes(2)
 })
 it('拒绝重复键、数组、标量、非有限数、过大输入且零写请求',async()=>{
  for(const input of ['{"x":1,"x":2}','[]','null','false','{"n":1e400}',`{"long":"${'x'.repeat(65536)}"}`]){
   await expect(submitCommand('project',device,'reboot',input,'key',new AbortController().signal)).rejects.toThrow()
  }
  expect(state.api).not.toHaveBeenCalled();expect(()=>validateCommandInput('{"ok":false}')).not.toThrow()
 })
 it('POST已返回但受理身份或JSON损坏时按结果未知冻结，不冒充提交未发生',async()=>{
  for(const value of [{...response(),deviceId:id},'{"broken":']){
   state.api.mockResolvedValueOnce(bytes(value))
   await expect(submitCommand('project',device,'reboot','{}','key',new AbortController().signal)).rejects.toMatchObject({outcomeUnknown:true})
  }
  expect(state.api).toHaveBeenCalledTimes(2)
 })
 it('等待GET不接受另一命令或设备的回复',async()=>{
  state.api.mockResolvedValueOnce(bytes(response()))
  const accepted=await submitCommand('project',device,'reboot','{}','key',new AbortController().signal)
  for(const value of [{...response(),id:device},{...response(),deviceId:id},{...response(),commandKey:'other'}]){
   state.api.mockResolvedValueOnce(bytes(value));await expect(waitCommandReply('project',accepted,new AbortController().signal)).rejects.toThrow()
  }
  expect(state.api.mock.calls.filter(([,options])=>options.method==='post')).toHaveLength(1)
 })
 it('建议只读设备实际固定快照，新命令和精确默认值不回落当前类型目录',async()=>{
  const version={id,deviceTypeId:id,schemaDigest:'a'.repeat(64),digestAlgorithm:'PG_JSONB_TEXT_V1_SHA256'}
  state.binding.mockResolvedValue({deviceId:device,deviceTypeId:id,version})
  state.api.mockResolvedValue(bytes(`{"version":${JSON.stringify(version)},"modelSnapshot":{"commands":{"newOnly":{"name":"后继命令","timeoutSeconds":41,"inputSchema":{"type":"object","default":{"exact":9007199254740993}}},"legacy":{}}}}`))
  expect(await commandChoices('project',device,new AbortController().signal)).toEqual([{value:'newOnly',name:'后继命令',defaults:'{\n    "exact": 9007199254740993\n}'},{value:'legacy',name:'legacy',defaults:undefined}])
  expect(state.api.mock.calls[0]![0]).toBe(`/api/v1/projects/project/device-types/${id}/thing-model-versions/${id}`)
  state.api.mockResolvedValue(bytes({version:{...version,id:device},modelSnapshot:{commands:{}}}))
  await expect(commandChoices('project',device,new AbortController().signal)).rejects.toThrow('身份不匹配')
  state.binding.mockResolvedValue({deviceId:device,deviceTypeId:id})
  await expect(commandChoices('project',device,new AbortController().signal)).rejects.toThrow('绑定不可用')
  expect(state.api).toHaveBeenCalledTimes(2)
 })
})
