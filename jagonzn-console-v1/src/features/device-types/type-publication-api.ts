import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {propertyValueText} from '../devices/property-decoder'
import {referenceVersion} from '../devices/reference-profile'
import {decodeModelVersion,type ModelVersion} from './model-version-api'
import {typeDeviceUuid} from './type-devices-api'

type PreviewContract=Schema<'DeviceTypePublicationPreviewResponse'>
type PublicationContract=Schema<'DeviceTypeInitialPublicationResponse'>
export type PublicationModel=Readonly<{value:StrictJsonObject;text:string;counts:Readonly<{properties:number;events:number;commands:number}>}>
export type TypePublicationPreview=Readonly<Required<Omit<PreviewContract,'modelSnapshot'>>&{model:PublicationModel}>
export type InitialPublication=Readonly<{type:Readonly<Required<Pick<NonNullable<PublicationContract['type']>,'id'|'projectId'|'name'|'status'>>>;version:ModelVersion;model:PublicationModel}>
export type TypePublicationIntent=Readonly<{project:string;typeId:string;key:string;preview:TypePublicationPreview;body:Readonly<Required<Schema<'PublishInitialDeviceTypeRequest'>>>}>
export type TypePublicationTransport={preview:(project:string,typeId:string,signal:AbortSignal)=>Promise<TypePublicationPreview>;publish:(intent:TypePublicationIntent,signal:AbortSignal)=>Promise<InitialPublication>;initial:(project:string,typeId:string,signal:AbortSignal)=>Promise<InitialPublication>}
function invalid():never{throw new Error('设备类型首次发布资料、摘要或范围不符合合同，请重新读取')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as StrictJsonValue)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();return value as Record<string,unknown>}
function model(value:unknown):PublicationModel{
 const raw=object(value) as StrictJsonObject
 if(Object.keys(raw).length!==3||['properties','events','commands'].some(section=>!Object.hasOwn(raw,section)))invalid()
 const counts=Object.freeze({properties:Object.keys(object(raw.properties)).length,events:Object.keys(object(raw.events)).length,commands:Object.keys(object(raw.commands)).length})
 return Object.freeze({value:raw,text:propertyValueText(raw),counts})
}
export function decodeTypePublicationPreview(bytes:Uint8Array,typeId:string):TypePublicationPreview{
 const root=parseDashboardRuntimeResponse(bytes),fields=['deviceTypeId','versionNumber','modelSnapshot','schemaDigest','digestAlgorithm','previewDigest','previewDigestAlgorithm','deviceCount']
 if(!typeDeviceUuid.test(typeId)||Object.keys(root).length!==fields.length||fields.some(field=>!Object.hasOwn(root,field))||root.deviceTypeId!==typeId||root.versionNumber!=='1.0.0'||typeof root.schemaDigest!=='string'||!/^[a-f0-9]{64}$/.test(root.schemaDigest)||root.digestAlgorithm!=='PG_JSONB_TEXT_V1_SHA256'||typeof root.previewDigest!=='string'||!/^[a-f0-9]{64}$/.test(root.previewDigest)||root.previewDigestAlgorithm!=='DEVICE_TYPE_INITIAL_PUBLICATION_V1_SHA256'||!referenceVersion(root.deviceCount))invalid()
 const {modelSnapshot,...metadata}=root
 return Object.freeze({...metadata,model:model(modelSnapshot)}) as TypePublicationPreview
}
export function decodeInitialPublication(bytes:Uint8Array,project:string,typeId:string):InitialPublication{
 const root=parseDashboardRuntimeResponse(bytes),raw=object(root.type)
 if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId)||Object.keys(root).length!==3||!['type','version','modelSnapshot'].every(key=>Object.hasOwn(root,key))||raw.id!==typeId||raw.projectId!==project||raw.status!=='PUBLISHED'||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>128)invalid()
 const version=decodeModelVersion(root.version,typeId)
 if(version.versionNumber!=='1.0.0'||version.changeLevel!=='MAJOR'||version.digestAlgorithm!=='PG_JSONB_TEXT_V1_SHA256')invalid()
 return Object.freeze({type:Object.freeze({id:typeId,projectId:project,name:raw.name,status:'PUBLISHED'}),version,model:model(root.modelSnapshot)})
}
/** 用精确十进制语义比较展示快照，不用客户端排版复算数据库摘要。 */
function decimal(value:string){const [coefficient,exponent='0']=value.toLowerCase().split('e'),negative=coefficient!.startsWith('-'),[whole,fraction='']=coefficient!.replace(/^-/,'').split('.');let digits=(whole!+fraction).replace(/^0+/,'');if(!digits)return'0';let power=BigInt(exponent)-BigInt(fraction.length);const suffix=digits.length-digits.replace(/0+$/,'').length;digits=digits.replace(/0+$/,'');power+=BigInt(suffix);return`${negative?'-':''}${digits}e${power}`}
function semantic(value:StrictJsonValue):string{if(isStrictJsonNumber(value))return'#'+decimal(value.lexical);if(Array.isArray(value))return'['+value.map(semantic).join(',')+']';if(value&&typeof value==='object')return'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+semantic((value as StrictJsonObject)[key]!)).join(',')+'}';return JSON.stringify(value)}
export function publicationMatchesPreview(value:InitialPublication,preview:TypePublicationPreview){return value.type.id===preview.deviceTypeId&&value.version.deviceTypeId===preview.deviceTypeId&&value.version.versionNumber==='1.0.0'&&value.version.schemaDigest===preview.schemaDigest&&value.version.digestAlgorithm===preview.digestAlgorithm&&semantic(value.model.value)===semantic(preview.model.value)}
export function sameInitialPublication(first:InitialPublication,second:InitialPublication){return first.type.id===second.type.id&&first.type.projectId===second.type.projectId&&['id','deviceTypeId','versionNumber','changeLevel','schemaDigest','digestAlgorithm','publishedAt'].every(field=>first.version[field as keyof ModelVersion]===second.version[field as keyof ModelVersion])&&semantic(first.model.value)===semantic(second.model.value)}
export function prepareTypePublication(project:string,typeId:string,preview:TypePublicationPreview):TypePublicationIntent{
 if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId)||preview.deviceTypeId!==typeId||!/^[a-f0-9]{64}$/.test(preview.previewDigest))invalid()
 return Object.freeze({project,typeId,key:crypto.randomUUID(),preview,body:Object.freeze({expectedPreviewDigest:preview.previewDigest})})
}
function base(project:string,typeId:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId))invalid();return `/api/v1/projects/${project}/device-types/${typeId}` as const}
export const typePublicationTransport:TypePublicationTransport={
 async preview(project,typeId,signal){return decodeTypePublicationPreview(await api<Uint8Array>(`${base(project,typeId)}/initial-publication-preview`,{signal,responseType:'bytes',maxResponseBytes:2*1024*1024}),typeId)},
 async publish(intent,signal){
  const bytes=await api<Uint8Array>(`${base(intent.project,intent.typeId)}/initial-publications`,{method:'post',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:2*1024*1024})
  try{const actual=decodeInitialPublication(bytes,intent.project,intent.typeId);if(!publicationMatchesPreview(actual,intent.preview))invalid();return actual}catch{throw new ApiError('发布回执与原预览不符，原操作结果尚未确认',200,undefined,undefined,true)}
 },
 async initial(project,typeId,signal){return decodeInitialPublication(await api<Uint8Array>(`${base(project,typeId)}/initial-publication`,{signal,responseType:'bytes',maxResponseBytes:2*1024*1024}),project,typeId)}
}
