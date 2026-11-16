import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import type {ApiUrl} from '@/core/paths'
import {decodeOtaMetadataView,validOtaName,type OtaMetadataView} from './ota-management-metadata-api'
import {decodeOtaEnablementSnapshot,type OtaEnablementSnapshot} from './ota-enablement-api'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {typeDeviceUuid,readTypeDevices,type TypeDeviceQuery} from '../device-types/type-devices-api'
export type OtaFirmware=Readonly<Omit<Required<Schema<'OtaFirmwareResponse'>>,'cancelledAt'>&{cancelledAt:string|null}>
export type OtaUpload=Readonly<Omit<Required<Schema<'OtaUploadResponse'>>,'failureCode'|'cancelRequestedAt'|'cleanupCompletedAt'>&{failureCode:string|null;cancelRequestedAt:string|null;cleanupCompletedAt:string|null}>
export type OtaPublication=Readonly<Omit<Required<Schema<'OtaPublicationResponse'>>,'failureCode'>&{failureCode:string|null}>
export type OtaBaseline=Readonly<Required<Schema<'OtaTypeBaselineVersionResponse'>>>
export type OtaEligibility=Readonly<Required<Schema<'OtaDeviceEligibilityResponse'>>>
export type OtaReadPage<T>=Readonly<{items:readonly T[];nextCursor:string|null;hasMore:boolean}>
export const otaFirmwareStatuses=['DRAFT','VERIFYING','READY','CANCELLED','DEPRECATED','REVOKED'] as const
export type OtaFirmwareStatus=typeof otaFirmwareStatuses[number]
export type OtaDirectoryQuery=Readonly<{deviceTypeId?:string;status?:OtaFirmwareStatus;enabled?:boolean;keyword?:string;order:'ASC'|'DESC';cursor?:string;limit?:number}>
export type OtaFirmwareDirectoryEntry=Readonly<Omit<Required<Schema<'OtaFirmwareDirectoryEntryResponse'>>,'firmware'|'metadata'|'enablement'>&OtaMetadataView&{enablement:OtaEnablementSnapshot}>
export type OtaFirmwareDirectoryPage=Readonly<Required<Omit<Schema<'OtaFirmwareDirectoryResponse'>,'items'>>&{items:readonly OtaFirmwareDirectoryEntry[]}>
export type OtaMetadata=Readonly<{uploads:OtaReadPage<OtaUpload>;publications:OtaReadPage<OtaPublication>;baselines:OtaReadPage<OtaBaseline>}>
export type OtaTargets=Awaited<ReturnType<typeof readTypeDevices>>
export type OtaReadTransport={directory:(project:string,query:OtaDirectoryQuery,signal:AbortSignal)=>Promise<OtaFirmwareDirectoryPage>;list:(project:string,cursor:string|undefined,signal:AbortSignal)=>Promise<OtaReadPage<OtaFirmware>>;firmware:(project:string,id:string,signal:AbortSignal)=>Promise<OtaFirmware>;metadata:(project:string,firmware:OtaFirmware,signal:AbortSignal)=>Promise<OtaMetadata>;targets:(project:string,firmware:OtaFirmware,query:TypeDeviceQuery,signal:AbortSignal)=>Promise<OtaTargets>;eligibility:(project:string,firmware:string,device:string,signal:AbortSignal)=>Promise<OtaEligibility>}
function invalid():never{throw new Error('OTA 读取资料、分页或资源范围不符合合同')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as StrictJsonValue)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();return value as Record<string,unknown>}
function keys(value:Record<string,unknown>,names:string[]){if(Object.keys(value).length!==names.length||names.some(name=>!Object.hasOwn(value,name)))invalid()}
function text(value:unknown,max=512):value is string{return typeof value==='string'&&!/^[\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]*$/u.test(value)&&Array.from(value).length<=max&&!/[\u0000-\u001f\u007f-\u009f]|\p{Surrogate}/u.test(value)}
function time(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)&&Number.isFinite(Date.parse(value))}
function revision(value:unknown):value is string{return typeof value==='string'&&/^(0|[1-9]\d{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n}
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value)
const nullableTime=(value:unknown)=>value===null||time(value)
function nativeInteger(value:unknown,min:number,max:number):number{if(!isStrictJsonNumber(value as StrictJsonValue)||!/^\d+$/.test((value as {lexical:string}).lexical))invalid();const result=Number((value as {lexical:string}).lexical);if(!Number.isSafeInteger(result)||result<min||result>max)invalid();return result}
export function decodeOtaFirmware(value:unknown,project:string,id?:string):OtaFirmware{
 const raw=object(value);keys(raw,['id','projectId','deviceTypeId','thingModelVersionId','productKey','firmwareVersion','schemaDigestAlgorithm','schemaDigest','schemaProfile','status','revision','createdAt','cancelledAt'])
 if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(String(raw.id))||id!==undefined&&raw.id!==id||raw.projectId!==project||!typeDeviceUuid.test(String(raw.deviceTypeId))||!typeDeviceUuid.test(String(raw.thingModelVersionId))||!text(raw.productKey,64)||!text(raw.firmwareVersion,128)||!text(raw.schemaDigestAlgorithm,64)||!hash(raw.schemaDigest)||!text(raw.schemaProfile,64)||!text(raw.status,64)||!revision(raw.revision)||!time(raw.createdAt)||!nullableTime(raw.cancelledAt))invalid()
 return Object.freeze({...raw}) as OtaFirmware
}
export function decodeOtaReadPage<T>(bytes:Uint8Array,decode:(value:unknown)=>T,limit=20):OtaReadPage<T>{
 const raw=parseDashboardRuntimeResponse(bytes);keys(raw,['items','nextCursor','hasMore'])
 if(!Array.isArray(raw.items)||raw.items.length>limit||typeof raw.hasMore!=='boolean'||(raw.hasMore?typeof raw.nextCursor!=='string'||!raw.nextCursor||raw.nextCursor.length>4096||!raw.items.length:raw.nextCursor!==null))invalid()
 const items=raw.items.map(decode),ids=items.map(item=>object(item).id??object(item).baselineVersion)
 if(new Set(ids).size!==ids.length)invalid()
 return Object.freeze({items:Object.freeze(items),nextCursor:raw.nextCursor as string|null,hasMore:raw.hasMore})
}
function decodeOtaFirmwareDirectoryEntry(value:unknown,project:string):OtaFirmwareDirectoryEntry{const row=object(value);keys(row,['firmware','metadata','enablement']);return Object.freeze({...decodeOtaMetadataView({firmware:row.firmware,metadata:row.metadata},project),enablement:decodeOtaEnablementSnapshot(row.enablement)})}
export function decodeOtaFirmwareDirectory(bytes:Uint8Array,project:string,limit=20):OtaFirmwareDirectoryPage{
 const raw=parseDashboardRuntimeResponse(bytes);keys(raw,['items','nextCursor','hasMore','total'])
 if(!typeDeviceUuid.test(project)||!Number.isInteger(limit)||limit<1||limit>100||!revision(raw.total)||BigInt(raw.total).toString()!==raw.total||!Array.isArray(raw.items)||raw.items.length>limit||BigInt(raw.total)<BigInt(raw.items.length)||typeof raw.hasMore!=='boolean'||(raw.hasMore?typeof raw.nextCursor!=='string'||!text(raw.nextCursor,512)||raw.nextCursor.length>512||!raw.items.length||BigInt(raw.total)<=BigInt(raw.items.length):raw.nextCursor!==null))invalid()
 const items=raw.items.map(value=>decodeOtaFirmwareDirectoryEntry(value,project));if(new Set(items.map(item=>item.firmware.id)).size!==items.length)invalid()
 return Object.freeze({items:Object.freeze(items),nextCursor:raw.nextCursor as string|null,hasMore:raw.hasMore,total:raw.total})
}
export function decodeUpload(value:unknown,project:string,firmware:string):OtaUpload{const raw=object(value);keys(raw,['id','projectId','firmwareId','status','revision','expectedLength','expectedSha256','failureCode','createdAt','expiresAt','cancelRequestedAt','cleanupCompletedAt']);if(!typeDeviceUuid.test(String(raw.id))||raw.projectId!==project||raw.firmwareId!==firmware||!text(raw.status,64)||!revision(raw.revision)||!hash(raw.expectedSha256)||(raw.failureCode!==null&&!text(raw.failureCode,128))||!time(raw.createdAt)||!time(raw.expiresAt)||!nullableTime(raw.cancelRequestedAt)||!nullableTime(raw.cleanupCompletedAt))invalid();return Object.freeze({...raw,expectedLength:nativeInteger(raw.expectedLength,1,67108864)}) as OtaUpload}
export function decodePublication(value:unknown,firmware:string):OtaPublication{const raw=object(value);keys(raw,['id','firmwareId','uploadSessionId','status','revision','failureCode','createdAt','updatedAt']);if(!typeDeviceUuid.test(String(raw.id))||raw.firmwareId!==firmware||!typeDeviceUuid.test(String(raw.uploadSessionId))||!text(raw.status,64)||!revision(raw.revision)||(raw.failureCode!==null&&!text(raw.failureCode,128))||!time(raw.createdAt)||!time(raw.updatedAt))invalid();return Object.freeze({...raw}) as OtaPublication}
function decodeBaseline(value:unknown):OtaBaseline{const raw=object(value);keys(raw,['baselineVersion','baselineHash','registeredAt']);if(!hash(raw.baselineHash)||!time(raw.registeredAt))invalid();return Object.freeze({...raw,baselineVersion:nativeInteger(raw.baselineVersion,1,Number.MAX_SAFE_INTEGER)}) as OtaBaseline}
export function decodeOtaEligibility(bytes:Uint8Array):OtaEligibility{const raw=parseDashboardRuntimeResponse(bytes);keys(raw,['eligible','reason','reportRevision','checkedAt']);const reasons=['ELIGIBLE','REPORT_MISSING','REPORT_STALE','IDENTITY_CHANGED','INCOMPATIBLE','TRUST_NOT_ACKNOWLEDGED','FIRMWARE_UNAVAILABLE','FIRMWARE_DISABLED','VERSION_UNCONFIRMED','VERSION_NOT_NEWER','TARGET_CONDITIONS_NOT_MATCHED'];if(typeof raw.eligible!=='boolean'||!reasons.includes(String(raw.reason))||raw.eligible!==(raw.reason==='ELIGIBLE')||(raw.reportRevision!==null&&(!revision(raw.reportRevision)||raw.reportRevision==='0'))||!time(raw.checkedAt))invalid();return Object.freeze({...raw}) as OtaEligibility}
function base(project:string){if(!typeDeviceUuid.test(project))invalid();return `/api/v1/projects/${project}/ota` as const}
function firmwarePath(project:string,id:string){if(!typeDeviceUuid.test(id))invalid();return `${base(project)}/firmwares/${id}` as const}
async function bytes(path:ApiUrl<'get'>,signal:AbortSignal,query?:Record<string,string|number|undefined>){return api<Uint8Array>(path,{signal,query,responseType:'bytes',maxResponseBytes:1024*1024})}
export const otaReadTransport:OtaReadTransport={
 async directory(project,query,signal){
  const limit=query.limit??20
  if(query.deviceTypeId!==undefined&&!typeDeviceUuid.test(query.deviceTypeId)||query.status!==undefined&&!otaFirmwareStatuses.includes(query.status)||query.enabled!==undefined&&typeof query.enabled!=='boolean'||!['ASC','DESC'].includes(query.order)||query.keyword!==undefined&&!validOtaName(query.keyword)||!Number.isInteger(limit)||limit<1||limit>100||query.cursor!==undefined&&(!text(query.cursor,512)||query.cursor.length>512))invalid()
  return decodeOtaFirmwareDirectory(await bytes(`${base(project)}/firmwares/directory`,signal,{deviceTypeId:query.deviceTypeId,status:query.status,enabled:query.enabled===undefined?undefined:String(query.enabled),keyword:query.keyword,order:query.order,cursor:query.cursor,limit}),project,limit)
 },
 async list(project,cursor,signal){return decodeOtaReadPage(await bytes(`${base(project)}/firmwares`,signal,{limit:20,cursor}),value=>decodeOtaFirmware(value,project))},
 async firmware(project,id,signal){return decodeOtaFirmware(parseDashboardRuntimeResponse(await bytes(firmwarePath(project,id),signal)),project,id)},
 async metadata(project,firmware,signal){if(firmware.projectId!==project)invalid();const path=firmwarePath(project,firmware.id);const[uploads,publications,baselines]=await Promise.all([bytes(`${path}/uploads`,signal,{limit:20}),bytes(`${path}/publications`,signal,{limit:20}),bytes(`${base(project)}/device-types/${firmware.deviceTypeId}/baseline/versions`,signal,{limit:20})]);return Object.freeze({uploads:decodeOtaReadPage(uploads,value=>decodeUpload(value,project,firmware.id)),publications:decodeOtaReadPage(publications,value=>decodePublication(value,firmware.id)),baselines:decodeOtaReadPage(baselines,decodeBaseline)})},
 async targets(project,firmware,query,signal){if(firmware.projectId!==project)invalid();return readTypeDevices(project,firmware.deviceTypeId,query,signal)},
 async eligibility(project,firmware,device,signal){if(!typeDeviceUuid.test(device)||!typeDeviceUuid.test(firmware))invalid();return decodeOtaEligibility(await bytes(`${base(project)}/devices/${device}/eligibility`,signal,{firmwareId:firmware}))}
}
