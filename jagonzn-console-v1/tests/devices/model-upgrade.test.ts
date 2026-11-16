import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DeviceModel from '../../src/features/devices/DeviceModel.vue'
import {decodeModelBinding,decodeModelUpgradeReceipt,modelVersionForward,prepareModelUpgrade,modelUpgradeTransport} from '../../src/features/devices/model-upgrade-api'
import {decodeModelVersion} from '../../src/features/device-types/model-version-api'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
const state=vi.hoisted(()=>({api:vi.fn(),current:''}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=uuid(100),device=uuid(200),type=uuid(300),old=uuid(1),target=uuid(2),other=uuid(400)
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
const model=(id=old,patch:Record<string,unknown>={})=>({id,deviceTypeId:type,versionNumber:id===old?'1.0.0':'1.1.0',changeLevel:id===old?'MAJOR':'MINOR',schemaDigest:(id===old?'a':'b').repeat(64),digestAlgorithm:'PG_JSONB_TEXT_V1_SHA256',publishedAt:'2026-10-28T01:00:00Z',...patch})
const binding=(id=state.current)=>({deviceId:device,deviceTypeId:type,version:model(id)})
const transition=(body:any,patch:Record<string,unknown>={})=>({id:uuid(20),deviceId:device,fromVersionId:body.expectedCurrentVersionId,toVersionId:body.targetVersionId,transitionKey:body.transitionKey,transitionType:'UPGRADE',effectiveAt:'2026-10-28T02:00:00.123456Z',...patch})
const wrappers:VueWrapper[]=[]
function render(){const wrapper=mount(DeviceModel,{props:{deviceId:device},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(wrapper);return wrapper}
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()===label);expect(found,label).toBeDefined();return found!}
async function click(label:string){button(label).click();await flushPromises()}
const writes=()=>state.api.mock.calls.filter(([,options])=>options?.method)
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}];state.current=old;state.api.mockImplementation((path:string,options?:any)=>{
 if(options?.method){state.current=target;return Promise.resolve(bytes(transition(options.body)))}
 if(path.endsWith('/thing-model-binding'))return Promise.resolve(bytes(binding()))
 if(path.endsWith('/latest'))return Promise.resolve(bytes(model(target)))
 const id=path.split('/').at(-1)!;return Promise.resolve(bytes({version:model(id),modelSnapshot:{properties:{},events:{},commands:{}}}))
 })})
afterEach(()=>{wrappers.splice(0).forEach(wrapper=>wrapper.unmount());session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})

it('精确预览当前与同类型向前目标，取消零写，确认一次POST并核对转换键和当前目标',async()=>{
 const wrapper=render();await flushPromises();expect(wrapper.text()).toContain('1.0.0');expect(wrapper.text()).toContain('1.1.0');await click('显式升级绑定');expect(document.body.textContent).toContain('当前不提供回退');await click('取消');expect(writes()).toHaveLength(0)
 await click('显式升级绑定');const confirm=button('确认升级');confirm.click();confirm.click();await flushPromises();expect(writes()).toHaveLength(1);const [,options]=writes()[0]!;expect(options.method).toBe('post');expect(options.body).toEqual({expectedCurrentVersionId:old,targetVersionId:target,transitionKey:expect.any(String)});expect(options.headers['Idempotency-Key']).toBe(options.body.transitionKey);expect(wrapper.emitted('changed')).toHaveLength(1);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(wrapper.text()).toContain('原转换回执与目标版本均已核对')
})
it('版本冲突保留原预期/目标/转换键，只GET核对，重新预览前不会重发',async()=>{
 const normal=state.api.getMockImplementation()!;state.api.mockImplementation((path,options)=>options?.method?Promise.reject(new ApiError('物模型绑定已变化',409,30053)):normal(path,options));const wrapper=render();await flushPromises();await click('显式升级绑定');await click('确认升级');const original=writes()[0]![1].body;expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);expect(document.body.textContent).toContain(original.transitionKey);expect(document.body.textContent).toContain('本次升级被拒绝');state.current=target;await click('读取当前绑定');expect(writes()).toHaveLength(1);expect(wrapper.emitted('changed')).toBeUndefined();await click('结束本次核对');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(wrapper.text()).toContain('本次升级已被拒绝')
})
it('未知结果即使当前已到目标也不冒原请求成功，关闭重开/同值会话/自身disabled与写权丢失保原意图',async()=>{
 const normal=state.api.getMockImplementation()!;state.api.mockImplementation((path,options)=>{if(options?.method){state.current=target;return Promise.reject(new ApiError('网络结果未知',0,undefined,undefined,true))}return normal(path,options)});const wrapper=render();await flushPromises();await click('显式升级绑定');await click('确认升级');const original=writes()[0]![1].body;await click('关闭');session.user={...session.user!};session.projects=session.projects.map(item=>({...item}));await wrapper.setProps({disabled:true});await flushPromises();await click('查看升级核对');expect(document.body.textContent).toContain(original.transitionKey);session.user={...session.user!,projectRole:'VIEWER',permissions:['device:read']};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];await flushPromises();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);await click('读取当前绑定');expect(document.body.textContent).toContain('这不能证明原升级请求的历史结果');expect(wrapper.emitted('changed')).toBeUndefined();expect(writes()).toHaveLength(1);await click('结束本次核对');expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(wrapper.text()).toContain('原升级结果仍未确认')
})
it('异设备/目标/转换键回执不能确认成功，当前目标和原有效回执二者缺一不可',async()=>{
 const normal=state.api.getMockImplementation()!;state.api.mockImplementation((path,options)=>options?.method?Promise.resolve(bytes(transition(options.body,{transitionKey:other}))):normal(path,options));const wrapper=render();await flushPromises();await click('显式升级绑定');await click('确认升级');expect(document.body.textContent).toContain('原操作结果尚未确认');expect(wrapper.emitted('changed')).toBeUndefined();const preview=await modelUpgradeTransport.preview(project,device,new AbortController().signal),intent=prepareModelUpgrade(project,device,preview)
 for(const patch of [{deviceId:other},{fromVersionId:target},{toVersionId:old},{transitionType:'INITIAL'},{effectiveAt:'not-a-time'}])expect(()=>decodeModelUpgradeReceipt(bytes(transition(intent.body,patch)),intent)).toThrow()
 expect(()=>decodeModelBinding(bytes({...binding(),deviceId:other}),device)).toThrow();expect(modelVersionForward(decodeModelVersion(model(target),type),decodeModelVersion(model(old),type))).toBe(false);expect(modelVersionForward(decodeModelVersion(model(old),type),decodeModelVersion(model(target,{deviceTypeId:other}),other))).toBe(false)
})
it('有效原转换回执遇到当前绑定不同先保核对，后续GET对齐才完成，不再POST',async()=>{
 const normal=state.api.getMockImplementation()!;state.api.mockImplementation((path,options)=>options?.method?Promise.resolve(bytes(transition(options.body))):normal(path,options));const wrapper=render();await flushPromises();await click('显式升级绑定');await click('确认升级');expect(document.body.textContent).toContain('已取得原升级转换回执，但当前绑定已不是原目标');expect(wrapper.emitted('changed')).toBeUndefined();expect(wrapper.emitted('locked')?.at(-1)).toEqual([true]);state.current=target;await click('读取当前绑定');expect(wrapper.emitted('changed')).toHaveLength(1);expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(writes()).toHaveLength(1)
})
it('操作中切设备或失去读权清除私有意图，旧回执不刷新新范围；只读成员不能升级',async()=>{
 const normal=state.api.getMockImplementation()!;let resolve!:(value:Uint8Array)=>void;state.api.mockImplementation((path,options)=>options?.method?new Promise(done=>{resolve=done}):normal(path,options));const wrapper=render();await flushPromises();await click('显式升级绑定');button('确认升级').click();await flushPromises();const original=writes()[0]![1].body;await wrapper.setProps({deviceId:other});resolve(bytes(transition(original)));await flushPromises();expect(wrapper.emitted('changed')).toBeUndefined();expect(wrapper.emitted('locked')?.at(-1)).toEqual([false]);expect(document.body.textContent).not.toContain(original.transitionKey)
 session.user={...session.user!,projectRole:'VIEWER',permissions:['device:read']};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];await wrapper.setProps({deviceId:device});await flushPromises();expect([...document.querySelectorAll('button')].some(node=>node.textContent?.trim()==='显式升级绑定')).toBe(false);session.user={...session.user!,permissions:[]};await flushPromises();expect(wrapper.text()).toContain('没有此内容的读取权限');expect(wrapper.text()).not.toContain('1.0.0');expect(writes()).toHaveLength(1)
})
