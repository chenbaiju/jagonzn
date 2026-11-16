import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import {
  createRuntimeNumber,
  parseDashboardRuntimeResponse
} from '@things-link/client-contracts/dashboard/v1'
import type { PreviewRow } from '@/features/dashboard/device-preview'
import HistorySnapshot from '@/views/dashboard/designer/components/DesignerHistorySnapshot.vue'
import AlarmSnapshot from '@/views/dashboard/designer/components/DesignerAlarmSnapshot.vue'

const timestamp = '2026-10-23T18:43:39.488199999Z'
const expected = '2026-10-24 02:43:39'

describe('看板管理预览的时间展示', () => {
  it('历史范围、点表格和图形提示按平台时间显示，保留原始点精度与数值', async () => {
    const point = {
      ts: timestamp,
      value: createRuntimeNumber(
        parseDashboardRuntimeResponse(new TextEncoder().encode('{"value":9007199254740993}')).value
      ),
      sampleCount: '1',
      modelVersion: 'v1',
      thingModelVersionId: null
    }
    const history: NonNullable<PreviewRow['history']> = {
      showLegend: true,
      series: [
        {
          id: 'temperature',
          label: '温度',
          text: '历史数据',
          result: {
            queryId: 'query',
            status: 'READY',
            requestedGranularity: 'RAW',
            actualGranularity: 'RAW',
            aggregation: 'AVG',
            points: [point]
          }
        }
      ]
    }
    const page = mount(HistorySnapshot, { props: { history } })
    await page.get('summary').trigger('click')
    expect(page.get('tbody td').text()).toBe(expected)
    expect(page.get('circle title').text()).toContain(expected)
    expect(page.text()).toContain(`范围：${expected} 至 ${expected}`)
    expect(page.text()).not.toContain('UTC')
    expect(page.text()).not.toContain(timestamp)
    expect(page.text()).toContain('9007199254740993')
    expect(point.ts).toBe(timestamp)
    page.unmount()
  })

  it('告警时间统一转换且缺省状态保留，翻页仍发送原始游标', async () => {
    const alarm: NonNullable<PreviewRow['alarm']> = {
      showClearedAt: true,
      query: {
        queryId: 'query',
        devices: [],
        conditionStates: [],
        ackStates: [],
        severities: [],
        limit: 20
      },
      result: {
        componentId: 'alarms',
        queryId: 'query',
        status: 'READY',
        nextCursor: 'signed-cursor',
        hasMore: true,
        items: [
          {
            id: 'alarm',
            deviceId: 'device',
            alarmType: '高温',
            severity: 'MAJOR',
            conditionState: 'ACTIVE',
            ackState: 'UNACKNOWLEDGED',
            firstConditionAt: timestamp,
            activatedAt: timestamp,
            clearedAt: null,
            acknowledgedAt: null,
            lastReceivedAt: timestamp,
            version: 1
          }
        ]
      }
    }
    const page = mount(AlarmSnapshot, { props: { componentId: 'alarms', alarm, disabled: false } })
    const cells = page.findAll('tbody td').map((cell) => cell.text())
    expect(cells.slice(5)).toEqual([expected, expected, '未提供', '未提供', expected])
    expect(page.text()).not.toContain(timestamp)
    await page
      .findAll('button')
      .find((button) => button.text() === '下一页告警')!
      .trigger('click')
    expect(page.emitted('page')).toEqual([['query', 'signed-cursor']])
    expect(alarm.result!.items[0]!.firstConditionAt).toBe(timestamp)
    page.unmount()
  })
})
