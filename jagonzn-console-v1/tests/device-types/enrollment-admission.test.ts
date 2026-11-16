import { afterEach, expect, it, vi } from 'vitest'
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import EnrollmentAdmission from '../../src/features/device-types/DeviceTypeEnrollmentAdmission.vue'
import * as http from '../../src/core/http'
import { session } from '../../src/core/session'

const project = '00000000-0000-4000-8000-000000000001'
const type = '00000000-0000-4000-8000-000000000002'
const path = `/api/v1/projects/${project}/device-types/${type}/enrollment-admission`

afterEach(() => {
  session.user = null
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

it('付费项目开启后才显示导入，关闭后隐藏入口', async () => {
  session.user = { currentProjectId: project } as never
  const state = { deviceTypeId: type, canEnable: true, enabled: false, total: 0, pending: 0 }
  const api = vi.spyOn(http, 'api')
    .mockResolvedValueOnce(state)
    .mockResolvedValueOnce({ ...state, enabled: true })
    .mockResolvedValueOnce({ ...state, enabled: true })
    .mockResolvedValueOnce({ ...state, enabled: true, total: 2, pending: 2 })
    .mockResolvedValueOnce({ ...state, total: 2, pending: 2 })
  const wrapper = mount(EnrollmentAdmission, {
    props: { typeId: type, allowed: true, disabled: false },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
  try {
    await flushPromises()
    const status = wrapper.get('input[aria-label="启用设备白名单"]')
    expect(status.attributes('disabled')).toBeUndefined()
    expect((status.element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
    await wrapper.get('.el-switch').trigger('click')
    await flushPromises()
    expect(api).toHaveBeenLastCalledWith(path + '/policy', expect.objectContaining({
      method: 'put', body: { enabled: true },
    }))
    await wrapper.get('button').trigger('click')
    await flushPromises()
    const dialog = new DOMWrapper(document.querySelector<HTMLElement>('[role="dialog"][aria-label="导入设备序列号"]')!)
    expect(dialog.text()).toContain('已导入 0 个，待首启 0 个')
    await dialog.get('textarea').setValue('0000123\n设备-0002')
    await dialog.findAll('button').find(button => button.text() === '导入')!.trigger('click')
    await flushPromises()
    expect(api).toHaveBeenCalledTimes(4)
    expect(api.mock.calls[0]?.[0]).toBe(path)
    expect(api).toHaveBeenLastCalledWith(path, expect.objectContaining({
      method: 'put', body: { serialNumbers: ['0000123', '设备-0002'] },
    }))
    expect(dialog.text()).toContain('已导入 2 个，待首启 2 个')
    expect(dialog.get('textarea').element.value).toBe('')
    await dialog.findAll('button').find(button => button.text() === '关闭')!.trigger('click')
    expect((status.element as HTMLInputElement).checked).toBe(true)
    await wrapper.get('.el-switch').trigger('click')
    await flushPromises()
    expect(api).toHaveBeenLastCalledWith(path + '/policy', expect.objectContaining({
      method: 'put', body: { enabled: false },
    }))
    expect((status.element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
  } finally {
    wrapper.unmount()
  }
})

it('免费项目的关闭状态不能开启，也不显示导入入口', async () => {
  session.user = { currentProjectId: project } as never
  const api = vi.spyOn(http, 'api')
    .mockResolvedValue({ deviceTypeId: type, canEnable: false, enabled: false, total: 0, pending: 0 })
  const wrapper = mount(EnrollmentAdmission, {
    props: { typeId: type, allowed: true, disabled: false },
    global: { plugins: [ElementPlus] },
  })
  try {
    await flushPromises()
    expect(wrapper.get('input[aria-label="启用设备白名单"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('需要有效付费订阅')
    expect(wrapper.find('button').exists()).toBe(false)
    await wrapper.get('.el-switch').trigger('click')
    expect(api).toHaveBeenCalledTimes(1)
  } finally {
    wrapper.unmount()
  }
})
