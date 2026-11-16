import {describe,it,expect} from 'vitest'
import {directoryAlarmStatus} from '../../src/features/devices/directory-alarm-status'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const at='2026-10-24T00:00:00Z',model=id(99)
const observation=(n:number,state:'NORMAL'|'ACTIVE'|'UNKNOWN'='NORMAL')=>({deviceId:id(n),modelVersionId:state==='UNKNOWN'?null:model,observedAt:at,state,highestSeverity:state==='ACTIVE'?'CRITICAL' as const:null})
describe('目录同快照告警摘要',()=>{
 it('只有有效模型NORMAL显示正常，UNKNOWN保持未知且不发额外HTTP',()=>{
  expect(directoryAlarmStatus([{id:id(1)},{id:id(2)},{id:id(3)}],[observation(1),observation(2,'ACTIVE'),observation(3,'UNKNOWN')])).toEqual({states:{[id(1)]:'NORMAL',[id(2)]:'ACTIVE'},unavailable:1})
 })
 it('缺项、重复、外设备、缺模型、非法等级或混合快照均拒绝整页',()=>{
  const items=[{id:id(1)},{id:id(2)}],one=observation(1),two=observation(2)
  for(const observations of [[one],[one,one],[one,observation(3)],[one,{...two,modelVersionId:null}],[one,{...two,state:'ACTIVE',highestSeverity:null}],[one,{...two,highestSeverity:'INFO'}],[one,{...two,observedAt:'2026-10-24T00:00:01Z'}],[one,{...two,state:'UNKNOWN',highestSeverity:'CRITICAL'}]])
   expect(()=>directoryAlarmStatus(items,observations as any)).toThrow()
 })
 it('空页要求显式完整空摘要，重复或缺失设备身份不被忽略',()=>{
  expect(directoryAlarmStatus([],[])).toEqual({states:{},unavailable:0})
  expect(()=>directoryAlarmStatus([],undefined)).toThrow()
  expect(()=>directoryAlarmStatus([{id:id(1)},{id:id(1)}],[observation(1),observation(1)])).toThrow()
 })
})
