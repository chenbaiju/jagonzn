import {ApiError,assertIdentity,IdentityChanged} from '../../core/http'
import {can,projectId} from '../../core/session'
import {alarmApi} from './api'
import {notificationSecretApi} from './notification-secret-api'
import {isSecretGroupDraft,secretGroupCreationRequest,secretGroupKinds} from './notification-secret-contract'
import type {NotificationGroupCreationContext,NotificationGroupDraft} from './notification-group-draft'
import {groupDescription,idOf,versionOf,type Group} from './model'
/** 秘密四方式真实创建后重读元数据、公开身份与管理原文；不发送到目标URL。 */
export async function createSecretGroupAndVerify(context:NotificationGroupCreationContext,draft:NotificationGroupDraft):Promise<Group> {
 const current=()=>{assertIdentity(context.identityEpoch);if(context.projectId!==projectId.value||!can('alarm:manage'))throw new IdentityChanged()};current()
 if(!isSecretGroupDraft(draft))throw new ApiError('通知方式与秘密创建入口不一致',400)
 let body:ReturnType<typeof secretGroupCreationRequest>
 try{body=secretGroupCreationRequest(draft)}catch(cause){throw new ApiError(cause instanceof Error?cause.message:'请核对秘密通知配置',400)}
 let created:Group
 try{created=await notificationSecretApi.create(context.projectId,body)}catch(cause){if(cause instanceof IdentityChanged||cause instanceof ApiError)throw cause;throw unknown()}
 current()
 try{
  const id=idOf(created),fresh=await alarmApi.group(context.projectId,id);current()
  if(idOf(fresh)!==id||fresh.name!==body.name||created.name!==body.name||fresh.enabled!==true||created.enabled!==true||versionOf(fresh)!==0||versionOf(created)!==0||typeof fresh.description!=='string'||typeof created.description!=='string'||groupDescription(fresh)!==groupDescription(created)||groupDescription(fresh)!==strip(body.description||'')||typeof fresh.createdAt!=='string'||!fresh.createdAt||fresh.createdAt!==created.createdAt||typeof fresh.updatedAt!=='string'||!fresh.updatedAt||fresh.updatedAt!==created.updatedAt)throw changed()
  const identity=await alarmApi.groupConfiguration(context.projectId,id);current()
  if(identity.groupId!==id||!identity.configured||identity.notificationType!==secretGroupKinds[body.notificationType]||identity.configurationVersion!==0)throw changed()
  const edit=await notificationSecretApi.read(context.projectId,id);current()
  if(edit.notificationType!==identity.notificationType||edit.configurationVersion!==0||edit.url!==body.url||JSON.stringify(edit.headers)!==JSON.stringify(body.headers))throw changed()
  return fresh
 }catch(cause){if(cause instanceof IdentityChanged||cause instanceof ApiError&&[401,403,404,409].includes(cause.status))throw cause;throw unknown()}
}
function changed(){return new ApiError('创建后的秘密配置已变更，请重新读取核对',409)}
function unknown(){return new ApiError('创建后读取失败，请核对结果',0,undefined,undefined,true)}
function strip(value:string):string{return value.replace(/^[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+$/g,'')}
