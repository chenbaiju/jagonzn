import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {typeDeviceUuid} from './type-devices-api'

export type ProductIdentifier=Readonly<Required<Schema<'DeviceTypeProductIdentifierResponse'>>>
export type ProductIdentifierIntent=Readonly<{project:string;typeId:string;key:string;body:Readonly<Required<Schema<'ChangeDeviceTypeProductIdentifierRequest'>>>}>
export type ProductIdentifierTransport={read:(project:string,typeId:string,signal:AbortSignal)=>Promise<ProductIdentifier>;change:(intent:ProductIdentifierIntent,signal:AbortSignal)=>Promise<ProductIdentifier>}
const validAlias=(v:unknown)=>typeof v==='string'&&v.length>=3&&v.length<=128&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(v)
function path(project:string,typeId:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId))throw new Error('类型范围无效');return `/api/v1/projects/${project}/device-types/${typeId}/product-identifier` as const}
export function decodeProductIdentifier(value:unknown,typeId:string):ProductIdentifier{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('产品识别码回执不完整')
 const raw=value as Record<string,unknown>
 if(Object.keys(raw).length!==4||raw.deviceTypeId!==typeId||typeof raw.enabled!=='boolean'||!Object.hasOwn(raw,'productIdentifier')||raw.productIdentifier!==null&&!validAlias(raw.productIdentifier)||raw.enabled&&raw.productIdentifier===null||typeof raw.revision!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(raw.revision)||BigInt(raw.revision)>9223372036854775807n)throw new Error('产品识别码身份、版本或格式不符合合同')
 return Object.freeze({deviceTypeId:typeId,enabled:raw.enabled,productIdentifier:raw.productIdentifier as string|null,revision:raw.revision})
}
export function prepareProductIdentifier(project:string,typeId:string,current:ProductIdentifier,enabled:boolean,alias:string):ProductIdentifierIntent{
 path(project,typeId);decodeProductIdentifier(current,typeId)
 const identifier=alias.trim()||null
 if(identifier!==null&&!validAlias(identifier)||enabled&&identifier===null)throw new Error('产品识别码须为至少两段点分小写字母、数字或连字符，最多128个字符')
 return Object.freeze({project,typeId,key:crypto.randomUUID(),body:Object.freeze({revision:current.revision,enabled,productIdentifier:identifier})})
}
export const productIdentifierTransport:ProductIdentifierTransport={
 async read(project,typeId,signal){return decodeProductIdentifier(await api<Schema<'DeviceTypeProductIdentifierResponse'>>(path(project,typeId),{signal,maxResponseBytes:16*1024}),typeId)},
 async change(intent,signal){return decodeProductIdentifier(await api<Schema<'DeviceTypeProductIdentifierResponse'>>(path(intent.project,intent.typeId),{method:'put',headers:{'Idempotency-Key':intent.key},body:intent.body,signal,maxResponseBytes:16*1024}),intent.typeId)}
}
