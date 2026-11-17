import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import Panel from '@/components/business/ProjectAlarmNotificationPolicyPanel.vue'
import * as api from '@/api/project-alarm-notification-policy'
import { invalidateIdentity } from '@/utils/http/identity-scope'
const state = vi.hoisted(() => ({ user: {} as any }))
vi.mock('@/store/modules/user', () => ({ useUserStore: () => state.user }))
vi.mock('@/api/project-alarm-notification-policy', () => ({
  readProjectAlarmNotificationPolicy: vi.fn(),
  updateProjectAlarmNotificationPolicy: vi.fn()
}))
const initial = { muted: false, revision: '9007199254740993', writable: true }
let panel: VueWrapper
function render() {
  panel = mount(Panel, {
    props: { projectId: 'p' },
    global: {
      stubs: {
        ElCard: { template: '<section><slot name="header"/><slot/></section>' },
        ElButton: {
          props: ['disabled'],
          template: '<button type="button" :disabled="disabled"><slot/></button>'
        },
        ElAlert: { props: ['title'], template: '<p>{{title}}</p>' }
      }
    }
  })
}
const button = (name: string) => panel.findAll('button').find((b) => b.text() === name)!
beforeEach(() => {
  vi.resetAllMocks()
  state.user = reactive({
    info: { userId: 'a', tenantId: 't', currentProjectId: 'p', roles: ['OWNER'] }
  })
  vi.mocked(api.readProjectAlarmNotificationPolicy).mockResolvedValue(initial)
})
afterEach(() => panel?.unmount())
it('保存保留大版本且只发一次，收到权威成功前不乐观切换', async () => {
  let resolve!: (v: any) => void
  vi.mocked(api.updateProjectAlarmNotificationPolicy).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r
      })
  )
  render()
  await flushPromises()
  expect(panel.text()).toContain('告警仍正常记录')
  expect(panel.text()).toContain('不影响额度预警、到期提醒')
  await button('暂停告警通知').trigger('click')
  await button('暂停告警通知').trigger('click')
  expect(api.updateProjectAlarmNotificationPolicy).toHaveBeenCalledExactlyOnceWith('p', {
    muted: true,
    expectedRevision: initial.revision
  })
  expect(panel.text()).toContain('当前状态：允许告警通知')
  resolve({ muted: true, revision: '9007199254740994', writable: true })
  await flushPromises()
  expect(panel.text()).toContain('当前状态：已暂停告警通知')
})
it('恢复只改策略，不声称补发或真实送达', async () => {
  vi.mocked(api.readProjectAlarmNotificationPolicy).mockResolvedValue({ ...initial, muted: true })
  vi.mocked(api.updateProjectAlarmNotificationPolicy).mockResolvedValue({
    ...initial,
    revision: '9007199254740994'
  })
  render()
  await flushPromises()
  await button('恢复告警通知').trigger('click')
  await flushPromises()
  expect(api.updateProjectAlarmNotificationPolicy).toHaveBeenCalledExactlyOnceWith('p', {
    muted: false,
    expectedRevision: initial.revision
  })
  expect(panel.text()).toContain('未补发旧通知')
  expect(panel.text()).toContain('不会开启未配置的供应商')
})
it.each(['conflict', 'unknown'])('保存%s失败要求重读，不自动重试PUT', async () => {
  vi.mocked(api.updateProjectAlarmNotificationPolicy).mockRejectedValue(new Error('controlled'))
  render()
  await flushPromises()
  await button('暂停告警通知').trigger('click')
  await flushPromises()
  expect(panel.text()).toContain('请重新读取后核对')
  expect(button('暂停告警通知').attributes('disabled')).toBeDefined()
  expect(api.updateProjectAlarmNotificationPolicy).toHaveBeenCalledTimes(1)
  await button('重新读取').trigger('click')
  await flushPromises()
  expect(api.readProjectAlarmNotificationPolicy).toHaveBeenCalledTimes(2)
})
it.each(['VIEWER', 'EDITOR'])('非管理角色%s不读取配置', async (role) => {
  state.user.info.roles = [role]
  render()
  await flushPromises()
  expect(api.readProjectAlarmNotificationPolicy).not.toHaveBeenCalled()
  expect(panel.find('section').exists()).toBe(false)
})
it('归档只读，服务器响应错误不回落成默认允许', async () => {
  vi.mocked(api.readProjectAlarmNotificationPolicy).mockResolvedValue({
    ...initial,
    writable: false
  })
  render()
  await flushPromises()
  expect(button('暂停告警通知').attributes('disabled')).toBeDefined()
  vi.mocked(api.readProjectAlarmNotificationPolicy).mockResolvedValue({
    ...initial,
    revision: '9223372036854775808'
  })
  await button('重新读取').trigger('click')
  await flushPromises()
  expect(panel.text()).toContain('当前策略尚未确认')
  expect(api.updateProjectAlarmNotificationPolicy).not.toHaveBeenCalled()
})
it('账号切换后丢弃旧保存回执', async () => {
  let resolve!: (v: any) => void
  vi.mocked(api.updateProjectAlarmNotificationPolicy).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r
      })
  )
  render()
  await flushPromises()
  await button('暂停告警通知').trigger('click')
  state.user.info.userId = 'b'
  invalidateIdentity()
  await nextTick()
  await flushPromises()
  resolve({ ...initial, muted: true })
  await flushPromises()
  expect(panel.text()).toContain('当前状态：允许告警通知')
  expect(panel.text()).not.toContain('通知已暂停，告警')
})
it('切换选中项目后忽略旧读取结果', async () => {
  let resolve!: (v: any) => void
  vi.mocked(api.readProjectAlarmNotificationPolicy).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r
      })
  )
  render()
  state.user.info.currentProjectId = 'other'
  await nextTick()
  resolve({ ...initial, muted: true })
  await flushPromises()
  expect(panel.find('section').exists()).toBe(false)
  expect(api.updateProjectAlarmNotificationPolicy).not.toHaveBeenCalled()
})

it('项目静默终态有中性状态映射', async () => {
  const status = await import('@/utils/notificationStatus')
  expect(status.notificationStatusLabel('SUPPRESSED_POLICY')).toBe('项目通知已静默')
  expect(status.notificationStatusTag('SUPPRESSED_POLICY')).toBe('info')
})
