import {describe,it,expect} from 'vitest'
import {directoryReferenceKeys} from '../../src/features/devices/directory-reference-identity'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const at='2026-10-24T00:00:00Z'
const mapping=(n:number,key:string|null='MAC:Current')=>({deviceId:id(n),businessKey:key,version:'0',updatedAt:at})
describe('目录当前业务标识',()=>{
 it('只采用同页当前值，显式空值不回退到内部协议键',()=>{
  expect(directoryReferenceKeys([{id:id(1),deviceKey:'internal-1'},{id:id(2),deviceKey:'internal-2'}],[mapping(1),mapping(2,null)])).toEqual({[id(1)]:'MAC:Current',[id(2)]:null})
 })
 it('缺项/重复/外设备/空版本/非法更新时间整页拒绝',()=>{
  const items=[{id:id(1)},{id:id(2)}]
  for(const values of [[mapping(1)],[mapping(1),mapping(1)],[mapping(1),mapping(3)],[mapping(1),{...mapping(2),version:'01'}],[mapping(1),{...mapping(2),businessKey:undefined}],[mapping(1),{...mapping(2),updatedAt:123}]])expect(()=>directoryReferenceKeys(items,values as any)).toThrow()
 })
 it('新快照清空旧key，旧对象不作为新页兜底',()=>{
  const items=[{id:id(1),deviceKey:'internal'}];const old=directoryReferenceKeys(items,[mapping(1,'old')]);expect(directoryReferenceKeys(items,[mapping(1,null)])).toEqual({[id(1)]:null});expect(old).toEqual({[id(1)]:'old'})
 })
})
