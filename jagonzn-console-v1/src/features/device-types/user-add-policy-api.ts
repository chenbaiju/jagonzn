import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {typeDeviceUuid} from './type-devices-api'
export type UserAddPolicy=Readonly<Required<Schema<'DeviceTypeUserAddPolicyResponse'>>>
export type UserAddPolicyIntent=Readonly<{project:string;typeId:string;key:string;body:Readonly<Required<Schema<'UpdateDeviceTypeUserAddPolicyRequest'>>>}>
export type UserAddPolicyTransport={read:(project:string,typeId:string,signal:AbortSignal)=>Promise<UserAddPolicy>;change:(intent:UserAddPolicyIntent,signal:AbortSignal)=>Promise<UserAddPolicy>}
function base(project:string,typeId:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId))throw new Error('设备类型范围无效');return `/api/v1/projects/${project}/device-types/${typeId}/user-add-policy` as const}
export function decodeUserAddPolicy(value:unknown):UserAddPolicy{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('用户添加设置资料不完整');const raw=value as Record<string,unknown>
 if(Object.keys(raw).length!==3||typeof raw.allowUserAdd!=='boolean'||!['AUTO','BUSINESS_KEY'].includes(String(raw.codeMode))||typeof raw.version!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(raw.version)||BigInt(raw.version)>9223372036854775807n)throw new Error('用户添加设置或版本不符合合同')
 return Object.freeze({allowUserAdd:raw.allowUserAdd,codeMode:raw.codeMode as UserAddPolicy['codeMode'],version:raw.version})
}
export function prepareUserAddPolicy(project:string,typeId:string,current:UserAddPolicy,allowUserAdd:boolean,codeMode:UserAddPolicy['codeMode']):UserAddPolicyIntent{base(project,typeId);decodeUserAddPolicy(current);if(typeof allowUserAdd!=='boolean'||!['AUTO','BUSINESS_KEY'].includes(codeMode)||BigInt(current.version)>=9223372036854775807n)throw new Error('用户添加设置或版本无法保存，请重新读取');return Object.freeze({project,typeId,key:crypto.randomUUID(),body:Object.freeze({expectedVersion:current.version,allowUserAdd,codeMode})})}
export function sameUserAddPolicy(left:UserAddPolicy,right:UserAddPolicy){return left.version===right.version&&left.allowUserAdd===right.allowUserAdd&&left.codeMode===right.codeMode}
export const userAddPolicyTransport:UserAddPolicyTransport={
 async read(project,typeId,signal){return decodeUserAddPolicy(await api<Schema<'DeviceTypeUserAddPolicyResponse'>>(base(project,typeId),{signal,maxResponseBytes:8192}))},
 async change(intent,signal){return decodeUserAddPolicy(await api<Schema<'DeviceTypeUserAddPolicyResponse'>>(base(intent.project,intent.typeId),{method:'put',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,maxResponseBytes:8192}))}
}
