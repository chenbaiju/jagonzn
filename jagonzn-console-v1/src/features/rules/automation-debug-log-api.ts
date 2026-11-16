import {api,assertIdentity,identityEpoch} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
function invalid():never{throw new Error('自动化日志读取不完整，请重新读取')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>}
function id(value:unknown):string{if(typeof value!=='string'||!definitionUuid(value))invalid();return value}
function time(value:unknown):string{if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))invalid();return value}
function nullableId(value:unknown){return value===null?null:id(value)}
function nullableTime(value:unknown){return value===null?null:time(value)}
function duration(value:unknown):number|null{if(value===null)return null;if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)invalid();return value}
/** 原站按毫秒、秒、分钟显示；旧执行没有耗时事实时保持未知。 */
export function automationLogElapsed(value:number|null):string{return value===null?'未知':value<1000?`${value}ms`:value<60000?`${(value/1000).toFixed(1)}s`:`${(value/60000).toFixed(1)}min`}
export function automationLogCounter(value:unknown,positive=false):string{if(typeof value!=='string'||!/^(0|[1-9]\d{0,18})$/.test(value)||BigInt(value)>9223372036854775807n||positive&&value==='0')invalid();return value}
export function decodeAutomationLogControl(value:Schema<'AutomationDebugLogControlView'>,automation:string){const v=object(value);if(v.automationId!==automation||typeof v.enabled!=='boolean')invalid();return {automationId:automation,enabled:v.enabled,version:automationLogCounter(v.version,true),generation:automationLogCounter(v.generation,true)}}
export type AutomationLogControl=ReturnType<typeof decodeAutomationLogControl>
export function decodeAutomationLogPage(value:Schema<'AutomationDebugLogPageView'>,automation:string,page:number){
 const v=object(value);if(v.automationId!==automation||v.page!==page||v.pageSize!==20||!Array.isArray(v.items)||v.items.length>20)invalid()
 const observedAt=time(v.observedAt),total=automationLogCounter(v.total),control=decodeAutomationLogControl(v.control as Schema<'AutomationDebugLogControlView'>,automation),seen=new Set<string>()
 const items=v.items.map(raw=>{const row=object(raw),executionId=id(row.executionId);if(seen.has(executionId)||!['DISPATCHED','SKIPPED','FAILED','QUEUED','RUNNING','RETRY_WAIT','REJECTED'].includes(String(row.sourceStatus))||!['SUCCEEDED','FAILED','PENDING','UNKNOWN','SKIPPED','BLOCKED'].includes(String(row.result))||typeof row.coverageComplete!=='boolean'||!['PROPERTY_REPORTED','PROPERTY_CHANGED','DATETIME','SCHEDULE','ONE_SHOT','CRON','UNKNOWN'].includes(String(row.triggerKind))||!(row.reasonCode===null||typeof row.reasonCode==='string')||!Array.isArray(row.attempts)||row.attempts.length>3||!Array.isArray(row.actions)||!Array.isArray(row.limitations)||row.limitations.some(x=>typeof x!=='string'))invalid();seen.add(executionId)
  const ordinals=new Set<number>(),actions=row.actions.map(value=>{const a=object(value);if(!Number.isSafeInteger(a.ordinal)||Number(a.ordinal)<0||ordinals.has(Number(a.ordinal))||typeof a.nodeType!=='string'||!['SUCCEEDED','FAILED','PENDING','UNKNOWN'].includes(String(a.result)))invalid();ordinals.add(Number(a.ordinal));const acceptedAt=nullableTime(a.acceptedAt),completedAt=nullableTime(a.completedAt),effectId=nullableId(a.effectId),durationMillis=duration(a.durationMillis);if(a.result==='SUCCEEDED'&&(!acceptedAt||effectId===null)||a.result==='PENDING'&&(!acceptedAt||effectId===null))invalid();return {ordinal:Number(a.ordinal),nodeType:a.nodeType,actionId:nullableId(a.actionId),targetDeviceId:nullableId(a.targetDeviceId),effectId,result:a.result as 'SUCCEEDED'|'FAILED'|'PENDING'|'UNKNOWN',acceptedAt,completedAt,durationMillis}})
  return {executionId,versionId:id(row.versionId),sourceDeviceId:nullableId(row.sourceDeviceId),occurredAt:time(row.occurredAt),recordedAt:time(row.recordedAt),sourceStatus:String(row.sourceStatus),result:row.result as 'SUCCEEDED'|'FAILED'|'PENDING'|'UNKNOWN'|'SKIPPED'|'BLOCKED',triggerKind:String(row.triggerKind),reasonCode:row.reasonCode as string|null,attempts:row.attempts.map(raw=>{const a=object(raw);if(!Number.isSafeInteger(a.attemptNumber)||Number(a.attemptNumber)<1||Number(a.attemptNumber)>3||!['STARTED','SUCCEEDED','FAILED','LEASE_EXPIRED'].includes(String(a.outcome))||!(a.reasonCode===null||typeof a.reasonCode==='string'))invalid();return {attemptNumber:Number(a.attemptNumber),startedAt:time(a.startedAt),finishedAt:nullableTime(a.finishedAt),outcome:String(a.outcome),reasonCode:a.reasonCode as string|null}}),coverageComplete:row.coverageComplete,durationMillis:duration(row.durationMillis),actions,limitations:row.limitations as string[]}
 })
 if(BigInt(total)<BigInt(items.length)||!items.length&&BigInt(total)>BigInt(page-1)*20n)invalid()
 return {automationId:automation,observedAt,page,pageSize:20,total,control,items}
}
export type AutomationLogPage=ReturnType<typeof decodeAutomationLogPage>
export type AutomationLogEntry=AutomationLogPage['items'][number]
function path(project:string,automation:string){id(project);id(automation);return `/api/v1/projects/${project}/automations/${automation}` as const}
export const automationDebugLogApi={
 async page(project:string,automation:string,page:number,signal:AbortSignal){if(!Number.isSafeInteger(page)||page<1||page>2147483647)invalid();const epoch=identityEpoch(),value=await api<Schema<'AutomationDebugLogPageView'>>(`${path(project,automation)}/debug-logs`,{query:{page},signal,maxResponseBytes:2097152});assertIdentity(epoch);return decodeAutomationLogPage(value,automation,page)},
 async control(project:string,automation:string,signal:AbortSignal){const epoch=identityEpoch(),value=await api<Schema<'AutomationDebugLogControlView'>>(`${path(project,automation)}/debug-log-control`,{signal});assertIdentity(epoch);return decodeAutomationLogControl(value,automation)},
 async enabled(project:string,automation:string,expectedVersion:string,enabled:boolean){const body:Schema<'AutomationDebugLogControlWriteRequest'>={expectedVersion:automationLogCounter(expectedVersion,true),enabled};return decodeAutomationLogControl(await api<Schema<'AutomationDebugLogControlView'>>(`${path(project,automation)}/debug-log-control`,{method:'put',body}),automation)},
 async clear(project:string,automation:string,expectedVersion:string){const body:Schema<'AutomationDebugLogClearRequest'>={expectedVersion:automationLogCounter(expectedVersion,true)};return decodeAutomationLogControl(await api<Schema<'AutomationDebugLogControlView'>>(`${path(project,automation)}/debug-logs/clear`,{method:'post',body}),automation)},
}
