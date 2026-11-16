import {beforeEach,describe,expect,it,vi} from 'vitest'
import {readCommandNumberPage,decodeCommandNumberPage} from '@/features/devices/command-records-api'
import {readEventNumberPage} from '@/features/devices/event-records-api'
import {decodeEventNumberPage} from '@/features/devices/event-decoder'
import {canReadNextHistoryPage} from '@/features/devices/history-page-budget'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('@/core/http',()=>({api:state.api}))
const device='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002'
const bytes=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v))
const command=()=>({id,deviceId:device,operationType:'COMMAND',commandKey:'restart',status:'ACCEPTED',attemptCount:1,maxAttempts:3,acceptedAt:'2026-10-24T00:00:00Z',completedAt:null,dispatchedAt:null,repliedAt:null,currentDefinitionName:null})
const event=()=>({messageId:id,deviceId:device,deviceTypeId:device,eventKey:'alarm',level:'WARNING',thingModelVersionId:device,modelVersion:'1.0.0',eligibility:'CURRENT',occurredAt:'2026-10-24T00:00:00Z',receivedAt:'2026-10-24T00:00:01Z',acceptedAt:'2026-10-24T00:00:02Z',params:{},paramsRedacted:false,currentDefinitionName:null})
const eventPage=()=>({items:[event()],page:2,limit:24,windowFrom:'2026-10-23T00:00:00Z',windowTo:'2026-10-24T00:00:03Z',retentionDays:90})
beforeEach(()=>state.api.mockReset())
describe('独立历史页码字节协议',()=>{
 it('两个真实路由发送原页码和过滤，不发送cursor或改写返回窗口为请求',async()=>{
  state.api.mockResolvedValueOnce(bytes({items:[],page:2,limit:24})).mockResolvedValueOnce(bytes({...eventPage(),items:[]}));const signal=new AbortController().signal
  await readCommandNumberPage('project',device,2,24,signal);await readEventNumberPage('project',device,{eventKey:'alarm'},2,24,signal)
  expect(state.api.mock.calls[0]![0]).toBe(`/api/v1/projects/project/devices/${device}/command-pages`);expect(state.api.mock.calls[0]![1].query).toEqual({page:2,limit:24});expect(state.api.mock.calls[1]![0]).toBe(`/api/v1/projects/project/devices/${device}/event-pages`);expect(state.api.mock.calls[1]![1].query).toEqual({eventKey:'alarm',page:2,limit:24})
 })
 it('页码/条数回显不符、额外cursor、重复目标或错误设备均拒绝',()=>{
  const root={items:[command()],page:2,limit:24}
  for(const value of [{...root,page:1},{...root,limit:20},{...root,nextCursor:null},{...root,items:[command(),command()]},{...root,items:[{...command(),deviceId:id}]}])expect(()=>decodeCommandNumberPage(bytes(value),device,2,24)).toThrow()
  expect(decodeCommandNumberPage(bytes({...root,items:[]}),device,2,24).items).toEqual([])
 })
 it('原事件词法帧保留大整数和小数，不用JSON number改写历史参数',()=>{
  const raw=JSON.stringify(eventPage()).replace('"params":{}','"params":{"integer":9007199254740993,"decimal":1.2300,"enabled":false}')
  const result=decodeEventNumberPage(new TextEncoder().encode(raw),device,2,24);expect(result.items[0]!.paramsText).toContain('9007199254740993');expect(result.items[0]!.paramsText).toContain('1.2300');expect(result.items[0]!.paramsText).toContain('false')
 })
 it('事件窗口错误、空窗口有记录、重复页码和原件不属于设备全部拒绝',()=>{
  for(const value of [{...eventPage(),windowFrom:'2026-10-24T00:00:03.000000002Z',windowTo:'2026-10-24T00:00:03.000000001Z',items:[]},{...eventPage(),windowFrom:'2026-10-25T00:00:00Z'},{...eventPage(),windowFrom:eventPage().windowTo},{...eventPage(),items:[{...event(),deviceId:id}]}])expect(()=>decodeEventNumberPage(bytes(value),device,2,24)).toThrow()
  const duplicate=JSON.stringify(eventPage()).replace('"page":2','"page":2,"page":2');expect(()=>decodeEventNumberPage(new TextEncoder().encode(duplicate),device,2,24)).toThrow()
 })
 it('明确有限深页预算，空页不作为末页，越界在发送前拒绝',async()=>{
  expect(canReadNextHistoryPage(1,24)).toBe(true);expect(canReadNextHistoryPage(416,24)).toBe(true);expect(canReadNextHistoryPage(417,24)).toBe(false);expect(canReadNextHistoryPage(10001,1)).toBe(false)
  const signal=new AbortController().signal;await expect(readCommandNumberPage('p',device,Number.MAX_SAFE_INTEGER,24,signal)).rejects.toThrow();await expect(readEventNumberPage('p',device,{eventKey:''},10001,2,signal)).rejects.toThrow();expect(state.api).not.toHaveBeenCalled()
 })
})
