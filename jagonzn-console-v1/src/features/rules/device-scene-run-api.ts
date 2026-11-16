import {api} from '@/core/http'
import type {paths,Schema} from '@/core/contracts'
import {cas} from './models'
import {definitionUuid} from './device-task-definition-port'
import type {DeviceSceneRunPort} from './device-scene-run-state'
function id(value:string){if(!definitionUuid(value))throw new Error('场景设备范围标识无效');return value.toLowerCase()}
function key(value:string){if(typeof value!=='string'||!value.trim()||value.length>128)throw new Error('场景执行标识无效');return value}
/** 正式559当前设备执行与精确原key GET；没有POST重放或历史猜测。 */
export const deviceSceneRunApi:DeviceSceneRunPort={
 run:async(project,scene,device,definition,requestKey)=>{
  const body:Schema<'ExecuteSceneRequest'>={deviceId:id(device),expectedVersion:cas(definition),payload:{}}
  return api<Schema<'RuleSceneExecutionView'>>(`/api/v1/projects/${id(project)}/scenes/${id(scene)}/executions`,{method:'post',headers:{'Idempotency-Key':key(requestKey)},body})
 },
 lookup:async(project,scene,requestKey,signal)=>{
  const query:NonNullable<paths['/api/v1/projects/{projectId}/scenes/{sceneId}/executions/by-key']['get']['parameters']['query']>={key:key(requestKey)}
  return api<Schema<'RuleSceneExecutionView'>>(`/api/v1/projects/${id(project)}/scenes/${id(scene)}/executions/by-key`,{query,signal})
 },
 definition:async(project,scene,signal)=>api<Schema<'RuleSceneView'>>(`/api/v1/projects/${id(project)}/scenes/${id(scene)}`,{signal})
}
