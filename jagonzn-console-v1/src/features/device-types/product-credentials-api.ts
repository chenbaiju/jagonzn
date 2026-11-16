import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {typeDeviceUuid} from './type-devices-api'

export type ProductCredential=Readonly<Required<Schema<'ProductCredentialCreatedResponse'>>>
export type ProductCredentialFact=Readonly<Required<Pick<Schema<'DeviceTypeResponse'>,'id'|'projectId'|'productKey'>>>
export type ProductCredentialIntent=Readonly<{project:string;typeId:string;key:string;expectedProductKey:string|null}>
export type ProductCredentialTransport={generate:(intent:ProductCredentialIntent,signal:AbortSignal)=>Promise<ProductCredential>;read:(project:string,typeId:string,signal:AbortSignal)=>Promise<ProductCredentialFact>}
const publicKey=/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
function path(project:string,typeId:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId))throw new Error('产品凭据类型范围无效');return `/api/v1/projects/${project}/device-types/${typeId}` as const}
export function prepareProductCredential(project:string,typeId:string,productKey:string|null|undefined):ProductCredentialIntent{
 path(project,typeId);if(productKey!=null&&!publicKey.test(productKey))throw new Error('公开产品标识格式不完整，请刷新类型资料')
 return Object.freeze({project,typeId,key:crypto.randomUUID(),expectedProductKey:productKey??null})
}
/** 明文仅随这一响应交给组件；解析不合格仍视为写结果未知，不触发第二次生成。 */
export function decodeProductCredential(value:unknown,intent:ProductCredentialIntent):ProductCredential{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('产品凭据回执不完整')
 const raw=value as Record<string,unknown>
 if(Object.keys(raw).length!==3||!['deviceTypeId','productKey','productSecret'].every(key=>Object.hasOwn(raw,key))||raw.deviceTypeId!==intent.typeId||typeof raw.productKey!=='string'||!publicKey.test(raw.productKey)||intent.expectedProductKey!==null&&raw.productKey!==intent.expectedProductKey||typeof raw.productSecret!=='string'||! /^[a-f0-9]{64}$/.test(raw.productSecret))throw new Error('产品凭据回执身份或秘密格式不符合合同')
 return Object.freeze({deviceTypeId:intent.typeId,productKey:raw.productKey,productSecret:raw.productSecret})
}
export const productCredentialTransport:ProductCredentialTransport={
 async generate(intent,signal){
  const value=await api<Schema<'ProductCredentialCreatedResponse'>>(`${path(intent.project,intent.typeId)}/product-credential`,{method:'post',headers:{'Idempotency-Key':intent.key},signal,maxResponseBytes:16*1024})
  try{return decodeProductCredential(value,intent)}catch{throw new ApiError('产品凭据生成或轮换回执未能核对，原操作结果尚未确认',201,undefined,undefined,true)}
 },
 /** 公开标识只是当前类型事实，不能证明轮换成功，也不包含可恢复的秘密。 */
 async read(project,typeId,signal){
  const value=await api<Schema<'DeviceTypeResponse'>>(path(project,typeId),{signal,maxResponseBytes:64*1024})
  if(!value||value.id!==typeId||value.projectId!==project||value.productKey!=null&&(typeof value.productKey!=='string'||!publicKey.test(value.productKey)))throw new Error('公开产品资料身份或标识不符合合同')
  return Object.freeze({id:typeId,projectId:project,productKey:value.productKey??null})
 }
}
