import {api,ApiError,assertIdentity,identityEpoch} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {typeDeviceUuid} from '../device-types/type-devices-api'
export type OtaManualDispatchRequest=Readonly<Required<Schema<'OtaFirmwareManualDispatchRequest'>>>
export type OtaManualDispatchMode=OtaManualDispatchRequest['mode']
export type OtaManualDispatchResult=Readonly<Required<Schema<'OtaFirmwareManualDispatchResponse'>>>
export type OtaManualDispatchIntent=Readonly<{project:string;firmware:string;device:string;actor:string;identity:number;key:string;body:OtaManualDispatchRequest}>
export type OtaManualDispatchTransport={send:(intent:OtaManualDispatchIntent,signal:AbortSignal)=>Promise<OtaManualDispatchResult>;recover:(intent:OtaManualDispatchIntent,signal:AbortSignal)=>Promise<OtaManualDispatchResult>}
function invalid():never{throw new Error('升级请求原受理资料不完整或范围不符，请保留原请求核对')}
function uuid(value:unknown):value is string{return typeof value==='string'&&value.length===36&&typeDeviceUuid.test(value)}
export function prepareOtaManualDispatch(project:string,firmware:string,device:string,mode:OtaManualDispatchMode,actor:string):OtaManualDispatchIntent{if(!uuid(project)||!uuid(firmware)||!uuid(device)||!uuid(actor)||!['INITIAL','REDISPATCH'].includes(mode))invalid();return Object.freeze({project,firmware,device,actor,identity:identityEpoch(),key:crypto.randomUUID(),body:Object.freeze({mode})})}
export function decodeOtaManualDispatchResult(value:unknown,intent:OtaManualDispatchIntent):OtaManualDispatchResult{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as StrictJsonValue)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();const row=value as Record<string,unknown>,keys=['requestId','projectId','firmwareId','deviceId','campaignId','mode','policyProfile','acceptedAt'];if(Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key))||!uuid(row.requestId)||!uuid(row.campaignId)||row.projectId!==intent.project||row.firmwareId!==intent.firmware||row.deviceId!==intent.device||row.mode!==intent.body.mode||row.policyProfile!=='MANUAL_SINGLE_DEVICE_V1'||typeof row.acceptedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(row.acceptedAt)||!Number.isFinite(Date.parse(row.acceptedAt)))invalid();return Object.freeze({...row}) as OtaManualDispatchResult}
function path(intent:OtaManualDispatchIntent){assertIdentity(intent.identity);if(!uuid(intent.project)||!uuid(intent.firmware)||!uuid(intent.device)||!uuid(intent.actor)||!uuid(intent.key)||!['INITIAL','REDISPATCH'].includes(intent.body.mode))invalid();return `/api/v1/projects/${intent.project}/ota/firmwares/${intent.firmware}/devices/${intent.device}/dispatches` as const}
export const otaManualDispatchTransport:OtaManualDispatchTransport={
 async send(intent,signal){const raw=await api<Uint8Array>(path(intent),{method:'post',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:64*1024});try{return decodeOtaManualDispatchResult(parseDashboardRuntimeResponse(raw),intent)}catch{throw new ApiError('升级请求受理结果暂不能核对，请读取原受理结果',202,undefined,undefined,true)}},
 async recover(intent,signal){return decodeOtaManualDispatchResult(parseDashboardRuntimeResponse(await api<Uint8Array>(`${path(intent)}/by-key`,{headers:{'Original-Request-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:64*1024})),intent)}
}
