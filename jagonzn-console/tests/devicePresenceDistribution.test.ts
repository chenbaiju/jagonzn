import { afterEach, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import type { OverviewResponse } from '@/api/overview'
import { activityDistribution, onlineDistribution } from '@/utils/device-presence-distribution'
import ArtRingChart from '@/components/core/charts/art-ring-chart/index.vue'
import DeviceActivityChart from '@/views/dashboard/overview/components/DeviceActivityChart.vue'

const chart = vi.hoisted(() => ({
  options: undefined as (() => any) | undefined,
  empty: undefined as (() => boolean) | undefined
}))
vi.mock('@/hooks/core/useChart', async () => {
  const { ref } = await import('vue')
  return {
    useChartOps: () => ({ chartHeight: '260px', colors: ['#2563eb'] }),
    useChartComponent: ({
      generateOptions,
      checkEmpty
    }: {
      generateOptions: () => any
      checkEmpty: () => boolean
    }) => {
      chart.options = generateOptions
      chart.empty = checkEmpty
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
const snapshot = (): OverviewResponse => ({
  devices: { total: 10, online: 1, active24h: 6 },
  deviceActivityCounts: { WITHIN_5M: 1, WITHIN_1H: 2, WITHIN_24H: 3, OVER_24H: 4 }
})
it('partitions online and all remaining devices with the same denominator', () => {
  expect(onlineDistribution(snapshot())).toEqual({
    available: true,
    data: [
      { name: '在线设备', value: 1 },
      { name: '离线设备', value: 9 }
    ]
  })
  expect(onlineDistribution({ devices: { total: 0, online: 0 } }).available).toBe(true)
})
it.each([
  undefined,
  {},
  { devices: { total: 1, online: 2 } },
  { devices: { total: 1, online: -1 } },
  { devices: { total: 1, online: 0.5 } }
])('does not invent online counts for missing or invalid data', (value) => {
  expect(onlineDistribution(value).available).toBe(false)
})
it('uses disjoint activity counts and keeps zero categories', () => {
  expect(activityDistribution(snapshot()).data.map(({ value }) => value)).toEqual([1, 2, 3, 4])
  const zero: OverviewResponse = {
    devices: { total: 0, active24h: 0 },
    deviceActivityCounts: { WITHIN_5M: 0, WITHIN_1H: 0, WITHIN_24H: 0, OVER_24H: 0 }
  }
  expect(activityDistribution(zero)).toMatchObject({
    available: true,
    data: [{ value: 0 }, { value: 0 }, { value: 0 }, { value: 0 }]
  })
})
it.each([
  undefined,
  { devices: snapshot().devices },
  { ...snapshot(), devices: { total: 11, active24h: 6 } },
  { ...snapshot(), devices: { total: 10, active24h: 5 } },
  { ...snapshot(), deviceActivityCounts: { ...snapshot().deviceActivityCounts, WITHIN_5M: -1 } },
  {
    ...snapshot(),
    deviceActivityCounts: { ...snapshot().deviceActivityCounts, WITHIN_5M: undefined }
  },
  { ...snapshot(), deviceActivityCounts: { ...snapshot().deviceActivityCounts, WITHIN_5M: NaN } }
])('keeps missing or inconsistent activity buckets unavailable', (value) => {
  expect(activityDistribution(value).available).toBe(false)
})
let wrapper: VueWrapper | undefined
afterEach(() => wrapper?.unmount())
it('online legend displays count and percentage, including an empty project', async () => {
  wrapper = mount(ArtRingChart, {
    props: {
      data: onlineDistribution(snapshot()).data,
      showLegend: true,
      showLegendPercent: true,
      showLegendValue: true
    },
    global: { directives: { loading: {} } }
  })
  expect(chart.options!().legend.formatter('在线设备')).toBe('在线设备  1 (10.0%)')
  expect(chart.options!().legend.formatter('离线设备')).toBe('离线设备  9 (90.0%)')
  await wrapper.setProps({
    data: [
      { name: '在线设备', value: 0 },
      { name: '离线设备', value: 0 }
    ]
  })
  expect(chart.options!().legend.formatter('在线设备')).toBe('在线设备  0 (0.0%)')
})
it('activity chart plots quantities with matching colors and legends, without false zero state', async () => {
  wrapper = mount(DeviceActivityChart, { props: activityDistribution(snapshot()) })
  expect(chart.options!().legend.formatter('1小时内')).toBe('1小时内  2')
  expect(chart.options!().series.map((item: any) => item.data[0])).toEqual([1, 2, 3, 4])
  expect(chart.options!().series[0].itemStyle.color).toBe('#8b5cf6')
  expect(wrapper.attributes('aria-label')).toContain('1天以上 4 台')
  await wrapper.setProps({
    available: true,
    data: [{ name: '5分钟内', value: 0, color: '#8b5cf6' }]
  })
  expect(chart.empty!()).toBe(false)
  expect(chart.options!().legend.formatter('5分钟内')).toBe('5分钟内  0')
  await wrapper.setProps({ available: false, data: [] })
  expect(chart.empty!()).toBe(true)
  expect(wrapper.attributes('aria-label')).toBe('活跃分档暂不可用')
})
