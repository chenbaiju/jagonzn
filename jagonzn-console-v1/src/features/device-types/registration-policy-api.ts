import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {typeDeviceUuid} from './type-devices-api'

export type RegistrationPolicy=Readonly<Required<Schema<'DeviceTypeRegistrationPolicyResponse'>>>
export type RegistrationPolicyIntent=Readonly<{project:string;typeId:string;key:string;body:Readonly<Required<Schema<'ChangeDeviceTypeRegistrationPolicyRequest'>>>}>
export type RegistrationPolicyTransport={read:(project:string,typeId:string,signal:AbortSignal)=>Promise<RegistrationPolicy>;change:(intent:RegistrationPolicyIntent,signal:AbortSignal)=>Promise<RegistrationPolicy>}
function path(project:string,typeId:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId))throw new Error('类型范围无效');return `/api/v1/projects/${project}/device-types/${typeId}/registration-policy` as const}
export function decodeRegistrationPolicy(value:unknown,typeId:string):RegistrationPolicy{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('自动创建策略回执不完整')
 const raw=value as Record<string,unknown>
 if(Object.keys(raw).length!==3||raw.deviceTypeId!==typeId||typeof raw.automaticCreationEnabled!=='boolean'||typeof raw.revision!=='string'||! /^(0|[1-9][0-9]{0,18})$/.test(raw.revision)||BigInt(raw.revision)>9223372036854775807n)throw new Error('自动创建策略身份或版本不符合合同')
 return Object.freeze({deviceTypeId:typeId,automaticCreationEnabled:raw.automaticCreationEnabled,revision:raw.revision})
}
export function prepareRegistrationPolicy(project:string,typeId:string,current:RegistrationPolicy,enabled:boolean):RegistrationPolicyIntent{
 path(project,typeId);decodeRegistrationPolicy(current,typeId)
 return Object.freeze({project,typeId,key:crypto.randomUUID(),body:Object.freeze({revision:current.revision,automaticCreationEnabled:enabled})})
}
export const registrationPolicyTransport:RegistrationPolicyTransport={
 async read(project,typeId,signal){return decodeRegistrationPolicy(await api<Schema<'DeviceTypeRegistrationPolicyResponse'>>(path(project,typeId),{signal,maxResponseBytes:16*1024}),typeId)},
 async change(intent,signal){return decodeRegistrationPolicy(await api<Schema<'DeviceTypeRegistrationPolicyResponse'>>(path(intent.project,intent.typeId),{method:'put',headers:{'Idempotency-Key':intent.key},body:intent.body,signal,maxResponseBytes:16*1024}),intent.typeId)}
}
