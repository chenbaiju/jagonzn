import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import Chart from '@/views/dashboard/overview/components/OverviewTrendChart.vue'
const chart = vi.hoisted(() => ({ init: vi.fn(), update: vi.fn() }))
vi.mock('@/hooks/core/useChart', async () => {
  const { ref } = await import('vue')
  return {
    useChart: () => ({
      chartRef: ref(),
      isDark: ref(false),
      initChart: chart.init,
      updateChart: chart.update,
      getTooltipStyle: () => ({})
    })
  }
})
it('renders real zero and missing points without zero-filled animation, including lazy visibility and legend toggles', async () => {
  const page = mount(Chart, {
    props: {
      chart: {
        key: 'a',
        title: '活跃设备数',
        unit: 'DEVICES',
        aggregation: 'LAST',
        series: [{ key: 'device.active', label: '总活跃设备', values: [0, null, 3] }]
      },
      times: ['2026-10-08T00:00:00Z', '2026-10-08T01:00:00Z', '2026-10-08T02:00:00Z']
    }
  })
  expect(chart.init.mock.calls[0][0].series[0].data).toEqual([0, null, 3])
  expect(chart.init.mock.calls[0][0].xAxis.data).toEqual([
    '2026-10-08 08:00:00',
    '2026-10-08 09:00:00',
    '2026-10-08 10:00:00'
  ])
  await page.find('[role="img"]').trigger('chartVisible')
  expect(chart.update.mock.lastCall![0].series[0].data).toEqual([0, null, 3])
  await page.find('button').trigger('click')
  expect(page.find('button').attributes('aria-pressed')).toBe('false')
  expect(chart.update.mock.lastCall![0].series[0].data).toEqual([null, null, null])
  await page.find('button').trigger('click')
  expect(chart.update.mock.lastCall![0].series[0].data).toEqual([0, null, 3])
  page.unmount()
})

it('keeps an isolated observed point visible when adjacent hours are missing', () => {
  chart.init.mockClear()
  const page = mount(Chart, {
    props: {
      chart: {
        key: 'mqtt',
        title: '设备MQTT流量',
        unit: 'BYTES',
        aggregation: 'SUM',
        series: [{ key: 'bytes.mqttUp', label: 'MQTT上行', values: [null, 964, null] }]
      },
      times: ['2026-10-11T00:00:00Z', '2026-10-11T01:00:00Z', '2026-10-11T02:00:00Z']
    }
  })
  const series = chart.init.mock.calls[0][0].series[0]
  expect(series.data).toEqual([null, 964, null])
  expect(series.connectNulls).toBe(false)
  expect(series.symbol).not.toBe('none')
  expect(series.showSymbol).toBe(true)
  page.unmount()
})
