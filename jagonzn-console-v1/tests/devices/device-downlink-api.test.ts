import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {webcrypto,createHash} from 'node:crypto'
const state=vi.hoisted(()=>({api:vi.fn(),binding:vi.fn()}))
vi.mock('@/core/http',async()=>({...await vi.importActual('@/core/http'),api:state.api}))
vi.mock('@/features/devices/api',()=>({devicePath:(p:string,d:string)=>`/api/v1/projects/${p}/devices/${d}`,devicesApi:{binding:state.binding}}))
import {prepareDownlink,sendDownlink,recoverDownlink,commandEnvelope,formatDownlinkJson} from '@/features/devices/device-downlink-api'
import {ApiError} from '@/core/http'
const project='11111111-1111-4111-8111-111111111111',device='22222222-2222-4222-8222-222222222222',model='33333333-3333-4333-8333-333333333333',operation='44444444-4444-4444-8444-444444444444'
const signal=()=>new AbortController().signal
const receipt=()=>({operationId:operation,projectId:project,deviceId:device,modelVersionId:model,kind:'DOWNLINK',acceptedAt:'2026-10-25T12:00:00Z',commandId:operation})
const command=()=>({id:operation,deviceId:device,connectionDeviceId:device,commandKey:'reboot',currentDefinitionName:'重启',repliedAt:null,input:{},output:null,status:'ACCEPTED',attemptCount:1,maxAttempts:3,timeoutSeconds:30,failureCode:null,failureMessage:null,acceptedAt:'2026-10-25T12:00:00Z',dispatchedAt:null,acknowledgedAt:null,completedAt:null,attempts:[]})
const bytes=(value:unknown)=>new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value))
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);state.api.mockReset();state.binding.mockReset().mockResolvedValue({deviceId:device,version:{id:model}})})
afterEach(()=>vi.unstubAllGlobals())
describe('通用下发的原意图、精度与只读核对',()=>{
 it('属性原文及完整正文摘要固定，POST后GET按相同原键和正文摘要核对',async()=>{
  const text='{"n":9007199254740993.25,"flag":false}',intent=await prepareDownlink(project,device,'PROPERTY',text,signal());if(intent.kind!=='PROPERTY')throw new Error('kind')
  expect(intent.body).toContain(text);expect(intent.bodyHash).toBe(createHash('sha256').update(intent.body).digest('hex'));expect(Object.isFrozen(intent)).toBe(true)
  state.api.mockResolvedValue(receipt());await sendDownlink(intent,signal());await recoverDownlink(intent,signal())
  expect(state.api.mock.calls[0]![1]).toMatchObject({method:'post',rawBody:intent.body,headers:{'Idempotency-Key':intent.key}})
  expect(state.api.mock.calls[1]![0]).toMatch(/\/submissions\/DOWNLINK$/);expect(state.api.mock.calls[1]![1].method).toBeUndefined();expect(state.api.mock.calls[1]![1].headers).toEqual({'Original-Request-Key':intent.key,'X-Request-Body-SHA256':intent.bodyHash})
  expect(state.api.mock.calls.filter(([,v])=>v.method==='post')).toHaveLength(1)
 })
 it('method/params映射保持精确数字及false，整理不经JSON.parse浮点重写',async()=>{
  const input='{"method":"reboot","params":{"n":9007199254740993.25,"flag":false}}',intent=await prepareDownlink(project,device,'COMMAND',input,signal())
  expect(intent.kind).toBe('COMMAND');if(intent.kind!=='COMMAND')throw new Error('kind');expect(intent.input).toContain('9007199254740993.25');expect(formatDownlinkJson(input)).toContain('9007199254740993.25');expect(state.binding).not.toHaveBeenCalled()
  state.api.mockResolvedValue(bytes(JSON.stringify(command()).replace('"input":{}','"input":{"n":9007199254740993.25,"flag":false}')))
  await sendDownlink(intent,signal());expect(state.api.mock.calls[0]![1].rawBody).toContain('9007199254740993.25')
 })
 it('命令核对接受数值等价的JSONB排版，但拒另一参数、设备或method且不写',async()=>{
  const intent=await prepareDownlink(project,device,'COMMAND','{"method":"reboot","params":{"n":1e3}}',signal())
  state.api.mockResolvedValueOnce(bytes({...command(),input:{n:1000}}));await recoverDownlink(intent,signal());expect(state.api.mock.calls[0]![1].headers).toEqual({'Original-Request-Key':intent.key})
  for(const bad of [{...command(),input:{n:999}},{...command(),deviceId:operation,input:{n:1000}},{...command(),commandKey:'other',input:{n:1000}}]){state.api.mockResolvedValueOnce(bytes(bad));await expect(recoverDownlink(intent,signal())).rejects.toThrow()}
  expect(state.api.mock.calls.every(([,v])=>v.method===undefined)).toBe(true)
 })
 it('重复字段、空method、非对象参数、超预算都在写前拒绝',async()=>{
  for(const input of ['{"method":"reboot","params":{},"params":{}}','{"method":"","params":{}}','{"method":"reboot","params":[]}',`{"method":"reboot","params":{"large":"${'x'.repeat(65536)}"}}`])await expect(prepareDownlink(project,device,'COMMAND',input,signal())).rejects.toThrow()
  expect(()=>commandEnvelope('[]')).toThrow();expect(state.api).not.toHaveBeenCalled()
 })
 it('绑定身份错误在POST前拒绝，不能把目录别的设备模型当当前设备',async()=>{
  state.binding.mockResolvedValue({deviceId:operation,version:{id:model}})
  await expect(prepareDownlink(project,device,'PROPERTY','{"n":1}',signal())).rejects.toThrow();expect(state.api).not.toHaveBeenCalled()
 })
 it('恢复404只传播未知读取，不借原键发第二个POST',async()=>{
  const intent=await prepareDownlink(project,device,'PROPERTY','{"n":1}',signal());state.api.mockRejectedValue(new ApiError('不存在',404));await expect(recoverDownlink(intent,signal())).rejects.toMatchObject({status:404});expect(state.api).toHaveBeenCalledTimes(1);expect(state.api.mock.calls[0]![1].method).toBeUndefined()
 })
 it('坏2xx平台回执不能当受理成功，仍可用原冻结意图只读恢复',async()=>{
  const intent=await prepareDownlink(project,device,'PROPERTY','{"n":1}',signal());state.api.mockResolvedValue({...receipt(),deviceId:operation});await expect(sendDownlink(intent,signal())).rejects.toThrow();state.api.mockResolvedValue(receipt());await recoverDownlink(intent,signal());expect(state.api.mock.calls.filter(([,v])=>v.method==='post')).toHaveLength(1)
 })
 it('命令原文恰好16KB可准备，不能把内部重排正文当原站输入预算',async()=>{
  const prefix='{"method":"reset","params":{"text":""}}',input=prefix.replace('""',JSON.stringify('x'.repeat(16384-new TextEncoder().encode(prefix).byteLength)))
  expect(new TextEncoder().encode(input).byteLength).toBe(16384)
  const intent=await prepareDownlink(project,device,'COMMAND',input,signal());expect(intent.kind).toBe('COMMAND');expect(state.api).not.toHaveBeenCalled()
 })
 it('超过16KB的UTF8输入在属性绑定读取或任何POST之前拒绝',async()=>{
  const input=JSON.stringify({n:'界'.repeat(5500)});expect(input.length).toBeLessThan(16384);expect(new TextEncoder().encode(input).byteLength).toBeGreaterThan(16384)
  await expect(prepareDownlink(project,device,'PROPERTY',input,signal())).rejects.toThrow('16 KB')
  const prefix='{"method":"reset","params":{"text":""}}',command=prefix.replace('""',JSON.stringify('x'.repeat(16385-new TextEncoder().encode(prefix).byteLength)))
  await expect(prepareDownlink(project,device,'COMMAND',command,signal())).rejects.toThrow('16 KB');expect(state.binding).not.toHaveBeenCalled();expect(state.api).not.toHaveBeenCalled()
 })
})
