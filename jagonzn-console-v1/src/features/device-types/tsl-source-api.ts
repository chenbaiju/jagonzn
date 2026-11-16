import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'
import {propertyValueText} from '../devices/property-decoder'
import {typeProfileId} from './profile-api'
import {decodePropertyList,type PropertyDefinition} from './property-definition-api'
import {decodeEventDefinitions,type EventDefinition} from './event-definition-api'
import {decodeCommandList,type CommandDefinition} from './command-definition-api'

type Contract=Schema<'DeviceTypeTslSourceResponse'>
export type TslSource=Readonly<Required<Pick<Contract,'deviceTypeId'|'name'|'description'>>&{properties:readonly PropertyDefinition[];events:readonly EventDefinition[];commands:readonly CommandDefinition[]}>
export type TslSourceTransport={read:(project:string,typeId:string,signal:AbortSignal)=>Promise<TslSource>}
/** 当前元信息与三表只接受一个服务端快照；数值不经过浮点反序列化。 */
export function decodeTslSource(bytes:Uint8Array,typeId:string):TslSource{
 const raw=parseDashboardRuntimeResponse(bytes),fields=['deviceTypeId','name','description','properties','events','commands']
 if(!typeProfileId(typeId)||Object.keys(raw).length!==fields.length||fields.some(key=>!Object.hasOwn(raw,key))||raw.deviceTypeId!==typeId||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>128||!(raw.description===null||typeof raw.description==='string'&&raw.description.length<=500)||!Array.isArray(raw.properties)||!Array.isArray(raw.events)||!Array.isArray(raw.commands))throw new Error('当前类型的TSL资料不完整或范围不符，请重新读取')
 const encode=(key:string)=>new TextEncoder().encode(propertyValueText(raw[key]!))
 // 事件数值仅有有界排序号；参数Schema仍是字符串，其内部精确JSON从未经此解析。
 return Object.freeze({deviceTypeId:typeId,name:raw.name,description:raw.description,properties:decodePropertyList(encode('properties'),typeId),events:decodeEventDefinitions(JSON.parse(propertyValueText(raw.events!)),typeId),commands:decodeCommandList(encode('commands'),typeId)})
}
export const tslSourceTransport:TslSourceTransport={async read(project,typeId,signal){
 if(!typeProfileId(project)||!typeProfileId(typeId))throw new Error('TSL读取范围无效')
 return decodeTslSource(await api<Uint8Array>(`/api/v1/projects/${project}/device-types/${typeId}/thing-model-tsl-source`,{signal,responseType:'bytes',maxResponseBytes:4*1024*1024}),typeId)
}}
