import type { Schema } from '@/core/contracts'
import type { UsageDays } from './api'
const second = 1_000_000_000n, hour = 3600n * second, day = 24n * hour
const invalid = () => new Error('统计窗口或小时数据不完整，请重新读取')
/** 保留服务端Instant的小数秒，严格回读民用日期，避免Date宽松修正与毫秒截断。 */
function exactInstant(value: unknown): bigint {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.([0-9]{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match) throw invalid()
  const [year, month, date, hours, minutes, seconds] = match.slice(1, 7).map(Number)
  if (!year || month! < 1 || month! > 12 || date! < 1 || date! > 31 || hours! > 23 || minutes! > 59 || seconds! > 59) throw invalid()
  const utc = new Date(0); utc.setUTCFullYear(year!, month! - 1, date!); utc.setUTCHours(hours!, minutes!, seconds!, 0)
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() + 1 !== month || utc.getUTCDate() !== date) throw invalid()
  const zone = match[8]!, zoneHours = zone === 'Z' ? 0 : Number(zone.slice(1, 3)), zoneMinutes = zone === 'Z' ? 0 : Number(zone.slice(4, 6))
  if (zoneHours > 23 || zoneMinutes > 59) throw invalid()
  const offset = (zoneHours * 60 + zoneMinutes) * (zone.startsWith('-') ? -1 : 1)
  return BigInt(utc.getTime()) * 1_000_000n + BigInt((match[7] || '').padEnd(9, '0')) - BigInt(offset) * 60n * second
}
function floorHour(value: bigint) { const quotient = value / hour; return (value < 0n && value % hour !== 0n ? quotient - 1n : quotient) * hour }
/** 只转换当前请求窗口的完整UTC小时事实；未知动作保持断线，不补桶或默认零。 */
export function usagePoints(result: Schema<'RuleUsageStatistics'> | Schema<'TaskUsageStatistics'>, kind: 'rule' | 'task', requestedDays: UsageDays) {
  if (!result || ![1, 3, 7, 15, 30].includes(requestedDays) || !Array.isArray(result.items)) throw invalid()
  const from = exactInstant(result.from), to = exactInstant(result.to), first = floorHour(from)
  if (to - from !== BigInt(requestedDays) * day) throw invalid()
  const expected = Number((to - first + hour - 1n) / hour)
  if (expected < 1 || expected > 721 || result.items.length !== expected) throw invalid()
  return result.items.map((bucket, index) => {
    if (!bucket || exactInstant(bucket.hour) !== first + BigInt(index) * hour || !Number.isSafeInteger(bucket.calls) || bucket.calls! < 0) throw invalid()
    const actions: unknown = bucket.actions
    if (kind === 'rule' && actions === null) return { time: bucket.hour!, values: [bucket.calls!, null] }
    if (typeof actions !== 'number' || !Number.isSafeInteger(actions) || actions < 0) throw invalid()
    return { time: bucket.hour!, values: kind === 'task' ? [bucket.calls!] : [bucket.calls!, actions] }
  })
}
/** 总体统计使用当前任务完整执行事实；窗口前事实保留，不将小时曲线相加冒总数。 */
export function taskUsageSummary(executions: Schema<'TaskExecutionResponse'>[], expectedJobId: string) {
  if (!Array.isArray(executions) || !expectedJobId) throw new Error('任务总体统计不可用，请重新读取')
  const ids = new Set<string>(); let latest: string | undefined, latestInstant: bigint | undefined
  for (const execution of executions) {
    if (!execution || typeof execution.id !== 'string' || !execution.id.trim() || ids.has(execution.id) || execution.jobId !== expectedJobId) throw new Error('任务执行事实不完整，请重新读取')
    const at = exactInstant(execution.startedAt)
    ids.add(execution.id)
    if (latestInstant === undefined || at > latestInstant) { latest = execution.startedAt; latestInstant = at }
  }
  return { total: executions.length, latest }
}
