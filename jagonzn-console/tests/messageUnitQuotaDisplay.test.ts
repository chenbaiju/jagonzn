import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import type { MessageUnitQuotaResponse, QuotaMetricUsageResponse } from '@/api/quota'
import {
  buildMessageUnitQuotaRows,
  withoutProjectedMessageMetrics
} from '@/features/quota/message-unit-model'
import QuotaUsageTable from '@/views/project/settings/QuotaUsageTable.vue'
import PlanOverview from '@/views/dashboard/workbench/WorkbenchPlanOverview.vue'

/** 固定服务端观察快照；前端不另用当前浏览器日期重算日池或订阅资格。 */
const quota = (overrides: Partial<MessageUnitQuotaResponse> = {}): MessageUnitQuotaResponse => ({
  direction: 'UPLINK',
  unit: 'MESSAGE_4K',
  windowKind: 'UTC_DAY',
  observedAt: '2026-10-23T09:10:11Z',
  windowStart: '2026-10-23T00:00:00Z',
  windowEnd: '2026-10-24T00:00:00Z',
  subscriptionStatus: 'ACTIVE',
  availability: 'AVAILABLE',
  projectOccupied: 3,
  tenantOccupied: 31,
  limit: 100,
  remaining: 69,
  ...overrides
})

const legacyMetrics: QuotaMetricUsageResponse[] = [
  { metric: 'UPLINK_MESSAGE', used: 899, limit: 900, remaining: 1, status: 'NORMAL' },
  { metric: 'DOWNLINK_MESSAGE', used: 699, limit: 700, remaining: 1, status: 'NORMAL' },
  { metric: 'NOTIFICATION_DELIVERY', used: 7, status: 'NORMAL' }
]

const wrappers: VueWrapper[] = []
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

const renderPlan = (messageUnitQuotas: MessageUnitQuotaResponse[]) => {
  const wrapper = mount(PlanOverview, {
    props: {
      overview: { messageUnitQuotas, tenantSharedPool: { dailyMetrics: legacyMetrics } },
      loading: false,
      failed: false,
      showDetails: false
    },
    global: {
      stubs: {
        ElButton: { template: '<button><slot /></button>' },
        ElSkeleton: { template: '<div><slot /></div>' },
        ElTag: { template: '<span><slot /></span>' },
        ElProgress: {
          name: 'ElProgress',
          props: ['percentage', 'status'],
          template: '<div class="test-progress" />'
        },
        ArtSvgIcon: true
      }
    }
  })
  wrappers.push(wrapper)
  return wrapper
}

describe('新消息单位同源展示模型', () => {
  it('保留两方向独立项目贡献与共享占用，进度不使用当前项目贡献', () => {
    const rows = buildMessageUnitQuotaRows([
      quota(),
      quota({
        direction: 'DOWNLINK',
        projectOccupied: 2,
        tenantOccupied: 19,
        limit: 30,
        remaining: 11
      })
    ])
    expect(rows.map((row) => row.legacyMetric)).toEqual(['UPLINK_MESSAGE', 'DOWNLINK_MESSAGE'])
    expect(rows[0]).toMatchObject({
      projectOccupiedText: '3',
      tenantOccupiedText: '31',
      limitText: '100',
      remainingText: '69',
      sharedUsageText: '31 / 100',
      percentage: 31,
      statusText: '可用'
    })
    expect(rows[1].sharedUsageText).toBe('19 / 30')
    expect(rows[0].snapshotText).toContain('观察于 2026-10-23 17:10:11')
    expect(rows[0].snapshotText).toContain('2026-10-23 08:00:00 至 2026-10-24 08:00:00')
  })

  it('缺失或空投影不补两条零值，不改旧MESSAGE的引用及无限语义', () => {
    for (const projection of [undefined, null, []]) {
      const rows = buildMessageUnitQuotaRows(projection)
      expect(rows).toEqual([])
      const retained = withoutProjectedMessageMetrics(legacyMetrics, rows)
      expect(retained).toEqual(legacyMetrics)
      expect(retained[0]).toBe(legacyMetrics[0])
      expect(retained[2].limit).toBeUndefined()
    }
  })

  it('仅替换已有新投影的方向，保留另一方向旧消息及其他指标', () => {
    const rows = buildMessageUnitQuotaRows([quota()])
    expect(withoutProjectedMessageMetrics(legacyMetrics, rows)).toEqual(legacyMetrics.slice(1))
  })

  it('缺失限额或余额显示不可用，零余额不冒充缺失或无限', () => {
    for (const field of ['limit', 'remaining'] as const) {
      const [row] = buildMessageUnitQuotaRows([quota({ [field]: undefined })])
      expect(field === 'limit' ? row.limitText : row.remainingText).toBe('暂不可用')
      expect(row.statusText).toBe('暂不可用')
      expect(row.percentage).toBeUndefined()
    }
    const [exhausted] = buildMessageUnitQuotaRows([
      quota({ tenantOccupied: 120, remaining: 0, availability: 'EXHAUSTED' })
    ])
    expect(exhausted).toMatchObject({
      sharedUsageText: '120 / 100',
      remainingText: '0',
      statusText: '已耗尽',
      percentage: 100,
      progressStatus: 'exception'
    })
  })

  it('到期与宽限状态仍显示真实占用，不能按有余额推断可受理', () => {
    for (const subscriptionStatus of ['EXPIRED', 'GRACE', 'RESTRICTED_FREE']) {
      const [row] = buildMessageUnitQuotaRows([
        quota({ availability: 'SUBSCRIPTION_INACTIVE', subscriptionStatus })
      ])
      expect(row.sharedUsageText).toBe('31 / 100')
      expect(row.remainingText).toBe('69')
      expect(row.statusText).toContain('订阅不可受理')
      if (subscriptionStatus === 'EXPIRED') expect(row.statusText).toContain('已到期')
      expect(row.percentage).toBeUndefined()
      expect(row.statusType).not.toBe('success')
    }
  })

  it('未启用、停用和合同无效原因独立保留，不以余额显示正常', () => {
    const cases = [
      ['ADMISSION_DISABLED', '新消息受理未启用'],
      ['TENANT_INACTIVE', '租户已停用'],
      ['CONTRACT_INVALID', '额度合同不可用']
    ] as const
    for (const [availability, expected] of cases) {
      const [row] = buildMessageUnitQuotaRows([quota({ availability })])
      expect(row.sharedUsageText).toBe('31 / 100')
      expect(row.statusText).toBe(expected)
      expect(row.statusType).not.toBe('success')
      expect(row.percentage).toBeUndefined()
    }
  })

  it('重复方向或错单位投影不能随意选一行，也不回退旧条数假装新单位', () => {
    const invalidUnit = { ...quota(), unit: 'MESSAGE' } as unknown as MessageUnitQuotaResponse
    for (const input of [[quota(), quota({ tenantOccupied: 99 })], [invalidUnit]]) {
      const rows = buildMessageUnitQuotaRows(input)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ statusText: '暂不可用', tenantOccupiedText: '暂不可用' })
      expect(rows[0].percentage).toBeUndefined()
      expect(withoutProjectedMessageMetrics(legacyMetrics, rows)).toEqual(legacyMetrics.slice(1))
    }
  })
})

describe('项目设置与工作台的实际消息单位消费者', () => {
  it('项目表和共享表各取真实占用，但共同显示共享剩余且不重复旧方向', async () => {
    const table = mount(QuotaUsageTable, {
      props: {
        scope: { dailyMetrics: legacyMetrics },
        messageUnitQuotas: [quota()],
        usageScope: 'project'
      },
      global: { plugins: [ElementPlus] }
    })
    wrappers.push(table)
    await flushPromises()
    const messageRow = () => table.findAll('tbody tr').find((row) => row.text().includes('4KiB'))!
    expect(
      messageRow()
        .findAll('td')
        .map((cell) => cell.text())
    ).toEqual(['上行消息（4KiB 单位 / 日）', '3', '100', '69', '可用'])
    expect(table.text()).not.toContain('上行消息量')
    expect(table.text()).toContain('下行消息量')
    expect(table.text()).toContain('未决受理也占用额度')
    expect(table.text()).toContain('不是本项目独享余额')
    await table.setProps({ usageScope: 'tenant' })
    expect(
      messageRow()
        .findAll('td')
        .map((cell) => cell.text())
    ).toEqual(['上行消息（4KiB 单位 / 日）', '31', '100', '69', '可用'])
  })

  it('工作台使用共享占用并显示禁用原因，不展示旧条数或项目贡献作为共享用量', () => {
    const wrapper = renderPlan([
      quota(),
      quota({
        direction: 'DOWNLINK',
        availability: 'ADMISSION_DISABLED',
        tenantOccupied: 19,
        limit: 30,
        remaining: 11
      })
    ])
    expect(wrapper.text()).toContain('31 / 100')
    expect(wrapper.text()).toContain('19 / 30')
    expect(wrapper.text()).toContain('新消息受理未启用')
    expect(wrapper.text()).not.toContain('899 / 900')
    expect(wrapper.text()).not.toContain('699 / 700')
    expect(wrapper.text()).not.toContain('3 / 100')
    expect(
      wrapper.findAllComponents({ name: 'ElProgress' }).map((node) => node.props('percentage'))
    ).toEqual([31])
  })

  it('工作台新上限缺失不显示无限，旧的其他无限指标保持原义', () => {
    const wrapper = renderPlan([quota({ limit: undefined, remaining: undefined })])
    const uplink = wrapper
      .findAll('.workbench-plan__row')
      .find((row) => row.text().includes('4KiB'))!
    expect(uplink.text()).toContain('31 / 暂不可用')
    expect(uplink.text()).not.toContain('不限')
    expect(uplink.find('.test-progress').exists()).toBe(false)
    expect(wrapper.text()).toContain('7 / 不限')
    expect(wrapper.text()).toContain('699 / 700')
  })
})
