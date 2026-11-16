import {api} from '@/core/http'
import type {paths} from '@/core/contracts'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {devicePath} from './api'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const instant=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const states=['VALUE','NO_VALUE','SOURCE_VERSION_UNKNOWN','SOURCE_MODEL_MISMATCH','CONTRACT_MISMATCH'] as const
export type PropertySourceState=typeof states[number]
export type PropertySourceValue=Readonly<{state:PropertySourceState;value:StrictJsonValue|null;modelVersionId:string|null;occurredAt:string|null;updatedAt:string|null;operationId:string|null}>
export type PropertySourceItem=Readonly<{propertyKey:string;reported:PropertySourceValue;downlink:PropertySourceValue;cloud:PropertySourceValue}>

function object(value:StrictJsonValue|undefined):StrictJsonObject{
 if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))throw new Error('属性来源响应不是完整对象')
 return value as StrictJsonObject
}
function closed(value:StrictJsonObject,fields:readonly string[]){
 if(Object.keys(value).length!==fields.length||fields.some(field=>!Object.hasOwn(value,field)))throw new Error('属性来源响应字段不符合合同')
}
function nullable(value:StrictJsonValue|undefined):value is null{return value===null}
function text(value:StrictJsonValue|undefined):value is string{return typeof value==='string'}
function time(value:StrictJsonValue|undefined):value is string{return text(value)&&instant.test(value)&&Number.isFinite(Date.parse(value))}
function id(value:StrictJsonValue|undefined):value is string{return text(value)&&uuid.test(value)}
/** 读取1至50个属性的三个独立来源；原始字节经唯一严格读取器，避免大数被JS浮点改写。 */
export async function readDevicePropertySources(project:string,device:string,model:string,keys:readonly string[],signal?:AbortSignal){
 if(!keys.length||keys.length>50||new Set(keys).size!==keys.length)throw new Error('属性来源读取范围不合法')
 const query:NonNullable<paths['/api/v1/projects/{projectId}/devices/{deviceId}/platform-properties/sources']['get']['parameters']['query']>={expectedModelVersionId:model,propertyKeys:[...keys]}
 const bytes=await api<Uint8Array>(`${devicePath(project,device)}/platform-properties/sources`,{query,responseType:'bytes',maxResponseBytes:1048576,signal})
 return decodeDevicePropertySources(bytes,project,device,model,keys)
}
/** 每键三段均须完整返回；坏来源使整批不可展示，不以其它来源顶替。 */
export function decodeDevicePropertySources(bytes:Uint8Array,project:string,device:string,model:string,keys:readonly string[]):PropertySourceItem[]{
 const response=parseDashboardRuntimeResponse(bytes);closed(response,['projectId','deviceId','modelVersionId','values'])
 if(response.projectId!==project||response.deviceId!==device||response.modelVersionId!==model)throw new Error('属性来源项目、设备或模型身份不匹配')
 if(!Array.isArray(response.values)||response.values.length!==keys.length)throw new Error('属性来源响应不完整')
 return response.values.map((raw,index)=>{
  const item=object(raw),key=keys[index]!
  closed(item,['propertyKey','reported','downlink','cloud'])
  if(item.propertyKey!==key)throw new Error('属性来源身份或顺序不匹配')
  return Object.freeze({propertyKey:key,reported:sourceValue(item.reported,'reported'),downlink:sourceValue(item.downlink,'platform'),cloud:sourceValue(item.cloud,'platform')})
 })
}
function sourceValue(raw:StrictJsonValue|undefined,origin:'reported'|'platform'):PropertySourceValue{
 const value=object(raw);closed(value,['state','value','modelVersionId','occurredAt','updatedAt','operationId'])
 const state=value.state
 if(!text(state)||!(states as readonly string[]).includes(state))throw new Error('属性来源状态不合法')
 const parsed=state as PropertySourceState
 if(parsed!=='VALUE'){
  if(['value','modelVersionId','occurredAt','updatedAt','operationId'].some(field=>!nullable(value[field])))throw new Error('空来源夹带未证明的值')
  if(parsed!=='NO_VALUE')throw new Error('属性来源状态不可展示，请刷新核对')
  return Object.freeze({state:parsed,value:null,modelVersionId:null,occurredAt:null,updatedAt:null,operationId:null})
 }
 if(value.value===null||value.value===undefined||!id(value.modelVersionId))throw new Error('属性来源值或模型不完整')
 if(origin==='reported'){
  if(!time(value.occurredAt)||!nullable(value.updatedAt)||!nullable(value.operationId))throw new Error('设备来源采集时间或身份不完整')
 }else if(!time(value.updatedAt)||!id(value.operationId)||!nullable(value.occurredAt))throw new Error('平台来源受理时间或身份不完整')
 return Object.freeze({state:parsed,value:value.value,modelVersionId:value.modelVersionId,occurredAt:value.occurredAt as string|null,updatedAt:value.updatedAt as string|null,operationId:value.operationId as string|null})
}
