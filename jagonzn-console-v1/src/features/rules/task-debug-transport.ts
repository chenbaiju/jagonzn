import type { Schema } from '@/core/contracts'
import { can } from '@/core/session'
import { cas } from './models'
import { getConsoleTaskDebugLogs, getConsoleTaskDebugControl, setConsoleTaskDebugControl, clearConsoleTaskDebugLogs, clearConsoleProjectTaskDebugLogs } from './api'
import { getTaskDebugLogDevices } from './task-debug-devices-api'
import type { TaskDebugDeviceRead, TaskDebugLogRead, TaskDebugLogTransport, TaskDebugSwitchRead } from './task-debug-state'

const taskTypes: Record<string,string> = { OTA_UPGRADE:'命令下发', COMMAND:'命令下发', COMMAND_FUNCTION:'命令下发', PROPERTY_SET:'属性下发', PROPERTY_SET_FUNCTION:'属性下发', CLOUD_UPDATE:'属性更新', CLOUD_UPDATE_FUNCTION:'属性更新', DATA_DOWNLINK:'自定义数据下发', DATA_DOWNLINK_FUNCTION:'自定义数据下发' }
const taskSources: Record<string,string> = { MANUAL:'手动', SCHEDULE:'定时', SCENE:'场景', APP_USER:'应用', AUTOMATION:'自动化' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const validId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value)
const validTime = (value: unknown): value is string => typeof value === 'string' && /(Z|[+-]\d{2}:?\d{2})$/i.test(value) && Number.isFinite(Date.parse(value))
const validCount = (value: unknown): value is number => Number.isInteger(value) && typeof value === 'number' && value >= 0 && value <= 2147483647
const positiveLong = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
function incomplete(): never { throw new Error('任务调试日志返回格式不完整，请重新读取') }
function control(value: Schema<'TaskConsoleLogControl'>): TaskDebugSwitchRead {
  if (!value || typeof value.enabled !== 'boolean' || !positiveLong(value.projectGeneration) || !positiveLong(value.jobGeneration)) incomplete()
  return { checked: value.enabled, writeToken: cas(value.version) }
}
/** 只消费正式生成Schema；未知展示口径保留破折号，不将来源汇总解释成设备实际运行或ACK。 */
function page(value: Schema<'TaskConsoleLogPage'>, job: string | undefined): TaskDebugLogRead {
  if (!value || !Array.isArray(value.items) || value.items.length > 24 || typeof value.hasMore !== 'boolean') incomplete()
  const cursor = value.nextCursor
  if (cursor != null && (typeof cursor !== 'string' || !cursor || cursor.length > 2048) || value.hasMore !== !!cursor || value.hasMore && value.items.length === 0) incomplete()
  const unique = new Set<string>(), links = can('task:read')
  const rows = value.items.map(row => {
    if (!row || !validId(row.id) || unique.has(row.id.toLowerCase()) || !validId(row.jobId) || typeof row.jobName !== 'string' || !row.jobName.trim() || job && row.jobId.toLowerCase() !== job.toLowerCase()
      || row.definitionVersion != null && !positiveLong(row.definitionVersion) || typeof row.triggerType !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(row.triggerType)
      || !validTime(row.executionStartedAt) || !validTime(row.recordedAt) || row.taskType != null && typeof row.taskType !== 'string' || row.deliveryMethod != null && typeof row.deliveryMethod !== 'string') incomplete()
    if (row.targetDeviceCount != null && !validCount(row.targetDeviceCount)) incomplete()
    const counters = [row.totalTargets, row.acceptedTargets, row.succeededTargets, row.failedTargets, row.skippedTargets]
    if (row.terminalStatus == null) {
      if (row.finishedAt != null || counters.some(number => number != null)) incomplete()
    } else if (!['SUCCEEDED', 'PARTIAL_FAILED', 'FAILED'].includes(row.terminalStatus) || !validTime(row.finishedAt) || !counters.every(validCount)) incomplete()
    const key = row.id.toLowerCase(); unique.add(key)
    const deliveryLabel = (row.taskType === 'DATA_DOWNLINK' || row.taskType === 'DATA_DOWNLINK_FUNCTION') && (row.deliveryMethod === 'MQTT' || row.deliveryMethod === 'TCP') ? row.deliveryMethod : '—'
    return { key, taskLabel: row.jobName, taskHref: links ? `/tasks/jobs/${row.jobId}` : undefined,
      typeLabel: row.taskType && Object.hasOwn(taskTypes,row.taskType) ? taskTypes[row.taskType]! : '—',
      sourceLabel: Object.hasOwn(taskSources,row.triggerType) ? taskSources[row.triggerType]! : '—', at: row.executionStartedAt, countLabel: row.targetDeviceCount == null ? '—' : String(row.targetDeviceCount), deliveryLabel, ...(row.targetDeviceCount == null ? {} : { deviceCount: row.targetDeviceCount }) }
  })
  return { rows, clearToken: cas(value.projectVersion) }
}
/** 只把原OTA作业的SUCCEEDED显示成功；受理、无需升级和未知均保留独立含义。 */
function otaDisplay(value: NonNullable<Schema<'TaskLogDeviceItem'>['otaUpgrade']>) {
  if (!value || !validId(value.decisionId) || !['ACCEPTED','NO_UPDATE','REJECTED'].includes(value.decision) || typeof value.terminal !== 'boolean') incomplete()
  for (const key of ['reason','observedVersion','targetVersion','jobStatus'] as const) if (value[key] !== null && typeof value[key] !== 'string') incomplete()
  for (const key of ['firmwareId','campaignId','jobId'] as const) if (value[key] !== null && !validId(value[key])) incomplete()
  if (value.decision !== 'ACCEPTED' && (!value.terminal || value.jobStatus !== null)) incomplete()
  const reasons: Record<string,string> = { REPORT_MISSING:'缺少设备版本报告', REPORT_STALE:'设备版本报告已过期', IDENTITY_CHANGED:'设备身份已变更', VERSION_UNCONFIRMED:'设备当前版本无法确认', AMBIGUOUS_FIRMWARE:'存在多个相同版本的可用固件' }
  const rejectedLabel = value.reason && Object.hasOwn(reasons,value.reason) ? `升级未受理：${reasons[value.reason]}` : '升级未受理'
  const otaLabel = value.decision === 'NO_UPDATE' ? '无需升级' : value.decision === 'REJECTED' ? rejectedLabel
    : value.jobStatus === 'SUCCEEDED' && value.terminal ? '升级成功' : !value.jobStatus ? '升级结果待确认' : value.terminal ? '升级未完成' : '升级已受理'
  const versions = [value.observedVersion === null ? '' : `原版本：${value.observedVersion}`, value.targetVersion === null ? '' : `目标版本：${value.targetVersion}`].filter(Boolean)
  return { otaLabel, ...(versions.length ? { otaVersion: versions.join('；') } : {}) }
}
/** 成员数和本窗均由同一个历史目标集合产生；零不是未知，受理不是成功。 */
function devicePage(value: Schema<'TaskLogDevicePage'>, log: string): TaskDebugDeviceRead {
  if (!value || !validId(value.logId) || value.logId.toLowerCase() !== log.toLowerCase() || !validId(value.jobId) || !validId(value.executionId)
    || !validTime(value.executionStartedAt) || !validCount(value.deviceCount) || !Array.isArray(value.items) || value.items.length > 20 || typeof value.hasMore !== 'boolean') incomplete()
  const cursor = value.nextCursor
  if (cursor != null && (typeof cursor !== 'string' || !cursor || cursor.length > 8192) || value.hasMore !== !!cursor || value.hasMore && !value.items.length || value.items.length > value.deviceCount) incomplete()
  const keys = new Set<string>()
  const rows = value.items.map((row: Schema<'TaskLogDeviceItem'>) => {
    if (!row || !validId(row.deviceId) || keys.has(row.deviceId.toLowerCase()) || typeof row.deviceReadable !== 'boolean'
      || row.deviceName !== null && (typeof row.deviceName !== 'string' || !row.deviceName.trim())
      || typeof row.targetStatus !== 'string' || !['PENDING','ACCEPTED','SUCCEEDED','FAILED','TIMED_OUT','SKIPPED'].includes(row.targetStatus)
      || row.acceptedAt !== null && !validTime(row.acceptedAt) || row.completedAt !== null && !validTime(row.completedAt)) incomplete()
    const key = row.deviceId.toLowerCase(); keys.add(key)
    return { key, label: row.deviceName ?? key, readable: row.deviceReadable, status: row.targetStatus, acceptedAt: row.acceptedAt, completedAt: row.completedAt, ...(Object.hasOwn(row,'otaUpgrade') ? otaDisplay(row.otaUpgrade!) : {}) }
  })
  return { logKey: value.logId.toLowerCase(), jobKey: value.jobId.toLowerCase(), executionKey: value.executionId.toLowerCase(), at: value.executionStartedAt, deviceCount: value.deviceCount, rows, ...(cursor ? { continuation: cursor } : {}) }
}
export const taskDebugLogTransport: TaskDebugLogTransport = {
  readDevices: async (project, log, cursor, signal) => devicePage(await getTaskDebugLogDevices(project, log, cursor, signal), log),
  readRows: async (project, job, number, signal) => page(await getConsoleTaskDebugLogs(project, job, undefined, signal, number), job),
  readSwitch: async (project, job, signal) => control(await getConsoleTaskDebugControl(project, job, signal)),
  changeSwitch: async (project, job, token, checked) => control(await setConsoleTaskDebugControl(project, job, token, checked)),
  eraseTask: async (project, job, token) => control(await clearConsoleTaskDebugLogs(project, job, token)),
  eraseProject: async (project, token) => {
    const value = await clearConsoleProjectTaskDebugLogs(project, token)
    if (!value) incomplete()
    return cas(value.version)
  }
}
