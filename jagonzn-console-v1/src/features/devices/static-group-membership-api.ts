import {api} from '@/core/http'
import type {Schema,paths} from '@/core/contracts'
import {devicePath} from './api'
import {parseDashboardRuntimeResponse,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
export type StaticGroupMembership=Schema<'DeviceStaticGroupMembershipResponse'>
export type StaticGroupPage=Schema<'DeviceStaticGroupMembershipPageResponse'>
export type StaticGroupScope=Readonly<{project:string;device:string}>
export type StaticGroupIntent=StaticGroupScope&Readonly<{group:string;member:boolean;key:string}>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
function check(scope:StaticGroupScope,group?:string){if(!uuid.test(scope.project)||!uuid.test(scope.device)||group!==undefined&&!uuid.test(group))throw new Error('设备分组范围无效')}
export function readStaticGroups(scope:StaticGroupScope,membersOnly:boolean,afterGroupId:string|undefined,signal:AbortSignal){
 check(scope,afterGroupId)
 const query={membersOnly,afterGroupId,limit:50} satisfies NonNullable<paths['/api/v1/projects/{projectId}/devices/{deviceId}/static-groups']['get']['parameters']['query']>
 return api<Uint8Array>(`${devicePath(scope.project,scope.device)}/static-groups`,{query,signal,responseType:'bytes',maxResponseBytes:131072})
}
export function readStaticGroup(scope:StaticGroupScope,group:string,signal:AbortSignal){check(scope,group);return api<Uint8Array>(`${devicePath(scope.project,scope.device)}/static-groups/${group}`,{signal,responseType:'bytes',maxResponseBytes:8192})}
export function prepareStaticGroup(scope:StaticGroupScope,group:string,member:boolean):StaticGroupIntent{check(scope,group);if(typeof member!=='boolean')throw new Error('请选择明确的分组动作');return Object.freeze({...scope,group,member,key:crypto.randomUUID()})}
export function changeStaticGroup(intent:StaticGroupIntent,signal:AbortSignal){
 check(intent,intent.group)
 const options={headers:{'Idempotency-Key':intent.key},signal,responseType:'bytes' as const,maxResponseBytes:8192}
 return intent.member
  ?api<Uint8Array>(`${devicePath(intent.project,intent.device)}/static-groups/${intent.group}`,{...options,method:'put'})
  :api<Uint8Array>(`${devicePath(intent.project,intent.device)}/static-groups/${intent.group}`,{...options,method:'delete'})
}
function membership(value:StrictJsonValue,scope:StaticGroupScope,group?:string):StaticGroupMembership{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('设备分组事实不完整')
 const row=value as Record<string,StrictJsonValue>
 if(Object.keys(row).length!==5||row.projectId!==scope.project||row.deviceId!==scope.device||typeof row.groupId!=='string'||!uuid.test(row.groupId)||group!==undefined&&row.groupId!==group||typeof row.name!=='string'||!row.name.trim()||row.name.length>128||typeof row.member!=='boolean')throw new Error('设备分组身份或当前状态不完整')
 return {projectId:scope.project,deviceId:scope.device,groupId:row.groupId,name:row.name,member:row.member}
}
export function decodeStaticGroup(bytes:Uint8Array,scope:StaticGroupScope,group:string){check(scope,group);return membership(parseDashboardRuntimeResponse(bytes),scope,group)}
export function decodeStaticGroups(bytes:Uint8Array,scope:StaticGroupScope,membersOnly:boolean,afterGroupId?:string):StaticGroupPage{
 check(scope,afterGroupId);const page=parseDashboardRuntimeResponse(bytes)
 if(Object.keys(page).length!==6||page.projectId!==scope.project||page.deviceId!==scope.device||page.membersOnly!==membersOnly||!Array.isArray(page.items)||page.items.length>50||typeof page.hasMore!=='boolean')throw new Error('设备分组页范围或字段不完整')
 const items=page.items.map(row=>membership(row,scope));let previous=afterGroupId
 for(const row of items){if(membersOnly&&!row.member||previous!==undefined&&row.groupId<=previous)throw new Error('设备分组页重复、位置反序或混入未加入组');previous=row.groupId}
 const next=page.nextAfterGroupId
 if(page.hasMore?(items.length!==50||next!==items.at(-1)!.groupId):(next!==null))throw new Error('设备分组下一位置不完整')
 return {projectId:scope.project,deviceId:scope.device,membersOnly,items,hasMore:page.hasMore,nextAfterGroupId:next as string|null}
}
