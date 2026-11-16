import type { Rule } from './models'
import { cas } from './models'

/** 错误的父定义不允许保留旧名称或启动其日志等子资源读取。 */
export class RuleDefinitionReadError extends Error {
  constructor(message='规则返回身份、版本或状态不完整，请重新读取') { super(message) }
}

/** 仅核对已有生成合同中的身份、可提交CAS与封闭生命周期，不重写服务端定义。 */
export function checkedRuleDefinition(value: Rule, requestedId: string): Rule {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !requestedId || value.id !== requestedId
    || !['DRAFT', 'ACTIVE', 'PAUSED'].includes(value.status || '')) throw new RuleDefinitionReadError()
  if (typeof value.version === 'number' && Number.isInteger(value.version) && !Number.isSafeInteger(value.version)) throw new RuleDefinitionReadError('规则版本超出浏览器可精确表示的安全整数范围，请刷新后重试')
  try { cas(value.version) } catch { throw new RuleDefinitionReadError() }
  return value
}
