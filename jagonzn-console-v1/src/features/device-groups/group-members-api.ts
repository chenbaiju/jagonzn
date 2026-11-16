import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {decodeGroup,groupUuid,type DeviceGroup,type GroupQuery,type GroupTreePage,groupTransport} from './device-group-api'
import {directoryAlarmStatus} from '../devices/directory-alarm-status'
import {directoryDisplayFacts,type DirectoryDisplayFact} from '../devices/directory-display-facts'
import {decodeStaticGroup,prepareStaticGroup,changeStaticGroup,readStaticGroup,type StaticGroupIntent,type StaticGroupMembership} from '../devices/static-group-membership-api'
export type GroupScope=NonNullable<Schema<'DeviceGroupMembersResponse'>['scope']>
export type MemberDevice=Readonly<Required<Pick<Schema<'DeviceResponse'>,'id'|'name'|'status'>>&Schema<'DeviceResponse'>>
export type MemberDirectory=Readonly<Required<Omit<Schema<'ConsoleDeviceCatalogResponse'>,'items'>>&{items:MemberDevice[]}>
export type MemberPage=Readonly<Required<Omit<Schema<'DeviceGroupMembersResponse'>,'group'|'directory'>>&{group:DeviceGroup;directory:MemberDirectory}>
export type MemberQuery=Readonly<{scope:GroupScope;page:number;limit:20|50;keyword:string}>
export type MoveIntent=Readonly<{kind:'move';project:string;device:string;key:string;body:Readonly<Required<Schema<'MoveDeviceStaticGroupRequest'>>>}>
export type EdgeIntent=Readonly<{kind:'edge';original:StaticGroupIntent}>
export type MemberIntent=MoveIntent|EdgeIntent
export type MoveState=Readonly<Required<Omit<Schema<'DeviceStaticGroupMoveResponse'>,'source'|'target'>>&{source:Required<StaticGroupMembership>;target:Required<StaticGroupMembership>}>
export type MemberTransport={members:(project:string,group:string,query:MemberQuery,signal:AbortSignal)=>Promise<MemberPage>;devices:(project:string,keyword:string,page:number,signal:AbortSignal)=>Promise<MemberDirectory>;groups:(project:string,query:GroupQuery,signal:AbortSignal)=>Promise<GroupTreePage>;write:(intent:MemberIntent,signal:AbortSignal)=>Promise<MoveState|StaticGroupMembership>;recover:(intent:MemberIntent,signal:AbortSignal)=>Promise<MoveState|StaticGroupMembership>}
function invalid(message='组成员响应范围或资料不完整'):never{throw new Error(message)}
function object(value:unknown){if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>}
function scope(project:string,group?:string){if(!groupUuid.test(project)||group!==undefined&&!groupUuid.test(group))invalid('设备组成员范围不合法')}
function directory(value:unknown,page:number,limit:number):MemberDirectory{
 const raw=object(value)
 if(!Array.isArray(raw.items)||typeof raw.total!=='string'||!/^(0|[1-9]\d{0,18})$/.test(raw.total)||raw.page!==page||raw.limit!==limit)invalid()
 const offset=BigInt(page-1)*BigInt(limit),remaining=BigInt(raw.total)-offset,expected=remaining<=0n?0:Number(remaining>BigInt(limit)?BigInt(limit):remaining)
 if(raw.items.length!==expected||new Set(raw.items.map(item=>object(item).id)).size!==raw.items.length)invalid('成员页发生截断或重复')
 for(const item of raw.items){const row=object(item);if(typeof row.id!=='string'||!groupUuid.test(row.id)||typeof row.name!=='string'||!row.name||!['INACTIVE','ONLINE','OFFLINE'].includes(String(row.status)))invalid()}
 const result=raw as unknown as MemberDirectory
 // 直接复用目录已验的同页身份与快照核对，不另造告警或设备类型事实。
 directoryAlarmStatus(result.items,result.alarmObservations);if(!directoryDisplayFacts(result.items,result.displayFacts))invalid('缺少本页展示事实')
 return result
}
export function decodeMemberPage(value:unknown,groupId:string,query:MemberQuery):MemberPage{
 const raw=object(value);if(Object.keys(raw).length!==3||raw.scope!==query.scope)invalid()
 return Object.freeze({group:decodeGroup(raw.group,groupId),scope:query.scope,directory:directory(raw.directory,query.page,query.limit)}) as MemberPage
}
export function memberFacts(page:MemberPage){return {display:directoryDisplayFacts(page.directory.items,page.directory.displayFacts) as Record<string,DirectoryDisplayFact>,alarm:directoryAlarmStatus(page.directory.items,page.directory.alarmObservations)}}
function membership(value:unknown,project:string,device:string,group:string){const row=object(value);if(Object.keys(row).length!==5||row.projectId!==project||row.deviceId!==device||row.groupId!==group||typeof row.name!=='string'||!row.name||typeof row.member!=='boolean')invalid('两组关系身份不符');return row as Required<StaticGroupMembership>}
export function decodeMoveState(value:unknown,intent:MoveIntent,written=false):MoveState{
 const raw=object(value);if(Object.keys(raw).length!==4||raw.projectId!==intent.project||raw.deviceId!==intent.device)invalid()
 const source=membership(raw.source,intent.project,intent.device,intent.body.sourceGroupId),target=membership(raw.target,intent.project,intent.device,intent.body.targetGroupId)
 if(written&&(source.member||!target.member))invalid('移动回执未提供原子终态')
 return Object.freeze({projectId:intent.project,deviceId:intent.device,source,target})
}
export function prepareMemberEdge(project:string,device:string,group:string,member:boolean):EdgeIntent{scope(project,group);return Object.freeze({kind:'edge',original:prepareStaticGroup({project,device},group,member)})}
export function prepareMemberMove(project:string,device:string,source:string,target:string):MoveIntent{scope(project,source);scope(project,target);if(!groupUuid.test(device)||source===target)invalid('请选择不同的明确静态目标组');return Object.freeze({kind:'move',project,device,key:crypto.randomUUID(),body:Object.freeze({sourceGroupId:source,targetGroupId:target})})}
export const memberTransport:MemberTransport={
 async members(project,group,query,signal){scope(project,group);const value=await api<Schema<'DeviceGroupMembersResponse'>>(`/api/v1/projects/${project}/device-groups/${group}/members`,{query,signal});return decodeMemberPage(value,group,query)},
 async devices(project,keyword,page,signal){scope(project);const value=await api<Schema<'ConsoleDeviceCatalogResponse'>>(`/api/v1/projects/${project}/devices/directory`,{query:{keyword,page,limit:20,order:'CREATED_ASC'},signal});return directory(value,page,20)},
 groups:groupTransport.list,
 async write(intent,signal){
  if(intent.kind==='edge'){const bytes=await changeStaticGroup(intent.original,signal);try{const fact=decodeStaticGroup(bytes,intent.original,intent.original.group);if(fact.member!==intent.original.member)invalid('归属回执终态不符');return fact}catch{throw new ApiError('归属回执未能核对，结果未知',200,undefined,undefined,true)}}
  const value=await api<Schema<'DeviceStaticGroupMoveResponse'>>(`/api/v1/projects/${intent.project}/devices/${intent.device}/static-group-moves`,{method:'post',body:intent.body,headers:{'Idempotency-Key':intent.key},signal});try{return decodeMoveState(value,intent,true)}catch{throw new ApiError('移动回执未能核对，结果未知',200,undefined,undefined,true)}
 },
 async recover(intent,signal){if(intent.kind==='edge')return decodeStaticGroup(await readStaticGroup(intent.original,intent.original.group,signal),intent.original,intent.original.group);const value=await api<Schema<'DeviceStaticGroupMoveResponse'>>(`/api/v1/projects/${intent.project}/devices/${intent.device}/static-group-moves/current`,{query:intent.body,signal});return decodeMoveState(value,intent)}
}
