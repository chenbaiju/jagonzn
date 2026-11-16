import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDate, formatRelative, formatTime, formatTimeGmt8 } from '@/utils/time'

/**
 * 时间展示保留原 D-043 转换回归，平台现统一为固定东八区。
 * 进程时区由 tests/setup.ts 钉死为 Asia/Shanghai（UTC+8），固定东八区不受浏览器时区影响的反例另由独立进程验证。
 */
describe('时间格式化（平台东八区）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formatTime 把 UTC 转为平台东八区', () => {
    expect(formatTime('2026-08-20T02:00:00Z')).toBe('2026-08-20 10:00:00')
  })

  it('formatDate 跨日时按东八区日期显示', () => {
    expect(formatDate('2026-08-19T20:00:00Z')).toBe('2026-08-20')
  })

  it('formatRelative 近 1 小时显示相对时间', () => {
    expect(formatRelative('2026-08-20T11:00:00Z')).toBe('1小时前')
  })

  it('formatRelative 超过 30 天回落绝对时间且同样转东八区', () => {
    expect(formatRelative('2026-06-01T00:00:00Z')).toBe('2026-06-01 08:00:00')
  })

  it('空值返回占位符，非法值返回占位符', () => {
    expect(formatTime(null)).toBe('—')
    expect(formatTime('')).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatRelative(null)).toBe('—')
    expect(formatTime('not-a-date')).toBe('—')
  })
})

describe('固定 GMT+8 展示', () => {
  it('转换带纳秒的 UTC 时刻，按秒显示', () => {
    expect(formatTimeGmt8('2026-10-23T08:43:39.488199Z')).toBe('2026-10-23 16:43:39')
  })

  it('跨日及显式时区输入按同一个 GMT+8 时刻显示', () => {
    expect(formatTimeGmt8('2026-10-23T20:43:39.123456789Z')).toBe('2026-10-24 04:43:39')
    expect(formatTimeGmt8('2026-10-23T17:43:39+09:00')).toBe('2026-10-23 16:43:39')
  })

  it('空值和无效时间使用占位符', () => {
    expect(formatTimeGmt8(null)).toBe('—')
    expect(formatTimeGmt8('')).toBe('—')
    expect(formatTimeGmt8('invalid', '不可用')).toBe('不可用')
  })
})
