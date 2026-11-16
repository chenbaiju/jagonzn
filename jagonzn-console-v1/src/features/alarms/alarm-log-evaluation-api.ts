import { api } from '../../core/http'
import type { Schema } from '../../core/contracts'
import type { AlarmLog } from './alarm-transition-log-api'
import { alarmEventEvaluationDisplay, type AlarmEventEvaluationDisplay } from './alarm-event-evaluation-display'

export type AlarmLogEvaluation = Readonly<Required<Schema<'ConsoleAlarmLogEvaluationResponse'>>>
export type AlarmLogEvaluationRead = Readonly<{ response: AlarmLogEvaluation; display: AlarmEventEvaluationDisplay | null }>
type Expected = Pick<AlarmLog,'id'|'instanceId'|'ruleId'|'deviceId'|'createdAt'>
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const fields = ['eventId','instanceId','ruleId','deviceId','createdAt','kind','evaluationSnapshotJson']
const invalid = () => new Error('原始告警事件身份或资料不一致')
/** 与已核验历史行逐项绑定；旧协议没有原件，坏typed不得改报legacy。 */
export function alarmLogEvaluationResponse(value: unknown, project: string, expected: Expected): AlarmLogEvaluationRead {
  if (!uuid.test(project) || [expected.id,expected.instanceId,expected.ruleId,expected.deviceId].some(id=>!uuid.test(id))) throw invalid()
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![null,Object.prototype].includes(Object.getPrototypeOf(value))) throw invalid()
  const keys = Reflect.ownKeys(value)
  if (keys.length !== fields.length || keys.some(key=>typeof key !== 'string' || !fields.includes(key)
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(value,key)!,'value'))) throw invalid()
  const row = value as Record<string,unknown>
  if (row.eventId !== expected.id || row.instanceId !== expected.instanceId || row.ruleId !== expected.ruleId
    || row.deviceId !== expected.deviceId || row.createdAt !== expected.createdAt) throw invalid()
  let display: AlarmEventEvaluationDisplay | null = null
  if (row.kind === 'LEGACY_SCALAR') { if (row.evaluationSnapshotJson !== null) throw invalid() }
  else if (row.kind === 'TYPED_V1' && typeof row.evaluationSnapshotJson === 'string') {
    display = alarmEventEvaluationDisplay(row.evaluationSnapshotJson,{projectId:project,deviceId:expected.deviceId,ruleId:expected.ruleId})
  } else throw invalid()
  return Object.freeze({ response: Object.freeze({...row}) as AlarmLogEvaluation, display })
}
/** 单次按事件读原件；显式大正文预算仅由共享层精确GET白名单放行。 */
export const alarmLogEvaluationApi = {
  async get(project: string, expected: Expected, signal?: AbortSignal): Promise<AlarmLogEvaluationRead> {
    if (!uuid.test(project) || !uuid.test(expected.id)) throw invalid()
    const path = `/api/v1/projects/${project}/console/alarm-logs/${expected.id}/evaluation` as const
    return alarmLogEvaluationResponse(await api<Schema<'ConsoleAlarmLogEvaluationResponse'>>(path,
      {signal,maxResponseBytes:12*1024*1024}),project,expected)
  },
}
