import { describe, expect, it } from 'vitest'
import { alarmLogEvaluationResponse } from '../../src/features/alarms/alarm-log-evaluation-api'
import { project, device, other, row, legacyEvaluation } from './device-alarm-history-fixture'
import { snapshotJson } from './alarm-event-evaluation-fixture'
import backendUnknownAgeSource from './alarm-event-unknown-age.json?raw'
const typed = () => ({ ...legacyEvaluation().response, kind: 'TYPED_V1', evaluationSnapshotJson: snapshotJson() })
describe('原始事件七字段正式读面与已读事件绑定', () => {
  it('typed保留精确属性原件，legacy明确null', () => {
    expect(alarmLogEvaluationResponse(typed(),project,row).display?.properties[0]?.value).toBe('9007199254740993.1234567890123456789')
    expect(alarmLogEvaluationResponse(legacyEvaluation().response,project,row).display).toBeNull()
  })
  it('实际后端严格解码及MVC序列化的已知值/未知年龄原件可回读，不制造时间', () => {
    const envelope = JSON.parse(backendUnknownAgeSource)
    const originalProject = JSON.parse(envelope.evaluationSnapshotJson).projectId
    const result = alarmLogEvaluationResponse(envelope,originalProject,{id:envelope.eventId,
      instanceId:envelope.instanceId,ruleId:envelope.ruleId,deviceId:envelope.deviceId,createdAt:envelope.createdAt})
    expect(result.response.kind).toBe('TYPED_V1')
    expect(result.display?.properties[0]).toMatchObject({key:'n',known:true,
      value:'82.1234567890123456789',acceptedAt:null,timeBasis:'UNKNOWN'})
    expect(result.display?.raw).toBe(envelope.evaluationSnapshotJson)
  })
  it.each(['eventId','instanceId','ruleId','deviceId','createdAt'])('外层%s变化整包拒绝', key => {
    expect(()=>alarmLogEvaluationResponse({...typed(),[key]:other},project,row)).toThrow()
  })
  it('内层项目和设备漂移也拒绝，不能只信外层ID', () => {
    const value = typed(); value.evaluationSnapshotJson = value.evaluationSnapshotJson.replace(`"projectId":"${project}"`,`"projectId":"${device}"`)
    expect(()=>alarmLogEvaluationResponse(value,project,row)).toThrow()
  })
  it.each([{...typed(),kind:'UNKNOWN'}, {...legacyEvaluation().response,evaluationSnapshotJson:'{}'},
    {...typed(),evaluationSnapshotJson:null}, {...typed(),extra:'unrecognized'}])('坏typed或扩展字段不能降级为空快照', value => {
    expect(()=>alarmLogEvaluationResponse(value,project,row)).toThrow()
  })
  it('不执行传入对象的getter', () => {
    let read = false
    const value = Object.defineProperty(typed(),'kind',{enumerable:true,get(){read=true;return 'TYPED_V1'}})
    expect(()=>alarmLogEvaluationResponse(value,project,row)).toThrow(); expect(read).toBe(false)
  })
})
