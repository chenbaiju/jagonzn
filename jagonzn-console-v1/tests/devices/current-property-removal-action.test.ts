import {webcrypto,createHash} from 'node:crypto'
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {mount,flushPromises} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Action from '../../src/features/devices/CurrentPropertyRemovalAction.vue'
import {ApiError} from '../../src/core/http'
const state=vi.hoisted(()=>({api:vi.fn(),control:true,status:null as any}))
vi.mock('../../src/core/session',async()=>{const{ref,computed}=await import('vue');state.status=ref('ACTIVE');return{currentProject:computed(()=>({status:state.status.value})),projectId:ref('project'),can:()=>state.control}})
vi.mock('../../src/core/http',async()=>({...await vi.importActual('../../src/core/http'),api:state.api}))
vi.mock('../../src/features/devices/api',()=>({devicePath:(p:string,d:string)=>`/api/v1/projects/${p}/devices/${d}`}))
const model='00000000-0000-4000-8000-000000000001',operation='00000000-0000-4000-8000-000000000002'
function receipt(keys=['n','other']){return new TextEncoder().encode(JSON.stringify({operationId:operation,projectId:'project',deviceId:'device',modelVersionId:model,removedAt:'2026-10-24T00:00:00Z',observations:keys.map(propertyKey=>({propertyKey,reportedRevision:'1',removedPlatformOperationId:null,reportedValueRemoved:true}))}))}
function empty(keys=['n','other']){return new TextEncoder().encode(JSON.stringify({projectId:'project',deviceId:'device',modelVersionId:model,values:keys.map(propertyKey=>({propertyKey,state:'NO_VALUE',sourceKind:null,value:null,modelVersionId:null,occurredAt:null,updatedAt:null,operationId:null,reportedRevision:null}))}))}
function render(){return mount(Action,{props:{deviceId:'device',modelVersionId:model,keys:['n','other']},attachTo:document.body,global:{plugins:[ElementPlus]}})}
function button(w:ReturnType<typeof render>,label:string){return w.findAll('button').find(b=>b.text()===label)!}
async function start(w:ReturnType<typeof render>){await button(w,'移除属性').trigger('click');await flushPromises();expect(w.text()).toContain('确认删除选中的属性吗？')}
function posts(){return state.api.mock.calls.filter(([,o])=>o.method==='post')}
describe('批量移除真实ElementPlus意图与核对',()=>{
 it.each([401,403])('原件GET%s清私有状态并解除父锁，不再核对当前值',async status=>{
  state.api.mockImplementation((_p:string,o:any)=>Promise.reject(new ApiError('失权',o.method==='post'?0:status,undefined,undefined,o.method==='post')));const w=render();await start(w);await button(w,'确认').trigger('click');await flushPromises();await vi.waitFor(()=>expect(button(w,'核对原请求')).toBeDefined());await button(w,'核对原请求').trigger('click');await flushPromises();expect(w.findAll('button').some(b=>b.text()==='移除属性')).toBe(false);expect(w.emitted('busy')?.at(-1)).toEqual([false]);expect(posts()).toHaveLength(1);expect(state.api).toHaveBeenCalledTimes(2);w.unmount()
 })
 it('切设备abort原GET，迟到原回执不刷新新设备',async()=>{
  let resolve!:(value:Uint8Array)=>void;state.api.mockImplementation((_p:string,o:any)=>o.method==='post'?Promise.reject(new ApiError('未知',0,undefined,undefined,true)):new Promise(r=>{resolve=r}));const w=render();await start(w);await button(w,'确认').trigger('click');await flushPromises();await vi.waitFor(()=>expect(button(w,'核对原请求')).toBeDefined());await button(w,'核对原请求').trigger('click');await flushPromises();const signal=state.api.mock.calls.at(-1)![1].signal as AbortSignal;await w.setProps({deviceId:'new-device'});expect(signal.aborted).toBe(true);resolve(receipt());await flushPromises();expect(w.emitted('saved')).toBeUndefined();expect(posts()).toHaveLength(1);expect(state.api).toHaveBeenCalledTimes(2);w.unmount()
 })
 it('未知删除只读原键及实际正文摘要，404不读当前空值，原受理后才核对',async()=>{
  let found=false;state.api.mockImplementation((path:string,o:any)=>o.method==='post'?Promise.reject(new ApiError('未知',0,undefined,undefined,true)):path.endsWith('/removals/current')?(found?Promise.resolve(receipt()):Promise.reject(new ApiError('未定位',404))):Promise.resolve(empty(o.query.propertyKeys)))
  const w=render();await start(w);await button(w,'确认').trigger('click');await flushPromises();expect(w.emitted('busy')?.at(-1)).toEqual([true]);await button(w,'取消').trigger('click');await w.setProps({keys:[],modelVersionId:operation,disabled:true});state.status.value='ARCHIVED';await start(w);await button(w,'核对原请求').trigger('click');await flushPromises();expect(w.text()).toContain('暂未定位原请求');expect(state.api.mock.calls.filter(([p])=>p.endsWith('/platform-properties/current'))).toHaveLength(0)
  const original=posts()[0]!,get=state.api.mock.calls.find(([p])=>p.endsWith('/removals/current'))!;expect(get[1].headers).toEqual({'Original-Request-Key':original[1].headers['Idempotency-Key'],'X-Request-Body-SHA256':createHash('sha256').update(original[1].rawBody).digest('hex')});found=true;await button(w,'核对原请求').trigger('click');await flushPromises();expect(posts()).toHaveLength(1);expect(w.emitted('saved')).toHaveLength(1);expect(w.emitted('busy')?.at(-1)).toEqual([false]);w.unmount()
 })

 afterEach(()=>vi.unstubAllGlobals())
 beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);state.status.value='ACTIVE';vi.clearAllMocks();state.control=true;state.api.mockImplementation((_p:string,o:any)=>Promise.resolve(o.method==='post'?receipt():empty(o.query.propertyKeys)))})
 it('写前摘要期间归档阻止移除首次提交并释放busy，恢复后只按新点击发送',async()=>{
  let resolve!:(value:ArrayBuffer)=>void
  const digest=vi.spyOn(webcrypto.subtle,'digest').mockReturnValueOnce(new Promise<ArrayBuffer>(done=>{resolve=done}))
  const w=render()
  try{
   await start(w);await button(w,'确认').trigger('click');await flushPromises()
   expect(digest).toHaveBeenCalledTimes(1);expect(posts()).toHaveLength(0);expect(w.emitted('busy')?.at(-1)).toEqual([true])
   state.status.value='ARCHIVED';await flushPromises();resolve(new ArrayBuffer(32));await flushPromises()
   expect(state.control).toBe(true);expect(state.api).not.toHaveBeenCalled();expect(w.emitted('busy')?.at(-1)).toEqual([false])
   expect(w.text()).toContain('尚未提交');expect(button(w,'取消').attributes('disabled')).toBeUndefined();expect(button(w,'确认').attributes('disabled')).toBeDefined()
   state.status.value='ACTIVE';await flushPromises();expect(state.api).not.toHaveBeenCalled()
   await button(w,'确认').trigger('click');await vi.waitFor(()=>expect(posts()).toHaveLength(1));await flushPromises()
   expect(w.emitted('saved')).toHaveLength(1)
  }finally{w.unmount();digest.mockRestore()}
 })
 it('冻结完整选择后确认一次POST，实际GET核对后清选并回读',async()=>{
  const w=render();await start(w);await w.setProps({keys:['changed']});await button(w,'确认').trigger('click');await flushPromises();expect(posts()).toHaveLength(1);expect(JSON.parse(posts()[0]![1].rawBody).keys).toEqual(['n','other']);expect(state.api).toHaveBeenCalledTimes(2);expect(w.emitted('saved')).toHaveLength(1);w.unmount()
 })
 it('取消不写，重新打开尚未发送的意图才使用新选择',async()=>{
  const w=render();await start(w);await button(w,'取消').trigger('click');await flushPromises();expect(posts()).toHaveLength(0);await w.setProps({keys:['n']});state.api.mockImplementation((_p:string,o:any)=>Promise.resolve(o.method==='post'?receipt(['n']):empty(o.query.propertyKeys)));await start(w);await button(w,'确认').trigger('click');await flushPromises();expect(JSON.parse(posts()[0]![1].rawBody).keys).toEqual(['n']);w.unmount()
 })
 it('受理后读取失败只允许重新GET核对，绝不再次删除',async()=>{
  let reads=0;state.api.mockImplementation((_p:string,o:any)=>o.method==='post'?Promise.resolve(receipt()):++reads===1?Promise.reject(new Error('读取失败')):Promise.resolve(empty(o.query.propertyKeys)))
  const w=render();await start(w);await button(w,'确认').trigger('click');await flushPromises();expect(w.text()).toContain('已移除，当前值核对未完成');await button(w,'重新核对').trigger('click');await flushPromises();expect(posts()).toHaveLength(1);expect(reads).toBe(2);w.unmount()
 })
 it('网络未知和坏成功关闭重开仍锁定，不能更换选择触发重发',async()=>{
  for(const failure of [new ApiError('未知',0,undefined,undefined,true),new ApiError('请求处理中',409,10010),new ApiError('完成墓碑',409,10014),'bad-success']){
   state.api.mockImplementation((_p:string,o:any)=>failure==='bad-success'?Promise.resolve(new TextEncoder().encode('{}')):Promise.reject(failure));const w=render();await start(w);await button(w,'确认').trigger('click');await flushPromises();expect(w.text()).toContain('本次操作不能再次提交');await button(w,'取消').trigger('click');await w.setProps({keys:['other']});await start(w);expect(w.findAll('button').some(b=>b.text()==='确认')).toBe(false);expect(button(w,'核对原请求')).toBeDefined();expect(posts()).toHaveLength(1);w.unmount();vi.clearAllMocks()
  }
 })
 it('直接403且session仍可控制时收束本设备写入口',async()=>{
  state.api.mockRejectedValue(new ApiError('失权',403));const w=render();await start(w);await button(w,'确认').trigger('click');await flushPromises();expect(state.control).toBe(true);expect(w.findAll('button').some(b=>b.text()==='移除属性')).toBe(false);expect(posts()).toHaveLength(1);w.unmount()
 })
 it('只读无写入口也不发请求',async()=>{state.control=false;const w=render();await flushPromises();expect(w.findAll('button').some(b=>b.text()==='移除属性')).toBe(false);expect(state.api).not.toHaveBeenCalled();w.unmount()})
 it('设备切换后迟到旧受理不能显示成功或核对新设备',async()=>{
  let resolve!:(value:Uint8Array)=>void;state.api.mockImplementationOnce(()=>new Promise(r=>{resolve=r}));const w=render();await start(w);await button(w,'确认').trigger('click');await flushPromises();await w.setProps({deviceId:'new-device'});resolve(receipt());await flushPromises();expect(w.emitted('saved')).toBeUndefined();expect(state.api).toHaveBeenCalledTimes(1);w.unmount()
 })
})
