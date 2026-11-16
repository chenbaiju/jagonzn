import { effectScope } from 'vue'
import { describe, expect, it } from 'vitest'
import { useResource } from '@/core/use-resource'
import { ApiError, changeIdentity } from '@/core/http'
describe('列表迟到与失权清理', () => {
  it('快速切换筛选时旧结果不能覆盖新结果', async () => {
    const pending: ((v: string) => void)[] = []
    const scope = effectScope(), state = scope.run(() => useResource(() => new Promise<string>(resolve => pending.push(resolve))))!
    const first = state.reload(), second = state.reload()
    pending[1]('new'); await second; pending[0]('old'); await first
    expect(state.data.value).toBe('new'); scope.stop()
  })
  it('身份变化立即移除旧数据并阻止迟到显示', async () => {
    let resolve!: (v: string) => void
    const scope = effectScope(), state = scope.run(() => useResource(() => new Promise<string>(done => { resolve = done })))!
    const pending = state.reload(); changeIdentity(); resolve('secret'); await pending
    expect(state.data.value).toBeUndefined(); expect(state.error.value).toBeUndefined(); expect(state.loading.value).toBe(false)
    scope.stop()
  })
  it.each([401, 403, 404])('重读被拒绝或资源移除（%s）后清除旧结果并保留错误', async status => {
    let rejected = false
    const cause = new ApiError('当前资源不可读', status)
    const scope = effectScope(), state = scope.run(() => useResource(async () => {
      if (rejected) throw cause
      return { source: '不应继续保留的旧内容' }
    }))!
    try {
      await state.reload()
      expect(state.data.value).toBeDefined()
      rejected = true
      await state.reload()
      expect(state.data.value).toBeUndefined()
      expect(state.error.value).toBe(cause)
      expect(state.loading.value).toBe(false)
    } finally { scope.stop() }
  })
})
