import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {typeDeviceUuid} from '../device-types/type-devices-api'

export type OtaEnablement=Readonly<Required<Schema<'OtaFirmwareEnablementResponse'>>>
export type OtaEnablementSnapshot=Readonly<Required<Schema<'OtaFirmwareEnablementSnapshotResponse'>>>
export type OtaEnablementResult=Readonly<Omit<Required<Schema<'OtaFirmwareEnablementRequestResponse'>>,'enablement'>&{enablement:OtaEnablementSnapshot}>
export type OtaEnablementIntent=Readonly<{project:string;firmware:string;key:string;body:Readonly<Required<Schema<'OtaFirmwareEnablementChangeRequest'>>>}>
export type OtaEnablementTransport={read:(project:string,firmware:string,signal:AbortSignal)=>Promise<OtaEnablement>;change:(intent:OtaEnablementIntent,signal:AbortSignal)=>Promise<OtaEnablementResult>;recover:(intent:OtaEnablementIntent,signal:AbortSignal)=>Promise<OtaEnablementResult>}
function invalid():never{throw new Error('版本启用状态不完整或范围不符，请重新读取')}
function object(value:unknown,names:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as StrictJsonValue)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();const row=value as Record<string,unknown>;if(Object.keys(row).length!==names.length||names.some(key=>!Object.hasOwn(row,key)))invalid();return row}
function revision(value:unknown):value is string{return typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n&&BigInt(value).toString()===value}
export function decodeOtaEnablementSnapshot(value:unknown):OtaEnablementSnapshot{const row=object(value,['enabled','revision']);if(typeof row.enabled!=='boolean'||!revision(row.revision))invalid();return Object.freeze({enabled:row.enabled,revision:row.revision})}
export function decodeOtaEnablement(value:unknown,project:string,firmware:string):OtaEnablement{const row=object(value,['projectId','firmwareId','enabled','revision']);if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(firmware)||row.projectId!==project||row.firmwareId!==firmware||typeof row.enabled!=='boolean'||!revision(row.revision))invalid();return Object.freeze({projectId:project,firmwareId:firmware,enabled:row.enabled,revision:row.revision})}
export function prepareOtaEnablement(project:string,firmware:string,current:OtaEnablement,enabled:boolean):OtaEnablementIntent{decodeOtaEnablement(current,project,firmware);if(typeof enabled!=='boolean'||current.revision==='9223372036854775807')invalid();return Object.freeze({project,firmware,key:crypto.randomUUID(),body:Object.freeze({enabled,expectedRevision:current.revision})})}
export function decodeOtaEnablementResult(value:unknown,intent:OtaEnablementIntent):OtaEnablementResult{const row=object(value,['projectId','firmwareId','expectedRevision','enablement']),enablement=decodeOtaEnablementSnapshot(row.enablement);if(row.projectId!==intent.project||row.firmwareId!==intent.firmware||row.expectedRevision!==intent.body.expectedRevision||enablement.enabled!==intent.body.enabled||enablement.revision!==(BigInt(intent.body.expectedRevision)+1n).toString())invalid();return Object.freeze({projectId:intent.project,firmwareId:intent.firmware,expectedRevision:intent.body.expectedRevision,enablement})}
function path(project:string,firmware:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(firmware))invalid();return `/api/v1/projects/${project}/ota/firmwares/${firmware}/enablement` as const}
export const otaEnablementTransport:OtaEnablementTransport={
 async read(project,firmware,signal){return decodeOtaEnablement(parseDashboardRuntimeResponse(await api<Uint8Array>(path(project,firmware),{signal,responseType:'bytes',maxResponseBytes:16*1024})),project,firmware)},
 async change(intent,signal){const raw=await api<Uint8Array>(path(intent.project,intent.firmware),{method:'put',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:16*1024});try{return decodeOtaEnablementResult(parseDashboardRuntimeResponse(raw),intent)}catch{throw new ApiError('启停结果暂不能核对，请读取原操作结果',200,undefined,undefined,true)}},
 async recover(intent,signal){return decodeOtaEnablementResult(parseDashboardRuntimeResponse(await api<Uint8Array>(`${path(intent.project,intent.firmware)}/by-key`,{headers:{'Original-Request-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:16*1024})),intent)}
}
