import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {cas} from './models'
import {definitionUuid} from './device-task-definition-port'
import {newRuleTag,ruleTagsValue} from './rule-tag-draft'
import {sceneSignature} from './scene-editor-draft'

/** 仅标签展示/意图模型；网络请求与回执始终派生唯一正式契约。 */
export function sceneTagsValue(value:unknown):Readonly<Record<string,string>>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error('场景标签读取不完整，请重新读取')
 const rows=Object.entries(value).map(([key,text])=>{
  if(typeof text!=='string')throw new Error('场景标签值必须是文本')
  return {...newRuleTag(),key,value:text}
 })
 return Object.freeze(ruleTagsValue(rows))
}
function path(project:string,id:string){if(!definitionUuid(project)||!definitionUuid(id))throw new Error('场景标签范围无效');return `/api/v1/projects/${project}/scenes/${id}/tags` as const}
export type SceneTagsIntent=Readonly<{project:string;id:string;before:Schema<'RuleSceneView'>;body:Schema<'SceneTagsWriteRequest'>;expected:number}>
export function createSceneTagsIntent(project:string,before:Schema<'RuleSceneView'>,wanted:Readonly<Record<string,string>>):SceneTagsIntent{
 if(!before.id)throw new Error('场景标识不完整');path(project,before.id)
 const original=sceneTagsValue(before.tags),tags=sceneTagsValue(wanted),version=cas(before.version)
 return Object.freeze({project,id:before.id,before:JSON.parse(JSON.stringify(before)),body:Object.freeze({expectedVersion:version,tags}),expected:cas(version+(sceneSignature(original)===sceneSignature(tags)?0:1))})
}
function decode(value:Schema<'SceneTagsView'>,intent:SceneTagsIntent){
 if(!value||value.sceneId!==intent.id||cas(value.version)!==intent.expected||sceneSignature(sceneTagsValue(value.tags))!==sceneSignature(intent.body.tags))throw new Error('场景标签与原保存意图尚未一致；未重复提交')
 return value
}
export async function readSceneTags(intent:SceneTagsIntent){return decode(await api<Schema<'SceneTagsView'>>(path(intent.project,intent.id)),intent)}
export async function writeSceneTags(intent:SceneTagsIntent){return decode(await api<Schema<'SceneTagsView'>>(path(intent.project,intent.id),{method:'put',body:intent.body}),intent)}
/** 只确认当前精确状态，不将相同内容冒充原请求的因果回执。 */
export function confirmSceneTagsDefinition(intent:SceneTagsIntent,value:Schema<'RuleSceneView'>){
 const metadata=(row:Schema<'RuleSceneView'>)=>{const {tags:_tags,version:_version,updatedAt:_updated,...rest}=row;return rest}
 if(value.id!==intent.id||cas(value.version)!==intent.expected||sceneSignature(sceneTagsValue(value.tags))!==sceneSignature(intent.body.tags)||sceneSignature(metadata(value))!==sceneSignature(metadata(intent.before)))throw new Error('完整场景与原标签意图尚未一致；未重复提交')
}
