import {readDevicePropertyChoices,type DevicePropertyChoice} from './device-property-choices'
export type AutomationPropertyChoice=DevicePropertyChoice
/** 属性变化条件以实际绑定公开目录的四标量为准；事件来源选择与属性流向筛选分别解释。 */
export const readAutomationTriggerChoices=(project:string,device:string,signal?:AbortSignal)=>readDevicePropertyChoices(project,device,undefined,signal)
/** 顶层CURRENT条件按所选设备实际绑定目录读取四标量，不过滤属性流向。 */
export const readAutomationConditionChoices=(project:string,device:string,signal?:AbortSignal)=>readDevicePropertyChoices(project,device,undefined,signal)
/** 自动化动作独立核实际目标；下发选择共享/下发，云端更新仅选择云端私有四标量。 */
export const readAutomationActionChoices=(project:string,device:string,signal?:AbortSignal,purpose:'downlink'|'cloud-update'='downlink')=>readDevicePropertyChoices(project,device,purpose==='cloud-update'?['CLOUD_PRIVATE']:['DOWNLINK','SHARED'],signal)
