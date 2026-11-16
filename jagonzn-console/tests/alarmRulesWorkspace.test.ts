import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { computed, defineComponent, h, inject, provide, reactive, ref, nextTick } from 'vue'
import Page from '@/views/alarm/rules/index.vue'
import { fetchAlarmRules, fetchCreateAlarmRule } from '@/api/alarm'
import { fetchDeviceDetail } from '@/api/device'
import * as alarm from '@/api/alarm'

const mocks = vi.hoisted(() => ({
  user: {} as any,
  route: {
    query: {} as Record<string, string>,
    meta: { authList: [] as { authMark: string }[] }
  }
}))
vi.mock('@/store/modules/user', async () => {
  const { reactive, ref } = await import('vue')
  mocks.user = reactive({ info: ref({}) })
  return { useUserStore: () => mocks.user }
})
vi.mock('vue-router', async () => ({
  ...(await vi.importActual<typeof import('vue-router')>('vue-router')),
  useRoute: () => mocks.route
}))
vi.mock('@/hooks/core/useAppMode', () => ({
  useAppMode: () => ({ isFrontendMode: ref(false) })
}))
vi.mock('@/api/device', () => ({ fetchDeviceDetail: vi.fn() }))
vi.mock('@/api/alarm', () => ({
  fetchAlarmRules: vi.fn(),
  fetchCreateAlarmRule: vi.fn(),
  fetchUpdateAlarmRule: vi.fn(),
  fetchDeleteAlarmRule: vi.fn(),
  fetchAlarmNotificationBindings: vi.fn(),
  fetchAlarmNotificationGroups: vi.fn(),
  fetchAlarmNotificationTemplates: vi.fn(),
  fetchCreateAlarmNotificationBinding: vi.fn(),
  fetchUpdateAlarmNotificationBinding: vi.fn(),
  fetchDeleteAlarmNotificationBinding: vi.fn()
}))
vi.mock('@/composables/usePagedDeviceCatalog', () => ({
  usePagedDeviceCatalog: () => ({
    devices: ref([]),
    devicesLoading: ref(false),
    loadDevices: vi.fn().mockResolvedValue(undefined),
    ensureDevices: vi.fn().mockResolvedValue(undefined),
    searchDevices: vi.fn(),
    onDevicePopupScroll: vi.fn()
  })
}))
vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: vi.fn() },
  ElMessage: { success: vi.fn() }
}))
const id = '11111111-1111-4111-8111-111111111111'
beforeEach(() => {
  vi.resetAllMocks()
  Object.assign(mocks.user, {
    isLogin: true,
    info: {
      userId: 'u',
      currentProjectId: 'a',
      buttons: ['device:read', 'alarm:read', 'alarm:manage']
    }
  })
  mocks.route = reactive({
    query: {},
    meta: {
      authList: ['device:read', 'alarm:read', 'alarm:manage'].map((authMark) => ({ authMark }))
    }
  })
  vi.mocked(fetchAlarmRules).mockResolvedValue({ items: [] })
  vi.mocked(fetchDeviceDetail).mockResolvedValue({ id, name: '设备A' })
  vi.mocked(alarm.fetchAlarmNotificationBindings).mockResolvedValue([])
  vi.mocked(alarm.fetchAlarmNotificationGroups).mockResolvedValue({ items: [] })
  vi.mocked(alarm.fetchAlarmNotificationTemplates).mockResolvedValue({ items: [] })
})
it('来源设备通过复核后点击创建才进入表单，不自动提交', async () => {
  mocks.route.query = { deviceId: id, contextProjectId: 'a' }
  const page = shallowMount(Page, {
    global: {
      stubs: {
        ElCard: true,
        ElDialog: true,
        ElTable: true,
        ElTableColumn: true,
        ElAlert: true,
        ElForm: true,
        ElFormItem: true
      },
      directives: { loading: () => {} }
    }
  })
  await flushPromises()
  const state = (page.vm as any).$.setupState
  expect(state.formVisible).toBe(false)
  expect(state.form.deviceId).toBe('')
  state.openCreate()
  expect(state.form.deviceId).toBe(id)
  expect(fetchCreateAlarmRule).not.toHaveBeenCalled()
  mocks.user.info.currentProjectId = 'b'
  await nextTick()
  expect(state.formVisible).toBe(false)
  expect(state.form.deviceId).toBe('')
  page.unmount()
})
it('切换项目后旧告警规则列表迟到不得覆盖新项目', async () => {
  let resolve!: (value: any) => void
  const previous = new Promise((done) => {
    resolve = done
  })
  vi.mocked(fetchAlarmRules).mockImplementation((project) =>
    project === 'a' ? (previous as any) : Promise.resolve({ items: [{ id: 'new' }] })
  )
  const page = shallowMount(Page, {
    global: {
      stubs: {
        ElCard: true,
        ElDialog: true,
        ElTable: true,
        ElTableColumn: true,
        ElAlert: true,
        ElForm: true,
        ElFormItem: true
      },
      directives: { loading: () => {} }
    }
  })
  mocks.user.info.currentProjectId = 'b'
  await flushPromises()
  resolve({ items: [{ id: 'private-old' }] })
  await flushPromises()
  expect((page.vm as any).$.setupState.items).toEqual([{ id: 'new' }])
  page.unmount()
})
it('无告警读取权限不发列表请求', async () => {
  // 后端模式只信任当前路由权限，全局按钮权限不能代替缺失的读取授权。
  mocks.user.info.buttons = ['device:read', 'alarm:manage']
  mocks.route.meta.authList = [{ authMark: 'alarm:manage' }]
  const page = shallowMount(Page, {
    global: {
      stubs: {
        ElCard: true,
        ElDialog: true,
        ElTable: true,
        ElTableColumn: true,
        ElAlert: true,
        ElForm: true,
        ElFormItem: true
      },
      directives: { loading: () => {} }
    }
  })
  await flushPromises()
  expect(fetchAlarmRules).not.toHaveBeenCalled()
  page.unmount()
})

const Surface = defineComponent({
  props: ['modelValue', 'title'],
  template: '<section v-if="modelValue" :aria-label="title"><slot/><slot name="footer"/></section>'
})
function mountControls() {
  return shallowMount(Page, {
    global: {
      stubs: {
        ConsoleWorkspaceHeader: { template: '<header><slot name="actions"/></header>' },
        ConsoleTableAction: {
          props: ['label'],
          template: '<button :aria-label="label">{{label}}</button>'
        },
        ElCard: { template: '<div><slot/></div>' },
        ElButton: { template: '<button><slot/></button>' },
        ElDialog: Surface,
        ElDrawer: Surface,
        ElForm: defineComponent({
          setup(_, { expose, slots }) {
            expose({ validateField: vi.fn().mockResolvedValue(undefined) })
            return () => h('form', slots.default?.())
          }
        }),
        ElFormItem: { props: ['label'], template: '<label>{{label}}<slot/></label>' },
        ElDivider: { template: '<div><slot/></div>' },
        ElTable: defineComponent({
          props: ['data'],
          setup(props, { slots }) {
            provide(
              'rows',
              computed(() => props.data ?? [])
            )
            return () => h('div', slots.default?.())
          }
        }),
        ElTableColumn: defineComponent({
          setup(_, { slots }) {
            const rows = inject<any>('rows')
            return () =>
              h(
                'div',
                rows.value.flatMap((row: any) => slots.default?.({ row }) ?? [])
              )
          }
        })
      },
      directives: { loading: () => {} }
    }
  })
}
const sample = {
  id: 'sample-rule',
  name: '停用模拟规则',
  alarmType: 'HIGH_TEMPERATURE',
  deviceId: id,
  propertyKey: 'temperature',
  triggerOperator: 'GT' as const,
  triggerThreshold: 80,
  triggerDurationSeconds: 60,
  clearOperator: 'LTE' as const,
  clearThreshold: 70,
  clearDurationSeconds: 120,
  severity: 'WARNING' as const,
  enabled: false,
  version: 7,
  updatedAt: '2026-10-23T09:23:24Z'
}
it.each([
  ['OWNER', true],
  ['ADMIN', true],
  ['OPERATOR', false],
  ['VIEWER', false]
] as const)('后端路由模式下 %s 可读取，管理控件按原授权隔离', async (role, manage) => {
  mocks.user.info.roles = [role]
  mocks.user.info.buttons = manage
    ? ['device:read', 'alarm:read', 'alarm:manage']
    : ['device:read', 'alarm:read']
  mocks.route.meta.authList = (manage ? ['alarm:read', 'alarm:manage'] : ['alarm:read']).map(
    (authMark) => ({ authMark })
  )
  vi.mocked(fetchAlarmRules).mockResolvedValue({ items: [sample] })
  const page = mountControls()
  try {
    await flushPromises()
    expect(fetchAlarmRules).toHaveBeenCalledExactlyOnceWith('a', undefined)
    expect((page.vm as any).$.setupState.items).toEqual([sample])
    expect(page.find('header button').exists()).toBe(manage)
    expect(page.find('[aria-label="编辑"]').exists()).toBe(manage)
    expect(page.find('[aria-label="删除"]').exists()).toBe(manage)
    await page.get('[aria-label="通知"]').trigger('click')
    await flushPromises()
    expect(alarm.fetchAlarmNotificationBindings).toHaveBeenCalledExactlyOnceWith('a', sample.id)
    expect(page.text().includes('添加路由')).toBe(manage)
    expect(alarm.fetchUpdateAlarmRule).not.toHaveBeenCalled()
    expect(alarm.fetchCreateAlarmNotificationBinding).not.toHaveBeenCalled()
  } finally {
    page.unmount()
  }
})
it('编辑回填保留停用和版本，离线条件与通知渠道切换不触发保存', async () => {
  vi.mocked(fetchAlarmRules).mockResolvedValue({ items: [sample] })
  vi.mocked(alarm.fetchAlarmNotificationTemplates).mockResolvedValue({
    items: [
      { id: 'email', name: '停用邮件模板', channel: 'EMAIL', enabled: false },
      { id: 'webhook', name: '停用Webhook模板', channel: 'WEBHOOK', enabled: false }
    ]
  })
  const page = mountControls()
  try {
    await flushPromises()
    await page.get('[aria-label="编辑"]').trigger('click')
    const state = (page.vm as any).$.setupState
    expect(state.formVisible).toBe(true)
    expect(state.editingId).toBe(sample.id)
    for (const key of Object.keys(state.form))
      expect(state.form[key]).toEqual(sample[key as keyof typeof sample])
    const offline = page.findAll('button').find((button) => button.text() === '使用设备离线条件')!
    await offline.trigger('click')
    expect(state.form).toMatchObject({
      propertyKey: 'platformConnectionOnline',
      triggerOperator: 'EQ',
      triggerThreshold: 0,
      clearOperator: 'EQ',
      clearThreshold: 1,
      enabled: false,
      version: 7
    })
    state.formVisible = false
    await page.get('[aria-label="通知"]').trigger('click')
    await flushPromises()
    const add = page.findAll('button').find((button) => button.text() === '添加路由')!
    await add.trigger('click')
    expect(state.bindingFormVisible).toBe(true)
    expect(state.bindingTemplateOptions.map((item: any) => item.id)).toEqual(['email'])
    state.bindingForm.templateId = 'email'
    state.bindingForm.channel = 'WEBHOOK'
    state.onBindingChannelChange()
    await nextTick()
    expect(state.bindingForm.templateId).toBe('')
    expect(state.bindingTemplateOptions.map((item: any) => item.id)).toEqual(['webhook'])
    expect(alarm.fetchUpdateAlarmRule).not.toHaveBeenCalled()
    expect(alarm.fetchCreateAlarmRule).not.toHaveBeenCalled()
    expect(alarm.fetchCreateAlarmNotificationBinding).not.toHaveBeenCalled()
    expect(alarm.fetchUpdateAlarmNotificationBinding).not.toHaveBeenCalled()
  } finally {
    page.unmount()
  }
})

it('挂载后补发会话读取权限即加载列表', async () => {
  mocks.user.info.buttons = ['device:read']
  mocks.route.meta.authList = []
  vi.mocked(fetchAlarmRules).mockResolvedValue({ items: [sample] })
  const page = mountControls()
  try {
    await flushPromises()
    expect(fetchAlarmRules).not.toHaveBeenCalled()
    mocks.user.info.buttons = ['device:read', 'alarm:read']
    mocks.route.meta.authList = [{ authMark: 'alarm:read' }]
    await flushPromises()
    expect(fetchAlarmRules).toHaveBeenCalledExactlyOnceWith('a', undefined)
    expect((page.vm as any).$.setupState.items).toEqual([sample])
    expect(page.find('[aria-label="编辑"]').exists()).toBe(false)
  } finally {
    page.unmount()
  }
})

it('仅撤销会话读取权限清除已加载列表并关闭编辑窗口', async () => {
  vi.mocked(fetchAlarmRules).mockResolvedValue({ items: [sample] })
  const page = mountControls()
  try {
    await flushPromises()
    await page.get('[aria-label="编辑"]').trigger('click')
    const state = (page.vm as any).$.setupState
    expect(state.formVisible).toBe(true)
    mocks.user.info.buttons = ['device:read']
    mocks.route.meta.authList = []
    await flushPromises()
    expect(state.items).toEqual([])
    expect(state.formVisible).toBe(false)
    expect(fetchAlarmRules).toHaveBeenCalledTimes(1)
    expect(alarm.fetchUpdateAlarmRule).not.toHaveBeenCalled()
  } finally {
    page.unmount()
  }
})

it('撤销会话管理权限关闭通知路由编辑表单，保留读取且不保存', async () => {
  vi.mocked(fetchAlarmRules).mockResolvedValue({ items: [sample] })
  const page = mountControls()
  try {
    await flushPromises()
    await page.get('[aria-label="通知"]').trigger('click')
    await flushPromises()
    await page
      .findAll('button')
      .find((button) => button.text() === '添加路由')!
      .trigger('click')
    const state = (page.vm as any).$.setupState
    expect(state.bindingsVisible).toBe(true)
    expect(state.bindingFormVisible).toBe(true)
    mocks.user.info.buttons = ['device:read', 'alarm:read']
    mocks.route.meta.authList = [{ authMark: 'alarm:read' }]
    await flushPromises()
    expect(state.bindingsVisible).toBe(false)
    expect(state.bindingFormVisible).toBe(false)
    expect(state.items).toEqual([sample])
    expect(page.find('[aria-label="编辑"]').exists()).toBe(false)
    expect(fetchAlarmRules).toHaveBeenCalledTimes(2)
    expect(alarm.fetchCreateAlarmNotificationBinding).not.toHaveBeenCalled()
  } finally {
    page.unmount()
  }
})

it('路由 meta 换对象但权限值未变时保留正在编辑的表单与列表', async () => {
  vi.mocked(fetchAlarmRules).mockResolvedValue({ items: [sample] })
  const page = mountControls()
  try {
    await flushPromises()
    await page.get('[aria-label="编辑"]').trigger('click')
    const state = (page.vm as any).$.setupState
    state.form.name = '尚未保存的名称'
    mocks.route.meta = {
      authList: ['alarm:read', 'alarm:manage'].map((authMark) => ({ authMark }))
    }
    await flushPromises()
    expect(state.formVisible).toBe(true)
    expect(state.form.name).toBe('尚未保存的名称')
    expect(state.items).toEqual([sample])
    expect(fetchAlarmRules).toHaveBeenCalledTimes(1)
  } finally {
    page.unmount()
  }
})
