import {api,IdentityChanged} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {exactRevisionCounter} from './preprocess-version-editor'
import {definitionUuid} from './device-task-definition-port'
import {readRawRuleJson} from './raw-rule-json'
import {ExactDecimal,parsePreprocessJson,writePreprocessJson,type ExactJson} from './preprocess-exact-json'
import {ruleTagsValue} from './rule-tag-draft'
import type {ActionDraft} from './RuleActionsEditor.vue'
import {externalAction,externalActionBody,confirmExternalAction,validateExternalActionView} from './rule-external-action-draft'
import {decodeDeviceSource,sourceContract,sameDeviceSource,type RuleDeviceSourceContract} from './rule-source-api'
import {sourceSelectionInput,type RuleSourceInput} from './rule-source-selection'
export type ActionKind='ATTRS_RPT'|'ATTRS_PUSH'|'EVENT_RPT'|'DATA_RPT'
export type ActionSource=RuleSourceInput
export type RuleContentDraft={name:string;description:string;source:ActionSource;kind:ActionKind;identifier:string;filterJson:string;actions:ActionDraft[];tags?:Readonly<Record<string,string>>}
export type RuleContentSnapshot={id:string;name:string;description:string;status:string;definitionVersion:string;versionId:string;versionNumber:string;source:RuleDeviceSourceContract;kind:ActionKind;identifier:string;filterJson:string;actions:ActionDraft[];activeVersionId?:Schema<'MessageRuleView'>['activeVersionId']|null}&Pick<Schema<'MessageRuleView'>,'createdAt'|'updatedAt'>
const kinds=['ATTRS_RPT','ATTRS_PUSH','EVENT_RPT','DATA_RPT']
const root=(project:string)=>`/api/v1/projects/${project}/message-rule-contents` as const
const bad=()=>new Error('规则内容回读不完整，请保留草稿并重新核对')
function long(value:string){if(!/^[1-9][0-9]{0,18}$/.test(value)||BigInt(value)>9223372036854775807n)throw bad();return value}
/** 对象字段顺序和jsonb十进制展开不影响相等，数组操作顺序仍逐项保留。 */
export function exactContentIdentity(value:ExactJson):string{if(value instanceof ExactDecimal)return '#'+value.canonical();if(Array.isArray(value))return '['+value.map(exactContentIdentity).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+exactContentIdentity(value[key]!)).join(',')+'}';return JSON.stringify(value)}
export function contentBody(draft:RuleContentDraft,before?:RuleContentSnapshot):string{
 if(!draft.name.trim()||draft.name.trim().length>128||draft.description.length>512||!['DEVICE','DEVICE_TYPE'].includes(draft.source.kind)||!kinds.includes(draft.kind)||!draft.actions.length||draft.actions.length>32)throw new Error('请补全规则名称、来源和操作')
 const actions=draft.actions.map(action=>{if(externalAction(action.nodeType))return externalActionBody(action);if(action.credential)throw new Error('当前操作不接受凭据');if(!action.nodeType||!action.config||Array.isArray(action.config))throw new Error('操作配置不完整');return '{"nodeType":'+JSON.stringify(action.nodeType)+',"config":'+writePreprocessJson(action.config,['current-device-properties-function','current-device-command-function','current-device-data-function','current-device-cloud-properties-function','current-device-report-data-function','device-report-properties-function','device-report-cloud-properties-function','device-report-command-function','device-report-data-function'].includes(action.nodeType))+'}'})
 const trigger:Partial<Record<keyof NonNullable<Schema<'MessageRuleContentRequest'>['trigger']>,string>>={kind:JSON.stringify(draft.kind)}
 if(draft.kind==='EVENT_RPT'||draft.kind==='DATA_RPT'){if(!draft.identifier.trim())throw new Error(draft.kind==='EVENT_RPT'?'请选择或填写事件标识符':'请选择或填写数据流标识符');trigger.identifier=JSON.stringify(draft.identifier.trim())}
 if(draft.kind==='ATTRS_RPT')trigger.filter=writePreprocessJson(parsePreprocessJson(draft.filterJson))
 const fields:Partial<Record<keyof Schema<'MessageRuleContentRequest'>,string>>={name:JSON.stringify(draft.name.trim()),description:JSON.stringify(draft.description.trim()),deviceSource:JSON.stringify(sourceContract(sourceSelectionInput(draft.source))),trigger:'{'+Object.entries(trigger).map(([key,value])=>JSON.stringify(key)+':'+value).join(',')+'}',actions:'['+actions.join(',')+']'}
 if(!before&&draft.tags!==undefined)fields.tags=JSON.stringify(ruleTagsValue(Object.entries(draft.tags).map(([key,value],index)=>({id:String(index),key,value}))))
 if(before){fields.expectedVersion=JSON.stringify(long(before.definitionVersion));fields.baseVersionId=JSON.stringify(before.versionId)}
 const body='{'+Object.entries(fields).map(([key,value])=>JSON.stringify(key)+':'+value).join(',')+'}'
 const contentOnly='{'+Object.entries(fields).filter(([key])=>key!=='tags').map(([key,value])=>JSON.stringify(key)+':'+value).join(',')+'}'
 if(new TextEncoder().encode(contentOnly).length>65536)throw new Error('规则操作总内容超过65536字节')
 return body
}
export function decodeRuleContent(bytes:Uint8Array):RuleContentSnapshot{
 const raw=readRawRuleJson(bytes),rule=raw.at(['rule']),source=raw.at(['deviceSource']),trigger=raw.at(['trigger']),actions=raw.at(['actions'])
 const id=rule.at(['id']).string(),versionId=raw.at(['versionId']).string(),kind=trigger.at(['kind']).string(),deviceSource=decodeDeviceSource(source)
 if(!definitionUuid(id)||!definitionUuid(versionId)||!kinds.includes(kind)||!['DEVICE','DEVICE_TYPE'].includes(String(deviceSource.kind))||actions.arrayLength()<1||actions.arrayLength()>32)throw bad()
 const values:ActionDraft[]=[]
 for(let i=0;i<actions.arrayLength();i++){const action=actions.at([i]),config=parsePreprocessJson(action.at(['config']).raw());if(!config||typeof config!=='object'||Array.isArray(config)||config instanceof ExactDecimal)throw bad();const item={id:crypto.randomUUID(),nodeType:action.at(['nodeType']).string(),config};if(externalAction(item.nodeType)){if(action.keys().some(key=>!['nodeType','config'].includes(key)))throw bad();validateExternalActionView(item);}values.push(item)}
 const active=rule.optional(['activeVersionId']);if(active&&active.kind!=='null'&&!definitionUuid(active.string()))throw bad()
 const activeVersionId=active?.kind==='null'?null:active?.string()
 const times:Pick<Schema<'MessageRuleView'>,'createdAt'|'updatedAt'>={}
 for(const key of ['createdAt','updatedAt'] as const){const value=rule.optional([key]);if(value?.kind==='string')times[key]=value.string()}
 return {...times,...(active?{activeVersionId}:{}),id,name:rule.at(['name']).string(),description:rule.optional(['description'])?.kind==='string'?rule.at(['description']).string():'',status:rule.at(['status']).string(),definitionVersion:long(rule.at(['version']).integerText()),versionId,versionNumber:long(raw.at(['versionNumber']).string()),source:deviceSource,kind:kind as ActionKind,identifier:trigger.optional(['identifier'])?.kind==='string'?trigger.at(['identifier']).string():'',filterJson:trigger.optional(['filter'])?.kind==='object'?trigger.at(['filter']).raw():'{"operator":"ALL","conditions":[],"groups":[]}',actions:values}
}
export async function readRuleContent(project:string,id:string,signal?:AbortSignal){return decodeRuleContent(await api<Uint8Array>(`${root(project)}/${id}`,{responseType:'bytes',maxResponseBytes:2*1024*1024,signal}))}
export const readMessageActionCatalog=(project:string,ruleType:ActionKind,signal?:AbortSignal)=>api<Schema<'MessageRuleContentActionCatalogView'>>(`/api/v1/projects/${project}/message-rule-content-actions`,{query:{ruleType},signal})
export async function writeRuleContent(project:string,body:string,before:RuleContentSnapshot|undefined,current:()=>boolean){
 if(!current())throw new IdentityChanged()
 const options={rawBody:body,headers:{'Content-Type':'application/json'},responseType:'bytes' as const,maxResponseBytes:2*1024*1024}
 const result=decodeRuleContent(before?await api<Uint8Array>(`${root(project)}/${before.id}`,{...options,method:'put'}):await api<Uint8Array>(root(project),{...options,method:'post'}))
 if(!current())throw new IdentityChanged()
 return result
}
function sameContentActions(wanted:ActionDraft[],actual:ActionDraft[]):boolean{
 if(wanted.length!==actual.length)return false
 return wanted.every((row,index)=>{const result=actual[index]!;if(externalAction(row.nodeType)){confirmExternalAction(row,result);return true}return row.nodeType===result.nodeType&&exactContentIdentity(row.config)===exactContentIdentity(result.config)})
}
export function confirmRuleContent(draft:RuleContentDraft,result:RuleContentSnapshot,before?:RuleContentSnapshot){
 if(result.name!==draft.name.trim()||result.description!==draft.description.trim()||!sameDeviceSource(result.source,sourceContract(sourceSelectionInput(draft.source)))||result.kind!==draft.kind||result.identifier!==draft.identifier.trim()||!sameContentActions(draft.actions,result.actions)||(draft.kind==='ATTRS_RPT'&&exactContentIdentity(parsePreprocessJson(result.filterJson))!==exactContentIdentity(parsePreprocessJson(draft.filterJson))))throw bad()
 if(before&&(result.id!==before.id||BigInt(result.definitionVersion)!==BigInt(before.definitionVersion)+1n||BigInt(result.versionNumber)!==BigInt(before.versionNumber)+1n||result.versionId===before.versionId||result.status!==before.status))throw bad()
}

/** First-save tags are read under the same definition CAS; never patched after creation. */
export async function readRuleContentTags(project:string,ruleId:string,definitionVersion:string,signal?:AbortSignal):Promise<Readonly<Record<string,string>>>{
 const raw=readRawRuleJson(await api<Uint8Array>(`/api/v1/projects/${project}/message-rules/${ruleId}/tags`,{query:{expectedDefinitionVersion:long(definitionVersion)},responseType:'bytes',maxResponseBytes:128*1024,signal}))
 type T=Schema<'MessageRuleTagsView'>
 if(raw.at(['ruleId' satisfies keyof T]).string()!==ruleId||raw.at(['version' satisfies keyof T]).integerText()!==definitionVersion)throw bad()
 const tags=raw.at(['tags' satisfies keyof T]);return Object.freeze(ruleTagsValue(tags.keys().map((key,index)=>({id:String(index),key,value:tags.at([key]).string()}))))
}
export function confirmRuleContentTags(expected:Readonly<Record<string,string>>,actual:Readonly<Record<string,string>>){if(Object.keys(expected).length!==Object.keys(actual).length||Object.keys(expected).some(key=>!Object.hasOwn(actual,key)||actual[key]!==expected[key]))throw bad()}

/** 状态原意图只持有低敏版本/来源锚点，不保留动作参数、URL或凭据。 */
export type RuleContentStateIntent=Readonly<{ruleId:string;definitionVersion:string;status:string;latestVersionId:string;latestVersionNumber:string;source:RuleDeviceSourceContract;activeVersionId:string|null;enabled:boolean;attemptId:string}>
export function makeRuleContentStateIntent(before:RuleContentSnapshot,enabled:boolean,attemptId:string):RuleContentStateIntent{return stateIntent(before,enabled,attemptId,false)}
/** 只为本次原ACTIVE动作保存的精确候选建立独立激活意图，不放宽普通状态开关或追随新版本。 */
export function makeRuleContentCandidateActivationIntent(before:RuleContentSnapshot,saved:RuleContentSnapshot,attemptId:string):RuleContentStateIntent{
 if(before.status!=='ACTIVE'||!definitionUuid(before.activeVersionId)||saved.status!=='ACTIVE'||saved.id!==before.id||saved.activeVersionId!==before.activeVersionId||saved.versionId===before.versionId||saved.versionId===saved.activeVersionId||BigInt(saved.definitionVersion)!==BigInt(before.definitionVersion)+1n||BigInt(saved.versionNumber)!==BigInt(before.versionNumber)+1n||!sameDeviceSource(saved.source,before.source))throw new Error('本次候选保存尚未完整确认，不能继续生效')
 return stateIntent(saved,true,attemptId,true)
}
function stateIntent(before:RuleContentSnapshot,enabled:boolean,attemptId:string,replacingActiveCandidate:boolean):RuleContentStateIntent{
 const version=exactRevisionCounter(before.definitionVersion);exactRevisionCounter(before.versionNumber)
 if(!definitionUuid(before.id)||!definitionUuid(before.versionId)||!definitionUuid(attemptId)||BigInt(version)>=9223372036854775807n||!['DRAFT','PAUSED','ACTIVE'].includes(before.status)||!replacingActiveCandidate&&enabled===(before.status==='ACTIVE'))throw new Error('当前规则状态或版本不能执行此操作，请重新读取')
 if(!enabled&&!definitionUuid(before.activeVersionId))throw new Error('活动版本读取不完整，请重新读取后暂停')
 const source=decodeDeviceSource(readRawRuleJson(new TextEncoder().encode(JSON.stringify(before.source))))
 return Object.freeze({ruleId:before.id,definitionVersion:version,status:before.status,latestVersionId:before.versionId,latestVersionNumber:before.versionNumber,source,activeVersionId:before.activeVersionId??null,enabled,attemptId})
}
/** 写前只核原快照，不能采用新CAS继续发送这次状态写。 */
export function ruleContentStateBaselineMatches(intent:RuleContentStateIntent,before:RuleContentSnapshot):boolean{
 return before.id===intent.ruleId&&before.definitionVersion===intent.definitionVersion&&before.status===intent.status&&(before.activeVersionId??null)===intent.activeVersionId&&before.versionId===intent.latestVersionId&&before.versionNumber===intent.latestVersionNumber&&sameDeviceSource(before.source,intent.source)
}
/** 仅确认当前有效结果，不把匹配的状态事实归因为原操作者或原请求已受理。 */
export function confirmRuleContentState(intent:RuleContentStateIntent,after:RuleContentSnapshot):RuleContentSnapshot{
 if(after.id!==intent.ruleId||BigInt(after.definitionVersion)!==BigInt(intent.definitionVersion)+1n||after.status!==(intent.enabled?'ACTIVE':'PAUSED')||after.activeVersionId!==(intent.enabled?intent.latestVersionId:intent.activeVersionId)||after.versionId!==intent.latestVersionId||after.versionNumber!==intent.latestVersionNumber||!sameDeviceSource(after.source,intent.source))throw new Error('当前规则尚未确认目标状态，保留原操作并只读核对')
 return after
}
/** 沿既有状态路由发送一次原CAS；正文返回也须绑定精确规则、状态与活动版本。 */
export async function submitRuleContentState(project:string,intent:RuleContentStateIntent,current:()=>boolean,signal?:AbortSignal):Promise<void>{
 if(!definitionUuid(project)||!definitionUuid(intent.ruleId)||!definitionUuid(intent.attemptId))throw bad()
 if(!current())throw new IdentityChanged()
 const root=`/api/v1/projects/${project}/message-rules/${intent.ruleId}` as const,path=intent.enabled?`${root}/versions/${intent.latestVersionId}/activate` as const:`${root}/pause` as const
 const bytes=await api<Uint8Array>(path,{method:'post',query:{expectedVersion:exactRevisionCounter(intent.definitionVersion)},headers:{'Idempotency-Key':intent.attemptId},signal,responseType:'bytes',maxResponseBytes:65536})
 if(!current())throw new IdentityChanged()
 const raw=readRawRuleJson(bytes),active=raw.optional(['activeVersionId'])
 if(raw.at(['id']).string()!==intent.ruleId||raw.at(['version']).integerText()!==(BigInt(intent.definitionVersion)+1n).toString()||raw.at(['status']).string()!==(intent.enabled?'ACTIVE':'PAUSED')||!active||active.kind!=='string'||active.string()!==(intent.enabled?intent.latestVersionId:intent.activeVersionId))throw new Error('规则状态回执不匹配，请只读核对当前结果')
}
