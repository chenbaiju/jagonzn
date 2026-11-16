import {taskPropertyFunctionValue,isTaskFunction} from './task-property-function'
import {taskDataValue} from './task-data-content'
import {taskDataFunctionValue} from './task-data-function'
import {taskOtaUpgradeValue} from './task-ota-upgrade'
import {deviceSourceMembers} from './rule-source-api'
import type { Schema } from '@/core/contracts'
export type Rule = Schema<'MessageRuleView'>
export type RuleVersion = Schema<'MessageRuleVersionView'>
export type Task = Schema<'TaskJobResponse'>
export type TaskWrite = Schema<'SaveTaskJobRequest'>
export type TaskActionType = NonNullable<TaskWrite['actionType']>

/** 固定命令关联ID仅接受JSON可精确表达的整数，缺省保留旧分支。 */
export function taskCommandRequestId(value:unknown):number|undefined {
 if(value===undefined)return undefined
 if(typeof value!=='number'||!Number.isSafeInteger(value))throw new Error('命令 id 必须是安全范围内的 JSON 整数。')
 return value
}
/** 省略类型只兼容真实旧命令；不能凭空key猜属性或把未知类型降成COMMAND。 */
export function taskActionType(value:unknown):TaskActionType {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('任务类型不完整，请重新读取')
  const fields=value as Record<string,unknown>,kind=fields.actionType,key=fields.commandKey
  if(fields.commandRequestId!=null){taskCommandRequestId(fields.commandRequestId);if(kind!==undefined&&kind!=='COMMAND')throw new Error('只有固定命令可保存命令 id。')}
  if(kind===undefined||kind==='COMMAND'){
    if(typeof key!=='string'||!key.trim()||key.trim().length>64)throw new Error('命令任务标识不完整，请重新读取')
    return 'COMMAND'
  }
  if((kind==='OTA_UPGRADE'||kind==='COMMAND_FUNCTION'||kind==='PROPERTY_SET'||kind==='PROPERTY_SET_FUNCTION'||kind==='CLOUD_UPDATE_FUNCTION'||kind==='CLOUD_UPDATE'||kind==='DATA_DOWNLINK'||kind==='DATA_DOWNLINK_FUNCTION')&&(key===undefined||key===null))return kind
  throw new Error('任务类型或内容不一致，请重新读取')
}
/** 显示名只映射已实现的真实类型，不把云更新表述为命令或设备下发。 */
export function taskActionLabel(value:unknown):string {
  const kind=taskActionType(value)
  return kind==='OTA_UPGRADE'?'OTA 推送':kind==='COMMAND_FUNCTION'?'云函数命令下发':kind==='DATA_DOWNLINK_FUNCTION'?'云函数自定义下发':kind==='CLOUD_UPDATE_FUNCTION'?'云函数属性更新':kind==='PROPERTY_SET_FUNCTION'?'云函数属性下发':kind==='COMMAND'?'命令下发':kind==='PROPERTY_SET'?'属性下发':kind==='CLOUD_UPDATE'?'属性更新':'自定义数据下发'
}

/** 返回基础分类；细分操作名称由 taskActionLabel 提供。 */
export function taskBaseActionLabel(value:unknown):string {
 const kind=taskActionType(value)
 return kind==='OTA_UPGRADE'||kind==='COMMAND_FUNCTION'?'命令下发':kind==='PROPERTY_SET_FUNCTION'?'属性下发':kind==='CLOUD_UPDATE_FUNCTION'?'属性更新':kind==='DATA_DOWNLINK_FUNCTION'?'自定义数据下发':taskActionLabel(value)
}

/** CAS 始终使用控制面版本，拒绝 JS 无法精确表示的 long。 */
export function cas(version: number | undefined): number {
  if (!Number.isSafeInteger(version) || version! < 1 || !Number.isSafeInteger(version! + 1)) throw new Error('版本无法安全提交，请重新读取')
  return version!
}
export function objectJson(text: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参数必须是 JSON 对象')
  return value as Record<string, unknown>
}
/** 完整动作集合从线上 JSON 校验，生成 JsonNode Bean schema 修复前也不放宽守卫。 */
export function ruleActions(value: unknown): Schema<'RuleActionRequest'>[] {
  if (!Array.isArray(value)) throw new Error('动作必须是数组')
  return value.map((action: unknown) => {
    if (!action || typeof action !== 'object' || !('nodeType' in action) || typeof action.nodeType !== 'string' || !action.nodeType.trim() || !('config' in action) || action.config === null || typeof action.config !== 'object' || Array.isArray(action.config)) throw new Error('动作内容不完整，禁止覆盖保存')
    return structuredClone(action) as Schema<'RuleActionRequest'>
  })
}
export function validateRule(value: Schema<'MessageRuleWriteRequest'>): Schema<'MessageRuleWriteRequest'> {
  if (!value.name?.trim() || value.name.trim().length > 128) throw new Error('名称不能为空且最多128字符')
  if ((value.description?.length || 0) > 512) throw new Error('说明最多512字符')
  if (!value.source?.trim()) throw new Error('请填写规则源码')
  return { ...value, actions: ruleActions(value.actions) }
}
export function ruleEditor(rule: Rule, version: RuleVersion): Schema<'MessageRuleWriteRequest'> {
  if (!rule.id || !version.id || typeof version.source !== 'string' || !Array.isArray(version.actions)) throw new Error('版本内容不完整，请重新读取')
  const source=version.deviceSource
  if(source!==undefined){if(!source)throw new Error('版本设备来源不完整，请重新读取');deviceSourceMembers(source)}
  return { name: rule.name, description: rule.description, source: version.source, expectedVersion: cas(rule.version), actions: ruleActions(version.actions),...(source===undefined?{}:{deviceSource:structuredClone(source)}) }
}
/** 回填完整定义；定时/目标字段保留原合同，不把不支持的扩展伪装为已保存。 */
export function taskEditor(task: Task): TaskWrite {
  const kind=taskActionType(task),requestId=taskCommandRequestId(task.commandRequestId??undefined)
  if (!task.scheduleType || !task.targetType || !task.timezone || !task.name) throw new Error('任务定义不完整，请重新读取')
  if (task.status !== 'ACTIVE' && task.status !== 'PAUSED') throw new Error('任务状态无法编辑')
  return { name: task.name, description: task.description, scheduleType: task.scheduleType,
    runAt: task.runAt, cronExpression: task.cronExpression, timezone: task.timezone,
    targetType: task.targetType, targetGroupId: task.targetGroupId, targetDeviceTypeId: task.targetDeviceTypeId ?? undefined,
    targetDeviceIds: task.targetDeviceIds?.slice(), targetGroupIds: task.targetGroupIds?.slice(), ...(kind!=='COMMAND'?{actionType:kind,commandKey:null}:{commandKey:task.commandKey,...(requestId===undefined?{}:{commandRequestId:requestId})}),
    input: kind==='OTA_UPGRADE'?taskOtaUpgradeValue(task.input):kind==='DATA_DOWNLINK_FUNCTION'?taskDataFunctionValue(task.input):isTaskFunction(kind)?taskPropertyFunctionValue(task.input):kind==='DATA_DOWNLINK'?taskDataValue(task.input):objectJson(JSON.stringify(task.input)), enabled: task.status === 'ACTIVE', expectedVersion: cas(task.version) }
}
/** 创建标签不能进入既有任务的普通更新；标签只能走独立CAS端口。 */
export function taskUpdateBody(value:TaskWrite):TaskWrite{
  if(Object.hasOwn(value,'tags'))throw new Error('任务标签请使用独立标签编辑入口。')
  return value
}
export function validateTask(value: TaskWrite): TaskWrite {
  const kind=taskActionType(value)
  if (!value.name?.trim()) throw new Error('请填写任务名称')
  if (value.targetType === 'DEVICE_GROUP' && !value.targetGroupId) throw new Error('请选择设备组')
  if (value.scheduleType === 'ONCE' && !value.initialSchedule && (!value.runAt || !/(Z|[+-]\d{2}:\d{2})$/.test(value.runAt) || !Number.isFinite(Date.parse(value.runAt)))) throw new Error('一次性时间必须包含时区')
  if (value.scheduleType === 'CRON' && !value.cronExpression?.trim()) throw new Error('请填写 CRON 表达式')
  const input=kind==='OTA_UPGRADE'?taskOtaUpgradeValue(value.input):kind==='DATA_DOWNLINK_FUNCTION'?taskDataFunctionValue(value.input):isTaskFunction(kind)?taskPropertyFunctionValue(value.input):kind==='DATA_DOWNLINK'?taskDataValue(value.input):objectJson(JSON.stringify(value.input))
  if((kind==='PROPERTY_SET'||kind==='CLOUD_UPDATE')&&Object.keys(input).length===0)throw new Error(kind==='CLOUD_UPDATE'?'请至少填写一个更新属性':'请至少填写一个下发属性')
  return { ...value, input, commandRequestId:kind==='COMMAND'?taskCommandRequestId(value.commandRequestId):undefined, targetGroupId: value.targetType === 'DEVICE_GROUP' ? value.targetGroupId : undefined,
    runAt: value.scheduleType === 'ONCE' ? value.runAt : undefined, cronExpression: value.scheduleType === 'CRON' ? value.cronExpression : undefined }
}
/** 查询保留显式RFC3339时区；不将浏览器本地时间猜成UTC。 */
export function timeRange(from = '', to = ''): { from?: string; to?: string } {
  for (const value of [from, to]) if (value && (!/^\d{4}-\d\d-\d\dT/.test(value) || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))) throw new Error('查询时间必须包含明确时区')
  if (from && to && Date.parse(from) >= Date.parse(to)) throw new Error('开始时间必须早于结束时间')
  return { from: from || undefined, to: to || undefined }
}

export type TaskSelectionWrite = Pick<TaskWrite, 'targetType' | 'targetGroupId' | 'targetDeviceTypeId' | 'targetDeviceIds' | 'targetGroupIds'>
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** 选择只接受真实UUID，保存与运行不得把空/非法集合回退为所有设备。 */
export function selectedDeviceIds(value: readonly string[], maximum = 10000): string[] {
  if (!Array.isArray(value) || !value.length || value.some(id => typeof id !== 'string' || !uuidPattern.test(id))) throw new Error('请选择有效设备')
  const ids = [...new Set(value)]
  if (ids.length > maximum) throw new Error(`最多选择${maximum}项`)
  return ids
}
export function taskSelection(value: TaskSelectionWrite): TaskSelectionWrite {
  switch (value.targetType) {
    case 'ALL_DEVICES': return { targetType: value.targetType }
    case 'DEVICE_GROUP':
      if (!value.targetGroupId || !uuidPattern.test(value.targetGroupId)) throw new Error('请选择有效设备组')
      return { targetType: value.targetType, targetGroupId: value.targetGroupId }
    case 'DEVICE_TYPE':
      if (!value.targetDeviceTypeId || !uuidPattern.test(value.targetDeviceTypeId)) throw new Error('请选择有效设备类型')
      return { targetType: value.targetType, targetDeviceTypeId: value.targetDeviceTypeId }
    case 'EXPLICIT_DEVICES': return { targetType: value.targetType, targetDeviceIds: selectedDeviceIds(value.targetDeviceIds || []) }
    case 'DEVICE_GROUPS': return { targetType: value.targetType, targetGroupIds: selectedDeviceIds(value.targetGroupIds || [], 100) }
    default: throw new Error('目标类型无法识别，请重新读取')
  }
}
