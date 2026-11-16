import type { OverviewResponse } from '@/api/overview'

const categories = [
  { key: 'DIRECT', name: '直连设备', color: '#2563eb' },
  { key: 'GATEWAY', name: '网关', color: '#14b8a6' },
  { key: 'SUB_DEVICE', name: '网关子设备', color: '#8b5cf6' },
  { key: 'UNCLASSIFIED', name: '未分类', color: '#94a3b8' }
] as const

/** 同一服务端快照的全项目计数；缺失或不一致不能当作零或默认直连。 */
export function deviceKindDistribution(snapshot?: OverviewResponse) {
  const counts = snapshot?.deviceKindCounts
  const total = snapshot?.devices?.total
  const unknown = { available: false, total: undefined, data: [], colors: [] }
  if (!counts || !Number.isSafeInteger(total) || total! < 0) return unknown
  const items = categories.map((item) => ({ ...item, value: counts[item.key] }))
  if (items.some(({ value }) => !Number.isSafeInteger(value) || value! < 0)) return unknown
  if (items.reduce((sum, { value }) => sum + value!, 0) !== total) return unknown
  const visible = items.filter(({ key, value }) => key !== 'UNCLASSIFIED' || value! > 0)
  return {
    available: true,
    total,
    data: visible.map(({ name, value }) => ({ name, value: value! })),
    colors: visible.map(({ color }) => color)
  }
}
