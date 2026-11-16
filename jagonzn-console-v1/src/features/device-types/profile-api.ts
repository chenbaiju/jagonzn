import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {validateTagRows,tagKeyError,tagValueError,type DeviceTagRow} from '../devices/tag-rules'

type Type=NonNullable<Schema<'DeviceTypeProfileResponse'>['type']>
type CheckedType=Readonly<Type&Required<Pick<Type,'id'|'projectId'|'name'|'deviceKind'|'networkType'|'payloadProtocol'|'status'>>>
export type TypeProfile=Readonly<Required<Omit<Schema<'DeviceTypeProfileResponse'>,'type'|'tags'>>&{type:CheckedType;tags:Readonly<NonNullable<Schema<'DeviceTypeProfileResponse'>['tags']>>}>
export type TypeInitialDataStream=Readonly<NonNullable<Required<Schema<'InitialDeviceTypeDataStreamRequest'>>>>
export type TypeCreateBody=Readonly<Required<Omit<Schema<'CreateDeviceTypeProfileRequest'>,'initialDataStream'>>&{initialDataStream?:TypeInitialDataStream|null}>
export type TypeCreateIntent=Readonly<{project:string;key:string;body:TypeCreateBody}>
type TypeAccess=Readonly<Required<Schema<'DeviceTypeProfileAccessRequest'>>>
type TypeEditability=Schema<'DeviceTypeAccessEditabilityResponse'>['editability']
type TypeUpdateBody=Readonly<Required<Omit<Schema<'ChangeDeviceTypeProfileRequest'>,'access'>>&{access?:TypeAccess}>
export type TypeUpdateIntent=Readonly<{project:string;id:string;key:string;body:TypeUpdateBody}>
export type TypeCreation=Readonly<Required<Schema<'DeviceTypeCreationResponse'>>>
export type TypeProfileTransport={read:(project:string,id:string,signal:AbortSignal)=>Promise<TypeProfile>;create:(intent:TypeCreateIntent,signal:AbortSignal)=>Promise<TypeProfile>;recover:(intent:TypeCreateIntent,signal:AbortSignal)=>Promise<TypeCreation>;update:(intent:TypeUpdateIntent,signal:AbortSignal)=>Promise<TypeProfile>;accessEditability:(project:string,id:string,signal:AbortSignal)=>Promise<TypeEditability>}
export type TypeProfileDraft={name:string;description:string;tags:DeviceTagRow[]}
export type TypeCreateDraft=TypeProfileDraft&{deviceKind:string;networkType:string;payloadProtocol:string;defaultStream:boolean;initialFormat?:string;initialTcpTarget?:boolean}
export const typeKinds=[['DIRECT','直连设备'],['SUB_DEVICE','网关子设备'],['GATEWAY','网关']] as const
export const directNetworks=[['WIFI','WiFi'],['ETHERNET','以太网'],['CELLULAR_2G','蜂窝网络 2G'],['CELLULAR_3G','蜂窝网络 3G'],['CELLULAR_4G','蜂窝网络 4G'],['CELLULAR_5G','蜂窝网络 5G'],['NB_IOT','NB-IoT'],['OTHER','其它']] as const
export const subNetworks=[['WIFI','WiFi'],['ETHERNET','以太网'],['RS485','RS485'],['RS232','RS232'],['RS422','RS422'],['LORA','LoRa'],['ZIGBEE','Zigbee'],['BLE','蓝牙/BLE'],['OTHER','其它']] as const
export const typeNetworks=(kind:string)=>kind==='SUB_DEVICE'?subNetworks:directNetworks
export function typeProtocols(kind:string):readonly (readonly [string,string])[]{return kind==='GATEWAY'?[['STANDARD_GATEWAY','ThingsLink 标准网关协议'],['MODBUS_RTU_CLOUD_GATEWAY','Modbus RTU 云网关'],['CUSTOM_GATEWAY','自定义']]:kind==='SUB_DEVICE'?[['STANDARD','ThingsLink 标准接入协议'],['MODBUS_RTU_PASSTHROUGH','Modbus RTU 透传'],['OTHER','其它']]:[['STANDARD','ThingsLink 标准接入协议'],['MODBUS_RTU_PASSTHROUGH','Modbus RTU 透传'],['MODBUS_TCP_PASSTHROUGH','Modbus TCP 透传'],['OTHER','其它']]}
export function typeProfileId(value:unknown):value is string{return typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)}
const revision=(v:unknown):v is string=>typeof v==='string'&&/^(0|[1-9]\d{0,18})$/.test(v)&&BigInt(v)<=9223372036854775807n
const token=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)
function invalid():never{throw new Error('设备类型资料不完整或范围不符，请重新读取')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();return value as Record<string,unknown>}
function tags(value:unknown):Readonly<Record<string,string>>{const source=object(value),entries=Object.entries(source);if(entries.length>20||entries.some(([key,value])=>typeof value!=='string'||tagKeyError(key)||tagValueError(value as string)))invalid();return Object.freeze({...source}) as Readonly<Record<string,string>>}
/** 从唯一正式业务合同派生已校验视图；版本与CAS原文不经过浮点数。 */
export function decodeTypeProfile(value:unknown,project:string,id?:string):TypeProfile{
 const raw=object(value),type=object(raw.type)
 if(!typeProfileId(project)||Object.keys(raw).length!==5||!['type','description','tags','revision','profileToken'].every(key=>Object.hasOwn(raw,key))||!typeProfileId(type.id)||id!==undefined&&type.id!==id||type.projectId!==project
  ||typeof type.name!=='string'||!type.name.trim()||type.name.length>128||!typeKinds.some(([key])=>key===type.deviceKind)||!['DRAFT','PUBLISHED'].includes(String(type.status))
  ||!['WIFI','ETHERNET','CELLULAR_2G','CELLULAR_3G','CELLULAR_4G','CELLULAR_5G','NB_IOT','BLE','ZIGBEE','LORA','RS485','RS232','RS422','OTHER'].includes(String(type.networkType))
  ||!['STANDARD','MODBUS_RTU_PASSTHROUGH','MODBUS_TCP_PASSTHROUGH','STANDARD_GATEWAY','MODBUS_RTU_CLOUD_GATEWAY','OTHER','CUSTOM_GATEWAY'].includes(String(type.payloadProtocol))||!(raw.description===null||typeof raw.description==='string'&&raw.description.length<=500)||!revision(raw.revision)||!token(raw.profileToken))invalid()
 return Object.freeze({type:Object.freeze({...type}) as TypeProfile['type'],description:raw.description as string|null,tags:tags(raw.tags),revision:raw.revision,profileToken:raw.profileToken})
}
export function decodeTypeCreation(value:unknown):TypeCreation{const raw=object(value);if(Object.keys(raw).length!==2||!typeProfileId(raw.deviceTypeId)||typeof raw.deleted!=='boolean')invalid();return Object.freeze({deviceTypeId:raw.deviceTypeId,deleted:raw.deleted})}
export function typeProfileDraft(profile?:TypeProfile):TypeProfileDraft{return{name:profile?.type.name||'',description:profile?.description||'',tags:profile?Object.entries(profile.tags).map(([key,value])=>({key,value})):[{key:'',value:''}]}}
function normalized(draft:TypeProfileDraft){const name=draft.name.trim(),description=draft.description.trim();if(!name||name.length>128)throw new Error('类型名称为1至128个字符');if(description.length>500)throw new Error('描述最多500个字符');return{name,description,tags:Object.freeze(Object.fromEntries(validateTagRows(draft.tags).map(row=>[row.key,row.value])))}}
export function prepareTypeCreation(project:string,draft:TypeCreateDraft):TypeCreateIntent{
 if(!typeProfileId(project))invalid()
 if(draft.defaultStream&&(!['HEX','TEXT','JSON'].includes(draft.initialFormat||'')||draft.initialTcpTarget!==undefined&&typeof draft.initialTcpTarget!=='boolean'))throw new Error('请选择已接入的默认数据流消息格式')
 const networks=draft.deviceKind==='SUB_DEVICE'?subNetworks:directNetworks
 if(!typeKinds.some(([key])=>key===draft.deviceKind)||!networks.some(([key])=>key===draft.networkType)||!typeProtocols(draft.deviceKind).some(([key])=>key===draft.payloadProtocol))throw new Error('请选择已接入的通信方式和接入协议')
 return Object.freeze({project,key:crypto.randomUUID(),body:Object.freeze({...normalized(draft),deviceKind:draft.deviceKind as TypeCreateBody['deviceKind'],networkType:draft.networkType as TypeCreateBody['networkType'],payloadProtocol:draft.payloadProtocol as TypeCreateBody['payloadProtocol'],...(draft.defaultStream?{initialDataStream:Object.freeze({format:draft.initialFormat as TypeInitialDataStream['format'],tcpTarget:draft.initialTcpTarget??false})}:{})})})
}
export type TypeAccessDraft={deviceKind:string;networkType:string;payloadProtocol:string}
export function typeAccessDraft(type?:CheckedType):TypeAccessDraft{
 return {deviceKind:type?.deviceKind||'',networkType:type?.networkType||'',payloadProtocol:type?.payloadProtocol||''}
}
function sameAccess(type:CheckedType,access:TypeAccessDraft){return type.deviceKind===access.deviceKind&&type.networkType===access.networkType&&type.payloadProtocol===access.payloadProtocol}
export function prepareTypeUpdate(project:string,profile:TypeProfile,draft:TypeProfileDraft,access?:TypeAccessDraft):TypeUpdateIntent{
 if(profile.type.projectId!==project||!typeProfileId(profile.type.id)||!revision(profile.revision)||!token(profile.profileToken))invalid()
 const body=normalized(draft)
 let changed:TypeAccess|undefined
 if(access&&!sameAccess(profile.type,access)){
  if(profile.type.status!=='DRAFT')throw new Error('已发布类型的接入配置只读')
  if(!typeKinds.some(([key])=>key===access.deviceKind)
   ||!typeNetworks(access.deviceKind).some(([key])=>key===access.networkType)
   ||!typeProtocols(access.deviceKind).some(([key])=>key===access.payloadProtocol))throw new Error('请选择设备通信方式和接入协议')
  changed=Object.freeze({...access}) as TypeAccess
 }
 return Object.freeze({project,id:profile.type.id,key:crypto.randomUUID(),body:Object.freeze({...body,revision:profile.revision,profileToken:profile.profileToken,...(changed?{access:changed}:{})})})
}
export function profileMatches(profile:TypeProfile,body:Pick<TypeUpdateBody,'name'|'description'|'tags'|'access'>){return profile.type.name===body.name&&profile.description===(body.description||null)&&Object.keys(profile.tags).length===Object.keys(body.tags).length&&Object.entries(body.tags).every(([key,value])=>Object.hasOwn(profile.tags,key)&&profile.tags[key]===value)&&(!body.access||sameAccess(profile.type,body.access))}
export function creationMatches(profile:TypeProfile,body:TypeCreateBody){return profileMatches(profile,body)&&profile.type.deviceKind===body.deviceKind&&profile.type.networkType===body.networkType&&profile.type.payloadProtocol===body.payloadProtocol&&profile.type.status==='DRAFT'}
const base=(project:string)=>{if(!typeProfileId(project))invalid();return `/api/v1/projects/${project}` as const}
const path=(project:string,id:string)=>{if(!typeProfileId(id))invalid();return `${base(project)}/device-types/${id}/profile` as const}
export const typeProfileTransport:TypeProfileTransport={
 async read(project,id,signal){return decodeTypeProfile(await api<unknown>(path(project,id),{signal}),project,id)},
 async create(intent,signal){return decodeTypeProfile(await api<unknown>(`${base(intent.project)}/device-type-profiles`,{method:'post',body:intent.body,headers:{'Idempotency-Key':intent.key},signal}),intent.project)},
 async recover(intent,signal){return decodeTypeCreation(await api<unknown>(`${base(intent.project)}/device-type-creations/by-key`,{headers:{'Original-Request-Key':intent.key},signal}))},
 async update(intent,signal){return decodeTypeProfile(await api<unknown>(path(intent.project,intent.id),{method:'put',body:intent.body,headers:{'Idempotency-Key':intent.key},signal}),intent.project,intent.id)},
 async accessEditability(project,id,signal){
  const result=object(await api<unknown>(`${path(project,id)}/access-editability`,{signal})).editability
  if(result!=='EDITABLE'&&result!=='PUBLISHED'&&result!=='ASSOCIATED_DEVICES'&&result!=='ACTIVE_ACCESS_CONFIGURATION')invalid()
  return result
 },
}
