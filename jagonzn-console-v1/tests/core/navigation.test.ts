import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { session } from '@/core/session'
vi.mock('@/features/rules/RulesPage.vue', () => ({ default: defineComponent({ template: '<div data-rule-directory>规则目录接入</div>' }) }))
import { router } from '@/router'
import Shell from '@/layout/ConsoleShell.vue'
let wrapper: ReturnType<typeof mount> | undefined
afterEach(() => { wrapper?.unmount(); session.ready = false; session.user = null; session.menus = [] })
it('菜单点击进入已接收规则模块，不落入待实施占位页', async () => {
  session.ready = true; session.user = { currentProjectId: 'current-project', permissions: ['rule:manage'] }
  session.menus = [{ name: 'MessageRules' }]; session.projects = [{ id: 'current-project', name: '项目', status: 'ACTIVE', myRole: 'OWNER' }]
  await router.push('/devices')
  wrapper = mount(Shell, { global: { plugins: [router], stubs: { ElSelect: true, ElDropdown: true, ElIcon: true } } })
  const item = wrapper.findAll('a').find(link => link.text().includes('消息规则'))!
  await item.trigger('click'); await flushPromises()
  expect(router.currentRoute.value.name).toBe('V1MessageRules')
  expect(wrapper.find('[data-rule-directory]').exists()).toBe(true)
  expect(wrapper.text()).not.toContain('页面正在实施')
})
it('通知模板扩展不进入告警主导航', async () => {
  session.ready = true; session.user = { currentProjectId: 'current-project', permissions: ['alarm:read'] }
  session.menus = [{ name: 'AlarmRules' }, { name: 'AlarmNotificationGroups' }]
  session.projects = [{ id: 'current-project', name: '项目', status: 'ACTIVE', myRole: 'OWNER' }]
  await router.push('/devices')
  wrapper = mount(Shell, { global: { plugins: [router], stubs: { ElSelect: true, ElDropdown: true, ElIcon: true } } })
  expect(wrapper.text()).toContain('通知组')
  expect(wrapper.text()).not.toContain('通知模板')
})
it('已知旧入口跳到规范模块路径，隐藏扩展不会被注册', async () => {
  session.user = { currentProjectId: 'current-project' }
  for (const [from, to] of [['/message-rules', '/rules/messages'], ['/task-jobs', '/tasks/jobs'], ['/automations', '/rules/automations'], ['/scenes', '/rules/scenes'], ['/rule-logs', '/rules/executions']]) {
    await router.push(from!)
    expect(router.currentRoute.value.path).toBe(to)
    expect(router.currentRoute.value.meta.pending).not.toBe(true)
  }
  expect(router.resolve('/design-system').meta.pending).toBe(true)
  expect(router.resolve('/notification-templates').meta.pending).not.toBe(true)
  expect(router.resolve('/notification-templates').name).toBe('alarm-notification-templates')
  expect(router.resolve('/alarm-notification-deliveries').meta.pending).toBe(true)
})
