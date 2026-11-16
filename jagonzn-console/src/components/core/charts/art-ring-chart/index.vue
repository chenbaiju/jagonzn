<!-- 环形图 -->
<template>
  <div
    ref="chartRef"
    class="relative w-full"
    :style="{
      height: props.centered && props.showLegend && compactLegend ? '264px' : props.height
    }"
    v-loading="props.loading"
  >
  </div>
</template>

<script setup lang="ts">
  import type { EChartsOption } from '@/plugins/echarts'
  import { useChartOps, useChartComponent } from '@/hooks/core/useChart'
  import type { RingChartProps } from '@/types/component/chart'
  import { useResizeObserver } from '@vueuse/core'

  defineOptions({ name: 'ArtRingChart' })

  const props = withDefaults(defineProps<RingChartProps>(), {
    // 基础配置
    height: useChartOps().chartHeight,
    loading: false,
    isEmpty: false,
    colors: () => useChartOps().colors,

    // 数据配置
    data: () => [],
    radius: () => ['50%', '80%'],
    borderRadius: 10,
    centerText: '',
    centered: false,
    showLabel: false,

    // 交互配置
    showTooltip: true,
    showLegend: false,
    showLegendPercent: false,
    showLegendValue: false,
    legendPosition: 'right'
  })
  const compactLegend = ref(false)

  // 使用新的图表组件抽象
  const { chartRef, isDark, getAnimationConfig, getTooltipStyle, getLegendStyle, handleResize } =
    useChartComponent({
      props,
      checkEmpty: () => {
        return !props.data?.length || props.data.every((item) => item.value === 0)
      },
      watchSources: [
        () => props.data,
        () => props.centerText,
        () => props.centered,
        () => props.showLegendPercent,
        () => props.showLegendValue,
        () => compactLegend.value
      ],
      generateOptions: (): EChartsOption => {
        const legendBelow = props.centered && props.showLegend && compactLegend.value
        // 根据图例位置计算环形图中心位置
        const getCenterPosition = (): [string, string] => {
          if (props.centered) return ['50%', legendBelow ? '38%' : '50%']
          if (!props.showLegend) return ['50%', '50%']

          switch (props.legendPosition) {
            case 'left':
              return ['60%', '50%']
            case 'right':
              return ['40%', '50%']
            case 'top':
              return ['50%', '60%']
            case 'bottom':
              return ['50%', '40%']
            default:
              return ['50%', '50%']
          }
        }

        const option: EChartsOption = {
          tooltip: props.showTooltip
            ? getTooltipStyle('item', {
                formatter: '{b}: {c} ({d}%)'
              })
            : undefined,
          legend: props.showLegend
            ? {
                ...getLegendStyle(legendBelow ? 'bottom' : props.legendPosition, { itemGap: 12 }),
                ...(props.showLegendPercent
                  ? {
                      formatter: (name: string) => {
                        const total = props.data.reduce((sum, item) => sum + item.value, 0)
                        const value = props.data.find((item) => item.name === name)?.value ?? 0
                        const percent = total > 0 ? (value / total) * 100 : 0
                        return props.showLegendValue
                          ? `${name}  ${value} (${percent.toFixed(1)}%)`
                          : `${name}  ${percent.toFixed(1)}%`
                      }
                    }
                  : {}),
                ...(legendBelow
                  ? { right: 'auto', top: 'auto', left: 'center', bottom: 0 }
                  : props.legendPosition === 'right'
                    ? { right: 24, left: 'auto', bottom: 'auto' }
                    : {})
              }
            : undefined,
          series: [
            {
              name: '数据占比',
              type: 'pie',
              radius: props.radius,
              center: getCenterPosition(),
              avoidLabelOverlap: false,
              itemStyle: {
                borderRadius: props.borderRadius,
                borderColor: isDark.value ? '#2c2c2c' : '#fff',
                borderWidth: 0
              },
              label: {
                show: props.showLabel,
                formatter: '{b}\n{d}%',
                position: 'outside',
                color: isDark.value ? '#ccc' : '#999',
                fontSize: 12
              },
              emphasis: {
                label: {
                  show: false,
                  fontSize: 14,
                  fontWeight: 'bold'
                }
              },
              labelLine: {
                show: props.showLabel,
                length: 15,
                length2: 25,
                smooth: true
              },
              data: props.data,
              color: props.colors,
              ...getAnimationConfig(),
              animationType: 'expansion'
            }
          ]
        }

        // 添加中心文字
        if (props.centerText) {
          const centerPos = getCenterPosition()
          option.title = {
            text: props.centerText,
            left: centerPos[0],
            top: centerPos[1],
            textAlign: 'center',
            textVerticalAlign: 'middle',
            textStyle: {
              fontSize: 18,
              fontWeight: 500,
              color: isDark.value ? '#999' : '#ADB0BC'
            }
          }
        }

        return option
      }
    })

  useResizeObserver(chartRef, (entries) => {
    if (!props.centered) return
    compactLegend.value = (entries[0]?.contentRect.width ?? 0) < 420
    nextTick(handleResize)
  })
</script>
