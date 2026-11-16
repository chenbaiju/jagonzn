import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'
import TaskRelatedDevicesView from '../../src/features/rules/TaskRelatedDevicesView.vue'
import { ApiError } from '../../src/core/http'
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
const a={key:'a',label:'设备甲',href:'/devices/a',scheduled:true},b={key:'b',label:'设备乙',scheduled:false}
let wrapper:ReturnType<typeof mount>
async function open(props:Record<string,unknown>={}){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<p />'}}]});await router.push('/tasks/jobs/j?tab=devices');await router.isReady();wrapper=mount(TaskRelatedDevicesView,{props:{rows:[a,b],canRun:true,canManage:true,...props},attachTo:document.body,global:{plugins:[ElementPlus,router]}});await flushPromises()}
function button(label:string){const node=wrapper.findAll('button').find(n=>n.text()===label||n.attributes('aria-label')===label);if(!node)throw new Error('missing '+label);return node}
afterEach(()=>{wrapper?.unmount();document.body.innerHTML=''})
it('Source四列/选择/帮助文案保持，未知最后运行单元格空白，不造日期或受理时刻',async()=>{
 await open();expect(wrapper.findAll('th').map(n=>n.text())).toEqual(['','设备名称','任务最后运行时间','手动执行任务','允许定时运行']);expect(wrapper.text()).toContain('当禁用指定的设备后，该设备将不会执行定时任务。');expect(wrapper.findAll('[aria-label="最后运行时间未知"]')).toHaveLength(2);expect(wrapper.text()).not.toContain('2026');expect(wrapper.text()).not.toContain('acceptedAt');expect(wrapper.find('a').attributes('href')).toBe('/devices/a');expect(wrapper.find('[aria-label="分页"]').exists()).toBe(false)
})
it('选择按实际键发出，当前页全选保留外页已选，未选择不能运行',async()=>{
 await open({selectedKeys:['previous']});await wrapper.find('[aria-label="选择当前页全部设备"]').find('input').setValue(true);expect(wrapper.emitted('selection')).toEqual([[['previous','a','b']]]);await wrapper.setProps({selectedKeys:['a']});await button('运行选中设备（1）').trigger('click');expect(wrapper.emitted('run')).toEqual([[['a']]]);await wrapper.setProps({selectedKeys:[]});expect(button('运行选中设备（0）').attributes('disabled')).toBeDefined()
})
it('单设备手动运行独立于定时关闭，不发调度变更或把指定设备扩成全体',async()=>{
 await open();await button('运行 设备乙').trigger('click');expect(wrapper.emitted('run')).toEqual([[['b']]]);expect(wrapper.emitted('changeSchedule')).toBeUndefined();expect(wrapper.find('[aria-label="允许 设备乙 定时运行"]').attributes('aria-checked')).toBe('false')
})
it('无运行权限仍可管理偏好，实际switch仅发显式布尔且不乐观取反原投影',async()=>{
 await open({canRun:false,canManage:true});expect(button('运行 设备甲').attributes('disabled')).toBeDefined();await wrapper.find('[aria-label="允许 设备乙 定时运行"]').trigger('click');expect(wrapper.emitted('changeSchedule')).toEqual([['b',true]]);expect(wrapper.emitted('run')).toBeUndefined();expect(wrapper.find('[aria-label="允许 设备乙 定时运行"]').attributes('aria-checked')).toBe('false')
})
it('普通读取成员看实际偏好但不能运行、选择或修改',async()=>{
 await open({canRun:false,canManage:false});expect(wrapper.find('[aria-label="允许 设备甲 定时运行"]').attributes('aria-checked')).toBe('true');expect(wrapper.find('[aria-label="允许 设备甲 定时运行"]').attributes('aria-disabled')).toBe('true');expect(wrapper.find('[aria-label="选择 设备甲"]').find('input').attributes('disabled')).toBeDefined();await wrapper.find('[aria-label="允许 设备甲 定时运行"]').trigger('click');await button('运行 设备甲').trigger('click');expect(wrapper.emitted('changeSchedule')).toBeUndefined();expect(wrapper.emitted('run')).toBeUndefined()
})
it('未知写锁住所有写/选择，保留人工核对入口；忙时刷新也禁用',async()=>{
 await open({locked:true,writeError:'结果未知',selectedKeys:['a']});expect(button('运行选中设备（1）').attributes('disabled')).toBeDefined();expect(button('运行 设备甲').attributes('disabled')).toBeDefined();expect(wrapper.find('[aria-label="允许 设备甲 定时运行"]').attributes('aria-disabled')).toBe('true');await button('重新读取核对').trigger('click');expect(wrapper.emitted('reread')).toHaveLength(1);await wrapper.setProps({busy:true});expect(button('刷新').attributes('disabled')).toBeDefined()
})
it('读取失败或拒绝遮住旧设备，不能渲染成成功空列表',async()=>{
 await open({error:new ApiError('设备读取失败',503)});expect(wrapper.text()).toContain('设备读取失败');expect(wrapper.text()).not.toContain('设备甲');expect(wrapper.text()).not.toContain('暂无数据');expect(button('运行选中设备（0）').attributes('disabled')).toBeDefined();await wrapper.setProps({forbidden:true});expect(wrapper.text()).toContain('读取权限');expect(wrapper.text()).not.toContain('设备读取失败')
})
it('有真实后页才显示无假页数/总计的方向控件，空结果不伪造开关',async()=>{
 await open({hasNext:true});expect(wrapper.find('[aria-label="分页"]').exists()).toBe(true);expect(wrapper.find('[aria-label="每页数量"]').exists()).toBe(false);await wrapper.find('button[aria-label="下一页"]').trigger('click');expect(wrapper.emitted('next')).toHaveLength(1);await wrapper.setProps({rows:[],hasNext:false});expect(wrapper.find('[role="switch"]').exists()).toBe(false);expect(wrapper.text()).toContain('暂无数据')
})
