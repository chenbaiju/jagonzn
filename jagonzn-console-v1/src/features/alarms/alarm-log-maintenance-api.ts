import {api,ApiError} from '../../core/http'
import type {Schema} from '../../core/contracts'
import {alarmLogMaintenanceContent as content,validMaintenanceText as validText,type AlarmLogMaintenanceDraft} from './alarm-log-maintenance-draft'
export type AlarmLogMaintenanceSnapshot=Schema<'ConsoleAlarmLogMaintenanceResponse'>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const time=(value:unknown):value is string=>typeof value==='string'&&/(Z|[+-]\d{2}:?\d{2})$/i.test(value)&&Number.isFinite(Date.parse(value))
/** 未保存与账号已硬删除是不同事实；正版本允许署名null但必须保留真实时钟。 */
export function alarmLogMaintenanceSnapshot(value:unknown,eventId:string):AlarmLogMaintenanceSnapshot {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('维护信息资料不完整')
 const row=value as Record<string,unknown>
 if(!uuid.test(eventId)||row.eventId!==eventId||!Number.isInteger(row.version)||Number(row.version)<0||Number(row.version)>2147483647||!validText(row.alarmReason)||!validText(row.solution)||!validText(row.remark)||row.updatedBy!==null&&(typeof row.updatedBy!=='string'||!uuid.test(row.updatedBy)))throw new Error('维护信息身份或内容不完整')
 const fields=content({alarmReason:row.alarmReason,solution:row.solution,remark:row.remark})
 if(row.version===0){if(Object.values(fields).some(Boolean)||row.updatedBy!==null||row.createdAt!==null||row.updatedAt!==null)throw new Error('未保存维护信息不能带伪造审计资料')}
 else if(!time(row.createdAt)||!time(row.updatedAt)||Date.parse(row.updatedAt)<Date.parse(row.createdAt))throw new Error('已保存维护信息时钟不完整')
 return {eventId,...fields,version:row.version as number,updatedBy:row.updatedBy as string|null,createdAt:row.createdAt as string|null,updatedAt:row.updatedAt as string|null}
}
export function alarmLogMaintenanceRequest(value:AlarmLogMaintenanceDraft):Schema<'SaveAlarmLogMaintenanceRequest'> {
 if(!Number.isInteger(value.version)||value.version<0||value.version>=2147483647)throw new Error('维护版本不可写，请重新读取核对')
 return {version:value.version,...content(value)}
}
/** 写后核对允许原作者账号硬删只断开署名，不能因此丢掉版本、时间或内容。 */
export function sameMaintenanceSaved(left:AlarmLogMaintenanceSnapshot,right:AlarmLogMaintenanceSnapshot){return left.eventId===right.eventId&&left.version===right.version&&left.alarmReason===right.alarmReason&&left.solution===right.solution&&left.remark===right.remark&&left.createdAt===right.createdAt&&left.updatedAt===right.updatedAt&&(left.updatedBy===right.updatedBy||left.updatedBy!==null&&right.updatedBy===null)}
const id=(value:string)=>{if(!uuid.test(value))throw new Error('请先选择有效项目和日志');return encodeURIComponent(value)}
const path=(project:string,event:string)=>`/api/v1/projects/${id(project)}/console/alarm-logs/${id(event)}/maintenance` as const
export const alarmLogMaintenanceApi={
 read:async(project:string,event:string,signal?:AbortSignal)=>alarmLogMaintenanceSnapshot(await api<AlarmLogMaintenanceSnapshot>(path(project,event),{signal}),event),
 save:async(project:string,event:string,body:Schema<'SaveAlarmLogMaintenanceRequest'>)=>{
  const submitted=alarmLogMaintenanceRequest(body)
  const result=await api<AlarmLogMaintenanceSnapshot>(path(project,event),{method:'put',body:submitted})
  try{const saved=alarmLogMaintenanceSnapshot(result,event);if(saved.version!==submitted.version+1||saved.alarmReason!==submitted.alarmReason||saved.solution!==submitted.solution||saved.remark!==submitted.remark)throw new Error();return saved}catch{throw new ApiError('维护保存结果需要重新读取核对',0,undefined,undefined,true)}
 }
}
