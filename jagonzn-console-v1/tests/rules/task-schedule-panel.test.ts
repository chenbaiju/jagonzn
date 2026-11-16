import { afterEach,beforeEach,expect,it,vi } from 'vitest'
import { mount,flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { session } from '../../src/core/session'
import { ApiError } from '../../src/core/http'
import TaskSchedulePanel from '../../src/features/rules/TaskSchedulePanel.vue'
import type { TaskScheduleTransport } from '../../src/features/rules/task-schedule-state'
vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}})
let wrapper:ReturnType<typeof mount>,transport:TaskScheduleTransport,context=vi.fn<()=>Promise<void>>()
const manual={token:3,kind:'MANUAL' as const,live:true,consumed:false,seed:{kind:'MANUAL' as const}}
function button(label:string){const n=Array.from(document.body.querySelectorAll('button')).find(n=>n.textContent?.trim()===label||n.getAttribute('aria-label')===label);if(!n)throw Error('missing '+label);return n}
async function open(extra:Record<string,unknown>={}){wrapper=mount(TaskSchedulePanel,{props:{jobId:'j',projectZone:'Asia/Shanghai',transport,refreshContext:context,...extra},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises()}
beforeEach(()=>{session.user={currentProjectId:'p',permissions:['task:read','task:manage']};context=vi.fn<()=>Promise<void>>().mockResolvedValue(undefined);transport={readPlan:vi.fn().mockResolvedValue(manual),replacePlan:vi.fn().mockResolvedValue(manual)}})
afterEach(()=>{wrapper?.unmount();document.body.innerHTML='';session.user=null})
it('待重设的一次计划在定时设置显示提示',async()=>{vi.mocked(transport.readPlan).mockResolvedValueOnce({token:3,kind:'ONCE',live:false,consumed:false,requiresReconfigure:true,seed:{kind:'ONCE',onceAt:'2026-10-25T00:00:00Z',zoneKind:'FOLLOW_PROJECT'}});await open();expect(wrapper.text()).toContain('请重新设置运行时间后启用')})
it('原站定时摘要只读真实关闭状态，成员没有写入口，未映射不冒每日',async()=>{session.user={...session.user!,permissions:['task:read']};await open();expect(wrapper.text()).toContain('任务定时设置');expect(wrapper.text()).toContain('关闭定时');expect(wrapper.find('[aria-label="编辑定时设置"]').exists()).toBe(false);expect(transport.replacePlan).not.toHaveBeenCalled()})
it('写在途同步告知父页，匹配同值实际回读成功后关闭弹窗',async()=>{let done!:(v:typeof manual)=>void;vi.mocked(transport.replacePlan).mockReturnValueOnce(new Promise(resolve=>{done=resolve}));let busy=false;await open({onBusy:(value:boolean)=>{busy=value}});button('编辑定时设置').click();await flushPromises();button('完成').click();expect(busy).toBe(true);done(manual);await flushPromises();expect(busy).toBe(false);expect(wrapper.text()).toContain('定时设置已保存');expect(context).toHaveBeenCalledTimes(1);expect(transport.readPlan).toHaveBeenCalledTimes(2)})
it('未知写锁跨页签及自动读保留，人工先父定义再计划恢复',async()=>{vi.mocked(transport.replacePlan).mockRejectedValueOnce(new ApiError('未知',0,undefined,undefined,true));await open();button('编辑定时设置').click();await flushPromises();button('完成').click();await flushPromises();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);await wrapper.setProps({inactive:true});await wrapper.setProps({inactive:false});await flushPromises();expect(button('编辑定时设置').disabled).toBe(true);button('重新读取核对').click();await flushPromises();expect(button('编辑定时设置').disabled).toBe(false);expect(transport.replacePlan).toHaveBeenCalledTimes(1);expect(context).toHaveBeenCalledTimes(1)})
it('明确拒绝触发父清理信号，不留默认关闭摘要或编辑意图',async()=>{vi.mocked(transport.replacePlan).mockRejectedValueOnce(new ApiError('不可读取',404));await open();button('编辑定时设置').click();await flushPromises();button('完成').click();await flushPromises();expect(wrapper.emitted('denied')?.[0]?.[0]).toBeInstanceOf(ApiError);expect(wrapper.text()).not.toContain('关闭定时');expect(document.body.textContent).not.toContain('设置定时完成')})
