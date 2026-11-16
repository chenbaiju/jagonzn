import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { ElMessageBox } from 'element-plus'
import Panel from '@/views/device/components/DeviceClaimToken.vue'
import { devicePurposeCode } from '@/utils/device-purpose-code'
import * as api from '@/api/device-purpose-codes'
const state = vi.hoisted(() => ({ user: {} as any }))
vi.mock('@/store/modules/user', () => ({ useUserStore: () => state.user }))
vi.mock('@/api/device-purpose-codes', () => ({
  issueDeviceClaimCode: vi.fn(),
  readDeviceLocationCode: vi.fn(),
  revokeDeviceClaimCode: vi.fn()
}))
vi.mock('@/api/project', () => ({ fetchProjects: vi.fn(async () => [project]) }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: vi.fn() } }))
const project = { id: 'p', projectCode: 'project', name: '项目', status: 'ACTIVE' } as const
const device = '00000000-0000-4000-8000-000000000001'
const location = {
  kind: 'thingslink.device',
  version: 1,
  purpose: 'LOCATE',
  projectKey: 'project',
  deviceId: device
}
const claim = () => ({
  ...location,
  purpose: 'CLAIM',
  codeId: device,
  token: 'a'.repeat(43),
  expiresAt: new Date(Date.now() + 600_000).toISOString()
})
let panel: VueWrapper
function render() {
  panel = mount(Panel, {
    props: { projectId: 'p', deviceId: device, primaryKnown: false },
    global: {
      stubs: {
        ElDivider: { template: '<div><slot/></div>' },
        ElInput: {
          props: ['modelValue'],
          emits: ['update:modelValue'],
          template:
            '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
        },
        ElAlert: { props: ['title'], template: '<p>{{title}}<slot/></p>' },
        ElButton: {
          props: ['disabled'],
          template: '<button :disabled="disabled"><slot/></button>'
        },
        QrcodeVue: { props: ['value'], template: '<output>{{value}}</output>' }
      }
    }
  })
}
const button = (text: string) => panel.findAll('button').find((b) => b.text() === text)!
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  state.user = reactive({
    info: {
      currentProjectId: 'p',
      userId: 'a',
      tenantId: 't',
      roles: ['OWNER'],
      buttons: ['enduser:manage']
    }
  })
  vi.mocked(api.issueDeviceClaimCode).mockResolvedValue(claim())
  vi.mocked(api.readDeviceLocationCode).mockResolvedValue(location)
  vi.mocked(ElMessageBox.confirm).mockResolvedValue('confirm' as any)
})
afterEach(() => {
  panel?.unmount()
  vi.useRealTimers()
})
async function ready() {
  render()
  await flushPromises()
  await panel.get('input').setValue('https://platform.test')
}
it('定位码不含能力/到期字段，不能跨设备或注入外部跳转', () => {
  const result = JSON.parse(devicePurposeCode(project, 'https://platform.test', device, location))
  expect(Object.keys(result).sort()).toEqual(
    ['kind', 'version', 'purpose', 'origin', 'projectKey', 'deviceId'].sort()
  )
  expect(() => devicePurposeCode(project, 'https://evil.test/path', device, location)).toThrow()
  expect(() => devicePurposeCode(project, 'https://platform.test', 'different', location)).toThrow()
  expect(() =>
    devicePurposeCode(project, 'https://platform.test', device, { ...location, token: 'x' } as any)
  ).toThrow()
})
it('明确确认后只签发一次；关闭展示不宣称撤销，可显式撤销', async () => {
  await ready()
  await button('签发认领令牌').trigger('click')
  await flushPromises()
  expect(api.issueDeviceClaimCode).toHaveBeenCalledExactlyOnceWith('p', device)
  expect(panel.find('output').text()).toContain('"purpose":"CLAIM"')
  await button('关闭令牌展示').trigger('click')
  expect(panel.find('output').exists()).toBe(false)
  expect(api.revokeDeviceClaimCode).not.toHaveBeenCalled()
  await button('撤销本次认领码').trigger('click')
  await flushPromises()
  expect(api.revokeDeviceClaimCode).toHaveBeenCalledExactlyOnceWith('p', device, device)
  expect(panel.text()).toContain('设备关系未改变')
})
it('身份切换立即清除秘密并丢弃迟到结果', async () => {
  await ready()
  let resolve!: (v: any) => void
  vi.mocked(api.issueDeviceClaimCode).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r
      })
  )
  await button('签发认领令牌').trigger('click')
  await flushPromises()
  state.user.info.userId = 'other'
  await flushPromises()
  resolve(claim())
  await flushPromises()
  expect(panel.find('output').exists()).toBe(false)
  expect(panel.text()).not.toContain('a'.repeat(43))
})
it('认领失败不重复签发，不能显示或保存未确认能力', async () => {
  vi.mocked(api.issueDeviceClaimCode).mockRejectedValue(new Error('controlled'))
  await ready()
  await button('签发认领令牌').trigger('click')
  await flushPromises()
  expect(api.issueDeviceClaimCode).toHaveBeenCalledTimes(1)
  expect(panel.find('output').exists()).toBe(false)
  expect(panel.text()).toContain('不自动重发')
})
it('查看定位不发认领请求，撤权后清除展示', async () => {
  await ready()
  await button('显示设备定位码').trigger('click')
  await flushPromises()
  expect(panel.find('output').text()).not.toContain('token')
  expect(api.issueDeviceClaimCode).not.toHaveBeenCalled()
  state.user.info.roles = ['VIEWER']
  await flushPromises()
  expect(panel.find('section').exists()).toBe(false)
})

it('到期自动清除能力与二维码，不宣称主动撤销', async () => {
  await ready()
  await button('签发认领令牌').trigger('click')
  await flushPromises()
  expect(panel.find('output').exists()).toBe(true)
  await vi.advanceTimersByTimeAsync(600_001)
  expect(panel.find('output').exists()).toBe(false)
  expect(panel.find('input[aria-label="一次性认领令牌"]').exists()).toBe(false)
  expect(api.revokeDeviceClaimCode).not.toHaveBeenCalled()
})
