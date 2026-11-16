import { AlarmRuleJsonNumber, parseAlarmEvaluationJson, stringifyAlarmEvaluationJson,
  type AlarmRuleJson, type AlarmRuleJsonObject } from './alarm-rule-json'

export type AlarmEventPropertyDisplay = Readonly<{ key: string; known: boolean; value: string;
  acceptedAt: string | null; timeBasis: 'ALARM_INTAKE' | 'PLATFORM_ACCEPTED' | 'UNKNOWN' }>
export type AlarmEventEvaluationDisplay = Readonly<{ ruleName: string; checkedAt: string;
  properties: readonly AlarmEventPropertyDisplay[]; raw: string }>
const invalid = () => new Error('原始告警资料不完整')
const rootFields = ['schemaVersion','tenantId','projectId','deviceId','deviceTypeId','modelVersionId','ruleId',
  'ruleVersion','ruleName','configuration','observedAt','checkedAt','checkKind','truth','outcome',
  'recoveryPermitted','matchingSamples','firstMatchAt','receipt','properties']
function object(value: AlarmRuleJson | undefined, fields?: readonly string[]): AlarmRuleJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof AlarmRuleJsonNumber) throw invalid()
  if (fields && (Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value,key)))) throw invalid()
  return value
}
function time(value: AlarmRuleJson | undefined): string {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) throw invalid()
  return value
}
/** 只投影原件已有属性与平台接纳依据；不以当前设备属性补缺，不把微秒/大数转成浮点。 */
export function alarmEventEvaluationDisplay(source: string,
  expected: { projectId: string; deviceId: string; ruleId: string }): AlarmEventEvaluationDisplay {
  const root = object(parseAlarmEvaluationJson(source), rootFields)
  if (!(root.schemaVersion instanceof AlarmRuleJsonNumber) || root.schemaVersion.raw !== '1'
    || root.projectId !== expected.projectId || root.deviceId !== expected.deviceId || root.ruleId !== expected.ruleId
    || typeof root.ruleName !== 'string' || !root.ruleName.trim()) throw invalid()
  const properties = object(root.properties)
  if (Object.keys(properties).length > 200) throw invalid()
  const rows = Object.entries(properties).map(([key,value]): AlarmEventPropertyDisplay => {
    const item = object(value,['dataType','known','value','acceptedAt','origin','timeBasis'])
    if (!key || typeof item.known !== 'boolean'
      || !['ALARM_INTAKE','PLATFORM_ACCEPTED','UNKNOWN'].includes(String(item.timeBasis))) throw invalid()
    if (!item.known && (item.value !== null || item.acceptedAt !== null || item.origin !== null || item.timeBasis !== 'UNKNOWN')) throw invalid()
    if (item.known && (item.origin === null || (item.acceptedAt === null) !== (item.timeBasis === 'UNKNOWN'))) throw invalid()
    const display = !item.known ? '未知' : typeof item.value === 'string' ? item.value : stringifyAlarmEvaluationJson(item.value!)
    return Object.freeze({ key, known: item.known, value: display,
      acceptedAt: item.acceptedAt === null ? null : time(item.acceptedAt),
      timeBasis: item.timeBasis as AlarmEventPropertyDisplay['timeBasis'] })
  })
  return Object.freeze({ ruleName: root.ruleName, checkedAt: time(root.checkedAt),
    properties: Object.freeze(rows), raw: source })
}
