import {api} from '../../core/http'
import type {paths,Schema} from '../../core/contracts'
import type {AlarmRuleTableRow} from './AlarmRuleDirectoryTable.vue'
export type AlarmRuleDirectoryQuery=NonNullable<paths['/api/v1/projects/{projectId}/console/alarm-rules']['get']['parameters']['query']>
export type AlarmRuleDirectoryItem=Schema<'ConsoleAlarmRuleDirectoryItemResponse'>
export type AlarmRuleDirectoryPage=Schema<'ConsoleAlarmRulePageResponse'>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('规则目录资料不完整');return value as Record<string,unknown>}
const id=(value:unknown):string=>{if(typeof value!=='string'||!uuid.test(value))throw new Error('规则目录身份不完整');return value}
const int=(value:unknown,max:number):number=>{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<1||value>max)throw new Error('规则目录分页参数不合法');return value}
function uniqueIds(value:unknown){if(!Array.isArray(value))throw new Error('规则通知组资料不完整');const ids=value.map(id);if(new Set(ids).size!==ids.length)throw new Error('规则通知组身份重复');return ids}
/** 仅消费生成的V2摘要，旧阈值规则或通知组管理编辑接口不参与目录读取。 */
export function alarmRuleDirectoryItem(value:unknown):AlarmRuleDirectoryItem {
 const row=object(value),identity=id(row.id),version=row.version
 if(typeof version!=='number'||!Number.isSafeInteger(version)||version<0||version>2147483647)throw new Error('规则目录版本不合法')
 if(typeof row.name!=='string'||!row.name.trim()||typeof row.enabled!=='boolean'||!['NORMAL','IMPORTANT','URGENT'].includes(String(row.level))||!['DEVICE','DEVICE_TYPE'].includes(String(row.sourceKind)))throw new Error('规则目录定义不完整')
 const notificationGroupIds=uniqueIds(row.notificationGroupIds)
 if(!Array.isArray(row.notificationGroups)||row.notificationGroups.length!==notificationGroupIds.length)throw new Error('规则通知组名称资料不完整')
 const notificationGroups=row.notificationGroups.map((value,index)=>{const group=object(value),identity=id(group.id);if(identity!==notificationGroupIds[index]||group.name!==null&&typeof group.name!=='string')throw new Error('规则通知组名称身份不一致');return {id:identity,name:group.name as string|null}})
 if(!Array.isArray(row.customerChannels)||row.customerChannels.length>4||new Set(row.customerChannels).size!==row.customerChannels.length||row.customerChannels.some(value=>!['VOICE','SMS','WECHAT','APP'].includes(String(value))))throw new Error('规则用户通知资料不完整')
 return {id:identity,name:row.name,enabled:row.enabled,version,level:row.level as AlarmRuleDirectoryItem['level'],sourceKind:row.sourceKind as AlarmRuleDirectoryItem['sourceKind'],notificationGroupIds,notificationGroups,customerChannels:[...row.customerChannels] as AlarmRuleDirectoryItem['customerChannels']}
}
export function alarmRuleDirectoryPage(value:unknown,page:number,limit:number,sourceKind?:AlarmRuleDirectoryQuery['sourceKind']):AlarmRuleDirectoryPage {
 const row=object(value)
 if(typeof row.total!=='string'||!/^(0|[1-9]\d{0,18})$/.test(row.total)||BigInt(row.total)>9223372036854775807n||row.page!==page||row.limit!==limit||!Array.isArray(row.items)||row.items.length>limit)throw new Error('规则目录分页资料不一致')
 const items=row.items.map(alarmRuleDirectoryItem)
 if(new Set(items.map(row=>row.id)).size!==items.length||BigInt(items.length)>BigInt(row.total)||BigInt(page-1)*BigInt(limit)>=BigInt(row.total)&&items.length||sourceKind&&items.some(row=>row.sourceKind!==sourceKind))throw new Error('规则目录集合不一致')
 return {items,total:row.total,page,limit}
}
function queryInteger(value:unknown,max:number){if(typeof value!=='string'||! /^[1-9]\d*$/.test(value))throw new Error('规则目录分页参数不合法');return int(Number(value),max)}
export const alarmRuleDirectoryApi={async page(project:string,query:AlarmRuleDirectoryQuery={},signal?:AbortSignal):Promise<AlarmRuleDirectoryPage>{
 const projectId=id(project),page=queryInteger(query.page??'1',2147483647),limit=queryInteger(query.limit??'24',100),sourceKind=query.sourceKind
 if(sourceKind!==undefined&&!['DEVICE','DEVICE_TYPE'].includes(sourceKind))throw new Error('规则来源筛选不合法')
 return alarmRuleDirectoryPage(await api<AlarmRuleDirectoryPage>(`/api/v1/projects/${encodeURIComponent(projectId)}/console/alarm-rules`,{query:{page:String(page),limit:String(limit),sourceKind},signal}),page,limit,sourceKind)
}}
/** 通知组缺失名称显示占位，绝不使用配置ID、联系人或管理用原文代替。 */
export function alarmRuleTableRow(row:AlarmRuleDirectoryItem):AlarmRuleTableRow {
 const levels={NORMAL:['普通','info'],IMPORTANT:['重要','warning'],URGENT:['紧急','danger']} as const
 return {identity:row.id,name:row.name,severityLabel:levels[row.level][0],severityTone:levels[row.level][1],sourceLabel:row.sourceKind==='DEVICE'?'设备':'设备类型',enabledLabel:row.enabled?'可用':'停用',notificationGroupLabels:row.notificationGroups.map(group=>group.name??'—'),customerChannels:row.customerChannels}
}
