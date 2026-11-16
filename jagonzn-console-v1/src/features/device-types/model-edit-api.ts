import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonValue,type StrictJsonObject} from '@things-link/client-contracts/dashboard/v1'
import {propertyValueText} from '../devices/property-decoder'
import {typeProfileId} from './profile-api'

/** 编辑上下文只保存服务端同一快照的身份；不从当前列表拼接新令牌。 */
export type ModelEditContext=Readonly<Required<Pick<Schema<'DeviceTypeModelEditResponse'>,'deviceTypeId'|'versionId'|'versionNumber'|'token'>>>
export type ModelEditList<T>=Readonly<{items:readonly T[];context:ModelEditContext}>
export function modelEditPath(project:string,typeId:string){
 if(!typeProfileId(project)||!typeProfileId(typeId))throw new Error('设备类型编辑范围无效')
 return `/api/v1/projects/${project}/device-types/${typeId}/model-edit` as const
}
/** 服务端三表与令牌同读；数字继续保留JSON词法，避免大整数和精确默认值被舍入。 */
export async function readModelEditList<T>(project:string,typeId:string,section:'properties'|'events'|'commands',decode:(bytes:Uint8Array,typeId:string)=>readonly T[],signal:AbortSignal):Promise<ModelEditList<T>>{
 const bytes=await api<Uint8Array>(modelEditPath(project,typeId),{signal,responseType:'bytes',maxResponseBytes:8*1024*1024})
 const raw=parseDashboardRuntimeResponse(bytes) as StrictJsonValue
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||isStrictJsonNumber(raw))throw new Error('设备类型编辑资料不完整')
 const value=raw as StrictJsonObject,keys=['deviceTypeId','versionId','versionNumber','token','properties','events','commands']
 if(Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key))||value.deviceTypeId!==typeId||!typeProfileId(value.versionId)||typeof value.versionNumber!=='string'||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.versionNumber)||typeof value.token!=='string'||!/^[0-9a-f]{64}$/.test(value.token)||!['properties','events','commands'].every(key=>Array.isArray(value[key])))throw new Error('设备类型编辑基版或完整定义资料不符，请重新读取')
 const context=Object.freeze({deviceTypeId:typeId,versionId:value.versionId,versionNumber:value.versionNumber,token:value.token})
 return Object.freeze({context,items:decode(new TextEncoder().encode(propertyValueText(value[section]!)),typeId)})
}
export function modelEditHeaders(context:ModelEditContext|undefined,typeId:string):Readonly<Record<string,string>>{
 if(!context)return{}
 if(context.deviceTypeId!==typeId||!typeProfileId(context.versionId)||!/^[a-f0-9]{64}$/.test(context.token))throw new Error('原编辑基版不完整，请重新读取定义')
 return{'If-Match':context.token}
}
