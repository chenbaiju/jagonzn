import type { OverviewResponse } from '@/api/overview'

const validCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** 在线与离线覆盖同一概要的全部设备，缺失值不能当成零。 */
export function onlineDistribution(snapshot?: OverviewResponse) {
  const total = snapshot?.devices?.total
  const online = snapshot?.devices?.online
  if (!validCount(total) || !validCount(online) || online > total) {
    return { available: false, data: [] }
  }
  return {
    available: true,
    data: [
      { name: '在线设备', value: online },
      { name: '离线设备', value: total - online }
    ]
  }
}

/** 四档互斥；前三档之和必须与原24小时活跃数一致。 */
export function activityDistribution(snapshot?: OverviewResponse) {
  const counts = snapshot?.deviceActivityCounts
  const total = snapshot?.devices?.total
  const active = snapshot?.devices?.active24h
  const unknown = { available: false, data: [] }
  if (!counts || !validCount(total) || !validCount(active)) return unknown
  const data = [
    { name: '5分钟内', value: counts.WITHIN_5M, color: '#8b5cf6' },
    { name: '1小时内', value: counts.WITHIN_1H, color: '#a78bfa' },
    { name: '1天内', value: counts.WITHIN_24H, color: '#c4b5fd' },
    { name: '1天以上', value: counts.OVER_24H, color: '#cbd5e1' }
  ]
  if (data.some(({ value }) => !validCount(value))) return unknown
  if (data.reduce((sum, item) => sum + item.value!, 0) !== total) return unknown
  if (data.slice(0, 3).reduce((sum, item) => sum + item.value!, 0) !== active) return unknown
  return { available: true, data: data.map((item) => ({ ...item, value: item.value! })) }
}
