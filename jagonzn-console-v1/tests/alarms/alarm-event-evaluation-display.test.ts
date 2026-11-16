import { describe, expect, it } from 'vitest'
import { alarmEventEvaluationDisplay } from '../../src/features/alarms/alarm-event-evaluation-display'
import { parseAlarmEvaluationJson, parseAlarmRuleJson, stringifyAlarmEvaluationJson } from '../../src/features/alarms/alarm-rule-json'
import { project, device, rule } from './device-alarm-history-fixture'
import { snapshot, snapshotJson } from './alarm-event-evaluation-fixture'

const expected = { projectId: project, deviceId: device, ruleId: rule }
describe('原始事件精确JSON的只读投影', () => {
  it('精确保留大数、小数、微秒与各属性平台时间依据', () => {
    const raw = snapshotJson(), view = alarmEventEvaluationDisplay(raw, expected)
    expect(view.raw).toBe(raw); expect(view.checkedAt).toBe('2026-10-24T00:00:01.123456Z')
    expect(view.properties.map(row => row.value)).toEqual(['9007199254740993.1234567890123456789','true','未知'])
    expect(view.properties.map(row => row.timeBasis)).toEqual(['ALARM_INTAKE','PLATFORM_ACCEPTED','UNKNOWN'])
    expect(view.ruleName).toBe('当时规则名称')
  })
  it.each(['projectId','deviceId','ruleId'] as const)('拒绝%s漂移，不从当前状态补齐', key => {
    expect(() => alarmEventEvaluationDisplay(snapshotJson(), { ...expected, [key]: project === expected[key] ? device : project })).toThrow()
  })
  it('未知属性不得带伪造值、接纳时间或来源', () => {
    const value = snapshot(); value.properties.missing.value = 1 as never
    expect(() => alarmEventEvaluationDisplay(JSON.stringify(value), expected)).toThrow()
  })
  it('已知上报值可以没有可信平台年龄，保留精确值并明确时间未知', () => {
    const value = snapshot()
    value.properties.temperature.acceptedAt = null as never
    value.properties.temperature.timeBasis = 'UNKNOWN'
    const raw = JSON.stringify(value).replace('"PRECISE_NUMBER"','82.1234567890123456789')
    const view = alarmEventEvaluationDisplay(raw,expected)
    expect(view.properties[0]).toMatchObject({known:true,value:'82.1234567890123456789',acceptedAt:null,timeBasis:'UNKNOWN'})
  })
  it.each([true,false])('值已知但时间与依据矛盾仍拒绝 %s', noTime => {
    const value = snapshot()
    if (noTime) value.properties.temperature.acceptedAt = null as never
    else value.properties.temperature.timeBasis = 'UNKNOWN'
    expect(()=>alarmEventEvaluationDisplay(JSON.stringify(value),expected)).toThrow()
  })
  it('原件允许超过96KiB，规则编辑预算保持原限制', () => {
    const source = JSON.stringify({ value: '文'.repeat(40000) })
    expect(() => parseAlarmEvaluationJson(source)).not.toThrow()
    expect(() => parseAlarmRuleJson(source)).toThrow()
    expect(stringifyAlarmEvaluationJson(parseAlarmEvaluationJson(source))).toBe(source)
  })
  it.each(['{"x":1,"x":2}', '{"x":"\\ud800"}', '{"x":1}x', '['.repeat(33)+'0'+']'.repeat(33)])('拒绝损坏原件 %s', source => {
    expect(() => parseAlarmEvaluationJson(source)).toThrow()
  })
  it('UTF8字节越界拒绝，不能按字符数量放行', () => {
    expect(() => parseAlarmEvaluationJson(JSON.stringify('文'.repeat(1800000)))).toThrow()
  })
})
