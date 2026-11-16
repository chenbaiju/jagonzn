import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {propertyValueText} from '../devices/property-decoder'
import {equalDeviceJsonValues} from '../devices/platform-properties-json'
import {decodeModelSnapshot,decodeModelVersion,modelVersionTransport,type ModelSnapshot,type ModelVersion} from './model-version-api'
import {typeDeviceUuid} from './type-devices-api'

type CandidateRequest=Schema<'DeviceTypeModelVersionCandidateRequest'>
type PublicationRequest=Schema<'PublishDeviceTypeModelVersionRequest'>
type PreviewResponse=Schema<'DeviceTypeModelVersionPreviewResponse'>
type Changes=Readonly<Required<Schema<'DeviceTypeModelVersionChangesDto'>>>
// 仅收窄当前编辑流程必填项，模板来源等可选字段沿用正式合同。
export type ModelCandidate=Readonly<{project:string;typeId:string;base:ModelSnapshot;body:Readonly<Omit<CandidateRequest,'modelSnapshot'|'versionNumber'>&{versionNumber:NonNullable<CandidateRequest['versionNumber']>;modelSnapshot:StrictJsonObject}>;rawBody:string;text:string}>
export type ModelCandidatePreview=Readonly<Omit<Required<PreviewResponse>,'baseVersion'|'modelSnapshot'|'changes'>&{baseVersion:ModelVersion;modelSnapshot:StrictJsonObject;changes:Changes;text:string}>
export type ModelCandidateIntent=Readonly<{project:string;typeId:string;key:string;candidate:ModelCandidate;preview:ModelCandidatePreview;body:Readonly<Omit<PublicationRequest,'modelSnapshot'|'versionNumber'|'expectedPreviewDigest'>&{versionNumber:NonNullable<PublicationRequest['versionNumber']>;expectedPreviewDigest:NonNullable<PublicationRequest['expectedPreviewDigest']>;modelSnapshot:StrictJsonObject}>;rawBody:string}>
export type ModelCandidateTransport={latest:(project:string,typeId:string,signal:AbortSignal)=>Promise<ModelSnapshot>;preview:(candidate:ModelCandidate,signal:AbortSignal)=>Promise<ModelCandidatePreview>;publish:(intent:ModelCandidateIntent,signal:AbortSignal)=>Promise<ModelSnapshot>;snapshot:(project:string,typeId:string,versionId:string,signal:AbortSignal,expected?:ModelVersion)=>Promise<ModelSnapshot>;byNumber:(project:string,typeId:string,versionNumber:string,signal:AbortSignal)=>Promise<ModelSnapshot>}
const sections=['properties','events','commands'] as const,levels=['PATCH','MINOR','MAJOR'] as const,versionFields=['id','deviceTypeId','versionNumber','changeLevel','schemaDigest','digestAlgorithm','publishedAt'] as const
function invalid():never{throw new Error('物模型候选、预览摘要或固定版本身份不符合合同，请重新读取')}
function object(value:StrictJsonValue|undefined):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))invalid();return value as StrictJsonObject}
function closed(value:StrictJsonObject,fields:readonly string[]){if(Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key)))invalid()}
function number(value:unknown):value is string{return typeof value==='string'&&value.length<=32&&/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)&&value.split('.').every(part=>BigInt(part)<=2147483647n)}
function digest(value:StrictJsonValue|undefined):value is string{return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)}
function sameVersion(a:ModelVersion,b:ModelVersion){return versionFields.every(key=>a[key]===b[key])}
function model(value:StrictJsonValue|undefined):StrictJsonObject{
 const result=object(value);closed(result,sections)
 for(const section of sections)for(const [key,definition] of Object.entries(object(result[section]))){if(!/^[A-Za-z0-9_-]{1,64}$/.test(key))invalid();object(definition)}
 return result
}
function differences(before:StrictJsonObject,after:StrictJsonObject){return{added:Object.keys(after).filter(key=>!Object.hasOwn(before,key)),removed:Object.keys(before).filter(key=>!Object.hasOwn(after,key)),changed:Object.keys(before).filter(key=>Object.hasOwn(after,key)&&!equalDeviceJsonValues(before[key]!,after[key]!))}}
function sameKeys(actual:readonly string[],expected:readonly string[]){return actual.length===expected.length&&expected.every(key=>actual.includes(key))}
/** 完整三段候选保留精确字面量；定义语义由原权威预览和发布内核校验，不调用已冻结定义CRUD。 */
export function prepareModelCandidate(project:string,typeId:string,base:ModelSnapshot|undefined,versionNumber:string,changeLevel:string,text:string):ModelCandidate{
 if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId)||!base)throw new Error('请先读取并选定当前最新冻结基版')
 decodeModelVersion(base.version,typeId,base.version.id)
 if(!number(versionNumber)||!levels.includes(changeLevel as typeof levels[number]))throw new Error('请填写合法目标版本号并选择变化级别')
 const snapshot=model(parseDashboardRuntimeResponse(new TextEncoder().encode(text)))
 const original=model(base.modelSnapshot),commands=object(snapshot.commands),oldCommands=object(original.commands)
 for(const [key,raw] of Object.entries(commands)){
  const command=object(raw),timeout=command.timeoutSeconds
  if((!Object.hasOwn(oldCommands,key)||timeout!==undefined)&&(timeout===undefined||!isStrictJsonNumber(timeout)||!/^\d+$/.test(timeout.lexical)||BigInt(timeout.lexical)<1n||BigInt(timeout.lexical)>86400n))
   throw new Error('新增命令须填写1至86400秒的整数超时；已有超时也必须符合该范围')
 }
 const body=Object.freeze({expectedBaseVersionId:base.version.id,versionNumber,changeLevel:changeLevel as CandidateRequest['changeLevel'],modelSnapshot:snapshot})
 const rawBody=`{"expectedBaseVersionId":${JSON.stringify(body.expectedBaseVersionId)},"versionNumber":${JSON.stringify(versionNumber)},"changeLevel":${JSON.stringify(changeLevel)},"modelSnapshot":${text}}`
 if(new TextEncoder().encode(rawBody).length>1048576)throw new Error('候选请求超过1MiB，请精简模型')
 return Object.freeze({project,typeId,base,body,rawBody,text})
}
export function decodeModelCandidatePreview(bytes:Uint8Array,candidate:ModelCandidate):ModelCandidatePreview{
 const root=parseDashboardRuntimeResponse(bytes)
 closed(root,['baseVersion','versionNumber','changeLevel','requiredChangeLevel','modelSnapshot','schemaDigest','digestAlgorithm','previewDigest','previewDigestAlgorithm','changes'])
 const baseVersion=decodeModelVersion(root.baseVersion,candidate.typeId,candidate.base.version.id),snapshot=model(root.modelSnapshot)
 if(!sameVersion(baseVersion,candidate.base.version)||root.versionNumber!==candidate.body.versionNumber||root.changeLevel!==candidate.body.changeLevel||!levels.includes(root.requiredChangeLevel as typeof levels[number])||levels.indexOf(root.requiredChangeLevel as typeof levels[number])>levels.indexOf(root.changeLevel as typeof levels[number])
  ||!digest(root.schemaDigest)||root.digestAlgorithm!=='PG_JSONB_TEXT_V1_SHA256'||!digest(root.previewDigest)||root.previewDigestAlgorithm!=='DEVICE_TYPE_MODEL_VERSION_CANDIDATE_V1_SHA256'||!equalDeviceJsonValues(snapshot,candidate.body.modelSnapshot))invalid()
 const changes=object(root.changes);closed(changes,['properties','events','commands'])
 for(const section of sections){
  const rows=object(changes[section]);closed(rows,['added','removed','changed']);const all:string[]=[],actual=differences(object(candidate.base.modelSnapshot[section]),object(snapshot[section]))
  for(const key of ['added','removed','changed'] as const){const keys=rows[key];if(!Array.isArray(keys)||keys.some(value=>typeof value!=='string'||! /^[A-Za-z0-9_-]{1,64}$/.test(value))||!sameKeys(keys as string[],actual[key]))invalid();all.push(...keys as string[])}
  if(new Set(all).size!==all.length)invalid()
 }
 return Object.freeze({...root,baseVersion,modelSnapshot:snapshot,changes:changes as unknown as Changes,text:propertyValueText(snapshot)}) as ModelCandidatePreview
}
export function prepareModelCandidatePublication(candidate:ModelCandidate,preview:ModelCandidatePreview):ModelCandidateIntent{
 if(!sameVersion(candidate.base.version,preview.baseVersion)||candidate.body.versionNumber!==preview.versionNumber||candidate.body.changeLevel!==preview.changeLevel||!equalDeviceJsonValues(candidate.body.modelSnapshot,preview.modelSnapshot)||!digest(preview.previewDigest))invalid()
 const body=Object.freeze({...candidate.body,expectedPreviewDigest:preview.previewDigest}),rawBody=candidate.rawBody.slice(0,-1)+`,"expectedPreviewDigest":${JSON.stringify(preview.previewDigest)}}`
 if(new TextEncoder().encode(rawBody).length>1048576)throw new Error('发布请求超过1MiB，请精简模型')
 return Object.freeze({project:candidate.project,typeId:candidate.typeId,key:crypto.randomUUID(),candidate,preview,body,rawBody})
}
export function candidatePublicationMatches(snapshot:ModelSnapshot,intent:ModelCandidateIntent){return snapshot.version.deviceTypeId===intent.typeId&&snapshot.version.versionNumber===intent.candidate.body.versionNumber&&snapshot.version.changeLevel===intent.candidate.body.changeLevel&&snapshot.version.schemaDigest===intent.preview.schemaDigest&&snapshot.version.digestAlgorithm===intent.preview.digestAlgorithm&&equalDeviceJsonValues(snapshot.modelSnapshot,intent.preview.modelSnapshot)}
export function sameModelCandidateFact(a:ModelSnapshot,b:ModelSnapshot){return sameVersion(a.version,b.version)&&equalDeviceJsonValues(a.modelSnapshot,b.modelSnapshot)}
function path(project:string,typeId:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId))invalid();return `/api/v1/projects/${project}/device-types/${typeId}` as const}
export const modelCandidateTransport:ModelCandidateTransport={
 async latest(project,typeId,signal){const latest=await modelVersionTransport.latest(project,typeId,signal);return modelVersionTransport.snapshot(project,typeId,latest.id,signal,latest)},
 async preview(candidate,signal){return decodeModelCandidatePreview(await api<Uint8Array>(`${path(candidate.project,candidate.typeId)}/thing-model-version-previews`,{method:'post',rawBody:candidate.rawBody,headers:{'Content-Type':'application/json'},signal,responseType:'bytes',maxResponseBytes:2*1024*1024}),candidate)},
 async publish(intent,signal){
  const bytes=await api<Uint8Array>(`${path(intent.project,intent.typeId)}/thing-model-version-publications`,{method:'post',rawBody:intent.rawBody,headers:{'Content-Type':'application/json','Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:2*1024*1024})
  try{const root=parseDashboardRuntimeResponse(bytes),version=decodeModelVersion(root.version,intent.typeId);const snapshot=decodeModelSnapshot(bytes,intent.typeId,version.id,version);if(!candidatePublicationMatches(snapshot,intent))invalid();return snapshot}catch{throw new ApiError('发布回执与原候选不符，原操作结果尚未确认',200,undefined,undefined,true)}
 },
 snapshot:(project,typeId,versionId,signal,expected)=>modelVersionTransport.snapshot(project,typeId,versionId,signal,expected),
 async byNumber(project,typeId,versionNumber,signal){if(!number(versionNumber))invalid();const bytes=await api<Uint8Array>(`${path(project,typeId)}/thing-model-versions/by-number/${versionNumber}`,{signal,responseType:'bytes',maxResponseBytes:2*1024*1024});const root=parseDashboardRuntimeResponse(bytes),version=decodeModelVersion(root.version,typeId);if(version.versionNumber!==versionNumber)invalid();return decodeModelSnapshot(bytes,typeId,version.id,version)}
}
