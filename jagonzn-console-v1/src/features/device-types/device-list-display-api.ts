import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {propertyValueText} from '../devices/property-decoder'
import {switchState} from '../devices/switch-value'
import {propertyTransport,type PropertyDefinition} from './property-definition-api'
import {typeDeviceUuid} from './type-devices-api'
export type DeviceListDisplay=Readonly<Required<Schema<'DeviceTypeDeviceListDisplayResponse'>>>
export type DeviceListDisplayIntent=Readonly<{project:string;typeId:string;key:string;body:Readonly<Required<Schema<'ChangeDeviceTypeDeviceListDisplayRequest'>>>}>
export type DisplayProperty=Readonly<Pick<PropertyDefinition,'propertyKey'|'name'|'dataType'>>
type BoundDefinition=Readonly<Required<Schema<'DeviceTypeDevicePropertyDefinition'>>>
export type DeviceListPropertyCell=Readonly<{propertyKey:string;state:string;definition:BoundDefinition|null;text:string;occurredAt?:string}>
export type DeviceListPropertyValues=Readonly<Record<string,Readonly<Record<string,DeviceListPropertyCell>>>>
export type DeviceListDisplayTransport={read:(project:string,typeId:string,signal:AbortSignal)=>Promise<DeviceListDisplay>;choices:(project:string,typeId:string,signal:AbortSignal)=>Promise<readonly DisplayProperty[]>;change:(intent:DeviceListDisplayIntent,signal:AbortSignal)=>Promise<DeviceListDisplay>;query:(project:string,typeId:string,deviceIds:readonly string[],propertyKeys:readonly string[],signal:AbortSignal)=>Promise<DeviceListPropertyValues>}
const keyPattern=/^[A-Za-z0-9_-]{1,64}$/,types=['NUMBER','SWITCH','TEXT','ENUM','OBJECT','LIST'],states=['VALUE','NO_VALUE','UNBOUND','NOT_DEFINED','SOURCE_VERSION_UNKNOWN','SOURCE_MODEL_MISMATCH','CONTRACT_MISMATCH']
const stateLabels:Record<string,string>={NO_VALUE:'尚无数据',UNBOUND:'未绑定物模型',NOT_DEFINED:'绑定模型未定义此属性',SOURCE_VERSION_UNKNOWN:'数据来源版本未知',SOURCE_MODEL_MISMATCH:'数据来源与绑定模型不一致',CONTRACT_MISMATCH:'数据格式不匹配'}
function fail():never{throw new Error('设备属性显示资料不完整或范围不符，请重新读取')}
function base(project:string,typeId:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId))fail();return `/api/v1/projects/${project}/device-types/${typeId}` as const}
function keys(value:unknown):value is string[]{return Array.isArray(value)&&value.length<=50&&value.every(key=>typeof key==='string'&&keyPattern.test(key))&&new Set(value).size===value.length}
export function decodeDeviceListDisplay(value:unknown,typeId:string):DeviceListDisplay{
 if(!value||typeof value!=='object'||Array.isArray(value))fail();const raw=value as Record<string,unknown>
 if(Object.keys(raw).length!==3||raw.deviceTypeId!==typeId||!keys(raw.propertyKeys)||typeof raw.revision!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(raw.revision)||BigInt(raw.revision)>9223372036854775807n)fail()
 return Object.freeze({deviceTypeId:typeId,propertyKeys:Object.freeze([...raw.propertyKeys]),revision:raw.revision}) as DeviceListDisplay
}
export function prepareDeviceListDisplay(project:string,typeId:string,current:DeviceListDisplay,selected:readonly string[]):DeviceListDisplayIntent{base(project,typeId);decodeDeviceListDisplay(current,typeId);if(!keys(selected))throw new Error('显示属性最多50项，不能重复或包含无效标识符');return Object.freeze({project,typeId,key:crypto.randomUUID(),body:Object.freeze({revision:current.revision,propertyKeys:Object.freeze([...selected])})}) as DeviceListDisplayIntent}
function object(value:StrictJsonValue|undefined):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))fail();return value as StrictJsonObject}
function same(left:readonly string[],right:readonly string[]){return left.length===right.length&&left.every((value,index)=>value===right[index])}
function definition(value:StrictJsonValue|undefined):BoundDefinition|null{
 if(value===null)return null;const raw=object(value),fields=['dataType','unit','enumOptions','onLabel','offLabel','switchEncoding','compositeProfile']
 if(Object.keys(raw).length!==fields.length||fields.some(key=>!Object.hasOwn(raw,key))||!types.includes(String(raw.dataType)))fail()
 for(const key of ['unit','onLabel','offLabel'])if(raw[key]!==null&&(typeof raw[key]!=='string'||raw[key].length>64))fail()
 if(raw.enumOptions!==null&&(!Array.isArray(raw.enumOptions)||raw.enumOptions.length>100||raw.enumOptions.some(value=>typeof value!=='string'||value.length>64)||new Set(raw.enumOptions).size!==raw.enumOptions.length))fail()
 if(raw.switchEncoding!==null&&!['BOOLEAN','NUMBER','TEXT'].includes(String(raw.switchEncoding))||raw.compositeProfile!==null&&raw.compositeProfile!=='BASIC_MIXED_LIST_V1')fail()
 return Object.freeze({...raw,enumOptions:Array.isArray(raw.enumOptions)?Object.freeze([...raw.enumOptions]):null}) as BoundDefinition
}
function cell(value:StrictJsonValue,key:string):DeviceListPropertyCell{
 const raw=object(value),state=String(raw.state),bound=definition(raw.definition),hasValue=state==='VALUE',fields=hasValue?['propertyKey','state','definition','value','occurredAt']:['propertyKey','state','definition']
 if(Object.keys(raw).length!==fields.length||fields.some(field=>!Object.hasOwn(raw,field))||raw.propertyKey!==key||!states.includes(state))fail()
 if(['UNBOUND','NOT_DEFINED'].includes(state)?bound!==null:bound===null)fail()
 if(!hasValue)return Object.freeze({propertyKey:key,state,definition:bound,text:stateLabels[state]!})
 const current=raw.value!;if(!bound||typeof raw.occurredAt!=='string'||!Number.isFinite(Date.parse(raw.occurredAt)))fail()
 if(bound.dataType==='NUMBER'&&!isStrictJsonNumber(current)||['TEXT','ENUM'].includes(bound.dataType)&&typeof current!=='string'||bound.dataType==='SWITCH'&&switchState(current,bound.switchEncoding??'BOOLEAN')===undefined||bound.dataType==='OBJECT'&&(!current||typeof current!=='object'||Array.isArray(current)||isStrictJsonNumber(current))||bound.dataType==='LIST'&&!Array.isArray(current))fail()
 let text=typeof current==='string'?current:propertyValueText(current)
 if(bound.dataType==='SWITCH'){const on=switchState(current,bound.switchEncoding??'BOOLEAN'),label=on?bound.onLabel:bound.offLabel;if(label)text=label}
 if(bound.dataType==='NUMBER'&&bound.unit)text+=' '+bound.unit
 return Object.freeze({propertyKey:key,state,definition:bound,text,occurredAt:raw.occurredAt})
}
export function decodeDeviceListPropertyValues(bytes:Uint8Array,typeId:string,deviceIds:readonly string[],propertyKeys:readonly string[]):DeviceListPropertyValues{
 const raw=object(parseDashboardRuntimeResponse(bytes));if(Object.keys(raw).length!==3||raw.deviceTypeId!==typeId||!keys(raw.propertyKeys)||!same(raw.propertyKeys,propertyKeys)||!Array.isArray(raw.devices)||raw.devices.length!==deviceIds.length)fail()
 const result:Record<string,Readonly<Record<string,DeviceListPropertyCell>>>=Object.create(null)
 for(const value of raw.devices){const item=object(value);if(Object.keys(item).length!==3||typeof item.deviceId!=='string'||!deviceIds.includes(item.deviceId)||Object.hasOwn(result,item.deviceId)||item.modelVersionId!==null&&(typeof item.modelVersionId!=='string'||!typeDeviceUuid.test(item.modelVersionId))||!Array.isArray(item.values)||item.values.length!==propertyKeys.length)fail();const values:Record<string,DeviceListPropertyCell>=Object.create(null)
  item.values.forEach((value,index)=>{const key=propertyKeys[index]!,parsed=cell(value,key);if((item.modelVersionId===null)!==(parsed.state==='UNBOUND'))fail();values[key]=parsed});result[item.deviceId]=Object.freeze(values)
 }
 return Object.freeze(result)
}
export const deviceListDisplayTransport:DeviceListDisplayTransport={
 async read(project,typeId,signal){return decodeDeviceListDisplay(await api<Schema<'DeviceTypeDeviceListDisplayResponse'>>(`${base(project,typeId)}/device-list-display`,{signal,maxResponseBytes:16384}),typeId)},
 async choices(project,typeId,signal){return(await propertyTransport.definitionList!(project,typeId,signal)).items.map(({propertyKey,name,dataType})=>({propertyKey,name,dataType}))},
 async change(intent,signal){return decodeDeviceListDisplay(await api<Schema<'DeviceTypeDeviceListDisplayResponse'>>(`${base(intent.project,intent.typeId)}/device-list-display`,{method:'put',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,maxResponseBytes:16384}),intent.typeId)},
 async query(project,typeId,deviceIds,propertyKeys,signal){if(!deviceIds.length||deviceIds.length>24||new Set(deviceIds).size!==deviceIds.length||deviceIds.some(id=>!typeDeviceUuid.test(id))||!keys(propertyKeys)||!propertyKeys.length)fail();const body:Schema<'QueryDeviceTypeDevicePropertyValuesRequest'>={deviceIds:[...deviceIds],propertyKeys:[...propertyKeys]};return decodeDeviceListPropertyValues(await api<Uint8Array>(`${base(project,typeId)}/device-property-values/query`,{method:'post',body,signal,responseType:'bytes',maxResponseBytes:8*1024*1024}),typeId,deviceIds,propertyKeys)}
}
