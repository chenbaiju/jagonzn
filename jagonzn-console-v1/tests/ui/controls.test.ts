import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import FoundationPage from '@/pages/FoundationPage.vue'
const wrappers: ReturnType<typeof mount>[] = []
afterEach(() => { wrappers.splice(0).forEach(w => w.unmount()); document.body.innerHTML = '' })
describe('公共控件点击与弹层状态', () => {
  it('返回只发出事件，操作区及标题保持独立', async () => {
    const wrapper = mount(PageHeader, { props: {title:'设备详情',back:true}, global:{plugins:[ElementPlus]}, slots:{default:'操作'} }); wrappers.push(wrapper)
    await wrapper.get('button[aria-label="返回"]').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
    expect(wrapper.get('h1').text()).toBe('设备详情')
    expect(wrapper.get('.tl-page-header__actions').text()).toBe('操作')
  })
  it.each([false, true])('游标分页禁用不存在的上一页/下一页，不假造总页数（分组=%s）', async (grouped) => {
    const wrapper = mount(CursorPager, { props:{grouped,page:1,hasNext:true},global:{plugins:[ElementPlus]} }); wrappers.push(wrapper)
    expect(wrapper.get('button[aria-label="上一页"]').attributes('disabled')).toBeDefined()
    await wrapper.get('button[aria-label="下一页"]').trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
    await wrapper.setProps({page:2,hasNext:false})
    expect(wrapper.get('button[aria-label="下一页"]').attributes('disabled')).toBeDefined()
    await wrapper.get('button[aria-label="上一页"]').trigger('click')
    expect(wrapper.emitted('previous')).toHaveLength(1)
  })
  it.each([false, true])('真实总数驱动页码跳转，加载中不重复触发（分组=%s）', async (grouped) => {
    const wrapper = mount(CursorPager, { props: { grouped, page: 2, total: '72', limit: 24 }, global: { plugins: [ElementPlus] } }); wrappers.push(wrapper)
    expect(wrapper.findAll('[aria-current="page"]').map(node => node.text())).toEqual(['2'])
    await wrapper.get('button[aria-label="第 3 页"]').trigger('click')
    expect(wrapper.emitted('update:page')).toEqual([[3]])
    await wrapper.setProps({ page: 3, loading: true })
    expect(wrapper.get('button[aria-label="下一页"]').attributes('disabled')).toBeDefined()
    await wrapper.get('button[aria-label="第 1 页"]').trigger('click')
    expect(wrapper.emitted('update:page')).toHaveLength(1)
  })
  it.each([false, true])('点击后显示原站每页数选项，选择72后发出真实事件（分组=%s）', async (grouped) => {
    const wrapper = mount(CursorPager, { attachTo: document.body, props: { grouped, page: 1, hasNext: true }, global: { plugins: [ElementPlus] } }); wrappers.push(wrapper)
    await wrapper.get('.el-select__wrapper').trigger('click'); await flushPromises()
    const options = Array.from(document.querySelectorAll('[role="option"]'))
    expect(options.map(node => node.textContent?.trim())).toEqual(['24', '48', '72', '96'])
    ;(options.find(node => node.textContent?.trim() === '72') as HTMLElement).click(); await flushPromises()
    expect(wrapper.emitted('update:limit')).toEqual([[72]])
  })
  it.each([false, true])('无每页选择的原站页只显示翻页控件，恢复默认后保留目录的每页选择（分组=%s）', async (grouped) => {
    const wrapper = mount(CursorPager, { props: { grouped, page: 1, hasNext: true, showSizes: false }, global: { plugins: [ElementPlus] } }); wrappers.push(wrapper)
    expect(wrapper.find('[role="combobox"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('个 / 页')
    await wrapper.get('button[aria-label="下一页"]').trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
    expect(wrapper.emitted('update:limit')).toBeUndefined()
    await wrapper.setProps({ showSizes: true })
    expect(wrapper.find('[role="combobox"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('个 / 页')
  })
  it.each([false, true])('未提供原站总页数时可只保留上一下一，不额外展示页码一（分组=%s）', async (grouped) => {
    const wrapper = mount(CursorPager, { props: { grouped, page: 1, hasNext: true, showSizes: false, showPages: false }, global: { plugins: [ElementPlus] } }); wrappers.push(wrapper)
    expect(wrapper.find('.tl-pager__page').exists()).toBe(false)
    expect(wrapper.findAll('button').map(button => button.attributes('aria-label'))).toEqual(['上一页', '下一页'])
    await wrapper.get('button[aria-label="下一页"]').trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)
    await wrapper.setProps({ showPages: true })
    expect(wrapper.get('[aria-current="page"]').text()).toBe('1')
  })
  it.each([false, true])('十进制总数不经过浮点取整，极大页码保持原值且不发出不安全数字（分组=%s）', async (grouped) => {
    const wrapper = mount(CursorPager, { props: { grouped, page: 1, total: '9007199254740993', limit: 1 }, global: { plugins: [ElementPlus] } }); wrappers.push(wrapper)
    const last = wrapper.get('button[aria-label="第 9007199254740993 页"]')
    expect(last.text()).toBe('9007199254740993'); expect(last.attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('.tl-pager__page').length).toBeLessThanOrEqual(7)
    await last.trigger('click'); expect(wrapper.emitted('update:page')).toBeUndefined()
  })
  it('失权和错误状态不能继续渲染数据，重读按钮真实发事件', async () => {
    const wrapper = mount(AsyncState, {props:{forbidden:true}, slots:{default:'敏感数据'},global:{plugins:[ElementPlus]}}); wrappers.push(wrapper)
    expect(wrapper.text()).not.toContain('敏感数据')
    await wrapper.setProps({forbidden:false,error:new Error('读取失败')})
    expect(wrapper.text()).toContain('读取失败'); expect(wrapper.text()).not.toContain('敏感数据')
    await wrapper.get('button').trigger('click'); expect(wrapper.emitted('retry')).toHaveLength(1)
  })
  it('点击后才出现的表单弹层可输入和取消，取消后弹层关闭', async () => {
    const router = createRouter({history:createMemoryHistory(),routes:[{path:'/design-system',component:FoundationPage}]})
    await router.push('/design-system'); await router.isReady()
    const wrapper = mount(FoundationPage,{attachTo:document.body,global:{plugins:[ElementPlus,router]}}); wrappers.push(wrapper)
    const open = wrapper.findAll('button').find(b => b.text()==='打开示例弹窗')!
    await open.trigger('click'); await flushPromises()
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog).not.toBeNull(); expect(dialog.textContent).toContain('编辑设备')
    const input = dialog.querySelector('input')!; input.value='长名称设备'; input.dispatchEvent(new Event('input',{bubbles:true}))
    const cancel = Array.from(dialog.querySelectorAll('button')).find(b => b.textContent?.trim()==='取消')!
    cancel.click(); await flushPromises()
    expect(document.querySelector('.el-overlay')?.getAttribute('style')).toContain('display: none')
  })
})
