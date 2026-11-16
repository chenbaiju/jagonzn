import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, shallowMount } from '@vue/test-utils'
import { defineComponent, nextTick, reactive, ref } from 'vue'
import Groups from '@/views/alarm/notification-groups/index.vue'
import Templates from '@/views/alarm/notification-templates/index.vue'
import Firmwares from '@/views/ota/firmwares/index.vue'
import Campaigns from '@/views/ota/campaigns/index.vue'
import * as alarm from '@/api/alarm'
import * as ota from '@/api/ota'

const state = vi.hoisted(() => ({ user: {} as any, route: {} as any }))
vi.mock('@/store/modules/user', async () => {
  const { reactive, ref } = await import('vue')
  state.user = reactive({ info: ref({}) })
  return { useUserStore: () => state.user }
})
vi.mock('vue-router', async () => ({
  ...(await vi.importActual<typeof import('vue-router')>('vue-router')),
  useRoute: () => state.route
}))
vi.mock('@/hooks/core/useAppMode', () => ({
  useAppMode: () => ({ isFrontendMode: ref(false) })
}))
vi.mock('@/api/device', () => ({
  fetchDeviceTypePage: vi.fn().mockResolvedValue({ items: [] }),
  fetchSearchDevices: vi.fn().mockResolvedValue({ items: [] })
}))
vi.mock('@/api/alarm', () => ({
  fetchAlarmNotificationGroups: vi.fn(),
  fetchAlarmNotificationRecipients: vi.fn(),
  fetchCreateAlarmNotificationGroup: vi.fn(),
  fetchUpdateAlarmNotificationGroup: vi.fn(),
  fetchDeleteAlarmNotificationGroup: vi.fn(),
  fetchCreateAlarmNotificationRecipient: vi.fn(),
  fetchUpdateAlarmNotificationRecipient: vi.fn(),
  fetchDeleteAlarmNotificationRecipient: vi.fn(),
  fetchAlarmNotificationTemplates: vi.fn(),
  fetchCreateAlarmNotificationTemplate: vi.fn(),
  fetchUpdateAlarmNotificationTemplate: vi.fn(),
  fetchDeleteAlarmNotificationTemplate: vi.fn()
}))
vi.mock('@/api/ota', () => ({
  fetchOtaFirmwares: vi.fn(),
  fetchLatestThingModelVersion: vi.fn(),
  fetchOtaFirmwareLifecycle: vi.fn(),
  fetchOtaUploadHistory: vi.fn(),
  fetchOtaPublicationHistory: vi.fn(),
  fetchOtaUpload: vi.fn(),
  createOtaFirmware: vi.fn(),
  createOtaUpload: vi.fn(),
  createOtaPublication: vi.fn(),
  cancelOtaUpload: vi.fn(),
  cancelOtaFirmware: vi.fn(),
  deprecateOtaFirmware: vi.fn(),
  revokeOtaFirmware: vi.fn(),
  uploadOtaContent: vi.fn(),
  sha256Hex: vi.fn(),
  OtaUploadError: class extends Error {},
  fetchOtaCampaigns: vi.fn(),
  fetchOtaCampaign: vi.fn(),
  fetchOtaCampaignExecution: vi.fn(),
  fetchOtaCampaignBatches: vi.fn(),
  fetchOtaDeviceEligibility: vi.fn(),
  createOtaCampaign: vi.fn(),
  scheduleOtaCampaign: vi.fn(),
  startOtaCampaign: vi.fn(),
  pauseOtaCampaign: vi.fn(),
  resumeOtaCampaign: vi.fn(),
  cancelOtaCampaign: vi.fn(),
  advanceOtaCampaignBatch: vi.fn()
}))

const group = { id: 'group', name: '停用模拟通知组', enabled: false, version: 7 }
const template = {
  id: 'template',
  name: '停用模板',
  channel: 'EMAIL',
  subjectTemplate: '主题',
  bodyTemplate: '正文',
  enabled: false,
  version: 9
}
const firmware = { id: 'firmware', firmwareVersion: '1.0.0', status: 'DRAFT', revision: '7' }
const campaign = { id: 'campaign', status: 'DRAFT', firmwareId: 'firmware' }
const Surface = defineComponent({
  props: ['modelValue', 'title'],
  template: '<section v-if="modelValue" :aria-label="title"><slot/><slot name="footer"/></section>'
})
const validate = vi.fn()
function render(component: any) {
  return shallowMount(component, {
    global: {
      stubs: {
        ConsoleWorkspaceHeader: { template: '<header><slot name="actions"/></header>' },
        ElCard: { template: '<div><slot/></div>' },
        ElTable: {
          props: ['data'],
          template: '<div class="read-list">{{JSON.stringify(data)}}</div>'
        },
        ElDialog: Surface,
        ElDrawer: Surface,
        ElButton: { template: '<button><slot/></button>' },
        ElForm: defineComponent({
          setup(_, { expose }) {
            expose({ validate })
          },
          template: '<form><slot/></form>'
        }),
        ElFormItem: { template: '<label><slot/></label>' },
        ElDivider: { template: '<div><slot/></div>' },
        ElRadioGroup: { template: '<div><slot/></div>' },
        ElCollapse: { template: '<div><slot/></div>' },
        ElCollapseItem: { template: '<div><slot/></div>' },
        ElAlert: { template: '<div><slot/></div>' },
        ElDescriptions: { template: '<div><slot/></div>' },
        ElDescriptionsItem: { template: '<div><slot/></div>' }
      },
      directives: { loading: () => {} }
    }
  })
}
const setup = (page: ReturnType<typeof render>) => (page.vm as any).$.setupState
async function revoke(permission: string) {
  state.user.info.buttons = state.user.info.buttons.filter(
    (code: string) => code !== permission
  )
  state.route.meta.authList = state.route.meta.authList.filter(
    (point: { authMark: string }) => point.authMark !== permission
  )
  await nextTick()
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.clearAllMocks()
  validate.mockResolvedValue(true)
  state.user.info = {
    userId: 'user',
    currentProjectId: 'project',
    roles: ['OWNER'],
    buttons: ['alarm:read', 'alarm:manage', 'ota:read', 'ota:deploy']
  }
  state.route = reactive({
    meta: { authList: state.user.info.buttons.map((authMark: string) => ({ authMark })) }
  })
  vi.mocked(alarm.fetchAlarmNotificationGroups).mockResolvedValue({ items: [group] })
  vi.mocked(alarm.fetchAlarmNotificationRecipients).mockResolvedValue([])
  vi.mocked(alarm.fetchAlarmNotificationTemplates).mockResolvedValue({ items: [template as any] })
  vi.mocked(ota.fetchOtaFirmwares).mockResolvedValue({ items: [firmware as any] })
  vi.mocked(ota.fetchOtaFirmwareLifecycle).mockResolvedValue({} as any)
  vi.mocked(ota.fetchOtaUploadHistory).mockResolvedValue({ items: [] })
  vi.mocked(ota.fetchOtaPublicationHistory).mockResolvedValue({ items: [] })
  vi.mocked(ota.fetchOtaCampaigns).mockResolvedValue({ items: [campaign as any] })
  vi.mocked(ota.fetchOtaCampaign).mockResolvedValue(campaign as any)
  vi.mocked(ota.fetchOtaCampaignExecution).mockResolvedValue({} as any)
  vi.mocked(ota.fetchOtaCampaignBatches).mockResolvedValue([])
})

it('通知组仅撤回路由管理点时关闭组与收件表单，保留列表和收件目录', async () => {
  const page = render(Groups)
  try {
    await flushPromises()
    const model = setup(page)
    await model.openRecipients(group)
    model.openEditGroup(group)
    model.openCreateRecipient()
    await nextTick()
    expect(model.groupFormVisible && model.recipientFormVisible).toBe(true)
    await revoke('alarm:manage')
    expect(model.groupFormVisible || model.recipientFormVisible).toBe(false)
    expect(model.recipientsVisible).toBe(true)
    expect(model.groups).toEqual([group])
    expect(page.find('.read-list').text()).toContain(group.name)
    await model.submitGroup()
    await model.submitRecipient()
    expect(alarm.fetchUpdateAlarmNotificationGroup).not.toHaveBeenCalled()
    expect(alarm.fetchCreateAlarmNotificationRecipient).not.toHaveBeenCalled()
  } finally {
    page.unmount()
  }
})

it('通知模板仅撤回会话管理权限时关闭编辑表面，不提交旧表单', async () => {
  const page = render(Templates)
  try {
    await flushPromises()
    const model = setup(page)
    model.openEdit(template)
    await nextTick()
    expect(model.formVisible).toBe(true)
    await revoke('alarm:manage')
    expect(model.formVisible).toBe(false)
    expect(model.templates).toEqual([template])
    await model.submitTemplate()
    expect(alarm.fetchUpdateAlarmNotificationTemplate).not.toHaveBeenCalled()
  } finally {
    page.unmount()
  }
})

it('固件仅撤回部署点时关闭旧内联写表单，保留已读取的列表及详情', async () => {
  const page = render(Firmwares)
  try {
    await flushPromises()
    const model = setup(page)
    await model.openDetail(firmware)
    await model.openCreate()
    model.openUpload(firmware)
    model.openPublish(firmware)
    await nextTick()
    expect(model.createVisible && model.uploadVisible && model.publishVisible).toBe(true)
    await revoke('ota:deploy')
    expect(model.createVisible || model.uploadVisible || model.publishVisible).toBe(false)
    expect(model.detailVisible).toBe(true)
    expect(model.firmwares).toEqual([firmware])
    model.createForm.deviceTypeId = 'type'
    model.createForm.firmwareVersion = '2.0.0'
    model.modelVersion = { id: 'model' }
    await model.submitCreate()
    await model.submitUpload()
    await model.submitPublish()
    expect(ota.createOtaFirmware).not.toHaveBeenCalled()
    expect(ota.createOtaUpload).not.toHaveBeenCalled()
    expect(ota.createOtaPublication).not.toHaveBeenCalled()
  } finally {
    page.unmount()
  }
})

it('活动仅撤回部署点时关闭创建表单，详情仍保留且不提交', async () => {
  const page = render(Campaigns)
  try {
    await flushPromises()
    const model = setup(page)
    await model.openDetail(campaign)
    await model.openCreate()
    expect(model.createVisible).toBe(true)
    await revoke('ota:deploy')
    expect(model.createVisible).toBe(false)
    expect(model.detailVisible).toBe(true)
    expect(model.campaigns).toEqual([campaign])
    model.draft.firmwareId = 'firmware'
    model.draft.deviceIds = ['device']
    await model.submitCreate()
    expect(ota.createOtaCampaign).not.toHaveBeenCalled()
  } finally {
    page.unmount()
  }
})

it.each(['group', 'recipient', 'template'] as const)(
  '%s 异步校验期间撤回管理点后不再写接口',
  async (kind) => {
    const page = render(kind === 'template' ? Templates : Groups)
    try {
      await flushPromises()
      const model = setup(page)
      if (kind === 'group') model.openEditGroup(group)
      else if (kind === 'template') model.openEdit(template)
      else {
        await model.openRecipients(group)
        model.openCreateRecipient()
      }
      await nextTick()
      const gate = deferred<boolean>()
      validate.mockReturnValueOnce(gate.promise)
      const pending =
        kind === 'group'
          ? model.submitGroup()
          : kind === 'recipient'
            ? model.submitRecipient()
            : model.submitTemplate()
      expect(validate).toHaveBeenCalledOnce()
      await revoke('alarm:manage')
      gate.resolve(true)
      await pending
      expect(alarm.fetchUpdateAlarmNotificationGroup).not.toHaveBeenCalled()
      expect(alarm.fetchUpdateAlarmNotificationTemplate).not.toHaveBeenCalled()
      expect(alarm.fetchCreateAlarmNotificationRecipient).not.toHaveBeenCalled()
    } finally {
      page.unmount()
    }
  }
)

it('上传读取文件期间撤回部署点后不继续上传字节', async () => {
  const page = render(Firmwares)
  try {
    await flushPromises()
    const model = setup(page)
    model.openUpload(firmware)
    const bytes = deferred<ArrayBuffer>()
    model.selectedFile = { size: 3, arrayBuffer: () => bytes.promise }
    model.artifactSha256 = 'a'.repeat(64)
    vi.mocked(ota.createOtaUpload).mockResolvedValue({ id: 'session' } as any)
    const pending = model.submitUpload()
    await flushPromises()
    expect(ota.createOtaUpload).toHaveBeenCalledOnce()
    await revoke('ota:deploy')
    bytes.resolve(new ArrayBuffer(3))
    await pending
    expect(ota.uploadOtaContent).not.toHaveBeenCalled()
  } finally {
    page.unmount()
  }
})

it.each(['group', 'template'] as const)('%s 保留原管理点时仍提交回填字段与原版本', async (kind) => {
  const page = render(kind === 'group' ? Groups : Templates)
  try {
    await flushPromises()
    const model = setup(page)
    if (kind === 'group') model.openEditGroup(group)
    else model.openEdit(template)
    await nextTick()
    if (kind === 'group') {
      await model.submitGroup()
      expect(alarm.fetchUpdateAlarmNotificationGroup).toHaveBeenCalledExactlyOnceWith(
        'project',
        group.id,
        { name: group.name, enabled: false, version: 7 }
      )
    } else {
      await model.submitTemplate()
      expect(alarm.fetchUpdateAlarmNotificationTemplate).toHaveBeenCalledExactlyOnceWith(
        'project',
        template.id,
        {
          name: template.name,
          channel: 'EMAIL',
          subjectTemplate: '主题',
          bodyTemplate: '正文',
          enabled: false,
          version: 9
        }
      )
    }
  } finally {
    page.unmount()
  }
})

it.each(['firmware', 'campaign'] as const)('%s 保留原部署点时仍按原合同创建草稿', async (kind) => {
  const page = render(kind === 'firmware' ? Firmwares : Campaigns)
  try {
    await flushPromises()
    const model = setup(page)
    await model.openCreate()
    if (kind === 'firmware') {
      model.createForm.deviceTypeId = 'type'
      model.createForm.firmwareVersion = '2.0.0'
      model.modelVersion = { id: 'model' }
      vi.mocked(ota.createOtaFirmware).mockResolvedValue({} as any)
      await model.submitCreate()
      expect(ota.createOtaFirmware).toHaveBeenCalledExactlyOnceWith(
        'project',
        {
          deviceTypeId: 'type',
          thingModelVersionId: 'model',
          firmwareVersion: '2.0.0'
        },
        expect.any(String)
      )
    } else {
      model.draft.firmwareId = 'firmware'
      model.draft.deviceIds = ['device']
      vi.mocked(ota.createOtaCampaign).mockResolvedValue({} as any)
      await model.submitCreate()
      expect(ota.createOtaCampaign).toHaveBeenCalledExactlyOnceWith(
        'project',
        expect.objectContaining({
          contractVersion: 'tc-ota-campaign-plan/v1',
          firmwareId: 'firmware',
          deviceIds: ['device'],
          batchSize: 10
        }),
        expect.any(String)
      )
    }
  } finally {
    page.unmount()
  }
})
