import {automationObject,automationTriggerRow,automationChangedTrigger,automationReportTriggers,automationReportTriggerValue,automationPropertyTrigger,automationReportConfigBytes,automationTriggerPresentation,cloneAutomationValue,type AutomationTriggerConfig} from './automation-editor-draft'
import {ExactDecimal} from './preprocess-exact-json'
/** 混合触发卡只衍生唯一生成合同；旧触发配置不自动转换。 */
export type AutomationMixedConfig=Extract<AutomationTriggerConfig,{timezoneMode:unknown}>
export type AutomationMixedTrigger=AutomationMixedConfig['triggers'][number]
export type AutomationMixedKind=AutomationMixedTrigger['kind']
export type AutomationDatetimeOptions=Extract<AutomationMixedTrigger,{kind:'DATETIME'}>['options']
export type AutomationScheduleOptions=Extract<AutomationMixedTrigger,{kind:'SCHEDULE'}>['options']
export const automationMixedKinds=['SCHEDULE','DATETIME','PROPERTY_CHANGED'] as const
const timePattern=/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/
function keys(v:Record<string,unknown>,expected:string){return Object.keys(v).sort().join(',')===expected}
export function automationTimezone(value:unknown):value is string{if(typeof value!=='string'||!value||value!==value.trim()||value.length>64)return false;try{new Intl.DateTimeFormat('en',{timeZone:value});return true}catch{return false}}
export function automationDatetime(value:unknown):value is string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d$/.test(value))return false
 const y=Number(value.slice(0,4)),m=Number(value.slice(5,7)),d=Number(value.slice(8,10));if(y<1||m<1||m>12||d<1)return false
 return d<=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31][m-1]!
}
function day(value:unknown,max:number){const text=value instanceof ExactDecimal?value.literal:typeof value==='number'&&Number.isInteger(value)?String(value):'';return /^(?:[1-9]|[12][0-9]|3[01])$/.test(text)&&Number(text)<=max?Number(text):undefined}
function days(value:unknown,max:number):value is (number|ExactDecimal)[]{return Array.isArray(value)&&value.length<=max&&value.every(v=>day(v,max)!==undefined)&&new Set(value.map(v=>day(v,max))).size===value.length}
export function automationMixedTrigger(value:unknown):AutomationMixedTrigger|undefined{
 if(!automationObject(value)||!keys(value,'enabled,kind,options')||typeof value.enabled!=='boolean'||!automationObject(value.options))return
 const o=value.options
 if(value.kind==='PROPERTY_REPORTED'){if(!['deviceId','deviceId,propertyPredicate'].includes(Object.keys(o).sort().join(',')))return;const row=automationReportTriggers('PROPERTY_REPORTED',o);if(!row||row.length!==1)return;if((automationPropertyTrigger(o)?.durationSeconds??0)>0)return}
 else if(value.kind==='PROPERTY_CHANGED'){const row=automationTriggerRow(o,value.enabled);if(!row||!('sourceSelection' in row))return;if((automationPropertyTrigger(o)?.durationSeconds??0)>0)return}
 else if(value.kind==='DATETIME'){if(!keys(o,'datetimes')||!Array.isArray(o.datetimes)||o.datetimes.length<1||o.datetimes.length>32||!o.datetimes.every(automationDatetime))return}
 else if(value.kind==='SCHEDULE'){
  if(o.repeatType==='ONCE'){if(!keys(o,'onceTime,repeatType')||typeof o.onceTime!=='string'||!timePattern.test(o.onceTime))return}
  else{
   if(!keys(o,'monthDays,repeatType,times,weekDays')||!['DAILY','WEEKLY','MONTHLY'].includes(String(o.repeatType))||!Array.isArray(o.times)||o.times.length<1||o.times.length>10||!o.times.every(v=>typeof v==='string'&&timePattern.test(v))||new Set(o.times).size!==o.times.length||!days(o.weekDays,7)||!days(o.monthDays,31))return
   if(o.repeatType==='DAILY'&&(o.weekDays.length||o.monthDays.length)||o.repeatType==='WEEKLY'&&(!o.weekDays.length||o.monthDays.length)||o.repeatType==='MONTHLY'&&(!o.monthDays.length||o.weekDays.length))return
  }
 }else return
 return cloneAutomationValue(value) as AutomationMixedTrigger
}
/** 全配置按既有PG精确数字/UTF8预算计量，禁用卡仍校验真实形状。 */
export function automationMixedConfig(type:unknown,value:unknown):AutomationMixedConfig|undefined{
 if(type!=='MIXED'||!automationObject(value)||!([3,4].some(version=>value.schemaVersion===version||value.schemaVersion instanceof ExactDecimal&&value.schemaVersion.literal===String(version)))||value.relation!=='ANY'||!['FOLLOW_PROJECT','CUSTOM'].includes(String(value.timezoneMode))||!keys(value,value.timezoneMode==='CUSTOM'?'relation,schemaVersion,timezone,timezoneMode,triggers':'relation,schemaVersion,timezoneMode,triggers')||value.timezoneMode==='CUSTOM'&&!automationTimezone(value.timezone)||!Array.isArray(value.triggers)||value.triggers.length<1||value.triggers.length>32||value.triggers.some(row=>!automationMixedTrigger(row)))return
 const changed=value.schemaVersion===4||value.schemaVersion instanceof ExactDecimal&&value.schemaVersion.literal==='4'
 if(value.triggers.some(row=>automationObject(row)&&(changed?row.kind==='PROPERTY_REPORTED':row.kind==='PROPERTY_CHANGED')))return
 const bytes=automationReportConfigBytes(value);if(bytes===undefined||bytes>65536n)return
 return cloneAutomationValue(value) as AutomationMixedConfig
}
export function automationMixedValue(rows:AutomationMixedTrigger[],previous?:AutomationMixedConfig):AutomationMixedConfig{
 const changed=rows.some(row=>row.kind==='PROPERTY_CHANGED')||previous?.schemaVersion===4||previous?.schemaVersion instanceof ExactDecimal&&previous.schemaVersion.literal==='4'
 const triggers=rows.map(row=>{
  if(!changed||row.kind!=='PROPERTY_REPORTED')return cloneAutomationValue(row)
  const old=automationReportTriggers('PROPERTY_REPORTED',row.options)?.[0];if(!old)throw new Error('原有属性触发器无法转换，请重新读取')
  const {enabled:_enabled,...options}=automationChangedTrigger({...old,enabled:row.enabled})
  return {kind:'PROPERTY_CHANGED' as const,enabled:row.enabled,options}
 })
 const value={schemaVersion:changed?4:3,relation:'ANY',timezoneMode:previous?.timezoneMode??'FOLLOW_PROJECT',...(previous?.timezoneMode==='CUSTOM'?{timezone:previous.timezone}:{}),triggers}
 const checked=automationMixedConfig('MIXED',value);if(!checked)throw new Error('请完善触发器和时区设置');return checked
}
export function automationMixedPresentation(kind:AutomationMixedKind){if(kind==='PROPERTY_REPORTED'||kind==='PROPERTY_CHANGED')return automationTriggerPresentation;return kind==='DATETIME'?{label:'日期时间',description:'按绝对日期时间触发，支持多组日期时间。',glyph:String.fromCodePoint(0xf00ef),background:'#e8f5e9',color:'#2e7d32'}:{label:'重复时间',description:'按时间计划重复触发，支持每日/每周/每月，也可执行一次。',glyph:String.fromCodePoint(0xf00f0),background:'#e3f2fd',color:'#1565c0'}}
export function automationMixedSummary(row:AutomationMixedTrigger):string{
 if(row.kind==='DATETIME'){const o=row.options as AutomationDatetimeOptions;return o.datetimes.length===1?o.datetimes[0]!:o.datetimes[0]+' 等 '+o.datetimes.length+' 个时间'}
 if(row.kind==='SCHEDULE'){const o=row.options as AutomationScheduleOptions;if(o.repeatType==='ONCE')return '执行一次 · '+o.onceTime;const labels={DAILY:'每日',WEEKLY:'每周',MONTHLY:'每月'};return labels[o.repeatType]+' · '+o.times.join('、')+(o.repeatType==='WEEKLY'?' · '+o.weekDays.map(v=>'周'+(['一','二','三','四','五','六','日'][Number(v instanceof ExactDecimal?v.literal:v)-1]??'')).join('、'):o.repeatType==='MONTHLY'?' · '+o.monthDays.map(v=>String(v instanceof ExactDecimal?v.literal:v)+'日').join('、'):'')}
 return ''
}
/** 仅在用户实际添加时间卡时转换已理解的REPORT；不猜旧CRON/ONE_SHOT。ADR0641混合卡不承载持续窗口，转换时显式归零。 */
export function automationReportAsMixed(type:unknown,value:unknown):AutomationMixedTrigger[]|undefined{
 const rows=automationReportTriggers(type,value)
 return rows?.map(row=>{
  const options=automationReportTriggerValue(row) as {deviceId:string;propertyPredicate?:{durationSeconds?:unknown}}
  if(options.propertyPredicate)options.propertyPredicate={...options.propertyPredicate,durationSeconds:0}
  return {kind:'sourceSelection' in row?'PROPERTY_CHANGED':'PROPERTY_REPORTED',enabled:row.enabled,options} as AutomationMixedTrigger
 })
}
export function automationMixedDeviceIds(value:AutomationMixedConfig|undefined):string[]{return value?.triggers.flatMap(row=>row.kind==='PROPERTY_REPORTED'||row.kind==='PROPERTY_CHANGED'?[String(row.options.deviceId)]:[])??[]}
