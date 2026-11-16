import {api} from '../../core/http'
import type {paths,Schema} from '../../core/contracts'
import {alarmLogTriggerText} from './alarm-log-trigger-text'
import {formatTime} from '../../core/time'
import {alarmLogQuerySnapshot,alarmLogSnapshot,type AlarmLog} from './alarm-transition-log-api'
import type {AlarmLogExportDisplayRow} from './alarm-log-export-file'
export type AlarmLogExportQuery=NonNullable<paths['/api/v1/projects/{projectId}/console/alarm-log-export']['get']['parameters']['query']>
export type AlarmLogExportItem=Required<Omit<Schema<'ConsoleAlarmLogExportItemResponse'>,'log'>>&{log:AlarmLog}
export type AlarmLogExport=Required<Omit<Schema<'ConsoleAlarmLogExportResponse'>,'items'>>&{items:AlarmLogExportItem[]}
const validText=(value:unknown):value is string=>typeof value==='string'&&!/[\u0000]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)
/** 全响应核验，1001探针只体现在truncated；不把坏记录丢弃后报成成功导出。 */
export function alarmLogExportSnapshot(value:unknown):AlarmLogExport {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('导出资料不完整')
 const row=value as Record<string,unknown>
 if(row.limit!==1000||typeof row.truncated!=='boolean'||!Array.isArray(row.items)||row.items.length>1000||row.truncated&&row.items.length!==1000)throw new Error('导出记录范围不一致')
 let textBytes=0
 const items=row.items.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('导出记录不完整')
  const item=value as Record<string,unknown>,log=alarmLogSnapshot(item.log),name=item.deviceTypeName
  if(name!==null&&!validText(name))throw new Error('导出设备类型资料不完整')
  for(const text of [log.alarmType,log.ruleName,log.deviceName,name,log.maintenanceAlarmReason,log.maintenanceSolution,log.maintenanceRemark,...(log.triggerValues?.items.flatMap(item=>[item.key,item.dataType,item.valueJson,item.acceptedAt,item.timeBasis])??[])]){
   if(text===null)continue
   if(!validText(text))throw new Error('导出文本资料不完整')
   textBytes+=new TextEncoder().encode(text).byteLength
   if(textBytes>1024*1024)throw new Error('导出内容过多，请缩小筛选范围后重试')
  }
  return {log,deviceTypeName:name as string|null}
 })
 if(new Set(items.map(item=>item.log.id)).size!==items.length)throw new Error('导出事件身份重复')
 return {items,limit:1000,truncated:row.truncated}
}
export const alarmLogExportApi={async read(project:string,query:AlarmLogExportQuery={},signal?:AbortSignal):Promise<AlarmLogExport>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(project))throw new Error('导出项目身份无效')
 const {page:_page,limit:_limit,...filters}=alarmLogQuerySnapshot(query)
 return alarmLogExportSnapshot(await api<Schema<'ConsoleAlarmLogExportResponse'>>(`/api/v1/projects/${project}/console/alarm-log-export`,{query:filters,signal,maxResponseBytes:8*1024*1024}))
}}
/** 同一事件有界历史属性与旧标量分别展示；不补造单位、现名或当前事故值。 */
export function alarmLogExportDisplay(item:AlarmLogExportItem):AlarmLogExportDisplayRow {
 const log=item.log
 return {device_id:log.deviceId,device_name:log.deviceName??'',device_type_name:item.deviceTypeName??'',alarm_time:formatTime(log.createdAt),alarm_rule:log.ruleName??'',alarm_state:log.state==='ok'?'正常':log.state==='pending'?'待定':'告警',alarm_level:log.level===1?'普通告警':log.level===2?'重要告警':log.level===3?'紧急告警':'',alarm_attributes:alarmLogTriggerText(log,''),alarm_reason:log.maintenanceAlarmReason??'',solution:log.maintenanceSolution??'',remark:log.maintenanceRemark??''}
}
