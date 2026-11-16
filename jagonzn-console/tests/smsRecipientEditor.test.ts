import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import Panel from '@/components/business/SmsRecipientEditor.vue'
import * as api from '@/api/sms-recipients'
import { invalidateIdentity } from '@/utils/http/identity-scope'
const state = vi.hoisted(() => ({ user: {} as any }))
vi.mock('@/store/modules/user', () => ({ useUserStore: () => state.user }))
vi.mock('@/api/sms-recipients', () => ({ readSmsRecipient: vi.fn(), updateSmsRecipient: vi.fn() }))
const initial = {
  purpose: 'QUOTA_WARNING',
  phoneNumber: null,
  revision: '9007199254740993',
  enabled: false,
  confirmed: false,
  writable: true,
  providerConfigured: false
} as const
let panel: VueWrapper
function render(
  purpose: 'QUOTA_WARNING' | 'SUBSCRIPTION_EXPIRING' | 'DEVICE_ALARM' = 'QUOTA_WARNING'
) {
  panel = mount(Panel, {
    props: { purpose, ...(purpose === 'DEVICE_ALARM' ? { projectId: 'p' } : {}) },
    global: {
      stubs: {
        ElForm: { template: '<form><slot/></form>' },
        ElFormItem: { template: '<div><slot/></div>' },
        ElInput: {
          props: ['modelValue', 'disabled'],
          emits: ['update:modelValue'],
          template:
            '<input aria-label="phone" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)"/>'
        },
        ElCheckbox: {
          props: ['modelValue', 'disabled'],
          emits: ['update:modelValue'],
          template:
            '<label><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)"/><slot/></label>'
        },
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
const phone = () => panel.find('input:not([type="checkbox"])')
beforeEach(() => {
  vi.resetAllMocks()
  state.user = reactive({
    info: { userId: 'a', tenantId: 't', currentProjectId: 'p', roles: ['OWNER'] }
  })
  vi.mocked(api.readSmsRecipient).mockResolvedValue(initial)
})
afterEach(() => panel?.unmount())
it('短信接收设置按用途精确保存一次并保留大版本，未配置供应商仍可保存且不声称送达', async () => {
  let resolve!: (v: any) => void
  vi.mocked(api.updateSmsRecipient).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r
      })
  )
  render()
  await flushPromises()
  expect(panel.text()).toContain('当前不会外发')
  await phone().setValue('+8613800000000')
  await panel.findAll('input[type="checkbox"]')[0].setValue(true)
  expect(button('保存接收设置').attributes('disabled')).toBeDefined()
  await panel.findAll('input[type="checkbox"]')[1].setValue(true)
  await button('保存接收设置').trigger('click')
  await button('保存接收设置').trigger('click')
  expect(api.updateSmsRecipient).toHaveBeenCalledExactlyOnceWith('QUOTA_WARNING', undefined, {
    phoneNumber: '+8613800000000',
    enabled: true,
    confirmed: true,
    expectedRevision: initial.revision
  })
  expect(panel.text()).not.toContain('接收设置已保存')
  resolve({
    ...initial,
    phoneNumber: '+8613800000000',
    enabled: true,
    confirmed: true,
    revision: '9007199254740994'
  })
  await flushPromises()
  expect(panel.text()).toContain('未发送测试短信')
})
it('短信接收设置更改号码取消旧用途确认，清空同时关闭', async () => {
  vi.mocked(api.readSmsRecipient).mockResolvedValue({
    ...initial,
    phoneNumber: '+8613800000000',
    enabled: true,
    confirmed: true
  })
  vi.mocked(api.updateSmsRecipient).mockResolvedValue({ ...initial, revision: '9007199254740994' })
  render()
  await flushPromises()
  await phone().setValue('+8613900000000')
  expect((panel.findAll('input[type="checkbox"]')[1].element as HTMLInputElement).checked).toBe(
    false
  )
  expect(button('保存接收设置').attributes('disabled')).toBeDefined()
  await phone().setValue('')
  await button('保存接收设置').trigger('click')
  await flushPromises()
  expect(api.updateSmsRecipient).toHaveBeenCalledWith('QUOTA_WARNING', undefined, {
    phoneNumber: null,
    enabled: false,
    confirmed: false,
    expectedRevision: initial.revision
  })
})
it('短信接收设置普通项目角色不加载号码，归档读取为只读', async () => {
  state.user.info.roles = ['VIEWER']
  render('DEVICE_ALARM')
  await flushPromises()
  expect(api.readSmsRecipient).not.toHaveBeenCalled()
  expect(phone().exists()).toBe(false)
  vi.mocked(api.readSmsRecipient).mockResolvedValue({
    ...initial,
    purpose: 'DEVICE_ALARM',
    writable: false
  })
  state.user.info.roles = ['ADMIN']
  await nextTick()
  await flushPromises()
  expect(api.readSmsRecipient).toHaveBeenCalledWith('DEVICE_ALARM', 'p')
  expect(phone().attributes('disabled')).toBeDefined()
  expect(panel.text()).toContain('当前配置只读')
})
it('短信接收设置冲突或未知结果不自动重发，必须读取权威配置再编辑', async () => {
  vi.mocked(api.updateSmsRecipient).mockRejectedValue(new Error('PRIVATE_PHONE'))
  render()
  await flushPromises()
  await phone().setValue('+8613800000000')
  await button('保存接收设置').trigger('click')
  await flushPromises()
  expect(api.updateSmsRecipient).toHaveBeenCalledTimes(1)
  expect(api.readSmsRecipient).toHaveBeenCalledTimes(1)
  expect(button('保存接收设置').attributes('disabled')).toBeDefined()
  expect(panel.text()).toContain('重新读取后核对')
  expect(panel.text()).not.toContain('PRIVATE_PHONE')
  await button('重新读取').trigger('click')
  await flushPromises()
  expect(api.readSmsRecipient).toHaveBeenCalledTimes(2)
  expect((phone().element as HTMLInputElement).value).toBe('')
})
it('短信接收设置身份切换立即清空号码且迟到保存不能回填', async () => {
  let resolve!: (v: any) => void
  vi.mocked(api.updateSmsRecipient).mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r
      })
  )
  render()
  await flushPromises()
  await phone().setValue('+8613800000000')
  await button('保存接收设置').trigger('click')
  invalidateIdentity()
  state.user.info.userId = 'b'
  state.user.info.tenantId = 'next'
  await nextTick()
  await flushPromises()
  resolve({ ...initial, phoneNumber: '+8613800000000', revision: '9007199254740994' })
  await flushPromises()
  expect((phone().element as HTMLInputElement).value).toBe('')
  expect(panel.text()).not.toContain('接收设置已保存')
})
it('短信接收设置拒绝不完整或超出long的响应，不能显示为无配置可保存', async () => {
  vi.mocked(api.readSmsRecipient).mockResolvedValue({ ...initial, revision: '9223372036854775808' })
  render()
  await flushPromises()
  expect(panel.text()).toContain('无法读取接收设置')
  expect(button('保存接收设置').attributes('disabled')).toBeDefined()
})
