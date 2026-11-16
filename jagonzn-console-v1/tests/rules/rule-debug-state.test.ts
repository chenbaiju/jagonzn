import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { session } from '../../src/core/session'
import { ApiError, invalidateIdentity } from '../../src/core/http'
import { useRuleDebugLogState, type DebugLogTransport } from '../../src/features/rules/rule-debug-state'

const row={key:'log',deviceLabel:'设备',ruleLabel:'规则',typeLabel:'—',operationLabel:'属性下发',resultLabel:'已提交',failed:false}
const initialPage={rows:[row],clearToken:7}
let transport:DebugLogTransport, state:ReturnType<typeof useRuleDebugLogState>, wrapper:ReturnType<typeof mount>
let rule=ref<string|undefined>('r')
function pending<T>(){let resolve!:(value:T)=>void;let reject!:(cause:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function permissions(manage=true,project='p'){session.user={...session.user!,currentProjectId:project,permissions:manage?['rule:manage']:['rule:read']}}
async function open(single=true){rule=ref(single?'r':undefined);wrapper=mount(defineComponent({setup(){state=useRuleDebugLogState(rule,transport);return {}},template:'<p />'}));await flushPromises()}
beforeEach(()=>{
 permissions();transport={readRows:vi.fn().mockResolvedValue(initialPage),readSwitch:vi.fn().mockResolvedValue({checked:false,writeToken:3}),changeSwitch:vi.fn().mockResolvedValue({checked:true,writeToken:4}),eraseRule:vi.fn().mockResolvedValue({checked:false,writeToken:4}),eraseProject:vi.fn().mockResolvedValue(8)}
})
afterEach(()=>{wrapper?.unmount();session.user=null})
it('详情只读两种投影，控制状态未成功前不能发写入',async()=>{
 const wait=pending<{checked:boolean;writeToken:number}>();vi.mocked(transport.readSwitch).mockReturnValue(wait.promise);await open();expect(state.ready.value).toBe(false);state.openClear();await state.toggle(true);expect(state.intent.value).toBeUndefined();expect(transport.eraseRule).not.toHaveBeenCalled();expect(transport.changeSwitch).not.toHaveBeenCalled();wait.resolve({checked:false,writeToken:3});await flushPromises();expect(state.ready.value).toBe(true);expect(transport.readRows).toHaveBeenCalledWith('p','r',undefined,expect.any(AbortSignal))
})
it('项目只读取日志，清空使用已读项目token，不读规则开关',async()=>{
 await open(false);expect(transport.readSwitch).not.toHaveBeenCalled();state.openClear();expect(state.intent.value?.token).toBe(7);await state.confirmClear();expect(transport.eraseProject).toHaveBeenCalledExactlyOnceWith('p',7);expect(transport.eraseRule).not.toHaveBeenCalled();expect(transport.readRows).toHaveBeenCalledTimes(2)
})
it('单规则清空固定打开时token，明确成功才清页和重新读，取消不发请求',async()=>{
 await open();state.openClear();state.cancelClear();await state.confirmClear();expect(transport.eraseRule).not.toHaveBeenCalled();state.openClear();state.control.data.value={checked:true,writeToken:9};await state.confirmClear();expect(transport.eraseRule).toHaveBeenCalledExactlyOnceWith('p','r',3);expect(state.control.data.value).toEqual({checked:false,writeToken:4});expect(state.cursors.value).toEqual([undefined]);expect(state.intent.value).toBeUndefined()
})
it('写入在途不能重复确定、关闭、切换、翻页或刷新',async()=>{
 const wait=pending<{checked:boolean;writeToken:number}>();vi.mocked(transport.eraseRule).mockReturnValue(wait.promise);await open();state.openClear();const first=state.confirmClear();await flushPromises();expect(state.busy.value).toBe(true);state.cancelClear();expect(state.intent.value).toBeDefined();await state.confirmClear();await state.toggle(true);await state.next();await state.reload();expect(transport.eraseRule).toHaveBeenCalledTimes(1);expect(transport.changeSwitch).not.toHaveBeenCalled();expect(transport.readRows).toHaveBeenCalledTimes(1);wait.resolve({checked:false,writeToken:4});await first
})
it('调试开关沿独立token更新，关闭不抹已有历史或重载/补跑',async()=>{
 await open();await state.toggle(true);expect(transport.changeSwitch).toHaveBeenCalledExactlyOnceWith('p','r',3,true);expect(state.page.data.value?.rows).toEqual([row]);vi.mocked(transport.changeSwitch).mockResolvedValueOnce({checked:false,writeToken:5});await state.toggle(false);expect(transport.changeSwitch).toHaveBeenLastCalledWith('p','r',4,false);expect(state.page.data.value?.rows).toEqual([row]);expect(transport.readRows).toHaveBeenCalledTimes(1);expect(transport.eraseRule).not.toHaveBeenCalled()
})
it('未知结果不重放，失败回读不解锁，成功读取两种投影后才能重新确认',async()=>{
 vi.mocked(transport.eraseRule).mockRejectedValueOnce(new ApiError('未知',0,undefined,undefined,true));await open();state.openClear();await state.confirmClear();expect(state.locked.value).toBe(true);expect(state.intent.value).toBeUndefined();state.openClear();await state.toggle(true);expect(transport.eraseRule).toHaveBeenCalledTimes(1);vi.mocked(transport.readSwitch).mockRejectedValueOnce(new ApiError('读取失败',503));await state.reload();expect(state.locked.value).toBe(true);vi.mocked(transport.readSwitch).mockResolvedValueOnce({checked:true,writeToken:8});await state.reload();expect(state.locked.value).toBe(false);vi.mocked(transport.eraseRule).mockResolvedValueOnce({checked:true,writeToken:9});state.openClear();await state.confirmClear();expect(transport.eraseRule).toHaveBeenLastCalledWith('p','r',8);expect(state.locked.value).toBe(false);expect(state.control.data.value).toEqual({checked:true,writeToken:9})
})
it.each([409,503])('写入%s锁住旧意图，不自动回读或重提',async(status)=>{
 vi.mocked(transport.changeSwitch).mockRejectedValueOnce(new ApiError('拒绝或未知',status));await open();await state.toggle(true);expect(state.locked.value).toBe(true);await state.toggle(true);expect(transport.changeSwitch).toHaveBeenCalledTimes(1);expect(transport.readRows).toHaveBeenCalledTimes(1)
})
it('成功HTTP后的坏控制投影也作为未知结果锁定，不猜开关状态',async()=>{
 vi.mocked(transport.changeSwitch).mockResolvedValueOnce({checked:true,writeToken:Number.MAX_SAFE_INTEGER});await open();await state.toggle(true);expect(state.locked.value).toBe(true);expect(state.control.data.value?.checked).toBe(false);expect(state.writeError.value).toContain('版本')
})
it('项目清空的坏或未推进token不能伪装成功，也不重读后覆盖原意图',async()=>{
 vi.mocked(transport.eraseProject).mockResolvedValueOnce(7);await open(false);state.openClear();await state.confirmClear();expect(state.locked.value).toBe(true);expect(state.writeError.value).toContain('清空响应不匹配');expect(transport.readRows).toHaveBeenCalledTimes(1)
})
it('开关写返回相反值或未推进token时保持核对锁',async()=>{
 vi.mocked(transport.changeSwitch).mockResolvedValueOnce({checked:false,writeToken:4});await open();await state.toggle(true);expect(state.locked.value).toBe(true);expect(state.control.data.value).toEqual({checked:false,writeToken:3});expect(state.writeError.value).toContain('响应不匹配')
})
it.each([401,403,404])('写入%s清除日志、开关和确认意图，不认定清空成功',async(status)=>{
 vi.mocked(transport.eraseRule).mockRejectedValueOnce(new ApiError('拒绝或不存在',status));await open();state.openClear();await state.confirmClear();await flushPromises();expect(state.page.data.value).toBeUndefined();expect(state.control.data.value).toBeUndefined();expect(state.intent.value).toBeUndefined();expect(state.page.error.value).toBeInstanceOf(ApiError);expect(transport.readRows).toHaveBeenCalledTimes(1)
})
it('控制读取被拒绝也清除旧日志，失败不展示为off',async()=>{
 await open();vi.mocked(transport.readSwitch).mockRejectedValueOnce(new ApiError('控制失权',403));await state.retryControl();await flushPromises();expect(state.page.data.value).toBeUndefined();expect(state.control.data.value).toBeUndefined();expect(state.control.error.value).toBeInstanceOf(ApiError);expect(state.ready.value).toBe(false)
})
it('撤权移除确认；在途写恢复权限后的自动GET不解锁，必须人工核对',async()=>{
 const wait=pending<{checked:boolean;writeToken:number}>();vi.mocked(transport.eraseRule).mockReturnValue(wait.promise);await open();state.openClear();const written=state.confirmClear();await flushPromises();permissions(false);await flushPromises();expect(state.intent.value).toBeUndefined();expect(state.page.data.value).toBeUndefined();wait.resolve({checked:false,writeToken:4});await written;permissions();await flushPromises();expect(state.page.data.value).toBeDefined();expect(state.locked.value).toBe(true);state.openClear();expect(state.intent.value).toBeUndefined();await state.reload();expect(state.locked.value).toBe(false)
})
it('更换项目或规则使迟到写入无效，不能覆盖新读或触发旧页刷新',async()=>{
 const wait=pending<{checked:boolean;writeToken:number}>();vi.mocked(transport.eraseRule).mockReturnValue(wait.promise);await open();state.openClear();const written=state.confirmClear();permissions(true,'other');rule.value='other-rule';await flushPromises();const calls=vi.mocked(transport.readRows).mock.calls.length;expect(state.control.data.value?.writeToken).toBe(3);wait.resolve({checked:true,writeToken:99});await written;expect(state.control.data.value?.writeToken).toBe(3);expect(transport.readRows).toHaveBeenCalledTimes(calls);expect(state.locked.value).toBe(false)
})
it('身份失效或卸载后迟到成功不能恢复数据或再发读取',async()=>{
 const wait=pending<{checked:boolean;writeToken:number}>();vi.mocked(transport.eraseRule).mockReturnValue(wait.promise);await open();state.openClear();const written=state.confirmClear();invalidateIdentity();await flushPromises();expect(state.page.data.value).toBeUndefined();expect(state.intent.value).toBeUndefined();wrapper.unmount();wait.resolve({checked:true,writeToken:99});await written;expect(state.page.data.value).toBeUndefined();expect(transport.readRows).toHaveBeenCalledTimes(1)
})
it('分页传递opaque游标，过期失败不重置后自动重试，人工刷新才从头读',async()=>{
 vi.mocked(transport.readRows).mockResolvedValueOnce({...initialPage,continuation:'opaque'}).mockRejectedValueOnce(new ApiError('游标已失效',400)).mockResolvedValue(initialPage);await open();await state.next();expect(transport.readRows).toHaveBeenLastCalledWith('p','r','opaque',expect.any(AbortSignal));expect(state.page.error.value).toBeInstanceOf(ApiError);expect(transport.readRows).toHaveBeenCalledTimes(2);await state.reload();expect(transport.readRows).toHaveBeenLastCalledWith('p','r',undefined,expect.any(AbortSignal));expect(state.cursors.value).toEqual([undefined])
})
it('重复/超长游标和不可精确CAS投影明确失败，不变成空日志或发送写入',async()=>{
 vi.mocked(transport.readRows).mockResolvedValueOnce({...initialPage,continuation:'same'}).mockResolvedValueOnce({...initialPage,continuation:'same'});await open();await state.next();expect(state.page.error.value).toBeInstanceOf(Error);expect(state.ready.value).toBe(false);vi.mocked(transport.readRows).mockResolvedValueOnce({...initialPage,clearToken:Number.MAX_SAFE_INTEGER});await state.reload();expect(state.page.error.value).toBeInstanceOf(Error);state.openClear();expect(state.intent.value).toBeUndefined();expect(transport.eraseRule).not.toHaveBeenCalled()
})
it('按页空读实际请求1/2/3/2/1，不借假数据continuation驱动下一页',async()=>{
 transport.readNumberedRows=vi.fn().mockResolvedValue({rows:[],clearToken:7});await open(false);expect(state.hasNext.value).toBe(true);await state.next();await state.next();await state.previous();await state.previous();await state.previous();expect(vi.mocked(transport.readNumberedRows).mock.calls.map(call=>call[2])).toEqual([1,2,3,2,1]);expect(transport.readRows).not.toHaveBeenCalled();expect(state.displayPage.value).toBe(1);expect(state.page.data.value?.continuation).toBeUndefined()
})
it('按页预算在417停止，刷新和成功清空均请求真实page1',async()=>{
 transport.readNumberedRows=vi.fn().mockResolvedValue({rows:[],clearToken:7});await open(false);state.browsePage.value=416;await state.next();expect(state.displayPage.value).toBe(417);expect(state.hasNext.value).toBe(false);const count=vi.mocked(transport.readNumberedRows).mock.calls.length;await state.next();expect(transport.readNumberedRows).toHaveBeenCalledTimes(count);await state.reload();expect(state.displayPage.value).toBe(1);await state.next();state.openClear();await state.confirmClear();expect(state.displayPage.value).toBe(1);expect(vi.mocked(transport.readNumberedRows).mock.calls.map(call=>call[2])).toEqual([1,417,1,2,1])
})
it('按页读取不能解除未知写锁，成功人工核对才解锁并回page1',async()=>{
 transport.readNumberedRows=vi.fn().mockResolvedValue(initialPage);vi.mocked(transport.changeSwitch).mockRejectedValueOnce(new ApiError('未知',500));await open();await state.toggle(true);expect(state.locked.value).toBe(true);await state.next();expect(state.displayPage.value).toBe(2);expect(state.locked.value).toBe(true);await state.reload();expect(state.locked.value).toBe(false);expect(state.displayPage.value).toBe(1);expect(transport.changeSwitch).toHaveBeenCalledTimes(1)
})
it('按页切项目丢弃迟到读取且新范围从1开始，不沿旧页继续',async()=>{
 const wait=pending<typeof initialPage>();transport.readNumberedRows=vi.fn().mockResolvedValue(initialPage);await open(false);vi.mocked(transport.readNumberedRows).mockReturnValueOnce(wait.promise);const next=state.next();await flushPromises();permissions(true,'other');await flushPromises();expect(state.displayPage.value).toBe(1);wait.resolve({...initialPage,rows:[{...row,deviceLabel:'旧项目秘密'}]});await next;expect(state.page.data.value?.rows[0].deviceLabel).toBe('设备');expect(transport.readNumberedRows).toHaveBeenLastCalledWith('other',undefined,1,expect.any(AbortSignal))
})
