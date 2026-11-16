import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'
import { session } from '../../src/core/session'
import { ApiError } from '../../src/core/http'
import TaskRelatedDevicesPanel from '../../src/features/rules/TaskRelatedDevicesPanel.vue'
import type { RelatedDevicesTransport } from '../../src/features/rules/task-related-devices-state'
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
const a={key:'a',label:'设备甲',href:'/devices/a',scheduled:true,writeToken:3},b={key:'b',label:'设备乙',scheduled:false,writeToken:2}
let wrapper:ReturnType<typeof mount>,transport:RelatedDevicesTransport
let context=vi.fn<()=>Promise<void>>()
function pending<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return{promise,resolve}}
function button(label:string){const node=wrapper.findAll('button').find(n=>n.text()===label||n.attributes('aria-label')===label);if(!node)throw new Error('missing '+label);return node}
async function open(props:Record<string,unknown>={}){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<p />'}}]});await router.push('/tasks/jobs/j?tab=devices');await router.isReady();wrapper=mount(TaskRelatedDevicesPanel,{props:{jobId:'j',definitionVersion:9,enabled:true,transport,refreshContext:context,...props},attachTo:document.body,global:{plugins:[ElementPlus,router]}});await flushPromises()}
beforeEach(()=>{session.user={currentProjectId:'p',permissions:['task:read','task:manage','task:run','device:read']};context=vi.fn<()=>Promise<void>>().mockResolvedValue(undefined);transport={readRows:vi.fn().mockResolvedValue({rows:[a,b],definitionToken:9}),changeSchedule:vi.fn().mockResolvedValue({key:'a',scheduled:false,writeToken:4,definitionToken:9}),runRows:vi.fn().mockResolvedValue(undefined)}})
afterEach(()=>{wrapper?.unmount();document.body.innerHTML='';session.user=null})
it('同步向父页报告在途和未知锁，另一入口在渲染前就能阻止重复运行',async()=>{
 const wait=pending<void>();vi.mocked(transport.runRows).mockReturnValueOnce(wait.promise);let busy=false,locked=false;await open({onBusy:(value:boolean)=>{busy=value},onLocked:(value:boolean)=>{locked=value}});button('运行 设备甲').element.click();expect(busy).toBe(true);expect(locked).toBe(false);expect(transport.runRows).toHaveBeenCalledExactlyOnceWith('p','j',9,['a']);wait.resolve(undefined);await flushPromises();expect(busy).toBe(false);expect(document.body.querySelector('.el-message--success')?.textContent).toContain('执行已受理')
})
it('未知运行锁住同对象所有运行和偏好入口，切页签返回仍锁，人工核对才恢复',async()=>{
 vi.mocked(transport.runRows).mockRejectedValueOnce(new ApiError('未知',0,undefined,undefined,true));await open();await button('运行 设备乙').trigger('click');await flushPromises();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);expect(button('运行 设备甲').attributes('disabled')).toBeDefined();await wrapper.setProps({inactive:true});await wrapper.setProps({inactive:false});await flushPromises();expect(button('运行 设备甲').attributes('disabled')).toBeDefined();await button('重新读取核对').trigger('click');await flushPromises();expect(context).toHaveBeenCalledTimes(1);expect(button('运行 设备甲').attributes('disabled')).toBeUndefined();expect(transport.runRows).toHaveBeenCalledTimes(1)
})
it('普通成员读实际开关，运行者无管理权仍能对定时关闭设备手动运行',async()=>{
 session.user={...session.user!,permissions:['task:read','task:run']};await open();expect(wrapper.find('[aria-label="允许 设备甲 定时运行"]').attributes('aria-disabled')).toBe('true');expect(wrapper.find('a').exists()).toBe(false);await button('运行 设备乙').trigger('click');await flushPromises();expect(transport.runRows).toHaveBeenCalledExactlyOnceWith('p','j',9,['b']);expect(transport.changeSchedule).not.toHaveBeenCalled()
})
it('失去读取菜单权限时清除行并通知父页，失败不显示为空页',async()=>{
 await open();vi.mocked(transport.readRows).mockRejectedValueOnce(new ApiError('设备已不可见',404));await button('刷新').trigger('click');await flushPromises();expect(wrapper.emitted('denied')?.[0]?.[0]).toBeInstanceOf(ApiError);expect(wrapper.text()).not.toContain('设备甲');expect(wrapper.text()).not.toContain('暂无数据');expect(button('运行选中设备（0）').attributes('disabled')).toBeDefined()
})
it('设备菜单撤权只去链接，任务成员仍显示受权名称和偏好',async()=>{
 await open();expect(wrapper.find('a[href="/devices/a"]').exists()).toBe(true);session.user={...session.user!,permissions:['task:read','task:manage','task:run']};await flushPromises();expect(wrapper.find('a').exists()).toBe(false);expect(wrapper.text()).toContain('设备甲');expect(transport.readRows).toHaveBeenCalledTimes(1)
})
it('换任务后迟到已受理不恢复旧提示或重复读取旧页',async()=>{
 const wait=pending<void>();vi.mocked(transport.runRows).mockReturnValueOnce(wait.promise);await open();await button('运行 设备甲').trigger('click');await wrapper.setProps({jobId:'other'});await flushPromises();const calls=vi.mocked(transport.readRows).mock.calls.length;wait.resolve(undefined);await flushPromises();expect(wrapper.text()).not.toContain('执行已受理');expect(transport.readRows).toHaveBeenCalledTimes(calls);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false])
})
