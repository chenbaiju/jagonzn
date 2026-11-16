import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { session } from '../../src/core/session'
import { ApiError, invalidateIdentity } from '../../src/core/http'
import { useTaskRelatedDevicesState, type RelatedDevicesTransport, type RelatedDeviceRead } from '../../src/features/rules/task-related-devices-state'
const a={key:'a',label:'设备甲',scheduled:true,writeToken:3},b={key:'b',label:'设备乙',scheduled:false,writeToken:2}
let wrapper:ReturnType<typeof mount>,state:ReturnType<typeof useTaskRelatedDevicesState>,transport:RelatedDevicesTransport
let context=vi.fn<()=>Promise<void>>()
let job=ref('j'),definition=ref<number|undefined>(9),enabled=ref(true),available=ref(true)
function permissions(manage=true,run=true,read=true,project='p'){session.user={...session.user!,currentProjectId:project,permissions:[...(read?['task:read']:[]),...(manage?['task:manage']:[]),...(run?['task:run']:[])]}}
function pending<T>(){let resolve!:(value:T)=>void,reject!:(cause:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}
async function open(){wrapper=mount(defineComponent({setup(){state=useTaskRelatedDevicesState(job,definition,enabled,transport,context,available);return{}},template:'<p />'}));await flushPromises()}
beforeEach(()=>{job=ref('j');definition=ref(9);enabled=ref(true);available=ref(true);permissions();context=vi.fn<()=>Promise<void>>().mockResolvedValue(undefined);transport={readRows:vi.fn().mockResolvedValue({rows:[a,b],definitionToken:9}),changeSchedule:vi.fn().mockResolvedValue({key:'a',scheduled:false,writeToken:4,definitionToken:9}),runRows:vi.fn().mockResolvedValue(undefined)}})
afterEach(()=>{wrapper?.unmount();session.user=null})
it('成员、管理、运行权限独立，定时关闭设备仍可手动运行，整体停用只禁运行',async()=>{
 permissions(false,true);await open();expect(state.allowed.value).toBe(true);expect(state.canManage.value).toBe(false);state.select(['b']);await state.run(['b']);expect(transport.runRows).toHaveBeenCalledExactlyOnceWith('p','j',9,['b']);expect(state.notice.value).toBe('执行已受理');await state.toggle('a',false);expect(transport.changeSchedule).not.toHaveBeenCalled();enabled.value=false;await flushPromises();expect(state.canRun.value).toBe(false);permissions(true,false);await flushPromises();expect(state.canManage.value).toBe(true);expect(state.canRun.value).toBe(false)
})
it('同值不写，变更捕获独立token3与定义9，成功只更新当前行而不虚构运行时间',async()=>{
 await open();await state.toggle('a',true);expect(transport.changeSchedule).not.toHaveBeenCalled();await state.toggle('a',false);expect(transport.changeSchedule).toHaveBeenCalledExactlyOnceWith('p','j','a',9,3,false);expect(state.page.data.value?.rows).toEqual([{...a,scheduled:false,writeToken:4},b]);expect(state.page.data.value?.rows[0]).not.toHaveProperty('acceptedAt');expect(transport.readRows).toHaveBeenCalledTimes(1)
})
it('在途不乐观更改，不可重复开关、运行或刷新',async()=>{
 const wait=pending<{key:string;scheduled:boolean;writeToken:number;definitionToken:number}>();vi.mocked(transport.changeSchedule).mockReturnValue(wait.promise);await open();const writing=state.toggle('a',false);expect(state.page.data.value?.rows[0].scheduled).toBe(true);await state.toggle('b',true);await state.run(['b']);await state.reload();expect(transport.changeSchedule).toHaveBeenCalledTimes(1);expect(transport.runRows).not.toHaveBeenCalled();expect(context).not.toHaveBeenCalled();wait.resolve({key:'a',scheduled:false,writeToken:4,definitionToken:9});await writing;expect(state.busy.value).toBe(false)
})
it('未知结果不重放，自动读取不能解锁，人工先成功重读父定义再读取偏好',async()=>{
 vi.mocked(transport.changeSchedule).mockRejectedValueOnce(new ApiError('未知',0,undefined,undefined,true));await open();await state.toggle('a',false);await state.reload(false);expect(state.locked.value).toBe(true);await state.toggle('a',false);expect(transport.changeSchedule).toHaveBeenCalledTimes(1);context.mockImplementation(async()=>{available.value=false;await flushPromises();definition.value=10;available.value=true;vi.mocked(transport.readRows).mockResolvedValue({rows:[{...a,scheduled:false,writeToken:4}],definitionToken:10})});await state.reload();expect(context).toHaveBeenCalledTimes(1);expect(transport.readRows).toHaveBeenLastCalledWith('p','j',10,undefined,expect.any(AbortSignal));expect(state.locked.value).toBe(false);expect(state.writeError.value).toBe('')
})
it('失败父定义核对保留未知锁且不读取新设备页',async()=>{
 vi.mocked(transport.runRows).mockRejectedValueOnce(new ApiError('未知',500));await open();await state.run(['a']);const calls=vi.mocked(transport.readRows).mock.calls.length;context.mockRejectedValueOnce(new ApiError('父定义读取失败',503));await state.reload();expect(state.locked.value).toBe(true);expect(transport.readRows).toHaveBeenCalledTimes(calls);expect(state.page.data.value).toBeUndefined();expect(transport.runRows).toHaveBeenCalledTimes(1)
})
it('坏成功响应作为未知结果锁定，不猜偏好值或CAS',async()=>{
 vi.mocked(transport.changeSchedule).mockResolvedValueOnce({key:'a',scheduled:false,writeToken:3,definitionToken:9});await open();await state.toggle('a',false);expect(state.locked.value).toBe(true);expect(state.page.data.value?.rows[0]).toEqual(a);expect(state.writeError.value).toContain('不匹配')
})
it('管理撤权及同对象暂离期间迟到成功不能覆盖新读或自动解除锁',async()=>{
 const wait=pending<{key:string;scheduled:boolean;writeToken:number;definitionToken:number}>();vi.mocked(transport.changeSchedule).mockReturnValueOnce(wait.promise);await open();const writing=state.toggle('a',false);permissions(false,true);await flushPromises();wait.resolve({key:'a',scheduled:false,writeToken:4,definitionToken:9});await writing;permissions();await flushPromises();available.value=false;await flushPromises();available.value=true;await flushPromises();expect(state.locked.value).toBe(true);expect(state.page.data.value?.rows[0]).toEqual(a);await state.reload();expect(state.locked.value).toBe(false)
})
it.each([401,403,404])('明确拒绝%s清旧页和选择，不显示默认偏好或留下重放意图',async status=>{
 vi.mocked(transport.changeSchedule).mockRejectedValueOnce(new ApiError('拒绝',status));await open();state.select(['a']);await state.toggle('a',false);expect(state.page.data.value).toBeUndefined();expect(state.selected.value).toEqual([]);expect(state.page.error.value).toBeInstanceOf(ApiError)
})
it('运行只提交已知实际子集的冻结副本，空集合和外部键从不降级全体',async()=>{
 const wait=pending<void>();vi.mocked(transport.runRows).mockReturnValueOnce(wait.promise);await open();await state.run([]);await state.run(['outside']);expect(transport.runRows).not.toHaveBeenCalled();const ids=['b'];const writing=state.run(ids);ids.push('a');expect(transport.runRows).toHaveBeenCalledExactlyOnceWith('p','j',9,['b']);wait.resolve(undefined);await writing;expect(state.notice.value).toBe('执行已受理');expect(state.selected.value).toEqual([])
})
it('换项目或任务使迟到写与读无效，新范围从头读取',async()=>{
 const wait=pending<void>();vi.mocked(transport.runRows).mockReturnValueOnce(wait.promise);await open();const writing=state.run(['a']);permissions(true,true,true,'q');job.value='next';await flushPromises();const calls=vi.mocked(transport.readRows).mock.calls.length;wait.resolve(undefined);await writing;expect(state.notice.value).toBe('');expect(state.locked.value).toBe(false);expect(transport.readRows).toHaveBeenCalledTimes(calls);expect(transport.readRows).toHaveBeenLastCalledWith('q','next',9,undefined,expect.any(AbortSignal))
})
it('真实opaque分页保留已选键，刷新清空选择；重复游标不能重启第一页',async()=>{
 vi.mocked(transport.readRows).mockResolvedValueOnce({rows:[a],definitionToken:9,continuation:'next'}).mockResolvedValueOnce({rows:[b],definitionToken:9,continuation:'next'});await open();state.select(['a']);await state.next();expect(transport.readRows).toHaveBeenLastCalledWith('p','j',9,'next',expect.any(AbortSignal));expect(state.page.error.value).toBeInstanceOf(Error);vi.mocked(transport.readRows).mockResolvedValueOnce({rows:[a],definitionToken:9});await state.reload();expect(state.selected.value).toEqual([]);expect(state.cursors.value).toEqual([undefined])
})
it('旧页迟到不能污染新范围已知键或允许选取旧设备',async()=>{
 const wait=pending<RelatedDeviceRead>();vi.mocked(transport.readRows).mockResolvedValueOnce({rows:[a],definitionToken:9,continuation:'next'}).mockReturnValueOnce(wait.promise).mockResolvedValue({rows:[b],definitionToken:9});await open();const reading=state.next();permissions(true,true,true,'q');await flushPromises();wait.resolve({rows:[a],definitionToken:9});await reading;state.select(['a']);expect(state.selected.value).toEqual([]);expect(state.writeError.value).toContain('有效设备');expect(state.page.data.value?.rows).toEqual([b])
})
it('身份失效或卸载后迟到成功不恢复选择和受理提示',async()=>{
 const wait=pending<void>();vi.mocked(transport.runRows).mockReturnValueOnce(wait.promise);await open();const writing=state.run(['a']);invalidateIdentity();await flushPromises();wrapper.unmount();wait.resolve(undefined);await writing;expect(state.page.data.value).toBeUndefined();expect(state.notice.value).toBe('')
})
it.each([undefined,0,Number.MAX_SAFE_INTEGER])('无法精确读取的父版本%s不能伪装成空设备列表',async version=>{
 definition.value=version;await open();expect(transport.readRows).not.toHaveBeenCalled();expect(state.page.error.value).toBeInstanceOf(Error);expect(state.canManage.value).toBe(false)
})
it('已读数据后父版本变成未知时安全清空，不保留旧键或把undefined当页投影',async()=>{
 await open();state.select(['a']);definition.value=undefined;await flushPromises();expect(state.page.data.value).toBeUndefined();expect(state.page.error.value).toBeInstanceOf(Error);expect(state.selected.value).toEqual([])
})
