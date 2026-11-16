import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {typeDeviceUuid} from './type-devices-api'
import {propertyTransport} from './property-definition-api'
import {modelVersionTransport} from './model-version-api'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
export type LocationPolicy=Readonly<Schema<'DeviceTypeLocationPolicyResponse'>>
export type LocationPolicyIntent=Readonly<{project:string;typeId:string;key:string;body:Readonly<Schema<'ChangeDeviceTypeLocationPolicyRequest'>>}>
export type LocationPolicyTransport={read:(project:string,typeId:string,signal:AbortSignal)=>Promise<LocationPolicy>;change:(intent:LocationPolicyIntent,signal:AbortSignal)=>Promise<LocationPolicy>;choices?:(project:string,typeId:string,status:string|undefined,signal:AbortSignal)=>Promise<readonly string[]>}
function path(project:string,typeId:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId))throw new Error('类型范围无效');return `/api/v1/projects/${project}/device-types/${typeId}/location-policy` as const}
export function decodeLocationPolicy(value:unknown,typeId:string):LocationPolicy{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('地理坐标策略回执不完整');const raw=value as Record<string,unknown>
 if(Object.keys(raw).some(key=>!['deviceTypeId','mode','revision','propertyKey','preferReported','showInUserApp'].includes(key))||raw.deviceTypeId!==typeId||!['LEGACY_MANUAL','DISABLED','MANUAL','REPORTED'].includes(String(raw.mode))||typeof raw.revision!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(raw.revision)||BigInt(raw.revision)>9223372036854775807n)throw new Error('地理坐标策略身份或版本不符合合同')
 if(raw.mode==='REPORTED'&&(typeof raw.propertyKey!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(raw.propertyKey)))throw new Error('上报位置属性键无效')
 if(raw.mode!=='REPORTED'&&Object.hasOwn(raw,'propertyKey')||raw.preferReported===true&&raw.mode!=='REPORTED'||raw.showInUserApp===true&&raw.mode==='DISABLED'||['preferReported','showInUserApp'].some(key=>Object.hasOwn(raw,key)&&typeof raw[key]!=='boolean'))throw new Error('地理坐标策略开关不符合合同')
 return Object.freeze({deviceTypeId:typeId,mode:raw.mode as LocationPolicy['mode'],revision:raw.revision,
  ...(raw.mode==='REPORTED'?{propertyKey:raw.propertyKey as string}:{}),
  ...(raw.preferReported===true?{preferReported:true}:{}),
  ...(raw.showInUserApp===true?{showInUserApp:true}:{})})
}
export function prepareLocationPolicy(project:string,typeId:string,current:LocationPolicy,enabled:boolean,showInUserApp?:boolean):LocationPolicyIntent{path(project,typeId);decodeLocationPolicy(current,typeId);return Object.freeze({project,typeId,key:crypto.randomUUID(),body:Object.freeze({revision:current.revision,mode:enabled?'MANUAL':'DISABLED',...(enabled&&showInUserApp!==undefined?{showInUserApp}:{})})})}
export function prepareReportedLocationPolicy(project:string,typeId:string,current:LocationPolicy,key:string,preferReported?:boolean,showInUserApp?:boolean):LocationPolicyIntent{path(project,typeId);decodeLocationPolicy(current,typeId);if(!/^[A-Za-z0-9_-]{1,64}$/.test(key))throw new Error('请选择合格的上报位置属性');return Object.freeze({project,typeId,key:crypto.randomUUID(),body:Object.freeze({revision:current.revision,mode:'REPORTED',propertyKey:key,...(preferReported===undefined?{}:{preferReported}),...(showInUserApp===undefined?{}:{showInUserApp})})})}
function object(value:unknown):Record<string,unknown>|undefined{return value&&typeof value==='object'&&!Array.isArray(value)&&!isStrictJsonNumber(value as StrictJsonValue)?value as Record<string,unknown>:undefined}
export function eligibleReportedLocationKey(definition:unknown):boolean{const d=object(definition),schema=object(d?.schema),properties=object(schema?.properties),lat=object(properties?.lat),lng=object(properties?.lng),required=schema?.required;return d?.dataType==='OBJECT'&&['REPORT','SHARED','UNDEFINED'].includes(String(d.accessType))&&schema?.type==='object'&&schema.additionalProperties===false&&!!properties&&Object.keys(properties).length===2&&!!lat&&!!lng&&lat.type==='number'&&lng.type==='number'&&Array.isArray(required)&&required.length===2&&new Set(required).size===2&&required.includes('lat')&&required.includes('lng')}
export const locationPolicyTransport:LocationPolicyTransport={
 async choices(project,typeId,status,signal){if(status==='DRAFT'){const definitions=await propertyTransport.list(project,typeId,signal);return Object.freeze(definitions.filter(d=>eligibleReportedLocationKey({...d,schema:d.schema?parseDashboardRuntimeResponse(new TextEncoder().encode(d.schema)):null})).map(d=>d.propertyKey).sort())}if(status==='PUBLISHED'){const latest=await modelVersionTransport.latest(project,typeId,signal),snapshot=await modelVersionTransport.snapshot(project,typeId,latest.id,signal,latest),properties=object(snapshot.modelSnapshot.properties);if(!properties)throw new Error('固定模型属性不完整');return Object.freeze(Object.keys(properties).filter(key=>eligibleReportedLocationKey(properties[key])).sort())}throw new Error('当前类型状态不可读，暂不能选择上报属性')},
 async read(project,typeId,signal){return decodeLocationPolicy(await api<Schema<'DeviceTypeLocationPolicyResponse'>>(path(project,typeId),{signal,maxResponseBytes:8192}),typeId)},
 async change(intent,signal){return decodeLocationPolicy(await api<Schema<'DeviceTypeLocationPolicyResponse'>>(path(intent.project,intent.typeId),{method:'put',headers:{'Idempotency-Key':intent.key},body:intent.body,signal,maxResponseBytes:8192}),intent.typeId)}
}
