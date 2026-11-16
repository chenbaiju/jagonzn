import {describe,it,expect} from 'vitest'
import {preparePlatformPropertyBody,prepareSinglePlatformPropertyBody,decodePlatformCurrent,samePlatformCurrent} from '../../src/features/devices/platform-properties-json'
import {valueText} from '../../src/features/devices/strict-values'
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',model='00000000-0000-4000-8000-000000000003',operation='00000000-0000-4000-8000-000000000004'
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
function item(changes:Record<string,unknown>={}){return {propertyKey:'n',state:'VALUE',sourceKind:'PLATFORM_CLOUD_UPDATE',value:'precise',modelVersionId:model,occurredAt:null,updatedAt:'2026-10-24T00:00:00Z',operationId:operation,reportedRevision:null,...changes}}
function wire(value:unknown){return bytes({projectId:project,deviceId:device,modelVersionId:model,values:[value]})}
const decode=(value:unknown)=>decodePlatformCurrent(wire(value),project,device,model,['n'])
describe('平台属性精确正文和明确来源',()=>{
 it('保持大整数和精确小数原文，原始正文绑定精确模型',()=>{
  const input='{"n":9007199254740993,"d":0.12345678901234567890123456789}',prepared=preparePlatformPropertyBody(model,input)
  expect(prepared.body).toContain(input);expect(valueText(prepared.properties.n!)).toBe('9007199254740993');expect(valueText(prepared.properties.d!)).toBe('0.12345678901234567890123456789')
 })
 it('重复键、尾随对象、空对象、数组、null和超过50键整批拒绝',()=>{
  for(const input of ['{"n":1,"n":2}','{}{}','{}','[]','{"n":null}',JSON.stringify(Object.fromEntries(Array.from({length:51},(_,i)=>['p'+i,1])))])expect(()=>preparePlatformPropertyBody(model,input)).toThrow()
 })
 it('按完整请求UTF8预算，包括中文和模型包装，不按字符数判断',()=>{
  expect(()=>preparePlatformPropertyBody(model,JSON.stringify({n:'界'.repeat(350000)}))).toThrow()
  expect(()=>preparePlatformPropertyBody(model,JSON.stringify({n:'x'.repeat(1048500)}))).toThrow()
 })
 it('平台来源必须有实际操作和平台时间，不能带设备采集时间或上报序号',()=>{
  expect(decode(item()).operations.n).toBe(operation)
  for(const changes of [{operationId:null},{operationId:'fake'},{occurredAt:'2026-10-24T00:00:00Z'},{reportedRevision:'1'},{updatedAt:null},{modelVersionId:device}])expect(()=>decode(item(changes))).toThrow()
 })
 it('设备来源保留未知历史序号，拒绝平台元数据与非规范或溢出序号',()=>{
  const actual=item({sourceKind:'DEVICE_REPORT',occurredAt:'2026-10-24T00:00:00Z',updatedAt:null,operationId:null,reportedRevision:null})
  expect(decode(actual).sources.n).toBe('DEVICE_REPORT')
  for(const revision of ['0','01','9223372036854775808',1])expect(()=>decode({...actual,reportedRevision:revision})).toThrow()
  expect(()=>decode({...actual,updatedAt:'2026-10-24T00:00:00Z'})).toThrow()
 })
 it('空状态不夹带值，模型ABA坏来源不能当空值成功',()=>{
  const empty=item({state:'NO_VALUE',sourceKind:null,value:null,modelVersionId:null,occurredAt:null,updatedAt:null,operationId:null,reportedRevision:null})
  expect(decode(empty).values).toEqual({});expect(()=>decode({...empty,value:1})).toThrow();expect(()=>decode({...empty,state:'SOURCE_MODEL_MISMATCH'})).toThrow()
 })
 it('逐键确认需要同一operation及动作，别次同值和设备回声都不冒认本次确认',()=>{
  const current=decode(item()),properties=preparePlatformPropertyBody(model,'{"n":"precise"}').properties
  expect(samePlatformCurrent(current,operation,'CLOUD_UPDATE',properties)).toBe(true)
  expect(samePlatformCurrent(current,device,'CLOUD_UPDATE',properties)).toBe(false)
  expect(samePlatformCurrent(current,operation,'DOWNLINK',properties)).toBe(false)
  expect(samePlatformCurrent(current,operation,'CLOUD_UPDATE',preparePlatformPropertyBody(model,'{"n":"other"}').properties)).toBe(false)
 })
 it('响应身份、重复字段、顺序和完整行数都封闭核对',()=>{
  expect(()=>decodePlatformCurrent(wire(item()),device,device,model,['n'])).toThrow()
  expect(()=>decodePlatformCurrent(wire(item()),project,device,device,['n'])).toThrow()
  expect(()=>decode(item({propertyKey:'other'}))).toThrow()
  expect(()=>decodePlatformCurrent(bytes({projectId:project,deviceId:device,modelVersionId:model,values:[]}),project,device,model,['n'])).toThrow()
 })
 it('PG重排对象键及数字规范化不会误判，仍区别相邻高精度值与数组顺序',()=>{
  const input=preparePlatformPropertyBody(model,'{"n":{"z":1e3,"a":[-0,9007199254740993,0.1234567890123456789]}}').properties
  const base=new TextDecoder().decode(wire(item({value:null}))),raw=base.replace('"value":null','"value":{"a":[0,9007199254740993,0.123456789012345678900],"z":1000.0}')
  const actual=decodePlatformCurrent(new TextEncoder().encode(raw),project,device,model,['n'])
  expect(samePlatformCurrent(actual,operation,'CLOUD_UPDATE',input)).toBe(true)
  expect(samePlatformCurrent(actual,operation,'CLOUD_UPDATE',preparePlatformPropertyBody(model,'{"n":{"z":1000,"a":[0,9007199254740992,0.1234567890123456789]}}').properties)).toBe(false)
  expect(samePlatformCurrent(actual,operation,'CLOUD_UPDATE',preparePlatformPropertyBody(model,'{"n":{"z":1000,"a":[9007199254740993,0,0.1234567890123456789]}}').properties)).toBe(false)
 })
})

describe('固定单属性JSON值包装',()=>{
 it.each(['9007199254740993','0.123456789012345678901','false','0','"quote\\\" and \\n"','{"n":9007199254740993,"a":[null,false]}','[9007199254740993,0.123456789012345678901]'])('原文%s保持单个含横线键而不经浮点序列化',raw=>{
  const prepared=prepareSinglePlatformPropertyBody(model,'target-level',raw)
  expect(prepared.keys).toEqual(['target-level']);expect(prepared.body).toBe(`{"expectedModelVersionId":"${model}","properties":{"target-level":${raw}}}`)
 })
 it('拒绝追加键、重复冻结键、null、尾随正文、非法键及超预算',()=>{
  for(const raw of ['1,"other":2','1,"target-level":2','null','{}{}','', 'true}', '"x"'.repeat(600000)])expect(()=>prepareSinglePlatformPropertyBody(model,'target-level',raw)).toThrow()
  for(const key of ['bad"key','bad key','a'.repeat(65)])expect(()=>prepareSinglePlatformPropertyBody(model,key,'1')).toThrow()
 })
})
