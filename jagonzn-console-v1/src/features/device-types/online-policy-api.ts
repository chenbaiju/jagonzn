import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {typeDeviceUuid} from './type-devices-api'
export type OnlinePolicy=Readonly<Required<Schema<'DeviceTypeOnlinePolicyResponse'>>>
export type OnlinePolicyIntent=Readonly<{project:string;typeId:string;key:string;body:Readonly<Required<Schema<'ChangeDeviceTypeOnlinePolicyRequest'>>>}>
export type OnlinePolicyTransport={read:(project:string,typeId:string,signal:AbortSignal)=>Promise<OnlinePolicy>;change:(intent:OnlinePolicyIntent,signal:AbortSignal)=>Promise<OnlinePolicy>}
function path(project:string,typeId:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId))throw new Error('类型范围无效');return `/api/v1/projects/${project}/device-types/${typeId}/online-policy` as const}
export function decodeOnlinePolicy(value:unknown,typeId:string):OnlinePolicy{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('逻辑在线策略回执不完整');const raw=value as Record<string,unknown>
 if(Object.keys(raw).length!==3||raw.deviceTypeId!==typeId||!(raw.onlineTimeoutMinutes===null||typeof raw.onlineTimeoutMinutes==='number'&&Number.isInteger(raw.onlineTimeoutMinutes)&&raw.onlineTimeoutMinutes>=1&&raw.onlineTimeoutMinutes<=5000)||typeof raw.revision!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(raw.revision)||BigInt(raw.revision)>9223372036854775807n)throw new Error('逻辑在线策略身份或版本不符合合同')
 return Object.freeze({deviceTypeId:typeId,onlineTimeoutMinutes:raw.onlineTimeoutMinutes as number|null,revision:raw.revision})
}
export function prepareOnlinePolicy(project:string,typeId:string,current:OnlinePolicy,enabled:boolean,minutes:number|undefined):OnlinePolicyIntent{path(project,typeId);decodeOnlinePolicy(current,typeId);if(enabled&&(minutes===undefined||!Number.isInteger(minutes)||minutes<1||minutes>5000))throw new Error('在线超时须为1至5000分钟的整数');return Object.freeze({project,typeId,key:crypto.randomUUID(),body:Object.freeze({revision:current.revision,onlineTimeoutMinutes:enabled?minutes!:null})})}
export const onlinePolicyTransport:OnlinePolicyTransport={
 async read(project,typeId,signal){return decodeOnlinePolicy(await api<Schema<'DeviceTypeOnlinePolicyResponse'>>(path(project,typeId),{signal,maxResponseBytes:8192}),typeId)},
 async change(intent,signal){return decodeOnlinePolicy(await api<Schema<'DeviceTypeOnlinePolicyResponse'>>(path(intent.project,intent.typeId),{method:'put',headers:{'Idempotency-Key':intent.key},body:intent.body,signal,maxResponseBytes:8192}),intent.typeId)}
}
