import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicesApi} from '@/features/devices/api'
import {frozenSwitchEncoding,type SwitchEncoding} from '@/features/devices/switch-value'
import {frozenEnumOptions} from '@/features/devices/single-property-enum'
import {ExactDecimal} from './preprocess-exact-json'
export type DevicePropertyChoice={key:string;name:string;type:'NUMBER'|'SWITCH'|'TEXT'|'ENUM';switchEncoding?:SwitchEncoding;enumOptions?:readonly string[]}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&!(value instanceof ExactDecimal)
/** 仅读设备实际绑定的当前版本；用途只决定调用者已有的访问类型筛选，不赋予动作权限。 */
export async function readDevicePropertyChoices(project:string,device:string,accessTypes:readonly string[]|undefined,signal?:AbortSignal,expectedVersion?:string):Promise<DevicePropertyChoice[]>{
 const binding=await devicesApi.binding(project,device,signal)
 if(binding.deviceId!==device||!binding.deviceTypeId||!binding.version?.id||!binding.version.schemaDigest||expectedVersion&&binding.version.id!==expectedVersion)throw new Error('目标设备尚无可读取的物模型或绑定已变化')
 return readTypePropertyChoices(project,binding.deviceTypeId,binding.version.id,signal,accessTypes,binding.version.schemaDigest)
}
/** 按固定模型版本读取标量选项，避免用当前草稿替代设备绑定版本。 */
export async function readTypePropertyChoices(project:string,type:string,version:string,signal?:AbortSignal,accessTypes?:readonly string[],digest?:string):Promise<DevicePropertyChoice[]>{
 const snapshot=await api<Schema<'ThingModelSnapshotResponse'>>(`/api/v1/projects/${project}/device-types/${type}/thing-model-versions/${version}`,{signal,maxResponseBytes:2097152})
 if(snapshot.version?.id!==version||digest&&snapshot.version.schemaDigest!==digest||!object(snapshot.modelSnapshot)||!object(snapshot.modelSnapshot.properties))throw new Error('目标设备绑定模型不一致，请重新选择')
 const entries=Object.entries(snapshot.modelSnapshot.properties);if(entries.length>200)throw new Error('目标设备属性数量超过本页读取范围')
 return entries.flatMap(([key,raw])=>{
  if(!object(raw)||accessTypes&&!accessTypes.includes(String(raw.accessType))||!['NUMBER','SWITCH','TEXT','ENUM'].includes(String(raw.dataType)))return []
  const type=raw.dataType as DevicePropertyChoice['type']
  return [{key,name:typeof raw.name==='string'&&raw.name?raw.name:key,type,...(type==='SWITCH'?{switchEncoding:frozenSwitchEncoding(raw)}:{}),...(type==='ENUM'?{enumOptions:frozenEnumOptions(raw)}:{})}]
 })
}
