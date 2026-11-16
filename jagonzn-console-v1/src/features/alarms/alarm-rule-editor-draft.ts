import {AlarmRuleJsonNumber} from './alarm-rule-json'
import {alarmRuleConfiguration,type AlarmRuleConfiguration,type AlarmRuleTerm,type AlarmRuleValue,type ConfiguredAlarmRule,type CreateConfiguredAlarmRule} from './alarm-rule-management-api'
import {ExactDecimal} from '../rules/preprocess-exact-json'
/** 表单展示资料，由宿主提供当前已发布模型；不是HTTP传输结构或运行授权。 */
export type AlarmRulePropertyChoice={key:string;label:string;dataType:'NUMBER'|'SWITCH'|'TEXT'|'ENUM'|'LIST'|'OBJECT'}
export type AlarmRuleEditorChoice={id:string;label:string}
export type AlarmRuleEditorChoices={projectId:string;source:AlarmRuleConfiguration['source'];sources:AlarmRuleEditorChoice[];properties:AlarmRulePropertyChoice[];groups:AlarmRuleEditorChoice[];applications:AlarmRuleEditorChoice[]}
export type AlarmRuleTermDraft={join:'AND'|'OR';key:string;operator:AlarmRuleTerm['operator'];value:string;upper:string}
export type AlarmRuleEditorDraft={name:string;enabled:boolean;configuration:Omit<AlarmRuleConfiguration,'expression'>;terms:AlarmRuleTermDraft[]}
export type AlarmRuleEditContext={projectId:string;ruleId?:string;version?:number;identityEpoch:number}
const labels:Record<AlarmRuleTerm['operator'],string>={EQ:'等于',NE:'不等于',GT:'大于',GTE:'大于等于',LT:'小于',LTE:'小于等于',BETWEEN:'在范围内',NOT_BETWEEN:'不在范围内',INCLUDES:'包含',NOT_INCLUDES:'不包含',KEY_EXISTS:'存在键名',KEY_NOT_EXISTS:'不存在键名',STALE_FOR:'最后更新时间超过'}
export function alarmRuleOperators(type:AlarmRulePropertyChoice['dataType']|undefined,inactivity:boolean):{value:AlarmRuleTerm['operator'];label:string}[]{
 const keys:AlarmRuleTerm['operator'][]=inactivity?['STALE_FOR']:type==='NUMBER'?['GT','GTE','LT','LTE','EQ','NE','BETWEEN','NOT_BETWEEN']:type==='SWITCH'?['EQ']:type==='TEXT'||type==='ENUM'?['EQ','NE']:type==='LIST'?['INCLUDES','NOT_INCLUDES']:type==='OBJECT'?['KEY_EXISTS','KEY_NOT_EXISTS']:[]
 return keys.map(value=>({value,label:labels[value]}))
}
export const alarmRuleDurations=[{value:0,label:'无'},...[10,30,60,180,300,600,1800,3600,5400,7200].map(value=>({value,label:value<60?`${value}秒`:`${value/60}分钟`}))]
/** Source静态3天值8640的单位未证；此处明确按域秒数保存真实3天，不复制未证单位。 */
export const alarmRuleInactiveDurations=[300,600,1200,1800,3600,7200,10800,21600,43200,86400,259200].map(value=>({value:String(value),label:value<3600?`${value/60}分钟`:value<86400?`${value/3600}小时`:`${value/86400}天`}))
function valueText(value:AlarmRuleValue):string{
 if(value.kind==='ATTRIBUTE')return `{${value.key}}`
 if(!(value.value instanceof AlarmRuleJsonNumber))return String(value.value)
 const {raw}=value.value
 if(!/[eE]/.test(raw))return raw
 try {
  const expanded=new ExactDecimal(raw).expanded()
  // 展开后的表单值仍须满足原有数值词法长度限制。
  return expanded.length<=1000?expanded:raw
 } catch {return raw}
}
/** 新开表单显式安全初值，避免继承前一次用户通知/页签；不宣称Source未定义旗标原本为false。 */
export function newAlarmRuleDraft(kind:AlarmRuleConfiguration['source']['kind']='DEVICE'):AlarmRuleEditorDraft{
 return {name:'',enabled:true,configuration:{schemaVersion:2,source:{kind,ids:[]},triggerKind:'ATTRIBUTES',repeatCount:0,durationSeconds:0,schedule:{enabled:false,halfHourSlots:Array.from({length:48},(_,i)=>i),recoveryOutsideAllowed:false},level:'NORMAL',remark:'',recovery:{manualClearAllowed:false,customerClearAllowed:false,customerDisableAllowed:false},notifications:{groupIds:[],customerChannels:[],dailyLimit:0,perDeviceDailyLimit:0,customerSmsQuotaRequired:false,customerVoiceQuotaRequired:false,wechatClickAction:'NONE'}},terms:[]}
}
export function editAlarmRuleDraft(rule:ConfiguredAlarmRule):AlarmRuleEditorDraft{
 const config=alarmRuleConfiguration(rule.configuration),{expression,...configuration}=config
 return {name:rule.name,enabled:rule.enabled,configuration,terms:expression.terms.map(term=>({join:term.join??'AND',key:term.key,operator:term.operator,value:term.operator==='STALE_FOR'&&term.value.kind==='CONSTANT'&&term.value.value instanceof AlarmRuleJsonNumber?String(Number(term.value.value.raw)):valueText(term.value),upper:term.upper?valueText(term.upper):''}))}
}
export function blankAlarmRuleTerm():AlarmRuleTermDraft{return {join:'AND',key:'',operator:'GT',value:'',upper:''}}
export function changeAlarmRuleTermProperty(term:AlarmRuleTermDraft,property:AlarmRulePropertyChoice|undefined,inactivity:boolean){term.key=property?.key??'';term.operator=alarmRuleOperators(property?.dataType,inactivity)[0]?.value??'GT';term.value='';term.upper=''}
function scalar(raw:string,type:AlarmRulePropertyChoice['dataType'],properties:AlarmRulePropertyChoice[]):AlarmRuleValue{
 if(type==='NUMBER'){
  const value=raw.trim(),reference=/^\{([A-Za-z0-9_-]{1,64})\}$/.exec(value)
  if(reference){if(!properties.some(p=>p.key===reference[1]&&p.dataType==='NUMBER'))throw new Error('动态属性必须为当前设备源的数值属性');return {kind:'ATTRIBUTE',key:reference[1]!}}
  try{return {kind:'CONSTANT',value:new AlarmRuleJsonNumber(value)}}catch{throw new Error('请填写正确的数值或动态属性')}
 }
 if(type==='SWITCH'){if(raw!=='true'&&raw!=='false')throw new Error('请选择开关值');return {kind:'CONSTANT',value:raw==='true'}}
 if(!raw.length)throw new Error('请填写正确的触发条件')
 return {kind:'CONSTANT',value:raw}
}
/** 表单最多10条；完整定义仍经正式消费者校验，隐藏的通知/解除子值原样保留。 */
export function alarmRuleDraftRequest(draft:AlarmRuleEditorDraft,properties:AlarmRulePropertyChoice[]):CreateConfiguredAlarmRule{
 if(!draft.name.trim()||draft.name.length>128)throw new Error('请填写规则名称')
 if(!draft.configuration.source.ids.length)throw new Error('请选择设备源')
 if(!draft.terms.length)throw new Error('请设置触发条件')
 if(draft.terms.length>10)throw new Error('触发条件数量达到上限，请调整为最多10条')
 if(draft.configuration.schedule.enabled&&!draft.configuration.schedule.halfHourSlots.length)throw new Error('请选择有效时段')
 const inactivity=draft.configuration.triggerKind==='INACTIVITY'
 const terms=draft.terms.map((term,index):AlarmRuleTerm=>{
  const property=properties.find(value=>value.key===term.key)
  if(!property||!alarmRuleOperators(property.dataType,inactivity).some(value=>value.value===term.operator))throw new Error('当前设备源属性或操作符已变更，请核对触发条件')
  const result:AlarmRuleTerm={key:term.key,operator:term.operator,value:inactivity?{kind:'CONSTANT',value:new AlarmRuleJsonNumber(term.value)}:scalar(term.value,property.dataType,properties)}
  if(index)result.join=term.join
  if(term.operator==='BETWEEN'||term.operator==='NOT_BETWEEN')result.upper=scalar(term.upper,property.dataType,properties)
  return result
 })
 const configuration=alarmRuleConfiguration({...draft.configuration,repeatCount:inactivity?0:draft.configuration.repeatCount,durationSeconds:inactivity?0:draft.configuration.durationSeconds,expression:{terms}})
 if(configuration.notifications.dailyLimit>10000||configuration.notifications.perDeviceDailyLimit>10000)throw new Error('每日通知次数上限为0至10000')
 return {name:draft.name,enabled:draft.enabled,configuration}
}
