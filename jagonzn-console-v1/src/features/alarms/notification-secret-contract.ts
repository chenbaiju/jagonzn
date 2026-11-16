import type {Schema} from '../../core/contracts'
import {notificationGroupIdentity} from './notification-group-contract'
import {notificationGroupDraftError,type NotificationGroupDraft} from './notification-group-draft'
import {versionOf,type Group} from './model'
export type SecretGroupMode=Schema<'CreateConsoleNotificationGroupSecretRequest'>['notificationType']
export type SecretGroupEdit=Schema<'ConsoleNotificationGroupSecretEditResponse'>
export const secretGroupKinds={qywx_robot:'WECOM_ROBOT',dingding_robot:'DINGTALK_ROBOT',feishu_robot:'FEISHU_ROBOT',webhook:'WEBHOOK'} as const satisfies Record<SecretGroupMode,SecretGroupEdit['notificationType']>
const record=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('秘密配置资料不完整，请重新读取');return value as Record<string,unknown>}
const text=(value:unknown):value is string=>typeof value==='string'&&!/[\u0000\ud800-\udfff]/u.test(value.replace(/[\ud800-\udbff][\udc00-\udfff]/g,''))
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
function payload(url:unknown,headers:unknown,kind:SecretGroupEdit['notificationType']):{url:string;headers:Schema<'ConsoleNotificationGroupSecretHeader'>[]} {
 if(!text(url)||!Array.isArray(headers)||headers.length>4096)throw new Error('请核对URL和HTTP请求头')
 try{const parsed=new URL(url);if(url!==url.trim()||parsed.protocol!=='https:'||!parsed.hostname||parsed.username||parsed.password)throw new Error()}catch{throw new Error('请填写有效的HTTPS URL')}
 const names=new Set<string>(),copied=headers.map(value=>{const row=record(value);if(Object.keys(row).length!==2||!text(row.name)||!text(row.value)||!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(row.name)||/[\r\n]/.test(row.value)||names.has(row.name.toLowerCase()))throw new Error('请核对HTTP请求头名称、值和重复项');names.add(row.name.toLowerCase());return {name:row.name,value:row.value}})
 if(kind!=='WEBHOOK'&&copied.length)throw new Error('机器人通知不接受Webhook请求头')
 if(new TextEncoder().encode(JSON.stringify({schemaVersion:1,url,headers:copied})).length>65536)throw new Error('URL和请求头合计超过可保存范围')
 return {url,headers:copied}
}
/** 真正管理读面的五字段白名单；不从公开身份或掩码推断原地址。 */
export function secretGroupEdit(value:unknown,groupId:string):SecretGroupEdit {
 const row=record(value),keys=['groupId','notificationType','configurationVersion','url','headers']
 if(Object.keys(row).length!==5||Object.keys(row).some(key=>!keys.includes(key))||row.groupId!==groupId||!uuid.test(groupId)||!Object.values(secretGroupKinds).includes(row.notificationType as SecretGroupEdit['notificationType'])||!Number.isInteger(row.configurationVersion)||Number(row.configurationVersion)<0||Number(row.configurationVersion)>2147483647)throw new Error('秘密配置身份不完整，请重新读取')
 const kind=row.notificationType as SecretGroupEdit['notificationType'],body=payload(row.url,row.headers,kind)
 return {groupId,notificationType:kind,configurationVersion:row.configurationVersion as number,...body}
}
export function isSecretGroupDraft(draft:NotificationGroupDraft):draft is NotificationGroupDraft&{mode:SecretGroupMode}{return Object.hasOwn(secretGroupKinds,draft.mode)}
/** 不丢掉用户正文源码后返回默认正文成功；固定版本正文能力未接通时明确拒绝。 */
export function secretGroupCreationRequest(draft:NotificationGroupDraft):Schema<'CreateConsoleNotificationGroupSecretRequest'> {
 if(!isSecretGroupDraft(draft))throw new Error('通知方式与秘密创建入口不一致')
 const error=notificationGroupDraftError(draft,[]);if(error)throw new Error(error)
 if(draft.mode==='webhook'&&draft.customBody)throw new Error('自定义正文尚不能保存，请保留源码，待正文函数服务接通后重试')
 const body=payload(draft.mode==='webhook'?draft.webhookUrl:draft.robotUrls[draft.mode],draft.mode==='webhook'?draft.headers.filter(row=>row.name||row.value):[],secretGroupKinds[draft.mode])
 return {name:draft.name.trim(),description:draft.description,notificationType:draft.mode,...body}
}
export function secretGroupSaveRequest(value:SecretGroupEdit):Schema<'SaveConsoleNotificationGroupSecretRequest'> {
 if(!Number.isInteger(value.configurationVersion)||value.configurationVersion<0||value.configurationVersion>=2147483647)throw new Error('配置版本不可写，请重新读取核对')
 return {version:value.configurationVersion,...payload(value.url,value.headers,value.notificationType)}
}
export function createdSecretGroup(value:unknown,mode:SecretGroupMode):Group {
 const row=record(value),group=record(row.group)
 if(row.notificationType!==secretGroupKinds[mode]||row.configurationVersion!==0||typeof group.id!=='string'||!uuid.test(group.id)||typeof group.name!=='string'||typeof group.enabled!=='boolean'||versionOf(group)!==0)throw new Error('创建回执不完整')
 return group as Group
}
export function savedSecretGroup(value:unknown,groupId:string,previous:SecretGroupEdit){const identity=notificationGroupIdentity(value,groupId);if(!identity.configured||identity.notificationType!==previous.notificationType||identity.configurationVersion!==previous.configurationVersion+1)throw new Error('保存后的配置身份需要核对');return identity}
