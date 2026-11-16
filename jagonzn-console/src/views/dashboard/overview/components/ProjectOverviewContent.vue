<template>
  <div class="project-overview" :class="{ 'project-overview--compact': compact }">
    <section class="project-overview__cards project-overview__cards--rates" aria-label="设备比例">
      <ElCard
        v-for="item in rateCards"
        :key="item.key"
        shadow="never"
        class="overview-card overview-card--rate"
        :class="{ 'overview-card--distribution': item.distribution && item.available }"
      >
        <ElSkeleton animated :loading="loading">
          <template #template>
            <ElSkeletonItem variant="text" class="overview-card__label-skeleton" />
            <ElSkeletonItem variant="circle" class="overview-card__chart-skeleton" />
          </template>
          <template #default>
            <p class="overview-card__label console-description">{{ item.label }}</p>
            <DeviceActivityChart
              v-if="item.key === 'active24h'"
              class="overview-card__chart"
              :data="activity.data"
              :available="activity.available"
            />
            <ArtRingChart
              v-else
              class="overview-card__chart"
              :data="item.chartData"
              :center-text="item.rateText"
              :colors="item.colors"
              :show-tooltip="item.distribution"
              :show-legend="item.distribution"
              :show-legend-percent="item.key === 'kind' || item.key === 'online'"
              :show-legend-value="item.key === 'online'"
              :centered="compact && item.distribution"
              :radius="compact && item.distribution ? ['44px', '70px'] : undefined"
              :is-empty="!item.available"
              height="204px"
            />
          </template>
        </ElSkeleton>
      </ElCard>
    </section>
    <OverviewStatistics v-if="projectId" :project-id="projectId" :identity="identity" />
  </div>
</template>

<script setup lang="ts">
  import DeviceActivityChart from './DeviceActivityChart.vue'
  import { onlineDistribution, activityDistribution } from '@/utils/device-presence-distribution'
  import OverviewStatistics from './OverviewStatistics.vue'
  import type { OverviewResponse } from '@/api/overview'
  import { alarmDistribution } from '@/utils/alarm-distribution'
  import { deviceKindDistribution } from '@/utils/device-kind-distribution'

  const props = withDefaults(
    defineProps<{
      projectId: string
      identity: string
      overview?: OverviewResponse
      loading?: boolean
      compact?: boolean
    }>(),
    { loading: false, compact: false }
  )
  const overview = computed(() => props.overview)
  const distribution = computed(() => alarmDistribution(overview.value))

  /** 概要契约中的比率为 [0, 1]；展示层才转成百分数，避免把 0.5 误显示成 0.5%。 */
  const formatRate = (value?: number) =>
    typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '—'

  const activity = computed(() => activityDistribution(overview.value))

  const rateCards = computed(() => {
    const devices = overview.value?.devices
    const alarmRate = overview.value?.alarmRate
    const alarmValue = alarmRate?.value
    const alarm = distribution.value
    const online = onlineDistribution(overview.value)
    const kinds = deviceKindDistribution(overview.value)
    const alarmAvailable = alarm.available && typeof alarmValue === 'number'
    return [
      {
        key: 'online',
        distribution: true,
        label: '当前在线率',
        rateText: formatRate(devices?.onlineRate),
        chartData: online.data,
        available: online.available,
        colors: ['#30a46c', '#cbd5e1']
      },
      {
        key: 'active24h',
        distribution: true,
        label: '24 小时活跃率',
        rateText: formatRate(devices?.active24hRate),
        chartData: [],
        available: activity.value.available,
        colors: ['#409EFF', '#E9EDF2']
      },
      {
        key: 'alarm',
        distribution: true,
        label: '告警设备分布',
        rateText: alarmAvailable ? formatRate(alarmValue) : '—',
        chartData: alarm.data,
        available: alarmAvailable,
        colors: alarm.colors
      },
      {
        key: 'kind',
        distribution: true,
        label: '设备接入类型',
        rateText: kinds.available ? `${kinds.total} 台` : '—',
        chartData: kinds.data,
        available: kinds.available,
        colors: kinds.colors
      }
    ]
  })
</script>

<style lang="scss" scoped>
  .project-overview {
    container: project-overview / inline-size;
    min-width: 0;

    &__header {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 10px;

      h3 {
        margin: 0 0 6px;
      }

      p {
        margin: 0;
        color: var(--el-text-color-secondary);
      }
    }

    &__cards {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
  }

  .overview-card {
    min-height: 140px;

    &__label {
      margin: 0;
      font-size: 14px;
      color: var(--el-text-color-secondary);
    }

    &__value {
      display: block;
      margin-top: 10px;
      font-size: 28px;
      line-height: 1.1;
      color: var(--el-text-color-primary);
    }

    &__label-skeleton {
      width: 38%;
    }

    &__value-skeleton {
      width: 56%;
      height: 32px;
      margin-top: 10px;
    }

    &--rate {
      min-height: 280px;
    }

    &__chart-skeleton {
      width: 140px;
      height: 140px;
      margin: 10px auto;
      border-radius: 50%;
    }

    &__chart {
      margin-top: 4px;
    }
  }

  @media screen and (width <= 1100px) {
    .project-overview__cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media screen and (width <= 640px) {
    .project-overview {
      &__header {
        flex-direction: column;
        align-items: stretch;
      }

      &__header .el-button {
        align-self: flex-start;
      }

      &__cards {
        grid-template-columns: 1fr;
      }
    }
  }

  // The workbench owns column width and outer spacing; this content adds no page padding.
  .project-overview--compact {
    display: flex;
    flex-direction: column;
    gap: 16px;

    .project-overview__cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin: 0;
    }

    :deep(.overview-statistics) {
      margin-top: 0;
    }

    :deep(.overview-statistics .el-radio-button__inner) {
      font-size: 14px;
    }
  }

  @container project-overview (max-width: 480px) {
    .project-overview--compact .project-overview__cards {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
