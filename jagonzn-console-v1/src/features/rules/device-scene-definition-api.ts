import {api} from '@/core/http'
import type {paths,Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
import type {DeviceSceneDefinitionPort} from './device-scene-definition-port'
import {deviceSceneRunApi} from './device-scene-run-api'
function id(value:string){if(!definitionUuid(value))throw new Error('设备场景范围标识无效');return value.toLowerCase()}
/** 名称/描述与状态均交正式设备范围GET先过滤再分页。 */
export const deviceSceneDefinitionApi:DeviceSceneDefinitionPort={
 ...deviceSceneRunApi,
 read:async(project,device,filters,cursor,signal)=>{
  if(!filters||!['','ACTIVE','PAUSED'].includes(filters.status)||typeof filters.name!=='string'||filters.name.length>128||cursor!=null&&(!cursor||cursor.length>8192))throw new Error('设备场景筛选或游标无效')
  const query:NonNullable<paths['/api/v1/projects/{projectId}/devices/{deviceId}/scenes']['get']['parameters']['query']>={status:filters.status||undefined,name:filters.name||undefined,cursor,limit:24}
  return api<Schema<'CursorPageSceneDeviceDefinition'>>(`/api/v1/projects/${id(project)}/devices/${id(device)}/scenes`,{query,signal})
 }
}
