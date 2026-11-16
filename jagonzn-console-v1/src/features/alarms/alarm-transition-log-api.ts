import { api } from '../../core/http'
import type { paths, Schema } from '../../core/contracts'
import {alarmTriggerValuesDisplay} from './alarm-trigger-values-display'
import {alarmLogMaintenanceContent} from './alarm-log-maintenance-draft'
/** 唯一生成合同中的真实事件筛选；不借用事故当前状态或游标分页。 */
export type AlarmLogQuery=NonNullable<paths['/api/v1/projects/{projectId}/console/alarm-logs']['get']['parameters']['query']>
export type AlarmLog=Required<Schema<'ConsoleAlarmLogResponse'>>
type AlarmTriggerValues=NonNullable<AlarmLog['triggerValues']>
/** 先按同一严格显示协议核验，再复制冻结正式生成的wire，禁止保留原响应可变引用。 */
function alarmLogTriggerValuesSnapshot(value:unknown):AlarmTriggerValues|null {
 if(value===null)return null
 alarmTriggerValuesDisplay(value)
 const source=value as AlarmTriggerValues
 const result:AlarmTriggerValues={totalProperties:source.totalProperties,items:source.items.map(item=>Object.freeze({key:item.key,dataType:item.dataType,known:item.known,valueJson:item.valueJson,truncated:item.truncated,acceptedAt:item.acceptedAt,timeBasis:item.timeBasis})),truncated:source.truncated}
 Object.freeze(result.items)
 return Object.freeze(result)
}
export type AlarmLogNotification=Required<Schema<'ConsoleAlarmLogNotificationResponse'>>
export type AlarmLogPage=Required<Omit<Schema<'ConsoleAlarmLogPageResponse'>,'items'>>&{items:AlarmLog[]}
const statuses=['','alerting','alerting_1','alerting_2','alerting_3','pending','ok'] as const satisfies NonNullable<AlarmLogQuery['status']>[]
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('历史日志资料不完整');return value as Record<string,unknown>}
const id=(value:unknown):string=>{if(typeof value!=='string'||!uuid.test(value))throw new Error('历史日志身份不完整');return value}
const nullableText=(value:unknown):string|null=>{if(value!==null&&typeof value!=='string')throw new Error('历史日志可空资料缺失');return value as string|null}
const integer=(value:unknown,max:number):number=>{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>max)throw new Error('历史日志分页参数不合法');return value}
const publicFailures=['DEAD_LETTER','SUPPRESSED_POLICY','SKIPPED_AUTHORIZATION','SUPPRESSED_QUOTA','TEMPLATE_INVALID']
/** 通知仅接受公开五字段；结果未知保持null，原始供应商错误与目标不得进入展示资料。 */
export function alarmLogNotificationSnapshot(value:unknown):AlarmLogNotification {
 const row=object(value)
 if(Object.keys(row).sort().join(',')!=='channel,errorCode,id,result,target'||typeof row.channel!=='string'||!['EMAIL','WEBHOOK','PUSH'].includes(row.channel)||![true,false,null].includes(row.result as boolean|null)||row.target!==(row.channel==='EMAIL'?'***':''))throw new Error('告警通知资料不完整')
 if(row.result===false?typeof row.errorCode!=='string'||!publicFailures.includes(row.errorCode):row.errorCode!==null)throw new Error('告警通知失败分类无效')
 return {id:id(row.id),channel:row.channel as AlarmLogNotification['channel'],result:row.result as boolean|null,errorCode:row.errorCode as string|null,target:row.target as string}
}
/** 缺失值必须显式null；不补零、当前状态或当前时间，当前名称不变成事件名称快照。 */
export function alarmLogSnapshot(value:unknown,expectedId?:string):AlarmLog {
 const row=object(value),logId=id(row.id)
 if(expectedId!==undefined&&logId!==expectedId)throw new Error('历史日志事件身份不一致')
 if(typeof row.alarmType!=='string'||!row.alarmType||!['ok','pending','alerting'].includes(String(row.state))||row.level!==null&&![1,2,3].includes(row.level as number)||typeof row.createdAt!=='string'||!/(Z|[+-]\d{2}:?\d{2})$/i.test(row.createdAt)||!Number.isFinite(Date.parse(row.createdAt))||row.value!==null&&(typeof row.value!=='number'||!Number.isFinite(row.value)))throw new Error('历史日志事件资料不完整')
 const maintenanceAlarmReason=nullableText(row.maintenanceAlarmReason),maintenanceSolution=nullableText(row.maintenanceSolution),maintenanceRemark=nullableText(row.maintenanceRemark)
 if((maintenanceAlarmReason===null)!==(maintenanceSolution===null)||(maintenanceAlarmReason===null)!==(maintenanceRemark===null))throw new Error('历史日志维护资料不完整')
 if(maintenanceAlarmReason!==null&&maintenanceSolution!==null&&maintenanceRemark!==null)alarmLogMaintenanceContent({alarmReason:maintenanceAlarmReason,solution:maintenanceSolution,remark:maintenanceRemark})
 let notificationLogs:AlarmLogNotification[]|null=null,notificationLogsTruncated:boolean|null=null
 if(row.notificationLogs!==null){
  if(!Array.isArray(row.notificationLogs)||row.notificationLogs.length>100||typeof row.notificationLogsTruncated!=='boolean'||row.notificationLogsTruncated&&row.notificationLogs.length!==100)throw new Error('告警通知集合不完整')
  notificationLogs=row.notificationLogs.map(alarmLogNotificationSnapshot);notificationLogsTruncated=row.notificationLogsTruncated
  if(new Set(notificationLogs.map(item=>item.id)).size!==notificationLogs.length)throw new Error('告警通知身份重复')
 }else if(row.notificationLogsTruncated!==null)throw new Error('告警通知读取状态不一致')
 const triggerValues=alarmLogTriggerValuesSnapshot(row.triggerValues)
 if(triggerValues!==null&&row.value!==null)throw new Error('历史触发值来源不一致')
 return {id:logId,instanceId:id(row.instanceId),ruleId:id(row.ruleId),deviceId:id(row.deviceId),alarmType:row.alarmType,state:row.state as string,level:row.level as number|null,createdAt:row.createdAt,value:row.value as number|null,clearReason:nullableText(row.clearReason),ruleName:nullableText(row.ruleName),deviceName:nullableText(row.deviceName),maintenanceAlarmReason,maintenanceSolution,maintenanceRemark,notificationLogs,notificationLogsTruncated,triggerValues}
}
/** 计数必须为真实非负long字符串；页码、条数和事件ID去重按实际返回核验。 */
export function alarmLogPageSnapshot(value:unknown,page:number,limit:number):AlarmLogPage {
 const row=object(value)
 if(typeof row.total!=='string'||!/^(0|[1-9]\d{0,18})$/.test(row.total)||BigInt(row.total)>9223372036854775807n||row.page!==page||row.limit!==limit||!Array.isArray(row.items)||row.items.length>limit)throw new Error('历史日志分页资料不一致')
 const items=row.items.map(value=>alarmLogSnapshot(value))
 if(new Set(items.map(row=>row.id)).size!==items.length||BigInt(items.length)>BigInt(row.total)||BigInt(page-1)*BigInt(limit)>=BigInt(row.total)&&items.length)throw new Error('历史日志事件集合不一致')
 return {items,total:row.total,page,limit}
}
export function alarmLogQuerySnapshot(value:AlarmLogQuery):AlarmLogQuery&{page:number;limit:number} {
 const page=integer(value.page??1,2147483647),limit=integer(value.limit??24,100)
 if(value.status!==undefined&&!statuses.includes(value.status))throw new Error('历史日志状态筛选不合法')
 if(value.deviceId!==undefined)id(value.deviceId)
 if(value.ruleId!==undefined)id(value.ruleId)
 for(const time of [value.from,value.before])if(time!==undefined&&(typeof time!=='string'||!/(Z|[+-]\d{2}:?\d{2})$/i.test(time)||!Number.isFinite(Date.parse(time))))throw new Error('历史日志时间必须带明确时区')
 return {status:value.status,from:value.from,before:value.before,deviceId:value.deviceId,ruleId:value.ruleId,page,limit}
}
const base=(project:string)=>`/api/v1/projects/${encodeURIComponent(id(project))}/console/alarm-logs` as const
export const alarmTransitionLogApi={
 async page(project:string,query:AlarmLogQuery={},signal?:AbortSignal):Promise<AlarmLogPage>{
  const selected=alarmLogQuerySnapshot(query)
  return alarmLogPageSnapshot(await api<Schema<'ConsoleAlarmLogPageResponse'>>(base(project),{query:selected,signal}),selected.page,selected.limit)
 },
 async get(project:string,logId:string,signal?:AbortSignal):Promise<AlarmLog>{
  return alarmLogSnapshot(await api<Schema<'ConsoleAlarmLogResponse'>>(`${base(project)}/${encodeURIComponent(id(logId))}`,{signal}),logId)
 }
}
