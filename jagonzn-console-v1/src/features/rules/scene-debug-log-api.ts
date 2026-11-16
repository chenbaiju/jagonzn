import {api,assertIdentity,identityEpoch} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
function invalid():never{throw new Error('场景日志读取不完整，请重新读取')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>}
function id(value:unknown):string{if(typeof value!=='string'||!definitionUuid(value))invalid();return value}
function time(value:unknown):string{if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))invalid();return value}
function nullableId(value:unknown){return value===null?null:id(value)}
function nullableTime(value:unknown){return value===null?null:time(value)}
function duration(value:unknown):number|null{if(value===null)return null;if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)invalid();return value}
/** 原站按毫秒、秒、分钟显示；旧执行没有耗时事实时保持未知。 */
export function sceneLogElapsed(value:number|null):string{return value===null?'未知':value<1000?`${value}ms`:value<60000?`${(value/1000).toFixed(1)}s`:`${(value/60000).toFixed(1)}min`}
export function sceneLogCounter(value:unknown,positive=false):string{if(typeof value!=='string'||!/^(0|[1-9]\d{0,18})$/.test(value)||BigInt(value)>9223372036854775807n||positive&&value==='0')invalid();return value}
export function decodeSceneLogControl(value:Schema<'SceneDebugLogControlView'>,scene:string){const v=object(value);if(v.sceneId!==scene||typeof v.enabled!=='boolean')invalid();return {sceneId:scene,enabled:v.enabled,version:sceneLogCounter(v.version,true),generation:sceneLogCounter(v.generation,true)}}
export type SceneLogControl=ReturnType<typeof decodeSceneLogControl>
export function decodeSceneLogPage(value:Schema<'SceneDebugLogPageView'>,scene:string,page:number){
 const v=object(value);if(v.sceneId!==scene||v.page!==page||v.pageSize!==20||!Array.isArray(v.items)||v.items.length>20)invalid()
 const observedAt=time(v.observedAt),total=sceneLogCounter(v.total),control=decodeSceneLogControl(v.control as Schema<'SceneDebugLogControlView'>,scene),seen=new Set<string>()
 const items=v.items.map(raw=>{const row=object(raw),executionId=id(row.executionId);if(seen.has(executionId)||!['DISPATCHED','SKIPPED','FAILED','QUEUED','RUNNING','WAITING','SUCCEEDED','TERMINATED'].includes(String(row.sourceStatus))||!['SUCCEEDED','FAILED','PENDING','UNKNOWN','SKIPPED','TERMINATED'].includes(String(row.result))||typeof row.coverageComplete!=='boolean'||row.sourceStatus==='DISPATCHED'&&row.durationMillis!==null||!Array.isArray(row.actions)||!Array.isArray(row.limitations)||row.limitations.some(x=>typeof x!=='string'))invalid();seen.add(executionId)
  const ordinals=new Set<number>(),actions=row.actions.map(value=>{const a=object(value);if(!Number.isSafeInteger(a.ordinal)||Number(a.ordinal)<0||ordinals.has(Number(a.ordinal))||typeof a.nodeType!=='string'||!['SUCCEEDED','FAILED','PENDING','UNKNOWN','NOT_RUN','TERMINATED'].includes(String(a.result))||row.sourceStatus==='DISPATCHED'&&a.durationMillis!==null)invalid();ordinals.add(Number(a.ordinal));const acceptedAt=nullableTime(a.acceptedAt),completedAt=nullableTime(a.completedAt),effectId=nullableId(a.effectId),durationMillis=duration(a.durationMillis);if(a.result==='TERMINATED'&&(row.sourceStatus!=='TERMINATED'||a.nodeType!=='scene-delay-action'||!acceptedAt||!completedAt||a.targetDeviceId!==null||effectId!==null||durationMillis===null)||a.result==='SUCCEEDED'&&(!acceptedAt||!completedAt)||a.result==='NOT_RUN'&&(acceptedAt!==null||effectId!==null||durationMillis!==null))invalid();return {ordinal:Number(a.ordinal),nodeType:a.nodeType,actionId:nullableId(a.actionId),targetDeviceId:nullableId(a.targetDeviceId),effectId,result:a.result as 'SUCCEEDED'|'FAILED'|'PENDING'|'UNKNOWN'|'NOT_RUN'|'TERMINATED',acceptedAt,completedAt,durationMillis}})
  return {executionId,versionId:id(row.versionId),sourceDeviceId:id(row.sourceDeviceId),occurredAt:time(row.occurredAt),recordedAt:time(row.recordedAt),sourceStatus:String(row.sourceStatus),result:row.result as 'SUCCEEDED'|'FAILED'|'PENDING'|'UNKNOWN'|'SKIPPED'|'TERMINATED',coverageComplete:row.coverageComplete,durationMillis:duration(row.durationMillis),actions,limitations:row.limitations as string[]}
 })
 if(BigInt(total)<BigInt(items.length)||!items.length&&BigInt(total)>BigInt(page-1)*20n)invalid()
 return {sceneId:scene,observedAt,page,pageSize:20,total,control,items}
}
export type SceneLogPage=ReturnType<typeof decodeSceneLogPage>
export type SceneLogEntry=SceneLogPage['items'][number]
function path(project:string,scene:string){id(project);id(scene);return `/api/v1/projects/${project}/scenes/${scene}` as const}
export const sceneDebugLogApi={
 async page(project:string,scene:string,page:number,signal:AbortSignal){if(!Number.isSafeInteger(page)||page<1||page>2147483647)invalid();const epoch=identityEpoch(),value=await api<Schema<'SceneDebugLogPageView'>>(`${path(project,scene)}/debug-logs`,{query:{page},signal,maxResponseBytes:2097152});assertIdentity(epoch);return decodeSceneLogPage(value,scene,page)},
 async control(project:string,scene:string,signal:AbortSignal){const epoch=identityEpoch(),value=await api<Schema<'SceneDebugLogControlView'>>(`${path(project,scene)}/debug-log-control`,{signal});assertIdentity(epoch);return decodeSceneLogControl(value,scene)},
 async enabled(project:string,scene:string,expectedVersion:string,enabled:boolean){const body:Schema<'SceneDebugLogControlWriteRequest'>={expectedVersion:sceneLogCounter(expectedVersion,true),enabled};return decodeSceneLogControl(await api<Schema<'SceneDebugLogControlView'>>(`${path(project,scene)}/debug-log-control`,{method:'put',body}),scene)},
 async clear(project:string,scene:string,expectedVersion:string){const body:Schema<'SceneDebugLogClearRequest'>={expectedVersion:sceneLogCounter(expectedVersion,true)};return decodeSceneLogControl(await api<Schema<'SceneDebugLogControlView'>>(`${path(project,scene)}/debug-logs/clear`,{method:'post',body}),scene)},
}
