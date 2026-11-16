import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'

export type EndUser=Readonly<{
  id:string
  username:string
  displayName:string|null
  status:string
  role:string|null
  roleStatus:string|null
  assignedAt:string|null
}>
export type EndUserPage=Readonly<{items:EndUser[];nextCursor:string|null;hasMore:boolean}>
export type EndUserNotificationContact=Readonly<{voiceNumber:string|null;smsNumber:string|null;revision:string}>
export type EndUserNotificationContactUpdate=Readonly<{voiceNumber:string|null;smsNumber:string|null;expectedRevision:string}>
export type EndUserDeviceBinding=Readonly<{deviceId:string;relationRole:string;status:string;createdAt:string}>
export type EndUserRole='APP_ADMIN'|'MAINTAINER'|'OPERATOR'|'OBSERVER'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const time=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const revisionPattern=/^(0|[1-9][0-9]{0,18})$/
const phonePattern=/^\+[1-9][0-9]{6,14}$/
const maximumRevision=9223372036854775807n
function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('终端用户目录响应不完整')
  return value as Record<string,unknown>
}
function optionalTime(value:unknown):string|null{
  if(value===null||value===undefined)return null
  if(typeof value!=='string'||!time.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('终端用户时间为空或格式不符')
  return value
}
function decodeUser(item:unknown):EndUser{
  const row=object(item)
  if(typeof row.id!=='string'||!uuid.test(row.id)||typeof row.username!=='string'||!row.username.trim()||row.username.length>128
    ||!(row.displayName===null||typeof row.displayName==='string')||typeof row.status!=='string'||!row.status
    ||!(row.role===null||typeof row.role==='string')||!(row.roleStatus===null||typeof row.roleStatus==='string'))throw new Error('终端用户目录项不完整')
  return Object.freeze({id:row.id,username:row.username,displayName:row.displayName,status:row.status,role:row.role,roleStatus:row.roleStatus,assignedAt:optionalTime(row.assignedAt)})
}
function page(value:unknown):EndUserPage{
  const raw=object(value)
  if(!Array.isArray(raw.items)||raw.items.length>200||typeof raw.hasMore!=='boolean'||!(raw.nextCursor===null||typeof raw.nextCursor==='string'))throw new Error('终端用户目录分页不完整')
  if(raw.hasMore&&(typeof raw.nextCursor!=='string'||!raw.nextCursor))throw new Error('终端用户目录续页游标缺失')
  const items=raw.items.map(decodeUser)
  return Object.freeze({items,nextCursor:raw.nextCursor as string|null,hasMore:raw.hasMore})
}
const roles:readonly EndUserRole[]=['APP_ADMIN','MAINTAINER','OPERATOR','OBSERVER']
function requireUser(project:string,userId:string){if(!uuid.test(project)||!uuid.test(userId))throw new Error('终端用户身份无效')}
function requireRevision(value:unknown):string{
  if(typeof value!=='string'||!revisionPattern.test(value)||BigInt(value)>maximumRevision)throw new Error('接收号码版本无效')
  return value
}
function contactNumber(value:unknown,label:string):string|null{
  if(value===null)return null
  if(typeof value!=='string'||!phonePattern.test(value))throw new Error(`${label}格式无效`)
  return value
}
function deviceBinding(value:unknown):EndUserDeviceBinding{
  const row=object(value)
  if(typeof row.deviceId!=='string'||!uuid.test(row.deviceId)||typeof row.relationRole!=='string'||!row.relationRole||typeof row.status!=='string'||!row.status||!validTime(row.createdAt))throw new Error('终端用户设备绑定不完整')
  return Object.freeze({deviceId:row.deviceId,relationRole:row.relationRole,status:row.status,createdAt:row.createdAt})
}
function validTime(value:unknown):value is string{return typeof value==='string'&&time.test(value)&&Number.isFinite(Date.parse(value))}
function notificationContact(value:unknown):EndUserNotificationContact{
  const raw=object(value)
  if(!('voiceNumber' in raw)||!('smsNumber' in raw))throw new Error('接收号码响应不完整')
  return Object.freeze({voiceNumber:contactNumber(raw.voiceNumber,'电话接收号码'),smsNumber:contactNumber(raw.smsNumber,'短信接收号码'),revision:requireRevision(raw.revision)})
}
export const endUserApi={
  async list(project:string,cursor:string|undefined,signal?:AbortSignal){
    if(!uuid.test(project))throw new Error('请选择当前项目')
    const value=await api<Schema<'CursorPageEndUserResponse'>>(`/api/v1/projects/${project}/end-users`,{query:{limit:20,...(cursor?{cursor}:{})},signal})
    return page(value)
  },
  async lookup(project:string,username:string,signal?:AbortSignal){
    if(!uuid.test(project))throw new Error('请选择当前项目')
    const value=username.trim()
    if(!value||value.length>64)throw new Error('精确用户名需为1至64个字符')
    return decodeUser(await api<Schema<'EndUserResponse'>>(`/api/v1/projects/${project}/end-users/lookup`,{query:{username:value},signal}))
  },
  async devices(project:string,userId:string,signal?:AbortSignal){
    requireUser(project,userId)
    const value=await api<Schema<'EndUserDeviceBindingResponse'>[]>(`/api/v1/projects/${project}/end-users/${userId}/devices`,{signal})
    if(!Array.isArray(value)||value.length>200)throw new Error('终端用户设备绑定响应不完整')
    return value.map(deviceBinding)
  },
  async updateRole(project:string,userId:string,role:EndUserRole,signal?:AbortSignal){
    requireUser(project,userId)
    if(!roles.includes(role))throw new Error('终端用户角色无效')
    return api<void>(`/api/v1/projects/${project}/end-users/${userId}/role`,{method:'patch',body:{role},signal})
  },
  async provision(project:string,body:{username:string;password:string;displayName?:string},signal?:AbortSignal){
    if(!uuid.test(project))throw new Error('请选择当前项目')
    return decodeUser(await api<Schema<'EndUserResponse'>>(`/api/v1/projects/${project}/end-users`,{method:'post',body,signal}))
  },
  async assignRole(project:string,userId:string,role:EndUserRole,signal?:AbortSignal){
    requireUser(project,userId)
    if(!roles.includes(role))throw new Error('终端用户角色无效')
    return api<void>(`/api/v1/projects/${project}/end-users/${userId}/role`,{method:'post',body:{role},signal})
  },
  async suspend(project:string,userId:string,signal?:AbortSignal){
    requireUser(project,userId)
    return api<void>(`/api/v1/projects/${project}/end-users/${userId}/suspend`,{method:'post',signal})
  },
  async restore(project:string,userId:string,signal?:AbortSignal){
    requireUser(project,userId)
    return api<void>(`/api/v1/projects/${project}/end-users/${userId}/restore`,{method:'post',signal})
  },
  async notificationContact(project:string,userId:string,signal?:AbortSignal){
    requireUser(project,userId)
    return notificationContact(await api<Schema<'EndUserNotificationContactResponse'>>(`/api/v1/projects/${project}/end-users/${userId}/notification-contact`,{signal}))
  },
  async updateNotificationContact(project:string,userId:string,body:EndUserNotificationContactUpdate,signal?:AbortSignal){
    requireUser(project,userId)
    const voiceNumber=contactNumber(body?.voiceNumber,'电话接收号码'),smsNumber=contactNumber(body?.smsNumber,'短信接收号码'),expectedRevision=requireRevision(body?.expectedRevision)
    return notificationContact(await api<Schema<'EndUserNotificationContactResponse'>>(`/api/v1/projects/${project}/end-users/${userId}/notification-contact`,{method:'put',body:{voiceNumber,smsNumber,expectedRevision},signal}))
  }
}
