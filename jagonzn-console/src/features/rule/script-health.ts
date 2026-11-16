import type { MessageRule, RuleScriptHealth } from '@/api/rule-management'

export type ScriptHealthSnapshot = RuleScriptHealth &
  Required<
    Pick<
      RuleScriptHealth,
      | 'ruleId'
      | 'status'
      | 'version'
      | 'executionGeneration'
      | 'consecutiveFailures'
      | 'failureThreshold'
      | 'failureGapSeconds'
    >
  >

/** 两个读取不是同一快照；只在身份、状态、活动版本和精确CAS一致时允许据此确认恢复。 */
export function coherentScriptHealth(
  rule: MessageRule,
  health: RuleScriptHealth
): ScriptHealthSnapshot {
  if (
    !rule.id ||
    health.ruleId !== rule.id ||
    health.status !== rule.status ||
    (health.activeVersionId ?? null) !== (rule.activeVersionId ?? null) ||
    health.version !== rule.version ||
    !['DRAFT', 'ACTIVE', 'PAUSED'].includes(health.status ?? '') ||
    !Number.isSafeInteger(health.version) ||
    health.version! < 1 ||
    !Number.isSafeInteger(health.executionGeneration) ||
    health.executionGeneration! < 1 ||
    !Number.isSafeInteger(health.consecutiveFailures) ||
    health.consecutiveFailures! < 0 ||
    !Number.isSafeInteger(health.failureThreshold) ||
    health.failureThreshold! < 1 ||
    health.consecutiveFailures! > health.failureThreshold! ||
    !Number.isSafeInteger(health.failureGapSeconds) ||
    health.failureGapSeconds! < 1 ||
    (health.status !== 'DRAFT' && !health.activeVersionId) ||
    [health.lastScriptFailureAt, health.autoPausedAt].some(
      (value) => value != null && !Number.isFinite(Date.parse(value))
    ) ||
    (health.pauseReason != null && health.pauseReason !== 'SCRIPT_FAILURE_THRESHOLD') ||
    !!health.autoPausedAt !== (health.pauseReason === 'SCRIPT_FAILURE_THRESHOLD') ||
    (health.autoPausedAt && health.status !== 'PAUSED')
  )
    throw new Error('规则详情与健康状态不一致或版本不可安全表示，请刷新健康状态后再确认。')
  return health as ScriptHealthSnapshot
}

/** 缺少自动暂停来源不能推测为人工暂停；计数保留数据库观测，不按浏览器时钟归零。 */
export function scriptPauseLabel(health: ScriptHealthSnapshot): string {
  if (health.status === 'PAUSED')
    return health.pauseReason === 'SCRIPT_FAILURE_THRESHOLD'
      ? '脚本连续失败自动暂停'
      : '已暂停（未记录脚本自动暂停原因）'
  return health.status === 'ACTIVE' ? '规则已启用' : '草稿未启用'
}

/** 只接受原请求的明确发布回执；读取到相同状态不能替代这项归因。 */
export function isActivationReceipt(
  result: MessageRule,
  ruleId: string,
  versionId: string,
  expected: number
): boolean {
  return (
    result?.id === ruleId &&
    result.status === 'ACTIVE' &&
    result.activeVersionId === versionId &&
    Number.isSafeInteger(result.version) &&
    result.version === expected + 1
  )
}
