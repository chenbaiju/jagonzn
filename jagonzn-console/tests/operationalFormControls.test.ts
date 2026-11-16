import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { defineComponent, reactive } from 'vue'
import Jobs from '@/views/task/jobs/index.vue'
import Groups from '@/views/alarm/notification-groups/index.vue'
import Templates from '@/views/alarm/notification-templates/index.vue'
import * as alarm from '@/api/alarm'
import * as tasks from '@/api/task'

const mocks = vi.hoisted(() => ({ permissions: [] as string[] }))
vi.mock('@/hooks/core/useAuth', () => ({
  useAuth: () => ({ hasAuth: (value: string) => mocks.permissions.includes(value) })
}))
vi.mock('@/store/modules/user', () => ({
  useUserStore: () => ({ info: { currentProjectId: 'project' } })
}))
vi.mock('@/api/alarm', () => ({
  fetchAlarmNotificationGroups: vi.fn(),
  fetchAlarmNotificationRecipients: vi.fn(),
  fetchCreateAlarmNotificationGroup: vi.fn(),
  fetchCreateAlarmNotificationRecipient: vi.fn(),
  fetchDeleteAlarmNotificationGroup: vi.fn(),
  fetchDeleteAlarmNotificationRecipient: vi.fn(),
  fetchUpdateAlarmNotificationGroup: vi.fn(),
  fetchUpdateAlarmNotificationRecipient: vi.fn(),
  fetchAlarmNotificationTemplates: vi.fn(),
  fetchCreateAlarmNotificationTemplate: vi.fn(),
  fetchDeleteAlarmNotificationTemplate: vi.fn(),
  fetchUpdateAlarmNotificationTemplate: vi.fn()
}))
vi.mock('@/api/task', () => ({
  fetchTaskJobs: vi.fn(),
  fetchTaskExecutions: vi.fn(),
  fetchCreateTaskJob: vi.fn(),
  fetchUpdateTaskJob: vi.fn(),
  fetchRunTaskJob: vi.fn(),
  fetchDeleteTaskJob: vi.fn(),
  fetchEnableTaskJob: vi.fn(),
  fetchDisableTaskJob: vi.fn()
}))
vi.mock('@/api/device-group', () => ({ fetchDeviceGroups: vi.fn().mockResolvedValue([]) }))
vi.mock('@/api/project', () => ({ fetchProjects: vi.fn().mockResolvedValue([]) }))

const Surface = defineComponent({
  props: ['modelValue', 'title'],
  emits: ['update:modelValue'],
  template: '<section v-if="modelValue" :aria-label="title"><slot/><slot name="footer"/></section>'
})
const Field = defineComponent({
  props: ['label'],
  template: '<label>{{label}}<slot/></label>'
})
function mountPage(component: any) {
  return shallowMount(component, {
    global: {
      stubs: {
        ConsoleWorkspaceHeader: { template: '<header><slot name="actions"/></header>' },
        ElCard: { template: '<section><slot/></section>' },
        ElButton: { template: '<button><slot/></button>' },
        ElDialog: Surface,
        ElDrawer: Surface,
        ElForm: defineComponent({
          setup(_, { expose }) {
            expose({ clearValidate: vi.fn() })
          },
          template: '<form><slot/></form>'
        }),
        ElFormItem: Field,
        ElRadioGroup: { template: '<div><slot/></div>' },
        ElRadioButton: { template: '<span><slot/></span>' },
        ElTable: { template: '<div/>' },
        ElDivider: { template: '<div><slot/></div>' },
        ElInput: true,
        ElSwitch: true,
        ElSelect: true,
        ElDatePicker: true,
        ElTag: { template: '<span><slot/></span>' }
      },
      directives: { loading: () => {} }
    }
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.permissions = reactive(['task:manage', 'task:run', 'alarm:manage'])
  vi.mocked(tasks.fetchTaskJobs).mockResolvedValue([])
  vi.mocked(tasks.fetchTaskExecutions).mockResolvedValue([])
  vi.mocked(alarm.fetchAlarmNotificationGroups).mockResolvedValue({ items: [] })
  vi.mocked(alarm.fetchAlarmNotificationRecipients).mockResolvedValue([])
  vi.mocked(alarm.fetchAlarmNotificationTemplates).mockResolvedValue({ items: [] })
})
it('任务创建、编辑和执行记录保留条件控件及读取范围，不触发写操作', async () => {
  const page = mountPage(Jobs)
  try {
    await flushPromises()
    await page.get('header button').trigger('click')
    const state = (page.vm as any).$.setupState
    expect(state.formVisible).toBe(true)
    expect(page.text()).toContain('执行时刻')
    state.form.scheduleType = 'CRON'
    state.form.targetType = 'DEVICE_GROUP'
    await flushPromises()
    expect(page.text()).toContain('Cron 表达式')
    expect(page.text()).toContain('设备组')
    state.openEdit({
      id: 'job',
      name: '原任务',
      scheduleType: 'ONCE',
      status: 'ACTIVE',
      runAt: '2026-10-23T20:43:39.488199Z',
      version: 7,
      input: { command: 1 }
    })
    expect(state.form.runAt.toISOString()).toBe('2026-10-23T20:43:39.488Z')
    expect(JSON.parse(state.form.inputText)).toEqual({ command: 1 })
    expect(state.editing.version).toBe(7)
    await state.openExecutions({ id: 'job', name: '原任务' })
    expect(state.executionsVisible).toBe(true)
    expect(tasks.fetchTaskExecutions).toHaveBeenCalledExactlyOnceWith('project', 'job')
    const confirm = vi.fn().mockRejectedValue('cancel')
    vi.stubGlobal('ElMessageBox', { confirm })
    await state.runNow({ id: 'job', name: '原任务' })
    await state.handleAction({ id: 'job', name: '原任务', version: 7 }, 'delete')
    expect(confirm).toHaveBeenCalledTimes(2)
    for (const call of confirm.mock.calls)
      expect(call[2]).toMatchObject({ customClass: 'console-rule-feedback' })
    expect(tasks.fetchRunTaskJob).not.toHaveBeenCalled()
    expect(tasks.fetchDeleteTaskJob).not.toHaveBeenCalled()
    expect(tasks.fetchCreateTaskJob).not.toHaveBeenCalled()
    expect(tasks.fetchUpdateTaskJob).not.toHaveBeenCalled()
    mocks.permissions.splice(0)
    await flushPromises()
    expect(page.find('header button').exists()).toBe(false)
  } finally {
    page.unmount()
    vi.unstubAllGlobals()
  }
})
it('通知组的收件人抽屉与编辑目标保留脱敏替换、渠道校验和版本', async () => {
  const page = mountPage(Groups)
  try {
    await flushPromises()
    await page.get('header button').trigger('click')
    const state = (page.vm as any).$.setupState
    expect(state.groupFormVisible).toBe(true)
    state.openEditGroup({ id: 'group', name: '原通知组', enabled: false, version: 4 })
    expect(state.groupForm).toMatchObject({ name: '原通知组', enabled: false, version: 4 })
    await state.openRecipients({ id: 'group', name: '原通知组' })
    expect(alarm.fetchAlarmNotificationRecipients).toHaveBeenCalledExactlyOnceWith(
      'project',
      'group'
    )
    state.openEditRecipient({ id: 'recipient', channel: 'WEBHOOK', target: '***', version: 3 })
    await flushPromises()
    expect(state.recipientFormVisible).toBe(true)
    expect(state.recipientForm.target).toBe('')
    expect(state.editingRecipientMaskedTarget).toBe('***')
    expect(state.recipientForm.version).toBe(3)
    const invalid = vi.fn()
    state.validateTarget(null, 'http://example.com', invalid)
    expect(invalid.mock.calls[0][0]).toBeInstanceOf(Error)
    const valid = vi.fn()
    state.validateTarget(null, 'https://example.com/notify', valid)
    expect(valid).toHaveBeenCalledExactlyOnceWith()
    expect(alarm.fetchUpdateAlarmNotificationRecipient).not.toHaveBeenCalled()
  } finally {
    page.unmount()
    vi.unstubAllGlobals()
  }
})
it('通知模板创建弹窗与编辑抽屉保留渠道字段、原内容和主题校验', async () => {
  const page = mountPage(Templates)
  try {
    await flushPromises()
    await page.get('header button').trigger('click')
    const state = (page.vm as any).$.setupState
    expect(state.formVisible).toBe(true)
    expect(page.text()).toContain('邮件主题')
    state.form.channel = 'WEBHOOK'
    await flushPromises()
    expect(page.text()).not.toContain('邮件主题')
    state.openEdit({
      id: 'template',
      name: '原模板',
      channel: 'EMAIL',
      subjectTemplate: '原主题',
      bodyTemplate: '${alarm.type}',
      enabled: false,
      version: 9
    })
    await flushPromises()
    expect(state.editingId).toBe('template')
    expect(state.form).toMatchObject({
      subjectTemplate: '原主题',
      bodyTemplate: '${alarm.type}',
      enabled: false,
      version: 9
    })
    const invalid = vi.fn()
    state.validateSubject(null, '', invalid)
    expect(invalid.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(alarm.fetchCreateAlarmNotificationTemplate).not.toHaveBeenCalled()
    expect(alarm.fetchUpdateAlarmNotificationTemplate).not.toHaveBeenCalled()
  } finally {
    page.unmount()
    vi.unstubAllGlobals()
  }
})
