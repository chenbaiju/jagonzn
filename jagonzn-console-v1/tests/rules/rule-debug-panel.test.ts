import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory } from 'vue-router'
import RuleDebugLogPanel from '../../src/features/rules/RuleDebugLogPanel.vue'
import type { DebugLogTransport } from '../../src/features/rules/rule-debug-state'
import { session } from '../../src/core/session'
import { ApiError } from '../../src/core/http'
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
let wrapper:ReturnType<typeof mount>,transport:DebugLogTransport
const row={key:'log',deviceLabel:'已有历史设备',ruleLabel:'规则',typeLabel:'—',operationLabel:'下发命令',resultLabel:'已提交',failed:false}
beforeEach(()=>{session.user={currentProjectId:'p',permissions:['rule:manage']};transport={readRows:vi.fn().mockResolvedValue({rows:[row],clearToken:7}),readSwitch:vi.fn().mockResolvedValue({checked:false,writeToken:3}),changeSwitch:vi.fn().mockResolvedValue({checked:true,writeToken:4}),eraseRule:vi.fn().mockResolvedValue({checked:false,writeToken:4}),eraseProject:vi.fn().mockResolvedValue(8)}})
afterEach(()=>{wrapper?.unmount();document.body.innerHTML='';session.user=null})
async function open(ruleId:string|undefined='r'){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/:pathMatch(.*)*',component:{template:'<p />'}}]});await router.push('/rules/executions');await router.isReady();wrapper=mount(RuleDebugLogPanel,{props:{ruleId,transport},attachTo:document.body,global:{plugins:[ElementPlus,router]}});await flushPromises()}
function button(label:string){const node=Array.from(document.body.querySelectorAll('button')).find(x=>x.textContent?.trim()===label);if(!node)throw Error('missing '+label);return node}
it('真实容器先确认再执行捕获CAS，未知结果撤框并锁住，再成功人工读取才能重新操作',async()=>{
 vi.mocked(transport.eraseRule).mockRejectedValueOnce(new ApiError('结果未知',0,undefined,undefined,true));await open();expect(wrapper.text()).toContain('已有历史设备');button('清空').click();await flushPromises();expect(transport.eraseRule).not.toHaveBeenCalled();button('取消').click();await flushPromises();expect(transport.eraseRule).not.toHaveBeenCalled();button('清空').click();await flushPromises();button('确定').click();await flushPromises();expect(transport.eraseRule).toHaveBeenCalledExactlyOnceWith('p','r',3);expect(button('清空').disabled).toBe(true);expect(wrapper.find('[role="switch"]').attributes('aria-disabled')).toBe('true');button('重新读取核对').click();await flushPromises();expect(button('清空').disabled).toBe(false);expect(transport.eraseRule).toHaveBeenCalledTimes(1)
})
it('读取到关闭状态仍显示历史，真实开关只修改调试许可并保留行，撤权立刻清数据',async()=>{
 await open();expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false');expect(wrapper.text()).toContain('已有历史设备');await wrapper.find('[role="switch"]').trigger('click');await flushPromises();expect(transport.changeSwitch).toHaveBeenCalledExactlyOnceWith('p','r',3,true);expect(wrapper.text()).toContain('已有历史设备');session.user={...session.user!,permissions:['rule:read']};await flushPromises();expect(wrapper.text()).not.toContain('已有历史设备');expect(wrapper.find('[role="switch"]').exists()).toBe(false);expect(button('清空').disabled).toBe(true)
})
it('控制读取失败不会出现关闭开关，独立重新读取成功后才显示实际状态',async()=>{
 vi.mocked(transport.readSwitch).mockRejectedValueOnce(new ApiError('控制读取失败',503));await open();expect(wrapper.find('[role="switch"]').exists()).toBe(false);expect(button('清空').disabled).toBe(true);button('重新读取').click();await flushPromises();expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false');expect(transport.changeSwitch).not.toHaveBeenCalled()
})
