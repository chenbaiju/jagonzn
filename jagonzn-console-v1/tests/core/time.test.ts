import { describe, expect, it } from 'vitest'
import { formatTime, relativeTime } from '@/core/time'
describe('东八区展示边界', () => {
  it('统一秒级格式，并正确跨日', () => {
    expect(formatTime('2026-10-23T18:05:33.678Z')).toBe('2026-10-24 02:05:33')
    expect(formatTime('2026-10-24T00:05:33-04:00')).toBe('2026-10-24 12:05:33')
  })
  it('不将无时区/空/非法输入猜测为本地时区', () => {
    for (const value of ['', null, undefined, '2026-10-24 12:00:00', 'invalidZ']) expect(formatTime(value)).toBe('—')
  })
  it('接受真实 Date 与 epoch，不将0当成空值', () => {
    expect(formatTime(0)).toBe('1970-01-01 08:00:00')
    expect(formatTime(new Date('2026-10-23T16:00:00Z'))).toBe('2026-10-24 00:00:00')
  })
})
describe('目录最近在线相对时间', () => {
  const now = new Date('2026-11-15T12:00:00Z')
  it('按分钟、小时、天展示，并覆盖原站已观察的天前形态', () => {
    expect(relativeTime('2026-11-15T11:59:30Z', now)).toBe('刚刚')
    expect(relativeTime('2026-11-15T11:30:00Z', now)).toBe('30分钟前')
    expect(relativeTime('2026-11-15T09:00:00Z', now)).toBe('3小时前')
    expect(relativeTime('2026-11-10T12:00:00Z', now)).toBe('5天前')
  })
  it('不猜测无时区、空和非法输入，未来时钟不显示负值', () => {
    for (const value of ['', null, undefined, '2026-11-15 12:00:00', 'invalidZ']) expect(relativeTime(value, now)).toBe('')
    expect(relativeTime('2026-11-15T12:01:00Z', now)).toBe('刚刚')
  })
})
