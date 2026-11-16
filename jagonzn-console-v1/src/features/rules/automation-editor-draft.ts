import {automationMixedConfig} from './automation-mixed-triggers'
import type {Schema} from '@/core/contracts'
import {cas} from './models'
import {sourceRuleTagInputValue,sourceRuleTagRows,ruleTagsValue,type RuleTagDraft} from './rule-tag-draft'
import {definitionUuid} from './device-task-definition-port'
import {ExactDecimal,compareDecimal,parsePreprocessJson,writePreprocessJson,validUnicode,type ExactJson} from './preprocess-exact-json'
/** 只替换生成合同中的数字内存表示；运输仍为JSON数值token，不复制公用DTO字段。 */
export type ExactNumbers<T>=T extends number?T|ExactDecimal:T extends readonly(infer V)[]?ExactNumbers<V>[]:T extends object?{[K in keyof T]:ExactNumbers<T[K]>}:T
export type AutomationNode=Schema<'AutomationNodeRequest'>
export type AutomationTriggerConfig=ExactNumbers<Schema<'CreateAutomationRequest'>['triggerConfig']>
export type AutomationBody=Omit<Schema<'CreateAutomationRequest'>,'triggerConfig'|'conditions'|'actions'>&{triggerConfig:AutomationTriggerConfig;conditions:AutomationNode[];actions:AutomationNode[]}
export type AutomationVersion=Omit<Schema<'AutomationVersionView'>,'triggerConfig'|'conditions'|'actions'>&{triggerConfig:AutomationTriggerConfig;conditions:AutomationNode[];actions:AutomationNode[]}
type Predicate=NonNullable<Extract<AutomationTriggerConfig,{propertyPredicate?:unknown}>['propertyPredicate']>
export type AutomationPredicateCondition=Predicate['conditions'][number]
export type AutomationOperator=AutomationPredicateCondition['operator']
export type AutomationDraft={tags:RuleTagDraft[];name:string;description:string;enabled:boolean;triggerType?:Schema<'CreateAutomationRequest'>['triggerType'];triggerConfig?:AutomationTriggerConfig;conditions:AutomationNode[];actions:{key:string;node:AutomationNode}[];originalName?:string;originalDescription?:string}
export const automationPropertyNode='automation-device-property-set-action'
export const automationCloudNode='automation-device-cloud-update-action'
export const automationCloudTransformNode='automation-device-cloud-transform-action'
export type AutomationCloudOperation={propertyKey:string;op:'toggle'|'clear'}|{propertyKey:string;op:'set'|'inc'|'dec'|'inc_pct'|'dec_pct';value:ExactJson}
export const automationCloudOperationLabels={set:'设置为',inc:'增加',dec:'减少',inc_pct:'增加%',dec_pct:'减少%',toggle:'切换',clear:'清空'} as const
export const automationDeviceConditionNode='automation-device-property-condition'
export type AutomationRangeOperator='IN_RANGE'|'OUT_RANGE'
export type AutomationRangeCondition={propertyKey:string;operator:AutomationRangeOperator;value:{min:number|ExactDecimal;max:number|ExactDecimal}}
/** CURRENT范围是本方显式配置2，不扩共享REPORT谓词。 */
export type AutomationCurrentCondition=AutomationPredicateCondition|AutomationRangeCondition
export type AutomationCurrentOperator=AutomationOperator|AutomationRangeOperator
export type AutomationDeviceCondition={schemaVersion?:2;enabled:boolean;deviceId:string;relation:'ALL'|'ANY';conditions:AutomationCurrentCondition[]}
export const automationCurrentOperatorLabels={EQ:'等于',NE:'不等于',GT:'大于',GTE:'大于等于',LT:'小于',LTE:'小于等于',IN_RANGE:'在范围内',OUT_RANGE:'不在范围内'} as const
export function automationRangeCondition(value:AutomationCurrentCondition):value is AutomationRangeCondition{return value.operator==='IN_RANGE'||value.operator==='OUT_RANGE'}
export function automationCurrentConditionText(condition:AutomationCurrentCondition):string{
 const text=(value:unknown)=>{if(value instanceof ExactDecimal){try{return value.expanded()}catch{return value.canonical()}}return typeof value==='string'?value:writePreprocessJson(value as ExactJson)}
 return automationRangeCondition(condition)?`${condition.propertyKey} ${condition.operator==='IN_RANGE'?'在':'不在'} ${text(condition.value.min)} 到 ${text(condition.value.max)} 范围内`:`${condition.propertyKey} ${automationCurrentOperatorLabels[condition.operator]} ${text(condition.value)}`
}
export const automationConditionPresentation={label:'设备属性条件',description:'检查设备的属性值是否满足条件。',glyph:String.fromCodePoint(0xf0ea2),background:'#e8f5e9',color:'#2e7d32'} as const
export const automationAlarmConditionNode='automation-device-alarm-state-condition'
export type AutomationAlarmCondition={enabled:boolean;deviceId:string;alarmRuleId:string;alarmState:'alerting'|'ok'}
export const automationAlarmConditionPresentation={label:'设备告警状态',description:'检查设备的告警规则当前状态是否满足条件。',glyph:String.fromCodePoint(0xf0ecd),background:'#ffebee',color:'#c62828'} as const
export function automationAlarmCondition(node:AutomationNode):AutomationAlarmCondition|undefined{
 const c=node.config,uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v)
 if(node.nodeType!==automationAlarmConditionNode||!automationObject(c)||Object.keys(c).sort().join(',')!=='alarmRuleId,alarmState,deviceId,enabled,schemaVersion'||!(c.schemaVersion===1||c.schemaVersion instanceof ExactDecimal&&c.schemaVersion.literal==='1')||typeof c.enabled!=='boolean'||!uuid(c.deviceId)||!uuid(c.alarmRuleId)||c.alarmState!=='alerting'&&c.alarmState!=='ok')return
 return {enabled:c.enabled,deviceId:c.deviceId,alarmRuleId:c.alarmRuleId,alarmState:c.alarmState}
}
export function automationAlarmConditionAction(value:AutomationAlarmCondition):AutomationNode{const node:AutomationNode={nodeType:automationAlarmConditionNode,config:{schemaVersion:1,...value}};if(!automationAlarmCondition(node))throw new Error('请完善设备告警状态条件配置');return node}
export function automationAlarmConditionSummary(value:AutomationAlarmCondition,deviceName?:string,ruleName?:string):string{return `${deviceName||value.deviceId} · ${ruleName||value.alarmRuleId} · 状态=${value.alarmState==='alerting'?'告警中':'正常'}`}
export const automationTimeConditionNode='automation-time-range-condition'
export type AutomationTimeCondition={enabled:boolean;timeRanges:{start:string;end:string}[];repeatType:'DAILY'|'WEEKLY'|'MONTHLY';weekDays:number[];monthDays:number[]}
export const automationTimeConditionPresentation={label:'时间范围',description:'限制在特定时间段内执行，支持设置多个时间段。',glyph:String.fromCodePoint(0xf144e),background:'#e3f2fd',color:'#1565c0'} as const
const automationWeekLabels=['周日','周一','周二','周三','周四','周五','周六'] as const
export const automationWeekOptions=automationWeekLabels.map((label,index)=>({value:index||7,label}))
/** 只解释新时间条件的闭集；未知旧条件仍由原完整版本运输。 */
export function automationTimeCondition(node:AutomationNode):AutomationTimeCondition|undefined{
 const c=node.config
 const exactInteger=(v:unknown,min:number,max:number)=>{const text=v instanceof ExactDecimal?v.literal:typeof v==='number'&&Number.isInteger(v)?String(v):'';return /^[0-9]+$/.test(text)&&Number(text)>=min&&Number(text)<=max?Number(text):undefined}
 const days=(v:unknown,max:number):v is (number|ExactDecimal)[]=>Array.isArray(v)&&v.length<=max&&v.every(x=>exactInteger(x,1,max)!==undefined)&&new Set(v.map(x=>exactInteger(x,1,max))).size===v.length
 if(node.nodeType!==automationTimeConditionNode||!automationObject(c)||Object.keys(c).sort().join(',')!=='enabled,monthDays,repeatType,schemaVersion,timeRanges,weekDays'||exactInteger(c.schemaVersion,1,1)!==1||typeof c.enabled!=='boolean'||typeof c.repeatType!=='string'||!['DAILY','WEEKLY','MONTHLY'].includes(c.repeatType)||!Array.isArray(c.timeRanges)||c.timeRanges.length<1||c.timeRanges.length>10||!days(c.weekDays,7)||!days(c.monthDays,31))return
 for(const range of c.timeRanges)if(!automationObject(range)||Object.keys(range).sort().join(',')!=='end,start'||typeof range.start!=='string'||typeof range.end!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(range.start)||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(range.end))return
 if(c.repeatType==='DAILY'&&(c.weekDays.length||c.monthDays.length)||c.repeatType==='WEEKLY'&&(!c.weekDays.length||c.monthDays.length)||c.repeatType==='MONTHLY'&&(!c.monthDays.length||c.weekDays.length))return
 return {enabled:c.enabled,timeRanges:c.timeRanges.map(range=>({start:String(range.start),end:String(range.end)})),repeatType:c.repeatType as AutomationTimeCondition['repeatType'],weekDays:c.weekDays.map(v=>exactInteger(v,1,7)!),monthDays:c.monthDays.map(v=>exactInteger(v,1,31)!)}
}
export function automationTimeConditionAction(value:AutomationTimeCondition):AutomationNode{
 const node:AutomationNode={nodeType:automationTimeConditionNode,config:{schemaVersion:1,...cloneAutomationValue(value)}}
 if(!automationTimeCondition(node))throw new Error('请完善时间范围条件配置')
 return node
}
export function automationTimeConditionSummary(value:AutomationTimeCondition):string{return value.timeRanges.map(range=>`${range.start}-${range.end}`).join(' 或 ')}
export const automationTriggerPresentation={label:'设备属性变化',description:'设备属性值变化时触发，支持多条件组合',glyph:String.fromCodePoint(0xf0535),background:'#e8f5e9',color:'#2e7d32'} as const
export const automationActionPresentation={label:'下发属性',description:'向设备下发属性，支持单属性或多属性组合下发。',glyph:String.fromCodePoint(0xf01da),background:'#e3f2fd',color:'#1e88e5'} as const
export const automationCloudPresentation={label:'更新属性',description:'更新设备的云端私有属性，支持单属性或多属性组合更新。',glyph:'󰳿',background:'#f3e5f5',color:'#8e24aa'} as const
export function automationActionStyle(node:AutomationNode){return node.nodeType===automationSceneNode?automationScenePresentation:node.nodeType===automationTaskNode?automationTaskPresentation:(node.nodeType===automationCloudNode||node.nodeType===automationCloudTransformNode)?automationCloudPresentation:automationActionPresentation}
export const automationOperatorLabels:Record<AutomationOperator,string>={EQ:'等于',NE:'不等于',GT:'大于',GTE:'大于等于',LT:'小于',LTE:'小于等于'}
export function automationObject(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&!(value instanceof ExactDecimal)}
export function cloneAutomationValue<T>(value:T):T{return parsePreprocessJson(writePreprocessJson(value as ExactJson),32768) as T}
export function automationNodes(value:unknown):AutomationNode[]{
 if(!Array.isArray(value)||value.length>1000||value.some(node=>!automationObject(node)||Object.keys(node).sort().join(',')!=='config,nodeType'||typeof node.nodeType!=='string'||!node.nodeType||!automationObject(node.config)))throw new Error('自动化完整操作或条件无法读取。')
 return cloneAutomationValue(value)
}
const integer=(value:unknown,expected:number)=>value instanceof ExactDecimal?value.canonical()===String(expected):value===expected
/** 与持久化数值预算一致，仅估算展开字节，不分配巨指数的小数文本。 */
function automationCurrentNumberBytes(value:unknown):bigint|undefined{
 try{const number=value instanceof ExactDecimal?value:typeof value==='number'&&Number.isFinite(value)?new ExactDecimal(JSON.stringify(value)):undefined;if(!number)return
  const point=BigInt(number.digits.length)+number.exponent,scale=number.exponent<0n?-number.exponent:0n,expanded=(point>1n?point:1n)+(scale>0n?1n+scale:0n)+(number.negative?1n:0n)
  if(point>131072n||scale>16383n||expanded>65536n)return
  return expanded
 }catch{return}
}
/** 共用纯比较叶形状；CURRENT键另依真实快照闭集校验，不窄化旧REPORT键语义。 */
function automationComparisonLeaves(value:unknown,current=false):value is AutomationPredicateCondition[]{
 if(!Array.isArray(value)||!value.length||value.length>32)return false
 for(const c of value){
  if(!automationObject(c)||Object.keys(c).sort().join(',')!=='operator,propertyKey,value'||typeof c.propertyKey!=='string'||!c.propertyKey.trim()||c.propertyKey!==c.propertyKey.trim()||[...c.propertyKey].length>64||/[\u0000-\u001f\u007f-\u009f]/u.test(c.propertyKey)||current&&!/^[A-Za-z0-9_-]{1,64}$/.test(c.propertyKey)||typeof c.operator!=='string'||!Object.hasOwn(automationOperatorLabels,c.operator))return false
  const n=c.value instanceof ExactDecimal||typeof c.value==='number'&&Number.isFinite(c.value)
  if(!n&&typeof c.value!=='string'&&typeof c.value!=='boolean'||!n&&!['EQ','NE'].includes(c.operator)||typeof c.value==='boolean'&&c.operator!=='EQ'||typeof c.value==='string'&&(c.value.includes('\0')||!validUnicode(c.value)))return false
  if(current&&n&&automationCurrentNumberBytes(c.value)===undefined)return false
 }
 return true
}
/** 复用原标量键和值预算；新范围两个端点分别精确校验，不接字符串或静默交换。 */
function automationCurrentLeaves(value:unknown,version:1|2):value is AutomationCurrentCondition[]{
 if(version===1)return automationComparisonLeaves(value,true)
 if(!Array.isArray(value)||!value.length||value.length>32)return false
 for(const leaf of value){
  if(automationObject(leaf)&&typeof leaf.operator==='string'&&['IN_RANGE','OUT_RANGE'].includes(leaf.operator)){
   if(Object.keys(leaf).sort().join(',')!=='operator,propertyKey,value'||!automationObject(leaf.value)||Object.keys(leaf.value).sort().join(',')!=='max,min')return false
   const bounds=leaf.value
   if(automationCurrentNumberBytes(bounds.min)===undefined||automationCurrentNumberBytes(bounds.max)===undefined||!automationComparisonLeaves([{propertyKey:leaf.propertyKey,operator:'EQ',value:bounds.min}],true)||!automationComparisonLeaves([{propertyKey:leaf.propertyKey,operator:'EQ',value:bounds.max}],true))return false
   const exact=(v:unknown)=>v instanceof ExactDecimal?v:new ExactDecimal(JSON.stringify(v))
   if(compareDecimal(exact(bounds.min),exact(bounds.max))>0)return false
  }else if(!automationComparisonLeaves([leaf],true))return false
 }
 return true
}
/** 显式当前设备条件；不借用触发payload、持续时间或客户端类型作为执行事实。 */
export function automationDeviceCondition(node:AutomationNode):AutomationDeviceCondition|undefined{
 const c=node.config
 if(node.nodeType!==automationDeviceConditionNode||!automationObject(c)||Object.keys(c).sort().join(',')!=='conditions,deviceId,enabled,relation,schemaVersion'||(!integer(c.schemaVersion,1)&&!integer(c.schemaVersion,2))||typeof c.enabled!=='boolean'||typeof c.deviceId!=='string'||!definitionUuid(c.deviceId)||typeof c.relation!=='string'||!['ALL','ANY'].includes(c.relation)||!automationCurrentLeaves(c.conditions,integer(c.schemaVersion,2)?2:1))return
 try{
  const encoder=new TextEncoder();let bytes=BigInt(encoder.encode(writePreprocessJson(c as unknown as ExactJson)).length)
  for(const leaf of c.conditions)for(const value of automationRangeCondition(leaf)?[leaf.value.min,leaf.value.max]:[leaf.value]){const expanded=automationCurrentNumberBytes(value);if(expanded!==undefined){const wire=BigInt(encoder.encode(writePreprocessJson(value as ExactJson)).length);if(expanded>wire)bytes+=expanded-wire}}
  if(bytes>65536n)return
 }catch{return}
 return {...(integer(c.schemaVersion,2)?{schemaVersion:2 as const}:{}),enabled:c.enabled,deviceId:c.deviceId,relation:c.relation as 'ALL'|'ANY',conditions:cloneAutomationValue(c.conditions)}
}
export function automationDeviceConditionAction(deviceId:string,enabled:boolean,relation:'ALL'|'ANY',conditions:AutomationCurrentCondition[],schemaVersion:1|2=1):AutomationNode{
 const version=schemaVersion===2||conditions.some(automationRangeCondition)?2:1
 const node:AutomationNode={nodeType:automationDeviceConditionNode,config:{schemaVersion:version,enabled,deviceId,relation,conditions:cloneAutomationValue(conditions)}}
 if(!automationDeviceCondition(node))throw new Error('请完善条件配置')
 return node
}
/** 属性卡从唯一正式合同衍生；新来源与旧REPORT保持各自明确版本。 */
type AutomationReportGroup=Exclude<Extract<AutomationTriggerConfig,{triggers:unknown}>,{timezoneMode:unknown}>
export type AutomationReportTrigger=AutomationReportGroup['triggers'][number]
export type AutomationChangedTrigger=Extract<AutomationReportTrigger,{sourceSelection:unknown}>
export type AutomationSourceSelection=AutomationChangedTrigger['sourceSelection']
export type AutomationPropertyTriggerValue=AutomationTriggerConfig|Omit<AutomationChangedTrigger,'enabled'>
export const automationSourceLabels={REPORT:'属性上报',PUSH:'属性下发',CLOUD:'云端更新'} as const
/** 触发卡摘要使用与弹窗一致的持续时间标签；0保持即时。 */
export function automationDurationLabel(seconds:number):string{
 if(seconds===0)return '即时'
 if(seconds%86400===0&&seconds>=86400)return `${seconds/86400}天`
 if(seconds%3600===0&&seconds>=3600)return `${seconds/3600}小时`
 if(seconds%60===0&&seconds>=60)return `${seconds/60}分钟`
 return `${seconds}秒`
}
/** 生成类型将整数声明为0|ExactDecimal；持续秒数只接受安全整数。 */
function automationDurationSeconds(value:unknown):number|undefined{
 if(value instanceof ExactDecimal){const number=Number(value.canonical());return Number.isSafeInteger(number)?number:undefined}
 return typeof value==='number'&&Number.isSafeInteger(value)?value:undefined
}
export function automationPropertySourceSelection(value:unknown):AutomationSourceSelection|undefined{
 if(!automationObject(value))return
 if(typeof value.sourceSelection==='string'&&['ALL','REPORT','PUSH','CLOUD'].includes(value.sourceSelection))return value.sourceSelection as AutomationSourceSelection
 if(typeof value.deviceId==='string'&&definitionUuid(value.deviceId)&&['deviceId','deviceId,propertyPredicate'].includes(Object.keys(value).sort().join(',')))return 'REPORT'
}
/** 新属性选项严格闭集，不把缺省REPORT变成ALL，也不接受未来未知来源。 */
function automationChangedOptions(value:unknown):value is Omit<AutomationChangedTrigger,'enabled'>{
 if(!automationObject(value)||!['deviceId,sourceSelection','deviceId,propertyPredicate,sourceSelection'].includes(Object.keys(value).sort().join(','))||typeof value.deviceId!=='string'||!definitionUuid(value.deviceId)||typeof value.sourceSelection!=='string'||!['ALL','REPORT','PUSH','CLOUD'].includes(value.sourceSelection))return false
 if(!Object.hasOwn(value,'propertyPredicate'))return true
 const p=value.propertyPredicate
 const selection=String(value.sourceSelection)
 if(!automationObject(p))return false
 const duration=automationDurationSeconds(p.durationSeconds)
 return Object.keys(p).sort().join(',')==='conditions,durationSeconds,relation,schemaVersion'&&integer(p.schemaVersion,2)&&duration!==undefined&&duration>=0&&duration<=86400&&(['ALL','REPORT'].includes(selection)||duration===0)&&['ALL','ANY'].includes(String(p.relation))&&automationComparisonLeaves(p.conditions)
}
/** 旧schema1和新schema2只解释已接通的即时四标量；普通读取不迁移原JSON。 */
export function automationPropertyTrigger(value:unknown):{deviceId:string;relation:Predicate['relation'];conditions:AutomationPredicateCondition[];durationSeconds:number}|undefined{
 if(automationObject(value)&&integer(value.schemaVersion,1)&&'triggers' in value){const rows=automationReportTriggers('PROPERTY_CHANGED',value);if(rows?.length===1)return automationPropertyTrigger(automationReportTriggerValue(rows[0]!));return}
 if(!automationObject(value)||typeof value.deviceId!=='string'||!definitionUuid(value.deviceId))return
 if(automationChangedOptions(value))return {deviceId:value.deviceId,relation:value.propertyPredicate?.relation??'ALL',conditions:cloneAutomationValue(value.propertyPredicate?.conditions??[]),durationSeconds:automationDurationSeconds(value.propertyPredicate?.durationSeconds)??0}
 if(Object.keys(value).sort().join(',')!=='deviceId,propertyPredicate'||!automationObject(value.propertyPredicate))return
 const p=value.propertyPredicate
 const duration=automationDurationSeconds(p.durationSeconds)
 if(Object.keys(p).sort().join(',')!=='conditions,durationSeconds,eventSource,relation,schemaVersion'||!integer(p.schemaVersion,1)||p.eventSource!=='REPORT'||duration===undefined||duration<0||duration>86400||!['ALL','ANY'].includes(String(p.relation))||!automationComparisonLeaves(p.conditions))return
 return {deviceId:value.deviceId,relation:p.relation as Predicate['relation'],conditions:cloneAutomationValue(p.conditions) as AutomationPredicateCondition[],durationSeconds:duration}
}
/** 旧REPORT编辑仍用原头，普通修改不会扩大来源；持续秒数0为原即时。 */
export function automationTriggerConfig(deviceId:string,relation:Predicate['relation'],conditions:AutomationPredicateCondition[],durationSeconds=0):AutomationTriggerConfig{
 if(!Number.isInteger(durationSeconds)||durationSeconds<0||durationSeconds>86400)throw new Error('持续时间必须是0至86400秒的整数')
 const config={deviceId,propertyPredicate:{schemaVersion:1 as const,eventSource:'REPORT' as const,durationSeconds,relation,conditions:cloneAutomationValue(conditions)}}
 if(!automationPropertyTrigger(config))throw new Error('请完善触发项配置')
 if(new TextEncoder().encode(writePreprocessJson(config as unknown as ExactJson)).length>65536)throw new Error('属性条件内容超过本次保存范围')
 return config as AutomationTriggerConfig
}
export function automationChangedTriggerValue(deviceId:string,sourceSelection:AutomationSourceSelection,relation:Predicate['relation'],conditions:AutomationPredicateCondition[],durationSeconds=0):Omit<AutomationChangedTrigger,'enabled'>{
 if(!Number.isInteger(durationSeconds)||durationSeconds<0||durationSeconds>86400)throw new Error('持续时间必须是0至86400秒的整数')
 if(!['ALL','REPORT'].includes(sourceSelection)&&durationSeconds!==0)throw new Error('只有属性上报来源支持持续时间')
 const value={deviceId,sourceSelection,...(conditions.length?{propertyPredicate:{schemaVersion:2 as const,durationSeconds,relation,conditions:cloneAutomationValue(conditions)}}:{})}
 if(!automationChangedOptions(value))throw new Error('请完善触发项配置')
 const bytes=automationReportConfigBytes(value);if(bytes===undefined||bytes>65536n)throw new Error('属性条件内容超过本次保存范围')
 return value as Omit<AutomationChangedTrigger,'enabled'>
}
export function automationTriggerRow(value:unknown,enabled:boolean):AutomationReportTrigger|undefined{
 if(typeof enabled!=='boolean')return
 if(automationChangedOptions(value))return {...cloneAutomationValue(value),enabled}
 const old=automationReportTriggers('PROPERTY_REPORTED',value);return old?.length===1?{...old[0]!,enabled}:undefined
}
export function automationChangedTrigger(row:AutomationReportTrigger):AutomationChangedTrigger{
 if('sourceSelection' in row)return cloneAutomationValue(row)
 const predicate=row.propertyPredicate
 return {enabled:row.enabled,...automationChangedTriggerValue(row.deviceId,'REPORT',predicate?.relation??'ALL',predicate?.conditions??[],automationDurationSeconds(predicate?.durationSeconds)??0)}
}
export function automationPropertyTriggerType(value:AutomationTriggerConfig):'PROPERTY_REPORTED'|'PROPERTY_CHANGED'{return automationObject(value)&&'schemaVersion' in value&&integer(value.schemaVersion,1)&&'triggers' in value?'PROPERTY_CHANGED':'PROPERTY_REPORTED'}
/** 仅配置2按后端PG标点和规范数值文本计量；不展开指数，也不改变旧配置1预算。 */
export function automationReportConfigBytes(value:unknown):bigint|undefined{
 if(typeof value==='string'){if(value.length>65536||value.includes('\0')||!validUnicode(value))return;return BigInt(new TextEncoder().encode(JSON.stringify(value)).length)}
 if(typeof value==='boolean')return value?4n:5n
 if(value instanceof ExactDecimal||typeof value==='number'){
  const expanded=automationCurrentNumberBytes(value);if(expanded===undefined)return
  const number=value instanceof ExactDecimal?value:new ExactDecimal(JSON.stringify(value)),precision=BigInt(number.digits.length),scale=-number.exponent,adjusted=precision-scale-1n
  if(scale>=0n&&adjusted>=-6n)return expanded
  const scientific=(number.negative?1n:0n)+precision+(precision>1n?1n:0n)+2n+BigInt((adjusted<0n?-adjusted:adjusted).toString().length)
  return expanded>scientific?expanded:scientific
 }
 if(Array.isArray(value)){
  let bytes=2n;for(let i=0;i<value.length;i++){const child=automationReportConfigBytes(value[i]);if(child===undefined)return;bytes+=child+(i?2n:0n);if(bytes>65536n)return}return bytes
 }
 if(automationObject(value)){
  let bytes=2n,index=0;for(const [key,item] of Object.entries(value)){const k=automationReportConfigBytes(key),child=automationReportConfigBytes(item);if(k===undefined||child===undefined)return;bytes+=k+2n+child+(index++?2n:0n);if(bytes>65536n)return}return bytes
 }
}
/** 旧单设备/PRED只映成可显示卡片，读取本身不改旧运输配置。 */
export function automationReportTriggers(triggerType:unknown,value:unknown):AutomationReportTrigger[]|undefined{
 if(triggerType==='PROPERTY_CHANGED'){
  if(!automationObject(value)||Object.keys(value).sort().join(',')!=='relation,schemaVersion,triggers'||!integer(value.schemaVersion,1)||value.relation!=='ANY'||!Array.isArray(value.triggers)||value.triggers.length<1||value.triggers.length>32)return
  for(const row of value.triggers){if(!automationObject(row)||typeof row.enabled!=='boolean')return;const {enabled:_enabled,...options}=row;if(!automationChangedOptions(options))return}
  const bytes=automationReportConfigBytes(value);if(bytes===undefined||bytes>65536n)return
  return cloneAutomationValue(value.triggers) as AutomationReportTrigger[]
 }
 if(triggerType!=='PROPERTY_REPORTED'||!automationObject(value))return
 if(typeof value.deviceId==='string'&&definitionUuid(value.deviceId)){
  if(Object.keys(value).join(',')==='deviceId')return [{enabled:true,deviceId:value.deviceId}]
  const old=automationPropertyTrigger(value);if(old)return [{enabled:true,deviceId:old.deviceId,propertyPredicate:cloneAutomationValue(value.propertyPredicate) as Predicate}]
  return
 }
 if(Object.keys(value).sort().join(',')!=='relation,schemaVersion,triggers'||!integer(value.schemaVersion,2)||value.relation!=='ANY'||!Array.isArray(value.triggers)||value.triggers.length<1||value.triggers.length>32)return
 try{
  for(const row of value.triggers){
   if(!automationObject(row)||!['deviceId,enabled','deviceId,enabled,propertyPredicate'].includes(Object.keys(row).sort().join(','))||typeof row.enabled!=='boolean'||typeof row.deviceId!=='string'||!definitionUuid(row.deviceId)||row.deviceId!==row.deviceId.toLowerCase())return
   if(Object.hasOwn(row,'propertyPredicate')){
    if(!automationPropertyTrigger({deviceId:row.deviceId,propertyPredicate:row.propertyPredicate}))return
   }
  }
  const bytes=automationReportConfigBytes(value);if(bytes===undefined||bytes>65536n)return
  return cloneAutomationValue(value.triggers) as AutomationReportTrigger[]
 }catch{return}
}
export function automationReportTriggerValue(row:AutomationReportTrigger):AutomationPropertyTriggerValue{return {deviceId:row.deviceId,...('sourceSelection' in row?{sourceSelection:row.sourceSelection}:{}),...(row.propertyPredicate===undefined?{}:{propertyPredicate:cloneAutomationValue(row.propertyPredicate)})} as AutomationPropertyTriggerValue}
/** 新来源整组明确升级，旧卡保持REPORT；只增删/启停旧REPORT不会自行迁移。 */
export function automationReportTriggerConfig(rows:AutomationReportTrigger[],previous?:AutomationTriggerConfig):AutomationTriggerConfig{
 if(rows.some(row=>'sourceSelection' in row)||previous&&automationPropertyTriggerType(previous)==='PROPERTY_CHANGED'){
  const value={schemaVersion:1 as const,relation:'ANY' as const,triggers:rows.map(automationChangedTrigger)}
  if(!automationReportTriggers('PROPERTY_CHANGED',value))throw new Error('请配置1至32个有效触发器')
  return value
 }
 const config=rows.length===1&&rows[0]!.enabled&&(!automationObject(previous)||!('schemaVersion' in previous)||!integer(previous.schemaVersion,2))?automationReportTriggerValue(rows[0]!):{schemaVersion:2 as const,relation:'ANY' as const,triggers:cloneAutomationValue(rows)}
 if(!automationReportTriggers('PROPERTY_REPORTED',config))throw new Error('请配置1至32个有效触发器')
 return config as AutomationTriggerConfig
}
export function automationPropertyAction(node:AutomationNode):{deviceId:string;properties:Record<string,ExactJson>}|undefined{
 if(node.nodeType!==automationPropertyNode||!automationObject(node.config)||Object.keys(node.config).sort().join(',')!=='deviceId,properties'||typeof node.config.deviceId!=='string'||!definitionUuid(node.config.deviceId)||!automationObject(node.config.properties)||!Object.keys(node.config.properties).length)return
 return {deviceId:node.config.deviceId,properties:node.config.properties as Record<string,ExactJson>}
}
/** 新Cloud仅已证四标量固定值；未知旧节点仍保留原配置而不转型。 */
export function automationCloudAction(node:AutomationNode):{deviceId:string;properties:Record<string,ExactJson>}|undefined{
 if(node.nodeType!==automationCloudNode)return
 const candidate=automationPropertyAction({...node,nodeType:automationPropertyNode});if(!candidate||Object.keys(candidate.properties).length>50)return
 try{for(const [key,value] of Object.entries(candidate.properties))if(!/^[A-Za-z0-9_-]{1,64}$/.test(key)||!(typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||value instanceof ExactDecimal))return;if(new TextEncoder().encode(writePreprocessJson(node.config as ExactJson)).length>65536)return}catch{return}
 return candidate
}
function automationTransformScalar(value:unknown):boolean{
 if(typeof value==='string')return validUnicode(value)&&!value.includes('\0')&&new TextEncoder().encode(value).length<=65536
 if(typeof value==='boolean')return true
 let number:ExactDecimal
 try{if(value instanceof ExactDecimal)number=value;else if(typeof value==='number'&&Number.isFinite(value))number=new ExactDecimal(JSON.stringify(value));else return false}catch{return false}
 const integer=BigInt(number.digits.length)+number.exponent,scale=number.exponent<0n?-number.exponent:0n
 return integer<=131072n&&scale<=16383n&&(integer>1n?integer:1n)+scale+(scale>0n?1n:0n)+1n<=65536n
}
/** 自动化配置1保完整操作，不把派生结果冒固定properties。 */
export function automationCloudTransformAction(node:AutomationNode):{deviceId:string;operations:AutomationCloudOperation[]}|undefined{
 const value=node.config
 if(node.nodeType!==automationCloudTransformNode||!automationObject(value)||Object.keys(value).sort().join(',')!=='deviceId,operations,schemaVersion'||typeof value.deviceId!=='string'||!definitionUuid(value.deviceId)||value.deviceId!==value.deviceId.toLowerCase()||(value.schemaVersion instanceof ExactDecimal?value.schemaVersion.canonical()!=='1':value.schemaVersion!==1)||!Array.isArray(value.operations)||!value.operations.length||value.operations.length>32)return
 const keys=new Set<string>();let nonset=false
 for(const item of value.operations){
  if(!automationObject(item)||typeof item.propertyKey!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(item.propertyKey)||keys.has(item.propertyKey)||typeof item.op!=='string'||!Object.hasOwn(automationCloudOperationLabels,item.op))return
  keys.add(item.propertyKey);nonset||=item.op!=='set'
  if(item.op==='toggle'||item.op==='clear'){if(Object.keys(item).sort().join(',')!=='op,propertyKey')return}
  else if(Object.keys(item).sort().join(',')!=='op,propertyKey,value'||!automationTransformScalar(item.value)||item.op!=='set'&&!(item.value instanceof ExactDecimal)&&typeof item.value!=='number')return
 }
 if(!nonset)return
 try{if(new TextEncoder().encode(writePreprocessJson(value as ExactJson)).length>65536)return}catch{return}
 return {deviceId:value.deviceId,operations:cloneAutomationValue(value.operations) as AutomationCloudOperation[]}
}
export function automationCloudOperationAction(deviceId:string,operations:AutomationCloudOperation[]):AutomationNode{
 if(!operations.length||new Set(operations.map(row=>row.propertyKey)).size!==operations.length)throw new Error('请选择有效且不重复的属性')
 if(operations.every(row=>row.op==='set')){const node={nodeType:automationCloudNode,config:{deviceId,properties:Object.fromEntries(operations.map(row=>[row.propertyKey,'value' in row?row.value:null]))}};if(!automationCloudAction(node))throw new Error('云端属性配置超出允许范围');return node}
 const node={nodeType:automationCloudTransformNode,config:{schemaVersion:1,deviceId,operations:cloneAutomationValue(operations)}}
 if(!automationCloudTransformAction(node))throw new Error('请设置1至32个有效属性操作');return node
}
export function automationCloudOperationText(row:AutomationCloudOperation,display:(value:ExactJson)=>string=value=>typeof value==='string'?value:writePreprocessJson(value,true)){return `${row.propertyKey} ${automationCloudOperationLabels[row.op]}${'value' in row?' '+display(row.value):''}`}
export function automationTargetAction(node:AutomationNode){return automationPropertyAction(node)||automationCloudAction(node)||automationCloudTransformAction(node)}
export const automationSceneNode='automation-scene-run-action'
export type AutomationSceneRun={sceneId:string;waitForCompletion:boolean}
export const automationScenePresentation={label:'执行场景',description:'执行选定的场景。',glyph:String.fromCodePoint(0xf040a),background:'#f1f8e9',color:'#558b2f'} as const
/** 原站 scene_run 配置只有场景与等待开关；未知字段保持原样而不读取。 */
export function automationSceneRun(node:AutomationNode):AutomationSceneRun|undefined{
 const c=node.config
 if(node.nodeType!==automationSceneNode||!automationObject(c)||Object.keys(c).sort().join(',')!=='sceneId,waitForCompletion'||typeof c.sceneId!=='string'||!definitionUuid(c.sceneId)||typeof c.waitForCompletion!=='boolean')return
 return {sceneId:c.sceneId,waitForCompletion:c.waitForCompletion}
}
export function automationSceneRunAction(value:AutomationSceneRun):AutomationNode{
 const node:AutomationNode={nodeType:automationSceneNode,config:{...value}}
 if(!automationSceneRun(node))throw new Error('请选择场景并确认等待完成设置')
 return node
}
export function automationSceneSummary(value:AutomationSceneRun,sceneName?:string):string{return `${sceneName||value.sceneId} · ${value.waitForCompletion?'等待场景完成':'不等待场景完成'}`}
export const automationTaskNode='automation-task-run-action'
export type AutomationTaskRun={deviceId:string;taskId:string}
export const automationTaskPresentation={label:'执行任务',description:'运行设备的任务。',glyph:String.fromCodePoint(0xf0ae4),background:'#e0f7fa',color:'#00838f'} as const
/** 原站 task_run 只有 device_id/task_id，没有等待完成开关。 */
export function automationTaskRun(node:AutomationNode):AutomationTaskRun|undefined{
 const c=node.config
 if(node.nodeType!==automationTaskNode||!automationObject(c)||Object.keys(c).sort().join(',')!=='deviceId,taskId'||typeof c.deviceId!=='string'||typeof c.taskId!=='string'||!definitionUuid(c.deviceId)||!definitionUuid(c.taskId))return
 return {deviceId:c.deviceId,taskId:c.taskId}
}
export function automationTaskRunAction(value:AutomationTaskRun):AutomationNode{
 const node:AutomationNode={nodeType:automationTaskNode,config:{...value}}
 if(!automationTaskRun(node))throw new Error('请选择设备和任务')
 return node
}
export function automationTaskSummary(value:AutomationTaskRun,deviceName?:string,taskName?:string):string{return `${deviceName||value.deviceId} · ${taskName||value.taskId}`}
export function automationTagsValue(value:unknown):Readonly<Record<string,string>>{return Object.freeze(ruleTagsValue(sourceRuleTagRows(value)))}
export function newAutomationDraft():AutomationDraft{return {tags:[],name:'',description:'',enabled:true,conditions:[],actions:[]}}
export function loadedAutomationDraft(definition:Schema<'AutomationView'>,version:AutomationVersion):AutomationDraft{
 if(typeof definition.name!=='string'||!['DRAFT','ACTIVE','PAUSED'].includes(definition.status??'')||!version.triggerType||!automationObject(version.triggerConfig))throw new Error('自动化原定义不完整。')
 return {tags:sourceRuleTagRows(definition.tags),name:definition.name,description:definition.description??'',originalName:definition.name,originalDescription:definition.description??'',enabled:definition.status==='ACTIVE',triggerType:version.triggerType,triggerConfig:cloneAutomationValue(version.triggerConfig),conditions:automationNodes(version.conditions),actions:automationNodes(version.actions).map(node=>({key:crypto.randomUUID(),node}))}
}
export function automationDraftBody(draft:AutomationDraft):AutomationBody{
 const name=draft.name.trim(),description=draft.description.trim()
 if(!name||!validUnicode(name)||draft.name!==draft.originalName&&[...name].length>40||!validUnicode(description)||draft.description!==draft.originalDescription&&[...description].length>200)throw new Error('请填写有效名称（最多40字）和描述（最多200字）。')
 if(!draft.triggerType||!draft.triggerConfig)throw new Error('请至少添加 1 个触发项')
 if(!draft.actions.length)throw new Error('请至少添加 1 个动作')
 if(draft.triggerType==='PROPERTY_CHANGED'&&!automationReportTriggers(draft.triggerType,draft.triggerConfig))throw new Error('请完善属性变化触发器配置')
 if(draft.triggerType==='MIXED'&&(!automationMixedConfig(draft.triggerType,draft.triggerConfig)||draft.actions.some(row=>!automationTargetAction(row.node)&&!automationSceneRun(row.node)&&!automationTaskRun(row.node))))throw new Error('请完善混合触发器及目标设备或场景动作配置')
 return {tags:sourceRuleTagInputValue(draft.tags,draft.originalName!==undefined),name,...(description?{description}:{}),triggerType:draft.triggerType,triggerConfig:cloneAutomationValue(draft.triggerConfig),conditions:automationNodes(draft.conditions),actions:automationNodes(draft.actions.map(row=>row.node))}
}
export function automationSignature(value:unknown):string{
 if(value instanceof ExactDecimal)return value.canonical()
 if(Array.isArray(value))return '['+value.map(automationSignature).join(',')+']'
 if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>(value as Record<string,unknown>)[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+automationSignature((value as Record<string,unknown>)[k])).join(',')+'}'
 return JSON.stringify(value)
}
export function assertAutomationContent(body:AutomationBody,definition:Schema<'AutomationView'>,version:AutomationVersion){
 if(automationSignature(automationTagsValue(definition.tags))!==automationSignature(automationTagsValue(body.tags===undefined?{}:body.tags))||definition.name!==body.name||(definition.description??'')!==(body.description??'')||version.triggerType!==body.triggerType||automationSignature(version.triggerConfig)!==automationSignature(body.triggerConfig)||automationSignature(version.conditions)!==automationSignature(body.conditions)||automationSignature(version.actions)!==automationSignature(body.actions))throw new Error('当前自动化与原保存意图尚未一致；未重复提交。')
}
export function automationWriteText(body:AutomationBody,expectedVersion?:number,enabled?:Schema<'ReviseAutomationRequest'>['enabled']){
 const wire:Record<string,ExactJson>={name:body.name,triggerType:body.triggerType,triggerConfig:body.triggerConfig as unknown as ExactJson,conditions:body.conditions as unknown as ExactJson,actions:body.actions as unknown as ExactJson}
 if(expectedVersion===undefined&&body.tags!==undefined)wire.tags=automationTagsValue(body.tags)
 if(body.description!==undefined)wire.description=body.description
 if(expectedVersion!==undefined)wire.expectedVersion=new ExactDecimal(String(cas(expectedVersion)))
 if(enabled!==undefined){if(expectedVersion===undefined||enabled!==null&&typeof enabled!=='boolean')throw new Error('自动化状态只允许随内容修订明确保存');wire.enabled=enabled}
 return writePreprocessJson(wire as unknown as ExactJson,false,true)
}
