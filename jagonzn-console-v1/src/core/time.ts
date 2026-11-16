const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
})
/** 接口原始值保持不变，仅在展示边界统一东八区；无时区字符串不猜测时区。 */
export function formatTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string' && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  const parts = Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}
/**
 * 目录卡片最近在线相对时间。原站只观察到“N天前”形态；不足一分钟、未来时钟与更长区间为本系统展示边界，
 * 不把这些分支当成原站已核实语义。无时区或非法输入返回空串，不回退为本地时区猜测。
 */
export function relativeTime(value: string | number | Date | null | undefined, now: number | Date = Date.now()): string {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'string' && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return ''
  const date = value instanceof Date ? value : new Date(value)
  const current = now instanceof Date ? now.getTime() : now
  const time = date.getTime()
  if (!Number.isFinite(time) || !Number.isFinite(current)) return ''
  const diff = current - time
  if (diff < 60_000) return '刚刚'
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}天前`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}个月前`
  return `${Math.floor(days / 365)}年前`
}
