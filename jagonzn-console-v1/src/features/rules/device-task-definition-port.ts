import type {Schema} from '@/core/contracts'
import {cas,taskActionType,type TaskActionType} from './models'
import type {ScheduleProjection} from './task-schedule-state'

export type DeviceTaskDefinitionFilters={relation:''|'DEVICE'|'DEVICE_TYPE';status:''|'ACTIVE'|'PAUSED';taskType:''|TaskActionType}
export type DeviceTaskDefinition=Schema<'DeviceTaskJobResponse'>
/** 设备专用组件端口；所有正文类型仍取唯一生成合同，不向父页暴露项目全集。 */
export type DeviceTaskDefinitionPort={
  read:(project:string,device:string,filters:DeviceTaskDefinitionFilters,cursor:string|undefined,signal:AbortSignal)=>Promise<Schema<'CursorPageDeviceTaskJobResponse'>>
  preference:(project:string,job:string,device:string,definition:number,signal:AbortSignal)=>Promise<Schema<'ConsoleTaskDeviceScheduleControl'>>
  change:(project:string,job:string,device:string,definition:number,preference:number,allowed:boolean)=>Promise<Schema<'ConsoleTaskDeviceScheduleControl'>>
  run:(project:string,job:string,device:string,definition:number)=>Promise<void>
  create?:(project:string,device:string,body:Schema<'SaveTaskJobRequest'>,originalKey?:string)=>Promise<Schema<'TaskJobResponse'>>
  /** 新建页可复用成熟三类目标；旧设备单步create仍保留原设备限制。 */
  createTargets?:(project:string,body:Schema<'SaveTaskJobRequest'>,originalKey?:string)=>Promise<Schema<'TaskJobResponse'>>
  /** 创建保存原意图后点读完整typed计划；不从task概要猜配置。 */
  plan?:(project:string,job:string,signal:AbortSignal)=>Promise<ScheduleProjection>
  definition?:(project:string,job:string,signal:AbortSignal)=>Promise<Schema<'TaskJobResponse'>>
  /** 原键领域读端口；HTTP适配器精确消费正式582，组件仍封闭核对原件。 */
  creation?:(project:string,originalKey:string,signal:AbortSignal)=>Promise<unknown>
}
export const definitionUuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
export function deviceTaskDefinitionPage(value:Schema<'CursorPageDeviceTaskJobResponse'>,usedCursors:readonly(string|undefined)[]){
  if(!value||!Array.isArray(value.items)||value.items.length>24||typeof value.hasMore!=='boolean')throw new Error('设备任务页不完整，请重新读取')
  const seen=new Set<string>()
  const items=value.items.map(row=>{
    if(!row||!definitionUuid(row.id)||seen.has(row.id.toLowerCase())||typeof row.name!=='string'||!row.name.trim()||!['ACTIVE','PAUSED'].includes(row.status)
      ||!['ALL_DEVICES','DEVICE_GROUP','DEVICE_GROUPS','DEVICE_TYPE','EXPLICIT_DEVICES'].includes(row.targetType)
      ||typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt)))throw new Error('设备任务身份或定义不完整，请重新读取')
    const actionType=taskActionType(row)
    cas(row.version);seen.add(row.id.toLowerCase())
    return {...row,actionType}
  })
  const cursor=value.nextCursor
  if(cursor!=null&&(typeof cursor!=='string'||!cursor||cursor.length>8192||usedCursors.includes(cursor))||value.hasMore!==!!cursor||value.hasMore&&!value.items.length)throw new Error('设备任务分页没有形成推进，请刷新')
  return {...value,items,hasMore:value.hasMore}
}
