import { afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'
import TaskDebugLogView from '../../src/features/rules/TaskDebugLogView.vue'
import { ApiError } from '../../src/core/http'
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
const row={key:'log',taskLabel:'温度任务',taskHref:'/tasks/jobs/r',typeLabel:'—',sourceLabel:'定时',at:'2026-10-24T00:00:00Z',countLabel:'—',deliveryLabel:'—'}
let wrapper:ReturnType<typeof mount>
async function open(props:Record<string,unknown>={}){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<p />'}}]});await router.push('/rules/executions');await router.isReady()
 wrapper=mount(TaskDebugLogView,{props:{rows:[],page:1,canManage:true,...props},attachTo:document.body,global:{plugins:[ElementPlus,router]}});await flushPromises()
}
function button(label:string){const node=wrapper.findAll('button').find(b=>b.text()===label || b.attributes('aria-label')===label);if(!node)throw Error('missing '+label);return node}
afterEach(()=>{wrapper?.unmount();document.body.innerHTML=''})
it('普通成员可见真实off开关但不可修改，未知数量与类型保留破折号',async()=>{
 await open({canManage:false,singleTask:true,enabled:false,rows:[row]});expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false');expect(wrapper.find('[role="switch"]').attributes('aria-disabled')).toBe('true');await wrapper.find('[role="switch"]').trigger('click');expect(wrapper.emitted('toggle')).toBeUndefined();expect(wrapper.findAll('td').map(cell=>cell.text())).toEqual(['定时','2026-10-24 08:00:00','—']);expect(button('清空').attributes('disabled')).toBeDefined()
})
it('项目行只显示已确认的展示标签，不补造设备实际执行数或类型方式',async()=>{
 await open({rows:[{...row,acceptedTargets:999,succeededTargets:888,triggerType:'MANUAL',terminalStatus:'SUCCEEDED'}]});expect(wrapper.findAll('td').map(cell=>cell.text())).toEqual(['温度任务','—','定时','2026-10-24 08:00:00','—','—']);expect(wrapper.find('a').attributes('href')).toBe('/tasks/jobs/r');expect(wrapper.text()).not.toContain('999');expect(wrapper.text()).not.toContain('888');expect(wrapper.text()).not.toContain('MANUAL');expect(wrapper.text()).not.toContain('SUCCEEDED')
})
it('项目空日志保留原站六列表头，不显示调试开关或假总数/页数',async()=>{
 await open({canClear:true});expect(wrapper.findAll('th').map(x=>x.text())).toEqual(['任务名称','任务类型','来源','执行时间','下发设备数','下发方式']);expect(wrapper.text()).toContain('暂无日志');expect(wrapper.find('[role="switch"]').exists()).toBe(false);expect(button('上一页').attributes('disabled')).toBeDefined();expect(button('下一页').attributes('disabled')).toBeDefined();expect(wrapper.find('select').exists()).toBe(false)
})
it('详情两列，读取到关闭状态仍展示真实历史；链接保持自身设备与任务身份',async()=>{
 await open({singleTask:true,enabled:false,canClear:true,rows:[row]});expect(wrapper.findAll('th').map(x=>x.text())).toEqual(['来源','运行时间','运行设备数']);expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false');expect(wrapper.find('a').exists()).toBe(false);expect(wrapper.text()).not.toContain('ACK');expect(wrapper.text()).not.toContain('暂无日志')
})
it('未读取到控制状态时不伪造关闭开关，控制读取失败可独立重读',async()=>{
 await open({singleTask:true,controlLoading:true});expect(wrapper.find('[role="switch"]').exists()).toBe(false);await wrapper.setProps({controlLoading:false,controlError:new ApiError('控制读取失败',503)});expect(wrapper.find('[role="switch"]').exists()).toBe(false);await button('重新读取').trigger('click');expect(wrapper.emitted('retryControl')).toHaveLength(1);expect(wrapper.emitted('toggle')).toBeUndefined()
})
it('实际开关发出所选布尔值，写入中/待核对状态均阻止再次变更',async()=>{
 await open({singleTask:true,enabled:false});await wrapper.find('[role="switch"]').trigger('click');expect(wrapper.emitted('toggle')).toEqual([[true]]);await wrapper.setProps({busy:true});expect(wrapper.find('[role="switch"]').attributes('aria-disabled')).toBe('true');await wrapper.find('[role="switch"]').trigger('click');expect(wrapper.emitted('toggle')).toHaveLength(1);await wrapper.setProps({busy:false,locked:true});await wrapper.find('[role="switch"]').trigger('click');expect(wrapper.emitted('toggle')).toHaveLength(1)
})
it('分页只允许存在的方向，有下一游标才允许前进',async()=>{
 await open({page:2,hasNext:true});await button('上一页').trigger('click');await button('下一页').trigger('click');expect(wrapper.emitted('previous')).toHaveLength(1);expect(wrapper.emitted('next')).toHaveLength(1);await wrapper.setProps({hasNext:false});expect(button('下一页').attributes('disabled')).toBeDefined()
})
it('读取失败遮住残留日志，不把失败当空结果；401/403边界由父层清除',async()=>{
 await open({rows:[row],error:new ApiError('日志读取失败',503),canClear:true});expect(wrapper.text()).toContain('日志读取失败');expect(wrapper.text()).not.toContain('温度任务');expect(wrapper.text()).not.toContain('暂无日志');expect(button('清空').attributes('disabled')).toBeDefined();await button('重新读取').trigger('click');expect(wrapper.emitted('refresh')).toHaveLength(1);await wrapper.setProps({forbidden:true});expect(wrapper.text()).toContain('当前账号没有此内容的读取权限');expect(wrapper.text()).not.toContain('日志读取失败')
})
it('清空先打开确认，取消与确定分开发出意图，忙时禁用取消/确定和其他写入',async()=>{
 await open({singleTask:true,enabled:true,canClear:true});await button('清空').trigger('click');expect(wrapper.emitted('openClear')).toHaveLength(1);expect(wrapper.emitted('confirmClear')).toBeUndefined();await wrapper.setProps({confirming:true});await flushPromises();expect(document.body.textContent).toContain('确认清空该任务的日志吗？');const buttons=()=>Array.from(document.body.querySelectorAll('button'));buttons().find(b=>b.textContent?.trim()==='取消')!.click();await flushPromises();expect(wrapper.emitted('cancelClear')).toHaveLength(1);buttons().find(b=>b.textContent?.trim()==='确定')!.click();await flushPromises();expect(wrapper.emitted('confirmClear')).toHaveLength(1);await wrapper.setProps({busy:true});await flushPromises();expect(buttons().find(b=>b.textContent?.trim()==='取消')!.disabled).toBe(true);expect(buttons().find(b=>b.textContent?.trim()==='确定')!.disabled).toBe(true);expect(button('刷新').attributes('disabled')).toBeDefined()
})
it('未知写结果锁定清空和开关，保留人工重新读取入口',async()=>{
 await open({singleTask:true,enabled:true,locked:true,writeError:'结果未知，请重新读取',canClear:true});expect(button('清空').attributes('disabled')).toBeDefined();await button('重新读取核对').trigger('click');expect(wrapper.emitted('reread')).toHaveLength(1);expect(wrapper.emitted('confirmClear')).toBeUndefined()
})
