import { describe, expect, it } from 'vitest'
import { cas, objectJson, ruleEditor, taskEditor, validateTask, timeRange } from '../../src/features/rules/models'
describe('规则与任务编辑合同', () => {
  it('控制面 CAS 不使用不可变版本序号，复制并保留所有动作', () => {
    const actions = [{ nodeType: 'a', config: { nested: [1, 2] } }, { nodeType: 'b', config: {} }]
    const result = ruleEditor({ id: 'r', version: 9 }, { id: 'v', versionNumber: 3, source: 'return input', actions: JSON.parse(JSON.stringify(actions)) })
    expect(result.expectedVersion).toBe(9); expect(result.actions).toEqual(actions)
    ;(result.actions![0].config as Record<string, unknown>).nested = []
    expect(actions[0].config.nested).toEqual([1, 2])
  })
  it('不完整 actions 不可被隐式清空', () => {
    expect(() => ruleEditor({ id: 'r', version: 1 }, { id: 'v', source: '' })).toThrow()
    expect(() => ruleEditor({ id: 'r', version: 1 }, { id: 'v', source: '', actions: JSON.parse('[{"nodeType":"a"}]') })).toThrow()
    expect(ruleEditor({ id: 'r', version: 1 }, { id: 'v', source: '', actions: JSON.parse('[]') }).actions).toEqual([])
  })
  it.each([undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])('拒绝不安全 CAS %s', value => expect(() => cas(value)).toThrow())
  it.each(['null', '[]', '2', 'true', '"x"', '{'])('拒绝非对象参数 %s', value => expect(() => objectJson(value)).toThrow())
  it('任务回填保留版本、启停、时区和目标，隐藏字段不误提交', () => {
    const value = taskEditor({ tags:{}, actionType: 'COMMAND', name: '任务', commandKey: 'set', scheduleType: 'CRON', cronExpression: '0 * * * * *', timezone: 'Asia/Shanghai', targetType: 'ALL_DEVICES', status: 'PAUSED', input: JSON.parse('{"value":1}'), version: 4 })
    expect(value.expectedVersion).toBe(4); expect(value.enabled).toBe(false)
    expect(validateTask({ ...value, targetGroupId: 'stale', runAt: 'stale' })).toMatchObject({ targetGroupId: undefined, runAt: undefined })
    expect(() => validateTask({ ...value, targetType: 'DEVICE_GROUP' })).toThrow('设备组')
    expect(() => validateTask({ ...value, scheduleType: 'ONCE', runAt: '2026-10-24T10:00' })).toThrow('时区')
  })
})

it('执行时间范围保留明确偏移，空值交服务端默认', () => {
  expect(timeRange()).toEqual({ from: undefined, to: undefined })
  expect(timeRange('2026-10-24T08:00:00+08:00', '2026-10-24T01:00:00Z')).toEqual({ from: '2026-10-24T08:00:00+08:00', to: '2026-10-24T01:00:00Z' })
  expect(() => timeRange('2026-10-24T08:00:00')).toThrow('时区')
  expect(() => timeRange('2026-10-24T08:00:00Z', '2026-10-24T07:00:00Z')).toThrow('早于')
})
