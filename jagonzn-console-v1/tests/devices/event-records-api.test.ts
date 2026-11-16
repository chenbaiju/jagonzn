import {describe,it,expect,vi,beforeEach} from 'vitest'
import {decodeEvent,decodeEventPage} from '../../src/features/devices/event-decoder'
import {readEventChoices} from '../../src/features/devices/event-records-api'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
const device='00000000-0000-4000-8000-000000000001',message='00000000-0000-4000-8000-000000000002',model='00000000-0000-4000-8000-000000000003'
const encode=(x:unknown)=>new TextEncoder().encode(JSON.stringify(x))
function event(){return{messageId:message,deviceId:device,deviceTypeId:model,eventKey:'overheat',level:'WARNING',thingModelVersionId:model,modelVersion:'v1',eligibility:'HISTORY_ONLY',occurredAt:'2026-10-24T01:00:00Z',receivedAt:'2026-10-24T01:00:01Z',acceptedAt:'2026-10-24T01:00:02Z',params:{},paramsRedacted:false,currentDefinitionName:null}}
const page=(items=[event()])=>({items,nextCursor:null,windowFrom:'2026-10-23T01:00:00Z',windowTo:'2026-10-24T02:00:00Z',retentionDays:90})
describe('事件原发生事实的精确只读解码',()=>{
 beforeEach(()=>state.api.mockReset())
 it('详情按消息与设备双身份匹配，精确展示大整数/小数/false/空串',()=>{
  const raw=JSON.stringify(event()).replace('"params":{}','"params":{"n":9007199254740993,"d":0.1234567890123456789,"ok":false,"text":""}')
  const value=decodeEvent(new TextEncoder().encode(raw),device,message)
  expect(value.paramsText).toContain('9007199254740993');expect(value.paramsText).toContain('0.1234567890123456789');expect(value.paramsText).toContain('false');expect(value.paramsText).toContain('"text": ""');expect(value.eligibility).toBe('HISTORY_ONLY')
 })
 it('拒绝路径可逃逸的消息ID、串设备/模型ID、错误事件键/时间与消息身份',()=>{
  for(const bad of [{...event(),messageId:'../other'},{...event(),deviceId:model},{...event(),deviceTypeId:'bad'},{...event(),thingModelVersionId:'bad'},{...event(),eventKey:'bad key'},{...event(),occurredAt:'2026-02-30T00:00:00Z'},{...event(),acceptedAt:'local-time'}])expect(()=>decodeEvent(encode(bad),device,message)).toThrow()
  expect(()=>decodeEvent(encode(event()),device,model)).toThrow()
 })
 it('拒绝重复消息、空页带下一游标、坏有效窗口，空有效交集仍可读',()=>{
  for(const bad of [page([event(),event()]),{...page([]),nextCursor:'opaque'},{...page(),windowFrom:'2026-02-30T00:00:00Z'}])expect(()=>decodeEventPage(encode(bad),device)).toThrow()
  const empty=decodeEventPage(encode({...page([]),windowFrom:page().windowTo}),device);expect(empty.items).toEqual([])
 })
 it('凭据投影标志保留，重复键/非法复合参数/坏UTF8与未知字段均拒绝',()=>{
  expect(decodeEvent(encode({...event(),paramsRedacted:true,currentDefinitionName:null}),device,message).paramsRedacted).toBe(true)
  for(const bad of [new TextEncoder().encode(JSON.stringify(event()).replace('"params":{}','"params":{"n":1,"\\u006e":2}')),encode({...event(),params:{nested:{x:null}}}),encode({...event(),extra:true}),new Uint8Array([0xff])])expect(()=>decodeEvent(bad,device,message)).toThrow()
 })
 it('筛选项仅来自当前绑定快照标识，不拿历史当前页或模型name补名称',async()=>{
  state.api.mockResolvedValueOnce({deviceId:device,deviceTypeId:model,version:{id:message}}).mockResolvedValueOnce({version:{id:message,deviceTypeId:model},modelSnapshot:{events:{overheat:{level:'WARNING',parameters:{}}}}})
  expect(await readEventChoices('project',device,new AbortController().signal)).toEqual(['overheat'])
  expect(state.api.mock.calls[1]![0]).toBe(`/api/v1/projects/project/device-types/${model}/thing-model-versions/${message}`)
 })
 it('未绑定类型不猜筛选项，串设备、坏路径标识、串版本均拒绝',async()=>{
  state.api.mockResolvedValueOnce({deviceId:device,deviceTypeId:null,version:null});expect(await readEventChoices('project',device,new AbortController().signal)).toEqual([]);expect(state.api).toHaveBeenCalledTimes(1)
  for(const binding of [{deviceId:model},{deviceId:device,deviceTypeId:'../bad',version:{id:message}}]){state.api.mockResolvedValueOnce(binding);await expect(readEventChoices('project',device,new AbortController().signal)).rejects.toThrow()}
  state.api.mockResolvedValueOnce({deviceId:device,deviceTypeId:model,version:{id:message}}).mockResolvedValueOnce({version:{id:model,deviceTypeId:model},modelSnapshot:{events:{}}});await expect(readEventChoices('project',device,new AbortController().signal)).rejects.toThrow()
 })
 it('旧事件当前名称明确null，不把eventKey当name；缺字段和坏名称拒绝',()=>{
  expect(decodeEvent(encode(event()),device,message).currentDefinitionName).toBeNull()
  const missing={...event()} as Record<string,unknown>;delete missing.currentDefinitionName
  expect(()=>decodeEvent(encode(missing),device,message)).toThrow()
  for(const currentDefinitionName of [false,1,'','  ','名'.repeat(129)])expect(()=>decodeEvent(encode({...event(),currentDefinitionName}),device,message)).toThrow()
 })

})

it('SUCCESS复合历史保持嵌套精确数字与List，超界/null/坏键不展示',()=>{
 const raw=JSON.stringify({...event(),level:'SUCCESS',paramsRedacted:true}).replace('"params":{}','"params":{"result":{"value":0.1234567890123456789,"id":9007199254740993},"flags":[true,false]}')
 const value=decodeEvent(new TextEncoder().encode(raw),device,message);expect(value.level).toBe('SUCCESS');expect(value.paramsText).toContain('0.1234567890123456789');expect(value.paramsText).toContain('9007199254740993');expect(value.paramsText).toContain('[true, false]');expect(value.paramsRedacted).toBe(true)
 for(const params of [{result:{bad:null}},{result:{'bad/key':1}},{flags:Array.from({length:257},()=>true)},{result:Object.fromEntries(Array.from({length:65},(_,n)=>['p'+n,true]))}])expect(()=>decodeEvent(encode({...event(),params}),device,message)).toThrow()
})
