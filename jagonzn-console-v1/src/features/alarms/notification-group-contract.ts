import type { Schema } from '../../core/contracts'
import { versionOf, type Group } from './model'
import { emptyNotificationGroupDraft, notificationGroupDraftError, notificationSmsTargets, notificationTargetLines, type NotificationGroupDraft, type NotificationGroupMemberChoice } from './notification-group-draft'
import type { NotificationOrdinaryOptions } from './notification-ordinary-options'
export type NotificationGroupIdentity=Required<Schema<'ConsoleNotificationGroupConfigurationResponse'>>
export type OrdinaryGroupOptions=Required<Schema<'ConsoleNotificationGroupOptionsResponse'>>
export type PublicOrdinaryGroupOptions=Schema<'ConsoleNotificationGroupPublicOptionsResponse'>
export type OrdinaryCreationDraft=NotificationGroupDraft&{mode:Schema<'CreateConsoleNotificationGroupRequest'>['notificationType']}
const kinds=['MEMBER','EMAIL','SMS','VOICE','WECOM_ROBOT','DINGTALK_ROBOT','FEISHU_ROBOT','WEBHOOK'] as const satisfies NonNullable<NotificationGroupIdentity['notificationType']>[]
const channels=['EMAIL','WECHAT','SMS','VOICE'] as const
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const record=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('通知组资料不完整，请重新读取');return value as Record<string,unknown>}
const version=(value:unknown):number=>{if(typeof value!=='number'||!Number.isInteger(value)||value<0||value>2147483647)throw new Error('通知配置版本不完整，请重新读取');return value}
/** 沿正式OAS3.1真null合同校验，空recipient绝不决定明确方式。 */
export function notificationGroupIdentity(value:unknown,groupId:string):NotificationGroupIdentity {
 const row=record(value);if(row.groupId!==groupId||typeof row.configured!=='boolean')throw new Error('通知组配置身份不匹配')
 if(!row.configured){if(row.notificationType!==null||row.configurationVersion!==null)throw new Error('未配置通知组身份不一致');return {groupId,configured:false,notificationType:null,configurationVersion:null}}
 if(typeof row.notificationType!=='string'||!kinds.includes(row.notificationType as typeof kinds[number]))throw new Error('通知方式资料不完整')
 return {groupId,configured:true,notificationType:row.notificationType as NonNullable<NotificationGroupIdentity['notificationType']>,configurationVersion:version(row.configurationVersion)}
}
/** 管理快照保留全部号码；不先截成10个短信或第一条电话再假装读取完整。 */
export function ordinaryGroupOptions(value:unknown):OrdinaryGroupOptions {
 const row=record(value);if(!['MEMBER','EMAIL','SMS','VOICE'].includes(String(row.notificationType))||!Array.isArray(row.members)||!Array.isArray(row.numbers)||row.members.length>1000||row.numbers.length>1000)throw new Error('普通通知方式快照不完整')
 const seen=new Set<string>(),members:NonNullable<Schema<'ConsoleNotificationGroupOptionsResponse'>['members']>=row.members.map(value=>{
  const item=record(value);if(typeof item.accountId!=='string'||!uuid.test(item.accountId)||seen.has(item.accountId)||!Array.isArray(item.channels)||!item.channels.length||item.channels.length>4||new Set(item.channels).size!==item.channels.length||item.channels.some(value=>!channels.includes(value as typeof channels[number])))throw new Error('成员通知快照不完整')
  seen.add(item.accountId);return {accountId:item.accountId,channels:item.channels as typeof channels[number][]}
 })
 if(row.numbers.some(value=>typeof value!=='string'||!/^\+?[0-9]{5,20}$/.test(value))||new Set(row.numbers).size!==row.numbers.length)throw new Error('通知号码快照不完整')
 if(row.notificationType==='MEMBER'&&(row.numbers.length||!members.length)||row.notificationType==='EMAIL'&&(row.numbers.length||members.length)||['SMS','VOICE'].includes(String(row.notificationType))&&(members.length||!row.numbers.length))throw new Error('通知方式与选项不一致')
 return {notificationType:row.notificationType as OrdinaryGroupOptions['notificationType'],version:version(row.version),members,numbers:row.numbers as string[]}
}
/** 公读只接受正式白名单；完整保留脱敏列表，禁止原号码或跨组身份进入视图。 */
export function publicOrdinaryGroupOptions(value:unknown,groupId:string):PublicOrdinaryGroupOptions {
 const row=record(value)
 if(row.groupId!==groupId||!['MEMBER','EMAIL','SMS','VOICE'].includes(String(row.notificationType))||!Array.isArray(row.members)||!Array.isArray(row.maskedNumbers)||row.members.length>1000||row.maskedNumbers.length>1000)throw new Error('公开通知方式快照不完整')
 const seen=new Set<string>(),members:PublicOrdinaryGroupOptions['members']=row.members.map(value=>{
  const item=record(value)
  if(typeof item.accountId!=='string'||!uuid.test(item.accountId)||seen.has(item.accountId)||!Array.isArray(item.channels)||!item.channels.length||item.channels.length>4||new Set(item.channels).size!==item.channels.length||item.channels.some(value=>!channels.includes(value as typeof channels[number])))throw new Error('公开成员通知快照不完整')
  seen.add(item.accountId);return {accountId:item.accountId,channels:[...item.channels] as typeof channels[number][]}
 })
 if(row.maskedNumbers.some(number=>typeof number!=='string'||!/^\+?[0-9]+\*{4}[0-9]+$/.test(number)))throw new Error('公开通知号码必须完整脱敏')
 if(row.notificationType==='MEMBER'&&(!members.length||row.maskedNumbers.length)||row.notificationType==='EMAIL'&&(members.length||row.maskedNumbers.length)||['SMS','VOICE'].includes(String(row.notificationType))&&(members.length||!row.maskedNumbers.length))throw new Error('公开通知方式与选项不一致')
 return {groupId,notificationType:row.notificationType as PublicOrdinaryGroupOptions['notificationType'],configurationVersion:version(row.configurationVersion),members,maskedNumbers:[...row.maskedNumbers] as string[]}
}
/** 只转换原站可完整呈现的形状，宽旧记录报错而非丢号码。 */
export function ordinaryGroupView(value:OrdinaryGroupOptions):NotificationOrdinaryOptions {
 if(!['MEMBER','SMS','VOICE'].includes(value.notificationType))throw new Error('请使用对应通知方式编辑器')
 if(value.notificationType==='SMS'&&value.numbers.length>10||value.notificationType==='VOICE'&&value.numbers.length!==1)throw new Error('当前完整号码配置超过原站编辑范围，请核对后再修改')
 const mode=value.notificationType.toLowerCase() as NotificationOrdinaryOptions['mode']
 return {mode,configurationVersion:value.version,memberChannels:Object.fromEntries(value.members.map(member=>[member.accountId!,[...member.channels!]])),smsText:mode==='sms'?value.numbers.map(number=>/^\+861[3-9][0-9]{9}$/.test(number)?number.slice(3):number).join('\n'):'',voiceNumber:mode==='voice'?value.numbers[0]:'',voicePlatform:'aliyun'}
}
export function isOrdinaryCreationDraft(value:NotificationGroupDraft):value is OrdinaryCreationDraft{return ['member','email','sms','voice'].includes(value.mode)}
/** 请求对象直接取唯一生成Schema；未完成秘密方式不投影成普通入口。 */
export function ordinaryGroupCreationRequest(draft:OrdinaryCreationDraft,members:NotificationGroupMemberChoice[]):Schema<'CreateConsoleNotificationGroupRequest'> {
 const error=notificationGroupDraftError(draft,members);if(error)throw new Error(error)
 const body:Schema<'CreateConsoleNotificationGroupRequest'>={name:draft.name.trim(),description:draft.description,notificationType:draft.mode}
 if(draft.mode==='member')body.members=Object.entries(draft.memberChannels).filter(([,channels])=>channels.length).map(([accountId,channels])=>({accountId,channels:[...channels]}))
 else if(draft.mode==='email')body.emails=notificationTargetLines(draft.emailsText)
 else body.numbers=draft.mode==='sms'?notificationSmsTargets(draft.smsText):[draft.voiceNumber.trim()]
 return body
}
export function ordinaryGroupOptionsRequest(value:NotificationOrdinaryOptions,members:NotificationGroupMemberChoice[]):Schema<'SaveConsoleNotificationGroupOptionsRequest'> {
 version(value.configurationVersion);const draft={...emptyNotificationGroupDraft(value.mode),...value,name:'通知组'},error=notificationGroupDraftError(draft,members);if(error)throw new Error(error)
 const body:Schema<'SaveConsoleNotificationGroupOptionsRequest'>={notificationType:value.mode,version:value.configurationVersion}
 if(value.mode==='member')body.members=Object.entries(value.memberChannels).filter(([,channels])=>channels.length).map(([accountId,channels])=>({accountId,channels:[...channels]}))
 else body.numbers=value.mode==='sms'?notificationSmsTargets(value.smsText):[value.voiceNumber.trim()]
 return body
}
/** 创建回执必须给真实组和独立version0，不用缺省值填出成功。 */
export function configuredGroupCreated(value:unknown,kind:Schema<'CreateConsoleNotificationGroupRequest'>['notificationType']):Group {
 const row=record(value),group=record(row.group)
 if(row.notificationType!==kind.toUpperCase()||version(row.configurationVersion)!==0||typeof group.id!=='string'||!uuid.test(group.id)||typeof group.name!=='string'||typeof group.enabled!=='boolean')throw new Error('新通知组回执不完整')
 versionOf(group);return group as Group
}
/** 正式联系事实的AVAILABLE才可选择；未知不推断，读快照不代替保存或外发重验。 */
export function notificationMemberChoices(value:Schema<'ConsoleNotificationMemberChoiceResponse'>[]):NotificationGroupMemberChoice[] {
 if(!Array.isArray(value)||value.length>1000)throw new Error('项目成员目录不完整')
 const seen=new Set<string>()
 const fields={EMAIL:'email',WECHAT:'wechat',SMS:'sms',VOICE:'voice'} as const satisfies Record<typeof channels[number],keyof Schema<'ConsoleNotificationMemberChannels'>>
 return value.map(value=>{
  const item=record(value),facts=record(item.channels)
  if(typeof item.accountId!=='string'||!uuid.test(item.accountId)||seen.has(item.accountId)||(item.email!==null&&typeof item.email!=='string')||(item.displayName!==null&&typeof item.displayName!=='string')||Object.values(fields).some(key=>typeof facts[key]!=='string'||!['AVAILABLE','UNAVAILABLE','UNKNOWN'].includes(facts[key] as string))||facts.email==='AVAILABLE'&&(typeof item.email!=='string'||!item.email.trim()))throw new Error('项目成员联系事实不完整')
  seen.add(item.accountId)
  return {accountId:item.accountId,email:(item.email as string|null)||(item.displayName as string|null)||item.accountId,availableChannels:channels.filter(channel=>facts[fields[channel]]==='AVAILABLE')}
 })
}
