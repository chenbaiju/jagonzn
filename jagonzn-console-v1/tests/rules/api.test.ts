import { beforeEach, describe, expect, it, vi } from 'vitest'
const { send } = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('../../src/core/http',async importOriginal=>({...await importOriginal<typeof import('../../src/core/http')>(),api:send}))
import { activateRule, saveRule, saveRuleInformation, runTask, deleteTask, debugRule, saveTaskInformation } from '../../src/features/rules/api'
beforeEach(() => { send.mockReset() })
describe('规则任务适配器合同', () => {
  it('CAS 为查询参数，发布无业务body', async () => {
    send.mockResolvedValue({}); await activateRule('p', 'r', 'v', 8)
    expect(send).toHaveBeenCalledWith('/api/v1/projects/p/message-rules/r/versions/v/activate', { method: 'post', query: { expectedVersion: 8 } })
  })
  it('修订完整动作并保留CAS', async () => {
    const body = { name: '规则', source: 'source', expectedVersion: 8, actions: [{ nodeType: 'one', config: {} }, { nodeType: 'two', config: {} }] }
    send.mockResolvedValue({}); await saveRule('p', 'r', body)
    expect(send.mock.calls[0][1].body).toEqual(body)
  })
  it('运行无body，未知结果不自动重提', async () => {
    send.mockRejectedValue(new Error('未知')); await expect(runTask('p', 'j')).rejects.toThrow('未知')
    expect(send).toHaveBeenCalledTimes(1); expect(send).toHaveBeenCalledWith('/api/v1/projects/p/task-jobs/j/runs', { method: 'post' })
  })
  it('删除使用调用方CAS', async () => { send.mockResolvedValue(undefined); await deleteTask('p', 'j', 3); expect(send.mock.calls[0][1]).toEqual({ method: 'delete', query: { expectedVersion: 3 } }) })
  it('沙箱输入使用JSON字符串字段', async () => { send.mockResolvedValue({}); await debugRule('p', 'r', 'v', '{}'); expect(send.mock.calls[0][1].body).toEqual({ inputJson: '{}' }) })
})

it('任务运行可选幂等键只放header，无body且不声称成功重放', async () => {
  send.mockResolvedValue({}); await runTask('p', 'j', 'run-key'); expect(send).toHaveBeenCalledWith('/api/v1/projects/p/task-jobs/j/runs', { method: 'post', headers: { 'Idempotency-Key': 'run-key' } }); expect(() => runTask('p', 'j', 'x'.repeat(129))).toThrow('128')
})

it('正式Console运行发送启用状态前置，保留无body', async () => {
  send.mockResolvedValue({}); await runTask('p', 'j', undefined, true); expect(send).toHaveBeenCalledWith('/api/v1/projects/p/task-jobs/j/runs', { method: 'post', query: { requireEnabled: true } })
})

it('名称描述兼容写保留过去的ONCE参数，不触发客户端调度重算', async () => {
  send.mockResolvedValue({}); const body = { name:'名称',scheduleType:'ONCE' as const,runAt:'2020-01-01T00:00:00Z',timezone:'Asia/Shanghai',targetType:'ALL_DEVICES' as const,commandKey:'set',input:{},enabled:false,expectedVersion:4 }; await saveTaskInformation('p','j',body); expect(send).toHaveBeenCalledWith('/api/v1/projects/p/task-jobs/j',{method:'put',query:{informationOnly:true},body})
})

it('规则信息修改使用同路径显式模式和最小已有字段，不把隐藏源码动作作为新版本发送', async () => {
  send.mockResolvedValue({}); await saveRuleInformation('p', 'r', { name: '名称', description: '说明', expectedVersion: 9 })
  expect(send).toHaveBeenCalledWith('/api/v1/projects/p/message-rules/r', { method: 'put', query: { informationOnly: true }, body: { name: '名称', description: '说明', expectedVersion: 9 } })
  expect(send.mock.calls[0][1].body).not.toHaveProperty('source'); expect(send.mock.calls[0][1].body).not.toHaveProperty('actions')
})
it('规则信息的空名称、超长说明或无效CAS在写请求之前拒绝', () => {
  expect(() => saveRuleInformation('p', 'r', { name: ' ', expectedVersion: 1 })).toThrow()
  expect(() => saveRuleInformation('p', 'r', { name: '名称', description: 'x'.repeat(513), expectedVersion: 1 })).toThrow()
  expect(() => saveRuleInformation('p', 'r', { name: '名称', expectedVersion: 0 })).toThrow()
  expect(send).not.toHaveBeenCalled()
})
