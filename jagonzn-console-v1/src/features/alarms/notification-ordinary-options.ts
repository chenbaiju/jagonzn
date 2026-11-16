import type { MemberChannelChoice, NotificationGroupCreationContext } from './notification-group-draft'
/** 仅供未登记编辑器使用的视图状态；不是HTTP DTO或手写生成合同。 */
export type NotificationOrdinaryMode='member'|'sms'|'voice'
export type NotificationOrdinaryOptions={mode:NotificationOrdinaryMode;configurationVersion:number;memberChannels:Record<string,MemberChannelChoice[]>;smsText:string;voiceNumber:string;voicePlatform:'aliyun'}
export type NotificationOrdinaryEditContext=NotificationGroupCreationContext&{groupId:string}
export function copyOrdinaryOptions(value:NotificationOrdinaryOptions):NotificationOrdinaryOptions{return {...value,memberChannels:Object.fromEntries(Object.entries(value.memberChannels).map(([id,channels])=>[id,[...channels]]))}}
