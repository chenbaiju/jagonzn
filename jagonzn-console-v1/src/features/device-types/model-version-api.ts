import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {typeDeviceUuid} from './type-devices-api'

export type ModelVersion=Readonly<Required<Schema<'ThingModelVersionResponse'>>>
export type ModelSnapshot=Readonly<{version:ModelVersion;modelSnapshot:StrictJsonObject;text:string;counts:Readonly<{properties:number;events:number;commands:number}>}>
export type ModelVersionTransport={latest:(project:string,typeId:string,signal:AbortSignal)=>Promise<ModelVersion>;snapshot:(project:string,typeId:string,versionId:string,signal:AbortSignal,expected?:ModelVersion)=>Promise<ModelSnapshot>}
const fields=['id','deviceTypeId','versionNumber','changeLevel','schemaDigest','digestAlgorithm','publishedAt'] as const
function invalid():never{throw new Error('物模型版本身份或冻结快照不符合读取合同，请重新读取')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as StrictJsonValue)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();return value as Record<string,unknown>}
export function decodeModelVersion(value:unknown,typeId:string,id?:string):ModelVersion{
 const raw=object(value)
 if(!typeDeviceUuid.test(typeId)||Object.keys(raw).length!==fields.length||fields.some(field=>!Object.hasOwn(raw,field))||!typeDeviceUuid.test(String(raw.id))||raw.deviceTypeId!==typeId||id!==undefined&&raw.id!==id
  ||typeof raw.versionNumber!=='string'||raw.versionNumber.length>32||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(raw.versionNumber)||raw.versionNumber.split('.').some(part=>BigInt(part)>2147483647n)
  ||!['MAJOR','MINOR','PATCH'].includes(String(raw.changeLevel))||typeof raw.schemaDigest!=='string'||!/^[a-f0-9]{64}$/.test(raw.schemaDigest)
  ||typeof raw.digestAlgorithm!=='string'||!/^[A-Z0-9_]{1,64}$/.test(raw.digestAlgorithm)||typeof raw.publishedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(raw.publishedAt)||!Number.isFinite(Date.parse(raw.publishedAt)))invalid()
 return Object.freeze({...raw}) as ModelVersion
}
/** 展示冻结正文的数值词法，不经浮点转换，也不将展示排版当作数据库摘要原文。 */
function snapshotText(value:StrictJsonValue,depth=0):string{
 if(isStrictJsonNumber(value))return value.lexical
 if(value===null||typeof value!=='object')return JSON.stringify(value)
 const pad='  '.repeat(depth),inner=pad+'  '
 if(Array.isArray(value))return value.length?'[\n'+value.map(item=>inner+snapshotText(item,depth+1)).join(',\n')+'\n'+pad+']':'[]'
 const entries=Object.entries(value)
 return entries.length?'{\n'+entries.map(([key,item])=>inner+JSON.stringify(key)+': '+snapshotText(item,depth+1)).join(',\n')+'\n'+pad+'}':'{}'
}
export function decodeModelSnapshot(bytes:Uint8Array,typeId:string,versionId:string,expected?:ModelVersion):ModelSnapshot{
 if(!typeDeviceUuid.test(versionId))invalid()
 const root=parseDashboardRuntimeResponse(bytes)
 if(Object.keys(root).length!==2||!Object.hasOwn(root,'version')||!Object.hasOwn(root,'modelSnapshot'))invalid()
 const version=decodeModelVersion(root.version,typeId,versionId)
 if(expected&&fields.some(field=>version[field]!==expected[field]))invalid()
 const model=object(root.modelSnapshot) as StrictJsonObject
 if(Object.keys(model).length!==3||['properties','events','commands'].some(section=>!Object.hasOwn(model,section)))invalid()
 const counts=Object.freeze({properties:Object.keys(object(model.properties)).length,events:Object.keys(object(model.events)).length,commands:Object.keys(object(model.commands)).length})
 return Object.freeze({version,modelSnapshot:model,text:snapshotText(model),counts})
}
function base(project:string,typeId:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId))invalid();return `/api/v1/projects/${project}/device-types/${typeId}/thing-model-versions` as const}
export const modelVersionTransport:ModelVersionTransport={
 async latest(project,typeId,signal){const bytes=await api<Uint8Array>(`${base(project,typeId)}/latest`,{signal,responseType:'bytes',maxResponseBytes:64*1024});return decodeModelVersion(parseDashboardRuntimeResponse(bytes),typeId)},
 async snapshot(project,typeId,versionId,signal,expected){if(!typeDeviceUuid.test(versionId))invalid();const bytes=await api<Uint8Array>(`${base(project,typeId)}/${versionId}`,{signal,responseType:'bytes',maxResponseBytes:2*1024*1024});return decodeModelSnapshot(bytes,typeId,versionId,expected)}
}
