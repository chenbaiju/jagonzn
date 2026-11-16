import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {decodeModelVersion,modelVersionTransport,type ModelSnapshot,type ModelVersion} from '../device-types/model-version-api'

export type ModelBinding=Readonly<{deviceId:string;deviceTypeId:string;version:ModelVersion}>
export type ModelUpgradePreview=Readonly<{binding:ModelBinding;current:ModelSnapshot;target:ModelSnapshot}>
export type ModelUpgradeIntent=Readonly<{project:string;device:string;typeId:string;current:ModelVersion;target:ModelVersion;body:Readonly<Required<Schema<'UpgradeThingModelBindingRequest'>>>}>
export type ModelUpgradeReceipt=Readonly<Required<Schema<'ThingModelBindingTransitionResponse'>>>
export type ModelUpgradeObservation=Readonly<{binding:ModelBinding;target:ModelSnapshot}>
export type ModelUpgradeTransport={preview:(project:string,device:string,signal:AbortSignal)=>Promise<ModelUpgradePreview>;upgrade:(intent:ModelUpgradeIntent,signal:AbortSignal)=>Promise<ModelUpgradeReceipt>;observe:(intent:ModelUpgradeIntent,signal:AbortSignal)=>Promise<ModelUpgradeObservation>}
const versionFields=['id','deviceTypeId','versionNumber','changeLevel','schemaDigest','digestAlgorithm','publishedAt'] as const
function invalid():never{throw new Error('设备物模型身份、目标或转换回执不符合合同，请重新读取核对')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as StrictJsonValue)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();return value as Record<string,unknown>}
export function sameModelVersion(first:ModelVersion,second:ModelVersion){return versionFields.every(field=>first[field]===second[field])}
export function modelVersionForward(current:ModelVersion,target:ModelVersion){
 if(current.deviceTypeId!==target.deviceTypeId||current.id===target.id)return false
 const a=current.versionNumber.split('.').map(BigInt),b=target.versionNumber.split('.').map(BigInt)
 for(let i=0;i<3;i++){if(a[i]!==b[i])return b[i]!>a[i]!}return false
}
export function decodeModelBinding(bytes:Uint8Array,device:string):ModelBinding{
 const root=parseDashboardRuntimeResponse(bytes)
 if(!typeDeviceUuid.test(device)||Object.keys(root).length!==3||root.deviceId!==device||typeof root.deviceTypeId!=='string'||!typeDeviceUuid.test(root.deviceTypeId))invalid()
 return Object.freeze({deviceId:device,deviceTypeId:root.deviceTypeId,version:decodeModelVersion(root.version,root.deviceTypeId)})
}
export function prepareModelUpgrade(project:string,device:string,preview:ModelUpgradePreview):ModelUpgradeIntent{
 if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(device)||preview.binding.deviceId!==device||preview.binding.deviceTypeId!==preview.current.version.deviceTypeId||!sameModelVersion(preview.binding.version,preview.current.version)||!modelVersionForward(preview.current.version,preview.target.version))invalid()
 return Object.freeze({project,device,typeId:preview.binding.deviceTypeId,current:preview.current.version,target:preview.target.version,body:Object.freeze({expectedCurrentVersionId:preview.current.version.id,targetVersionId:preview.target.version.id,transitionKey:crypto.randomUUID()})})
}
export function decodeModelUpgradeReceipt(bytes:Uint8Array,intent:ModelUpgradeIntent):ModelUpgradeReceipt{
 const value=object(parseDashboardRuntimeResponse(bytes)),fields=['id','deviceId','fromVersionId','toVersionId','transitionKey','transitionType','effectiveAt']
 if(Object.keys(value).length!==fields.length||fields.some(field=>!Object.hasOwn(value,field))||!typeDeviceUuid.test(String(value.id))||value.deviceId!==intent.device||value.fromVersionId!==intent.body.expectedCurrentVersionId||value.toVersionId!==intent.body.targetVersionId||value.transitionKey!==intent.body.transitionKey||value.transitionType!=='UPGRADE'||typeof value.effectiveAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value.effectiveAt)||!Number.isFinite(Date.parse(value.effectiveAt)))invalid()
 return Object.freeze({...value}) as ModelUpgradeReceipt
}
export function modelUpgradeTargetObserved(observed:ModelUpgradeObservation,intent:ModelUpgradeIntent){return observed.binding.deviceId===intent.device&&observed.binding.deviceTypeId===intent.typeId&&sameModelVersion(observed.binding.version,intent.target)&&sameModelVersion(observed.target.version,intent.target)}
function base(project:string,device:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(device))invalid();return `/api/v1/projects/${project}/devices/${device}/thing-model-binding` as const}
async function binding(project:string,device:string,signal:AbortSignal){const bytes=await api<Uint8Array|undefined>(base(project,device),{signal,responseType:'bytes',maxResponseBytes:64*1024});if(!bytes)throw new Error('设备尚未关联物模型');return decodeModelBinding(bytes,device)}
export const modelUpgradeTransport:ModelUpgradeTransport={
 async preview(project,device,signal){
  const actual=await binding(project,device,signal)
  const [current,latest]=await Promise.all([modelVersionTransport.snapshot(project,actual.deviceTypeId,actual.version.id,signal,actual.version),modelVersionTransport.latest(project,actual.deviceTypeId,signal)])
  if(latest.id===current.version.id){if(!sameModelVersion(latest,current.version))invalid();return Object.freeze({binding:actual,current,target:current})}
  if(!modelVersionForward(current.version,latest))invalid()
  const target=await modelVersionTransport.snapshot(project,actual.deviceTypeId,latest.id,signal,latest)
  return Object.freeze({binding:actual,current,target})
 },
 async upgrade(intent,signal){
  if(!modelVersionForward(intent.current,intent.target)||intent.body.expectedCurrentVersionId!==intent.current.id||intent.body.targetVersionId!==intent.target.id||!typeDeviceUuid.test(intent.body.transitionKey))invalid()
  const bytes=await api<Uint8Array>(`${base(intent.project,intent.device)}/upgrades`,{method:'post',body:intent.body,headers:{'Idempotency-Key':intent.body.transitionKey},signal,responseType:'bytes',maxResponseBytes:64*1024})
  try{return decodeModelUpgradeReceipt(bytes,intent)}catch{throw new ApiError('升级回执与原请求不符，原操作结果尚未确认',200,undefined,undefined,true)}
 },
 async observe(intent,signal){const actual=await binding(intent.project,intent.device,signal),target=await modelVersionTransport.snapshot(intent.project,intent.typeId,intent.target.id,signal,intent.target);return Object.freeze({binding:actual,target})}
}
