import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {decodeOtaFirmware,type OtaFirmware} from './ota-read-api'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {validateTagRows,type DeviceTagRow} from '../devices/tag-rules'

export type OtaManagementMetadata=Readonly<Omit<Required<Schema<'OtaFirmwareManagementMetadata'>>,'description'|'tags'>&{description:string|null;tags:Readonly<Record<string,string>>}>
export type OtaMetadataSnapshot=Readonly<Omit<Required<Schema<'OtaFirmwareMetadataSnapshotResponse'>>,'metadata'>&{metadata:OtaManagementMetadata|null}>
export type OtaMetadataView=Readonly<Omit<Required<Schema<'OtaFirmwareMetadataViewResponse'>>,'firmware'|'metadata'>&{firmware:OtaFirmware;metadata:OtaMetadataSnapshot}>
export type OtaCreationReceipt=Readonly<Omit<Required<Schema<'OtaFirmwareCreationReceiptResponse'>>,'firmware'|'creationMetadata'>&{firmware:OtaFirmware;creationMetadata:OtaManagementMetadata|null}>
export type OtaMetadataRequest=Readonly<Omit<Required<Schema<'OtaFirmwareMetadataRequestResponse'>>,'metadata'>&{metadata:OtaMetadataSnapshot}>
export type OtaMetadataDraft={name:string;description:string|null;tags:DeviceTagRow[]}
export type OtaMetadataIntent=Readonly<{project:string;firmware:string;key:string;body:Readonly<Omit<Required<Schema<'OtaFirmwareMetadataChangeRequest'>>,'metadata'>&{metadata:OtaManagementMetadata}>}>
export type OtaManagementTransport={read:(project:string,firmware:string,signal:AbortSignal)=>Promise<OtaMetadataView>;update:(intent:OtaMetadataIntent,signal:AbortSignal)=>Promise<OtaMetadataRequest>;recover:(intent:OtaMetadataIntent,signal:AbortSignal)=>Promise<OtaMetadataRequest>}
function invalid():never{throw new Error('版本资料不完整或范围不符，请重新读取')}
function object(value:unknown,names?:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as StrictJsonValue)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();const row=value as Record<string,unknown>;if(names&&(Object.keys(row).length!==names.length||names.some(key=>!Object.hasOwn(row,key))))invalid();return row}
export function otaMetadataRevision(value:unknown):value is string{return typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n&&BigInt(value).toString()===value}
export function validOtaName(value:string){return !/^[\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]*$/u.test(value)&&Array.from(value).length<=128&&!/[\u0000-\u001f\u007f-\u009f]|\p{Surrogate}/u.test(value)}
export function decodeOtaManagementMetadata(value:unknown):OtaManagementMetadata{
 const row=object(value,['name','description','tags']),tags=object(row.tags)
 if(typeof row.name!=='string'||!validOtaName(row.name)||row.description!==null&&(typeof row.description!=='string'||Array.from(row.description).length>2048||/[\u0000]|\p{Surrogate}/u.test(row.description)))invalid()
 const rows=Object.entries(tags).map(([key,value])=>{if(typeof value!=='string')invalid();return {key,value:value as string}})
 if(validateTagRows(rows).length!==rows.length)invalid();return Object.freeze({name:row.name,description:row.description as string|null,tags:Object.freeze(Object.fromEntries(rows.map(row=>[row.key,row.value])))})
}
export function decodeOtaMetadataSnapshot(value:unknown):OtaMetadataSnapshot{const row=object(value,['metadata','revision']);if(!otaMetadataRevision(row.revision)||row.metadata===null&&row.revision!=='0')invalid();return Object.freeze({metadata:row.metadata===null?null:decodeOtaManagementMetadata(row.metadata),revision:row.revision})}
export function decodeOtaMetadataView(value:unknown,project:string,firmware?:string):OtaMetadataView{const row=object(value,['firmware','metadata']);return Object.freeze({firmware:decodeOtaFirmware(row.firmware,project,firmware),metadata:decodeOtaMetadataSnapshot(row.metadata)})}
export function decodeOtaCreationReceipt(value:unknown,project:string):OtaCreationReceipt{const row=object(value,['firmware','creationMetadata']);return Object.freeze({firmware:decodeOtaFirmware(row.firmware,project),creationMetadata:row.creationMetadata===null?null:decodeOtaManagementMetadata(row.creationMetadata)})}
export function sameOtaMetadata(left:OtaManagementMetadata|null,right:OtaManagementMetadata){return left!==null&&left.name===right.name&&left.description===right.description&&Object.keys(left.tags).length===Object.keys(right.tags).length&&Object.entries(right.tags).every(([key,value])=>Object.hasOwn(left.tags,key)&&left.tags[key]===value)}
export function otaMetadataDraft(snapshot?:OtaMetadataSnapshot):OtaMetadataDraft{return {name:snapshot?.metadata?.name??'',description:snapshot?.metadata?.description??(snapshot?.metadata?null:''),tags:Object.entries(snapshot?.metadata?.tags??{}).map(([key,value])=>({key,value}))}}
export function prepareOtaMetadata(draft:OtaMetadataDraft):OtaManagementMetadata{return decodeOtaManagementMetadata({name:draft.name,description:draft.description,tags:Object.fromEntries(validateTagRows(draft.tags).map(row=>[row.key,row.value]))})}
export function prepareOtaMetadataIntent(project:string,firmware:string,snapshot:OtaMetadataSnapshot,draft:OtaMetadataDraft):OtaMetadataIntent{if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(firmware)||!otaMetadataRevision(snapshot.revision)||snapshot.revision==='9223372036854775807')invalid();return Object.freeze({project,firmware,key:crypto.randomUUID(),body:Object.freeze({expectedRevision:snapshot.revision,metadata:prepareOtaMetadata(draft)})})}
export function decodeOtaMetadataRequest(value:unknown,intent:OtaMetadataIntent):OtaMetadataRequest{const row=object(value,['projectId','firmwareId','expectedRevision','metadata']),snapshot=decodeOtaMetadataSnapshot(row.metadata);if(row.projectId!==intent.project||row.firmwareId!==intent.firmware||row.expectedRevision!==intent.body.expectedRevision||snapshot.revision!==(BigInt(intent.body.expectedRevision)+1n).toString()||!sameOtaMetadata(snapshot.metadata,intent.body.metadata))invalid();return Object.freeze({projectId:intent.project,firmwareId:intent.firmware,expectedRevision:intent.body.expectedRevision,metadata:snapshot})}
function path(project:string,firmware:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(firmware))invalid();return `/api/v1/projects/${project}/ota/firmwares/${firmware}/metadata` as const}
export const otaManagementTransport:OtaManagementTransport={
 async read(project,firmware,signal){return decodeOtaMetadataView(parseDashboardRuntimeResponse(await api<Uint8Array>(path(project,firmware),{signal,responseType:'bytes',maxResponseBytes:64*1024})),project,firmware)},
 async update(intent,signal){const bytes=await api<Uint8Array>(path(intent.project,intent.firmware),{method:'put',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:64*1024});try{return decodeOtaMetadataRequest(parseDashboardRuntimeResponse(bytes),intent)}catch{throw new ApiError('保存结果暂不能核对，请读取原保存结果',200,undefined,undefined,true)}},
 async recover(intent,signal){return decodeOtaMetadataRequest(parseDashboardRuntimeResponse(await api<Uint8Array>(`${path(intent.project,intent.firmware)}/requests/by-key`,{headers:{'Original-Request-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:64*1024})),intent)}
}
