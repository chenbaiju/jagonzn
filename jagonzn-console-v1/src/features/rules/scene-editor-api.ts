import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {cas} from './models'
import {getTask} from './api'
import {deviceTaskDefinitionApi} from './device-task-definition-api'
import {deviceTaskDefinitionPage} from './device-task-definition-port'
import {definitionUuid} from './device-task-definition-port'
import {ExactDecimal,parsePreprocessJson} from './preprocess-exact-json'
import {exactObject,sceneNodeList,sceneWriteText,sceneTags,sceneExecutionPolicy,type SceneBody} from './scene-editor-draft'
function projectPath(project:string){if(!definitionUuid(project))throw new Error('场景所属项目无效');return `/api/v1/projects/${project}/scenes` as const}
function path(project:string,scene:string){if(!definitionUuid(scene))throw new Error('场景标识无效');return `${projectPath(project)}/${scene}` as const}
export async function readScene(project:string,id:string,signal?:AbortSignal){const value=await api<Schema<'RuleSceneView'>>(path(project,id),{signal});if(value.id!==id||typeof value.name!=='string'||!['DRAFT','ACTIVE','PAUSED'].includes(value.status??''))throw new Error('场景身份或状态不完整');cas(value.version);sceneTags((value as {tags?:unknown}).tags);return value}
/** 完整版本配置采用已有精确解析器；旧未知动作的大整数不能被普通JSON读取改写。 */
export async function readSceneVersion(project:string,scene:string,version:string,signal?:AbortSignal):Promise<Schema<'RuleSceneVersionView'>>{
 if(!definitionUuid(version))throw new Error('场景版本标识无效')
 const raw=await api<string>(`${path(project,scene)}/versions/${version}`,{signal,responseType:'text',maxResponseBytes:2097152}),value=parsePreprocessJson(raw)
 if(!exactObject(value)||value.id!==version||!(value.versionNumber instanceof ExactDecimal)||!exactObject(value.deviceScope))throw new Error('场景完整版本无法读取')
 const versionNumber=Number(value.versionNumber.canonical());cas(versionNumber)
 if(typeof value.createdAt!=='string'||typeof value.createdBy!=='string'||!['LEGACY_PROJECT','DEVICE','DEVICE_TYPE'].includes(String(value.deviceScope.kind))||value.deviceScope.kind!=='LEGACY_PROJECT'&&!definitionUuid(String(value.deviceScope.referenceId)))throw new Error('场景版本身份不完整')
 const kind=value.deviceScope.kind as Schema<'SceneDeviceScope'>['kind'],referenceId=typeof value.deviceScope.referenceId==='string'?value.deviceScope.referenceId:null
 if(Object.keys(value.deviceScope).some(key=>!['kind','referenceId'].includes(key))||kind==='LEGACY_PROJECT'&&referenceId!==null)throw new Error('场景执行范围不完整')
 const executionPolicy=sceneExecutionPolicy(value.executionPolicy)
 return {executionPolicy:executionPolicy??null,id:version,versionNumber,createdAt:value.createdAt,createdBy:value.createdBy,conditions:sceneNodeList(value.conditions),actions:sceneNodeList(value.actions),deviceScope:{kind,referenceId}}
}
export async function readSceneLatest(project:string,scene:string,signal?:AbortSignal){
 const page=await api<Schema<'RuleManagementPageRuleSceneVersionView'>>(`${path(project,scene)}/version-history`,{query:{limit:1},signal})
 const id=page.items?.[0]?.id;if(!id||!definitionUuid(id))throw new Error('场景最新版本无法读取')
 return readSceneVersion(project,scene,id,signal)
}
export const createScene=(project:string,body:SceneBody)=>api<Schema<'RuleSceneView'>>(projectPath(project),{method:'post',rawBody:sceneWriteText(body),headers:{'Content-Type':'application/json'}})
export const reviseScene=(project:string,id:string,body:SceneBody,version:number,enabled?:Schema<'ReviseSceneRequest'>['enabled'])=>api<Schema<'RuleSceneView'>>(path(project,id),{method:'put',rawBody:sceneWriteText(body,version,enabled),headers:{'Content-Type':'application/json'}})
export const activateScene=(project:string,id:string,versionId:string,version:number)=>{if(!definitionUuid(versionId))throw new Error('场景版本标识无效');return api<Schema<'RuleSceneView'>>(`${path(project,id)}/versions/${versionId}/activate`,{method:'post',query:{expectedVersion:cas(version)}})}
export const pauseScene=(project:string,id:string,version:number)=>api<Schema<'RuleSceneView'>>(`${path(project,id)}/pause`,{method:'post',query:{expectedVersion:cas(version)}})
/** 创建无原键回执，只按精确名称发现当前状态，不声称原请求因果。 */
export async function findSceneByName(project:string,name:string,signal?:AbortSignal){
 const page=await api<Schema<'RuleManagementPageRuleSceneView'>>(projectPath(project),{query:{name,limit:100},signal}),matches=page.items?.filter(row=>row.name===name)??[]
 if(matches.length!==1||!matches[0]?.id)throw new Error(page.nextCursor?'当前候选未完整定位，请继续只读核对。':'原场景保存结果尚未确认；未再次创建。')
 return readScene(project,matches[0].id,signal)
}

/** 原设备目标裁决后的真实候选，不添加Source没有的启用状态筛选。 */
export async function readSceneDeviceTasks(project:string,device:string,cursor:string|undefined,signal:AbortSignal,usedCursors:readonly(string|undefined)[]=cursor?[cursor]:[]){
 projectPath(project);if(!definitionUuid(device))throw new Error('任务目标设备标识无效')
 const page=await deviceTaskDefinitionApi.read(project,device,{relation:'',status:'',taskType:''},cursor,signal)
 return deviceTaskDefinitionPage(page,usedCursors)
}
/** 仅读取原已选任务真实名称；失败交由页面保原标识，不推导设备参与资格。 */
export async function readSceneTaskName(project:string,task:string,signal?:AbortSignal){
 projectPath(project);if(!definitionUuid(task))throw new Error('原任务标识无效')
 const value=await getTask(project,task,signal)
 if(value.id!==task||typeof value.name!=='string'||!value.name.trim()||!['ACTIVE','PAUSED'].includes(value.status??''))throw new Error('原任务资料不完整')
 return {id:task,name:value.name,status:value.status!}
}
