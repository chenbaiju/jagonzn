import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { session } from '../../src/core/session'
import { ApiError, invalidateIdentity } from '../../src/core/http'
import { ruleRoutes } from '../../src/features/rules/routes'
const api = vi.hoisted(() => ({ getTask: vi.fn(), deleteTask: vi.fn(), saveTaskInformation: vi.fn() }))
vi.mock('../../src/features/rules/api', () => api)
const job = { id: 'j', name: '任务', description: '原描述', version: 4, status: 'ACTIVE', targetType: 'ALL_DEVICES' }
const Button = defineComponent({ props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' })
const Dialog = defineComponent({ props: ['modelValue', 'title'], template: '<section v-if="modelValue" role="dialog"><h3>{{ title }}</h3><slot /><slot name="footer" /></section>' })
const Panel = defineComponent({ props: ['title'], template: '<div>{{ title }}<slot /></div>' })
const stubs = { ElButton: Button, ElDialog: Dialog, ElForm: Panel, ElFormItem: Panel, ElAlert: Panel, ElTabs: Panel, ElTabPane: true, ElSkeleton: true, ElEmpty: true, ElIcon: true, ElInput: true }
let wrapper: ReturnType<typeof mount>
function button(text: string) { const b=wrapper.findAll('button').find(item=>item.text()===text); if (!b) throw new Error('missing '+text); return b }
function permissions(manage=true) { session.user = { ...session.user!, currentProjectId:'p', permissions: manage ? ['task:read','task:manage'] : ['task:read'] } }
async function open(path='/tasks/jobs/j?tab=settings') {
  const router=createRouter({ history:createMemoryHistory(), routes:[{path:'/tasks/jobs',component:{template:'<p>任务目录</p>'}},...ruleRoutes] }); await router.push(path); await router.isReady(); wrapper=mount(RouterView,{global:{plugins:[router],stubs}}); await flushPromises(); return router
}
function pending() { let resolve!:()=>void; const promise=new Promise<void>(done=>{resolve=done}); return { promise, resolve } }
beforeEach(()=>{vi.clearAllMocks(); api.getTask.mockReset().mockResolvedValue(job); api.deleteTask.mockReset().mockResolvedValue(undefined); permissions()})
afterEach(()=>{wrapper?.unmount();session.user=null})
it('设置页显示原站移除提示，取消不会发送请求',async()=>{
 await open(); expect(wrapper.text()).toContain('任务移除后无法恢复。'); await button('移除任务').trigger('click'); expect(wrapper.find('[role="dialog"]').text()).toContain('提示'); expect(wrapper.text()).toContain('确认移除任务吗？'); await button('取消').trigger('click'); expect(wrapper.find('[role="dialog"]').exists()).toBe(false); expect(api.deleteTask).not.toHaveBeenCalled()
})
it('确定只发送已读版本CAS一次，明确成功直接返回目录且不回读已移除对象',async()=>{
 const wait=pending(); api.deleteTask.mockReturnValue(wait.promise); const router=await open(); await button('移除任务').trigger('click'); await button('确定').trigger('click'); expect(button('确定').attributes('disabled')).toBeDefined(); expect(button('取消').attributes('disabled')).toBeDefined(); await button('确定').trigger('click'); expect(api.deleteTask).toHaveBeenCalledTimes(1); expect(api.deleteTask).toHaveBeenCalledWith('p','j',4); wait.resolve(); await flushPromises(); expect(router.currentRoute.value.path).toBe('/tasks/jobs'); expect(wrapper.text()).toContain('任务目录'); expect(api.getTask).toHaveBeenCalledTimes(1)
})
it('未知结果不重放，失败回读保持锁，成功回读后用新版本再次人工确认',async()=>{
 api.deleteTask.mockRejectedValueOnce(new ApiError('结果未知',0,undefined,undefined,true)); await open(); await button('移除任务').trigger('click'); await button('确定').trigger('click'); await flushPromises(); expect(button('确定').attributes('disabled')).toBeDefined(); await button('取消').trigger('click'); expect(button('移除任务').attributes('disabled')).toBeDefined(); api.getTask.mockRejectedValueOnce(new ApiError('读取失败',503)); await button('重新读取核对').trigger('click'); await flushPromises(); expect(button('编辑').attributes('disabled')).toBeDefined(); expect(wrapper.findAll('button').some(b=>b.text()==='移除任务')).toBe(false); expect(api.deleteTask).toHaveBeenCalledTimes(1); api.getTask.mockResolvedValueOnce({...job,version:5}); await button('重新读取核对').trigger('click'); await flushPromises(); await button('移除任务').trigger('click'); await button('确定').trigger('click'); await flushPromises(); expect(api.deleteTask).toHaveBeenLastCalledWith('p','j',5); expect(api.deleteTask).toHaveBeenCalledTimes(2)
})
it('未知后的404不会冒充已成功移除，也不会自动返回目录',async()=>{
 api.deleteTask.mockRejectedValueOnce(new ApiError('结果未知',0,undefined,undefined,true)); const router=await open(); await button('移除任务').trigger('click'); await button('确定').trigger('click'); await flushPromises(); api.getTask.mockRejectedValueOnce(new ApiError('未找到',404)); await button('重新读取核对').trigger('click'); await flushPromises(); expect(router.currentRoute.value.path).toBe('/tasks/jobs/j'); expect(wrapper.text()).toContain('未找到'); expect(wrapper.text()).not.toContain('原描述'); expect(api.deleteTask).toHaveBeenCalledTimes(1)
})
it('409锁定旧CAS，不自动重读或重放删除',async()=>{
 api.deleteTask.mockRejectedValueOnce(new ApiError('版本冲突',409)); await open(); await button('移除任务').trigger('click'); await button('确定').trigger('click'); await flushPromises(); expect(button('确定').attributes('disabled')).toBeDefined(); expect(wrapper.text()).toContain('版本冲突'); expect(api.getTask).toHaveBeenCalledTimes(1); expect(api.deleteTask).toHaveBeenCalledTimes(1)
})
it.each([401,403,404])('服务端写入%s清除对象和确认框，保留错误',async(status)=>{
 api.deleteTask.mockRejectedValueOnce(new ApiError('拒绝或不存在',status)); await open(); await button('移除任务').trigger('click'); await button('确定').trigger('click'); await flushPromises(); expect(wrapper.find('[role="dialog"]').exists()).toBe(false); expect(wrapper.text()).not.toContain('原描述'); expect(wrapper.text()).toContain('拒绝或不存在'); expect(api.deleteTask).toHaveBeenCalledTimes(1)
})
it('只读者无移除入口，确认后撤权也不能发送删除',async()=>{
 permissions(false); await open(); expect(wrapper.findAll('button').some(b=>b.text()==='移除任务')).toBe(false); permissions(); await flushPromises(); await button('移除任务').trigger('click'); permissions(false); await flushPromises(); expect(wrapper.find('[role="dialog"]').exists()).toBe(false); expect(api.deleteTask).not.toHaveBeenCalled()
})
it('写入期间撤权后迟到成功不导航，恢复权限仍须明确回读',async()=>{
 const wait=pending();api.deleteTask.mockReturnValue(wait.promise);const router=await open();await button('移除任务').trigger('click');await button('确定').trigger('click');permissions(false);await flushPromises();wait.resolve();await flushPromises();permissions();await flushPromises();expect(router.currentRoute.value.path).toBe('/tasks/jobs/j');expect(button('移除任务').attributes('disabled')).toBeDefined();expect(api.getTask).toHaveBeenCalledTimes(1)
})
it('在途不允许切任务，项目更替释放旧范围后迟到成功不能覆盖新页面',async()=>{
 const wait=pending();api.deleteTask.mockReturnValue(wait.promise);const router=await open();await button('移除任务').trigger('click');await button('确定').trigger('click')
 expect(await router.push('/tasks/jobs/next?tab=settings')).toBeTruthy();expect(router.currentRoute.value.path).toBe('/tasks/jobs/j')
 session.user={...session.user!,currentProjectId:'other'};await flushPromises();expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
 api.getTask.mockResolvedValueOnce({...job,id:'next',name:'下一任务'});expect(await router.push('/tasks/jobs/next?tab=settings')).toBeUndefined();await flushPromises();wait.resolve();await flushPromises()
 expect(router.currentRoute.value.path).toBe('/tasks/jobs/next');expect(wrapper.text()).toContain('下一任务');expect(wrapper.find('[role="dialog"]').exists()).toBe(false);expect(api.deleteTask).toHaveBeenCalledTimes(1)
})
it('身份失效撤销旧确认且不发送删除',async()=>{
 await open();await button('移除任务').trigger('click');invalidateIdentity();await flushPromises();expect(wrapper.find('[role="dialog"]').exists()).toBe(false);expect(wrapper.text()).not.toContain('原描述');expect(api.deleteTask).not.toHaveBeenCalled()
})
it('卸载后迟到成功不发起导航',async()=>{
 const wait=pending();api.deleteTask.mockReturnValue(wait.promise);const router=await open();await button('移除任务').trigger('click');await button('确定').trigger('click');const navigate=vi.spyOn(router,'push');wrapper.unmount();wait.resolve();await flushPromises();expect(navigate).not.toHaveBeenCalled();expect(api.deleteTask).toHaveBeenCalledTimes(1)
})
it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER+1,undefined])('无效版本%s不能构造删除请求',async(version)=>{
 api.getTask.mockResolvedValue({...job,version});await open();await button('移除任务').trigger('click');expect(wrapper.find('[role="dialog"]').exists()).toBe(false);expect(wrapper.text()).toContain('请重新读取任务');expect(api.deleteTask).not.toHaveBeenCalled()
})
it('不匹配的父对象整页拒绝，不展示其名称或移除入口',async()=>{
 api.getTask.mockResolvedValue({...job,id:'other',name:'其它任务秘密'});await open();expect(wrapper.text()).toContain('任务返回身份不完整');expect(wrapper.text()).not.toContain('其它任务秘密');expect(wrapper.findAll('button').some(node=>node.text()==='移除任务')).toBe(false);expect(wrapper.find('[role="dialog"]').exists()).toBe(false);expect(api.deleteTask).not.toHaveBeenCalled()
})
it('当前对象未知目标类型不冒充所有设备',async()=>{
 api.getTask.mockResolvedValue({...job,targetType:'FUTURE_TARGET'});await open('/tasks/jobs/j?tab=task');expect(wrapper.text()).not.toContain('所有设备');expect(wrapper.text()).toContain('—');expect(api.deleteTask).not.toHaveBeenCalled()
})
it.each([['DEVICE_TYPE','设备类型'],['EXPLICIT_DEVICES','指定设备'],['DEVICE_GROUPS','多个设备组']])('明确展示%s目标类型',async(targetType,label)=>{
 api.getTask.mockResolvedValue({...job,targetType});await open('/tasks/jobs/j');expect(wrapper.text()).toContain(label);expect(wrapper.text()).not.toContain('所有设备')
})
