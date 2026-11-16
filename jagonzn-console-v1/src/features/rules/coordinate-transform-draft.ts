import {readAlarmRuleSourceChoices} from '@/features/alarms/alarm-rule-source-choices-api'
import {deviceSourceMembers,sourceContract,type RuleDeviceSourceContract} from './rule-source-api'
import {sourceSelectionInput,type RuleSourceInput} from './rule-source-selection'
import {definitionUuid} from './device-task-definition-port'

export type CoordinateConversion='WGS84_TO_GCJ02'|'WGS84_TO_BD09'
export type CoordinateTransformDraft={inputProperty:string;conversion:CoordinateConversion;outputProperty:string}
export const coordinatePropertyKey=/^[A-Za-z0-9_-]{1,32}$/
export function coordinateRuleSource(source:RuleSourceInput|RuleDeviceSourceContract):RuleDeviceSourceContract{
 const value='members' in source||'name' in source?sourceContract(sourceSelectionInput(source as RuleSourceInput)):source as RuleDeviceSourceContract
 if(!['DEVICE','DEVICE_TYPE'].includes(String(value.kind))||!deviceSourceMembers(value).length)throw new Error('请选择有效设备来源后配置预处理操作')
 return value
}
export function coordinateTransformDraft(value:CoordinateTransformDraft):CoordinateTransformDraft{
 if(!coordinatePropertyKey.test(value.inputProperty)||!coordinatePropertyKey.test(value.outputProperty))throw new Error('属性标识符须为1至32位英文字母、数字、下划线或短横线')
 if(!['WGS84_TO_GCJ02','WGS84_TO_BD09'].includes(value.conversion))throw new Error('请选择转换方式')
 return {inputProperty:value.inputProperty,conversion:value.conversion,outputProperty:value.outputProperty}
}
/** 一次复用设备源属性目录的完整来源交集；不逐设备下载模型，也不以样例代替来源。 */
export async function readRuleCoordinateProperties(project:string,source:RuleSourceInput|RuleDeviceSourceContract,signal:AbortSignal):Promise<readonly string[]>{
 if(!definitionUuid(project))throw new Error('当前项目不可读取')
 const current=coordinateRuleSource(source),ids=deviceSourceMembers(current)
 const choices=await readAlarmRuleSourceChoices(project,{kind:current.kind==='DEVICE'?'DEVICE':'DEVICE_TYPE',ids},signal)
 signal.throwIfAborted()
 // OBJECT候选只表示属性声明类型，坐标值仍须由执行端核对。
 return Object.freeze(choices.properties.filter(value=>value.dataType==='OBJECT'&&coordinatePropertyKey.test(value.key)).map(value=>value.key).sort())
}
