import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const identity = vi.hoisted(() => ({ epoch: 1 }))
vi.mock('@/utils/http/identity-scope', () => ({ currentIdentityEpoch: () => identity.epoch }))
import { MessageDebugStream } from '../src/utils/message-debug-stream'
class Socket {
  protocol = 'tc-v1'
  close = vi.fn()
  onopen?: () => void
  onmessage?: (event: { data: string }) => void
  onclose?: (event: { code: number }) => void
  frame(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) })
  }
}
const ready = { type: 'READY', projectId: 'p', deviceId: 'd' }
const batch = (start = 0, n = 1, gap = false) => ({
  type: 'MESSAGE_BATCH',
  projectId: 'p',
  deviceId: 'd',
  resyncRequired: gap,
  items: Array.from({ length: n }, (_, i) => ({
    id: String(start + i),
    deviceId: 'd',
    direction: 'UP'
  }))
})
function fixture() {
  const sockets: Socket[] = [],
    onItems = vi.fn(),
    onStatus = vi.fn(),
    onGap = vi.fn(),
    onConnected = vi.fn()
  const factory = vi.fn<(url: string, protocols: string[]) => WebSocket>(() => {
    const s = new Socket()
    sockets.push(s)
    return s as unknown as WebSocket
  })
  const client = new MessageDebugStream({
    token: () => 'secret-jwt',
    onItems,
    onStatus,
    onGap,
    onConnected,
    socketFactory: factory
  })
  client.connect('p', 'd')
  return { client, sockets, onItems, onStatus, onGap, onConnected, factory }
}
beforeEach(() => {
  vi.useFakeTimers()
  identity.epoch = 1
})
afterEach(() => vi.useRealTimers())
it('只在本设备READY后接收，凭据不进入URL，重连触发历史恢复', () => {
  const f = fixture(),
    s = f.sockets[0]!
  expect(f.factory.mock.calls[0]![0]).not.toContain('secret-jwt')
  expect(f.factory.mock.calls[0]![1]).toEqual(['tc-v1', 'bearer.secret-jwt'])
  f.onItems.mockClear()
  s.frame(batch())
  s.frame({ ...ready, deviceId: 'other' })
  expect(f.onItems).not.toHaveBeenCalled()
  expect(f.onConnected).not.toHaveBeenCalled()
  s.frame(ready)
  s.frame(ready)
  s.frame(batch())
  expect(f.onConnected).toHaveBeenCalledTimes(1)
  expect(f.onItems).toHaveBeenLastCalledWith(batch().items)
  s.onclose?.({ code: 1006 })
  expect(f.onGap).toHaveBeenCalledOnce()
  f.client.connect('p', 'd')
  f.sockets[1]!.frame(ready)
  expect(f.onConnected).toHaveBeenCalledTimes(2)
  f.client.close()
})
it('替换设备或身份后旧帧和旧关闭不能污染新状态', () => {
  const f = fixture(),
    old = f.sockets[0]!
  f.client.connect('p', 'd')
  const current = f.sockets[1]!
  f.onItems.mockClear()
  old.frame(ready)
  old.frame(batch())
  old.onclose?.({ code: 1008 })
  expect(f.onItems).not.toHaveBeenCalled()
  current.frame(ready)
  identity.epoch++
  current.frame(batch())
  expect(f.onItems).not.toHaveBeenCalled()
  f.client.close()
})
it('窗口最多200条且去重，过量或跨设备批次不展示', () => {
  const f = fixture(),
    s = f.sockets[0]!
  s.frame(ready)
  for (let i = 0; i < 21; i++) s.frame(batch(i * 10, 10))
  expect(f.onItems.mock.lastCall![0]).toHaveLength(200)
  expect(f.onGap).toHaveBeenCalled()
  s.frame(batch(200, 10))
  expect(f.onItems.mock.lastCall![0]).toHaveLength(200)
  f.onItems.mockClear()
  s.frame(batch(220, 11))
  s.frame({ ...batch(), items: [{ id: 'x', deviceId: 'foreign', direction: 'UP' }] })
  expect(f.onItems).not.toHaveBeenCalled()
  f.client.close()
})
it('心跳超时关闭，失权清空，不自动无限重连', () => {
  const f = fixture(),
    s = f.sockets[0]!
  s.frame(ready)
  s.frame(batch())
  vi.advanceTimersByTime(6000)
  expect(s.close).toHaveBeenCalledWith(4000, 'debug heartbeat timeout')
  s.onclose?.({ code: 1008 })
  expect(f.onItems).toHaveBeenLastCalledWith([])
  expect(f.onStatus).toHaveBeenLastCalledWith('denied')
  vi.advanceTimersByTime(30000)
  expect(f.sockets).toHaveLength(1)
  f.client.close()
})
it('显式过载关闭与采样缺口有可见状态', () => {
  const f = fixture(),
    s = f.sockets[0]!
  s.frame(ready)
  s.frame(batch(0, 10, true))
  expect(f.onGap).toHaveBeenCalledOnce()
  s.onclose?.({ code: 1013 })
  expect(f.onStatus).toHaveBeenLastCalledWith('busy')
  f.client.close()
})
