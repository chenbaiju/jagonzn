import type { MessageUnitQuotaResponse, QuotaMetricUsageResponse } from '@/api/quota'
import { subscriptionStatusLabel } from '@/features/plan/plan-summary-model'
import { formatTime } from '@/utils/time'

/** 只转换展示值；不从旧 MESSAGE 计数、套餐目录或浏览器时钟推算新的可用额度。 */
export interface MessageUnitQuotaRow {
  direction: 'UPLINK' | 'DOWNLINK'
  legacyMetric: string
  label: string
  projectOccupiedText: string
  tenantOccupiedText: string
  limitText: string
  remainingText: string
  sharedUsageText: string
  statusText: string
  statusType: 'success' | 'warning' | 'danger' | 'info'
  percentage?: number
  progressStatus?: 'exception'
  snapshotText: string
}

const unavailable = '暂不可用'
const directions = ['UPLINK', 'DOWNLINK'] as const
const count = (value?: number | null): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
const numberText = (value?: number) =>
  value === undefined ? unavailable : value.toLocaleString('zh-CN')

/** 新投影按方向替换旧行；重复或不匹配的投影显示不可用，不能退回旧条数冒充新单位。 */
export function buildMessageUnitQuotaRows(
  quotas?: readonly MessageUnitQuotaResponse[] | null
): MessageUnitQuotaRow[] {
  return directions.flatMap((direction) => {
    const matches = quotas?.filter((quota) => quota.direction === direction) ?? []
    if (!matches.length) return []
    const source = matches.length === 1 ? matches[0] : undefined
    const quota =
      source?.unit === 'MESSAGE_4K' && source.windowKind === 'UTC_DAY' ? source : undefined
    const projectOccupied = count(quota?.projectOccupied)
    const tenantOccupied = count(quota?.tenantOccupied)
    const limit = count(quota?.limit)
    const remaining = count(quota?.remaining)
    const complete =
      projectOccupied !== undefined &&
      tenantOccupied !== undefined &&
      limit !== undefined &&
      remaining !== undefined
    let statusText = unavailable
    let statusType: MessageUnitQuotaRow['statusType'] = 'info'

    switch (quota?.availability) {
      case 'AVAILABLE':
        if (complete) {
          statusText = '可用'
          statusType = 'success'
        }
        break
      case 'EXHAUSTED':
        statusText = '已耗尽'
        statusType = 'danger'
        break
      case 'SUBSCRIPTION_INACTIVE':
        statusText = quota.subscriptionStatus
          ? `订阅不可受理（${subscriptionStatusLabel(quota.subscriptionStatus)}）`
          : '订阅不可受理'
        statusType = 'warning'
        break
      case 'TENANT_INACTIVE':
        statusText = '租户已停用'
        statusType = 'danger'
        break
      case 'CONTRACT_INVALID':
        statusText = '额度合同不可用'
        break
      case 'ADMISSION_DISABLED':
        statusText = '新消息受理未启用'
        break
    }

    const showProgress =
      complete && (quota?.availability === 'AVAILABLE' || quota?.availability === 'EXHAUSTED')
    const limitText = numberText(limit)
    const tenantOccupiedText = numberText(tenantOccupied)
    return [
      {
        direction,
        legacyMetric: `${direction}_MESSAGE`,
        label: `${direction === 'UPLINK' ? '上行' : '下行'}消息（4KiB 单位 / 日）`,
        projectOccupiedText: numberText(projectOccupied),
        tenantOccupiedText,
        limitText,
        remainingText: numberText(remaining),
        sharedUsageText: `${tenantOccupiedText} / ${limitText}`,
        statusText,
        statusType,
        percentage:
          showProgress && limit !== undefined && limit > 0 && tenantOccupied !== undefined
            ? Math.min(100, Math.max(0, (tenantOccupied / limit) * 100))
            : undefined,
        progressStatus: quota?.availability === 'EXHAUSTED' ? ('exception' as const) : undefined,
        snapshotText: quota
          ? `观察于 ${formatTime(quota.observedAt)}；窗口 ${formatTime(quota.windowStart)} 至 ${formatTime(quota.windowEnd)}`
          : '消息单位快照暂不可用'
      }
    ]
  })
}

/** 只移除已由新投影覆盖的方向；其他指标和旧 MESSAGE 的数值、无限语义保持原样。 */
export function withoutProjectedMessageMetrics(
  metrics: readonly QuotaMetricUsageResponse[] | undefined,
  projected: readonly MessageUnitQuotaRow[]
): QuotaMetricUsageResponse[] {
  const replaced = new Set(projected.map((row) => row.legacyMetric))
  return metrics?.filter((metric) => !replaced.has(metric.metric ?? '')) ?? []
}
