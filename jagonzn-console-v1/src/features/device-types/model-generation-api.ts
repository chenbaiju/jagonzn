import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {propertyValueText} from '../devices/property-decoder'
import {prepareModelCandidate,decodeModelCandidatePreview,type ModelCandidate,type ModelCandidatePreview} from './model-candidate-api'
import type {ModelSnapshot} from './model-version-api'
import {typeDeviceUuid} from './type-devices-api'
export type ModelGenerationIntent=Readonly<{project:string;typeId:string;key:string;base:ModelSnapshot;body:Readonly<Schema<'DeviceModelGenerationRequest'>>}>
export type ModelGenerationAvailability=Readonly<Schema<'DeviceModelGenerationAvailability'>>
// 候选正文经精确解析后转换为编辑器视图；调用身份和状态直接派生正式合同。
export type ModelGenerationResult=Readonly<Pick<Schema<'DeviceModelGenerationResponse'>,'callId'|'status'|'reason'>&{candidate?:ModelCandidate;preview?:ModelCandidatePreview}>
export type ModelGenerationTransport={status:(project:string,typeId:string,signal:AbortSignal)=>Promise<ModelGenerationAvailability>;generate:(intent:ModelGenerationIntent,signal:AbortSignal)=>Promise<ModelGenerationResult>;read:(intent:ModelGenerationIntent,signal:AbortSignal)=>Promise<ModelGenerationResult>}
function invalid():never{throw new Error('模型生成响应或固定基版不符合合同，请只按原键读取状态')}
function object(value:unknown):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as StrictJsonValue))invalid();return value as StrictJsonObject}
function operationKey(){const raw=crypto.getRandomValues(new Uint8Array(16));let sampled=BigInt(Date.now());for(let i=5;i>=0;i--){raw[i]=Number(sampled&255n);sampled>>=8n}raw[6]=(raw[6]!&15)|112;raw[8]=(raw[8]!&63)|128;const hex=Array.from(raw,x=>x.toString(16).padStart(2,'0')).join('');return`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`}
export function prepareModelGeneration(project:string,typeId:string,base:ModelSnapshot,versionNumber:string,changeLevel:string,instruction:string):ModelGenerationIntent{
 if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId)||base.version.deviceTypeId!==typeId||!instruction.trim()||instruction.length>4000)throw new Error('请读取固定基版，填写不超过4000字符的生成说明')
 // 仅复用本地版本号/级别与基版检查；不把原基版冒生成结果。
 prepareModelCandidate(project,typeId,base,versionNumber,changeLevel,base.text)
 if(new TextEncoder().encode(base.text).length+new TextEncoder().encode(instruction).length>32768)throw new Error('基版与说明合计最多32KiB，请缩小模型范围')
 return Object.freeze({project,typeId,key:operationKey(),base,body:Object.freeze({expectedBaseVersionId:base.version.id,expectedBaseSchemaDigest:base.version.schemaDigest,versionNumber,changeLevel:changeLevel as ModelGenerationIntent['body']['changeLevel'],instruction})})
}
export function decodeModelGeneration(bytes:Uint8Array,intent:ModelGenerationIntent,recovery=false):ModelGenerationResult{
 const root=parseDashboardRuntimeResponse(bytes),keys=Object.keys(root)
 if(!typeDeviceUuid.test(String(root.callId))||!['IN_FLIGHT','SUCCEEDED','REJECTED','UNKNOWN'].includes(String(root.status))||!['CANDIDATE_READY','RESULT_NOT_RETAINED','INVALID_CANDIDATE','EXECUTION_UNKNOWN'].includes(String(root.reason))||keys.some(k=>!['callId','status','reason','candidate'].includes(k))||!['callId','status','reason'].every(k=>Object.hasOwn(root,k)))invalid()
 let candidate:ModelCandidate|undefined,preview:ModelCandidatePreview|undefined
 if(Object.hasOwn(root,'candidate')){
  if(recovery||root.status!=='SUCCEEDED'||root.reason!=='CANDIDATE_READY')invalid();const value=object(root.candidate)
  candidate=prepareModelCandidate(intent.project,intent.typeId,intent.base,intent.body.versionNumber,intent.body.changeLevel,propertyValueText(object(value.modelSnapshot)))
  preview=decodeModelCandidatePreview(new TextEncoder().encode(propertyValueText(value)),candidate)
 }else if(root.reason==='CANDIDATE_READY')invalid()
 return Object.freeze({callId:String(root.callId),status:root.status as ModelGenerationResult['status'],reason:root.reason as ModelGenerationResult['reason'],...(candidate&&preview?{candidate,preview}:{})})
}
function path(project:string,typeId:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(typeId))invalid();return`/api/v1/projects/${project}/device-types/${typeId}/model-candidate-generations` as const}
export const modelGenerationTransport:ModelGenerationTransport={
 async status(project,typeId,signal){const value=parseDashboardRuntimeResponse(await api<Uint8Array>(`${path(project,typeId)}/status`,{signal,responseType:'bytes',maxResponseBytes:1024}));if(Object.keys(value).length!==2||typeof value.available!=='boolean'||!['AVAILABLE','PROVIDER_UNAVAILABLE','PROJECT_CONFIGURATION_DISABLED'].includes(String(value.reason))||value.available!==(value.reason==='AVAILABLE'))invalid();return Object.freeze({available:value.available,reason:value.reason as ModelGenerationAvailability['reason']})},
 async generate(intent,signal){const bytes=await api<Uint8Array>(path(intent.project,intent.typeId),{method:'post',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:262144});try{return decodeModelGeneration(bytes,intent)}catch{throw new ApiError('原生成结果尚未确认，只能读取原键状态；不会自动重调',200,undefined,undefined,true)}},
 async read(intent,signal){return decodeModelGeneration(await api<Uint8Array>(`${path(intent.project,intent.typeId)}/by-key`,{headers:{'Original-Request-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:2048}),intent,true)}
}
