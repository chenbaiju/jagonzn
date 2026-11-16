/**
 * 时间格式化工具
 *
 * 后端一律返回 RFC3339 UTC（如 2026-08-11T02:31:46.979534+00），
 * 格式化只在前端做，统一按东八区显示，不随浏览器时区变化。
 * 原始时间字符串仍由接口和状态模型保留，展示格式不参与筛选或分页。
 *
 * @module utils/time
 * @author Things Link Team
 */

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)

/** 统一日期时间格式：YYYY-MM-DD HH:mm:ss */
export const DATE_TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss'

/** 统一日期格式：YYYY-MM-DD */
export const DATE_FORMAT = 'YYYY-MM-DD'

/** 统一时间格式：HH:mm:ss */
export const TIME_FORMAT = 'HH:mm:ss'

/**
 * 格式化日期时间为 YYYY-MM-DD HH:mm:ss，固定按东八区显示。
 * @param value RFC3339 UTC 字符串或任意 dayjs 可解析的时间值
 * @param placeholder 值为空时返回的占位符，默认 '—'
 */
export const formatTime = (value?: string | null, placeholder = '—'): string => {
  if (!value) return placeholder
  const d = dayjs.utc(value).utcOffset(480)
  return d.isValid() ? d.format(DATE_TIME_FORMAT) : placeholder
}

/** 固定按 GMT+8 显示日期时间，仅用于展示，不改写查询用的原始时间。 */
export const formatTimeGmt8 = formatTime

/**
 * 纯日期展示按东八区格式化为 YYYY-MM-DD。
 */
export const formatDate = (value?: string | null, placeholder = '—'): string => {
  if (!value) return placeholder
  const d = dayjs.utc(value).utcOffset(480)
  return d.isValid() ? d.format(DATE_FORMAT) : placeholder
}

/**
 * 格式化为相对时间（如"3分钟前""2小时前"）
 */
export const formatRelative = (value?: string | null, placeholder = '—'): string => {
  if (!value) return placeholder
  const d = dayjs.utc(value)
  if (!d.isValid()) return placeholder
  const now = dayjs()
  const diffSec = now.diff(d, 'second')
  if (diffSec < 60) return '刚刚'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时前`
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}天前`
  // 兼容现有调用；绝对时间回落也遵循平台的固定东八区展示规则。
  return formatTime(value, placeholder)
}
