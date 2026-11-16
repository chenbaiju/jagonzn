import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { session } from '../../src/core/session'
import { ApiError, invalidateIdentity,changeIdentity,setAccessToken } from '../../src/core/http'
import { webcrypto } from 'node:crypto'
import DevicePreprocessDetailPage from '../../src/features/rules/DevicePreprocessDetailPage.vue'
import {controlFixture,project,device,rule as preprocessRule} from './preprocess-control.fixture'
import RuleDetailPage from '../../src/features/rules/RuleDetailPage.vue'
const api = vi.hoisted(() => ({ getRule: vi.fn(), deleteRule: vi.fn(), original: vi.fn(), saveRuleInformation: vi.fn() }))
vi.mock('../../src/features/rules/api', () => api)
vi.mock('../../src/features/rules/message-rule-deletion',async()=>{const original=await vi.importActual<typeof import('../../src/features/rules/message-rule-deletion')>('../../src/features/rules/message-rule-deletion');return {...original,removeMessageRule:(intent:import('../../src/features/rules/message-rule-deletion').RuleDeletionIntent)=>api.deleteRule(intent.project,intent.rule,Number(intent.expectedVersion)),readMessageRuleDeletion:(intent:import('../../src/features/rules/message-rule-deletion').RuleDeletionIntent)=>api.original(intent)}})
const job = { id: '30000000-0000-4000-8000-000000000009', name: '规则', description: '原描述', version: 4, status: 'ACTIVE' }
const Button = defineComponent({ props: ['disabled', 'loading'], template: '<button :disabled="disabled || loading"><slot /></button>' })
const Dialog = defineComponent({ props: ['modelValue', 'title'], template: '<section v-if="modelValue" role="dialog"><h3>{{ title }}</h3><slot /><slot name="footer" /></section>' })
const Panel = defineComponent({ props: ['title'], template: '<div>{{ title }}<slot /></div>' })
const stubs = { ElButton: Button, ElDialog: Dialog, ElForm: Panel, ElFormItem: Panel, ElAlert: Panel, ElTabs: Panel, ElTabPane: true, ElSkeleton: true, ElEmpty: true, ElIcon: true, ElInput: true, ElSelect:true, ElOption:true, ElTag:true, ElPopconfirm:true, ElSwitch:true }
let wrapper: ReturnType<typeof mount>
function button(text: string) { const b=wrapper.findAll('button').find(item=>item.text()===text); if (!b) throw new Error('missing '+text+'; page: '+wrapper.text()); return b }
function permissions(manage=true) { session.user = { ...session.user!, accountId:project,currentProjectId:project, permissions: manage ? ['rule:read','rule:manage'] : ['rule:read'] } }
async function open(path='/rules/messages/30000000-0000-4000-8000-000000000009?tab=settings') {
  const router=createRouter({ history:createMemoryHistory(), routes:[{path:'/rules/messages',component:{template:'<p>规则目录</p>'}},{path:'/rules/messages/:id',component:RuleDetailPage}] }); await router.push(path); await router.isReady(); wrapper=mount(RouterView,{global:{plugins:[router],stubs}}); await flushPromises(); return router
}
function pending() { let resolve!:()=>void; const promise=new Promise<void>(done=>{resolve=done}); return { promise, resolve } }
beforeEach(()=>{changeIdentity();setAccessToken('removal-fixture');vi.clearAllMocks(); api.getRule.mockReset().mockResolvedValue(job); api.deleteRule.mockReset().mockResolvedValue(undefined);api.original.mockReset();vi.stubGlobal('crypto',webcrypto);session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}];permissions()})
afterEach(()=>{wrapper?.unmount();session.user=null;vi.unstubAllGlobals()})
it('设置页显示原站移除提示，取消不会发送请求',async()=>{
 await open(); expect(wrapper.text()).toContain('应用该规则的设备将不会再触发该规则。'); await button('移除规则').trigger('click'); expect(wrapper.find('[role="dialog"]').text()).toContain('提示'); expect(wrapper.text()).toContain('确认移除规则吗？'); await button('取消').trigger('click'); expect(wrapper.find('[role="dialog"]').exists()).toBe(false); expect(api.deleteRule).not.toHaveBeenCalled()
})
it('确定只发送已读版本CAS一次，明确成功直接返回目录且不回读已移除对象',async()=>{
 const wait=pending(); api.deleteRule.mockReturnValue(wait.promise); const router=await open(); await button('移除规则').trigger('click'); await button('确定').trigger('click'); expect(button('确定').attributes('disabled')).toBeDefined(); expect(button('取消').attributes('disabled')).toBeDefined(); await button('确定').trigger('click'); expect(api.deleteRule).toHaveBeenCalledTimes(1); expect(api.deleteRule).toHaveBeenCalledWith(project,job.id,4); wait.resolve(); await flushPromises(); expect(router.currentRoute.value.path).toBe('/rules/messages'); expect(wrapper.text()).toContain('规则目录'); expect(api.getRule).toHaveBeenCalledTimes(1)
})
it('原删除未知只按同键GET：404清私有但不解锁、不重复POST，原件成功才返回目录',async()=>{
 api.deleteRule.mockRejectedValueOnce(new ApiError('结果未知',0,undefined,undefined,true));const router=await open();await button('移除规则').trigger('click');await button('确定').trigger('click');await flushPromises();expect(wrapper.text()).not.toContain('原描述');expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
 api.original.mockRejectedValueOnce(new ApiError('未见原件',404));await button('读取原删除回执').trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe('/rules/messages/'+job.id);expect(wrapper.text()).toContain('原删除结果尚未确认');expect(wrapper.text()).not.toContain('原描述');expect(api.getRule).toHaveBeenCalledTimes(1);expect(api.deleteRule).toHaveBeenCalledTimes(1)
 const intent=api.original.mock.calls[0]![0];expect(intent).toMatchObject({project,rule:job.id,actor:project,expectedVersion:'4',key:expect.any(String)})
 api.original.mockResolvedValueOnce({});await button('读取原删除回执').trigger('click');await flushPromises();expect(api.original.mock.calls[1]![0]).toEqual(intent);expect(api.deleteRule).toHaveBeenCalledTimes(1);expect(api.getRule).toHaveBeenCalledTimes(1);expect(router.currentRoute.value.path).toBe('/rules/messages')
})
it('409锁定旧CAS，不自动重读或重放删除',async()=>{
 api.deleteRule.mockRejectedValueOnce(new ApiError('版本冲突',409)); await open(); await button('移除规则').trigger('click'); await button('确定').trigger('click'); await flushPromises(); expect(button('移除规则').attributes('disabled')).toBeDefined(); expect(wrapper.text()).toContain('版本冲突'); expect(api.getRule).toHaveBeenCalledTimes(1); expect(api.deleteRule).toHaveBeenCalledTimes(1)
})
it.each([401,403,404])('服务端写入%s清除对象和确认框，保留错误',async(status)=>{
 api.deleteRule.mockRejectedValueOnce(new ApiError('拒绝或不存在',status)); await open(); await button('移除规则').trigger('click'); await button('确定').trigger('click'); await flushPromises(); expect(wrapper.find('[role="dialog"]').exists()).toBe(false); expect(wrapper.text()).not.toContain('原描述'); expect(wrapper.text()).toContain('拒绝或不存在'); expect(api.deleteRule).toHaveBeenCalledTimes(1)
})
it('只读者无移除入口，确认后撤权也不能发送删除',async()=>{
 permissions(false); await open(); expect(wrapper.findAll('button').some(b=>b.text()==='移除规则')).toBe(false); permissions(); await flushPromises(); await button('移除规则').trigger('click'); permissions(false); await flushPromises(); expect(wrapper.find('[role="dialog"]').exists()).toBe(false); expect(api.deleteRule).not.toHaveBeenCalled()
})
it('写入期间撤权后迟到成功不导航，恢复权限仍须明确回读',async()=>{
 const wait=pending();api.deleteRule.mockReturnValue(wait.promise);const router=await open();await button('移除规则').trigger('click');await button('确定').trigger('click');permissions(false);await flushPromises();wait.resolve();await flushPromises();permissions();await flushPromises();expect(router.currentRoute.value.path).toBe('/rules/messages/30000000-0000-4000-8000-000000000009');expect(button('移除规则').attributes('disabled')).toBeDefined();expect(api.getRule).toHaveBeenCalledTimes(2)
})
it('切换规则或项目撤销旧确认，迟到成功不能覆盖新页面',async()=>{
 const wait=pending();api.deleteRule.mockReturnValue(wait.promise);const router=await open();await button('移除规则').trigger('click');await button('确定').trigger('click');api.getRule.mockResolvedValueOnce({...job,id:'next',name:'下一规则'});await router.push('/rules/messages/next?tab=settings');await flushPromises();wait.resolve();await flushPromises();expect(router.currentRoute.value.path).toBe('/rules/messages/next');expect(wrapper.text()).toContain('下一规则');expect(wrapper.find('[role="dialog"]').exists()).toBe(false);await button('移除规则').trigger('click');session.user={...session.user!,currentProjectId:'other'};await flushPromises();expect(wrapper.find('[role="dialog"]').exists()).toBe(false);expect(api.deleteRule).toHaveBeenCalledTimes(1)
})
it('身份失效撤销旧确认且不发送删除',async()=>{
 await open();await button('移除规则').trigger('click');invalidateIdentity();await flushPromises();expect(wrapper.find('[role="dialog"]').exists()).toBe(false);expect(wrapper.text()).not.toContain('原描述');expect(api.deleteRule).not.toHaveBeenCalled()
})
it('卸载后迟到成功不发起导航',async()=>{
 const wait=pending();api.deleteRule.mockReturnValue(wait.promise);const router=await open();await button('移除规则').trigger('click');await button('确定').trigger('click');const navigate=vi.spyOn(router,'push');wrapper.unmount();wait.resolve();await flushPromises();expect(navigate).not.toHaveBeenCalled();expect(api.deleteRule).toHaveBeenCalledTimes(1)
})
it.each([0,-1,1.5,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1,undefined])('无效版本%s不能构造删除请求',async(version)=>{
 api.getRule.mockResolvedValue({...job,version});await open();expect(wrapper.findAll('button').some(item=>item.text()==='移除规则')).toBe(false);expect(wrapper.find('[role="dialog"]').exists()).toBe(false);expect(wrapper.text()).toMatch(/规则返回身份、版本或状态不完整|安全整数范围/);expect(api.deleteRule).not.toHaveBeenCalled()
})
it('不匹配的规则对象不能构造移除请求',async()=>{
 api.getRule.mockResolvedValue({...job,id:'other',targetType:'FUTURE_TARGET'});const router=await open();expect(wrapper.findAll('button').some(item=>item.text()==='移除规则')).toBe(false);expect(wrapper.find('[role="dialog"]').exists()).toBe(false);expect(wrapper.text()).toContain('规则返回身份、版本或状态不完整');expect(api.deleteRule).not.toHaveBeenCalled();expect(router.currentRoute.value.path).toBe('/rules/messages/30000000-0000-4000-8000-000000000009')
})

it('设备前处理删除未知只核原键，404继续UNKNOWN，403清意图封写并允许安全离开',async()=>{
 const fixture=controlFixture();vi.stubGlobal('fetch',vi.fn(fixture.fetcher));const router=createRouter({history:createMemoryHistory(),routes:[{path:'/rules/messages',component:{template:'<p>规则目录</p>'}},{path:'/preprocess/:id',component:DevicePreprocessDetailPage}]});await router.push('/preprocess/'+preprocessRule+'?tab=settings&source=device&deviceId='+device);await router.isReady();wrapper=mount(RouterView,{global:{plugins:[router],stubs}});await flushPromises();
 api.deleteRule.mockRejectedValueOnce(new ApiError('未知',0,undefined,undefined,true));await button('移除规则').trigger('click');await button('确定').trigger('click');await flushPromises();expect(api.deleteRule).toHaveBeenCalledWith(project,preprocessRule,1);const ordinaryReads=fixture.state.definitionReads;expect(wrapper.text()).not.toContain('完整描述');expect(wrapper.text()).not.toContain('module.exports')
 api.original.mockRejectedValueOnce(new ApiError('未见原件',404));await button('读取原删除回执').trigger('click');await flushPromises();expect(wrapper.text()).toContain('原删除结果尚未确认');expect(fixture.state.definitionReads).toBe(ordinaryReads);expect(api.deleteRule).toHaveBeenCalledTimes(1);const intent=api.original.mock.calls[0]![0];expect(intent).toMatchObject({project,rule:preprocessRule,actor:project,expectedVersion:'1'});
 api.original.mockRejectedValueOnce(new ApiError('管理已撤权',403));await button('读取原删除回执').trigger('click');await flushPromises();expect(api.original.mock.calls[1]![0]).toEqual(intent);expect(wrapper.findAll('button').some(item=>item.text()==='读取原删除回执')).toBe(false);expect(wrapper.text()).not.toContain('完整规则');expect(api.deleteRule).toHaveBeenCalledTimes(1);await button('安全离开').trigger('click');await flushPromises();expect(router.currentRoute.value.path).toBe('/devices/'+device)
})
