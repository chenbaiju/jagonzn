/** 隔离维护编辑器的视图模型，不是手写HTTP DTO；正式绑定必须消费主控生成类型。 */
export interface AlarmLogMaintenanceDraft {
  version: number
  alarmReason: string
  solution: string
  remark: string
}
export interface AlarmLogMaintenanceEditContext {
  projectId: string
  logId: string
  identityEpoch: number
}
export function copyMaintenanceDraft(value: AlarmLogMaintenanceDraft): AlarmLogMaintenanceDraft {
  return { version: value.version, alarmReason: value.alarmReason, solution: value.solution, remark: value.remark }
}
/** 注释的纯文本边界同时用于独立编辑和事件页投影，不裁剪或替换原文。 */
export const validMaintenanceText=(value:unknown):value is string=>typeof value==='string'&&value.length<=65536&&!/[\u0000\ud800-\udfff]/u.test(value.replace(/[\ud800-\udbff][\udc00-\udfff]/g,''))
export function alarmLogMaintenanceContent(value:Pick<AlarmLogMaintenanceDraft,'alarmReason'|'solution'|'remark'>){
 if(![value.alarmReason,value.solution,value.remark].every(validMaintenanceText)||[value.alarmReason,value.solution,value.remark].reduce((total,text)=>total+new TextEncoder().encode(text).length,0)>65536)throw new Error('维护信息格式或长度不合法')
 return {alarmReason:value.alarmReason,solution:value.solution,remark:value.remark}
}
