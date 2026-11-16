import type { Schema } from '@/core/contracts'
import { can } from '@/core/session'
import { cas } from './models'
import { getConsoleRuleDebugLogs, getConsoleRuleDebugControl, setConsoleRuleDebugControl, clearConsoleRuleDebugLogs, clearConsoleProjectRuleDebugLogs } from './api'
import { debugOperationLabel, debugResultLabel } from './rule-debug-labels'
import { ruleKindLabels, type RuleKind } from './rule-builder-draft'
import type { DebugLogRead, DebugLogTransport, DebugSwitchRead } from './rule-debug-state'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const validId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value)
const validTime = (value: unknown): value is string => typeof value === 'string' && /(Z|[+-]\d{2}:?\d{2})$/i.test(value) && Number.isFinite(Date.parse(value))
function incomplete(): never { throw new Error('规则调试日志返回格式不完整，请重新读取') }
function control(value: Schema<'RuleConsoleLogControl'>): DebugSwitchRead {
  if (!value || typeof value.enabled !== 'boolean' || !Number.isSafeInteger(value.projectGeneration) || value.projectGeneration < 1 || !Number.isSafeInteger(value.ruleGeneration) || value.ruleGeneration < 1) incomplete()
  return { checked: value.enabled, writeToken: cas(value.version) }
}
/** 生成Schema为唯一网络类型；转换后仅保留有据的业务标签，坏页拒绝，未知种类不猜测。 */
function page(value: Schema<'RuleConsoleLogPage'>, rule: string | undefined): DebugLogRead {
  if (!value || !Array.isArray(value.items) || value.items.length > 24 || typeof value.hasMore !== 'boolean') incomplete()
  const cursor = value.nextCursor
  if (cursor != null && (typeof cursor !== 'string' || !cursor || cursor.length > 8192) || value.hasMore !== !!cursor || value.hasMore && value.items.length === 0) incomplete()
  const unique = new Set<string>(), deviceLinks = can('device:read'), ruleLinks = can('rule:manage')
  const rows = value.items.map(row => {
    if (!row || !validId(row.id) || unique.has(row.id.toLowerCase()) || !validId(row.ruleId) || typeof row.ruleName !== 'string' || !row.ruleName.trim() || rule && row.ruleId.toLowerCase() !== rule.toLowerCase()
      || row.deviceId != null && !validId(row.deviceId) || row.deviceName != null && typeof row.deviceName !== 'string' || row.deviceName != null && !row.deviceId
      || row.ruleType != null && typeof row.ruleType !== 'string' || typeof row.sourceKind !== 'string' || row.operationType != null && typeof row.operationType !== 'string'
      || typeof row.resultCode !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(row.resultCode) || !validTime(row.occurredAt) || !validTime(row.recordedAt)) incomplete()
    const key = row.id.toLowerCase(); unique.add(key)
    const result = debugResultLabel(row.sourceKind, row.resultCode)
    return { key, deviceLabel: row.deviceName || row.deviceId || '—', deviceHref: deviceLinks && row.deviceId && row.deviceName != null ? `/devices/${row.deviceId}` : undefined,
      ruleLabel: row.ruleName, ruleHref: ruleLinks ? `/rules/messages/${row.ruleId}` : undefined,
      typeLabel: row.ruleType && Object.hasOwn(ruleKindLabels, row.ruleType) ? ruleKindLabels[row.ruleType as RuleKind].label : '—', operationLabel: debugOperationLabel(row.operationType), at: row.occurredAt, resultLabel: result.label, failed: result.failed, failureCode: result.failed ? row.resultCode : undefined }
  })
  return { rows, continuation: cursor || undefined, clearToken: cas(value.projectVersion) }
}
export const ruleDebugLogTransport: DebugLogTransport = {
  readRows: async (project, rule, cursor, signal) => page(await getConsoleRuleDebugLogs(project, rule, cursor, signal), rule),
  readNumberedRows: async (project, rule, number, signal) => page(await getConsoleRuleDebugLogs(project, rule, undefined, signal, number), rule),
  readSwitch: async (project, rule, signal) => control(await getConsoleRuleDebugControl(project, rule, signal)),
  changeSwitch: async (project, rule, token, checked) => control(await setConsoleRuleDebugControl(project, rule, token, checked)),
  eraseRule: async (project, rule, token) => control(await clearConsoleRuleDebugLogs(project, rule, token)),
  eraseProject: async (project, token) => {
    const value = await clearConsoleProjectRuleDebugLogs(project, token)
    if (!value) incomplete()
    return cas(value.version)
  }
}
