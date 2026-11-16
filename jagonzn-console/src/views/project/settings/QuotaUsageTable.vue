<!--
  配额表复用于“当前项目贡献”和“租户共享池”。

  两者共用同一列定义，避免复制页面后出现不同的单位、空值或超额状态展示口径。
-->
<template>
  <ElTable :data="rows" size="default">
    <ElTableColumn label="指标" min-width="150">
      <template #default="{ row }">
        <span :title="row.snapshotText">{{ row.label }}</span>
      </template>
    </ElTableColumn>
    <ElTableColumn :label="unitRows.length ? '已用 / 占用' : '已用'" min-width="110" align="right">
      <template #default="{ row }">{{ row.usedText }}</template>
    </ElTableColumn>
    <ElTableColumn label="共享上限" min-width="110" align="right">
      <template #default="{ row }">{{ row.limitText }}</template>
    </ElTableColumn>
    <ElTableColumn label="共享剩余" min-width="110" align="right">
      <template #default="{ row }">{{ row.remainingText }}</template>
    </ElTableColumn>
    <ElTableColumn label="状态" min-width="100" align="center">
      <template #default="{ row }">
        <ElTag :type="row.statusType" disable-transitions>{{ row.statusText }}</ElTag>
      </template>
    </ElTableColumn>
    <template #empty><ElEmpty description="暂无配额指标" :image-size="72" /></template>
  </ElTable>
  <ElText v-if="unitRows.length" tag="p" type="info" size="small">
    消息按每个原报文每 4KiB 向上取整，按 UTC 日计量，未决受理也占用额度。
    {{ usageScope === 'tenant' ? '占用为租户全部项目合计。' : '占用为当前项目贡献。' }}
    上限与剩余均为租户共享日池，不是本项目独享余额。
  </ElText>
</template>

<script setup lang="ts">
  import type { MessageUnitQuotaResponse, ProjectQuotaScopeResponse } from '@/api/quota'
  import {
    buildMessageUnitQuotaRows,
    withoutProjectedMessageMetrics
  } from '@/features/quota/message-unit-model'

  const props = defineProps<{
    scope?: ProjectQuotaScopeResponse
    messageUnitQuotas?: MessageUnitQuotaResponse[]
    usageScope?: 'project' | 'tenant'
  }>()

  const metricLabels: Record<string, string> = {
    DEVICE_COUNT: '设备数',
    UPLINK_MESSAGE: '上行消息量',
    DOWNLINK_MESSAGE: '下行消息量',
    UPLINK_BYTES: '上行流量',
    TIME_SERIES_POINT: '时序数据点',
    REST_API_CALL: 'REST API 调用',
    WEBSOCKET_CONNECTION: 'WebSocket 连接',
    NOTIFICATION_DELIVERY: '通知投递',
    SCRIPT_EXECUTION: '脚本执行次数',
    AUTOMATION_EXECUTION: '自动化执行次数',
    SCRIPT_CPU_MILLIS: '脚本 CPU 耗时',
    STORAGE_BYTES: '对象存储占用'
  }

  const unitRows = computed(() => buildMessageUnitQuotaRows(props.messageUnitQuotas))

  /** 对应新方向只保留真实原件占用；旧条数及其他指标保持原合同。 */
  const rows = computed(() => {
    const dailyMetrics = withoutProjectedMessageMetrics(props.scope?.dailyMetrics, unitRows.value)
    const legacyRows = props.scope?.deviceCount
      ? [props.scope.deviceCount, ...dailyMetrics]
      : dailyMetrics
    return [
      ...legacyRows.map((row) => ({
        label: metricLabels[row.metric ?? ''] ?? row.metric ?? '—',
        usedText: formatNumber(row.used),
        limitText: formatLimit(row.limit),
        remainingText: formatLimit(row.remaining),
        statusText: statusText(row.status, row.metric, row.limit),
        statusType: statusType(row.status),
        snapshotText: undefined
      })),
      ...unitRows.value.map((row) => ({
        ...row,
        usedText: props.usageScope === 'tenant' ? row.tenantOccupiedText : row.projectOccupiedText
      }))
    ]
  })

  /** 缺失不是零；用破折号保留“不确定”的语义。 */
  const formatNumber = (value?: number | null) =>
    typeof value === 'number' ? new Intl.NumberFormat('zh-CN').format(value) : '—'

  /** null 或缺失上限代表套餐没有为该指标设置硬上限。 */
  const formatLimit = (value?: number | null) =>
    typeof value === 'number' ? formatNumber(value) : '不限'

  const statusText = (status?: string, metric?: string, limit?: number | null) =>
    metric === 'AUTOMATION_EXECUTION' && limit === 0
      ? '未开通'
      : ({ NORMAL: '正常', SOFT_LIMIT: '软限', HARD_LIMIT: '硬限', DEGRADED: '降级' }[
          status ?? ''
        ] ?? '—')

  const statusType = (status?: string) =>
    ({ NORMAL: 'success', SOFT_LIMIT: 'warning', HARD_LIMIT: 'danger', DEGRADED: 'info' })[
      status ?? ''
    ] as 'success' | 'warning' | 'danger' | 'info' | undefined
</script>
