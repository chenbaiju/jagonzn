import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {referenceVersion} from './reference-profile'

export type DeviceTopologyBinding=Readonly<Required<Omit<Schema<'DeviceTopologyResponse'>,'unboundAt'>>&{unboundAt:null}>
export type DeviceTopologyAddressIntent=Readonly<{project:string;gatewayId:string;subDeviceId:string;key:string;expectedRevision:string;body:Readonly<Required<Schema<'DeviceTopologyAddressChangeRequest'>>>}>
export type DeviceTopologyAddressTransport={list:(project:string,gatewayId:string,signal:AbortSignal)=>Promise<readonly DeviceTopologyBinding[]>;change:(intent:DeviceTopologyAddressIntent,signal:AbortSignal)=>Promise<DeviceTopologyBinding>}
const invalid=()=>new Error('子设备绑定或地址回执不完整，请重新读取核对')
const address=(value:unknown):value is string|null=>value===null||typeof value==='string'&&/^[A-Za-z0-9._:-]{1,64}$/.test(value)
function scope(project:string,gateway:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(gateway))throw invalid()}
/** 只承接当前网关的有效绑定；关闭行或其它网关不能作为编辑前提。 */
export function decodeDeviceTopologyBinding(value:unknown,gateway:string):DeviceTopologyBinding{
 if(!value||typeof value!=='object'||Array.isArray(value))throw invalid()
 const row=value as Record<string,unknown>,keys=['id','gatewayDeviceId','subDeviceId','bindSource','onlineStatus','boundAt','subDeviceAddress','addressRevision']
 if(keys.some(k=>!Object.hasOwn(row,k))||Object.keys(row).some(k=>!keys.includes(k)&&k!=='unboundAt')
  ||typeof row.id!=='string'||!typeDeviceUuid.test(row.id)||row.gatewayDeviceId!==gateway||typeof row.subDeviceId!=='string'||!typeDeviceUuid.test(row.subDeviceId)||row.subDeviceId===gateway
  ||!['CONTROL_PLANE','LEGACY_BACKFILL','GATEWAY_REPORTED'].includes(String(row.bindSource))||!['UNKNOWN','ONLINE','OFFLINE'].includes(String(row.onlineStatus))
  ||typeof row.boundAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(row.boundAt)||!Number.isFinite(Date.parse(row.boundAt))
  ||row.unboundAt!==undefined&&row.unboundAt!==null||!address(row.subDeviceAddress)||!referenceVersion(row.addressRevision))throw invalid()
 return Object.freeze({...row,unboundAt:null}) as DeviceTopologyBinding
}
export function decodeDeviceTopologyBindings(value:unknown,gateway:string):readonly DeviceTopologyBinding[]{
 if(!Array.isArray(value))throw invalid()
 const ids=new Set<string>(),children=new Set<string>(),addresses=new Set<string>()
 return Object.freeze(value.map(item=>{const row=decodeDeviceTopologyBinding(item,gateway);if(ids.has(row.id)||children.has(row.subDeviceId)||row.subDeviceAddress!==null&&addresses.has(row.subDeviceAddress))throw invalid();ids.add(row.id);children.add(row.subDeviceId);if(row.subDeviceAddress!==null)addresses.add(row.subDeviceAddress);return row}))
}
/** 本次选择冻结原绑定和地址代次；空输入不隐式清除，清除必须显式选择。 */
export function prepareDeviceTopologyAddress(project:string,gatewayId:string,before:DeviceTopologyBinding,value:string|null):DeviceTopologyAddressIntent{
 scope(project,gatewayId);decodeDeviceTopologyBinding(before,gatewayId)
 if(!address(value))throw new Error('子设备地址须为1至64位字母、数字或 . _ : -，清除请使用清除地址')
 const next=BigInt(before.addressRevision)+(value===before.subDeviceAddress?0n:1n)
 if(next>9223372036854775807n)throw invalid()
 return Object.freeze({project,gatewayId,subDeviceId:before.subDeviceId,key:crypto.randomUUID(),expectedRevision:String(next),body:Object.freeze({bindingId:before.id,expectedAddressRevision:before.addressRevision,subDeviceAddress:value})})
}
export function deviceTopologyAddressMatches(row:DeviceTopologyBinding,intent:DeviceTopologyAddressIntent){return row.id===intent.body.bindingId&&row.gatewayDeviceId===intent.gatewayId&&row.subDeviceId===intent.subDeviceId&&row.addressRevision===intent.expectedRevision&&row.subDeviceAddress===intent.body.subDeviceAddress}
const path=(p:string)=>`/api/v1/projects/${p}/device-topologies` as const
export const deviceTopologyAddressTransport:DeviceTopologyAddressTransport={
 async list(project,gateway,signal){scope(project,gateway);return decodeDeviceTopologyBindings(await api(path(project),{query:{gatewayId:gateway},signal}),gateway)},
 async change(intent,signal){scope(intent.project,intent.gatewayId);const value=await api(`${path(intent.project)}/${intent.subDeviceId}/address`,{method:'put',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,maxResponseBytes:8192});try{return decodeDeviceTopologyBinding(value,intent.gatewayId)}catch{throw new ApiError('子设备地址保存回执不完整，原结果尚未确认',200,undefined,undefined,true)}}
}
