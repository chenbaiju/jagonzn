import {api,assertIdentity,identityEpoch} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
import {downloadTabular} from '../devices/device-data-export'
export type SceneUsageDays=1|3|7|15|30
type Bucket=NonNullable<Schema<'SceneUsageStatisticsView'>['buckets']>[number]
/** 本域图面模型保留原十进制计数；只有绘图比例可转浮点数。 */
export type SceneUsageSeries={key:string;label:string;color:string;kind:'bar'|'line';values:readonly(string|null)[]}
const runDefinitions=[['runSucceeded','完成','rgba(75,192,192,.7)','bar'],['runFailed','失败','rgba(255,99,132,.7)','bar'],['runSkipped','跳过','rgba(255,159,64,1)','line'],['runTerminated','被终止','rgba(153,102,255,1)','line']] as const
const actionDefinitions=[['actionAttrsPush','下发属性','rgba(54,162,235,.6)','bar'],['actionAttrsUpdate','更新属性','rgba(75,192,192,.6)','bar'],['actionTaskRun','执行任务','rgba(255,99,132,.6)','bar'],['actionDelay','延时','rgba(255,159,64,.6)','bar']] as const
const hour=3600000000000n,day=24n*hour
function invalid():never{throw new Error('场景统计数据不完整，请重新读取')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>}
function instant(value:unknown):bigint{
 if(typeof value!=='string')invalid()
 const match=/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(value)
 if(!match)invalid()
 const milliseconds=Date.parse(match[1]+'Z')
 if(!Number.isFinite(milliseconds)||new Date(milliseconds).toISOString().slice(0,19)!==match[1])invalid()
 return BigInt(milliseconds)*1000000n+BigInt((match[2]??'').padEnd(9,'0'))
}
function count(value:unknown):string{if(typeof value!=='string'||!/^(0|[1-9]\d{0,38})$/.test(value))invalid();return value}
function nullableCount(value:unknown):string|null{return value===null?null:count(value)}
/** 不补桶、不将缺字段转零，全部小时严格对齐服务端同一观察窗口。 */
export function decodeSceneStatistics(value:Schema<'SceneUsageStatisticsView'>,sceneId:string,days:SceneUsageDays){
 const v=object(value),window=object(v.window),coverage=object(v.coverage)
 if(v.sceneId!==sceneId||![1,3,7,15,30].includes(days)||window.days!==days||window.bucketSeconds!==3600||!Array.isArray(v.buckets))invalid()
 const from=instant(window.from),to=instant(window.to),observedAt=instant(v.observedAt),first=from/hour*hour
 if(to!==observedAt||to-from!==BigInt(days)*day||v.buckets.length!==Number((to-first+hour-1n)/hour))invalid()
 const totalRunCount=count(v.totalRunCount),lastRunAt=v.lastRunAt===null?null:(instant(v.lastRunAt),v.lastRunAt as string)
 if(lastRunAt!==null&&instant(lastRunAt)>observedAt||typeof coverage.complete!=='boolean'||!Array.isArray(coverage.unsupportedNodeTypes)||coverage.unsupportedNodeTypes.some(x=>typeof x!=='string')||!Array.isArray(coverage.limitations)||coverage.limitations.some(x=>typeof x!=='string'))invalid()
 count(coverage.incompleteRunCount);count(coverage.unknownActionCount)
 const buckets=v.buckets.map((raw,index)=>{const b=object(raw);if(instant(b.hour)!==first+BigInt(index)*hour)invalid();for(const key of ['runSucceeded','runFailed','runSkipped','runPending','runUnknown','incompleteRunCount','unknownActionCount'] as const)count(b[key]);nullableCount(b.runTerminated);nullableCount(b.actionDelay);for(const key of ['actionAttrsPush','actionAttrsUpdate','actionTaskRun'])nullableCount(b[key]);return b})
 function series(definitions:readonly(readonly[keyof Bucket,string,string,'bar'|'line'])[]):SceneUsageSeries[]{return definitions.map(([key,label,color,kind])=>({key:String(key),label,color,kind,values:buckets.map(b=>nullableCount(b[key as string]))}))}
 const pending=buckets.reduce((n,b)=>n+BigInt(count(b.runPending)),0n),unknown=buckets.reduce((n,b)=>n+BigInt(count(b.runUnknown)),0n)
 const notes=[pending||unknown?`当前窗口执行中 ${pending} 次，结果未确认 ${unknown} 次，均不计为完成。`:'完成仅统计已确认成功的运行。',...(!coverage.complete?['部分动作记录不完整，相关统计显示为未统计。']:[]),...(buckets.some(b=>b.runTerminated===null||b.actionDelay===null)?['部分历史运行没有终止或延时记录；未统计值不按零计算。']:[])]
 return {sceneId,totalRunCount,lastRunAt,observedAt:v.observedAt as string,days,bucketStarts:buckets.map(b=>b.hour as string),run:series(runDefinitions),action:series(actionDefinitions),notes}
}
export type SceneStatistics=ReturnType<typeof decodeSceneStatistics>
export async function readSceneStatistics(project:string,scene:string,days:SceneUsageDays,signal?:AbortSignal){
 if(!definitionUuid(project)||!definitionUuid(scene)||![1,3,7,15,30].includes(days))invalid()
 const epoch=identityEpoch(),value=await api<Schema<'SceneUsageStatisticsView'>>(`/api/v1/projects/${project}/scenes/${scene}/usage-statistics`,{query:{days},signal,maxResponseBytes:2097152})
 assertIdentity(epoch);return decodeSceneStatistics(value,scene,days)
}
export function sceneStatisticsRows(data:SceneStatistics,kind:'run'|'action'){
 const series=data[kind]
 return [['时间（UTC）',...series.map(s=>s.label)],...data.bucketStarts.map((at,index)=>[at,...series.map(s=>s.values[index]===null?'':s.values[index]!)]),['统计说明',data.notes.join(' ')]]
}
export function downloadSceneStatistics(data:SceneStatistics,kind:'run'|'action',name:string){downloadTabular(sceneStatisticsRows(data,kind),'xlsx',`${name||data.sceneId}-${kind==='run'?'执行统计':'动作调用统计'}`,undefined,'场景统计')}
