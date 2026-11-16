import {api,identityEpoch} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
import {cas} from './models'
import {readAutomation} from './automation-editor-api'
import {automationSignature,automationTagsValue} from './automation-editor-draft'
type Common=Readonly<{project:string;id:string;epoch:number;before:Schema<'AutomationView'>;expected:number}>
export type AutomationMetadataIntent=Common&({kind:'information';body:Schema<'WriteAutomationInformationRequest'>}|{kind:'tags';body:Schema<'AutomationTagsWriteRequest'>})
function path(project:string,id:string){if(!definitionUuid(project)||!definitionUuid(id))throw new Error('自动化元信息范围无效');return `/api/v1/projects/${project}/automations/${id}` as const}
/** 只快照父定义；动作/触发配置不进入元信息写入。 */
export function automationMetadataSnapshot(value:Schema<'AutomationView'>):Schema<'AutomationView'>{automationTagsValue(value.tags);return Object.freeze(JSON.parse(JSON.stringify(value)) as Schema<'AutomationView'>)}
export function automationInformationIntent(project:string,before:Schema<'AutomationView'>,body:Schema<'WriteAutomationInformationRequest'>):AutomationMetadataIntent{
 if(!before.id)throw new Error('自动化标识不完整');path(project,before.id);const version=cas(before.version);if(body.expectedVersion!==version)throw new Error('自动化已变化，请重新读取')
 const same=body.name===before.name&&(body.description??'')===(before.description??'')
 return Object.freeze({kind:'information',project,id:before.id,epoch:identityEpoch(),before:automationMetadataSnapshot(before),body:Object.freeze({...body}),expected:cas(version+(same?0:1))})
}
export function automationTagsIntent(project:string,before:Schema<'AutomationView'>,wanted:Readonly<Record<string,string>>):AutomationMetadataIntent{
 if(!before.id)throw new Error('自动化标识不完整');path(project,before.id);const version=cas(before.version),tags=automationTagsValue(wanted),same=automationSignature(tags)===automationSignature(automationTagsValue(before.tags))
 return Object.freeze({kind:'tags',project,id:before.id,epoch:identityEpoch(),before:automationMetadataSnapshot(before),body:Object.freeze({expectedVersion:version,tags}),expected:cas(version+(same?0:1))})
}
function metadata(value:Schema<'AutomationView'>,kind:AutomationMetadataIntent['kind']){const {version:_version,updatedAt:_updated,...rest}=value;if(kind==='information'){const {name:_name,description:_description,...other}=rest;return other}const {tags:_tags,...other}=rest;return other}
/** 全父GET/回执核原CAS及非目标字段，不将同内容冒充原请求因果。 */
export function assertAutomationMetadata(intent:AutomationMetadataIntent,value:Schema<'AutomationView'>){
 const tags=automationTagsValue(value.tags)
 if(value.id!==intent.id||cas(value.version)!==intent.expected||automationSignature(metadata(value,intent.kind))!==automationSignature(metadata(intent.before,intent.kind))||intent.kind==='information'&&(value.name!==intent.body.name||(value.description??'')!==(intent.body.description??''))||intent.kind==='tags'&&automationSignature(tags)!==automationSignature(intent.body.tags))throw new Error('当前自动化与原元信息保存意图尚未一致；未重复提交。')
 return value
}
export async function writeAutomationMetadata(intent:AutomationMetadataIntent){const value=await api<Schema<'AutomationView'>>(`${path(intent.project,intent.id)}/${intent.kind==='information'?'information':'tags'}`,{method:'put',body:intent.body});return assertAutomationMetadata(intent,value)}
export async function readAutomationMetadata(intent:AutomationMetadataIntent){return assertAutomationMetadata(intent,await readAutomation(intent.project,intent.id))}
/** 复用既有删除入口；未知结果由父GET观察，不重DELETE。 */
export const deleteAutomation=(project:string,id:string,version:number)=>api<void>(path(project,id),{method:'delete',query:{expectedVersion:cas(version)}})
