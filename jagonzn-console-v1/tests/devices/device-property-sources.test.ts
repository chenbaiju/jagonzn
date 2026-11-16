import {describe,it,expect} from 'vitest'
import {decodeDevicePropertySources,readDevicePropertySources} from '../../src/features/devices/device-property-sources-api'
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',model='00000000-0000-4000-8000-000000000003',operation='00000000-0000-4000-8000-000000000009'
const bytes=(text:string)=>new TextEncoder().encode(text)
function value(state:string,overrides:Record<string,unknown>={}){
 return JSON.stringify({state,value:null,modelVersionId:null,occurredAt:null,updatedAt:null,operationId:null,...overrides})
}
function response(variances:string[],identity={projectId:project,deviceId:device,modelVersionId:model}){
 return bytes(`{"projectId":"${identity.projectId}","deviceId":"${identity.deviceId}","modelVersionId":"${identity.modelVersionId}","values":[${variances.join(',')}]}`)
}
function item(key:string,parts:{reported?:string;downlink?:string;cloud?:string}={}){
 return `{"propertyKey":${JSON.stringify(key)},"reported":${parts.reported??value('NO_VALUE')},"downlink":${parts.downlink??value('NO_VALUE')},"cloud":${parts.cloud??value('NO_VALUE')}}`
}
describe('设备属性三来源严格读取',()=>{
 it('保留设备采集时间与平台各自受理时间，不互换来源',()=>{
  const decoded=decodeDevicePropertySources(response([item('p0',{
   reported:value('VALUE',{value:5,modelVersionId:model,occurredAt:'2026-11-15T01:00:00Z'}),
   downlink:value('VALUE',{value:7,modelVersionId:model,updatedAt:'2026-11-15T01:01:00Z',operationId:operation}),
   cloud:value('VALUE',{value:'text',modelVersionId:model,updatedAt:'2026-11-15T01:02:00Z',operationId:operation})
  })],),project,device,model,['p0'])
  expect(decoded).toHaveLength(1)
  expect(decoded[0]!.reported).toMatchObject({state:'VALUE',modelVersionId:model,occurredAt:'2026-11-15T01:00:00Z',updatedAt:null,operationId:null})
  expect(decoded[0]!.downlink).toMatchObject({state:'VALUE',modelVersionId:model,occurredAt:null,updatedAt:'2026-11-15T01:01:00Z',operationId:operation})
  expect(decoded[0]!.cloud).toMatchObject({state:'VALUE',modelVersionId:model,occurredAt:null,updatedAt:'2026-11-15T01:02:00Z',operationId:operation})
 })
 it('空来源必须全部字段为null，夹带值或非NO_VALUE状态整批拒绝',()=>{
  expect(()=>decodeDevicePropertySources(response([item('p0',{reported:value('NO_VALUE',{value:1})})]),project,device,model,['p0'])).toThrow('夹带')
  expect(()=>decodeDevicePropertySources(response([item('p0',{reported:value('SOURCE_MODEL_MISMATCH')})]),project,device,model,['p0'])).toThrow('不可展示')
  expect(()=>decodeDevicePropertySources(response([item('p0',{downlink:value('VALUE',{value:1,modelVersionId:model,updatedAt:'2026-11-15T01:01:00Z'})})]),project,device,model,['p0'])).toThrow('平台来源')
  expect(()=>decodeDevicePropertySources(response([item('p1')]),project,device,model,['p0'])).toThrow('身份或顺序')
  expect(()=>decodeDevicePropertySources(response([item('p0')],{projectId:project,deviceId:'x',modelVersionId:model}),project,device,model,['p0'])).toThrow('身份不匹配')
 })
 it('未知状态、缺字段与错模型均不可展示',()=>{
  expect(()=>decodeDevicePropertySources(response([item('p0',{reported:value('UNKNOWN')})]),project,device,model,['p0'])).toThrow('状态不合法')
  const missing=`{"propertyKey":"p0","reported":${value('NO_VALUE')},"downlink":${value('NO_VALUE')}}`
  expect(()=>decodeDevicePropertySources(response([missing]),project,device,model,['p0'])).toThrow('字段不符合')
  expect(()=>decodeDevicePropertySources(response([item('p0',{reported:value('VALUE',{value:1,modelVersionId:'bad',occurredAt:'2026-11-15T01:00:00Z'})})]),project,device,model,['p0'])).toThrow('模型不完整')
 })
 it('请求端拒绝空、重复和超过50个属性',async()=>{
  await expect(readDevicePropertySources(project,device,model,[])).rejects.toThrow('范围不合法')
  await expect(readDevicePropertySources(project,device,model,['a','a'])).rejects.toThrow('范围不合法')
  await expect(readDevicePropertySources(project,device,model,Array.from({length:51},(_,index)=>`p${index}`))).rejects.toThrow('范围不合法')
 })
})
