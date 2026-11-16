import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from '@/utils/http'
import { getRuleScriptHealth, activateRule } from '@/api/rule-management'
vi.mock('@/utils/http', () => ({ default: { get: vi.fn(), post: vi.fn() } }))
beforeEach(() => vi.resetAllMocks())
describe('规则健康及恢复API接线', () => {
  it('健康只读精确路由不使用执行日志推导计数', () => {
    getRuleScriptHealth('project-a', 'rule-a')
    expect(request.get).toHaveBeenCalledExactlyOnceWith({
      url: '/api/v1/projects/project-a/message-rules/rule-a/script-health',
      headers: { 'Cache-Control': 'no-cache' },
      showErrorMessage: false
    })
    expect(request.post).not.toHaveBeenCalled()
  })
  it('恢复复用原activate和query CAS，不携带计数/代次写回', () => {
    activateRule('project-a', 'rule-a', 'version-a', 9)
    expect(request.post).toHaveBeenCalledExactlyOnceWith({
      url: '/api/v1/projects/project-a/message-rules/rule-a/versions/version-a/activate',
      params: { expectedVersion: 9 },
      data: {},
      showErrorMessage: false
    })
  })
  it('不能精确表示的CAS在发送前拒绝', () => {
    expect(() => activateRule('p', 'r', 'v', Number.MAX_SAFE_INTEGER + 1)).toThrow('无法安全提交')
    expect(request.post).not.toHaveBeenCalled()
  })
})
