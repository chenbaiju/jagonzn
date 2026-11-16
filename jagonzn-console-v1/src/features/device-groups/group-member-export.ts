import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {businessKey} from '../devices/reference-profile'
import {groupUuid} from './device-group-api'
import {groupCsvCell} from './group-bulk'
import type {GroupScope} from './group-members-api'
export type GroupMemberExport=Readonly<Required<Omit<Schema<'DeviceGroupMemberExportResponse'>,'items'>>&{items:readonly Readonly<Required<Schema<'DeviceGroupMemberExportItem'>>>[]}>
export type GroupExportQuery=Readonly<{project:string;group:string;scope:GroupScope;keyword:string}>
export type GroupExportTransport=(query:GroupExportQuery,signal:AbortSignal)=>Promise<GroupMemberExport>
const javaSpace=/^[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+$/g
function invalid(message='完整组导出范围或快照不完整，未生成部分文件'):never{throw new Error(message)}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>}
function at(value:unknown){return typeof value==='string'&&/^\d{4}-\d\d-\d\dT/.test(value)&&Number.isFinite(Date.parse(value))}
export function groupExportQuery(project:string,group:string,scope:GroupScope,keyword:string):GroupExportQuery{if(!groupUuid.test(project)||!groupUuid.test(group)||!['DIRECT','SUBTREE'].includes(scope)||typeof keyword!=='string'||keyword.length>128||keyword.includes('\0'))invalid('请明确组范围和最多128字符的筛选关键词');return Object.freeze({project,group,scope,keyword})}
export function decodeGroupMemberExport(value:unknown,query:GroupExportQuery):GroupMemberExport{
 groupExportQuery(query.project,query.group,query.scope,query.keyword);const raw=object(value),keys=['groupId','groupName','scope','keyword','snapshotAt','total','maximumRows','items'],keyword=query.keyword.replace(javaSpace,'')||null
 if(Object.keys(raw).length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k))||raw.groupId!==query.group||raw.scope!==query.scope||raw.keyword!==keyword||typeof raw.groupName!=='string'||!raw.groupName||raw.groupName.length>128||!at(raw.snapshotAt)||typeof raw.total!=='string'||!/^(0|[1-9]\d{0,2})$/.test(raw.total)||Number(raw.total)>500||raw.maximumRows!==500||!Array.isArray(raw.items)||raw.items.length!==Number(raw.total))invalid()
 const seen=new Set<string>(),itemKeys=['deviceId','name','referenceKey','deviceTypeId','deviceTypeName','status','enabled','lastDataReportAt']
 const items=raw.items.map(value=>{const row=object(value);if(Object.keys(row).length!==itemKeys.length||itemKeys.some(k=>!Object.hasOwn(row,k))||typeof row.deviceId!=='string'||!groupUuid.test(row.deviceId)||seen.has(row.deviceId)||typeof row.name!=='string'||!row.name||row.name.length>128||!['INACTIVE','ONLINE','OFFLINE'].includes(String(row.status))||typeof row.enabled!=='boolean'||row.referenceKey!==null&&(typeof row.referenceKey!=='string'||businessKey(row.referenceKey)!==row.referenceKey)||row.deviceTypeId!==null&&(typeof row.deviceTypeId!=='string'||!groupUuid.test(row.deviceTypeId))||row.deviceTypeName!==null&&(typeof row.deviceTypeName!=='string'||!row.deviceTypeName)||row.deviceTypeId===null&&row.deviceTypeName!==null||row.lastDataReportAt!==null&&!at(row.lastDataReportAt))invalid();seen.add(row.deviceId);return Object.freeze({...row})})
 return Object.freeze({...raw,items:Object.freeze(items)}) as GroupMemberExport
}
export const readGroupMemberExport:GroupExportTransport=async(query,signal)=>{groupExportQuery(query.project,query.group,query.scope,query.keyword);const result=await api<Schema<'DeviceGroupMemberExportResponse'>>(`/api/v1/projects/${query.project}/device-groups/${query.group}/member-export`,{query:{scope:query.scope,keyword:query.keyword},signal,maxResponseBytes:2*1024*1024});return decodeGroupMemberExport(result,query)}
export function groupMemberExportCsv(value:GroupMemberExport,query:GroupExportQuery):Readonly<{filename:string;text:string}>{
 const result=decodeGroupMemberExport(value,query),rows:unknown[][]=[['来源组ID','来源组名称','成员范围','筛选关键词','数据库快照时间','设备ID','设备名称','业务标识','设备类型ID','设备类型','在线状态','接入状态','最近数据上报']]
 for(const row of result.items)rows.push([result.groupId,result.groupName,result.scope==='DIRECT'?'本组':'包含子组',result.keyword??'',result.snapshotAt,row.deviceId,row.name,row.referenceKey??'',row.deviceTypeId??'',row.deviceTypeName??'',row.status==='ONLINE'?'在线':row.status==='OFFLINE'?'离线':'从未连接',row.enabled?'启用':'停用',row.lastDataReportAt??''])
 const text='\uFEFF'+rows.map(row=>row.map(groupCsvCell).join(',')).join('\r\n');if(new TextEncoder().encode(text).length>2*1024*1024)invalid('完整导出超过2MiB，未生成部分文件')
 return Object.freeze({filename:`设备组-${result.groupId}-${result.scope}-完整条件-${result.total}台.csv`,text})
}
