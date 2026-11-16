import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {directoryAlarmStatus} from '../devices/directory-alarm-status'
import {validOtaName} from './ota-management-metadata-api'
import {otaMainAppTransport} from './ota-main-app-api'
import type {OtaFirmware} from './ota-read-api'

export type OtaVersionBucket=Readonly<Omit<Required<Schema<'OtaFirmwareVersionBucket'>>,'version'|'percentage'>&{version:string|null;percentage:string|null}>
export type OtaVersionDistribution=Readonly<Omit<Required<Schema<'OtaFirmwareVersionDistributionResponse'>>,'buckets'>&{buckets:readonly OtaVersionBucket[]}>
export const otaVersionUnknownReasons=['NO_CURRENT_MODEL','PROPERTY_MISSING','PROPERTY_NOT_TEXT','SOURCE_VERSION_UNKNOWN','SOURCE_MODEL_MISMATCH','CONTRACT_MISMATCH','SOURCE_REVISION_UNKNOWN'] as const
export type OtaReportedVersion=Readonly<Omit<Required<Schema<'OtaFirmwareReportedVersionFact'>>,'rawValue'|'reportedRevision'|'occurredAt'|'reason'>&{rawValue:string|null;reportedRevision:string|null;occurredAt:string|null;reason:typeof otaVersionUnknownReasons[number]|null}>
export type OtaVersionDevice=Readonly<Omit<Required<Schema<'OtaFirmwareVersionDevice'>>,'businessKey'|'lastOnlineAt'|'lastDataReportAt'|'currentModelVersionId'|'version'|'alarm'>&{businessKey:string|null;lastOnlineAt:string|null;lastDataReportAt:string|null;currentModelVersionId:string|null;version:OtaReportedVersion;alarm:Readonly<Schema<'DeviceAlarmObservation'>>}>
export type OtaVersionDevices=Readonly<Omit<Required<Schema<'OtaFirmwareVersionDevicesResponse'>>,'items'>&{items:readonly OtaVersionDevice[]}>
export type OtaVersionDevicesQuery=Readonly<{bucket:string;keyword?:string;status?:'INACTIVE'|'ONLINE'|'OFFLINE';order:'CREATED_ASC'|'CREATED_DESC'|'ACTIVE_DESC'|'NAME_ASC';page:number;limit:number}>
export type OtaVersionDistributionTransport={binding:typeof otaMainAppTransport.binding;read:(project:string,firmware:OtaFirmware,signal:AbortSignal)=>Promise<OtaVersionDistribution>;devices:(project:string,firmware:OtaFirmware,query:OtaVersionDevicesQuery,signal:AbortSignal)=>Promise<OtaVersionDevices>}
function invalid():never{throw new Error('版本分布或设备资料不完整，请重新读取')}
function object(value:unknown,names?:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as StrictJsonValue)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();const row=value as Record<string,unknown>;if(names&&(Object.keys(row).length!==names.length||names.some(key=>!Object.hasOwn(row,key))))invalid();return row}
function count(value:unknown):value is string{return typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n&&BigInt(value).toString()===value}
function time(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)&&Number.isFinite(Date.parse(value))}
function nullableTime(value:unknown){return value===null||time(value)}
function key(value:unknown):value is string{if(typeof value!=='string')return false;const match=/^[A-Za-z0-9_-]{1,64}$/.exec(value);return match!==null&&match[0]===value}
export function otaVersionBucketId(value:unknown):value is string{if(typeof value!=='string')return false;const match=/^(?:VALUE-[0-9a-f]{64}|NO_VALUE|UNCONFIRMED)$/.exec(value);return match!==null&&match[0]===value}
function identity(row:Record<string,unknown>,project:string,firmware:OtaFirmware){if(!typeDeviceUuid.test(project)||firmware.projectId!==project||row.projectId!==project||row.firmwareId!==firmware.id||row.deviceTypeId!==firmware.deviceTypeId||row.targetVersion!==firmware.firmwareVersion||!key(row.versionProperty)||!time(row.observedAt))invalid()}
function nativeInteger(value:unknown,min:number,max:number){if(!isStrictJsonNumber(value as StrictJsonValue)||!/^(0|[1-9][0-9]*)$/.test((value as {lexical:string}).lexical))invalid();const result=Number((value as {lexical:string}).lexical);if(!Number.isInteger(result)||result<min||result>max)invalid();return result}
export function decodeOtaVersionDistribution(bytes:Uint8Array,project:string,firmware:OtaFirmware):OtaVersionDistribution{
 const row=parseDashboardRuntimeResponse(bytes);object(row,['projectId','firmwareId','deviceTypeId','versionProperty','targetVersion','observedAt','totalDevices','buckets']);identity(row,project,firmware)
 if(!count(row.totalDevices)||!Array.isArray(row.buckets))invalid();const seen=new Set<string>(),versions=new Set<string>();let total=0n
 const buckets=row.buckets.map(value=>{const item=object(value,['id','state','version','count','percentage','target']);if(!otaVersionBucketId(item.id)||seen.has(item.id)||!count(item.count)||item.count==='0'||typeof item.target!=='boolean'||typeof item.percentage!=='string'||item.percentage.match(/^(?:100\.00|(?:0|[1-9][0-9]?)\.[0-9]{2})$/)?.[0]!==item.percentage||Number(item.percentage)>100)invalid();seen.add(item.id);total+=BigInt(item.count)
  if(item.state==='VALUE'){if(!item.id.startsWith('VALUE-')||typeof item.version!=='string'||versions.has(item.version)||item.target!==(item.version===firmware.firmwareVersion))invalid();versions.add(item.version)}else if(!['NO_VALUE','UNCONFIRMED'].includes(String(item.state))||item.id!==item.state||item.version!==null||item.target)invalid()
  return Object.freeze({...item}) as OtaVersionBucket
 });if(total!==BigInt(row.totalDevices))invalid();return Object.freeze({...row,buckets:Object.freeze(buckets)}) as OtaVersionDistribution
}
export function decodeOtaReportedVersion(value:unknown):OtaReportedVersion{const row=object(value,['state','rawValue','reportedRevision','occurredAt','reason']);if(row.reportedRevision!==null&&!count(row.reportedRevision)||!nullableTime(row.occurredAt))invalid();if(row.state==='VALUE'){if(typeof row.rawValue!=='string'||row.reportedRevision===null||row.occurredAt===null||row.reason!==null)invalid()}else if(row.state==='NO_VALUE'){if(row.rawValue!==null||row.occurredAt!==null||row.reason!==null)invalid()}else if(row.state==='UNCONFIRMED'){if(row.rawValue!==null||row.occurredAt!==null||row.reportedRevision!==null||!otaVersionUnknownReasons.includes(row.reason as typeof otaVersionUnknownReasons[number]))invalid()}else invalid();return Object.freeze({...row}) as OtaReportedVersion}
export function decodeOtaVersionDevices(bytes:Uint8Array,project:string,firmware:OtaFirmware,query:OtaVersionDevicesQuery):OtaVersionDevices{
 const row=parseDashboardRuntimeResponse(bytes);object(row,['projectId','firmwareId','deviceTypeId','versionProperty','targetVersion','observedAt','bucket','items','total','page','limit']);identity(row,project,firmware)
 if(row.bucket!==query.bucket||!count(row.total)||!Array.isArray(row.items)||nativeInteger(row.page,1,2147483647)!==query.page||nativeInteger(row.limit,1,200)!==query.limit)invalid()
 const remaining=BigInt(row.total)-BigInt(query.page-1)*BigInt(query.limit),expected=remaining<=0n?0:Number(remaining>BigInt(query.limit)?BigInt(query.limit):remaining);if(row.items.length!==expected)invalid()
 const seen=new Set<string>();const items=row.items.map(value=>{const item=object(value,['deviceId','name','deviceKey','businessKey','createdAt','status','lastOnlineAt','lastDataReportAt','alarm','currentModelVersionId','version']);if(typeof item.deviceId!=='string'||!typeDeviceUuid.test(item.deviceId)||seen.has(item.deviceId)||typeof item.name!=='string'||!item.name||typeof item.deviceKey!=='string'||!item.deviceKey||item.businessKey!==null&&typeof item.businessKey!=='string'||!time(item.createdAt)||typeof item.status!=='string'||!['INACTIVE','ONLINE','OFFLINE'].includes(item.status)||!nullableTime(item.lastOnlineAt)||!nullableTime(item.lastDataReportAt)||item.currentModelVersionId!==null&&(typeof item.currentModelVersionId!=='string'||!typeDeviceUuid.test(item.currentModelVersionId)))invalid();seen.add(item.deviceId)
  const version=decodeOtaReportedVersion(item.version),state=query.bucket.startsWith('VALUE-')?'VALUE':query.bucket;if(version.state!==state||version.state!=='UNCONFIRMED'&&item.currentModelVersionId===null)invalid();const alarm=object(item.alarm,['deviceId','modelVersionId','observedAt','state','highestSeverity']);if(alarm.observedAt!==row.observedAt)invalid();return Object.freeze({...item,version,alarm:Object.freeze({...alarm})}) as OtaVersionDevice
 });for(let offset=0;offset<items.length;offset+=96){const part=items.slice(offset,offset+96);directoryAlarmStatus(part.map(item=>({id:item.deviceId})),part.map(item=>item.alarm))}
 return Object.freeze({...row,items:Object.freeze(items),page:query.page,limit:query.limit}) as OtaVersionDevices
}
function base(project:string,firmware:OtaFirmware){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(firmware.id)||firmware.projectId!==project)invalid();return `/api/v1/projects/${project}/ota/firmwares/${firmware.id}/version-distribution` as const}
function validQuery(query:OtaVersionDevicesQuery){if(!otaVersionBucketId(query.bucket)||!Number.isInteger(query.page)||query.page<1||query.page>2147483647||!Number.isInteger(query.limit)||query.limit<1||query.limit>200||query.keyword!==undefined&&(query.keyword.length>128||!validOtaName(query.keyword))||query.status!==undefined&&!['INACTIVE','ONLINE','OFFLINE'].includes(query.status)||!['CREATED_ASC','CREATED_DESC','ACTIVE_DESC','NAME_ASC'].includes(query.order))invalid()}
export const otaVersionDistributionTransport:OtaVersionDistributionTransport={
 binding:otaMainAppTransport.binding,
 async read(project,firmware,signal){return decodeOtaVersionDistribution(await api<Uint8Array>(base(project,firmware),{signal,responseType:'bytes',maxResponseBytes:8*1024*1024}),project,firmware)},
 async devices(project,firmware,query,signal){validQuery(query);return decodeOtaVersionDevices(await api<Uint8Array>(`${base(project,firmware)}/devices`,{query,signal,responseType:'bytes',maxResponseBytes:8*1024*1024}),project,firmware,query)}
}
