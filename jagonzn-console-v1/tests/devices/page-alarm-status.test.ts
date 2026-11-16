import {beforeEach,describe,it,expect,vi} from 'vitest'
import {ApiError} from '../../src/core/http'
import {pageAlarmStatus,alarmLabel} from '../../src/features/devices/page-alarm-status'
const state=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async(importOriginal)=>({...await importOriginal<typeof import('../../src/core/http')>(),api:state.api}))
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const model=id(999)
const observedAt='2026-10-24T00:00:00Z'
describe('当前页告警状态公开批次合同',()=>{
 beforeEach(()=>vi.clearAllMocks())
 it('21台分为20+1，只有权威NORMAL显示无告警',async()=>{
  state.api.mockImplementation((_p:string,o:any)=>Promise.resolve({observedAt,devices:o.query.deviceId.map((deviceId:string)=>({deviceId,modelVersionId:model,state:deviceId===id(1)?'ACTIVE':'NORMAL'}))}))
  const result=await pageAlarmStatus('p',Array.from({length:21},(_,n)=>id(n+1)),new AbortController().signal)
  expect(state.api).toHaveBeenCalledTimes(2);expect(state.api.mock.calls.map(c=>c[1].query.deviceId.length)).toEqual([20,1]);expect(result.unavailable).toBe(0)
  expect(alarmLabel(result.states[id(1)])).toBe('告警中');expect(alarmLabel(result.states[id(21)])).toBe('无告警');expect(alarmLabel(undefined)).toBe('告警状态未知')
 })
 it('整批缺项/无模型/越界均保持未知，不能保留先验正常项',async()=>{
  for(const devices of [[{deviceId:id(1),modelVersionId:model,state:'NORMAL'}],[{deviceId:id(1),modelVersionId:model,state:'NORMAL'},{deviceId:id(2),state:'NORMAL'}],[{deviceId:id(1),modelVersionId:model,state:'NORMAL'},{deviceId:id(3),modelVersionId:model,state:'NORMAL'}]]){
   state.api.mockResolvedValue({observedAt,devices});expect(await pageAlarmStatus('p',[id(1),id(2)],new AbortController().signal)).toEqual({states:{},unavailable:2})
  }
 })
 it('无模型400保留未知；失权404拒绝整次读取，不继续后续批次',async()=>{
  state.api.mockRejectedValue(new ApiError('无模型',400));expect(await pageAlarmStatus('p',[id(1)],new AbortController().signal)).toEqual({states:{},unavailable:1})
  state.api.mockClear();state.api.mockRejectedValue(new ApiError('失权',404));await expect(pageAlarmStatus('p',Array.from({length:21},(_,n)=>id(n+1)),new AbortController().signal)).rejects.toThrow('失权');expect(state.api).toHaveBeenCalledTimes(1)
 })
 it('未绑定模型的204结果显示未知，不伪造无告警',async()=>{
  state.api.mockResolvedValue(undefined)
  const result=await pageAlarmStatus('p',[id(1)],new AbortController().signal)
  expect(result).toEqual({states:{},unavailable:1});expect(alarmLabel(result.states[id(1)])).toBe('告警状态未知')
 })
})
