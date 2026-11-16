import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { flushPromises, shallowMount, type VueWrapper } from '@vue/test-utils'
import { computed, defineComponent, inject, provide, reactive, ref, type Component } from 'vue'

const state = vi.hoisted(() => ({
  user: {} as any,
  route: {} as any,
  frontend: {} as any,
  validate: vi.fn(),
  writes: {} as Record<string, Mock<(...args: unknown[]) => Promise<unknown>>>
}))
vi.mock('@/store/modules/user', async () => {
  const { reactive, ref } = await import('vue')
  state.user = reactive({ info: ref({}) })
  return { useUserStore: () => state.user }
})
vi.mock('vue-router', async (original) => ({
  ...(await original<typeof import('vue-router')>()),
  useRoute: () => state.route,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() })
}))
vi.mock('@/hooks/core/useAppMode', () => ({
  useAppMode: () => ({ isFrontendMode: state.frontend })
}))
vi.mock('@/utils/http/identity-scope', () => ({ currentIdentityEpoch: () => 1 }))
vi.mock('@/utils/workbench-recent', () => ({ recordRecentResource: vi.fn() }))
vi.mock('@/api/device-group', () => ({
  fetchDeviceGroups: vi
    .fn()
    .mockResolvedValue([{ id: 'group', name: '保留设备组', type: 'STATIC' }]),
  fetchCreateDeviceGroup: (...args: unknown[]) => state.writes.groupCreate(...args),
  fetchUpdateDeviceGroup: (...args: unknown[]) => state.writes.groupUpdate(...args),
  fetchReplaceDeviceGroupMembers: (...args: unknown[]) => state.writes.members(...args),
  fetchDeleteDeviceGroup: vi.fn()
}))
vi.mock('@/api/device-topology', () => ({
  fetchDeviceTopologies: vi.fn().mockResolvedValue([]),
  fetchBindTopology: (...args: unknown[]) => state.writes.bind(...args),
  fetchUnbindTopology: vi.fn()
}))
vi.mock('@/api/modbus-point', () => ({
  fetchModbusPoints: vi
    .fn()
    .mockResolvedValue([{ id: 'point', propertyKey: 'temperature', status: 'DRAFT' }]),
  createModbusPoint: (...args: unknown[]) => state.writes.pointCreate(...args),
  updateModbusPoint: (...args: unknown[]) => state.writes.pointUpdate(...args),
  deleteModbusPoint: vi.fn(),
  publishModbusPoints: vi.fn()
}))
vi.mock('@/api/device', () => ({
  fetchSearchDevices: vi.fn().mockResolvedValue({ items: [{ id: 'child', name: '保留子设备' }] }),
  fetchDeviceTypePage: vi
    .fn()
    .mockResolvedValue({ items: [{ id: 'type', name: '保留设备类型', status: 'DRAFT' }] }),
  fetchDeviceTypeDetail: vi.fn(),
  fetchDevicePropertyDefinitions: vi
    .fn()
    .mockResolvedValue([
      { id: 'property', name: '保留属性', propertyKey: 'temperature', dataType: 'NUMBER' }
    ]),
  fetchDeviceEventDefinitions: vi
    .fn()
    .mockResolvedValue([{ id: 'event', name: '保留事件', eventKey: 'fault', parameters: [] }]),
  fetchDeviceCommandDefinitions: vi
    .fn()
    .mockResolvedValue([{ id: 'command', name: '保留命令', commandKey: 'restart' }]),
  fetchCreateDeviceType: (...args: unknown[]) => state.writes.typeCreate(...args),
  fetchUpdateDeviceType: (...args: unknown[]) => state.writes.typeUpdate(...args),
  fetchCreateDevicePropertyDefinition: (...args: unknown[]) => state.writes.propertyCreate(...args),
  fetchUpdateDevicePropertyDefinition: (...args: unknown[]) => state.writes.propertyUpdate(...args),
  fetchCreateDeviceEventDefinition: (...args: unknown[]) => state.writes.eventCreate(...args),
  fetchUpdateDeviceEventDefinition: (...args: unknown[]) => state.writes.eventUpdate(...args),
  fetchCreateDeviceCommandDefinition: (...args: unknown[]) => state.writes.commandCreate(...args),
  fetchUpdateDeviceCommandDefinition: (...args: unknown[]) => state.writes.commandUpdate(...args),
  fetchDeleteDeviceType: vi.fn(),
  fetchPublishDeviceType: vi.fn(),
  fetchDeleteDevicePropertyDefinition: vi.fn(),
  fetchDeleteDeviceEventDefinition: vi.fn(),
  fetchDeleteDeviceCommandDefinition: vi.fn()
}))
vi.mock('@/api/task', () => ({
  fetchTaskJobs: vi
    .fn()
    .mockResolvedValue([{ id: 'job', name: '保留任务', status: 'PAUSED', scheduleType: 'ONCE' }]),
  fetchTaskExecutions: vi.fn().mockResolvedValue([{ id: 'execution', status: 'FAILED' }]),
  fetchCreateTaskJob: (...args: unknown[]) => state.writes.taskCreate(...args),
  fetchUpdateTaskJob: (...args: unknown[]) => state.writes.taskUpdate(...args),
  fetchRunTaskJob: vi.fn(),
  fetchDeleteTaskJob: vi.fn(),
  fetchEnableTaskJob: vi.fn(),
  fetchDisableTaskJob: vi.fn()
}))
vi.mock('@/api/project', () => ({ fetchProjects: vi.fn().mockResolvedValue([]) }))
vi.mock('@/composables/usePagedDeviceCatalog', async () => {
  const { ref } = await import('vue')
  return {
    usePagedDeviceCatalog: () => ({
      devices: ref([
        { id: 'gateway', name: '保留网关', deviceTypeId: 'gateway-type' },
        { id: 'child', name: '保留子设备', deviceTypeId: 'child-type', gatewayId: 'gateway' }
      ]),
      allDevices: ref([]),
      deviceTypes: ref([
        { id: 'gateway-type', deviceKind: 'GATEWAY', payloadProtocol: 'STANDARD_GATEWAY' },
        { id: 'child-type', deviceKind: 'SUB_DEVICE' }
      ]),
      devicesLoading: ref(false),
      deviceTypesLoading: ref(false),
      typeHasMore: ref(false),
      loadDevices: vi.fn(),
      searchDevices: vi.fn(),
      ensureDevices: vi.fn(),
      onDevicePopupScroll: vi.fn(),
      loadDeviceTypes: vi.fn(),
      onDeviceTypePopupScroll: vi.fn()
    })
  }
})

import Groups from '@/views/device/groups/index.vue'
import Types from '@/views/device/types/index.vue'
import Topology from '@/views/device/topology/index.vue'
import Modbus from '@/views/device/modbus-points/index.vue'
import Jobs from '@/views/task/jobs/index.vue'

const Surface = defineComponent({
  props: ['modelValue', 'title'],
  template:
    '<section v-if="modelValue" role="dialog" :aria-label="title"><slot/><slot name="footer"/></section>'
})
const Form = defineComponent({
  setup(_, { expose }) {
    expose({ validate: (...args: unknown[]) => state.validate(...args), clearValidate: vi.fn() })
  },
  template: '<form @submit.prevent><slot/></form>'
})
const Table = defineComponent({
  props: ['data'],
  setup(props) {
    provide(
      'rows',
      computed(() => props.data ?? [])
    )
  },
  template: '<section role="table"><slot/></section>'
})
const Column = defineComponent({
  props: ['prop', 'label'],
  setup() {
    return { rows: inject('rows') }
  },
  template:
    '<div><b>{{label}}</b><div v-for="(row,index) in rows" :key="index"><slot :row="row">{{row[prop]}}</slot></div></div>'
})
const Field = defineComponent({ props: ['label'], template: '<label>{{label}}<slot/></label>' })
const pages: VueWrapper[] = []
function mountPage(component: Component) {
  const wrapper = shallowMount(component, {
    global: {
      stubs: {
        ConsoleWorkspaceHeader: {
          template: '<header><slot name="leading-actions"/><slot name="actions"/></header>'
        },
        ConsoleFilterBar: { template: '<section><slot/></section>' },
        ConsoleTableAction: { props: ['label'], template: '<button>{{label}}</button>' },
        ElButton: { template: '<button><slot/></button>' },
        ElCard: { template: '<section><slot/></section>' },
        ElTable: Table,
        ElTableColumn: Column,
        ElDialog: Surface,
        ElDrawer: Surface,
        ElForm: Form,
        ElFormItem: Field,
        ElRadioGroup: { template: '<div><slot/></div>' },
        ElRadioButton: { template: '<span><slot/></span>' },
        ElDivider: { template: '<div><slot/></div>' },
        ElDescriptions: { template: '<div><slot/></div>' },
        ElDescriptionsItem: Field,
        ElTag: { template: '<span><slot/></span>' },
        ElInput: true,
        ElInputNumber: true,
        ElSelect: true,
        ElOption: true,
        ElSwitch: true,
        ElDatePicker: true,
        ElDropdown: true,
        ElRadio: true,
        ElCheckbox: true,
        ElDropdownMenu: true,
        ElDropdownItem: true,
        ElAlert: true,
        ElEmpty: true,
        ArtSvgIcon: true,
        ProductCredentialDialog: true
      },
      directives: { loading: () => {} }
    }
  })
  pages.push(wrapper)
  return wrapper
}
const points = (...codes: string[]) => codes.map((authMark) => ({ authMark }))
function revoke(code: string) {
  state.user.info.buttons = state.user.info.buttons.filter(
    (item: string) => item !== code
  )
  state.route.meta = {
    authList: state.route.meta.authList.filter(
      (point: { authMark: string }) => point.authMark !== code
    )
  }
}
function setupState(page: VueWrapper) {
  return (page.vm as any).$.setupState
}
async function click(page: VueWrapper, label: string) {
  const button = page.findAll('button').find((candidate) => candidate.text() === label)
  expect(button, `visible button ${label}`).toBeTruthy()
  await button!.trigger('click')
  await flushPromises()
}
beforeEach(() => {
  vi.clearAllMocks()
  state.frontend = ref(false)
  state.route = reactive({
    meta: {
      authList: points('device:create', 'device:update', 'device:delete', 'task:manage', 'task:run')
    },
    query: {}
  })
  state.user.info = {
    currentProjectId: 'project',
    userId: 'user',
    tenantId: 'tenant',
    roles: ['OWNER'],
    buttons: [
      'device:read',
      'device:create',
      'device:update',
      'device:delete',
      'task:read',
      'task:manage',
      'task:run'
    ]
  }
  state.validate.mockResolvedValue(true)
  state.writes = Object.fromEntries(
    [
      'groupCreate',
      'groupUpdate',
      'members',
      'bind',
      'pointCreate',
      'pointUpdate',
      'typeCreate',
      'typeUpdate',
      'propertyCreate',
      'propertyUpdate',
      'eventCreate',
      'eventUpdate',
      'commandCreate',
      'commandUpdate',
      'taskCreate',
      'taskUpdate'
    ].map((name) => [name, vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({})])
  )
  vi.stubGlobal('ElMessage', { success: vi.fn(), warning: vi.fn() })
})
afterEach(() => {
  pages.splice(0).forEach((page) => page.unmount())
  vi.unstubAllGlobals()
})

describe('页面已打开的写表单随当前路由权限撤回，读取区域保留', () => {
  it.each([
    {
      component: Groups,
      label: '创建设备组',
      code: 'device:create',
      visible: 'formVisible',
      submit: 'submitGroup',
      read: '保留设备组'
    },
    {
      component: Types,
      label: '创建设备类型',
      code: 'device:create',
      visible: 'typeVisible',
      submit: 'submitType',
      read: '保留设备类型'
    },
    {
      component: Topology,
      label: '绑定子设备',
      code: 'device:update',
      visible: 'bindVisible',
      submit: 'submitBind',
      read: '保留网关'
    },
    {
      component: Modbus,
      label: '添加点位',
      code: 'device:update',
      visible: 'dialogVisible',
      submit: 'submit',
      read: 'temperature'
    },
    {
      component: Jobs,
      label: '创建任务',
      code: 'task:manage',
      visible: 'formVisible',
      submit: 'submit',
      read: '保留任务'
    }
  ])(
    '$label 打开后仅撤回会话写权限即关闭，既有列表继续展示',
    async ({ component, label, code, visible, submit, read }) => {
      const page = mountPage(component)
      await flushPromises()
      await click(page, label)
      const vm = setupState(page)
      expect(vm[visible]).toBe(true)
      revoke(code)
      await flushPromises()
      expect(vm[visible]).toBe(false)
      expect(page.text()).toContain(read)
      expect(page.findAll('button').some((button) => button.text() === label)).toBe(false)
      await vm[submit]()
      for (const write of Object.values(state.writes)) expect(write).not.toHaveBeenCalled()
    }
  )

  it('设备组撤回编辑权限后保留成员只读抽屉，阻止旧的成员保存回调', async () => {
    const page = mountPage(Groups)
    await flushPromises()
    await click(page, '编辑')
    const vm = setupState(page)
    await vm.openMembers({ id: 'group', name: '保留设备组', type: 'STATIC' })
    revoke('device:update')
    await flushPromises()
    expect(vm.formVisible).toBe(false)
    expect(vm.membersVisible).toBe(true)
    expect(page.text()).toContain('保留子设备')
    await vm.saveMembers()
    expect(state.writes.members).not.toHaveBeenCalled()
  })

  it.each([
    {
      readLabel: '属性',
      createLabel: '添加属性',
      read: '保留属性',
      visible: 'propertyFormVisible',
      submit: 'submitProperty'
    },
    {
      readLabel: '事件',
      createLabel: '添加事件',
      read: '保留事件',
      visible: 'eventFormVisible',
      submit: 'submitEvent'
    },
    {
      readLabel: '命令',
      createLabel: '添加命令',
      read: '保留命令',
      visible: 'commandFormVisible',
      submit: 'submitCommand'
    }
  ])(
    '设备类型$readLabel定义撤权关闭写表单并保留已读模型',
    async ({ readLabel, createLabel, read, visible, submit }) => {
      const page = mountPage(Types)
      await flushPromises()
      await click(page, readLabel)
      await click(page, createLabel)
      const vm = setupState(page)
      expect(vm[visible]).toBe(true)
      revoke('device:update')
      await flushPromises()
      expect(vm[visible]).toBe(false)
      expect(page.text()).toContain(read)
      await vm[submit]()
      for (const write of Object.values(state.writes)) expect(write).not.toHaveBeenCalled()
    }
  )

  it('任务撤权仅关闭写表单，不关闭已打开的执行记录抽屉', async () => {
    const page = mountPage(Jobs)
    await flushPromises()
    await click(page, '编辑')
    await click(page, '执行记录')
    const vm = setupState(page)
    revoke('task:manage')
    await flushPromises()
    expect(vm.formVisible).toBe(false)
    expect(vm.executionsVisible).toBe(true)
    expect(page.text()).toContain('保留任务')
    await vm.submit()
    expect(state.writes.taskUpdate).not.toHaveBeenCalled()
  })

  it.each([
    { component: Groups, visible: 'formVisible', submit: 'submitGroup', read: '保留设备组' },
    { component: Types, visible: 'typeVisible', submit: 'submitType', read: '保留设备类型' }
  ])(
    '编辑表单使用原 device:update，不因撤回创建权限关闭，也不保留已撤回的编辑能力',
    async ({ component, visible, submit, read }) => {
      const page = mountPage(component)
      await flushPromises()
      await click(page, '编辑')
      const vm = setupState(page)
      revoke('device:create')
      await flushPromises()
      expect(vm[visible]).toBe(true)
      revoke('device:update')
      await flushPromises()
      expect(vm[visible]).toBe(false)
      expect(page.text()).toContain(read)
      await vm[submit]()
      expect(state.writes.groupUpdate).not.toHaveBeenCalled()
      expect(state.writes.typeUpdate).not.toHaveBeenCalled()
    }
  )

  it('Modbus 编辑读取属性期间撤权后不会迟到地重新打开写弹窗', async () => {
    const page = mountPage(Modbus)
    await flushPromises()
    const { fetchDevicePropertyDefinitions } = await import('@/api/device')
    let resolve!: (value: Awaited<ReturnType<typeof fetchDevicePropertyDefinitions>>) => void
    vi.mocked(fetchDevicePropertyDefinitions).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    const pending = setupState(page).openEdit({
      id: 'point',
      subDeviceId: 'child',
      propertyKey: 'temperature',
      status: 'DRAFT'
    })
    revoke('device:update')
    resolve([])
    await pending
    expect(setupState(page).dialogVisible).toBe(false)
    expect(page.text()).toContain('temperature')
  })

  it('产品凭据管理窗口随 device:update 撤回关闭，类型列表不受影响', async () => {
    const page = mountPage(Types)
    await flushPromises()
    const vm = setupState(page)
    vm.openProductCredential({ id: 'published', deviceKind: 'DIRECT', status: 'PUBLISHED' })
    expect(vm.productCredentialVisible).toBe(true)
    revoke('device:update')
    await flushPromises()
    expect(vm.productCredentialVisible).toBe(false)
    expect(page.text()).toContain('保留设备类型')
  })

  it.each([
    { component: Groups, label: '创建设备组', submit: 'submitGroup', code: 'device:create' },
    { component: Types, label: '创建设备类型', submit: 'submitType', code: 'device:create' },
    { component: Jobs, label: '创建任务', submit: 'submit', code: 'task:manage' }
  ])('$label 在异步校验期间撤回权限不发送写请求', async ({ component, label, submit, code }) => {
    const page = mountPage(component)
    await flushPromises()
    await click(page, label)
    let resolve!: (value: boolean) => void
    state.validate.mockImplementationOnce(
      () =>
        new Promise<boolean>((done) => {
          resolve = done
        })
    )
    const pending = setupState(page)[submit]()
    expect(state.validate).toHaveBeenCalled()
    revoke(code)
    resolve(true)
    await pending
    for (const write of Object.values(state.writes)) expect(write).not.toHaveBeenCalled()
  })

  it.each([
    { label: '属性', createLabel: '添加属性', submit: 'submitProperty' },
    { label: '事件', createLabel: '添加事件', submit: 'submitEvent' },
    { label: '命令', createLabel: '添加命令', submit: 'submitCommand' }
  ])(
    '$label表单异步校验期间撤权不写入，恢复权限也不复活原已关闭表单',
    async ({ label, createLabel, submit }) => {
      const page = mountPage(Types)
      await flushPromises()
      await click(page, label)
      await click(page, createLabel)
      let resolve!: (value: boolean) => void
      state.validate.mockImplementationOnce(
        () =>
          new Promise<boolean>((done) => {
            resolve = done
          })
      )
      const pending = setupState(page)[submit]()
      revoke('device:update')
      state.user.info.buttons = ['device:create', 'device:update']
      state.route.meta = { authList: points('device:create', 'device:update') }
      resolve(true)
      await pending
      for (const write of Object.values(state.writes)) expect(write).not.toHaveBeenCalled()
    }
  )

  it.each([
    { component: Groups, label: '创建设备组', submit: 'submitGroup', write: 'groupCreate' },
    { component: Types, label: '创建设备类型', submit: 'submitType', write: 'typeCreate' },
    { component: Topology, label: '绑定子设备', submit: 'submitBind', write: 'bind' },
    { component: Modbus, label: '添加点位', submit: 'submit', write: 'pointCreate' },
    { component: Jobs, label: '创建任务', submit: 'submit', write: 'taskCreate' }
  ])('$label 保持原授权时仍能提交既有 API', async ({ component, label, submit, write }) => {
    const page = mountPage(component)
    await flushPromises()
    await click(page, label)
    const vm = setupState(page)
    if (write === 'bind') vm.bindForm.subDeviceId = 'child'
    if (write === 'pointCreate') {
      vm.form.subDeviceId = 'child'
      vm.form.propertyKey = 'temperature'
    }
    await vm[submit]()
    expect(state.writes[write]).toHaveBeenCalledTimes(1)
    expect(state.writes[write].mock.calls[0][0]).toBe('project')
  })
})
