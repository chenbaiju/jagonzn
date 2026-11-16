import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import Panel from '@/views/device/components/DeviceImagePanel.vue'
import * as api from '@/api/device-images'
const state = vi.hoisted(() => ({ user: {} as any }))
vi.mock('@/store/modules/user', () => ({ useUserStore: () => state.user }))
vi.mock('@/api/device-images', () => ({
  readDeviceImage: vi.fn(),
  readDeviceImageContent: vi.fn(),
  uploadDeviceImage: vi.fn(),
  removeDeviceImage: vi.fn()
}))
let panel: VueWrapper
const empty = { revision: '9007199254740993', present: false, writable: true, pendingState: null }
const current = { ...empty, present: true, width: 8, height: 5, sizeBytes: 80 }
const button = (text: string) => panel.findAll('button').find((b) => b.text() === text)!
function render() {
  panel = mount(Panel, {
    props: { projectId: 'p', deviceId: 'd', active: true },
    global: {
      stubs: {
        ElAlert: { props: ['title'], template: '<p>{{title}}</p>' },
        ElEmpty: { props: ['description'], template: '<p>{{description}}</p>' },
        ElButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' }
      }
    }
  })
}
async function select(file = new File(['png'], 'private-gps.png', { type: 'image/png' })) {
  Object.defineProperty(panel.find('input').element, 'files', { value: [file], configurable: true })
  await panel.find('input').trigger('change')
  return file
}
beforeEach(() => {
  vi.resetAllMocks()
  state.user = reactive({
    info: { currentProjectId: 'p', userId: 'a', tenantId: 't', roles: ['OWNER'] }
  })
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:owned-image'),
    revokeObjectURL: vi.fn()
  })
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee') })
  vi.mocked(api.readDeviceImage).mockResolvedValue(empty as any)
  vi.mocked(api.readDeviceImageContent).mockResolvedValue(new Blob(['safe'], { type: 'image/png' }))
  vi.mocked(api.uploadDeviceImage).mockResolvedValue(current as any)
})
afterEach(() => {
  panel?.unmount()
  vi.unstubAllGlobals()
})
it('旧设备无图；单次上传携带精确long修订和独立键，清除原文件', async () => {
  render()
  await flushPromises()
  expect(panel.text()).toContain('尚未设置')
  const file = await select()
  await button('上传或替换图片').trigger('click')
  await flushPromises()
  expect(api.uploadDeviceImage).toHaveBeenCalledExactlyOnceWith(
    'p',
    'd',
    empty.revision,
    file,
    'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  )
  expect((panel.find('input').element as HTMLInputElement).value).toBe('')
})
it('只读成员可查看当前图，不能选择或更换；卸载撤销Blob地址', async () => {
  state.user.info.roles = ['VIEWER']
  vi.mocked(api.readDeviceImage).mockResolvedValue({ ...current, writable: false } as any)
  render()
  await flushPromises()
  expect(panel.find('img').attributes('src')).toBe('blob:owned-image')
  expect(panel.find('input').exists()).toBe(false)
  expect(button('删除图片')).toBeUndefined()
  panel.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:owned-image')
})
it('服务器只读或UNKNOWN未决时拒绝写入，保留责任提示', async () => {
  vi.mocked(api.readDeviceImage).mockResolvedValue({ ...empty, pendingState: 'UNKNOWN' } as any)
  render()
  await flushPromises()
  expect(panel.text()).toContain('未决图片上传')
  expect(panel.find('input').attributes('disabled')).toBeDefined()
  expect(button('上传或替换图片').attributes('disabled')).toBeDefined()
})
it('上传未知不自动重发；手动刷新前禁止覆盖且不保留文件', async () => {
  vi.mocked(api.uploadDeviceImage).mockRejectedValue(new Error('unknown'))
  render()
  await flushPromises()
  await select()
  await button('上传或替换图片').trigger('click')
  await flushPromises()
  expect(api.uploadDeviceImage).toHaveBeenCalledOnce()
  expect(panel.text()).toContain('未自动重发')
  expect(panel.find('input').attributes('disabled')).toBeDefined()
  await button('刷新图片状态').trigger('click')
  await flushPromises()
  expect(api.uploadDeviceImage).toHaveBeenCalledOnce()
  expect(button('上传或替换图片').attributes('disabled')).toBeDefined()
})
it('身份/设备切换丢弃旧正文，不创建旧Blob；清空已显示图片', async () => {
  let finish!: (blob: Blob) => void
  vi.mocked(api.readDeviceImage).mockResolvedValueOnce(current as any)
  vi.mocked(api.readDeviceImageContent).mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r
      })
  )
  render()
  await flushPromises()
  await panel.setProps({ deviceId: 'other-device' })
  await flushPromises()
  finish(new Blob(['late']))
  await flushPromises()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
  expect(panel.find('img').exists()).toBe(false)
})
it('删除采用当前修订，成功后重新读取权威状态', async () => {
  vi.mocked(api.readDeviceImage)
    .mockResolvedValueOnce(current as any)
    .mockResolvedValue(empty as any)
  render()
  await flushPromises()
  await button('删除图片').trigger('click')
  await flushPromises()
  expect(api.removeDeviceImage).toHaveBeenCalledExactlyOnceWith('p', 'd', current.revision)
  expect(panel.find('img').exists()).toBe(false)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:owned-image')
})
it('不接受SVG或超过1MiB的输入；不完整响应不授写', async () => {
  render()
  await flushPromises()
  await select(new File(['<svg/>'], 'evil.svg', { type: 'image/svg+xml' }))
  expect(panel.text()).toContain('PNG/JPEG')
  expect(api.uploadDeviceImage).not.toHaveBeenCalled()
  vi.mocked(api.readDeviceImage).mockResolvedValue({ present: true } as any)
  await button('刷新图片状态').trigger('click')
  await flushPromises()
  expect(panel.text()).toContain('无法读取设备图片')
  expect(api.readDeviceImageContent).not.toHaveBeenCalled()
})
