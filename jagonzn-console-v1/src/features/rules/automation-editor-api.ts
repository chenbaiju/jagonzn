import {automationMixedConfig,automationTimezone} from './automation-mixed-triggers'
import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {cas} from './models'
import {definitionUuid} from './device-task-definition-port'
import {ExactDecimal,parsePreprocessJson} from './preprocess-exact-json'
import {automationObject,automationReportTriggers,automationTagsValue,automationNodes,automationWriteText,cloneAutomationValue,type AutomationBody,type AutomationVersion,type AutomationTriggerConfig} from './automation-editor-draft'
function base(project:string){if(!definitionUuid(project))throw new Error('自动化所属项目无效');return `/api/v1/projects/${project}/automations` as const}
function path(project:string,id:string){if(!definitionUuid(id))throw new Error('自动化标识无效');return `${base(project)}/${id}` as const}
export async function readAutomation(project:string,id:string,signal?:AbortSignal){const value=await api<Schema<'AutomationView'>>(path(project,id),{signal});if(value.id!==id||typeof value.name!=='string'||!['DRAFT','ACTIVE','PAUSED'].includes(value.status??''))throw new Error('自动化身份或状态不完整');cas(value.version);automationTagsValue(value.tags);return value}
/** 属性谓词、旧触发payload和未知节点使用精确树；不经普通JSON浮点解析。 */
export async function readAutomationVersion(project:string,id:string,versionId:string,signal?:AbortSignal):Promise<AutomationVersion>{
 if(!definitionUuid(versionId))throw new Error('自动化版本标识无效')
 const raw=await api<string>(`${path(project,id)}/versions/${versionId}`,{signal,responseType:'text',maxResponseBytes:2097152}),value=parsePreprocessJson(raw,32768)
 if(!automationObject(value)||value.id!==versionId||!(value.versionNumber instanceof ExactDecimal)||!['PROPERTY_REPORTED','PROPERTY_CHANGED','ONE_SHOT','CRON','MIXED'].includes(String(value.triggerType))||!automationObject(value.triggerConfig)||typeof value.createdAt!=='string'||typeof value.createdBy!=='string')throw new Error('自动化完整版本无法读取')
 if(value.triggerType==='PROPERTY_CHANGED'&&!automationReportTriggers(value.triggerType,value.triggerConfig))throw new Error('自动化属性变化来源配置无法读取')
 if(value.triggerType==='MIXED'&&(!automationMixedConfig(value.triggerType,value.triggerConfig)||!automationTimezone(value.resolvedTimezone))||value.triggerType!=='MIXED'&&Object.hasOwn(value,'resolvedTimezone'))throw new Error('自动化触发时区或配置无法读取')
 const versionNumber=Number(value.versionNumber.canonical());cas(versionNumber)
 return {id:versionId,versionNumber,triggerType:value.triggerType as AutomationVersion['triggerType'],triggerConfig:cloneAutomationValue(value.triggerConfig) as AutomationTriggerConfig,conditions:automationNodes(value.conditions),actions:automationNodes(value.actions),createdAt:value.createdAt,createdBy:value.createdBy,...(value.triggerType==='MIXED'?{resolvedTimezone:value.resolvedTimezone as string}:{})}
}
export async function readAutomationLatest(project:string,id:string,signal?:AbortSignal){const page=await api<Schema<'RuleManagementPageAutomationVersionView'>>(`${path(project,id)}/version-history`,{query:{limit:1},signal}),latest=page.items?.[0]?.id;if(!definitionUuid(latest))throw new Error('自动化最新版本无法读取');return readAutomationVersion(project,id,latest,signal)}
export const createAutomation=(project:string,body:AutomationBody)=>api<Schema<'AutomationView'>>(base(project),{method:'post',rawBody:automationWriteText(body),headers:{'Content-Type':'application/json'}})
export const reviseAutomation=(project:string,id:string,body:AutomationBody,version:number,enabled?:Schema<'ReviseAutomationRequest'>['enabled'])=>api<Schema<'AutomationView'>>(path(project,id),{method:'put',rawBody:automationWriteText(body,version,enabled),headers:{'Content-Type':'application/json'}})
export const activateAutomation=(project:string,id:string,versionId:string,version:number)=>{if(!definitionUuid(versionId))throw new Error('自动化版本标识无效');return api<Schema<'AutomationView'>>(`${path(project,id)}/versions/${versionId}/activate`,{method:'post',query:{expectedVersion:cas(version)}})}
export const pauseAutomation=(project:string,id:string,version:number)=>api<Schema<'AutomationView'>>(`${path(project,id)}/pause`,{method:'post',query:{expectedVersion:cas(version)}})
/** 创建结果未知时仅发现唯一名称候选并核完整内容，不宣称原请求因果或重发创建。 */
export async function findAutomationByName(project:string,name:string){const page=await api<Schema<'RuleManagementPageAutomationView'>>(base(project),{query:{name,limit:100}});if(page.nextCursor)throw new Error('当前候选未完整定位，请继续只读核对。');const matches=page.items?.filter(row=>row.name===name)??[];if(matches.length!==1||!matches[0]?.id)throw new Error('原自动化保存结果尚未确认；未再次创建。');return readAutomation(project,matches[0].id)}
