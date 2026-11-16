import {api,ApiError} from '../../core/http'
import type {Schema} from '../../core/contracts'
import {secretGroupEdit,createdSecretGroup,savedSecretGroup,type SecretGroupEdit} from './notification-secret-contract'
const part=(value:string)=>{if(!value)throw new Error('请先选择项目或通知组');return encodeURIComponent(value)}
const base=(project:string)=>`/api/v1/projects/${part(project)}/console/alarm-notification-groups` as const
/** 仅调用正式498已生成的三条管理operation；没有地址探测、缓存或外部请求。 */
export const notificationSecretApi={
 read:async(project:string,group:string,signal?:AbortSignal)=>secretGroupEdit(await api<Schema<'ConsoleNotificationGroupSecretEditResponse'>>(`${base(project)}/${part(group)}/secret/edit`,{signal}),group),
 create:async(project:string,body:Schema<'CreateConsoleNotificationGroupSecretRequest'>)=>{
  const value=await api<Schema<'ConsoleConfiguredNotificationGroupResponse'>>(`${base(project)}/secret`,{method:'post',body})
  try{return createdSecretGroup(value,body.notificationType)}catch{throw new ApiError('创建结果需要重新读取核对',0,undefined,undefined,true)}
 },
 save:async(project:string,group:string,body:Schema<'SaveConsoleNotificationGroupSecretRequest'>,previous:SecretGroupEdit)=>{
  if(previous.groupId!==group||body.version!==previous.configurationVersion)throw new ApiError('秘密配置范围已改变，请重新读取',400)
  const value=await api<Schema<'ConsoleNotificationGroupConfigurationResponse'>>(`${base(project)}/${part(group)}/secret`,{method:'put',body})
  try{return savedSecretGroup(value,group,previous)}catch{throw new ApiError('保存结果需要重新读取核对',0,undefined,undefined,true)}
 }
}
