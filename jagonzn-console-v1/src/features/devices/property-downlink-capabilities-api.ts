import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'

export type PropertyDownlinkCapabilities=Schema<'DevicePropertyDownlinkCapabilitiesResponse'>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const declaration=/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const keys=(value:object,expected:readonly string[])=>Object.keys(value).length===expected.length&&expected.every(key=>Object.hasOwn(value,key))
/** 只读取完整有界的当前原声明；不自动选择latest，也不把查询当未来发送许可。 */
export async function readPropertyDownlinkCapabilities(project:string,device:string,model:string,signal?:AbortSignal){
 const value=await api<PropertyDownlinkCapabilities>(`${devicePath(project,device)}/property-downlink-capabilities`,{query:{expectedModelVersionId:model},signal})
 if(!value||!keys(value,['projectId','deviceId','modelVersionId','sendEnabled','capabilities'])||value.projectId!==project||value.deviceId!==device||value.modelVersionId!==model||typeof value.sendEnabled!=='boolean'||!Array.isArray(value.capabilities)||value.capabilities.length>20)throw new Error('当前连接声明身份或完整范围不匹配')
 const seen=new Set<string>(),tickets=new Set<string>()
 for(const item of value.capabilities){
  if(!item||!keys(item,['capabilityId','connectionTicketId','modelVersionId','schemaDigest','maximumPayloadBytes','declaredAt'])||typeof item.capabilityId!=='string'||!declaration.test(item.capabilityId)||seen.has(item.capabilityId)||typeof item.connectionTicketId!=='string'||!uuid.test(item.connectionTicketId)||tickets.has(item.connectionTicketId)||item.modelVersionId!==model||typeof item.schemaDigest!=='string'||!/^[a-f0-9]{64}$/.test(item.schemaDigest)||typeof item.maximumPayloadBytes!=='number'||!Number.isSafeInteger(item.maximumPayloadBytes)||item.maximumPayloadBytes<2048||item.maximumPayloadBytes>65536||typeof item.declaredAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(item.declaredAt)||!Number.isFinite(Date.parse(item.declaredAt)))throw new Error('当前连接声明资料不完整或重复')
  seen.add(item.capabilityId);tickets.add(item.connectionTicketId)
 }
 return value
}

/** 来自同次设备绑定与精确版本读取的混合键全集，包含尚未上报的属性。 */
export type BoundPropertyDownlinkModel=Readonly<{projectId:string;deviceId:string;modelVersionId:string;schemaDigest:string;mixedKeys:readonly string[]}>
export function captureBoundPropertyDownlinkModel(project:string,device:string,typeId:string,binding:Schema<'ThingModelVersionResponse'>,snapshot:Schema<'ThingModelSnapshotResponse'>):BoundPropertyDownlinkModel|undefined{
 const model=snapshot.modelSnapshot
 if(!model||typeof model!=='object'||Array.isArray(model)||!('properties' in model)||!model.properties||typeof model.properties!=='object'||Array.isArray(model.properties))throw new Error('设备绑定模型属性不完整，请刷新后重试')
 const mixedKeys:string[]=[]
 for(const [key,value]of Object.entries(model.properties)){if(!/^[A-Za-z0-9_-]{1,64}$/.test(key)||!value||typeof value!=='object'||Array.isArray(value))throw new Error('设备绑定模型属性不完整，请刷新后重试');if('compositeProfile' in value&&value.compositeProfile!=null){if(value.compositeProfile!=='BASIC_MIXED_LIST_V1'||!('dataType' in value)||value.dataType!=='LIST')throw new Error('设备绑定模型列表声明无法读取，请刷新后重试');mixedKeys.push(key)}}
 if(!mixedKeys.length)return undefined
 const version=snapshot.version
 if(!uuid.test(project)||!uuid.test(device)||!uuid.test(typeId)||!binding.id||!uuid.test(binding.id)||binding.deviceTypeId!==typeId||version?.id!==binding.id||version.deviceTypeId!==typeId||typeof binding.schemaDigest!=='string'||!/^[a-f0-9]{64}$/.test(binding.schemaDigest)||version.schemaDigest!==binding.schemaDigest||binding.digestAlgorithm!=='PG_JSONB_TEXT_V1_SHA256'||version.digestAlgorithm!==binding.digestAlgorithm||Object.keys(model).length!==3||!['properties','events','commands'].every(key=>{const section=Reflect.get(model,key);return section&&typeof section==='object'&&!Array.isArray(section)}))throw new Error('设备绑定模型或摘要不完整，请刷新设备信息后重试')
 return Object.freeze({projectId:project,deviceId:device,modelVersionId:binding.id,schemaDigest:binding.schemaDigest,mixedKeys:Object.freeze(mixedKeys)})
}
/** 唯一符合原设备/模型/摘要的连接才可冻结；多个连接不按新旧或列表位置挑选。 */
export function uniquePropertyDownlinkCapability(value:PropertyDownlinkCapabilities,model:BoundPropertyDownlinkModel):string{
 if(value.projectId!==model.projectId||value.deviceId!==model.deviceId||value.modelVersionId!==model.modelVersionId||!/^[a-f0-9]{64}$/.test(model.schemaDigest))throw new Error('设备连接与当前模型不一致，请刷新后重试')
 if(value.sendEnabled!==true)throw new Error('当前设备暂不支持此列表下发，请检查设备连接后重试')
 const matches=(value.capabilities||[]).filter(row=>row.modelVersionId===model.modelVersionId&&row.schemaDigest===model.schemaDigest)
 if(matches.length>1)throw new Error('当前设备存在多个连接，请重新连接后重试')
 if(matches.length!==1||typeof matches[0]?.capabilityId!=='string'||!declaration.test(matches[0].capabilityId))throw new Error('当前设备连接不支持此列表下发，请重新连接后重试')
 return matches[0].capabilityId
}
