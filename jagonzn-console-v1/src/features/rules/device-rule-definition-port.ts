import type {Schema} from '@/core/contracts'
import {cas} from './models'
import {ruleKinds,type RuleKind} from './rule-builder-draft'
import {deviceSourceMembers} from './rule-source-api'
import {definitionUuid} from './device-task-definition-port'
/** 正式552合同收窄后的组件视图；读取先验证必需事实，不消费项目候选。 */
export type DeviceRuleDefinition=Required<Omit<Schema<'RuleDeviceDefinition'>,'status'|'ruleType'>>&{status:'ACTIVE'|'PAUSED';ruleType:RuleKind|null}
export type DeviceRuleFilters={relation:''|'DEVICE'|'DEVICE_TYPE'|'LEGACY_PROJECT';status:''|'ACTIVE'|'PAUSED';ruleType:''|RuleKind}
export type RuleParticipation=Schema<'RuleDeviceParticipationControl'>
export type DeviceRulePage=Omit<Schema<'CursorPageRuleDeviceDefinition'>,'items'|'hasMore'>&{items:DeviceRuleDefinition[];hasMore:boolean}
export type DeviceRuleDefinitionPort={
 read:(project:string,device:string,filters:DeviceRuleFilters,cursor:string|undefined,signal:AbortSignal)=>Promise<Schema<'CursorPageRuleDeviceDefinition'>>
 preference:(project:string,rule:string,device:string,definition:number,signal:AbortSignal)=>Promise<Schema<'RuleDeviceParticipationControl'>>
 create?:(project:string,device:string,body:Schema<'MessageRuleWriteRequest'>)=>Promise<Schema<'MessageRuleView'>>
 definition?:(project:string,rule:string,signal:AbortSignal)=>Promise<Schema<'MessageRuleView'>>
 history?:(project:string,rule:string,signal:AbortSignal)=>Promise<Schema<'RuleManagementPageMessageRuleVersionView'>>
 change:(project:string,rule:string,device:string,definition:number,preference:number,allowed:boolean)=>Promise<Schema<'RuleDeviceParticipationControl'>>
}
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('设备规则返回不完整，请重新读取');return value as Record<string,unknown>}
export function deviceRulePage(value:unknown,device:string,cursors:readonly(string|undefined)[]):DeviceRulePage{
 const page=object(value)
 if(!Array.isArray(page.items)||page.items.length>24||typeof page.hasMore!=='boolean')throw new Error('设备规则页不完整，请重新读取')
 const seen=new Set<string>()
 const items=page.items.map(input=>{
  const row=object(input),source=object(row.deviceSource)
  if(!definitionUuid(row.id)||seen.has(row.id.toLowerCase())||typeof row.name!=='string'||!row.name.trim()||!['ACTIVE','PAUSED'].includes(String(row.status))||!definitionUuid(row.activeVersionId)||typeof row.hasDeviceAction!=='boolean'||typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt)))throw new Error('设备规则身份或版本不完整，请重新读取')
  const members=deviceSourceMembers(source as Schema<'RuleDeviceSource'>)
  if(source.kind==='DEVICE'&&!members.includes(device.toLowerCase()))throw new Error('设备规则来源与当前设备不匹配，请重新读取')
  if(row.ruleType!==null&&(typeof row.ruleType!=='string'||!ruleKinds.some(kind=>kind===row.ruleType)))throw new Error('设备规则类型未记录或不受支持，请重新读取')
  cas(row.definitionVersion as number);cas(row.versionNumber as number);seen.add(row.id.toLowerCase())
  return row as DeviceRuleDefinition
 })
 const next=page.nextCursor
 if(next!=null&&(typeof next!=='string'||!next||next.length>8192||cursors.includes(next))||page.hasMore!==!!next||page.hasMore&&!items.length)throw new Error('设备规则分页没有形成推进，请刷新')
 return {items,nextCursor:next as string|null|undefined,hasMore:page.hasMore}
}
export function ruleParticipation(value:unknown,device:string,definition:number):RuleParticipation{
 const result=object(value)
 if(result.deviceId!==device||typeof result.allowed!=='boolean'||result.definitionVersion!==definition)throw new Error('设备规则参与回执身份不匹配，请重新读取')
 cas(result.version as number);cas(result.definitionVersion as number)
 return result as RuleParticipation
}
