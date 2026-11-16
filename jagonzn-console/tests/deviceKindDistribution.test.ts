import { afterEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import type { OverviewResponse } from '@/api/overview'
import { deviceKindDistribution } from '@/utils/device-kind-distribution'
import ArtRingChart from '@/components/core/charts/art-ring-chart/index.vue'

const chart = vi.hoisted(() => ({ options: undefined as (() => any) | undefined }))
vi.mock('@/hooks/core/useChart', async () => {
  const { ref } = await import('vue')
  return {
    useChartOps: () => ({ chartHeight: '260px', colors: ['#2563eb'] }),
    useChartComponent: ({ generateOptions }: { generateOptions: () => any }) => {
      chart.options = generateOptions
      return {
        chartRef: ref(null),
        isDark: ref(false),
        getAnimationConfig: () => ({}),
        getTooltipStyle: (_type: string, options: object) => options,
        getLegendStyle: () => ({}),
        handleResize: () => {}
      }
    }
  }
})
const snapshot = (total = 10): OverviewResponse => ({
  devices: { total },
  deviceKindCounts: { DIRECT: 1, GATEWAY: 2, SUB_DEVICE: 3, UNCLASSIFIED: 4 }
})
it('uses device counts from one project snapshot and preserves unclassified devices in the denominator', () => {
  const result = deviceKindDistribution(snapshot())
  expect(result.available).toBe(true)
  expect(result.data.map(({ value }) => value)).toEqual([1, 2, 3, 4])
  expect(result.data.map(({ name }) => name)).toEqual(['直连设备', '网关', '网关子设备', '未分类'])
  expect(result.total).toBe(10)
})
it('does not show an empty unclassified category; an empty project is valid zero data', () => {
  const value: OverviewResponse = {
    devices: { total: 0 },
    deviceKindCounts: { DIRECT: 0, GATEWAY: 0, SUB_DEVICE: 0, UNCLASSIFIED: 0 }
  }
  expect(deviceKindDistribution(value)).toMatchObject({
    available: true,
    total: 0,
    data: [
      { name: '直连设备', value: 0 },
      { name: '网关', value: 0 },
      { name: '网关子设备', value: 0 }
    ]
  })
})
it.each([
  undefined,
  { devices: { total: 0 } },
  { ...snapshot(), deviceKindCounts: { ...snapshot().deviceKindCounts, DIRECT: -1 } },
  { ...snapshot(), deviceKindCounts: { ...snapshot().deviceKindCounts, DIRECT: 0.5 } },
  { ...snapshot(), deviceKindCounts: { ...snapshot().deviceKindCounts, DIRECT: NaN } },
  { ...snapshot(), deviceKindCounts: { ...snapshot().deviceKindCounts, DIRECT: undefined } },
  snapshot(11),
  snapshot(Number.MAX_SAFE_INTEGER + 1)
])('keeps missing, corrupt or partial classifications unavailable', (value) => {
  expect(deviceKindDistribution(value)).toMatchObject({ available: false, data: [] })
})
let wrapper: VueWrapper | undefined
afterEach(() => wrapper?.unmount())
it('shows visible percentages in the legend, updates with data and leaves the existing tooltip unchanged', async () => {
  wrapper = mount(ArtRingChart, {
    props: {
      data: deviceKindDistribution(snapshot()).data,
      showLegend: true,
      showLegendPercent: true
    },
    global: { directives: { loading: {} } }
  })
  expect(chart.options!().tooltip.formatter).toBe('{b}: {c} ({d}%)')
  expect(chart.options!().legend.formatter('直连设备')).toBe('直连设备  10.0%')
  expect(chart.options!().legend.formatter('未分类')).toBe('未分类  40.0%')
  await wrapper.setProps({ data: [{ name: '直连设备', value: 3 }] })
  expect(chart.options!().legend.formatter('直连设备')).toBe('直连设备  100.0%')
  await wrapper.setProps({ data: [{ name: '直连设备', value: 0 }] })
  expect(chart.options!().legend.formatter('直连设备')).toBe('直连设备  0.0%')
  await wrapper.setProps({ showLegendPercent: false })
  expect(chart.options!().legend.formatter).toBeUndefined()
})
