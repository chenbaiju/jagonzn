import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {deviceSourceMembers} from '../rules/rule-source-api'
import {ruleKinds,type RuleKind} from '../rules/rule-builder-draft'
import {deviceRulePage,type DeviceRuleDefinition,type DeviceRulePage} from '../rules/device-rule-definition-port'
import {definitionUuid,deviceTaskDefinitionPage} from '../rules/device-task-definition-port'
import {getVersion} from '../rules/api'
export type TypeRuleFilters=Readonly<{status:''|'ACTIVE'|'PAUSED';ruleType:''|RuleKind}>
export type TypeRulePage=DeviceRulePage
export type TypeTaskPage=ReturnType<typeof deviceTaskDefinitionPage>
export type TypeAlarmPage=Readonly<Required<Omit<Schema<'DeviceTypeAlarmRulePageResponse'>,'items'>>&{items:readonly Readonly<Required<Schema<'DeviceTypeAlarmRuleItem'>>>[]}>
export type TypeAssociationsTransport={rules:(project:string,type:string,filters:TypeRuleFilters,cursors:readonly(string|undefined)[],signal:AbortSignal)=>Promise<TypeRulePage>;ruleActions?:(project:string,type:string,row:DeviceRuleDefinition,signal:AbortSignal)=>Promise<string[]>;tasks:(project:string,type:string,status:''|'ACTIVE'|'PAUSED',cursors:readonly(string|undefined)[],signal:AbortSignal)=>Promise<TypeTaskPage>;alarms:(project:string,type:string,page:number,signal:AbortSignal)=>Promise<TypeAlarmPage>}
function invalid(message='类型关联来源或分页资料不完整'):never{throw new Error(message)}
function identity(value:string){if(!definitionUuid(value))invalid('设备类型关联范围不合法');return value.toLowerCase()}
function path(project:string,type:string){return `/api/v1/projects/${identity(project)}/device-types/${identity(type)}` as const}
function cursor(value:readonly(string|undefined)[]){if(!Array.isArray(value)||!value.length||value.length>1000000||value.some(v=>v!==undefined&&(typeof v!=='string'||!v||v.length>8192)))invalid('类型关联游标无效');return value.at(-1)}
export function typeRulePage(value:unknown,type:string,filters:TypeRuleFilters,used:readonly(string|undefined)[]):TypeRulePage{
 const target=identity(type),page=deviceRulePage(value,'',used)
 if(page.items.some(row=>row.deviceSource.kind!=='DEVICE_TYPE'||!deviceSourceMembers(row.deviceSource).includes(target)||filters.status&&row.status!==filters.status||filters.ruleType&&row.ruleType!==filters.ruleType))invalid('消息规则并非当前类型的已保存来源')
 return page
}
export function typeTaskPage(value:Schema<'CursorPageDeviceTaskJobResponse'>,status:''|'ACTIVE'|'PAUSED',used:readonly(string|undefined)[]):TypeTaskPage{
 const page=deviceTaskDefinitionPage(value,used)
 // 公开摘要未含targetDeviceTypeId；本类型由请求路径、服务核验和绑定游标约束，不能伪造该字段。
 if(page.items.some(row=>row.targetType!=='DEVICE_TYPE'||row.targetGroupId!=null||status&&row.status!==status))invalid('任务目标不是当前类型读取合同')
 return page
}
export function typeAlarmPage(value:unknown,type:string,page:number):TypeAlarmPage{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid();const raw=value as Record<string,unknown>
 if(Object.keys(raw).length!==5||raw.deviceTypeId!==identity(type)||raw.page!==page||raw.limit!==24||typeof raw.total!=='string'||!/^(0|[1-9]\d{0,18})$/.test(raw.total)||BigInt(raw.total)>9223372036854775807n||!Array.isArray(raw.items))invalid()
 const remain=BigInt(raw.total)-BigInt(page-1)*24n,expected=remain<=0n?0:Number(remain>24n?24n:remain);if(raw.items.length!==expected)invalid('告警规则页数量与真实计数不符')
 const seen=new Set<string>();const items=raw.items.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==7||!definitionUuid(row.id)||seen.has(row.id.toLowerCase())||typeof row.name!=='string'||!row.name.trim()||typeof row.enabled!=='boolean'||!Number.isSafeInteger(row.version)||row.version<0||row.version>2147483647||!['NORMAL','IMPORTANT','URGENT'].includes(row.level)||!Array.isArray(row.notificationGroups)||!Array.isArray(row.customerChannels))invalid();seen.add(row.id.toLowerCase())
  const groupIds=new Set<string>(),notificationGroups=row.notificationGroups.map((group:unknown)=>{
   if(!group||typeof group!=='object'||Array.isArray(group)||Object.keys(group).length!==2)invalid('告警通知组摘要不完整')
   const value=group as Record<string,unknown>
   if(!definitionUuid(value.id)||groupIds.has(value.id.toLowerCase())||value.name!==null&&typeof value.name!=='string')invalid('告警通知组摘要不完整');groupIds.add(value.id.toLowerCase())
   return Object.freeze({id:value.id,name:value.name})
  })
  if(row.customerChannels.length>4||new Set(row.customerChannels).size!==row.customerChannels.length||row.customerChannels.some((channel:unknown)=>typeof channel!=='string'||!['WECHAT','SMS','VOICE','APP'].includes(channel)))invalid('告警用户通知摘要不完整')
  return Object.freeze({...row,notificationGroups:Object.freeze(notificationGroups),customerChannels:Object.freeze([...row.customerChannels])})
 })
 return Object.freeze({...raw,items:Object.freeze(items)}) as TypeAlarmPage
}
export const typeAssociationsTransport:TypeAssociationsTransport={
 async rules(project,type,filters,used,signal){if(!['','ACTIVE','PAUSED'].includes(filters.status)||!['',...ruleKinds].includes(filters.ruleType))invalid('规则筛选无效');const next=cursor(used),value=await api<Schema<'CursorPageRuleDeviceDefinition'>>(`${path(project,type)}/message-rules`,{query:{status:filters.status||undefined,ruleType:filters.ruleType||undefined,cursor:next,limit:24},signal});return typeRulePage(value,type,filters,used)},
 async ruleActions(project,type,row,signal){
  const version=await getVersion(project,row.id,row.activeVersionId,signal)
  if(version.id!==row.activeVersionId||version.deviceSource?.kind!=='DEVICE_TYPE'||!deviceSourceMembers(version.deviceSource).includes(type.toLowerCase()))return []
  const nodes=(items:unknown,key:string):string[]=>Array.isArray(items)?items.flatMap(item=>typeof item?.[key]==='string'?[item[key]]:[]):[]
  return [...nodes(version.actions,'nodeType'),...(version.preprocessing?.functions??[]).map(()=>'cloud-function'),
   ...nodes(version.propertyPreprocessing?.operations,'kind').map(kind=>kind==='FUNCTION'?'cloud-function':kind),
   ...nodes(version.dataOperations?.operations,'kind').map(kind=>`DATA_${kind}`),
   ...(version.nativeParser||version.subdeviceNativeParser?['DATA_MODBUS_RTU']:[]),
   ...(version.gatewayParser?['DATA_GATEWAY_PROPERTY']:[]),...(version.dataDownlink?['DATA_DATA_DOWNLINK']:[])]
 },
 async tasks(project,type,status,used,signal){if(!['','ACTIVE','PAUSED'].includes(status))invalid('任务状态无效');const next=cursor(used),value=await api<Schema<'CursorPageDeviceTaskJobResponse'>>(`${path(project,type)}/task-jobs`,{query:{status:status||undefined,cursor:next,limit:24},signal});return typeTaskPage(value,status,used)},
 async alarms(project,type,page,signal){if(!Number.isSafeInteger(page)||page<1||page>1000000)invalid('告警规则页码无效');return typeAlarmPage(await api<Schema<'DeviceTypeAlarmRulePageResponse'>>(`${path(project,type)}/alarm-rules`,{query:{page,limit:24},signal}),type,page)}
}
