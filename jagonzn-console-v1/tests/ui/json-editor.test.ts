import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import JsonCodeEditor from '@/ui/JsonCodeEditor.vue'

const mocks = vi.hoisted(() => ({ create: vi.fn(), value: vi.fn(), configure: vi.fn(), destroy: vi.fn(), measure: vi.fn() }))
vi.mock('@/ui/json-code-editor-engine', () => ({ createJsonEditor: mocks.create }))
let wrapper: ReturnType<typeof mount> | undefined
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.resetAllMocks() })
function stubEngine() { mocks.create.mockReturnValue({ setValue: mocks.value, configure: mocks.configure, destroy: mocks.destroy, measure: mocks.measure }) }
it('懒加载期间输入保留原字符串，加载后仅用户变更回发，属性同步及关闭销毁生效', async () => {
  stubEngine()
  wrapper = mount(JsonCodeEditor, { props: { modelValue: '{"n":9007199254740993}', ariaLabel: '命令参数 JSON' } })
  expect(wrapper.get('textarea').element.value).toBe('{"n":9007199254740993}')
  await flushPromises()
  expect(wrapper.find('textarea').exists()).toBe(false)
  const changed = mocks.create.mock.calls[0]![3] as (value: string) => void
  changed('{"n":9007199254740995}')
  expect(wrapper.emitted('update:modelValue')).toEqual([['{"n":9007199254740995}']])
  await wrapper.setProps({ modelValue: 'null', disabled: true })
  expect(mocks.value).toHaveBeenCalledWith('null')
  changed('false')
  expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
  wrapper.unmount(); wrapper = undefined
  expect(mocks.destroy).toHaveBeenCalledOnce()
  changed('true')
})
it('动态导入尚未完成即关闭时不能创建游离实例或再次发事件', async () => {
  stubEngine()
  wrapper = mount(JsonCodeEditor, { props: { modelValue: '{}', ariaLabel: '命令参数 JSON' } })
  wrapper.unmount(); wrapper = undefined
  await flushPromises()
  expect(mocks.create).not.toHaveBeenCalled()
})
it('创建失败保留原生输入，重试成功使用最新文本而非初始JSON', async () => {
  mocks.create.mockImplementationOnce(() => { throw new Error('模拟资源初始化失败') })
  wrapper = mount(JsonCodeEditor, { props: { modelValue: 'false', ariaLabel: '命令参数 JSON' } })
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('输入内容已保留')
  await wrapper.get('textarea').setValue('9007199254740993')
  expect(wrapper.emitted('update:modelValue')).toEqual([['9007199254740993']])
  await wrapper.setProps({ modelValue: '9007199254740993' })
  stubEngine()
  await wrapper.get('button').trigger('click'); await flushPromises()
  expect(mocks.create.mock.lastCall![1]).toBe('9007199254740993')
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
})
