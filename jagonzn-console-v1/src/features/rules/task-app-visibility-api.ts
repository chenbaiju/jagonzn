import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {cas} from './models'
export type TaskAppVisibility=Schema<'TaskAppVisibilityView'>
type VisibilityWrite=Schema<'TaskAppVisibilityWriteRequest'>
export const taskAppVisibilityKeys=['projectDeviceDetails','userSettings','userDetails'] as const
export type TaskAppVisibilityKey=typeof taskAppVisibilityKeys[number]
/** 独立投影必须返回真实三bool和同一任务CAS，缺字段不能显示为默认关闭。 */
function view(value:TaskAppVisibility,id:string):TaskAppVisibility{
 if(!value||value.taskId!==id||taskAppVisibilityKeys.some(key=>typeof value[key]!=='boolean'))throw new Error('应用可见性回读不完整，请重新读取。')
 return {taskId:id,version:cas(value.version),projectDeviceDetails:value.projectDeviceDetails,userSettings:value.userSettings,userDetails:value.userDetails}
}
export function createTaskAppVisibilityIntent(project:string,base:TaskAppVisibility,key:TaskAppVisibilityKey,value:boolean){
 const current=view(base,base.taskId)
 if(!project||!current.taskId||!taskAppVisibilityKeys.includes(key)||typeof value!=='boolean')throw new Error('应用可见性保存内容无效，请重新读取。')
 const before=cas(current.version),body:VisibilityWrite={expectedVersion:before,projectDeviceDetails:current.projectDeviceDetails,userSettings:current.userSettings,userDetails:current.userDetails,[key]:value}
 return Object.freeze({project,id:current.taskId,before,expectedVersion:before+(current[key]===value?0:1),body:Object.freeze(body)})
}
export type TaskAppVisibilityIntent=ReturnType<typeof createTaskAppVisibilityIntent>
export function confirmTaskAppVisibility(intent:TaskAppVisibilityIntent,observed:TaskAppVisibility){
 const current=view(observed,intent.id)
 if(current.version!==intent.expectedVersion||taskAppVisibilityKeys.some(key=>current[key]!==intent.body[key]))throw new Error('当前应用可见性尚未与原保存目标一致，请继续读取核对；未重复保存。')
 return current
}
export async function readTaskAppVisibility(project:string,id:string,signal?:AbortSignal){return view(await api<TaskAppVisibility>(`/api/v1/projects/${project}/task-jobs/${id}/app-visibility`,{signal}),id)}
export async function writeTaskAppVisibility(intent:TaskAppVisibilityIntent){return view(await api<TaskAppVisibility>(`/api/v1/projects/${intent.project}/task-jobs/${intent.id}/app-visibility`,{method:'put',body:intent.body}),intent.id)}
