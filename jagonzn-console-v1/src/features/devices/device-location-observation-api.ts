import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'
export type LocationReportSource=Readonly<Schema<'DeviceLocationReportSourceResponse'>>
export type LocationObservation=Readonly<Schema<'DeviceLocationObservationResponse'>>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export function decodeLocationObservation(value:unknown):LocationObservation{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('有效位置观察不完整');const raw=value as Record<string,unknown>
 const manual=raw.source==='LEGACY_MANUAL'||raw.source==='MANUAL',blocked=raw.source==='DISABLED'||raw.source==='UNAVAILABLE',report=raw.source==='REPORTED_PROPERTY'
 const coordinates=raw.longitude===null&&raw.latitude===null||typeof raw.longitude==='number'&&typeof raw.latitude==='number'&&Number.isFinite(raw.longitude)&&Number.isFinite(raw.latitude)&&raw.longitude>=-180&&raw.longitude<=180&&raw.latitude>=-90&&raw.latitude<=90
 const version=typeof raw.manualVersion==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(raw.manualVersion)&&BigInt(raw.manualVersion)<=9223372036854775807n
 if(Object.keys(raw).length!==(report?5:4)||!['source','longitude','latitude','manualVersion'].every(key=>Object.hasOwn(raw,key))||!manual&&!blocked&&!report||manual&&(!coordinates||!version)||blocked&&(raw.longitude!==null||raw.latitude!==null||raw.manualVersion!==null)||report&&(!coordinates||raw.longitude===null||raw.manualVersion!==null))throw new Error('有效位置来源、坐标或原版本不符合合同')
 let reported:LocationReportSource|undefined
 if(report){const value=raw.reported;if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('上报位置缺少真实来源身份');const r=value as Record<string,unknown>;if(Object.keys(r).length!==4||typeof r.propertyKey!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(r.propertyKey)||typeof r.modelVersionId!=='string'||!uuid.test(r.modelVersionId)||typeof r.reportedRevision!=='string'||!/^[1-9][0-9]{0,18}$/.test(r.reportedRevision)||BigInt(r.reportedRevision)>9223372036854775807n||typeof r.occurredAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(r.occurredAt)||!Number.isFinite(Date.parse(r.occurredAt)))throw new Error('上报位置原键、固定模型、水位或发生时间无效');reported=Object.freeze({propertyKey:r.propertyKey,modelVersionId:r.modelVersionId,reportedRevision:r.reportedRevision,occurredAt:r.occurredAt})}
 else if(Object.hasOwn(raw,'reported'))throw new Error('非上报来源不能夹带报告原件')
 return Object.freeze({source:raw.source as LocationObservation['source'],longitude:raw.longitude as number|null,latitude:raw.latitude as number|null,manualVersion:raw.manualVersion as string|null,...(reported?{reported}:{})})
}
export async function readLocationObservation(scope:Readonly<{project:string;device:string}>,signal:AbortSignal){if(!uuid.test(scope.project)||!uuid.test(scope.device))throw new Error('设备位置范围无效');return decodeLocationObservation(await api<Schema<'DeviceLocationObservationResponse'>>(`${devicePath(scope.project,scope.device)}/location-observation`,{signal,maxResponseBytes:8192}))}
