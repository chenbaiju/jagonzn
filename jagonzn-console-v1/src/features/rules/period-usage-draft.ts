import type {Schema} from '@/core/contracts'
import {readAlarmRuleSourceChoices} from '@/features/alarms/alarm-rule-source-choices-api'
import {coordinateRuleSource} from './coordinate-transform-draft'
import {deviceSourceMembers,type RuleDeviceSourceContract} from './rule-source-api'
import type {RuleSourceInput} from './rule-source-selection'

export type PeriodUsageDraft=Schema<'MessageRulePropertyPeriodUsageConfig'>
export const periodUsagePropertyKey=/^[A-Za-z0-9_-]{1,64}$/
/** 原站三个配置字段；衍生键按完整名称核验，不截断或改写标识符。 */
export function periodUsageDraft(value:PeriodUsageDraft):PeriodUsageDraft{
 if(!value||Object.keys(value).length!==3||!Object.hasOwn(value,'totalInput')||!Object.hasOwn(value,'usageDay')||!Object.hasOwn(value,'usageMonth')||typeof value.totalInput!=='string'||!periodUsagePropertyKey.test(value.totalInput))throw new Error('总累计值属性须为1至64位英文字母、数字、下划线或短横线')
 if(typeof value.usageDay!=='boolean'||typeof value.usageMonth!=='boolean')throw new Error('请选择日累计和月累计开关')
 if(value.usageDay&&value.totalInput.length+4>64)throw new Error('生成日累计值的属性名 '+value.totalInput+'_day 超过64位，请使用不超过60位的总累计值属性')
 if(value.usageMonth&&value.totalInput.length+6>64)throw new Error('生成月累计值的属性名 '+value.totalInput+'_month 超过64位，请使用不超过58位的总累计值属性')
 return {totalInput:value.totalInput,usageDay:value.usageDay,usageMonth:value.usageMonth}
}
/** 完整来源的NUMBER声明交集；不取首设备、不依赖当前影子值。 */
export async function readRulePeriodUsageProperties(project:string,source:RuleSourceInput|RuleDeviceSourceContract,signal:AbortSignal):Promise<readonly string[]>{
 const current=coordinateRuleSource(source),ids=deviceSourceMembers(current)
 const choices=await readAlarmRuleSourceChoices(project,{kind:current.kind==='DEVICE'?'DEVICE':'DEVICE_TYPE',ids},signal);signal.throwIfAborted()
 return Object.freeze(choices.properties.filter(value=>value.dataType==='NUMBER'&&periodUsagePropertyKey.test(value.key)).map(value=>value.key).sort())
}
