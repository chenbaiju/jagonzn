import {api,ApiError,assertIdentity,identityEpoch} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {otaMetadataRevision} from './ota-management-metadata-api'
import {otaEnablementTransport,type OtaEnablement} from './ota-enablement-api'
export type OtaDeletionRequest=Readonly<Required<Schema<'OtaFirmwareDeletionRequest'>>>
export type OtaDeletionResult=Readonly<Required<Schema<'OtaFirmwareDeletionResponse'>>>
export type OtaDeletionIntent=Readonly<{project:string;firmware:string;actor:string;identity:number;key:string;body:OtaDeletionRequest}>
export type OtaDeletionTransport={enablement:typeof otaEnablementTransport.read;remove:(intent:OtaDeletionIntent,signal:AbortSignal)=>Promise<OtaDeletionResult>;recover:(intent:OtaDeletionIntent,signal:AbortSignal)=>Promise<OtaDeletionResult>}
function invalid():never{throw new Error('删除结果原件不完整或范围不符，请保留原请求核对')}
function uuid(value:unknown):value is string{return typeof value==='string'&&value.length===36&&typeDeviceUuid.test(value)}
export function prepareOtaDeletion(project:string,firmware:string,head:OtaEnablement,actor:string):OtaDeletionIntent{if(!uuid(project)||!uuid(firmware)||!uuid(actor)||head.projectId!==project||head.firmwareId!==firmware||head.enabled!==false||!otaMetadataRevision(head.revision))invalid();return Object.freeze({project,firmware,actor,identity:identityEpoch(),key:crypto.randomUUID(),body:Object.freeze({expectedEnablementRevision:head.revision})})}
export function decodeOtaDeletionResult(value:unknown,intent:OtaDeletionIntent):OtaDeletionResult{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as StrictJsonValue)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();const row=value as Record<string,unknown>,keys=['projectId','firmwareId','deletionId','expectedEnablementRevision','deletedAt'];if(Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key))||row.projectId!==intent.project||row.firmwareId!==intent.firmware||!uuid(row.deletionId)||row.expectedEnablementRevision!==intent.body.expectedEnablementRevision||typeof row.deletedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(row.deletedAt)||!Number.isFinite(Date.parse(row.deletedAt)))invalid();return Object.freeze({...row}) as OtaDeletionResult}
function path(intent:OtaDeletionIntent){assertIdentity(intent.identity);if(!uuid(intent.project)||!uuid(intent.firmware)||!uuid(intent.actor)||!uuid(intent.key)||!otaMetadataRevision(intent.body.expectedEnablementRevision))invalid();return `/api/v1/projects/${intent.project}/ota/firmwares/${intent.firmware}/deletions` as const}
export const otaDeletionTransport:OtaDeletionTransport={
 enablement:otaEnablementTransport.read,
 async remove(intent,signal){const raw=await api<Uint8Array>(path(intent),{method:'post',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:64*1024});try{return decodeOtaDeletionResult(parseDashboardRuntimeResponse(raw),intent)}catch{throw new ApiError('删除结果暂不能核对，请读取原删除结果',200,undefined,undefined,true)}},
 async recover(intent,signal){return decodeOtaDeletionResult(parseDashboardRuntimeResponse(await api<Uint8Array>(`${path(intent)}/by-key`,{headers:{'Original-Request-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:64*1024})),intent)}
}
