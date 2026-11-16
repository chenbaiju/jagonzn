/** 创建表单本地状态；不是HTTP DTO，实际保存适配必须使用唯一生成合同。 */
export type NotificationGroupMode = 'member'|'email'|'sms'|'voice'|'qywx_robot'|'dingding_robot'|'feishu_robot'|'webhook'
export type MemberChannelChoice = 'EMAIL'|'WECHAT'|'SMS'|'VOICE'
export type RobotMode = 'qywx_robot'|'dingding_robot'|'feishu_robot'
export type NotificationGroupMemberChoice = {accountId:string;email:string;availableChannels:MemberChannelChoice[]}
export type NotificationGroupCreationContext = {projectId:string;identityEpoch:number}
export type NotificationGroupDraft = {
 name:string;description:string;mode:NotificationGroupMode;memberChannels:Record<string,MemberChannelChoice[]>;
 emailsText:string;smsText:string;voiceNumber:string;voicePlatform:'aliyun';robotUrls:Record<RobotMode,string>;
 webhookUrl:string;headers:{name:string;value:string}[];customBody:boolean;bodyFunctionSource:string
}
export const notificationGroupModes:{value:NotificationGroupMode;label:string}[]=[
 {value:'member',label:'成员通知'},{value:'email',label:'邮箱通知'},{value:'sms',label:'短信通知'},
 {value:'voice',label:'电话通知'},{value:'qywx_robot',label:'企业微信群机器人'},
 {value:'dingding_robot',label:'钉钉群机器人'},{value:'feishu_robot',label:'飞书群机器人'},{value:'webhook',label:'Webhook'}]
export const memberChannelChoices:{value:MemberChannelChoice;label:string;help?:string}[]=[{value:'EMAIL',label:'邮件通知'},{value:'WECHAT',label:'微信公众号通知',help:'用户需绑定微信'},{value:'SMS',label:'短信通知',help:'用户需绑定手机号'},{value:'VOICE',label:'电话通知',help:'用户需绑定手机号'}]
export function emptyNotificationGroupDraft(mode:NotificationGroupMode='member',bodyFunctionSource=''):NotificationGroupDraft {
 return {name:'',description:'',mode,memberChannels:{},emailsText:'',smsText:'',voiceNumber:'',voicePlatform:'aliyun',robotUrls:{qywx_robot:'',dingding_robot:'',feishu_robot:''},webhookUrl:'',headers:[],customBody:false,bodyFunctionSource}
}
export function copyNotificationGroupDraft(value:NotificationGroupDraft):NotificationGroupDraft {
 return {...value,memberChannels:Object.fromEntries(Object.entries(value.memberChannels).map(([id,channels])=>[id,[...channels]])),robotUrls:{...value.robotUrls},headers:value.headers.map(row=>({...row}))}
}
export const notificationTargetLines=(text:string)=>text.split(/\r?\n/).map(value=>value.trim()).filter(Boolean)
export const notificationSmsTargets=(text:string)=>[...new Set(notificationTargetLines(text))]
/** 仅作表单反馈，不代替服务端的项目/成员/秘密/函数/外发许可校验。 */
export function notificationGroupDraftError(draft:NotificationGroupDraft,members:NotificationGroupMemberChoice[]):string|undefined {
 if(!draft.name.trim()||draft.name.trim().length>64)return '请填写1～64个字符的通知组名称'
 if(draft.description.length>2048)return '通知组描述最多2048个字符'
 if(draft.mode==='member') {
  const selected=Object.entries(draft.memberChannels).filter(([,channels])=>channels.length)
  if(!selected.length)return '请选择成员通知方式'
  for(const [id,channels] of selected){const member=members.find(row=>row.accountId===id);if(!member||channels.some(channel=>!member.availableChannels.includes(channel)))return '成员或可用通知方式已变化，请重新核对'}
 } else if(draft.mode==='email') {
  const emails=notificationTargetLines(draft.emailsText)
  if(!emails.length||emails.length>1000||new Set(emails).size!==emails.length||emails.some(email=>email.includes('***')||email.length>2048||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return '请填写有效且不重复的邮箱，每行一个'
 } else if(draft.mode==='sms') {
  const numbers=notificationSmsTargets(draft.smsText)
  if(!numbers.length||numbers.length>10||numbers.some(number=>!/^1[3-9][0-9]{9}$/.test(number)))return '请填写正确的手机号，最多10个，每行一个'
 } else if(draft.mode==='voice') {
  if(!/^\+?[0-9]{5,20}$/.test(draft.voiceNumber.trim().replace(/[ -]/g,''))||/[\r\n]/.test(draft.voiceNumber))return '请填写正确的被叫号码'
  if(draft.voicePlatform!=='aliyun')return '请选择集成语音服务'
 } else {
  const raw=draft.mode==='webhook'?draft.webhookUrl:draft.robotUrls[draft.mode]
  try {const url=new URL(raw);if(url.protocol!=='https:'||!url.hostname||url.username||url.password)throw new Error()}catch{return '请填写有效的HTTPS URL'}
  if(draft.mode==='webhook') {
   const names=new Set<string>()
   for(const header of draft.headers){if(!header.name&&!header.value)continue;const name=header.name.toLowerCase();if(!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(header.name)||/[\r\n]/.test(header.value)||names.has(name))return '请核对HTTP请求头名称、值和重复项';names.add(name)}
   if(draft.customBody&&!draft.bodyFunctionSource.trim())return '请填写正文函数'
  }
 }
 return undefined
}
