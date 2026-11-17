<script setup lang="ts">
  import { computed } from 'vue'
  import type { ProjectQuotaOverviewResponse, QuotaMetricUsageResponse } from '@/api/quota'
  import { buildMessageUnitQuotaRows } from '@/features/quota/message-unit-model'

  const props = defineProps<{
    overview?: ProjectQuotaOverviewResponse
    loading: boolean
    failed: boolean
  }>()
  defineEmits<{ retry: []; resources: [] }>()

  const unitRows = computed(() => buildMessageUnitQuotaRows(props.overview?.messageUnitQuotas))
  const number = (value?: number) =>
    typeof value === 'number' ? value.toLocaleString('zh-CN') : '—'
  // 用量取共享池已用值，不能把当前项目贡献当成共享池总用量；上限只用于换算进度，不展示数值。
  const rows = computed(() => {
    const pool = props.overview?.tenantSharedPool
    const metric = (code: string) => pool?.dailyMetrics?.find((item) => item.metric === code)
    const legacy = (label: string, usage?: QuotaMetricUsageResponse) => ({
      label,
      text: usageText(usage),
      percentage: percentage(usage),
      progressStatus: progressStatus(usage),
      statusText: undefined,
      statusType: undefined,
      snapshotText: undefined
    })
    const message = (direction: 'UPLINK' | 'DOWNLINK') => {
      const quota = unitRows.value.find((row) => row.direction === direction)
      return quota
        ? {
            label: quota.label,
            text: quota.tenantOccupiedText,
            percentage: quota.percentage,
            progressStatus: quota.progressStatus,
            statusText: quota.statusText,
            statusType: quota.statusType,
            snapshotText: quota.snapshotText
          }
        : legacy(
            `${direction === 'UPLINK' ? '上行' : '下行'}消息 / 日`,
            metric(`${direction}_MESSAGE`)
          )
    }
    return [
      legacy('设备数', pool?.deviceCount),
      message('UPLINK'),
      message('DOWNLINK'),
      legacy('通知投递 / 日', metric('NOTIFICATION_DELIVERY'))
    ]
  })
  // 概况只展示用量，不在面板上暴露共享池上限。
  const usageText = (usage?: QuotaMetricUsageResponse) => (usage ? number(usage.used) : '—')
  // 缺失、未设上限和零额度均不伪造百分比；超额保留原始数值，进度条最多填满。
  const percentage = (usage?: QuotaMetricUsageResponse) =>
    typeof usage?.used === 'number' && typeof usage.limit === 'number' && usage.limit > 0
      ? Math.min(100, Math.max(0, (usage.used / usage.limit) * 100))
      : undefined
  const progressStatus = (usage?: QuotaMetricUsageResponse): 'exception' | 'warning' | undefined =>
    usage?.status === 'HARD_LIMIT' || usage?.status === 'DEGRADED'
      ? 'exception'
      : usage?.status === 'SOFT_LIMIT'
        ? 'warning'
        : undefined
</script>

<template>
  <section class="workbench-plan" aria-labelledby="project-overview-heading">
    <div class="workbench-plan__header">
      <h2 id="project-overview-heading">项目概况</h2>
      <ElButton text aria-label="前往项目设置" @click="$emit('resources')">
        <ArtSvgIcon icon="tl:chevron-right" />
      </ElButton>
    </div>
    <ElSkeleton :loading="loading" animated :rows="5">
      <ElAlert v-if="failed" type="warning" title="项目概况暂不可用" :closable="false">
        <ElButton text @click="$emit('retry')">重新读取</ElButton>
      </ElAlert>
      <template v-else>
        <dl class="workbench-plan__usage">
          <div v-for="row in rows" :key="row.label" class="workbench-plan__row">
            <dt :title="row.snapshotText">{{ row.label }}</dt>
            <dd>
              <span>{{ row.text }}</span>
              <ElTag v-if="row.statusText" :type="row.statusType" size="small" disable-transitions>
                {{ row.statusText }}
              </ElTag>
              <ElProgress
                v-if="row.percentage !== undefined"
                :percentage="row.percentage"
                :show-text="false"
                :stroke-width="4"
                :status="row.progressStatus"
                :aria-label="`${row.label}：${row.text}`"
              />
            </dd>
          </div>
          <div class="workbench-plan__row">
            <dt>项目成员</dt>
            <dd>{{ number(overview?.memberCount) }} 人</dd>
          </div>
        </dl>
        <p class="workbench-plan__caption">设备及日用量为租户共享池，成员数为当前项目人数。</p>
        <p v-if="unitRows.length" class="workbench-plan__caption">
          消息按每个原报文每 4KiB 向上取整，按 UTC
          日计量；共享占用包含未决受理，余额不是本项目独享。
        </p>
      </template>
    </ElSkeleton>
  </section>
</template>

<style scoped lang="scss">
  .workbench-plan {
    padding: 20px;
    background: #eaf5fb;
    border: 1px solid var(--console-line);
    border-radius: 4px;

    .dark & {
      background: var(--el-color-primary-light-9);
    }

    &__header {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;

      h2 {
        margin: 0;
        font-size: 14px;
        font-weight: 500;
      }

      .el-button {
        width: 28px;
        padding: 0;
      }
    }

    &__usage {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 0;
      font-size: 14px;
    }

    &__row {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;

      dt {
        color: var(--el-text-color-regular);
      }

      dd {
        min-width: 96px;
        margin: 0;
        font-variant-numeric: tabular-nums;
        text-align: right;
        overflow-wrap: anywhere;
      }

      .el-progress {
        width: 104px;
        margin: 5px 0 0 auto;
      }
    }

    &__caption {
      margin: 16px 0 0;
      font-size: 14px;
      line-height: 1.6;
      color: var(--el-text-color-secondary);
    }
  }
</style>
