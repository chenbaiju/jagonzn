import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
export type AutomationFilters={status:''|'ACTIVE'|'PAUSED';keyword:string;usage:''|'CONTEXT'|'CONDITION_INPUT'|'DEVICE_ACTION'}
export type DeviceAutomation=Required<Omit<Schema<'DeviceAutomationResponse'>,'description'|'status'|'triggerType'>>&{description:string|null;status:'ACTIVE'|'PAUSED';triggerType:NonNullable<Schema<'DeviceAutomationResponse'>['triggerType']>}
export type DeviceAutomationExecution=Schema<'DeviceAutomationExecutionResponse'>
export type AutomationPage<T>={items:T[];hasMore:boolean;nextCursor:string|null}
export type DeviceAutomationPort={
 definitions:(project:string,device:string,filters:AutomationFilters,cursor:string|undefined,limit:number,signal:AbortSignal)=>Promise<unknown>
 history:(project:string,device:string,cursor:string|undefined,limit:number,signal:AbortSignal)=>Promise<unknown>
}
export const blankAutomationFilters=():AutomationFilters=>({status:'',keyword:'',usage:''})
export function automationFilters(value:AutomationFilters):AutomationFilters{
 if(!value||!['','ACTIVE','PAUSED'].includes(value.status)||!['','CONTEXT','CONDITION_INPUT','DEVICE_ACTION'].includes(value.usage)||typeof value.keyword!=='string')throw new Error('自动化筛选无效')
 const keyword=value.keyword.trim();if(keyword.length>128||/[\u0000-\u001f\u007f-\u009f]/u.test(keyword))throw new Error('搜索内容最多128字符且不能包含控制字符')
 return {...value,keyword}
}
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('自动化返回不完整，请重新读取');return value as Record<string,unknown>}
const time=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))
const count=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0
const trigger=(value:unknown)=>typeof value==='string'&&['PROPERTY_REPORTED','PROPERTY_CHANGED','ONE_SHOT','CRON','MIXED'].includes(value)
function page<T>(value:unknown,cursors:readonly(string|undefined)[],limit:number,decode:(row:Record<string,unknown>)=>T):AutomationPage<T>{
 const body=object(value);if(!Array.isArray(body.items)||body.items.length>limit||typeof body.hasMore!=='boolean')throw new Error('自动化分页返回不完整')
 const ids=new Set<string>(),items=body.items.map(input=>{const row=object(input);if(!definitionUuid(row.id)||ids.has(row.id.toLowerCase()))throw new Error('自动化记录身份不完整或重复');ids.add(row.id.toLowerCase());return decode(row)})
 const next=body.nextCursor??null
 if(next!==null&&(typeof next!=='string'||!next||next.length>8192||cursors.includes(next))||body.hasMore!==!!next||body.hasMore&&!items.length)throw new Error('自动化分页没有形成推进，请刷新')
 return {items,hasMore:body.hasMore,nextCursor:next as string|null}
}
export function deviceAutomationPage(value:unknown,cursors:readonly(string|undefined)[],limit:number){
 return page(value,cursors,limit,row=>{
  if(typeof row.name!=='string'||!row.name.trim()||!['ACTIVE','PAUSED'].includes(String(row.status))||typeof row.status!=='string'||!definitionUuid(row.activeVersionId)||!count(row.versionNumber)||row.versionNumber===0||!trigger(row.triggerType)||typeof row.usesConditionInput!=='boolean'||typeof row.hasDeviceAction!=='boolean'||!time(row.createdAt)||row.description!==null&&typeof row.description!=='string')throw new Error('自动化定义或描述不完整，请重新读取')
  return row as DeviceAutomation
 })
}
export function deviceAutomationHistory(value:unknown,cursors:readonly(string|undefined)[],limit:number){
 return page(value,cursors,limit,row=>{
  if(!definitionUuid(row.automationId)||!definitionUuid(row.automationVersionId)||!trigger(row.triggerType)||typeof row.status!=='string'||!['QUEUED','RUNNING','RETRY_WAIT','DISPATCHED','SKIPPED','FAILED','REJECTED'].includes(row.status)||!count(row.attemptCount)||!count(row.deviceActionRecordCount)||!time(row.occurredAt)||!time(row.acceptedAt)||!time(row.createdAt)||row.completedAt!=null&&!time(row.completedAt)||row.reasonCode!=null&&typeof row.reasonCode!=='string')throw new Error('自动化执行记录不完整，请重新读取')
  return row as DeviceAutomationExecution
 })
}
