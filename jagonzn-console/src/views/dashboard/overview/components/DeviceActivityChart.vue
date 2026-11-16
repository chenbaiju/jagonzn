<template>
  <div
    ref="chartRef"
    class="device-activity-chart"
    :style="{ height: compactLegend ? '264px' : '204px' }"
    role="img"
    :aria-label="
      available
        ? data.map((item) => `${item.name} ${item.value} 台`).join('，')
        : '活跃分档暂不可用'
    "
  />
</template>

<script setup lang="ts">
  import type { EChartsOption } from '@/plugins/echarts'
  import { useChartComponent } from '@/hooks/core/useChart'
  import { useResizeObserver } from '@vueuse/core'

  const props = defineProps<{
    data: { name: string; value: number; color: string }[]
    available: boolean
  }>()
  const compactLegend = ref(false)
  const { chartRef, getLegendStyle, getTooltipStyle, getAnimationConfig, handleResize } =
    useChartComponent({
      props: {
        get isEmpty() {
          return !props.available
        }
      },
      checkEmpty: () => !props.available,
      watchSources: [() => props.data, () => props.available, () => compactLegend.value],
      generateOptions: (): EChartsOption => ({
        grid: {
          left: 12,
          right: compactLegend.value ? 12 : 142,
          top: compactLegend.value ? 48 : 40,
          bottom: compactLegend.value ? 116 : 40
        },
        legend: {
          ...getLegendStyle(compactLegend.value ? 'bottom' : 'right', { itemGap: 12 }),
          ...(compactLegend.value
            ? { left: 'center', right: 'auto', top: 'auto', bottom: 0 }
            : { right: 24, left: 'auto' }),
          formatter: (name: string) =>
            `${name}  ${props.data.find((item) => item.name === name)?.value ?? 0}`
        },
        tooltip: getTooltipStyle('item', { formatter: '{a}: {c} 台' }),
        xAxis: { type: 'category', data: ['设备'], show: false },
        yAxis: {
          type: 'value',
          min: 0,
          max: Math.max(1, ...props.data.map((item) => item.value)),
          show: false
        },
        series: props.data.map((item) => ({
          name: item.name,
          type: 'bar',
          data: [item.value],
          barMaxWidth: 64,
          barGap: '12%',
          showBackground: true,
          backgroundStyle: { color: 'rgba(148, 163, 184, 0.12)' },
          itemStyle: { color: item.color, borderRadius: [2, 2, 0, 0] },
          ...getAnimationConfig()
        }))
      })
    })
  useResizeObserver(chartRef, (entries) => {
    compactLegend.value = (entries[0]?.contentRect.width ?? 0) < 420
    nextTick(handleResize)
  })
</script>
