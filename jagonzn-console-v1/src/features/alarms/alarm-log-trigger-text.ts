import {alarmTriggerValuesDisplay} from './alarm-trigger-values-display'

/** 只把同一事件已收到的有界摘要映成纯文本；人工解除保留旧值时不表述为自动恢复值。 */
export function alarmLogTriggerText(row:{triggerValues:unknown;alarmType:string;clearReason:string|null;value:number|null},legacyEmpty:string):string {
 if(row.triggerValues===null)return row.value===null?legacyEmpty:`触发值：${row.value}`
 const text=alarmTriggerValuesDisplay(row.triggerValues,row.alarmType).text
 return row.clearReason==='MANUAL'?`告警已人工解除（保留最近触发原值）\n${text}`:text
}
