import { afterEach, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import PlanOverview from '@/views/dashboard/workbench/WorkbenchPlanOverview.vue'
import type { ProjectQuotaOverviewResponse } from '@/api/quota'

let wrapper: VueWrapper
afterEach(() => wrapper?.unmount())
function render(overview?: ProjectQuotaOverviewResponse, failed = false) {
  wrapper = mount(PlanOverview, {
    props: { overview, loading: false, failed },
    global: {
      stubs: {
        ElButton: { template: '<button><slot/></button>' },
        ElSkeleton: { template: '<div><slot/></div>' },
        ElAlert: { props: ['title'], template: '<div>{{title}}<slot/></div>' },
        ElProgress: {
          name: 'ElProgress',
          props: ['percentage', 'status'],
          template: '<div class="test-progress"/>'
        },
        ArtSvgIcon: true
      }
    }
  })
}
const rowText = (label: string) =>
  wrapper
    .findAll('.workbench-plan__row')
    .find((row) => row.text().includes(label))!
    .text()
it('shows shared usage only, without subscription rows or shared limits, and keeps project-only member count', () => {
  render({
    planSummary: {
      subscribedPlan: { name: '免费版' },
      subscriptionStatus: 'ACTIVE',
      effectiveMatchesSubscribed: false
    },
    memberCount: 2,
    project: { deviceCount: { used: 1, limit: 3 } },
    tenantSharedPool: {
      deviceCount: { used: 4, limit: 3, status: 'HARD_LIMIT' },
      dailyMetrics: [{ metric: 'UPLINK_MESSAGE', used: 250, limit: 1000, status: 'NORMAL' }]
    }
  })
  expect(wrapper.text()).toContain('项目概况')
  expect(rowText('设备数')).toContain('4')
  expect(rowText('设备数')).not.toContain('3')
  expect(wrapper.text()).not.toContain('免费版')
  expect(wrapper.findAll('dt').map((label) => label.text())).not.toContain('订阅套餐')
  expect(wrapper.findAll('dt').map((label) => label.text())).not.toContain('订阅状态')
  expect(wrapper.text()).toContain('2 人')
  expect(wrapper.text()).not.toContain('订阅套餐')
  const progress = wrapper.findAllComponents({ name: 'ElProgress' })
  expect(progress.map((node) => node.props('percentage'))).toEqual([100, 25])
  expect(progress[0].props('status')).toBe('exception')
})
it('does not invent a plan, zero usage, a member limit or percentages for missing and uncapped quotas', () => {
  render({
    tenantSharedPool: {
      deviceCount: { used: 5 },
      dailyMetrics: [{ metric: 'UPLINK_MESSAGE', used: 0, limit: 0 }]
    }
  })
  expect(rowText('设备数')).toContain('5')
  expect(rowText('上行消息 / 日')).toContain('0')
  expect(wrapper.text()).not.toContain('不限')
  expect(wrapper.text()).not.toContain('5 /')
  expect(wrapper.text()).toContain('— 人')
  expect(wrapper.findAll('.test-progress')).toHaveLength(0)
  expect(wrapper.text()).not.toContain('免费版')
  expect(wrapper.text()).not.toMatch(/短信|邮件|电话/)
})
it('exposes retry on failure and resource navigation only through emitted actions', async () => {
  render(undefined, true)
  expect(wrapper.text()).toContain('项目概况暂不可用')
  expect(wrapper.find('.workbench-plan__usage').exists()).toBe(false)
  await wrapper.get('button[aria-label]').trigger('click')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '重新读取')!
    .trigger('click')
  expect(wrapper.emitted('resources')).toHaveLength(1)
  expect(wrapper.emitted('retry')).toHaveLength(1)
  expect(wrapper.text()).not.toContain('了解详情')
})
