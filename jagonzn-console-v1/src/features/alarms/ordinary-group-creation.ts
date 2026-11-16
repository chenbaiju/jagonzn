import { ApiError, assertIdentity, IdentityChanged } from '../../core/http'
import { can, projectId } from '../../core/session'
import { alarmApi } from './api'
import { groupDescription, idOf, versionOf, type Group } from './model'
import { isOrdinaryCreationDraft, ordinaryGroupCreationRequest, type OrdinaryGroupOptions } from './notification-group-contract'
import type { NotificationGroupCreationContext, NotificationGroupDraft, NotificationGroupMemberChoice } from './notification-group-draft'

/** 普通四方式的创建子用例；完整八方式调度仍待秘密/函数/资格端口，不在此注册或删减表单方式。 */
export async function createOrdinaryGroupAndVerify(context:NotificationGroupCreationContext,draft:NotificationGroupDraft,members:NotificationGroupMemberChoice[]):Promise<Group>{
 const current=()=>{assertIdentity(context.identityEpoch);if(context.projectId!==projectId.value||!can('alarm:manage'))throw new IdentityChanged()}
 current()
 if(!isOrdinaryCreationDraft(draft))throw new ApiError('通知方式与普通创建入口不一致',400)
 let body:ReturnType<typeof ordinaryGroupCreationRequest>
 try{body=ordinaryGroupCreationRequest(draft,members)}catch(cause){throw new ApiError(cause instanceof Error?cause.message:'请核对通知组信息',400)}
 let created:Group
 try{created=await alarmApi.createOrdinaryGroup(context.projectId,body)}
 catch(cause){if(cause instanceof IdentityChanged||cause instanceof ApiError)throw cause;throw unknown()}
 current()
 try{
  const id=idOf(created)
  if(created.name!==body.name||created.enabled!==true||versionOf(created)!==0||typeof created.description!=='string'||created.description!==strip(body.description||'')||typeof created.createdAt!=='string'||!created.createdAt||typeof created.updatedAt!=='string'||!created.updatedAt)throw changed()
  const fresh=await alarmApi.group(context.projectId,id);current()
  if(idOf(fresh)!==id||fresh.name!==created.name||fresh.enabled!==created.enabled||versionOf(fresh)!==0||typeof fresh.description!=='string'||groupDescription(fresh)!==groupDescription(created)||fresh.createdAt!==created.createdAt||fresh.updatedAt!==created.updatedAt)throw changed()
  const identity=await alarmApi.groupConfiguration(context.projectId,id);current()
  if(identity.groupId!==id||identity.configured!==true||identity.notificationType!==body.notificationType.toUpperCase()||identity.configurationVersion!==0)throw changed()
  const options=await alarmApi.groupOrdinaryOptions(context.projectId,id);current()
  if(options.notificationType!==body.notificationType.toUpperCase()||options.version!==0||!matches(options,body))throw changed()
  if(body.notificationType==='email'){
   const recipients=await alarmApi.groupEmailEditOptions(context.projectId,id);current()
   const expected=[...(body.emails||[])].sort(),actual=recipients.map(item=>item.email).sort()
   if(JSON.stringify(actual)!==JSON.stringify(expected)||recipients.some(item=>!item.enabled||item.version!==0))throw changed()
  }
  current();return fresh
 }catch(cause){
  if(cause instanceof IdentityChanged||cause instanceof ApiError&&[401,403,404,409].includes(cause.status))throw cause
  throw unknown()
 }
}
/** 与现有Java普通文本strip一致，保留不属于Character.isWhitespace的NBSP等字符。 */
function strip(value:string):string{return value.replace(/^[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+$/g,'')}
function matches(value:OrdinaryGroupOptions,body:ReturnType<typeof ordinaryGroupCreationRequest>):boolean{
 if(body.notificationType==='member'){
  const canonical=(rows:OrdinaryGroupOptions['members'])=>rows.map(row=>[row.accountId,[...(row.channels||[])].sort()]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])))
  return !value.numbers.length&&JSON.stringify(canonical(value.members))===JSON.stringify(canonical(body.members||[]))
 }
 if(value.members.length)return false
 const numbers=(body.numbers||[]).map(number=>body.notificationType==='sms'?'+86'+number:number.replace(/[ -]/g,''))
 return JSON.stringify([...value.numbers].sort())===JSON.stringify(numbers.sort())
}
function changed(){return new ApiError('创建后的通知组已变更，请重新读取核对',409)}
function unknown(){return new ApiError('创建后读取失败，请核对结果',0,undefined,undefined,true)}
