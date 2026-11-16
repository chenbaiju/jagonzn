import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { session } from '../../src/core/session'
import { ApiError, invalidateIdentity } from '../../src/core/http'
import { useTaskDebugLogState, type TaskDebugLogTransport } from '../../src/features/rules/task-debug-state'

const row={key:'log',taskLabel:'任务',typeLabel:'—',sourceLabel:'—',countLabel:'—',deliveryLabel:'—'}
const initialPage={rows:[row],clearToken:7}
let transport:TaskDebugLogTransport, state:ReturnType<typeof useTaskDebugLogState>, wrapper:ReturnType<typeof mount>
let job=ref<string|undefined>('r'), available=ref(true)
function pending<T>(){let resolve!:(value:T)=>void;let reject!:(cause:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
function permissions(manage=true,project='p'){session.user={...session.user!,currentProjectId:project,permissions:manage?['task:read','task:manage']:['task:read']}}
async function open(single=true){job=ref(single?'r':undefined);available=ref(true);wrapper=mount(defineComponent({setup(){state=useTaskDebugLogState(job,transport,available);return {}},template:'<p />'}));await flushPromises()}
beforeEach(()=>{
 permissions();transport={readRows:vi.fn().mockResolvedValue(initialPage),readSwitch:vi.fn().mockResolvedValue({checked:false,writeToken:3}),changeSwitch:vi.fn().mockResolvedValue({checked:true,writeToken:4}),eraseTask:vi.fn().mockResolvedValue({checked:false,writeToken:4}),eraseProject:vi.fn().mockResolvedValue(8)}
})
afterEach(()=>{wrapper?.unmount();session.user=null})
it('普通成员可读取日志与调试状态，但不能提交任何管理写入',async()=>{
 permissions(false);await open();expect(state.allowed.value).toBe(true);expect(state.manage.value).toBe(false);expect(state.page.data.value?.rows).toEqual([row]);expect(state.control.data.value).toEqual({checked:false,writeToken:3});state.openClear();await state.confirmClear();await state.toggle(true);expect(state.intent.value).toBeUndefined();expect(transport.eraseTask).not.toHaveBeenCalled();expect(transport.eraseProject).not.toHaveBeenCalled();expect(transport.changeSwitch).not.toHaveBeenCalled()
})
it('详情只读两种投影，控制状态未成功前不能发写入',async()=>{
 const wait=pending<{checked:boolean;writeToken:number}>();vi.mocked(transport.readSwitch).mockReturnValue(wait.promise);await open();expect(state.ready.value).toBe(false);state.openClear();await state.toggle(true);expect(state.intent.value).toBeUndefined();expect(transport.eraseTask).not.toHaveBeenCalled();expect(transport.changeSwitch).not.toHaveBeenCalled();wait.resolve({checked:false,writeToken:3});await flushPromises();expect(state.ready.value).toBe(true);expect(transport.readRows).toHaveBeenCalledWith('p','r',1,expect.any(AbortSignal))
})
it('项目只读取日志，清空使用已读项目token，不读任务开关',async()=>{
 await open(false);expect(transport.readSwitch).not.toHaveBeenCalled();state.openClear();expect(state.intent.value?.token).toBe(7);await state.confirmClear();expect(transport.eraseProject).toHaveBeenCalledExactlyOnceWith('p',7);expect(transport.eraseTask).not.toHaveBeenCalled();expect(transport.readRows).toHaveBeenCalledTimes(2)
})
it('单任务清空固定打开时token，明确成功才清页和重新读，取消不发请求',async()=>{
 await open();state.openClear();state.cancelClear();await state.confirmClear();expect(transport.eraseTask).not.toHaveBeenCalled();state.openClear();state.control.data.value={checked:true,writeToken:9};await state.confirmClear();expect(transport.eraseTask).toHaveBeenCalledExactlyOnceWith('p','r',3);expect(state.control.data.value).toEqual({checked:false,writeToken:4});expect(state.browsePage.value).toBe(1);expect(state.intent.value).toBeUndefined()
})
it('写入在途不能重复确定、关闭、切换、翻页或刷新',async()=>{
 const wait=pending<{checked:boolean;writeToken:number}>();vi.mocked(transport.eraseTask).mockReturnValue(wait.promise);await open();state.openClear();const first=state.confirmClear();await flushPromises();expect(state.busy.value).toBe(true);state.cancelClear();expect(state.intent.value).toBeDefined();await state.confirmClear();await state.toggle(true);await state.next();await state.reload();expect(transport.eraseTask).toHaveBeenCalledTimes(1);expect(transport.changeSwitch).not.toHaveBeenCalled();expect(transport.readRows).toHaveBeenCalledTimes(1);wait.resolve({checked:false,writeToken:4});await first
})
it('调试开关沿独立token更新，关闭不抹已有历史或重载/补跑',async()=>{
 await open();await state.toggle(true);expect(transport.changeSwitch).toHaveBeenCalledExactlyOnceWith('p','r',3,true);expect(state.page.data.value?.rows).toEqual([row]);vi.mocked(transport.changeSwitch).mockResolvedValueOnce({checked:false,writeToken:5});await state.toggle(false);expect(transport.changeSwitch).toHaveBeenLastCalledWith('p','r',4,false);expect(state.page.data.value?.rows).toEqual([row]);expect(transport.readRows).toHaveBeenCalledTimes(1);expect(transport.eraseTask).not.toHaveBeenCalled()
})
it('未知结果不重放，失败回读不解锁，成功读取两种投影后才能重新确认',async()=>{
 vi.mocked(transport.eraseTask).mockRejectedValueOnce(new ApiError('未知',0,undefined,undefined,true));await open();state.openClear();await state.confirmClear();expect(state.locked.value).toBe(true);expect(state.intent.value).toBeUndefined();state.openClear();await state.toggle(true);expect(transport.eraseTask).toHaveBeenCalledTimes(1);vi.mocked(transport.readSwitch).mockRejectedValueOnce(new ApiError('读取失败',503));await state.reload();expect(state.locked.value).toBe(true);vi.mocked(transport.readSwitch).mockResolvedValueOnce({checked:true,writeToken:8});await state.reload();expect(state.locked.value).toBe(false);vi.mocked(transport.eraseTask).mockResolvedValueOnce({checked:true,writeToken:9});state.openClear();await state.confirmClear();expect(transport.eraseTask).toHaveBeenLastCalledWith('p','r',8);expect(state.locked.value).toBe(false);expect(state.control.data.value).toEqual({checked:true,writeToken:9})
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
 vi.mocked(transport.eraseTask).mockRejectedValueOnce(new ApiError('拒绝或不存在',status));await open();state.openClear();await state.confirmClear();await flushPromises();expect(state.page.data.value).toBeUndefined();expect(state.control.data.value).toBeUndefined();expect(state.intent.value).toBeUndefined();expect(state.page.error.value).toBeInstanceOf(ApiError);expect(transport.readRows).toHaveBeenCalledTimes(1)
})
it('控制读取被拒绝也清除旧日志，失败不展示为off',async()=>{
 await open();vi.mocked(transport.readSwitch).mockRejectedValueOnce(new ApiError('控制失权',403));await state.retryControl();await flushPromises();expect(state.page.data.value).toBeUndefined();expect(state.control.data.value).toBeUndefined();expect(state.control.error.value).toBeInstanceOf(ApiError);expect(state.ready.value).toBe(false)
})
it('撤权移除确认；在途写恢复权限后的自动GET不解锁，必须人工核对',async()=>{
 const wait=pending<{checked:boolean;writeToken:number}>();vi.mocked(transport.eraseTask).mockReturnValue(wait.promise);await open();state.openClear();const written=state.confirmClear();await flushPromises();permissions(false);await flushPromises();expect(state.intent.value).toBeUndefined();expect(state.page.data.value).toBeDefined();wait.resolve({checked:false,writeToken:4});await written;permissions();await flushPromises();expect(state.page.data.value).toBeDefined();expect(state.locked.value).toBe(true);state.openClear();expect(state.intent.value).toBeUndefined();await state.reload();expect(state.locked.value).toBe(false)
})
it('更换项目或任务使迟到写入无效，不能覆盖新读或触发旧页刷新',async()=>{
 const wait=pending<{checked:boolean;writeToken:number}>();vi.mocked(transport.eraseTask).mockReturnValue(wait.promise);await open();state.openClear();const written=state.confirmClear();permissions(true,'other');job.value='other-job';await flushPromises();const calls=vi.mocked(transport.readRows).mock.calls.length;expect(state.control.data.value?.writeToken).toBe(3);wait.resolve({checked:true,writeToken:99});await written;expect(state.control.data.value?.writeToken).toBe(3);expect(transport.readRows).toHaveBeenCalledTimes(calls);expect(state.locked.value).toBe(false)
})
it('身份失效或卸载后迟到成功不能恢复数据或再发读取',async()=>{
 const wait=pending<{checked:boolean;writeToken:number}>();vi.mocked(transport.eraseTask).mockReturnValue(wait.promise);await open();state.openClear();const written=state.confirmClear();invalidateIdentity();await flushPromises();expect(state.page.data.value).toBeUndefined();expect(state.intent.value).toBeUndefined();wrapper.unmount();wait.resolve({checked:true,writeToken:99});await written;expect(state.page.data.value).toBeUndefined();expect(transport.readRows).toHaveBeenCalledTimes(1)
})
it('有界按页空读实际传递1/2/3/2/1，不虚构数据游标或总数',async()=>{
 vi.mocked(transport.readRows).mockResolvedValue({rows:[],clearToken:7});await open(false);expect(state.hasNext.value).toBe(true);await state.next();await state.next();await state.previous();await state.previous();await state.previous();expect(vi.mocked(transport.readRows).mock.calls.map(call=>call[2])).toEqual([1,2,3,2,1]);expect(state.browsePage.value).toBe(1)
})
it('预算417不能继续前进，成功清空或刷新回到1，全部GET走相同任务范围',async()=>{
 await open();state.browsePage.value=416;await state.next();expect(state.browsePage.value).toBe(417);expect(state.hasNext.value).toBe(false);const calls=vi.mocked(transport.readRows).mock.calls.length;await state.next();expect(transport.readRows).toHaveBeenCalledTimes(calls);state.openClear();await state.confirmClear();expect(state.browsePage.value).toBe(1);await state.next();await state.reload();expect(state.browsePage.value).toBe(1);expect(vi.mocked(transport.readRows).mock.calls.every(call=>call[0]==='p' && call[1]==='r')).toBe(true)
})
it('同对象暂离页签与重新出现保留未知写锁，翻页和独立读开关不能代替人工核对',async()=>{
 vi.mocked(transport.changeSwitch).mockRejectedValueOnce(new ApiError('未知',500));await open();await state.toggle(true);available.value=false;await flushPromises();expect(state.page.data.value).toBeUndefined();available.value=true;await flushPromises();expect(state.locked.value).toBe(true);await state.next();await state.retryControl();expect(state.locked.value).toBe(true);await state.reload();expect(state.locked.value).toBe(false);expect(state.browsePage.value).toBe(1);expect(transport.changeSwitch).toHaveBeenCalledTimes(1)
})
it('读取权消失清除内容，恢复后不重提已取消确认',async()=>{
 await open();state.openClear();session.user={...session.user!,permissions:[]};await flushPromises();expect(state.page.data.value).toBeUndefined();expect(state.control.data.value).toBeUndefined();expect(state.intent.value).toBeUndefined();permissions();await flushPromises();await state.confirmClear();expect(transport.eraseTask).not.toHaveBeenCalled()
})
it('迟到旧页不能覆盖新项目，当前错误页不能自动前进',async()=>{
 const wait=pending<typeof initialPage>();await open(false);vi.mocked(transport.readRows).mockReturnValueOnce(wait.promise);const next=state.next();permissions(true,'other');await flushPromises();wait.resolve({...initialPage,rows:[{...row,taskLabel:'旧范围秘密'}]});await next;expect(state.browsePage.value).toBe(1);expect(state.page.data.value?.rows[0].taskLabel).toBe('任务');vi.mocked(transport.readRows).mockRejectedValueOnce(new ApiError('读取失败',503));await state.next();const calls=vi.mocked(transport.readRows).mock.calls.length;await state.next();expect(transport.readRows).toHaveBeenCalledTimes(calls);expect(state.page.error.value).toBeInstanceOf(ApiError)
})
it.each([undefined, {rows:[],clearToken:Number.MAX_SAFE_INTEGER}, {rows:Array(25).fill(row),clearToken:7}])('坏读取投影拒绝为成功空日志，不能据此发清空',async value=>{
 vi.mocked(transport.readRows).mockResolvedValueOnce(value as typeof initialPage);await open();expect(state.page.error.value).toBeInstanceOf(Error);expect(state.ready.value).toBe(false);state.openClear();await state.confirmClear();expect(transport.eraseTask).not.toHaveBeenCalled()
})
