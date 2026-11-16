<template>
  <section class="project-device-counts" aria-label="设备数量">
    <ElCard
      v-for="item in deviceCountCards"
      :key="item.label"
      shadow="never"
      class="overview-card overview-card--count"
    >
      <ElSkeleton animated :loading="loading">
        <template #template>
          <ElSkeletonItem variant="text" class="overview-card__label-skeleton" />
          <ElSkeletonItem variant="h1" class="overview-card__value-skeleton" />
          <ElSkeletonItem variant="text" class="overview-card__hint-skeleton" />
        </template>
        <template #default>
          <p class="overview-card__label console-description">{{ item.label }}</p>
          <strong class="overview-card__value">{{ item.value }}</strong>
          <p class="overview-card__hint console-description">{{ item.hint }}</p>
          <span
            class="overview-card__icon"
            :class="`overview-card__icon--${item.tone}`"
            aria-hidden="true"
          >
            <ArtSvgIcon :icon="item.icon" />
          </span>
        </template>
      </ElSkeleton>
    </ElCard>
  </section>
</template>

<script setup lang="ts">
  import type { OverviewResponse } from '@/api/overview'
  import { alarmDistribution } from '@/utils/alarm-distribution'

  const props = withDefaults(defineProps<{ overview?: OverviewResponse; loading?: boolean }>(), {
    loading: false
  })
  const overview = computed(() => props.overview)
  const distribution = computed(() => alarmDistribution(overview.value))

  /** 只有服务端明确返回 0 才显示 0；缺失字段永远显示破折号，不把“不知道”伪造成零。 */
  const formatNumber = (value?: number) =>
    typeof value === 'number' ? new Intl.NumberFormat('zh-CN').format(value) : '—'

  const deviceCountCards = computed(() => [
    {
      label: '设备总数',
      icon: 'ri:box-3-line',
      tone: 'primary',
      value: formatNumber(overview.value?.devices?.total),
      hint: '当前项目下已登记的设备'
    },
    {
      label: '在线设备数',
      icon: 'ri:router-line',
      tone: 'success',
      value: formatNumber(overview.value?.devices?.online),
      hint: '当前在线设备'
    },
    {
      label: '活跃设备数',
      icon: 'ri:pulse-line',
      tone: 'warning',
      value: formatNumber(overview.value?.devices?.active24h),
      hint: '当前在线或 24 小时内最近在线'
    },
    {
      label: '告警设备数',
      icon: 'ri:alarm-warning-line',
      tone: 'danger',
      value: formatNumber(distribution.value.alarmDevices),
      hint: distribution.value.available ? '存在活动告警的去重设备数' : '告警设备数暂不可用'
    }
  ])
</script>

<style lang="scss" scoped>
  .project-device-counts {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    min-width: 0;
    line-height: 1.6;
  }

  .project-device-counts .overview-card {
    position: relative;
    min-height: 140px;
    border-radius: var(--el-card-border-radius);

    :deep(.el-card__body) {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 138px;
      padding: 20px 90px 20px 20px;
    }
  }

  .overview-card {
    &__label {
      margin: 0;
      font-size: 14px;
      color: var(--el-text-color-secondary);
    }

    &__value {
      display: block;
      margin-top: 10px;
      font-size: 26px;
      font-weight: 500;
      line-height: 1.1;
      color: var(--el-text-color-primary);
    }

    &__hint {
      margin: 8px 0 0;
      font-size: 14px;
      color: var(--el-text-color-secondary);
    }

    &__icon {
      position: absolute;
      top: 0;
      right: 20px;
      bottom: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 50px;
      height: 50px;
      margin: auto;
      font-size: 24px;
      border-radius: 12px;

      :deep(.art-svg-icon) {
        font-size: inherit;
      }

      &--primary {
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
      }
      &--success {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }
      &--danger {
        color: var(--el-color-danger);
        background: var(--el-color-danger-light-9);
      }
      &--warning {
        color: var(--el-color-warning);
        background: var(--el-color-warning-light-9);
      }
    }

    &__label-skeleton {
      width: 38%;
    }
    &__value-skeleton {
      width: 56%;
      height: 32px;
      margin-top: 10px;
    }
    &__hint-skeleton {
      width: 72%;
      margin-top: 10px;
    }
  }

  @media screen and (width <= 1100px) {
    .project-device-counts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media screen and (width <= 640px) {
    .project-device-counts {
      grid-template-columns: 1fr;
    }
  }
</style>
