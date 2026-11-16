import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'

/** 创建来源决定导航及初始目标，不进入原创建摘要。 */
export type TaskCreationSource=Readonly<{kind:'PROJECT'|'DEVICE'|'DEVICE_TYPE'|'DEVICE_GROUP';id:string;name?:string}>
export function taskCreationSource(source:TaskCreationSource|undefined,deviceId?:string,deviceName?:string):TaskCreationSource|undefined{
 if(source){if(deviceId||!['PROJECT','DEVICE','DEVICE_TYPE','DEVICE_GROUP'].includes(source.kind)||!definitionUuid(source.id))return;return {kind:source.kind,id:source.id,...(source.name?{name:source.name}:{})}}
 if(definitionUuid(deviceId))return {kind:'DEVICE',id:deviceId,...(deviceName?{name:deviceName}:{})}
}
export function taskCreationRouteSource(query:Record<string,unknown>,project?:string):TaskCreationSource|undefined{
 if(query.source==='device-group'&&query.deviceId===undefined&&query.deviceTypeId===undefined&&definitionUuid(query.deviceGroupId))return {kind:'DEVICE_GROUP',id:query.deviceGroupId.toLowerCase()}
 if(query.deviceGroupId!==undefined)return
 if(query.source===undefined&&query.deviceId===undefined&&query.deviceTypeId===undefined&&definitionUuid(project))return {kind:'PROJECT',id:project}
 if(query.source==='device'&&query.deviceTypeId===undefined&&definitionUuid(query.deviceId))return {kind:'DEVICE',id:query.deviceId}
 if(query.source==='device-type'&&query.deviceId===undefined&&definitionUuid(query.deviceTypeId))return {kind:'DEVICE_TYPE',id:query.deviceTypeId}
}
export function taskCreationSourceKey(source:TaskCreationSource|undefined){return source?source.kind+':'+source.id.toLowerCase():''}
export function taskCreationSourcePath(source:TaskCreationSource){
 if(source.kind==='PROJECT')return '/tasks/jobs'
 const path={DEVICE:'devices',DEVICE_TYPE:'device-types',DEVICE_GROUP:'device-groups'}[source.kind]
 return `/${path}/${source.id}?tab=tasks`
}
/** 以保存的目标确认关联，兼容旧单组目标和多组目标。 */
export function taskTargetsCreationSource(task:Schema<'TaskJobResponse'>,source:TaskCreationSource):boolean{
 if(source.kind==='PROJECT')return false
 if(source.kind==='DEVICE_GROUP'){
  const id=source.id.toLowerCase()
  return task.targetType==='DEVICE_GROUP'&&task.targetGroupId?.toLowerCase()===id||
   task.targetType==='DEVICE_GROUPS'&&!!task.targetGroupIds?.some(groupId=>groupId.toLowerCase()===id)
 }
 return source.kind==='DEVICE_TYPE'?task.targetType==='DEVICE_TYPE'&&task.targetDeviceTypeId?.toLowerCase()===source.id.toLowerCase():task.targetType==='EXPLICIT_DEVICES'&&!!task.targetDeviceIds?.some(id=>id.toLowerCase()===source.id.toLowerCase())
}
