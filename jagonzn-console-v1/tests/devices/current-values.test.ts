import {describe,it,expect} from 'vitest'
import {decodeCurrentValues} from '../../src/features/devices/current-values'
import {valueText} from '../../src/features/devices/strict-values'
const bytes=(text:string)=>new TextEncoder().encode(text)
const version='00000000-0000-4000-8000-000000000002',otherVersion='00000000-0000-4000-8000-000000000003'
const row=(key:string,value:string,time='"2026-10-24T00:00:00Z"',model=version)=>`{"propertyKey":"${key}","state":"VALUE","value":${value},"occurredAt":${time},"reportedModelVersionId":"${model}"}`
const response=(values:string,id='device',status='AVAILABLE')=>`{"devices":[{"deviceId":"${id}","status":"${status}","values":[${values}]}]}`
describe('单设备当前属性严格投影',()=>{
 it('JSON与数值词法保持一致，采集时间不由客户端推算',()=>{
  const value=decodeCurrentValues(bytes(response(`${row('n','9007199254740993')},${row('d','0.1234567890123456789','"2026-10-24T00:00:00.123456Z"')}`)),'device',version,['n','d']);expect(valueText(value.values)).toBe('{"n": 9007199254740993, "d": 0.1234567890123456789}');expect(value.occurredAt.d).toBe('2026-10-24T00:00:00.123456Z')
 })
 it('NO_VALUE仅允许两字段；少项、多项或重复属性都拒绝',()=>{
  const empty='{"propertyKey":"n","state":"NO_VALUE"}'
  expect(decodeCurrentValues(bytes(response(empty)),'device',version,['n']).values).toEqual({})
  for(const values of ['',`${empty},${empty}`,empty.replace('"NO_VALUE"','"NO_VALUE","value":1')])expect(()=>decodeCurrentValues(bytes(response(values)),'device',version,['n'])).toThrow()
 })
 it('拒绝别设备、不在本批的属性或伪造采集时间',()=>{
  expect(()=>decodeCurrentValues(bytes(response(row('n','1'),'other')),'device',version,['n'])).toThrow()
  expect(()=>decodeCurrentValues(bytes(response(row('n','1'))),'device',version,['d'])).toThrow()
  for(const time of ['123','null','"2026"','"not-a-time"'])expect(()=>decodeCurrentValues(bytes(response(row('n','1',time))),'device',version,['n'])).toThrow()
 })
 it('当前模型失败或ABA后真实来源模型不匹配，不能降为普通无值或借当前绑定伪装',()=>{
  expect(()=>decodeCurrentValues(bytes(response('','device','MODEL_MISMATCH')),'device',version,['n'])).toThrow()
  expect(()=>decodeCurrentValues(bytes(response(row('n','123','"2026-10-24T00:00:00Z"',otherVersion))),'device',version,['n'])).toThrow()
  for(const state of ['SOURCE_VERSION_UNKNOWN','SOURCE_MODEL_MISMATCH','CONTRACT_MISMATCH'])expect(()=>decodeCurrentValues(bytes(response(`{"propertyKey":"n","state":"${state}"}`)),'device',version,['n'])).toThrow()
 })
})
