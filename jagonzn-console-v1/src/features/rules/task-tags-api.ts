import {api} from '@/core/http'
import type {paths,Schema} from '@/core/contracts'
import {cas,taskEditor,type Task} from './models'
import {ruleTagsValue,type RuleTagDraft} from './rule-tag-draft'

type TagsView=Schema<'TaskTagsView'>
type TagsWrite=NonNullable<paths['/api/v1/projects/{projectId}/task-jobs/{jobId}/tags']['put']['requestBody']>['content']['application/json']

/** 标签行和预算沿现有领域叶；任务不复制规则写入或幂等协议。 */
export function taskTagsDraft(rows:readonly RuleTagDraft[]):Record<string,string>{
 if(rows.length>32)throw new Error('任务标签最多32项')
 return ruleTagsValue(rows)
}
export function taskTagsValue(value:unknown):Record<string,string>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('任务标签回读不完整，请重新读取。')
 return taskTagsDraft(Object.entries(value).map(([key,text])=>{
  if(typeof text!=='string')throw new Error('任务标签值必须是文本，请重新读取。')
  return {id:key,key,value:text}
 }))
}
function sameTags(left:Record<string,string>,right:Record<string,string>){return Object.keys(left).length===Object.keys(right).length&&Object.keys(left).every(key=>Object.hasOwn(right,key)&&left[key]===right[key])}
function stable(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']'
 if(value&&typeof value==='object')return '{'+Object.keys(value).filter(key=>(value as Record<string,unknown>)[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+stable((value as Record<string,unknown>)[key])).join(',')+'}'
 return JSON.stringify(value)
}
function definition(task:Task){return stable({...taskEditor(task),expectedVersion:undefined})}
export function createTaskTagsIntent(project:string,task:Task,wanted:unknown){
 if(!task.id)throw new Error('任务标签身份不完整，请重新读取。')
 const previous=taskTagsValue(task.tags),tags=taskTagsValue(wanted),beforeVersion=cas(task.version)
 return {project,id:task.id,beforeVersion,previous,tags,expectedVersion:beforeVersion+(sameTags(previous,tags)?0:1),definition:definition(task)}
}
export type TaskTagsIntent=ReturnType<typeof createTaskTagsIntent>
function view(value:TagsView,id:string):TagsView{
 if(!value||value.jobId!==id)throw new Error('任务标签回读身份不一致，请继续核对。')
 return {jobId:id,version:cas(value.version),tags:taskTagsValue(value.tags)}
}
export function confirmTaskTags(intent:TaskTagsIntent,value:TagsView){
 const current=view(value,intent.id)
 if(current.version!==intent.expectedVersion||!sameTags(current.tags,intent.tags))throw new Error('当前任务标签尚未与本次期望一致，请继续核对；未重复提交。')
}
/** 完整任务只读核对保留动作、计划、来源和状态，不把标签更新当内容或计划更新。 */
export function confirmTaskTagsDefinition(intent:TaskTagsIntent,task:Task){
 confirmTaskTags(intent,{jobId:task.id||'',version:cas(task.version),tags:taskTagsValue(task.tags)})
 if(definition(task)!==intent.definition)throw new Error('当前任务定义已变化，请继续核对；未重复提交。')
}
export async function readTaskTags(project:string,id:string,signal?:AbortSignal){return view(await api<TagsView>(`/api/v1/projects/${project}/task-jobs/${id}/tags`,{signal}),id)}
export async function writeTaskTags(intent:TaskTagsIntent){
 const body:TagsWrite={expectedVersion:cas(intent.beforeVersion),tags:intent.tags}
 return view(await api<TagsView>(`/api/v1/projects/${intent.project}/task-jobs/${intent.id}/tags`,{method:'put',body}),intent.id)
}
