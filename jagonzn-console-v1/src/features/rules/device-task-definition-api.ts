import {api} from '@/core/http'
import type {paths,Schema} from '@/core/contracts'
import {taskScheduleTransport} from './task-schedule-transport'
import {cas,taskSelection} from './models'
import {getTask,getTaskJobCreationByKey,saveTask,setConsoleTaskDeviceSchedule} from './api'
import {definitionUuid,type DeviceTaskDefinitionPort,type DeviceTaskDefinitionFilters} from './device-task-definition-port'
function id(value:string){if(!definitionUuid(value))throw new Error('设备任务范围标识无效');return value.toLowerCase()}
function filters(value:DeviceTaskDefinitionFilters){
  if(!value||!['','DEVICE','DEVICE_TYPE'].includes(value.relation)||!['','ACTIVE','PAUSED'].includes(value.status)||!['','COMMAND','COMMAND_FUNCTION','PROPERTY_SET','PROPERTY_SET_FUNCTION','CLOUD_UPDATE','DATA_DOWNLINK','CLOUD_UPDATE_FUNCTION','DATA_DOWNLINK_FUNCTION'].includes(value.taskType))throw new Error('设备任务筛选无效')
  return value
}
/** 精确消费正式543查询与点读；写入复用既有双CAS和指定设备手动运行端口。 */
export const deviceTaskDefinitionApi:DeviceTaskDefinitionPort={
  read:async(project,device,value,cursor,signal)=>{
    const selected=filters(value)
    const query:NonNullable<paths['/api/v1/projects/{projectId}/devices/{deviceId}/task-jobs']['get']['parameters']['query']>={
      cursor,limit:24,relation:selected.relation||undefined,status:selected.status||undefined,taskType:selected.taskType||undefined
    }
    return api<Schema<'CursorPageDeviceTaskJobResponse'>>(`/api/v1/projects/${id(project)}/devices/${id(device)}/task-jobs`,{query,signal})
  },
  preference:async(project,job,device,definition,signal)=>{
    const query:NonNullable<paths['/api/v1/projects/{projectId}/task-jobs/{jobId}/device-schedules/{deviceId}']['get']['parameters']['query']>={expectedDefinitionVersion:cas(definition)}
    return api<Schema<'ConsoleTaskDeviceScheduleControl'>>(`/api/v1/projects/${id(project)}/task-jobs/${id(job)}/device-schedules/${id(device)}`,{query,signal})
  },
  change:async(project,job,device,definition,preference,allowed)=>setConsoleTaskDeviceSchedule(id(project),id(job),id(device),cas(definition),cas(preference),allowed),
  run:async(project,job,device,definition)=>{
    const body:Schema<'TaskDeviceRunRequest'>={expectedVersion:cas(definition)}
    await api<Schema<'TaskExecutionResponse'>>(`/api/v1/projects/${id(project)}/task-jobs/${id(job)}/device-runs/${id(device)}`,{method:'post',body})
  },
  create:async(project,device,body,originalKey)=>{
    if(body.targetType!=='EXPLICIT_DEVICES'||body.targetDeviceIds?.length!==1||body.targetDeviceIds[0]!==id(device)||body.enabled!==false||body.scheduleType!=='MANUAL'||body.initialSchedule!==undefined)throw new Error('设备任务创建范围无效')
    return saveTask(id(project),'',body,originalKey)
  },
  createTargets:async(project,body,originalKey)=>{
    if(!['EXPLICIT_DEVICES','DEVICE_TYPE','DEVICE_GROUPS'].includes(body.targetType)||typeof body.enabled!=='boolean'||(body.initialSchedule===undefined?body.scheduleType!=='MANUAL':!['MANUAL','ONCE','DAILY','INTERVAL','SOLAR'].includes(body.scheduleType)))throw new Error('任务创建目标或状态无效')
    const selection=taskSelection(body)
    return saveTask(id(project),'',{...body,targetGroupId:undefined,targetDeviceIds:undefined,targetDeviceTypeId:undefined,targetGroupIds:undefined,...selection},originalKey)
  },
  plan:async(project,job,signal)=>taskScheduleTransport.readPlan(id(project),id(job),signal),
  creation:async(project,originalKey,signal)=>getTaskJobCreationByKey(id(project),originalKey,signal),
  definition:async(project,job,signal)=>getTask(id(project),id(job),signal)
}
