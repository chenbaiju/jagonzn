import {taskUpdateBody} from './models'
import { api } from '@/core/http'
import type { Schema, paths } from '@/core/contracts'
import { cas, validateRule, validateTask, taskSelection, selectedDeviceIds } from './models'
import { intervalFields } from './task-interval-fields'
import { solarFields } from './task-solar-fields'
import { taskInitialScheduleIntent,taskInitialScheduleRequest } from './task-initial-schedule'
const rules = (project: string) => `/api/v1/projects/${project}/message-rules` as const
const tasks = (project: string) => `/api/v1/projects/${project}/task-jobs` as const
export const listRules = (project: string, query: { name?: string; status?: string; cursor?: string; limit?: number }, signal?: AbortSignal) => api<Schema<'RuleManagementPageMessageRuleView'>>(rules(project), { query, signal })
/** 来源、触发类型和状态由服务端在分页前筛选；总量不以当前页长度代替。 */
export const listRuleDirectory = (project: string, query: { sourceKind?: string; ruleType?: string; status?: string; cursor?: string; limit?: number }, signal?: AbortSignal) => api<Schema<'MessageRuleDirectoryPage'>>(`${rules(project)}/directory`, { query, signal })
export const getRule = (project: string, id: string, signal?: AbortSignal) => api<Schema<'MessageRuleView'>>(`${rules(project)}/${id}`, { signal })
export const ruleHistory = (project: string, id: string, cursor?: string, signal?: AbortSignal, limit = 24) => api<Schema<'RuleManagementPageMessageRuleVersionView'>>(`${rules(project)}/${id}/version-history`, { query: { cursor, limit }, signal })
export const getVersion = (project: string, id: string, version: string, signal?: AbortSignal) => api<Schema<'MessageRuleVersionView'>>(`${rules(project)}/${id}/versions/${version}`, { signal })
export const getHealth = (project: string, id: string, signal?: AbortSignal) => api<Schema<'RuleScriptHealthView'>>(`${rules(project)}/${id}/script-health`, { signal })
export const saveRule = (project: string, id: string, body: Schema<'MessageRuleWriteRequest'>) => id
  ? api<Schema<'MessageRuleView'>>(`${rules(project)}/${id}`, { method: 'put', body: validateRule({ ...body, expectedVersion: cas(body.expectedVersion) }) })
  : api<Schema<'MessageRuleView'>>(rules(project), { method: 'post', body: validateRule(body) })
/** 原站信息弹窗只改名称/描述；不发送隐藏源码/动作，旧服务器将明确拒绝而不能误追加版本。 */
export const saveRuleInformation = (project: string, id: string, body: Pick<Schema<'MessageRuleWriteRequest'>, 'name' | 'description' | 'expectedVersion'>) => {
  if (!body.name?.trim() || body.name.length > 128 || (body.description?.length || 0) > 512) throw new Error('规则名称或描述不合法')
  return api<Schema<'MessageRuleView'>>(`${rules(project)}/${id}`, { method: 'put', query: { informationOnly: true }, body: { name: body.name, description: body.description, expectedVersion: cas(body.expectedVersion) } })
}
export const activateRule = (project: string, id: string, version: string, expectedVersion: number) => api<Schema<'MessageRuleView'>>(`${rules(project)}/${id}/versions/${version}/activate`, { method: 'post', query: { expectedVersion: cas(expectedVersion) } })
export const pauseRule = (project: string, id: string, expectedVersion: number) => api<Schema<'MessageRuleView'>>(`${rules(project)}/${id}/pause`, { method: 'post', query: { expectedVersion: cas(expectedVersion) } })
export const deleteRule = (project: string, id: string, expectedVersion: number) => api<void>(`${rules(project)}/${id}`, { method: 'delete', query: { expectedVersion: cas(expectedVersion) } })
export const debugRule = (project: string, id: string, version: string, inputJson: string) => api<Schema<'DebugResponse'>>(`${rules(project)}/${id}/versions/${version}/debug`, { method: 'post', body: { inputJson } })
/** 目录合同是完整数组；残缺分页或错误包装不能被前端当成空目录。 */
export const listTasks = async (project: string, signal?: AbortSignal) => {
  const result = await api<Schema<'TaskJobResponse'>[]>(tasks(project), { signal })
  if (!Array.isArray(result)) throw new Error('任务目录返回格式不完整，请重新读取')
  return result
}
// getTaskJob已由主控官方生成；直接精确读取，不扫描目录。
export const getTask = (project: string, id: string, signal?: AbortSignal) => api<Schema<'TaskJobResponse'>>(`${tasks(project)}/${id}`, { signal })
/** 原请求键按正式0130字符集校验，显式空值不得降级成无键创建。 */
function taskCreationKey(value: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new Error('任务创建原请求键无效')
  return value
}
export const saveTask = (project: string, id: string, body: Schema<'SaveTaskJobRequest'>, originalKey?: string) => {
  if (id) {
    taskUpdateBody(body)
    if (body.initialSchedule !== undefined) throw new Error('初始计划仅适用于任务创建')
    if (originalKey !== undefined) throw new Error('原请求键仅适用于任务创建')
    return api<Schema<'TaskJobResponse'>>(`${tasks(project)}/${id}`, { method: 'put', body: validateTask({ ...body, expectedVersion: cas(body.expectedVersion) }) })
  }
  const headers = originalKey === undefined ? undefined : { 'Idempotency-Key': taskCreationKey(originalKey) }
  if (body.initialSchedule !== undefined) {
    const initial = taskInitialScheduleRequest(taskInitialScheduleIntent(body.initialSchedule,body.timezone),body.timezone)
    if (initial.mode !== body.scheduleType || body.runAt != null || body.cronExpression != null) throw new Error('初始计划不能混入其它计划类型或旧字段')
    body = { ...body, initialSchedule: initial }
  }
  return api<Schema<'TaskJobResponse'>>(tasks(project), { method: 'post', body: validateTask(body), ...(headers ? { headers } : {}) })
}
/** 正式582原件只读入口；键只放单值header，不进入URL或任务目录。 */
export const getTaskJobCreationByKey = (project: string, originalKey: string, signal?: AbortSignal) => {
  const headers: paths['/api/v1/projects/{projectId}/task-job-creations/by-key']['get']['parameters']['header'] = { 'Original-Request-Key': taskCreationKey(originalKey) }
  return api<Schema<'TaskJobCreationReceipt'>>(`/api/v1/projects/${project}/task-job-creations/by-key`, { headers, signal })
}
export const deleteTask = (project: string, id: string, expectedVersion: number) => api<void>(`${tasks(project)}/${id}`, { method: 'delete', query: { expectedVersion: cas(expectedVersion) } })
export const enableTask = (project: string, id: string) => api<Schema<'TaskJobResponse'>>(`${tasks(project)}/${id}/enable`, { method: 'post' })
export const disableTask = (project: string, id: string) => api<Schema<'TaskJobResponse'>>(`${tasks(project)}/${id}/disable`, { method: 'post' })
/** 返回202只是受理；不接受运行时覆写或目标参数，不自动重提。 */
export const runTask = (project: string, id: string, key?: string, requireEnabled = false) => {
  if (key && key.length > 128) throw new Error('幂等键最多128字符')
  return api<Schema<'TaskExecutionResponse'>>(`${tasks(project)}/${id}/runs`, { method: 'post', ...(requireEnabled ? { query: { requireEnabled: true } } : {}), ...(key ? { headers: { 'Idempotency-Key': key } } : {}) })
}
export const taskExecutions = (project: string, id: string, signal?: AbortSignal) => api<Schema<'TaskExecutionResponse'>[]>(`${tasks(project)}/${id}/executions`, { signal })
export const ruleExecutions = (project: string, query: { ruleId?: string; status?: string; cursor?: string; limit?: number; from?: string; to?: string }, signal?: AbortSignal) => api<Schema<'CursorPageRuleExecutionSummaryResponse'>>(`/api/v1/projects/${project}/rule-executions`, { query, signal })
export const ruleAttempts = (project: string, query: { messageId: string; ruleId: string; ruleVersionId: string }, signal?: AbortSignal) => api<Schema<'RuleExecutionAttemptResponse'>[]>(`/api/v1/projects/${project}/rule-executions/attempts`, { query, signal })
export const listAutomations = (project: string, query: { name?: string; status?: string; cursor?: string; limit?: number }, signal?: AbortSignal) => api<Schema<'RuleManagementPageAutomationView'>>(`/api/v1/projects/${project}/automations`, { query, signal })
export const listScenes = (project: string, query: { name?: string; status?: string; cursor?: string; limit?: number }, signal?: AbortSignal) => api<Schema<'RuleManagementPageRuleSceneView'>>(`/api/v1/projects/${project}/scenes`, { query, signal })

/** 原站名称/说明编辑不重新计算过期ONCE计划，不覆盖隐藏调度或目标定义。 */
export const saveTaskInformation = (project: string, id: string, body: Schema<'SaveTaskJobRequest'>) => api<Schema<'TaskJobResponse'>>(`${tasks(project)}/${id}`, { method: 'put', query: { informationOnly: true }, body: { ...taskUpdateBody(body), expectedVersion: cas(body.expectedVersion) } })

export type UsageDays = 1 | 3 | 7 | 15 | 30
export const getRuleUsageStatistics = (project: string, id: string, days: UsageDays, signal?: AbortSignal) => api<Schema<'RuleUsageStatistics'>>(`${rules(project)}/${id}/statistics`, { query: { days }, signal })
export const getTaskUsageStatistics = (project: string, id: string, days: UsageDays, signal?: AbortSignal) => api<Schema<'TaskUsageStatistics'>>(`${tasks(project)}/${id}/statistics`, { query: { days }, signal })

/** 保存目标专用模式要求同候选后端，不修改隐藏计划/命令，也不自动回退完整更新。 */
export const saveTaskTargets = (project: string, id: string, body: Schema<'SaveTaskJobRequest'>) => {
  taskUpdateBody(body)
  const selection = taskSelection(body)
  return api<Schema<'TaskJobResponse'>>(`${tasks(project)}/${id}`, { method: 'put', query: { targetsOnly: true }, body: { ...body, targetGroupId: undefined, targetDeviceTypeId: undefined, targetDeviceIds: undefined, targetGroupIds: undefined, ...selection, expectedVersion: cas(body.expectedVersion) } })
}
/** 指定设备仅缩小保存范围，受理时重新校验ACTIVE/CAS/全部子集；任何失败都不自动重放。 */
export const runTaskOnDevices = (project: string, id: string, expectedVersion: number, ids: readonly string[]) => {
  const body: Schema<'RunTaskJobRequest'> = { expectedVersion: cas(expectedVersion), deviceIds: selectedDeviceIds(ids) }
  return api<Schema<'TaskExecutionResponse'>>(`${tasks(project)}/${id}/runs`, { method: 'post', query: { requireEnabled: true }, body })
}

/** 正式生成的保存范围候选GET；游标只定位，不扩大保存范围。 */
export const taskRunCandidates = (project: string, id: string, expectedVersion: number, cursor?: string, signal?: AbortSignal) => {
  if (cursor && cursor.length > 8192) throw new Error('候选游标过长，请重新读取')
  return api<Schema<'CursorPageTaskTargetCandidateResponse'>>(`${tasks(project)}/${id}/target-devices`, { query: { expectedVersion: cas(expectedVersion), cursor, limit: 20 }, signal })
}

/** 正式493生成的独立调试缓冲；不读取或清除不可变执行审计。 */
export const getConsoleRuleDebugLogs = (project: string, ruleId?: string, cursor?: string, signal?: AbortSignal, page?: number) => {
  if (cursor !== undefined && (!cursor || cursor.length > 8192)) throw new Error('日志游标不完整，请刷新后重试')
  if (page !== undefined && (cursor !== undefined || !Number.isSafeInteger(page) || page < 1 || (page - 1) * 24 > 10000)) throw new Error('日志浏览页超出范围，请刷新后重试')
  return api<Schema<'RuleConsoleLogPage'>>(`/api/v1/projects/${project}/message-rule-debug-logs`, { query: { ruleId, cursor, limit: 24, page }, signal })
}
export const getConsoleRuleDebugControl = (project: string, id: string, signal?: AbortSignal) => api<Schema<'RuleConsoleLogControl'>>(`${rules(project)}/${id}/debug-log-control`, { signal })
export const setConsoleRuleDebugControl = (project: string, id: string, expectedVersion: number, enabled: boolean) => {
  if (typeof enabled !== 'boolean') throw new Error('调试状态值不合法')
  const body: Schema<'ConsoleRuleDebugControlRequest'> = { expectedVersion: cas(expectedVersion), enabled }
  return api<Schema<'RuleConsoleLogControl'>>(`${rules(project)}/${id}/debug-log-control`, { method: 'put', body })
}
export const clearConsoleRuleDebugLogs = (project: string, id: string, expectedVersion: number) => api<Schema<'RuleConsoleLogControl'>>(`${rules(project)}/${id}/debug-logs`, { method: 'delete', query: { expectedVersion: cas(expectedVersion) } })
export const clearConsoleProjectRuleDebugLogs = (project: string, expectedVersion: number) => api<Schema<'ConsoleRuleDebugProjectControl'>>(`/api/v1/projects/${project}/message-rule-debug-logs`, { method: 'delete', query: { expectedVersion: cas(expectedVersion) } })

/** 正式生成的任务调试缓冲；不使用或清除不可变任务执行API。 */
export const getConsoleTaskDebugLogs = (project: string, jobId?: string, cursor?: string, signal?: AbortSignal, page?: number) => {
  if (cursor !== undefined && (!cursor || cursor.length > 2048)) throw new Error('日志游标不完整，请刷新后重试')
  if (page !== undefined && (cursor !== undefined || !Number.isSafeInteger(page) || page < 1 || (page - 1) * 24 > 10000)) throw new Error('日志浏览页超出范围，请刷新后重试')
  const query: NonNullable<paths['/api/v1/projects/{projectId}/task-debug-logs']['get']['parameters']['query']> = { jobId, cursor, limit: 24, page }
  return api<Schema<'TaskConsoleLogPage'>>(`/api/v1/projects/${project}/task-debug-logs`, { query, signal })
}
export const getConsoleTaskDebugControl = (project: string, id: string, signal?: AbortSignal) => api<Schema<'TaskConsoleLogControl'>>(`${tasks(project)}/${id}/debug-log-control`, { signal })
export const setConsoleTaskDebugControl = (project: string, id: string, expectedVersion: number, enabled: boolean) => {
  if (typeof enabled !== 'boolean') throw new Error('调试状态值不合法')
  const body: Schema<'ConsoleTaskDebugControlRequest'> = { expectedVersion: cas(expectedVersion), enabled }
  return api<Schema<'TaskConsoleLogControl'>>(`${tasks(project)}/${id}/debug-log-control`, { method: 'put', body })
}
export const clearConsoleTaskDebugLogs = (project: string, id: string, expectedVersion: number) => api<Schema<'TaskConsoleLogControl'>>(`${tasks(project)}/${id}/debug-logs`, { method: 'delete', query: { expectedVersion: cas(expectedVersion) } })
export const clearConsoleProjectTaskDebugLogs = (project: string, expectedVersion: number) => api<Schema<'ConsoleTaskDebugProjectControl'>>(`/api/v1/projects/${project}/task-debug-logs`, { method: 'delete', query: { expectedVersion: cas(expectedVersion) } })

/** 当前保存范围内的设备定时偏好，父定义和每台设备分别CAS；GET不落默认行。 */
export const getConsoleTaskDeviceSchedules = (project: string, id: string, expectedDefinitionVersion: number, cursor?: string, signal?: AbortSignal) => {
  if (cursor !== undefined && (!cursor || cursor.length > 8192)) throw new Error('设备游标不完整，请刷新后重试')
  const query: NonNullable<paths['/api/v1/projects/{projectId}/task-jobs/{jobId}/device-schedules']['get']['parameters']['query']> = { expectedDefinitionVersion: cas(expectedDefinitionVersion), cursor, limit: 24 }
  return api<Schema<'ConsoleTaskDeviceSchedulePage'>>(`${tasks(project)}/${id}/device-schedules`, { query, signal })
}
export const setConsoleTaskDeviceSchedule = (project: string, id: string, device: string, expectedDefinitionVersion: number, expectedVersion: number, allowed: boolean) => {
  if (typeof allowed !== 'boolean') throw new Error('设备定时偏好不合法')
  const body: Schema<'ConsoleTaskDeviceScheduleRequest'> = { allowed, expectedVersion: cas(expectedVersion), expectedDefinitionVersion: cas(expectedDefinitionVersion) }
  return api<Schema<'ConsoleTaskDeviceScheduleControl'>>(`${tasks(project)}/${id}/device-schedules/${device}`, { method: 'put', body })
}

/** 正式526全局计划专用接口，成员GET和管理PUT不重交隐藏命令/目标。 */
export const getConsoleTaskSchedule = (project: string, id: string, signal?: AbortSignal) => api<Schema<'ConsoleTaskScheduleView'>>(`${tasks(project)}/${id}/console-schedule`, { signal })
export const setConsoleTaskSchedule = (project: string, id: string, input: Schema<'ConsoleTaskScheduleRequest'>) => {
  if (!input || !['MANUAL','ONCE','DAILY','INTERVAL','SOLAR'].includes(input.mode) || Object.keys(input).some(key => !['expectedVersion','mode','runAt','timezoneMode','timezone','times','weekdays','intervalMinutes','timeRanges','solar','timeSource','timerAttributes'].includes(key))) throw new Error('任务计划字段不完整')
  if(input.timeSource==='DEVICE_TIMER'){
    if(input.mode!=='DAILY'||Object.keys(input).some(key=>!['expectedVersion','mode','timeSource','timerAttributes'].includes(key))||!Array.isArray(input.timerAttributes)||input.timerAttributes.length<1||input.timerAttributes.length>10||input.timerAttributes.some(r=>!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>k!=='identifier'&&k!=='timeType')||typeof r.identifier!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(r.identifier)||Object.hasOwn(r,'timeType')&&r.timeType!=='START'&&r.timeType!=='END')||new Set(input.timerAttributes.map(r=>r.identifier)).size!==input.timerAttributes.length)throw new Error('每日定时器属性计划不完整')
  }else if(input.timeSource!==undefined&&(input.mode!=='DAILY'||input.timeSource!=='FIXED')||input.timerAttributes!==undefined)throw new Error('请核对每日定时时间设置方式')
  if(input.mode!=='SOLAR'&&'solar' in input)throw new Error('非太阳计划不能提交隐藏太阳字段')
  if(input.mode==='SOLAR'){
    const source:Schema<'ConsoleTaskSolarPlan'>|undefined=input.solar
    if(['runAt','times','intervalMinutes','timeRanges'].some(k=>k in input)||!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).length<4||Object.keys(source).length>5||Object.keys(source).some(k=>!['event','beforeMinutes','latitude','longitude','locationName'].includes(k)))throw new Error('太阳计划字段不完整')
    solarFields({event:source.event,beforeMinutes:source.beforeMinutes,position:{latitude:source.latitude,longitude:source.longitude},...(source.locationName==null?{}:{locationName:source.locationName})})
    if(!Array.isArray(input.weekdays)||input.weekdays.length<1||input.weekdays.length>7||new Set(input.weekdays).size!==input.weekdays.length||input.weekdays.some(d=>!Number.isInteger(d)||d<1||d>7))throw new Error('太阳重复星期不完整')
    if(input.timezoneMode!=='FOLLOW_PROJECT'&&input.timezoneMode!=='CUSTOM'||input.timezoneMode==='FOLLOW_PROJECT'&&input.timezone!==undefined)throw new Error('请核对太阳计划时区')
    if(input.timezoneMode==='CUSTOM'){if(!input.timezone||input.timezone.length>64)throw new Error('请核对太阳计划时区');new Intl.DateTimeFormat('en',{timeZone:input.timezone})}
  }
  if(input.mode==='INTERVAL'){
    if(!Number.isInteger(input.intervalMinutes)||input.intervalMinutes!<5||input.intervalMinutes!>2147483647||!Array.isArray(input.timeRanges)||input.timeRanges.length>24||['runAt','times','weekdays'].some(k=>k in input))throw new Error('间隔计划字段不完整')
    intervalFields({amount:String(input.intervalMinutes),unit:'MINUTES',rangeEnabled:input.timeRanges.length>0,ranges:input.timeRanges})
    if(!input.timeRanges.length){if('timezoneMode' in input||'timezone' in input)throw new Error('无时间范围不能提交隐藏时区')}
    else if(input.timezoneMode!=='FOLLOW_PROJECT'&&input.timezoneMode!=='CUSTOM'||input.timezoneMode==='CUSTOM'&&!input.timezone||input.timezoneMode==='FOLLOW_PROJECT'&&input.timezone!==undefined)throw new Error('请核对间隔时区')
  }else if('intervalMinutes' in input||'timeRanges' in input)throw new Error('非间隔计划不能提交隐藏间隔字段')
  return api<Schema<'ConsoleTaskScheduleView'>>(`${tasks(project)}/${id}/console-schedule`, { method: 'put', body: { ...input, expectedVersion: cas(input.expectedVersion) } })
}
