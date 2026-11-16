import {ApiError} from '@/core/http'
import type {BatchStatus} from '../devices/device-batch-api'
import {readBatchDevice} from '../devices/device-batch-api'
import {csvCell} from '../devices/form-model'
import {decodeDirectoryActivity} from '../devices/directory-activity-capabilities'
import {alarmLabel} from '../devices/page-alarm-status'
import {decodeMemberPage,memberTransport,memberFacts,prepareMemberEdge,prepareMemberMove,type MemberDevice,type MemberPage,type MemberIntent,type MemberTransport,type MoveState} from './group-members-api'
import {groupUuid,type DeviceGroup} from './device-group-api'
export type GroupBulkAction='ADD'|'REMOVE'|'MOVE'
export type GroupBulkTransport=MemberTransport&{deviceName:typeof readBatchDevice}
export const groupBulkTransport:GroupBulkTransport={...memberTransport,deviceName:readBatchDevice}
export type GroupBulkRow={id:string;name:string;intent:MemberIntent;status:BatchStatus;detail:string;checked?:boolean;observation?:string}
export function groupBulkSelection(values:readonly MemberDevice[]):readonly MemberDevice[]{
 if(!Array.isArray(values)||values.length<1||values.length>100||values.some(row=>!row||!groupUuid.test(row.id)||!row.name)||new Set(values.map(row=>row.id)).size!==values.length)throw new Error('请明确选择1至100台不重复设备，不会截断选集')
 return Object.freeze(values.map(row=>Object.freeze({...row})))
}
export async function prepareGroupBulkRow(transport:GroupBulkTransport,project:string,group:DeviceGroup,action:GroupBulkAction,target:string|undefined,device:MemberDevice,signal:AbortSignal):Promise<GroupBulkRow>{
 if(!groupUuid.test(project)||!groupUuid.test(group.id)||group.type!=='STATIC')throw new Error('批量维护必须明确当前静态组')
 const actual=await transport.deviceName(project,device.id,signal)
 if(actual.id!==device.id||!actual.name)throw new Error('设备身份未能核对')
 const intent=action==='MOVE'?prepareMemberMove(project,device.id,group.id,target??''):prepareMemberEdge(project,device.id,group.id,action==='ADD')
 const current=await transport.recover(intent,signal),row:GroupBulkRow={id:actual.id,name:actual.name,intent,status:'READY',detail:'待确认逐项提交'}
 if(intent.kind==='edge'&&'member'in current&&current.member===intent.original.member){row.status='NOOP';row.detail=current.member?'当前已在本组，无需修改':'当前已不在本组，无需修改'}
 if(intent.kind==='move'&&'source'in current&&!current.source.member){row.status='FAILED';row.detail='源组当前无此显式归属，未发送移动'}
 return row
}
export function groupBulkKnownFailure(cause:unknown):boolean{return cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&cause.status>=400&&cause.status<500}
export function groupBulkKey(row:GroupBulkRow){return row.intent.kind==='edge'?row.intent.original.key:row.intent.key}
export function groupBulkObservation(value:Awaited<ReturnType<MemberTransport['recover']>>){if('source'in value){const v=value as MoveState;return `${v.source.name}：${v.source.member?'已加入':'未加入'}；${v.target.name}：${v.target.member?'已加入':'未加入'}；仅当前事实，不证明原请求历史`};return `${value.name}：${value.member?'已加入':'未加入'}；仅当前事实，不证明原请求历史`}
/** 在已有CSV转义前防护空白/控制符后公式，不丢失原文或引入可执行字段。 */
export function groupCsvCell(value:unknown){const text=String(value??'');return csvCell(/^[\s\u0000-\u001f]*[=+@-]/u.test(text)?"'"+text:text)}
export function groupPageCsv(page:MemberPage,selected?:readonly string[]):Readonly<{filename:string;text:string}>{
 const raw=page.directory,scope=page.scope
 if(![20,50].includes(raw.limit))throw new Error('当前页大小不在已支持导出范围')
 const checked=decodeMemberPage(page,page.group.id,{scope,page:raw.page,limit:raw.limit as 20|50,keyword:''}),data=checked.directory
 const activity=decodeDirectoryActivity(data.activity);if(!activity)throw new Error('当前页缺少通信观察时刻，请先刷新当前页')
 const ids=selected===undefined?data.items.map(row=>row.id):[...selected]
 if(ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>!data.items.some(row=>row.id===id)))throw new Error('本页已选导出不能包含其它页设备；不会截断跨页选择')
 const facts=memberFacts(checked),rows:unknown[][]=[['来源组ID','成员范围','页码','该范围总数','通信观察时刻','设备ID','设备名称','设备类型','在线状态','最近数据上报','告警状态']]
 for(const device of data.items.filter(row=>ids.includes(row.id))){if(!device.id)throw new Error('导出设备标识缺失');const display=facts.display[device.id];rows.push([checked.group.id,scope==='DIRECT'?'本组':'包含子组',data.page,data.total,activity.asOf,device.id,device.name,display?.deviceTypeName??'',device.status==='ONLINE'?'在线':device.status==='OFFLINE'?'离线':'从未连接',display?.lastDataReportAt??'',alarmLabel(facts.alarm.states[device.id])])}
 const text='\uFEFF'+rows.map(row=>row.map(groupCsvCell).join(',')).join('\r\n');if(new TextEncoder().encode(text).length>2*1024*1024)throw new Error('当前页导出超过2MiB，不会截断文件')
 return Object.freeze({filename:`设备组-${checked.group.id}-${scope}-第${data.page}页.csv`,text})
}
