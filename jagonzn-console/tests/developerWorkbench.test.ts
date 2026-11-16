import { memoryStorage } from './commercialStorageFixture'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { reactive } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import Workbench from '@/views/dashboard/workbench/index.vue'
import { fetchProjectOverview } from '@/api/overview'
import { fetchProjectQuota, type ProjectQuotaOverviewResponse } from '@/api/quota'
import WorkbenchPlanOverview from '@/views/dashboard/workbench/WorkbenchPlanOverview.vue'
import WorkbenchResources from '@/views/dashboard/workbench/WorkbenchResources.vue'
import ProjectOverviewContent from '@/views/dashboard/overview/components/ProjectOverviewContent.vue'
import { formatTime } from '@/utils/time'
const state = vi.hoisted(() => ({ user: {} as any, menu: {} as any, push: vi.fn() }))
vi.mock('@/store/modules/user', () => ({ useUserStore: () => state.user }))
vi.mock('@/store/modules/menu', () => ({ useMenuStore: () => state.menu }))
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRouter: () => ({ push: state.push })
}))
vi.mock('@/utils/http', () => ({ default: { get: vi.fn() } }))
vi.mock('@/api/overview', () => ({ fetchProjectOverview: vi.fn() }))
vi.mock('@/api/quota', () => ({ fetchProjectQuota: vi.fn() }))
vi.mock('@/api/project', () => ({
  fetchProjects: vi.fn(async () => [{ id: 'p', name: '开发项目' }])
}))
let wrapper: VueWrapper
const snapshot = {
  devices: { total: 6, online: 2, active24h: 4 },
  alarmRate: { available: true, value: 0.5 },
  alarmSeverityDeviceCounts: { NORMAL: 3, CRITICAL: 3, MAJOR: 0, MINOR: 0, WARNING: 0, INFO: 0 }
}
function render() {
  wrapper = mount(Workbench, {
    global: {
      stubs: {
        ElButton: { template: '<button><slot/></button>' },
        ElSkeleton: { template: '<div><slot/></div>' },
        ElCard: { template: '<article><slot/></article>' },
        ElSkeletonItem: true,
        ElAlert: { props: ['title'], template: '<div>{{title}}<slot/></div>' },
        ElDrawer: true,
        ElEmpty: true,
        ArtSvgIcon: true,
        ArtRingChart: true,
        DeviceActivityChart: true,
        OverviewStatistics: true,
        WorkbenchResources: true
      }
    }
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  localStorage.clear()
  state.user = reactive({
    info: { currentProjectId: 'p', userId: 'u', tenantId: 't', roles: ['OWNER'] }
  })
  state.menu = reactive({
    menuList: ['/dashboard/workbench', '/device/types', '/project/list'].map((path) => ({ path }))
  })
  vi.mocked(fetchProjectOverview).mockResolvedValue(snapshot)
})
afterEach(() => wrapper?.unmount())
it('shows authoritative alarm count and disables inaccessible steps', async () => {
  render()
  await flushPromises()
  expect(
    wrapper.findAll('.workbench-summary .overview-card__value').map((node) => node.text())
  ).toEqual(['6', '2', '4', '3'])
  expect(wrapper.findAll('.development-step:disabled')).toHaveLength(4)
  expect(wrapper.text()).toContain('开发项目')
  expect(wrapper.find('.workbench-help').exists()).toBe(false)
  expect(wrapper.findComponent(WorkbenchResources).exists()).toBe(true)
  expect(wrapper.text()).not.toContain('统计生成于')
  expect(wrapper.text()).not.toContain('按需要进入任一步骤')
  expect(wrapper.find('.workbench-overview h2').exists()).toBe(false)
  expect(wrapper.find('[aria-label="继续开发"] h2').exists()).toBe(false)
  expect(wrapper.find('.workbench-summary h2').exists()).toBe(false)
  expect(
    wrapper
      .findAll('.workbench-summary .overview-card__icon art-svg-icon-stub')
      .map((icon) => icon.attributes('icon'))
  ).toEqual(['ri:box-3-line', 'ri:router-line', 'ri:pulse-line', 'ri:alarm-warning-line'])
})
it('opens the relocated overview in the home column without navigating away', async () => {
  render()
  await flushPromises()
  const scroll = vi.fn()
  Object.defineProperty(wrapper.get('.workbench-overview').element, 'scrollIntoView', {
    value: scroll
  })
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '项目统计')!
    .trigger('click')
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'start' })
  expect(state.push).not.toHaveBeenCalled()
})
it('ignores delayed results after project changes', async () => {
  let release!: (value: typeof snapshot) => void
  vi.mocked(fetchProjectOverview).mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve
    })
  )
  render()
  state.user.info.currentProjectId = 'other'
  vi.mocked(fetchProjectOverview).mockRejectedValue(new Error('offline'))
  await flushPromises()
  release(snapshot)
  await flushPromises()
  expect(wrapper.text()).toContain('运行摘要暂不可用')
  expect(
    wrapper.findAll('.workbench-summary .overview-card__value').every((node) => node.text() === '—')
  ).toBe(true)
  expect(wrapper.text()).not.toContain('开发项目')
  expect(wrapper.find('.workbench-help').exists()).toBe(false)
  expect(wrapper.findAll('.workbench-traffic__value').map((node) => node.text())).toEqual([
    '—',
    '—'
  ])
  expect(wrapper.get('.workbench-window strong').text()).toBe('—')
  expect(wrapper.findComponent(ProjectOverviewContent).props('overview')).toBeUndefined()
})
it('shows backend traffic and window below the runtime summary using the same overview request', async () => {
  const from = '2026-10-06T12:00:00Z'
  const to = '2026-10-07T12:00:00Z'
  vi.mocked(fetchProjectOverview).mockResolvedValue({
    ...snapshot,
    messages24h: { count: 1234, bytes: 1536 },
    window: { from, to },
    generatedAt: to
  })
  render()
  await flushPromises()
  expect(wrapper.findAll('.workbench-traffic__value').map((node) => node.text())).toEqual([
    '1,234',
    '1.5 KiB'
  ])
  expect(wrapper.findAll('.workbench-window strong').map((node) => node.text())).toEqual([
    `${formatTime(from)} 至 ${formatTime(to)}`,
    formatTime(to)
  ])
  expect(
    wrapper
      .findAll('.workbench-main > section')
      .map((node) => node.attributes('aria-label') ?? node.attributes('aria-labelledby'))
  ).toEqual(['recent-heading', '消息流量概览', '项目统计'])
  expect(wrapper.findAll('.workbench-summary .overview-card--count')).toHaveLength(4)
  expect(wrapper.findAll('.overview-card--count')).toHaveLength(4)
  expect(wrapper.findAll('.workbench-traffic.workbench-panel')).toHaveLength(1)
  expect(wrapper.findAll('.workbench-traffic__metric')).toHaveLength(2)
  expect(fetchProjectOverview).toHaveBeenCalledTimes(1)
  expect(wrapper.findComponent(ProjectOverviewContent).props()).toMatchObject({
    projectId: 'p',
    compact: true,
    overview: expect.objectContaining({ messages24h: { count: 1234, bytes: 1536 } })
  })
  expect(wrapper.findAll('.workbench-overview .overview-card--count')).toHaveLength(0)
  expect(wrapper.findAll('.workbench-overview .overview-card--rate')).toHaveLength(4)
  expect(wrapper.find('.workbench-overview overview-statistics-stub').exists()).toBe(true)
  vi.mocked(fetchProjectOverview).mockResolvedValue({
    ...snapshot,
    messages24h: { count: 0, bytes: 0 }
  })
  state.user.info.currentProjectId = 'other'
  await flushPromises()
  expect(wrapper.findAll('.workbench-traffic__value').map((node) => node.text())).toEqual([
    '0',
    '0 B'
  ])
  expect(wrapper.get('.workbench-window strong').text()).toBe('—')
})
it('shows the first-device guide only after an explicit zero count and hides it while switching projects', async () => {
  let release!: (value: typeof snapshot) => void
  vi.mocked(fetchProjectOverview).mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve
    })
  )
  render()
  await flushPromises()
  expect(wrapper.find('.workbench-help').exists()).toBe(false)
  release({ ...snapshot, devices: { total: 0, online: 0, active24h: 0 } })
  await flushPromises()
  expect(wrapper.find('.workbench-help').exists()).toBe(true)
  expect(wrapper.findComponent(WorkbenchResources).exists()).toBe(false)
  vi.mocked(fetchProjectOverview).mockResolvedValue({})
  state.user.info.currentProjectId = 'other'
  await flushPromises()
  expect(wrapper.find('.workbench-help').exists()).toBe(false)
})
it('uses current-project quota device count rather than another project in the shared pool', async () => {
  state.menu.menuList = [{ path: '/project/settings' }]
  vi.mocked(fetchProjectQuota).mockResolvedValue({
    project: { deviceCount: { used: 0 } },
    tenantSharedPool: { deviceCount: { used: 8 } }
  })
  render()
  await flushPromises()
  expect(wrapper.find('.workbench-help').exists()).toBe(true)
  vi.mocked(fetchProjectQuota).mockResolvedValue({ project: { deviceCount: { used: 1 } } })
  state.user.info.currentProjectId = 'other'
  await flushPromises()
  expect(wrapper.find('.workbench-help').exists()).toBe(false)
})
it('does not fetch without overview access or a project', async () => {
  state.menu.menuList = [{ path: '/project/list' }]
  render()
  await flushPromises()
  expect(fetchProjectOverview).not.toHaveBeenCalled()
  expect(fetchProjectQuota).not.toHaveBeenCalled()
  expect(wrapper.find('.workbench-traffic').exists()).toBe(false)
  expect(wrapper.find('.workbench-window').exists()).toBe(false)
  expect(wrapper.find('.workbench-overview').exists()).toBe(false)
  state.user.info.currentProjectId = ''
  await flushPromises()
  expect(wrapper.find('.development-steps').exists()).toBe(false)
})
it('loads quota with resource access even without overview access and ignores an old project response', async () => {
  state.menu.menuList = [{ path: '/project/settings' }]
  let release!: (value: ProjectQuotaOverviewResponse) => void
  vi.mocked(fetchProjectQuota)
    .mockReturnValueOnce(new Promise((resolve) => (release = resolve)))
    .mockResolvedValueOnce({ projectId: 'other', memberCount: 2 })
  render()
  await flushPromises()
  expect(fetchProjectOverview).not.toHaveBeenCalled()
  expect(fetchProjectQuota).toHaveBeenCalledWith('p')
  state.user.info.currentProjectId = 'other'
  await flushPromises()
  release({ projectId: 'p', memberCount: 99 })
  await flushPromises()
  expect(wrapper.findComponent(WorkbenchPlanOverview).props('overview')).toEqual({
    projectId: 'other',
    memberCount: 2
  })
  expect(wrapper.findComponent(WorkbenchPlanOverview).props('loading')).toBe(false)
  await wrapper.findComponent(WorkbenchPlanOverview).get('button[aria-label]').trigger('click')
  expect(state.push).toHaveBeenCalledWith('/project/settings')
})
it('clears quota after resource access is lost and does not show the panel without a project', async () => {
  state.menu.menuList.push({ path: '/project/settings' })
  vi.mocked(fetchProjectQuota).mockResolvedValue({ memberCount: 3 })
  render()
  await flushPromises()
  expect(wrapper.findComponent(WorkbenchPlanOverview).exists()).toBe(true)
  state.menu.menuList = [{ path: '/project/list' }]
  await flushPromises()
  expect(wrapper.findComponent(WorkbenchPlanOverview).exists()).toBe(false)
  state.user.info.currentProjectId = ''
  await flushPromises()
  expect(fetchProjectQuota).toHaveBeenCalledTimes(1)
})
