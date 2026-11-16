import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { session } from '../../src/core/session'
import { changeIdentity } from '../../src/core/http'
import { useDeviceAlarmHistory } from '../../src/features/alarms/use-device-alarm-history'
import { project, device, other, rule, event, row, legacyEvaluation } from './device-alarm-history-fixture'
let scope: ReturnType<typeof effectScope> | undefined
function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }) }
function setup() {
  changeIdentity('device-history-fixture-only')
  session.user = { currentProjectId: project, permissions: ['alarm:read', 'device:read'] }
  scope = effectScope()
  return scope.run(() => useDeviceAlarmHistory(() => device, () => rule))!
}
afterEach(() => { scope?.stop(); scope = undefined; vi.unstubAllGlobals(); session.user = null; changeIdentity() })
describe('设备历史组合真实共享HTTP与正式事件解码', () => {
  it('只GET不可变事件列表/详情，设备规则在服务端筛选，不调用事故查询或已读写', async () => {
    const fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => new URL(String(input)).pathname.endsWith('/evaluation') ? response(legacyEvaluation().response)
      : new URL(String(input)).pathname.endsWith(`/${event}`) ? response(row) : response({ items: [row], total: '1', page: 1, limit: 24 }))
    vi.stubGlobal('fetch', fetch)
    const w = setup(); await flushPromises(); await w.openLog(event)
    expect(fetch).toHaveBeenCalledTimes(3)
    const list = new URL(String(fetch.mock.calls[0]![0])), detail = new URL(String(fetch.mock.calls[1]![0]))
    expect(list.pathname).toBe(`/api/v1/projects/${project}/console/alarm-logs`)
    expect(list.searchParams.get('deviceId')).toBe(device); expect(list.searchParams.get('ruleId')).toBe(rule)
    expect(detail.pathname).toBe(`${list.pathname}/${event}`)
    for (const call of fetch.mock.calls) {
      expect((call[1] as RequestInit).method).toBe('GET')
      expect(new Headers((call[1] as RequestInit).headers).get('Authorization')).toBe('Bearer device-history-fixture-only')
    }
    expect(new URL(String(fetch.mock.calls[2]![0])).pathname).toBe(`${list.pathname}/${event}/evaluation`)
    expect(w.evaluation.data.value?.response.kind).toBe('LEGACY_SCALAR')
    expect(w.detail.data.value?.clearReason).toBe('MANUAL')
    expect(w.detail.data.value?.notificationLogs?.[0]?.target).toBe('***')
  })
  it('HTTP200范围漂移整页失败，不将其它设备日志过滤成空成功', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ items: [{ ...row, deviceId: other }], total: '1', page: 1, limit: 24 })))
    const w = setup(); await flushPromises()
    expect(w.list.data.value).toBeUndefined(); expect(String(w.error.value)).toContain('范围外')
  })
  it('实际403拒读清列表，不伪造零事件页或继续发请求', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ message: '没有读取权限' }, 403)); vi.stubGlobal('fetch', fetch)
    const w = setup(); await flushPromises(); await w.refresh()
    expect(w.denied.value).toBe(true); expect(w.list.data.value).toBeUndefined(); expect(fetch).toHaveBeenCalledTimes(1)
  })
})
