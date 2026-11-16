import {api,ApiError,assertIdentity,identityEpoch} from '../../core/http'
import type {Schema} from '../../core/contracts'

export type AlarmRuntimeInstanceSnapshot=Readonly<Schema<'ConsoleAlarmRuntimeInstanceResponse'>>
export type AlarmRuntimeClearContent=Pick<Schema<'SaveAlarmLogMaintenanceRequest'>,'alarmReason'|'solution'|'remark'>
export type AlarmRuntimeInstanceIdentity={instanceId:string;ruleId?:string;deviceId?:string}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const fields=['id','ruleId','deviceId','alarmType','severity','conditionState','ackState','clearReason','firstConditionAt','activatedAt','clearedAt','acknowledgedAt','acknowledgedBy','lastReceivedAt','lastOccurredAt','version','createdAt','updatedAt','evaluationSnapshotJson'] as const
const names=new Set<string>(fields)
const text=(value:unknown):value is string=>typeof value==='string'&&!/[\u0000]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)
const invalid=()=>new Error('精确告警事故资料不完整')
const id=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value)
const floor=(n:bigint,d:bigint)=>n>=0n?n/d:(n-d+1n)/d
/** 仅比较平台生命周期时刻，保留微秒和ISO偏移；诊断设备时刻只校验格式，不参与先后。 */
function instant(value:unknown):bigint{
 if(typeof value!=='string')throw invalid()
 const found=/^([+-]?\d{4,9})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value)
 if(!found)throw invalid()
 const year=BigInt(found[1]!),month=Number(found[2]),day=Number(found[3]),hour=Number(found[4]),minute=Number(found[5]),second=Number(found[6]),offsetHours=Number(found[10]??0),offsetMinutes=Number(found[11]??0)
 const leap=year%4n===0n&&(year%100n!==0n||year%400n===0n),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31]
 if(month<1||month>12||day<1||day>days[month-1]!||hour>23||minute>59||second>59||offsetHours>23||offsetMinutes>59)throw invalid()
 const adjusted=year-(month<=2?1n:0n),era=floor(adjusted,400n),within=adjusted-era*400n,shifted=BigInt(month+(month>2?-3:9))
 const ordinal=era*146097n+within*365n+within/4n-within/100n+(153n*shifted+2n)/5n+BigInt(day)-1n-719468n
 const offset=BigInt((offsetHours*60+offsetMinutes)*(found[9]==='-'?-1:1))
 return (ordinal*86400n+BigInt(hour*3600+minute*60+second)-offset*60n)*1000000n+BigInt((found[7]??'').padEnd(6,'0'))
}
/** 只校验外层身份/生命周期传输字段；历史原件保留为不透明精确字符串，不解释历史配置或授予权限。 */
export function alarmRuntimeInstanceResponse(value:unknown,expected:AlarmRuntimeInstanceIdentity):AlarmRuntimeInstanceSnapshot{
 if(!id(expected.instanceId)||expected.ruleId!==undefined&&!id(expected.ruleId)||expected.deviceId!==undefined&&!id(expected.deviceId))throw invalid()
 if(!value||typeof value!=='object'||Array.isArray(value)||![null,Object.prototype].includes(Object.getPrototypeOf(value)))throw invalid()
 const keys=Reflect.ownKeys(value)
 if(keys.length!==fields.length||keys.some(key=>typeof key!=='string'||!names.has(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)!,'value')))throw invalid()
 const row=value as Record<string,unknown>
 if(row.id!==expected.instanceId||!id(row.ruleId)||!id(row.deviceId)||expected.ruleId!==undefined&&row.ruleId!==expected.ruleId||expected.deviceId!==undefined&&row.deviceId!==expected.deviceId
  ||!text(row.alarmType)||!row.alarmType.trim()||row.alarmType.length>64||typeof row.severity!=='string'||!['WARNING','MINOR','MAJOR','CRITICAL','INFO'].includes(row.severity)
  ||typeof row.conditionState!=='string'||!['PENDING','ACTIVE','CLEARED'].includes(row.conditionState)||typeof row.ackState!=='string'||!['UNACKNOWLEDGED','ACKNOWLEDGED'].includes(row.ackState)
  ||row.clearReason!==null&&(typeof row.clearReason!=='string'||!['AUTO_RECOVERY','MANUAL'].includes(row.clearReason))||!Number.isInteger(row.version)||Number(row.version)<0||Number(row.version)>2147483647)throw invalid()
 const first=instant(row.firstConditionAt),created=instant(row.createdAt),received=instant(row.lastReceivedAt),updated=instant(row.updatedAt)
 if(first>received||created>updated||received>updated)throw invalid()
 const activated=row.activatedAt===null?null:instant(row.activatedAt),cleared=row.clearedAt===null?null:instant(row.clearedAt),acknowledged=row.acknowledgedAt===null?null:instant(row.acknowledgedAt)
 if(activated!==null&&(activated<first||activated>updated)||cleared!==null&&(cleared<first||cleared>updated)||acknowledged!==null&&(acknowledged<created||acknowledged>updated)
  ||row.conditionState==='PENDING'&&(activated!==null||row.ackState!=='UNACKNOWLEDGED')||row.conditionState==='ACTIVE'&&activated===null
  ||row.conditionState==='CLEARED'&&(cleared===null||row.clearReason===null)||row.conditionState!=='CLEARED'&&(cleared!==null||row.clearReason!==null)
  ||row.ackState==='ACKNOWLEDGED'&&(acknowledged===null||!id(row.acknowledgedBy))||row.ackState==='UNACKNOWLEDGED'&&(acknowledged!==null||row.acknowledgedBy!==null))throw invalid()
 if(row.lastOccurredAt!==null)instant(row.lastOccurredAt)
 const raw=row.evaluationSnapshotJson
 if(!text(raw)||!raw.trim()||raw.length>5*1024*1024||new TextEncoder().encode(raw).byteLength>5*1024*1024)throw invalid()
 return Object.freeze({...row}) as AlarmRuntimeInstanceSnapshot
}
/** 本平台沿用独立维护资料64KiB UTF8边界；原文字与空白保留，不截断。 */
export function alarmRuntimeClearContent(value:AlarmRuntimeClearContent):Readonly<AlarmRuntimeClearContent>{
 const keys=['alarmReason','solution','remark'] as const
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3||keys.some(k=>!Object.hasOwn(value,k)||!text(value[k])||value[k].length>65536)||Reflect.ownKeys(value).some(k=>typeof k!=='string'||!keys.includes(k as typeof keys[number])))throw new Error('解除资料格式不完整')
 const copy={alarmReason:value.alarmReason,solution:value.solution,remark:value.remark}
 if(keys.reduce((total,key)=>total+new TextEncoder().encode(copy[key]).byteLength,0)>65536)throw new Error('解除资料文字过长，请缩短后提交')
 return Object.freeze(copy)
}
const projectId=(value:string)=>{if(!id(value))throw new Error('请先选择有效项目');return value}
const path=(project:string,instance:string)=>{if(!id(instance))throw invalid();return `/api/v1/projects/${projectId(project)}/console/alarm-instances/${instance}` as const}
const budget=12*1024*1024
const unchanged=['id','ruleId','deviceId','alarmType','severity','firstConditionAt','activatedAt','lastReceivedAt','lastOccurredAt','createdAt','evaluationSnapshotJson'] as const
/** 只提交原版本一次；正文不含owner/actor/force，成功回执不符时保留写结果未知。 */
async function action(project:string,previous:AlarmRuntimeInstanceSnapshot,kind:'ack'|'clear',signal?:AbortSignal,content?:AlarmRuntimeClearContent){
 const epoch=identityEpoch(),before=alarmRuntimeInstanceResponse(previous,{instanceId:previous.id}),base=path(project,before.id)
 if(before.version>=2147483647)throw new Error('事故版本已不可写，请重新读取核对')
 signal?.throwIfAborted()
 const body:Schema<'ConsoleAlarmRuntimeManualRequest'> & Partial<AlarmRuntimeClearContent>={version:before.version,...(content===undefined?{}:alarmRuntimeClearContent(content))}
 const value=await api<Schema<'ConsoleAlarmRuntimeInstanceResponse'>>(`${base}/${kind}`,{method:'post',body,signal,maxResponseBytes:budget})
 assertIdentity(epoch);signal?.throwIfAborted()
 try{
  const after=alarmRuntimeInstanceResponse(value,{instanceId:before.id,ruleId:before.ruleId,deviceId:before.deviceId})
  if(after.version!==before.version+1||instant(after.updatedAt)<instant(before.updatedAt)||unchanged.some(key=>after[key]!==before[key]))throw invalid()
  if(kind==='ack'){
   if(after.ackState!=='ACKNOWLEDGED'||after.conditionState!==before.conditionState||after.clearReason!==before.clearReason||after.clearedAt!==before.clearedAt||after.acknowledgedAt!==after.updatedAt)throw invalid()
  }else if(after.conditionState!=='CLEARED'||after.clearReason!=='MANUAL'||after.clearedAt!==after.updatedAt||after.ackState!==before.ackState||after.acknowledgedAt!==before.acknowledgedAt||after.acknowledgedBy!==before.acknowledgedBy)throw invalid()
  assertIdentity(epoch);signal?.throwIfAborted();return after
 }catch(error){assertIdentity(epoch);signal?.throwIfAborted();throw new ApiError('事故操作结果需要重新读取核对',200,undefined,undefined,true)}
}
export const alarmRuntimeInstanceApi={
 read:async(project:string,expected:AlarmRuntimeInstanceIdentity,signal?:AbortSignal)=>{
  const epoch=identityEpoch();signal?.throwIfAborted();const value=await api<Schema<'ConsoleAlarmRuntimeInstanceResponse'>>(path(project,expected.instanceId),{signal,maxResponseBytes:budget});assertIdentity(epoch);signal?.throwIfAborted()
  try{const result=alarmRuntimeInstanceResponse(value,expected);assertIdentity(epoch);signal?.throwIfAborted();return result}catch{assertIdentity(epoch);signal?.throwIfAborted();throw new ApiError('精确告警详情资料无法核对',200)}
 },
 acknowledge:(project:string,previous:AlarmRuntimeInstanceSnapshot,signal?:AbortSignal)=>action(project,previous,'ack',signal),
 clear:(project:string,previous:AlarmRuntimeInstanceSnapshot,signal?:AbortSignal,content?:AlarmRuntimeClearContent)=>action(project,previous,'clear',signal,content)
}
