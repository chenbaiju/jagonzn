import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {defineComponent,h,ref,type Ref} from 'vue'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {ApiError,changeIdentity} from '../../src/core/http'
import {useDeviceSceneRunState,type DeviceSceneRunIdentity} from '../../src/features/rules/device-scene-run-state'
const session=vi.hoisted(()=>({project:null as any,manage:null as any,current:null as any}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');session.project=ref('10000000-0000-4000-8000-000000000001');session.manage=ref(true);session.current=ref({status:'ACTIVE'});return {projectId:session.project,currentProject:session.current,can:()=>session.manage.value}})
const project='10000000-0000-4000-8000-000000000001',scene='20000000-0000-4000-8000-000000000001',device='30000000-0000-4000-8000-000000000001',version='40000000-0000-4000-8000-000000000001',execution='50000000-0000-4000-8000-000000000001'
const completed=(status='DISPATCHED',key='key-1')=>({id:execution,sceneId:scene,deviceId:device,sceneVersionId:version,idempotencyKey:key,status,trigger:'MANUAL'})
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes});return {promise,resolve}}
let wrapper:VueWrapper,scope:Ref<DeviceSceneRunIdentity|null>,state:ReturnType<typeof useDeviceSceneRunState>,port:any,refresh:any,denied:any,key:any
function setup(){scope=ref({sceneId:scene,deviceId:device,versionId:version,definitionVersion:8,status:'ACTIVE'});port={run:vi.fn().mockResolvedValue(completed()),lookup:vi.fn().mockResolvedValue(completed()),definition:vi.fn().mockResolvedValue({id:scene,status:'ACTIVE',version:9,activeVersionId:version})};refresh=vi.fn().mockResolvedValue(undefined);denied=vi.fn();let n=0;key=vi.fn(()=>`key-${++n}`);wrapper=mount(defineComponent({setup(){state=useDeviceSceneRunState(scope,port,refresh,denied,key);return()=>h('div')}}))}
describe('当前设备场景单次确认与原key只读核对',()=>{
 beforeEach(()=>{session.project.value=project;session.manage.value=true;session.current.value={status:'ACTIVE'};setup()})
 afterEach(()=>wrapper.unmount())
 it('双确认在同一次请求内只有一个key和一台设备，携真实定义CAS',async()=>{
  const pending=deferred<any>();port.run.mockReturnValue(pending.promise);state.open();const first=state.confirm();await state.confirm();expect(port.run).toHaveBeenCalledExactlyOnceWith(project,scene,device,8,'key-1');expect(key).toHaveBeenCalledTimes(1);expect(state.writing.value).toBe(true);pending.resolve(completed());await first;expect(state.locked.value).toBe(false);expect(state.confirming.value).toBe(false)
 })
 it.each(['DISPATCHED','SKIPPED','FAILED'])('%s只解释真实同步终态，不当成设备送达',async status=>{
  port.run.mockResolvedValue(completed(status));state.open();await state.confirm();expect(state.receipt.value?.status).toBe(status);expect(state.notice.value).not.toMatch(/送达成功|执行成功/);expect(state.locked.value).toBe(false);expect(port.lookup).not.toHaveBeenCalled();if(status==='DISPATCHED')expect(state.notice.value).toContain('发送队列')
 })
 it('网络未知后404仍锁定，不用空记录重发或重置幂等键',async()=>{
  port.run.mockRejectedValue(new ApiError('中断',0,undefined,undefined,true));port.lookup.mockRejectedValue(new ApiError('未找到',404));state.open();await state.confirm();expect(state.locked.value).toBe(true);expect(port.lookup).not.toHaveBeenCalled();await state.verify();expect(port.lookup).toHaveBeenCalledExactlyOnceWith(project,scene,'key-1',expect.any(AbortSignal));expect(state.error.value).toContain('仍待核对');expect(state.locked.value).toBe(true);state.cancel();state.open();await state.confirm();expect(port.run).toHaveBeenCalledTimes(1);expect(key).toHaveBeenCalledTimes(1);expect(port.definition).not.toHaveBeenCalled();expect(denied).not.toHaveBeenCalled()
 })
 it('仅同次正确receipt的GET解除未知锁，无第二POST',async()=>{
  port.run.mockRejectedValue(new ApiError('中断',0,undefined,undefined,true));state.open();await state.confirm();await state.verify();expect(port.run).toHaveBeenCalledTimes(1);expect(port.lookup).toHaveBeenCalledTimes(1);expect(state.receipt.value?.id).toBe(execution);expect(state.locked.value).toBe(false);expect(state.confirming.value).toBe(false)
 })
 it.each(['deviceId','sceneVersionId'])('错%s回执不能标成执行完成，后续正确GET才解锁',async field=>{
  port.run.mockResolvedValue({...completed(),[field]:execution});state.open();await state.confirm();expect(state.error.value).toContain('回执不匹配');expect(state.locked.value).toBe(true);expect(state.receipt.value).toBeUndefined();await state.verify();expect(state.locked.value).toBe(false);expect(port.run).toHaveBeenCalledTimes(1)
 })
 it('确定40042已回滚冲突只在人工新定义读取后恢复，未知在途409不走该分支',async()=>{
  port.run.mockRejectedValue(new ApiError('版本冲突',409,40042));state.open();await state.confirm();expect(state.definitionStale.value).toBe(true);refresh.mockImplementation(async()=>{scope.value={...scope.value!,definitionVersion:9}});await state.verify();await flushPromises();expect(port.definition).toHaveBeenCalledTimes(1);expect(port.lookup).not.toHaveBeenCalled();expect(state.locked.value).toBe(false);expect(state.canRun.value).toBe(true);expect(port.run).toHaveBeenCalledTimes(1)
 })
 it('10010在途409仍需精确key查询，404不能改为已回滚',async()=>{
  port.run.mockRejectedValue(new ApiError('处理中',409,10010));port.lookup.mockRejectedValue(new ApiError('未找到',404));state.open();await state.confirm();expect(state.definitionStale.value).toBe(false);await state.verify();expect(state.locked.value).toBe(true);expect(port.definition).not.toHaveBeenCalled();expect(refresh).not.toHaveBeenCalled()
 })
 it('PAUSED或不安全定义版本不允许确认，不派生全局状态或自选版本',async()=>{
  scope.value={...scope.value!,status:'PAUSED'};state.open();await state.confirm();expect(port.run).not.toHaveBeenCalled();scope.value={...scope.value!,status:'ACTIVE',definitionVersion:9007199254740992};await flushPromises();state.open();await state.confirm();expect(port.run).not.toHaveBeenCalled();expect(key).not.toHaveBeenCalled()
 })
 it('同对象暂时撤权保留未知key，恢复后只读核对，不自动重发',async()=>{
  const pending=deferred<any>();port.run.mockReturnValue(pending.promise);state.open();const first=state.confirm();session.manage.value=false;await flushPromises();pending.resolve(completed());await first;expect(state.locked.value).toBe(true);expect(state.receipt.value).toBeUndefined();session.manage.value=true;await flushPromises();expect(port.lookup).not.toHaveBeenCalled();await state.verify();expect(port.lookup.mock.lastCall[2]).toBe('key-1');expect(state.locked.value).toBe(false);expect(port.run).toHaveBeenCalledTimes(1)
 })
 it('身份变化丢弃旧POST回执，不能把旧结果写到新身份',async()=>{
  const pending=deferred<any>();port.run.mockReturnValue(pending.promise);state.open();const first=state.confirm();changeIdentity('scene-synthetic-next-actor');pending.resolve(completed());await first;expect(state.receipt.value).toBeUndefined();expect(state.notice.value).toBe('');expect(state.confirming.value).toBe(false);expect(state.locked.value).toBe(false);expect(port.lookup).not.toHaveBeenCalled()
 })
 it('撤读权清除已展示回执与消息，恢复不还原旧私有回执或自动请求',async()=>{
  state.open();await state.confirm();expect(state.receipt.value?.id).toBe(execution);expect(state.notice.value).not.toBe('')
  session.manage.value=false;await flushPromises();expect(state.receipt.value).toBeUndefined();expect(state.notice.value).toBe('');expect(state.error.value).toBe('');expect(state.blocked.value).toBe(false)
  session.manage.value=true;await flushPromises();expect(state.receipt.value).toBeUndefined();expect(state.notice.value).toBe('');expect(port.lookup).not.toHaveBeenCalled();expect(port.run).toHaveBeenCalledTimes(1)
 })
 it('归档只读项目即使残留rule管理权限也不能新运行',async()=>{
  session.current.value={status:'ARCHIVED'};await flushPromises();expect(state.canRun.value).toBe(false);state.open();await state.confirm();expect(port.run).not.toHaveBeenCalled();expect(key).not.toHaveBeenCalled();expect(state.confirming.value).toBe(false)
 })
 it('写在途归档后保留原key并只读核对，恢复ACTIVE前不能再运行',async()=>{
  const pending=deferred<any>();port.run.mockReturnValue(pending.promise);state.open();const first=state.confirm();session.current.value={status:'ARCHIVED'};await flushPromises();pending.resolve(completed());await first;expect(state.locked.value).toBe(true);expect(state.receipt.value).toBeUndefined();expect(port.lookup).not.toHaveBeenCalled();await state.verify();expect(port.lookup.mock.lastCall[2]).toBe('key-1');expect(state.locked.value).toBe(false);expect(state.receipt.value?.id).toBe(execution);expect(state.canRun.value).toBe(false);state.open();await state.confirm();expect(port.run).toHaveBeenCalledTimes(1);session.current.value={status:'ACTIVE'};await flushPromises();expect(state.canRun.value).toBe(true)
 })
 it('归档核对期间再撤读权也不会卡住checking，恢复读权可继续原key GET',async()=>{
  port.run.mockRejectedValue(new ApiError('中断',0,undefined,undefined,true));state.open();await state.confirm();session.current.value={status:'ARCHIVED'};await flushPromises();const pending=deferred<any>();port.lookup.mockReturnValueOnce(pending.promise);const reading=state.verify();expect(state.checking.value).toBe(true);session.manage.value=false;await flushPromises();pending.resolve(completed());await reading;expect(state.checking.value).toBe(false);expect(state.locked.value).toBe(true);expect(state.receipt.value).toBeUndefined();session.manage.value=true;await flushPromises();await state.verify();expect(port.lookup).toHaveBeenCalledTimes(2);expect(port.lookup.mock.lastCall[2]).toBe('key-1');expect(state.locked.value).toBe(false);expect(state.canRun.value).toBe(false);expect(port.run).toHaveBeenCalledTimes(1)
 })
 it('V2排队及等待只确认受理，UNKNOWN同key读到QUEUED后不重POST',async()=>{
  for(const [index,status] of ['QUEUED','RUNNING','WAITING','SUCCEEDED','TERMINATED'].entries()){
   port.run.mockResolvedValue({...completed(status,`key-${index+1}`),runtimeVersion:2});state.open();await state.confirm();await state.confirm()
   expect(state.receipt.value?.status).toBe(status);expect(state.locked.value).toBe(false);expect(state.confirming.value).toBe(false);expect(port.run).toHaveBeenCalledTimes(index+1)
   if(['QUEUED','RUNNING','WAITING'].includes(status)){expect(state.notice.value).toBe('已触发一次执行');expect(state.notice.value).not.toMatch(/成功|完成|送达/)}
  }
  expect(port.lookup).not.toHaveBeenCalled();wrapper.unmount();setup()
  port.run.mockRejectedValue(new ApiError('结果未知',0,undefined,undefined,true));port.lookup.mockResolvedValue({...completed('QUEUED'),runtimeVersion:2})
  state.open();await state.confirm();expect(state.locked.value).toBe(true);await state.verify();await state.confirm();await state.verify()
  expect(port.lookup).toHaveBeenCalledExactlyOnceWith(project,scene,'key-1',expect.any(AbortSignal));expect(port.run).toHaveBeenCalledTimes(1);expect(key).toHaveBeenCalledTimes(1);expect(state.locked.value).toBe(false);expect(state.notice.value).toBe('已触发一次执行')
  wrapper.unmount();setup();port.run.mockResolvedValue({...completed('SKIPPED'),runtimeVersion:2});state.open();await state.confirm();expect(state.notice.value).toBe('已跳过');expect(state.notice.value).not.toContain('条件')
  wrapper.unmount();setup();port.run.mockResolvedValue({...completed('QUEUED'),runtimeVersion:1});state.open();await state.confirm();expect(state.locked.value).toBe(true);expect(state.receipt.value).toBeUndefined()
 })

})
