import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { afterEach, expect, it } from 'vitest'
import { reactive } from 'vue'
import DeviceCreatePage from '@/views/device/components/DeviceCreatePage.vue'
import type { DeviceCreationForm } from '@/views/device/device-creation-form'

const wrappers: ReturnType<typeof mount>[] = []
function page() {
  const model = reactive<DeviceCreationForm>({
    name: '',
    deviceKey: '',
    deviceTypeId: '',
    groupId: '',
    location: '',
    description: '',
    tags: [{ key: '', value: '' }]
  })
  const wrapper = mount(DeviceCreatePage, {
    props: {
      model,
      rules: { name: [{ required: true, message: '请输入设备名称' }] },
      types: [],
      groups: [],
      typesLoading: false,
      submitting: false,
      'onUpdate:model': (value) => Object.assign(model, value)
    },
    global: { plugins: [ElementPlus] }
  })
  wrappers.push(wrapper)
  return { wrapper, model }
}
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()))

it('页面字段、键值行增删通过受控模型传递给原有创建流程', async () => {
  const { wrapper, model } = page()
  await wrapper.get('input[aria-label="设备名称"]').setValue(' 传感器 ')
  await wrapper.get('input[aria-label="设备标识符"]').setValue('sensor_new')
  await wrapper.get('input[aria-label="标签名称 1"]').setValue('region')
  await wrapper.get('input[aria-label="标签值 1"]').setValue('east')
  expect(model.name).toBe('传感器')
  expect(model.deviceKey).toBe('sensor_new')
  expect(model.tags).toEqual([{ key: 'region', value: 'east' }])
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '添加标签')!
    .trigger('click')
  expect(model.tags).toHaveLength(2)
  await wrapper.get('button[aria-label="移除标签 1"]').trigger('click')
  expect(model.tags).toEqual([{ key: '', value: '' }])
})

it('独立页面返回原列表，不生成任何弹窗', async () => {
  const { wrapper } = page()
  expect(wrapper.find('.el-dialog').exists()).toBe(false)
  await wrapper.get('button[aria-label="返回设备列表"]').trigger('click')
  expect(wrapper.emitted('cancel')).toHaveLength(1)
})
