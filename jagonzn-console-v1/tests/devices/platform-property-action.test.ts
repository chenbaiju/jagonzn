import {dailyTimerListValue,dailyTimerRangeValue,dailyTimerRangeListValue,dailyTimerDurationValue,dailyTimerDurationListValue,dailyTimerIntervalValue,dailyTimerIntervalListValue} from '../../src/features/devices/daily-timer-value'
import {decodePropertyPage} from '../../src/features/devices/property-decoder'
import {parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'
import {webcrypto} from 'node:crypto'
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PlatformPropertyAction from '../../src/features/devices/PlatformPropertyAction.vue'
import {copyEnumOptions,frozenEnumOptions,enumDraftValue} from '../../src/features/devices/single-property-enum'
import {ApiError,identityEpoch,changeIdentity} from '../../src/core/http'
const state=vi.hoisted(()=>({send:vi.fn(),read:vi.fn(),lookup:vi.fn(),allowed:true,status:null as any}))
vi.mock('../../src/core/session',async()=>{const{ref,computed}=await import('vue');state.status=ref('ACTIVE');return{projectId:ref('00000000-0000-4000-8000-000000000001'),currentProject:computed(()=>({status:state.status.value})),can:()=>state.allowed}})
vi.mock('../../src/features/devices/platform-properties-api',async()=>{const actual=await vi.importActual('../../src/features/devices/platform-properties-api');return{...actual,submitPlatformProperties:state.send,platformCurrent:state.read,readPlatformPropertySubmission:state.lookup}})
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',model='00000000-0000-4000-8000-000000000003',operation='00000000-0000-4000-8000-000000000004'
const receipt=(kind='CLOUD_UPDATE')=>({operationId:operation,projectId:project,deviceId:device,modelVersionId:model,kind,acceptedAt:'2026-10-24T00:00:00Z',commandId:kind==='DOWNLINK'?operation:null})
function wire(kind='CLOUD_UPDATE',id=operation){return new TextEncoder().encode(`{"projectId":"${project}","deviceId":"${device}","modelVersionId":"${model}","values":[{"propertyKey":"n","state":"VALUE","sourceKind":"${kind==='DOWNLINK'?'PLATFORM_DOWNLINK':'PLATFORM_CLOUD_UPDATE'}","value":9007199254740993,"modelVersionId":"${model}","occurredAt":null,"updatedAt":"2026-10-24T00:00:00Z","operationId":"${id}","reportedRevision":null}]}`)}
function render(kind:'DOWNLINK'|'CLOUD_UPDATE'='CLOUD_UPDATE'){return mount(PlatformPropertyAction,{props:{deviceId:device,modelVersionId:model,kind},attachTo:document.body,global:{plugins:[ElementPlus]}})}
function button(w:ReturnType<typeof render>,text:string){const value=w.findAll('button').find(b=>b.text()===text);expect(value).toBeDefined();return value!}
async function open(w:ReturnType<typeof render>,kind='CLOUD_UPDATE'){await button(w,kind==='DOWNLINK'?'下发属性':'更新云端属性').trigger('click');await flushPromises();await w.find('textarea').setValue('{"n":9007199254740993}')}

function singleSnapshot(kind:'DOWNLINK'|'CLOUD_UPDATE'='CLOUD_UPDATE',overrides:Record<string,unknown>={}){return{project,device,model,epoch:identityEpoch(),key:'target-level',name:'冻结属性名称',nameIsCurrent:false,dataType:'NUMBER',accessType:kind==='DOWNLINK'?'SHARED':'CLOUD_PRIVATE',value:'9007199254740993',...overrides}}
async function startSingle(w:ReturnType<typeof render>,kind:'DOWNLINK'|'CLOUD_UPDATE'='CLOUD_UPDATE',overrides:Record<string,unknown>={}){w.vm.startSingle(singleSnapshot(kind,overrides));await flushPromises()}
function singleWire(raw:string,kind='CLOUD_UPDATE',key='target-level'){return new TextEncoder().encode(`{"projectId":"${project}","deviceId":"${device}","modelVersionId":"${model}","values":[{"propertyKey":"${key}","state":"VALUE","sourceKind":"${kind==='DOWNLINK'?'PLATFORM_DOWNLINK':'PLATFORM_CLOUD_UPDATE'}","value":${raw},"modelVersionId":"${model}","occurredAt":null,"updatedAt":"2026-10-24T00:00:00Z","operationId":"${operation}","reportedRevision":null}]}`)}
describe('平台双动作弹窗的真实回执与写后核对',()=>{
 afterEach(()=>vi.unstubAllGlobals())
 beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);vi.clearAllMocks();state.allowed=true;state.status.value='ACTIVE';state.send.mockResolvedValue(receipt());state.read.mockResolvedValue(wire())})
 it.each(['DOWNLINK','CLOUD_UPDATE'] as const)('写前摘要期间归档阻止%s首次提交并释放busy，恢复后只按新点击发送',async kind=>{
  let resolve!:(value:ArrayBuffer)=>void
  const digest=vi.spyOn(webcrypto.subtle,'digest').mockReturnValueOnce(new Promise<ArrayBuffer>(done=>{resolve=done}))
  state.send.mockResolvedValue(receipt(kind));state.read.mockResolvedValue(wire(kind))
  const w=render(kind)
  try{
   await open(w,kind);await button(w,'提交').trigger('click');await flushPromises()
   expect(digest).toHaveBeenCalledTimes(1);expect(state.send).not.toHaveBeenCalled();expect(w.emitted('busy')?.at(-1)).toEqual([true])
   state.status.value='ARCHIVED';await flushPromises();resolve(new ArrayBuffer(32));await flushPromises()
   expect(state.allowed).toBe(true);expect(state.send).not.toHaveBeenCalled();expect(state.read).not.toHaveBeenCalled();expect(state.lookup).not.toHaveBeenCalled()
   expect(w.emitted('busy')?.at(-1)).toEqual([false]);expect(w.text()).toContain('尚未提交')
   expect(button(w,'取消').attributes('disabled')).toBeUndefined();expect(button(w,'提交').attributes('disabled')).toBeDefined()
   state.status.value='ACTIVE';await flushPromises();expect(state.send).not.toHaveBeenCalled()
   await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(state.send).toHaveBeenCalledTimes(1));await flushPromises()
   expect(w.emitted('saved')).toHaveLength(1)
  }finally{w.unmount();digest.mockRestore()}
 })
 it.each(['DOWNLINK','CLOUD_UPDATE'] as const)('未知%s保留原正文摘要和key，只读原件后才解除父锁',async kind=>{
  state.send.mockRejectedValue(new ApiError('连接中断',0,undefined,undefined,true));state.lookup.mockResolvedValue(receipt(kind));state.read.mockResolvedValue(wire(kind))
  const w=render(kind);await open(w,kind);await button(w,'提交').trigger('click');await flushPromises();expect(w.emitted('busy')?.at(-1)).toEqual([true])
  const sent=state.send.mock.calls[0]!;await button(w,'取消').trigger('click');await button(w,kind==='DOWNLINK'?'下发属性':'更新云端属性').trigger('click');await flushPromises()
  await button(w,'核对原请求').trigger('click');await flushPromises();expect(state.lookup).toHaveBeenCalledTimes(1)
  expect(state.lookup.mock.calls[0]!.slice(0,5)).toEqual([project,device,model,kind,sent[4]])
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sent[3]));expect(state.lookup.mock.calls[0]![5]).toBe(Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join(''))
  expect(state.send).toHaveBeenCalledTimes(1);expect(w.emitted('saved')).toHaveLength(1);expect(w.emitted('busy')?.at(-1)).toEqual([false]);w.unmount()
 })
 it('原件读取失权清理，设备切换中止原GET并忽略迟到回执',async()=>{
  state.send.mockRejectedValue(new ApiError('连接中断',0,undefined,undefined,true));state.lookup.mockRejectedValueOnce(new ApiError('权限撤销',403));const first=render();await open(first);await button(first,'提交').trigger('click');await flushPromises();await button(first,'核对原请求').trigger('click');await flushPromises();expect(first.find('textarea').exists()).toBe(false);expect(first.emitted('busy')?.at(-1)).toEqual([false]);first.unmount()
  let resolve!:(value:ReturnType<typeof receipt>)=>void;state.lookup.mockImplementation(()=>new Promise(r=>{resolve=r}));const w=render();await open(w);await button(w,'提交').trigger('click');await flushPromises();await button(w,'核对原请求').trigger('click');await flushPromises();const signal=state.lookup.mock.calls.at(-1)![6] as AbortSignal;await w.setProps({deviceId:project});expect(signal.aborted).toBe(true);resolve(receipt());await flushPromises();expect(w.emitted('saved')).toBeUndefined();expect(w.emitted('busy')?.at(-1)).toEqual([false]);expect(state.send).toHaveBeenCalledTimes(2);w.unmount()
 })
 it('原件404和模型切换/归档不丢未知意图，不从当前同值推测原写成功',async()=>{
  state.send.mockRejectedValue(new ApiError('连接中断',0,undefined,undefined,true));state.lookup.mockRejectedValue(new ApiError('未定位',404));const w=render();await open(w);await button(w,'提交').trigger('click');await flushPromises()
  await w.setProps({modelVersionId:operation,disabled:true});state.status.value='ARCHIVED';await button(w,'取消').trigger('click');await button(w,'更新云端属性').trigger('click');await flushPromises();await button(w,'核对原请求').trigger('click');await flushPromises()
  expect(state.lookup.mock.calls[0]!.slice(0,4)).toEqual([project,device,model,'CLOUD_UPDATE']);expect(w.text()).toContain('暂未定位原请求');expect(state.read).not.toHaveBeenCalled();expect(state.send).toHaveBeenCalledTimes(1);expect(w.emitted('busy')?.at(-1)).toEqual([true]);w.unmount()
 })
 it.each(['DOWNLINK','CLOUD_UPDATE'] as const)('只发送一次%s原始精确正文并按同operation读取确认',async kind=>{
  state.send.mockResolvedValue(receipt(kind));state.read.mockResolvedValue(wire(kind));const w=render(kind);await open(w,kind);await button(w,'提交').trigger('click');await flushPromises()
  expect(state.send).toHaveBeenCalledTimes(1);expect(state.send.mock.calls[0]!.slice(0,3)).toEqual([project,device,kind]);expect(state.send.mock.calls[0]![3]).toContain('9007199254740993');expect(state.send.mock.calls[0]![3]).toContain(model)
  expect(state.read).toHaveBeenCalledWith(project,device,model,['n'],expect.any(AbortSignal));expect(w.emitted('saved')).toHaveLength(1);w.unmount()
 })
 it('重复JSON键在发请求前整批拒绝',async()=>{
  const w=render();await open(w);await w.find('textarea').setValue('{"n":1,"n":2}');await button(w,'提交').trigger('click');await flushPromises();expect(state.send).not.toHaveBeenCalled();w.unmount()
 })
 it('网络未知在关闭重开后仍阻止重复下发',async()=>{
  state.send.mockRejectedValue(new ApiError('连接中断',0,undefined,undefined,true));const w=render();await open(w);await button(w,'提交').trigger('click');await flushPromises();expect(w.text()).toContain('本次操作不能再次提交')
  await button(w,'取消').trigger('click');await button(w,'更新云端属性').trigger('click');await flushPromises();expect(w.findAll('button').some(b=>b.text()==='提交')).toBe(false);expect(button(w,'核对原请求')).toBeDefined();expect(state.send).toHaveBeenCalledTimes(1);w.unmount()
 })
 it('成功HTTP的坏身份回执保持未知，不读取别设备也不再次提交',async()=>{
  state.send.mockResolvedValue({...receipt(),deviceId:project});const w=render();await open(w);await button(w,'提交').trigger('click');await flushPromises();expect(state.read).not.toHaveBeenCalled();expect(w.text()).toContain('本次操作不能再次提交');expect(w.findAll('button').some(b=>b.text()==='提交')).toBe(false);expect(button(w,'核对原请求')).toBeDefined();w.unmount()
 })
 it('已受理后确认失败只允许重读，绝不重放写请求',async()=>{
  state.read.mockRejectedValueOnce(new Error('读取暂不可用')).mockResolvedValue(wire());const w=render();await open(w);await button(w,'提交').trigger('click');await flushPromises();expect(w.text()).toContain('操作已受理');expect(w.findAll('button').some(b=>b.text()==='提交')).toBe(false)
  await button(w,'重新核对').trigger('click');await flushPromises();expect(state.send).toHaveBeenCalledTimes(1);expect(state.read).toHaveBeenCalledTimes(2);w.unmount()
 })
 it('别次同值operation不冒认本次成功，保留已受理状态',async()=>{
  state.read.mockResolvedValue(wire('CLOUD_UPDATE',project));const w=render();await open(w);await button(w,'提交').trigger('click');await flushPromises();await vi.waitFor(()=>expect(w.text()).toContain('当前属性可能已变化'));expect(state.send).toHaveBeenCalledTimes(1);expect(button(w,'重新核对')).toBeDefined();w.unmount()
 })
 it('设备或模型改变后迟到写回执不能刷新新页面',async()=>{
  let resolve!:(value:ReturnType<typeof receipt>)=>void;state.send.mockImplementation(()=>new Promise(r=>{resolve=r}));const w=render();await open(w);await button(w,'提交').trigger('click');expect(button(w,'更新云端属性').attributes('disabled')).toBeDefined()
  await vi.waitFor(()=>expect(state.send).toHaveBeenCalledTimes(1));await w.setProps({deviceId:project});resolve(receipt());await flushPromises();expect(w.emitted('saved')).toBeUndefined();expect(state.read).not.toHaveBeenCalled();w.unmount()
 })
 it('完成墓碑和进行中拒绝都保持未知，不能重试原写',async()=>{
  for(const code of [10010,10014]){state.send.mockRejectedValue(new ApiError('不能重放',409,code));const w=render();await open(w);await button(w,'提交').trigger('click');await flushPromises();expect(w.findAll('button').some(b=>b.text()==='提交')).toBe(false);expect(button(w,'核对原请求')).toBeDefined();w.unmount()}
 })
 it('接口直接403即使session仍可写也清空并收束旧写入口',async()=>{
  state.send.mockRejectedValue(new ApiError('权限已撤销',403));const w=render();await open(w);await button(w,'提交').trigger('click');await flushPromises()
  expect(state.allowed).toBe(true);expect(w.findAll('button').some(b=>b.text()==='更新云端属性')).toBe(false)
  expect(w.find('textarea').exists()).toBe(false);expect(w.findAll('button').some(b=>b.text()==='提交')).toBe(false)
  expect(state.send).toHaveBeenCalledTimes(1);expect(state.read).not.toHaveBeenCalled();w.unmount()
 })
 it('核对阶段403同样收束写入口，切换设备只建立全新上下文',async()=>{
  state.read.mockRejectedValue(new ApiError('成员权限已撤销',403));const w=render();await open(w);await button(w,'提交').trigger('click');await flushPromises()
  expect(w.find('textarea').exists()).toBe(false);expect(w.findAll('button').some(b=>b.text()==='更新云端属性')).toBe(false)
  await w.setProps({deviceId:project});await button(w,'更新云端属性').trigger('click');await flushPromises();expect(w.find('textarea').element.value).toBe('{}');expect(button(w,'提交').attributes('disabled')).toBeUndefined()
  expect(state.send).toHaveBeenCalledTimes(1);w.unmount()
 })
 it('成功HTTP缺少时区的坏回执保持未知，关闭重开也不能重发',async()=>{
  state.send.mockResolvedValue({...receipt(),acceptedAt:'2026-10-24T00:00:00'});const w=render();await open(w);await button(w,'提交').trigger('click');await flushPromises()
  expect(state.read).not.toHaveBeenCalled();expect(w.text()).toContain('本次操作不能再次提交');await button(w,'取消').trigger('click');await button(w,'更新云端属性').trigger('click');await flushPromises()
  expect(w.findAll('button').some(b=>b.text()==='提交')).toBe(false);expect(button(w,'核对原请求')).toBeDefined();expect(state.send).toHaveBeenCalledTimes(1);w.unmount()
 })
 it('已受理被后继上报取代后关闭旧意图，明确重开产生新key和空正文',async()=>{
  const reported=JSON.parse(new TextDecoder().decode(wire()));Object.assign(reported.values[0],{sourceKind:'DEVICE_REPORT',occurredAt:'2026-10-24T00:00:01Z',updatedAt:null,operationId:null,reportedRevision:'2',value:7})
  state.read.mockResolvedValue(new TextEncoder().encode(JSON.stringify(reported)));const w=render();await open(w);await button(w,'提交').trigger('click');await flushPromises()
  expect(w.text()).toContain('操作已受理');expect(button(w,'重新核对')).toBeDefined();const oldKey=state.send.mock.calls[0]![4]
  await button(w,'取消').trigger('click');await button(w,'更新云端属性').trigger('click');await flushPromises()
  expect(w.find('textarea').element.value).toBe('{}');expect(button(w,'提交').attributes('disabled')).toBeUndefined();expect(state.send).toHaveBeenCalledTimes(1)
  await w.find('textarea').setValue('{"n":8}');await button(w,'提交').trigger('click');await flushPromises()
  expect(state.send).toHaveBeenCalledTimes(2);expect(state.send.mock.calls[1]![4]).not.toBe(oldKey);expect(state.send.mock.calls[1]![3]).toContain('{"n":8}');w.unmount()
 })
 it('只读成员没有平台动作按钮，缺少模型不能打开编辑',async()=>{
  state.allowed=false;const read=render();expect(read.findAll('button')).toHaveLength(0);read.unmount();state.allowed=true;const w=render();await w.setProps({modelVersionId:undefined});expect(button(w,'更新云端属性').attributes('disabled')).toBeDefined();w.unmount()
 })
 it.each([['DOWNLINK','DOWNLINK','0'],['DOWNLINK','SHARED','false'],['CLOUD_UPDATE','CLOUD_PRIVATE','{"big":9007199254740993,"small":0.123456789012345678901}'],['CLOUD_UPDATE','CLOUD_PRIVATE','[null,9007199254740993]'],['CLOUD_UPDATE','CLOUD_PRIVATE','"quote\\\" and \\n"']] as const)('单属性%s/%s精确值%s只提交固定完整键一次',async(kind,accessType,raw)=>{
  state.send.mockResolvedValue(receipt(kind));state.read.mockResolvedValue(singleWire(raw,kind));const w=render(kind);const dataType=raw==='0'?'NUMBER':raw==='false'?'SWITCH':raw.startsWith('{')?'OBJECT':raw.startsWith('[')?'LIST':'TEXT';await startSingle(w,kind,{accessType,value:raw,dataType});if(dataType==='SWITCH')expect(w.get<HTMLInputElement>('input[type="radio"][value="false"]').element.checked).toBe(true);else if(dataType==='TEXT')expect(w.get<HTMLTextAreaElement>('textarea[aria-label="单属性文本值"]').element.value).toBe(JSON.parse(raw));else expect(w.get<HTMLInputElement|HTMLTextAreaElement>(dataType==='NUMBER'?'input[aria-label="单属性数值"]':'textarea').element.value).toBe(raw);expect(w.text()).toContain('target-level');expect(w.text()).toContain('冻结属性名称');await button(w,'提交').trigger('click');await flushPromises()
  expect(state.send).toHaveBeenCalledTimes(1);expect(state.send.mock.calls[0]!.slice(0,4)).toEqual([project,device,kind,`{"expectedModelVersionId":"${model}","properties":{"target-level":${raw}}}`]);expect(state.read).toHaveBeenCalledWith(project,device,model,['target-level'],expect.any(AbortSignal));expect(w.emitted('saved')).toHaveLength(1);w.unmount()
 })
 it('单属性不能注入第二键或null，普通全局仍默认空对象',async()=>{
  const w=render();await startSingle(w)
  for(const raw of ['1,"other":2','1,"target-level":2','null','{}{}','']){await w.get('input[aria-label="单属性数值"]').setValue(raw);await button(w,'提交').trigger('click');await flushPromises();expect(state.send).not.toHaveBeenCalled()}
  await button(w,'取消').trigger('click');await button(w,'更新云端属性').trigger('click');await flushPromises();expect(w.get('textarea').attributes('aria-label')).toBe('属性JSON');expect(w.get('textarea').element.value).toBe('{}');w.unmount()
 })
 it('结构化单属性身份/方向不匹配或不可写时不打开，原快照对象后改不改草稿',async()=>{
  const w=render();for(const bad of [{project:device},{device:project},{model:operation},{epoch:identityEpoch()-1},{accessType:'REPORT'},{accessType:'SHARED'},{key:'bad"key'}]){await startSingle(w,'CLOUD_UPDATE',bad);expect(w.find('textarea').exists()).toBe(false);expect(w.find('input[aria-label="单属性数值"]').exists()).toBe(false)}
  state.status.value='ARCHIVED';await startSingle(w);expect(w.find('textarea').exists()).toBe(false);expect(w.find('input[aria-label="单属性数值"]').exists()).toBe(false);state.status.value='ACTIVE';const snapshot=singleSnapshot();w.vm.startSingle(snapshot);snapshot.value='999';snapshot.name='后改名';await flushPromises();expect(w.get<HTMLInputElement>('input[aria-label="单属性数值"]').element.value).toBe('9007199254740993');expect(w.text()).not.toContain('后改名');w.unmount()
 })
 it('idle单属性刷新关闭，UNKNOWN刷新/模型变化/换行不替换原kind key与摘要',async()=>{
  const w=render();await startSingle(w);await w.setProps({draftRevision:1});await flushPromises();expect(w.findComponent({name:'ElDialog'}).props('modelValue')).toBe(false)
  state.send.mockRejectedValue(new ApiError('未知',0,undefined,undefined,true));state.lookup.mockResolvedValue(receipt());state.read.mockResolvedValue(singleWire('9007199254740993'));await startSingle(w);await button(w,'提交').trigger('click');await flushPromises();const sent=state.send.mock.calls[0]!
  await w.setProps({draftRevision:2,modelVersionId:operation,disabled:true,hideTrigger:true});await startSingle(w,'CLOUD_UPDATE',{key:'other',model:operation,value:'7'});await button(w,'取消').trigger('click');await button(w,'更新云端属性').trigger('click');await flushPromises();expect(w.get<HTMLInputElement>('input[aria-label="单属性数值"]').element.value).toBe('9007199254740993');await button(w,'核对原请求').trigger('click');await flushPromises()
  expect(state.send).toHaveBeenCalledTimes(1);expect(state.lookup.mock.calls[0]!.slice(0,5)).toEqual([project,device,model,'CLOUD_UPDATE',sent[4]]);expect(w.emitted('saved')).toHaveLength(1);w.unmount()
 })
 it('单属性accepted核对失败在刷新后保原件及父锁，显式关闭才结束',async()=>{
  state.read.mockRejectedValue(new Error('当前读取失败'));const w=render();await startSingle(w);await button(w,'提交').trigger('click');await flushPromises();await w.setProps({draftRevision:1,modelVersionId:operation});expect(w.emitted('busy')?.at(-1)).toEqual([true]);await startSingle(w,'CLOUD_UPDATE',{key:'other',model:operation});expect(w.get<HTMLInputElement>('input[aria-label="单属性数值"]').element.value).toBe('9007199254740993');expect(button(w,'重新核对')).toBeDefined();await button(w,'取消').trigger('click');await flushPromises();expect(w.emitted('busy')?.at(-1)).toEqual([false]);expect(state.send).toHaveBeenCalledTimes(1);w.unmount()
 })
 it('单属性摘要在途刷新不丢原件，身份变化后的迟到写回执不污染',async()=>{
  let resolve!:(v:ReturnType<typeof receipt>)=>void;state.send.mockReturnValue(new Promise(r=>{resolve=r}));const w=render();await startSingle(w);await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(state.send).toHaveBeenCalledTimes(1));await w.setProps({draftRevision:5,modelVersionId:operation});expect(w.emitted('busy')?.at(-1)).toEqual([true]);changeIdentity();await flushPromises();resolve(receipt());await flushPromises();expect(w.emitted('saved')).toBeUndefined();expect(state.read).not.toHaveBeenCalled();expect(w.emitted('busy')?.at(-1)).toEqual([false]);w.unmount()
 })

 it('SWITCH false使用明确二值草稿，选择和取消均不提交',async()=>{
  const w=render();await startSingle(w,'CLOUD_UPDATE',{dataType:'SWITCH',value:'false'})
  expect(w.find('textarea').exists()).toBe(false)
  expect(w.get<HTMLInputElement>('input[type="radio"][value="false"]').element.checked).toBe(true)
  await w.get('input[type="radio"][value="true"]').setValue(true);expect(state.send).not.toHaveBeenCalled()
  await button(w,'取消').trigger('click');expect(state.send).not.toHaveBeenCalled();w.unmount()
 })
 it('三编码单属性发送真实Number和Text原值，未知保原键和原JSON不转布尔',async()=>{
  for(const [encoding,initial,next] of [['NUMBER','1.0','0'],['TEXT','"ON"','"OFF"']] as const){
   state.send.mockClear();state.read.mockResolvedValue(singleWire(next));const w=render();await startSingle(w,'CLOUD_UPDATE',{dataType:'SWITCH',switchEncoding:encoding,value:initial})
   expect(w.findAll<HTMLInputElement>('input[type="radio"]').filter(r=>r.element.checked)).toHaveLength(1);const off=w.findAll<HTMLInputElement>('input[type="radio"]').find(r=>r.element.value===next)!;await off.setValue(true);await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(w.emitted('saved')).toHaveLength(1));expect(state.send.mock.calls[0]![3]).toContain(`"target-level":${next}`);w.unmount()
  }
  state.send.mockClear();state.send.mockRejectedValue(new ApiError('未知',0,undefined,undefined,true));const w=render();await startSingle(w,'CLOUD_UPDATE',{dataType:'SWITCH',switchEncoding:'NUMBER',value:'1.0'});await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(state.send).toHaveBeenCalledTimes(1));const sent=state.send.mock.calls[0]!;expect(sent[3]).toContain('"target-level":1.0');await w.setProps({modelVersionId:operation,draftRevision:2});expect(w.emitted('busy')?.at(-1)).toEqual([true]);expect(state.send).toHaveBeenCalledTimes(1);w.unmount()
 })

 it.each([['DOWNLINK','false','true'],['CLOUD_UPDATE','true','false']] as const)('SWITCH %s选择%s到%s只提交精确布尔单键',async(kind,initial,next)=>{
  state.send.mockResolvedValue(receipt(kind));state.read.mockResolvedValue(singleWire(next,kind));const w=render(kind);await startSingle(w,kind,{dataType:'SWITCH',value:initial})
  await w.get(`input[type="radio"][value="${next}"]`).setValue(true);expect(state.send).not.toHaveBeenCalled()
  await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(w.emitted('saved')).toHaveLength(1))
  expect(state.send).toHaveBeenCalledTimes(1);expect(state.send.mock.calls[0]![3]).toBe(`{"expectedModelVersionId":"${model}","properties":{"target-level":${next}}}`);w.unmount()
 })
 it.each(['0','1','"false"',''])('SWITCH坏当前值%s不默认false，明确选择后才允许提交',async raw=>{
  state.read.mockResolvedValue(singleWire('false'));const w=render();await startSingle(w,'CLOUD_UPDATE',{dataType:'SWITCH',value:raw})
  expect(w.findAll<HTMLInputElement>('input[type="radio"]').some(r=>r.element.checked)).toBe(false);expect(w.text()).toContain('当前值不符合布尔类型');expect(button(w,'提交').attributes('disabled')).toBeDefined()
  await button(w,'提交').trigger('click');expect(state.send).not.toHaveBeenCalled();await w.get('input[type="radio"][value="false"]').setValue(true);await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(w.emitted('saved')).toHaveLength(1));expect(state.send.mock.calls[0]![3]).toContain('"target-level":false');w.unmount()
 })
 it.each([['NUMBER','0'],['BOOLEAN','false']])('NUMBER保数值词法及未知类型%s保JSON输入',async(dataType,value)=>{
  const w=render();await startSingle(w,'CLOUD_UPDATE',{dataType,value});expect(w.get<HTMLInputElement|HTMLTextAreaElement>(dataType==='NUMBER'?'input[aria-label="单属性数值"]':'textarea').element.value).toBe(value);expect(w.find('input[type="radio"]').exists()).toBe(false);w.unmount()
 })
 it('SWITCH UNKNOWN跨刷新模型变更保原false与原键摘要，只GET恢复',async()=>{
  state.send.mockRejectedValue(new ApiError('未知',0,undefined,undefined,true));state.lookup.mockResolvedValue(receipt());state.read.mockResolvedValue(singleWire('false'));const w=render();await startSingle(w,'CLOUD_UPDATE',{dataType:'SWITCH',value:'false'})
  await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(w.text()).toContain('本次操作不能再次提交'));const sent=state.send.mock.calls[0]!
  await w.setProps({draftRevision:1,modelVersionId:operation,hideTrigger:true,disabled:true});await button(w,'取消').trigger('click');await button(w,'更新云端属性').trigger('click');await flushPromises()
  expect(w.get<HTMLInputElement>('input[type="radio"][value="false"]').element.checked).toBe(true);expect(w.findAll<HTMLInputElement>('input[type="radio"]').every(r=>r.element.disabled)).toBe(true)
  await button(w,'核对原请求').trigger('click');await vi.waitFor(()=>expect(w.emitted('saved')).toHaveLength(1));expect(state.send).toHaveBeenCalledTimes(1);expect(state.lookup.mock.calls[0]!.slice(0,5)).toEqual([project,device,model,'CLOUD_UPDATE',sent[4]])
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sent[3]));expect(state.lookup.mock.calls[0]![5]).toBe(Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join(''));w.unmount()
 })

 it.each(['DOWNLINK','CLOUD_UPDATE'] as const)('ENUM %s真实点击字符串选项不自动提交，显式提交单键精确正文',async kind=>{
  const chosen='引号"反斜线\\中文',raw=JSON.stringify(chosen);state.send.mockResolvedValue(receipt(kind));state.read.mockResolvedValue(singleWire(raw,kind));const w=render(kind)
  try{await startSingle(w,kind,{dataType:'ENUM',value:'"0"',enumOptions:['0','false',chosen]})
   await w.get('.el-select__wrapper').trigger('click');await flushPromises()
   const option=Array.from(document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')).find(item=>item.textContent===chosen);expect(option).toBeDefined();option!.click();await flushPromises()
   expect(w.findComponent({name:'ElSelect'}).props('modelValue')).toBe(chosen);expect(state.send).not.toHaveBeenCalled()
   await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(w.emitted('saved')).toHaveLength(1))
   expect(state.send).toHaveBeenCalledTimes(1);expect(state.send.mock.calls[0]![3]).toBe(`{"expectedModelVersionId":"${model}","properties":{"target-level":${raw}}}`)
  }finally{w.unmount()}
 })
 it.each(['0','false','null','{}','"missing"',''])('ENUM坏当前值%s不默认首项且只能显式选择字符串',async value=>{
  const w=render();try{await startSingle(w,'CLOUD_UPDATE',{dataType:'ENUM',value,enumOptions:['0','false']})
   expect(w.findComponent({name:'ElSelect'}).props('modelValue')).toBeUndefined();expect(button(w,'提交').attributes('disabled')).toBeDefined();expect(w.text()).toContain('当前值不属于冻结枚举候选')
   await button(w,'提交').trigger('click');expect(state.send).not.toHaveBeenCalled()
   await w.get('.el-select__wrapper').trigger('click');await flushPromises();const option=Array.from(document.querySelectorAll<HTMLElement>('.el-select-dropdown__item')).find(item=>item.textContent==='0');expect(option).toBeDefined();option!.click();await flushPromises()
   expect(w.findComponent({name:'ElSelect'}).props('modelValue')).toBe('0');expect(button(w,'提交').attributes('disabled')).toBeUndefined();expect(state.send).not.toHaveBeenCalled()
   await button(w,'取消').trigger('click');expect(state.send).not.toHaveBeenCalled()
  }finally{w.unmount()}
 })
 it.each(['DOWNLINK','CLOUD_UPDATE'] as const)('ENUM %s UNKNOWN保冻结候选及原键摘要，刷新和模型变化只可原GET恢复',async kind=>{
  state.send.mockRejectedValue(new ApiError('未知',0,undefined,undefined,true));state.lookup.mockResolvedValue(receipt(kind));state.read.mockResolvedValue(singleWire('"0"',kind));const w=render(kind),options=['0','false']
  try{await startSingle(w,kind,{dataType:'ENUM',value:'"0"',enumOptions:options});options[0]='changed'
   expect(w.findAllComponents({name:'ElOption'}).map(option=>option.props('value'))).toEqual(['0','false'])
   await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(state.send).toHaveBeenCalledTimes(1));await flushPromises();const sent=state.send.mock.calls[0]!
   await w.setProps({draftRevision:1,modelVersionId:operation,hideTrigger:true,disabled:true});await startSingle(w,kind,{dataType:'ENUM',value:'"new"',enumOptions:['new'],model:operation});await button(w,'取消').trigger('click');await button(w,kind==='DOWNLINK'?'下发属性':'更新云端属性').trigger('click');await flushPromises()
   expect(w.findComponent({name:'ElSelect'}).props()).toMatchObject({modelValue:'0',disabled:true});expect(w.emitted('busy')?.at(-1)).toEqual([true]);expect(state.lookup).not.toHaveBeenCalled();expect(state.send).toHaveBeenCalledTimes(1)
   await button(w,'核对原请求').trigger('click');await vi.waitFor(()=>expect(w.emitted('saved')).toHaveLength(1));expect(state.lookup.mock.calls[0]!.slice(0,5)).toEqual([project,device,model,kind,sent[4]])
   const hash=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(sent[3]));expect(state.lookup.mock.calls[0]![5]).toBe(Buffer.from(hash).toString('hex'));expect(state.send).toHaveBeenCalledTimes(1)
  }finally{w.unmount()}
 })
 it('ENUM坏候选只禁typed草稿，不回退可随意输入的JSON框',async()=>{
  const w=render();try{await startSingle(w,'CLOUD_UPDATE',{dataType:'ENUM',value:'"0"',enumOptions:['0',0]});expect(w.text()).toContain('冻结枚举定义不可用');expect(w.find('textarea').exists()).toBe(false);expect(w.findComponent({name:'ElSelect'}).props('disabled')).toBe(true);expect(button(w,'提交').attributes('disabled')).toBeDefined();await button(w,'提交').trigger('click');expect(state.send).not.toHaveBeenCalled()}finally{w.unmount()}
 })
 it('冻结ENUM主键优先且仅缺字段回退旧enumOptions，不修剪或共用数组引用',()=>{
  const original=[' 0 ','false','😀'];const copied=frozenEnumOptions({enum:original,enumOptions:['legacy']});expect(copied).toEqual(original);expect(copied).not.toBe(original);expect(Object.isFrozen(copied)).toBe(true);original[0]='later';expect(copied?.[0]).toBe(' 0 ')
  expect(frozenEnumOptions({enumOptions:['legacy']})).toEqual(['legacy']);expect(frozenEnumOptions({enum:null,enumOptions:['legacy']})).toBeUndefined();expect(frozenEnumOptions({enum:undefined,enumOptions:['legacy']})).toBeUndefined()
  expect(enumDraftValue('"0"',['0'])).toBe('0');expect(enumDraftValue('0',['0'])).toBeUndefined();expect(enumDraftValue('"false"',['false'])).toBe('false');expect(enumDraftValue('false',['false'])).toBeUndefined();expect(enumDraftValue('"\\u0030"',['0'])).toBe('0');expect(enumDraftValue('" 0 "',['0'])).toBeUndefined()
 })
 it.each([null,[],[''],[' '],['a','a'],['a',0],['a'.repeat(65)],['\ud800'],Array.from({length:101},(_,i)=>String(i))].map(value=>({value})))('冻结ENUM坏候选$value不被过滤或转换为合法子集',({value})=>{expect(copyEnumOptions(value)).toBeUndefined()})
 it('冻结ENUM明确接受100候选和64码元边界',()=>{expect(copyEnumOptions(Array.from({length:100},(_,i)=>String(i)))).toHaveLength(100);expect(copyEnumOptions(['a'.repeat(64)])).toEqual(['a'.repeat(64)])})

})

it('原生DailyTimer云JSON值原样提交回读，坏值与重复键拒绝且取消零写',async()=>{
 vi.stubGlobal('crypto',webcrypto);vi.clearAllMocks();state.allowed=true;state.status.value='ACTIVE';state.send.mockResolvedValue(receipt())
 const timer='{"enable":true,"time":"09:30:00","repeat":"12345","timezone":"Asia/Shanghai"}',w=render()
 state.read.mockResolvedValue(singleWire(timer))
 try{
  await startSingle(w,'CLOUD_UPDATE',{dataType:'DAILY_TIMER',value:timer});expect(w.find('textarea').element.value).toBe(timer)
  for(const bad of ['{"enable":true,"time":"24:00:00","repeat":"1"}','{"enable":true,"time":"09:00:00","repeat":"11"}','{"enable":null,"time":"09:00:00","repeat":"1"}','{"enable":true,"enable":false,"time":"09:00:00","repeat":"1"}']){await w.find('textarea').setValue(bad);await button(w,'提交').trigger('click');await flushPromises();expect(state.send).not.toHaveBeenCalled()}
  await w.find('textarea').setValue(timer);await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(state.send).toHaveBeenCalledTimes(1));await flushPromises();expect(JSON.stringify(state.send.mock.calls[0])).toContain('09:30:00');expect(state.read).toHaveBeenCalledTimes(1)
  await button(w,'取消').trigger('click');await startSingle(w,'CLOUD_UPDATE',{dataType:'DAILY_TIMER',value:timer});await w.find('textarea').setValue('{"enable":false,"time":"00:00:00","repeat":""}');await button(w,'取消').trigger('click');expect(state.send).toHaveBeenCalledTimes(1)
  const list='{"timers":[{"enable":true,"time":"10:30:00","repeat":"12345"},{"enable":false,"time":"09:00:00","repeat":"6"}],"timezone":"Asia/Shanghai"}'
  expect(dailyTimerListValue(parseDashboardRuntimeResponse(new TextEncoder().encode('{"v":{"timers":[]}}')).v)).toBe(true)
  await startSingle(w,'CLOUD_UPDATE',{dataType:'DAILY_TIMER_LIST',value:list});expect(w.find('textarea').element.value).toBe(list)
  for(const bad of ['{"timers":[{"enable":true,"time":"09:00:00","repeat":"1"},{"enable":false,"time":"09:00:00","repeat":"1"}]}','{"timers":[{"enable":true,"time":"09:00:00","repeat":"1","timezone":"UTC"}]}',JSON.stringify({timers:Array.from({length:51},()=>({enable:true,time:'09:00:00',repeat:'1'}))}),' {"timers":[],"timezone":null}']){await w.find('textarea').setValue(bad);await button(w,'提交').trigger('click');await flushPromises();expect(state.send).toHaveBeenCalledTimes(1)}
  state.read.mockResolvedValue(singleWire(list));await w.find('textarea').setValue(list);await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(state.send).toHaveBeenCalledTimes(2));await flushPromises();expect(state.read).toHaveBeenCalledTimes(2);expect(JSON.stringify(state.send.mock.calls[1])).toContain('10:30:00')
  const range='{"enable":true,"start_time":"08:00:00","end_time":"12:00:00","repeat":"12345"}'
  expect(dailyTimerRangeValue(parseDashboardRuntimeResponse(new TextEncoder().encode('{"v":{"enable":false,"start_time":"08:00:00","end_time":"12:00:00","repeat":""}}')).v)).toBe(true)
  await button(w,'取消').trigger('click');await startSingle(w,'CLOUD_UPDATE',{dataType:'DAILY_TIMER_RANGE',value:range});expect(w.find('textarea').element.value).toBe(range)
  for(const bad of ['{"enable":true,"start_time":"12:00:00","end_time":"12:00:00","repeat":"1"}','{"enable":true,"start_time":"18:00:00","end_time":"06:00:00","repeat":"1"}','{"enable":true,"start_time":"08:00:00","end_time":"12:00:00","repeat":"1","time":"08:00:00"}']){await w.find('textarea').setValue(bad);await button(w,'提交').trigger('click');await flushPromises();expect(state.send).toHaveBeenCalledTimes(2)}
  state.read.mockResolvedValue(singleWire(range));await w.find('textarea').setValue(range);await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(state.send).toHaveBeenCalledTimes(3));await flushPromises();expect(state.read).toHaveBeenCalledTimes(3);expect(JSON.stringify(state.send.mock.calls[2])).toContain('start_time')
  const rangeList='{"timers":[{"enable":true,"start_time":"08:00:00","end_time":"09:00:00","repeat":""},{"enable":true,"start_time":"08:00:00","end_time":"10:00:00","repeat":""},{"enable":true,"start_time":"12:00:00","end_time":"13:00:00","repeat":"0123456"}]}',parsedRangeList=parseDashboardRuntimeResponse(new TextEncoder().encode(`{"v":${rangeList}}`)).v!
  expect(dailyTimerRangeListValue(parsedRangeList)).toBe(true);expect(dailyTimerRangeListValue(parseDashboardRuntimeResponse(new TextEncoder().encode(`{"v":${rangeList.slice(0,-1)},"timezone":"UTC"}}`)).v)).toBe(true);expect(dailyTimerRangeListValue(parseDashboardRuntimeResponse(new TextEncoder().encode('{"v":{"timers":[]}}')).v)).toBe(true)
  const fifty=Array.from({length:50},()=>({enable:false,start_time:'08:00:00',end_time:'09:00:00',repeat:''}));expect(dailyTimerRangeListValue(parseDashboardRuntimeResponse(new TextEncoder().encode(JSON.stringify({v:{timers:fifty}}))).v)).toBe(true)
  const distinctDays={timers:[{enable:true,start_time:'08:00:00',end_time:'10:00:00',repeat:'1'},{enable:false,start_time:'10:00:00',end_time:'12:00:00',repeat:'2'}]};expect(dailyTimerRangeListValue(parseDashboardRuntimeResponse(new TextEncoder().encode(JSON.stringify({v:distinctDays}))).v)).toBe(true)
  await button(w,'取消').trigger('click');await startSingle(w,'CLOUD_UPDATE',{dataType:'DAILY_TIMER_RANGE_LIST',value:rangeList});expect(w.find('textarea').element.value).toBe(rangeList)
  for(const bad of [JSON.stringify({...distinctDays,timers:distinctDays.timers.map(item=>({...item,repeat:'1'}))}),JSON.stringify({timers:[{enable:false,start_time:'18:00:00',end_time:'06:00:00',repeat:''}]}),JSON.stringify({timers:[{enable:true,start_time:'08:00:00',end_time:'09:00:00',repeat:'1',timezone:'UTC'}]}),JSON.stringify({timers:[...fifty,fifty[0]]}),'{"timers":[],"timezone":null}',rangeList.replace('"enable":true','"enable":true,"enable":false')]){await w.find('textarea').setValue(bad);await button(w,'提交').trigger('click');await flushPromises();expect(state.send).toHaveBeenCalledTimes(3)}
  state.read.mockResolvedValue(singleWire(rangeList));await w.find('textarea').setValue(rangeList);await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(state.send).toHaveBeenCalledTimes(4));await flushPromises();expect(state.read).toHaveBeenCalledTimes(4);expect(w.find('textarea').element.value).toBe(rangeList);expect(JSON.parse(state.send.mock.calls[3]![3]).properties['target-level']).toEqual(JSON.parse(rangeList));expect(JSON.parse(state.send.mock.calls[3]![3]).properties['target-level']).not.toHaveProperty('timezone')
  const history={items:[{deviceId:device,propertyKey:'ranges',ts:'2026-11-03T00:00:00Z',value:JSON.parse(rangeList),dataType:'DAILY_TIMER_RANGE_LIST',thingModelVersionId:model,modelVersion:'1.0.0',quality:0}],hasMore:false,nextCursor:null},decoded=decodePropertyPage(new TextEncoder().encode(JSON.stringify(history)),device);expect(decoded.items[0]!.valueText).toContain('08:00:00');expect(decoded.items[0]!.valueText).toContain('12:00:00');expect(decoded.items[0]!.dataType).toBe('DAILY_TIMER_RANGE_LIST')
  await button(w,'取消').trigger('click');await startSingle(w,'CLOUD_UPDATE',{dataType:'DAILY_TIMER_RANGE_LIST',value:rangeList});await w.find('textarea').setValue('{"timers":[]}');await button(w,'取消').trigger('click');expect(state.send).toHaveBeenCalledTimes(4)

  const strictValue=(text:string)=>parseDashboardRuntimeResponse(new TextEncoder().encode(`{"v":${text}}`)).v
  const duration='{"enable":true,"start_time":"08:00:00","duration":3600,"repeat":"12345"}'
  expect(dailyTimerDurationValue(strictValue(duration))).toBe(true);expect(dailyTimerDurationValue(strictValue(duration.replace('"enable":true','"enable":false').replace('"12345"','""')))).toBe(true);expect(dailyTimerDurationValue(JSON.parse(duration))).toBe(false)
  await startSingle(w,'CLOUD_UPDATE',{dataType:'DAILY_TIMER_DURATION',value:duration});expect(w.find('textarea').element.value).toBe(duration)
  for(const bad of ['0','-1','1.0','1e3','1e1000000','"3600"','null','86400']){await w.find('textarea').setValue(duration.replace('3600',bad));await button(w,'提交').trigger('click');await flushPromises();expect(state.send).toHaveBeenCalledTimes(4)}
  for(const bad of [duration.replace('08:00:00','23:00:00'),duration.replace('"duration":3600','"duration":3600,"duration":1'),duration.replace('"repeat":"12345"','"repeat":"12345","time":"08:00:00"')]){await w.find('textarea').setValue(bad);await button(w,'提交').trigger('click');await flushPromises();expect(state.send).toHaveBeenCalledTimes(4)}
  state.read.mockResolvedValue(singleWire(duration));await w.find('textarea').setValue(duration);await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(state.send).toHaveBeenCalledTimes(5));await flushPromises();expect(state.read).toHaveBeenCalledTimes(5);expect(JSON.parse(state.send.mock.calls[4]![3]).properties['target-level']).toEqual(JSON.parse(duration));expect(JSON.parse(state.send.mock.calls[4]![3]).properties['target-level']).not.toHaveProperty('timezone')
  const durations='{"timers":[{"enable":true,"start_time":"08:00:00","duration":3600,"repeat":""},{"enable":true,"start_time":"08:30:00","duration":1800,"repeat":""},{"enable":true,"start_time":"12:00:00","duration":3600,"repeat":"0123456"}]}'
  expect(dailyTimerDurationListValue(strictValue(durations))).toBe(true);expect(dailyTimerDurationListValue(strictValue('{"timers":[]}'))).toBe(true);expect(dailyTimerDurationListValue(strictValue(durations.slice(0,-1)+',"timezone":"UTC"}'))).toBe(true)
  const fiftyDurations=Array.from({length:50},(_,n)=>({enable:false,start_time:`00:00:${String(n).padStart(2,'0')}`,duration:1,repeat:''}));expect(dailyTimerDurationListValue(strictValue(JSON.stringify({timers:fiftyDurations})))).toBe(true)
  const separateDays={timers:[{enable:true,start_time:'08:00:00',duration:3600,repeat:'1'},{enable:false,start_time:'09:00:00',duration:3600,repeat:'2'}]};expect(dailyTimerDurationListValue(strictValue(JSON.stringify(separateDays)))).toBe(true)
  await button(w,'取消').trigger('click');await startSingle(w,'CLOUD_UPDATE',{dataType:'DAILY_TIMER_DURATION_LIST',value:durations});expect(w.find('textarea').element.value).toBe(durations)
  for(const bad of [JSON.stringify({timers:[fiftyDurations[0],{...fiftyDurations[0],enable:true}]}),JSON.stringify({...separateDays,timers:separateDays.timers.map(item=>({...item,repeat:'1'}))}),JSON.stringify({timers:[...fiftyDurations,{...fiftyDurations[0],start_time:'00:01:00'}]}),JSON.stringify({timers:[{...fiftyDurations[0],timezone:'UTC'}]}),'{"timers":[],"timezone":null}',durations.replace('"duration":3600','"duration":3600.0')]){await w.find('textarea').setValue(bad);await button(w,'提交').trigger('click');await flushPromises();expect(state.send).toHaveBeenCalledTimes(5)}
  state.read.mockResolvedValue(singleWire(durations));await w.find('textarea').setValue(durations);await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(state.send).toHaveBeenCalledTimes(6));await flushPromises();expect(state.read).toHaveBeenCalledTimes(6);expect(JSON.parse(state.send.mock.calls[5]![3]).properties['target-level']).toEqual(JSON.parse(durations));expect(w.find('textarea').element.value).toBe(durations)
  for(const [dataType,value] of [['DAILY_TIMER_DURATION',duration],['DAILY_TIMER_DURATION_LIST',durations]]){const page={...history,items:[{...history.items[0]!,value:JSON.parse(value!),dataType}]},result=decodePropertyPage(new TextEncoder().encode(JSON.stringify(page)),device);expect(result.items[0]!.dataType).toBe(dataType);expect(result.items[0]!.valueText).toContain('3600')}
  await button(w,'取消').trigger('click');await startSingle(w,'CLOUD_UPDATE',{dataType:'DAILY_TIMER_DURATION_LIST',value:durations});await w.find('textarea').setValue('{"timers":[]}');await button(w,'取消').trigger('click');expect(state.send).toHaveBeenCalledTimes(6)

  const interval='{"enable":true,"from_time":"08:00:00","to_time":"10:00:00","duration":3600,"interval":1,"repeat":"12345"}'
  // C=D+I，末START<=to而END可越to；第一段等于窗口右端同样合法，不预展开。
  expect(dailyTimerIntervalValue(strictValue(interval))).toBe(true);expect(dailyTimerIntervalValue(strictValue(interval.replace('10:00:00','09:00:00')))).toBe(true);expect(dailyTimerIntervalValue(strictValue(interval.replace('3600','600').replace('"interval":1','"interval":600')))).toBe(true);expect(dailyTimerIntervalValue(JSON.parse(interval))).toBe(false);expect(dailyTimerIntervalValue(strictValue('{"enable":true,"from_time":"23:59:57","to_time":"23:59:59","duration":1,"interval":1,"repeat":"1"}'))).toBe(true)
  await startSingle(w,'CLOUD_UPDATE',{dataType:'DAILY_TIMER_INTERVAL',value:interval});expect(w.find('textarea').element.value).toBe(interval)
  for(const field of ['duration','interval'])for(const bad of ['0','-1','1.0','1e3','1e1000000','"1"','null','86400']){await w.find('textarea').setValue(interval.replace(new RegExp(`"${field}":\\d+`),`"${field}":${bad}`));await button(w,'提交').trigger('click');await flushPromises();expect(state.send).toHaveBeenCalledTimes(6)}
  for(const bad of [interval.replace('08:00:00','10:00:00'),interval.replace('"duration":3600','"duration":7201'),'{"enable":false,"from_time":"23:59:55","to_time":"23:59:59","duration":3,"interval":1,"repeat":""}',interval.replace('"interval":1','"interval":1,"interval":2'),interval.replace('"repeat":"12345"','"repeat":"12345","time":"08:00:00"')]){await w.find('textarea').setValue(bad);await button(w,'提交').trigger('click');await flushPromises();expect(state.send).toHaveBeenCalledTimes(6)}
  state.read.mockResolvedValue(singleWire(interval));await w.find('textarea').setValue(interval);await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(state.send).toHaveBeenCalledTimes(7));await flushPromises();expect(state.read).toHaveBeenCalledTimes(7);expect(JSON.parse(state.send.mock.calls[6]![3]).properties['target-level']).toEqual(JSON.parse(interval));expect(JSON.parse(state.send.mock.calls[6]![3]).properties['target-level']).not.toHaveProperty('timezone')
  const intervals='{"timers":[{"enable":true,"from_time":"08:00:00","to_time":"10:00:00","duration":3600,"interval":1,"repeat":""},{"enable":false,"from_time":"08:30:00","to_time":"10:30:00","duration":1800,"interval":60,"repeat":""},{"enable":true,"from_time":"12:00:00","to_time":"13:00:00","duration":600,"interval":600,"repeat":"0123456"}]}'
  expect(dailyTimerIntervalListValue(strictValue(intervals))).toBe(true);expect(dailyTimerIntervalListValue(strictValue('{"timers":[]}'))).toBe(true);expect(dailyTimerIntervalListValue(strictValue(intervals.slice(0,-1)+',"timezone":"UTC"}'))).toBe(true)
  const fiftyIntervals=Array.from({length:50},(_,n)=>({enable:false,from_time:`00:00:${String(n).padStart(2,'0')}`,to_time:`00:01:${String(n).padStart(2,'0')}`,duration:1,interval:1,repeat:''}));expect(dailyTimerIntervalListValue(strictValue(JSON.stringify({timers:fiftyIntervals})))).toBe(true)
  const distinctWindows={timers:[{enable:true,from_time:'08:00:00',to_time:'09:00:00',duration:600,interval:600,repeat:'1'},{enable:false,from_time:'09:00:00',to_time:'10:00:00',duration:600,interval:600,repeat:'2'}]};expect(dailyTimerIntervalListValue(strictValue(JSON.stringify(distinctWindows)))).toBe(true)
  await button(w,'取消').trigger('click');await startSingle(w,'CLOUD_UPDATE',{dataType:'DAILY_TIMER_INTERVAL_LIST',value:intervals});expect(w.find('textarea').element.value).toBe(intervals)
  for(const bad of [JSON.stringify({timers:[fiftyIntervals[0],{...fiftyIntervals[0],enable:true}]}),JSON.stringify({...distinctWindows,timers:distinctWindows.timers.map(item=>({...item,repeat:'1'}))}),JSON.stringify({timers:[...fiftyIntervals,{...fiftyIntervals[0],from_time:'01:00:00',to_time:'01:01:00'}]}),JSON.stringify({timers:[{...fiftyIntervals[0],timezone:'UTC'}]}),'{"timers":[],"timezone":null}',intervals.replace('"interval":1','"interval":1e0')]){await w.find('textarea').setValue(bad);await button(w,'提交').trigger('click');await flushPromises();expect(state.send).toHaveBeenCalledTimes(7)}
  state.read.mockResolvedValue(singleWire(intervals));await w.find('textarea').setValue(intervals);await button(w,'提交').trigger('click');await vi.waitFor(()=>expect(state.send).toHaveBeenCalledTimes(8));await flushPromises();expect(state.read).toHaveBeenCalledTimes(8);expect(JSON.parse(state.send.mock.calls[7]![3]).properties['target-level']).toEqual(JSON.parse(intervals));expect(w.find('textarea').element.value).toBe(intervals)
  for(const [dataType,value] of [['DAILY_TIMER_INTERVAL',interval],['DAILY_TIMER_INTERVAL_LIST',intervals]]){const page={...history,items:[{...history.items[0]!,value:JSON.parse(value!),dataType}]},result=decodePropertyPage(new TextEncoder().encode(JSON.stringify(page)),device);expect(result.items[0]!.dataType).toBe(dataType);expect(result.items[0]!.valueText).toContain('08:00:00')}
  await button(w,'取消').trigger('click');await startSingle(w,'CLOUD_UPDATE',{dataType:'DAILY_TIMER_INTERVAL_LIST',value:intervals});await w.find('textarea').setValue('{"timers":[]}');await button(w,'取消').trigger('click');expect(state.send).toHaveBeenCalledTimes(8)

 }finally{w.unmount();vi.unstubAllGlobals()}
})
