import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {flushPromises,mount,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Generation from '../../src/features/device-types/DeviceTypeModelGeneration.vue'
import Candidate from '../../src/features/device-types/DeviceTypeModelCandidate.vue'
import JsonCodeEditor from '../../src/ui/JsonCodeEditor.vue'
import type {ModelCandidateTransport} from '../../src/features/device-types/model-candidate-api'
import {decodeModelSnapshot} from '../../src/features/device-types/model-version-api'
import {decodeModelGeneration,modelGenerationTransport,prepareModelGeneration,type ModelGenerationIntent,type ModelGenerationTransport} from '../../src/features/device-types/model-generation-api'
import {ApiError,changeIdentity} from '../../src/core/http'
import {session} from '../../src/core/session'
const state=vi.hoisted(()=>({api:vi.fn()}));vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:state.api}))
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,project=uuid(1),type=uuid(2),baseId=uuid(3),callId=uuid(4),bytes=(s:string)=>new TextEncoder().encode(s)
const meta={id:baseId,deviceTypeId:type,versionNumber:'1.0.0',changeLevel:'MAJOR',schemaDigest:'a'.repeat(64),digestAlgorithm:'PG_JSONB_TEXT_V1_SHA256',publishedAt:'2026-10-29T00:00:00Z'}
const base=decodeModelSnapshot(bytes('{"version":'+JSON.stringify(meta)+',"modelSnapshot":{"properties":{},"events":{},"commands":{}}}'),type,baseId)
const model='{"properties":{"temp":{"dataType":"NUMBER","accessType":"CLOUD_PRIVATE","minimum":0.10000000000000000001}},"events":{},"commands":{}}'
function response(){return bytes('{"callId":"'+callId+'","status":"SUCCEEDED","reason":"CANDIDATE_READY","candidate":{"baseVersion":'+JSON.stringify(meta)+',"versionNumber":"2.0.0","changeLevel":"MAJOR","requiredChangeLevel":"MINOR","modelSnapshot":'+model+',"schemaDigest":"'+'b'.repeat(64)+'","digestAlgorithm":"PG_JSONB_TEXT_V1_SHA256","previewDigest":"'+'c'.repeat(64)+'","previewDigestAlgorithm":"DEVICE_TYPE_MODEL_VERSION_CANDIDATE_V1_SHA256","changes":{"properties":{"added":["temp"],"removed":[],"changed":[]},"events":{"added":[],"removed":[],"changed":[]},"commands":{"added":[],"removed":[],"changed":[]}}}}')}
const wrappers:VueWrapper[]=[];const available=async()=>({available:true,reason:'AVAILABLE'} as const)
function render(transport:ModelGenerationTransport){const w=mount(Generation,{props:{typeId:type,base,transport},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);return w}
function button(label:string){const n=[...document.querySelectorAll<HTMLButtonElement>('button')].find(n=>n.textContent?.trim()===label);expect(n,label).toBeDefined();return n!}
async function submit(w:VueWrapper){await w.get('[aria-label="模型生成说明"]').setValue('增加温度');button('生成一次候选').click();await flushPromises()}
beforeEach(()=>{vi.clearAllMocks();changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:update']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]})
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks()})
it('固定基版、原键与完整预览保留精确数值，恢复严格只读且无正文',async()=>{
 const intent=prepareModelGeneration(project,type,base,'2.0.0','MAJOR','增加温度');expect(intent.key[14]).toBe('7');expect(intent.body.expectedBaseSchemaDigest).toBe(meta.schemaDigest)
 const result=decodeModelGeneration(response(),intent);expect(result.candidate?.text).toContain('0.10000000000000000001');expect(result.preview?.changes.properties.added).toEqual(['temp']);expect(()=>decodeModelGeneration(response(),intent,true)).toThrow()
 const wrong=bytes(new TextDecoder().decode(response()).replace('"baseVersion":'+JSON.stringify(meta),'"baseVersion":'+JSON.stringify({...meta,id:uuid(9)})));expect(()=>decodeModelGeneration(wrong,intent)).toThrow()
 state.api.mockResolvedValue(response());await modelGenerationTransport.generate(intent,new AbortController().signal);expect(state.api.mock.calls[0]![1].headers['Idempotency-Key']).toBe(intent.key)
 state.api.mockResolvedValue(bytes(JSON.stringify({callId,status:'SUCCEEDED',reason:'RESULT_NOT_RETAINED'})));await modelGenerationTransport.read(intent,new AbortController().signal);expect(state.api.mock.calls[1]![1].method).toBeUndefined();expect(state.api.mock.calls[1]![1].headers['Original-Request-Key']).toBe(intent.key)
})
it('默认关闭不可生成，显式一次生成后仅采纳候选不发布',async()=>{
 let enabled=false;const generate=vi.fn(async(intent:ModelGenerationIntent)=>decodeModelGeneration(response(),intent));const w=render({status:async()=>enabled?available():({available:false,reason:'PROVIDER_UNAVAILABLE'}),generate,read:vi.fn()});await flushPromises();expect(button('生成一次候选').disabled).toBe(true);expect(w.text()).toContain('不会发起真实模型调用')
 enabled=true;await w.setProps({disabled:true});await w.setProps({disabled:false});await flushPromises();await submit(w);expect(generate).toHaveBeenCalledTimes(1);expect(w.text()).toContain('尚未发布');expect(w.emitted('accepted')).toBeUndefined();button('将候选载入编辑器').click();await flushPromises();expect(w.emitted('accepted')).toHaveLength(1);expect(w.emitted('accepted')![0]![0]).toMatchObject({typeId:type});expect(generate).toHaveBeenCalledTimes(1)
})
it('未知只读原键；失权清意图并拒绝晚到候选',async()=>{
 const generate=vi.fn(async(_intent:ModelGenerationIntent)=>{throw new ApiError('unknown',503)}),read=vi.fn(async(_intent:ModelGenerationIntent)=>({callId,status:'UNKNOWN',reason:'RESULT_NOT_RETAINED'} as const));let w=render({status:available,generate,read});await flushPromises();await submit(w);expect(w.emitted('locked')?.at(-1)).toEqual([true]);button('读取原调用状态').click();await flushPromises();expect(read.mock.calls[0]?.[0]).toBe(generate.mock.calls[0]?.[0]);expect(generate).toHaveBeenCalledTimes(1);expect(w.text()).toContain('正文未保留')
 let finish!:(value:ReturnType<typeof decodeModelGeneration>)=>void;const late=vi.fn((_intent:ModelGenerationIntent)=>new Promise<ReturnType<typeof decodeModelGeneration>>(done=>{finish=done}));w.unmount();wrappers.splice(wrappers.indexOf(w),1);w=render({status:available,generate:late,read});await flushPromises();await submit(w);session.user={...session.user!,projectRole:'VIEWER',permissions:[]};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];await flushPromises();finish(decodeModelGeneration(response(),late.mock.calls[0]![0]));await flushPromises();expect(w.text()).not.toContain('原操作键');expect(w.emitted('accepted')).toBeUndefined()
})

function candidatePort():ModelCandidateTransport{return{latest:vi.fn(async()=>base),preview:vi.fn(async()=>decodeModelGeneration(response(),prepareModelGeneration(project,type,base,'2.0.0','MAJOR','fixture')).preview!),publish:vi.fn(async()=>base),snapshot:vi.fn(async()=>base),byNumber:vi.fn(async()=>base)}}
it('生成宿主仅挂已发布基版，默认关闭，取消不变编辑器且采纳后仍等待明确发布',async()=>{
 let enabled=false;const generate=vi.fn(async(intent:ModelGenerationIntent)=>decodeModelGeneration(response(),intent)),transport=candidatePort()
 const w=mount(Candidate,{props:{typeId:type,typeStatus:'DRAFT',transport,generationTransport:{status:async()=>enabled?available():({available:false,reason:'PROVIDER_UNAVAILABLE'}),generate,read:vi.fn()}},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);await flushPromises();expect(w.findComponent(Generation).exists()).toBe(false)
 await w.setProps({typeStatus:'PUBLISHED'});await flushPromises();expect(w.findComponent(Generation).exists()).toBe(true);expect(button('生成一次候选').disabled).toBe(true);expect(w.text()).toContain('不会发起真实模型调用');expect(generate).not.toHaveBeenCalled()
 enabled=true;await w.setProps({disabled:true});await w.setProps({disabled:false});await flushPromises();await submit(w);expect(w.getComponent(JsonCodeEditor).props('modelValue')).toBe(base.text);expect(w.find('section.candidate-preview').exists()).toBe(false);button('取消采纳').click();await flushPromises();expect(w.getComponent(JsonCodeEditor).props('modelValue')).toBe(base.text);expect(transport.publish).not.toHaveBeenCalled()
 button('读取最新基版').click();await flushPromises();expect(generate).toHaveBeenCalledTimes(1);await submit(w);button('将候选载入编辑器').click();await flushPromises();expect(w.getComponent(JsonCodeEditor).props('modelValue')).toContain('0.10000000000000000001');expect(w.find('section.candidate-preview').exists()).toBe(true);expect(button('确认发布新版本').disabled).toBe(false);expect(transport.publish).not.toHaveBeenCalled();expect(w.emitted('changed')).toBeUndefined()
})
it('生成宿主未知锁定基版与本地编辑，原键只读不能恢复正文或隐式发布',async()=>{
 const transport=candidatePort(),generate=vi.fn(async(_intent:ModelGenerationIntent)=>{throw new ApiError('unknown',503)}),read=vi.fn(async(_intent:ModelGenerationIntent)=>({callId,status:'UNKNOWN',reason:'RESULT_NOT_RETAINED'} as const))
 const w=mount(Candidate,{props:{typeId:type,typeStatus:'PUBLISHED',transport,generationTransport:{status:available,generate,read}},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);await flushPromises();await submit(w)
 expect(w.emitted('locked')?.at(-1)).toEqual([true]);expect(button('读取最新基版').disabled).toBe(true);expect(w.getComponent(JsonCodeEditor).props('disabled')).toBe(true);expect(button('应用本地候选').disabled).toBe(true)
 button('读取原调用状态').click();await flushPromises();expect(read.mock.calls[0]![0]).toBe(generate.mock.calls[0]![0]);expect(generate).toHaveBeenCalledTimes(1);expect(w.text()).toContain('结果正文未保留');expect(w.getComponent(JsonCodeEditor).props('modelValue')).toBe(base.text);expect(w.emitted('locked')?.at(-1)).toEqual([false]);expect(w.find('section.candidate-preview').exists()).toBe(false);expect(transport.publish).not.toHaveBeenCalled()
})

it('原键恢复在降级和归档后保留只读宿主，只有真实读权丢失才清除私有意图',async()=>{
 const transport=candidatePort(),generate=vi.fn(async(_intent:ModelGenerationIntent)=>{throw new ApiError('unknown',503)}),read=vi.fn<ModelGenerationTransport['read']>().mockResolvedValue({callId,status:'IN_FLIGHT',reason:'RESULT_NOT_RETAINED'})
 const w=mount(Candidate,{props:{typeId:type,typeStatus:'PUBLISHED',transport,generationTransport:{status:available,generate,read}},attachTo:document.body,global:{plugins:[ElementPlus]}});wrappers.push(w);await flushPromises();await submit(w);const original=generate.mock.calls[0]![0]
 session.user={...session.user!,projectRole:'VIEWER',permissions:['device:read']};session.projects=[{id:project,myRole:'VIEWER',status:'ACTIVE'}];await flushPromises();expect(w.findComponent(Generation).exists()).toBe(true);expect(w.text()).toContain(original.key);expect(button('生成一次候选').disabled).toBe(true);expect(w.emitted('locked')?.at(-1)).toEqual([true]);button('读取原调用状态').click();await flushPromises();expect(read.mock.calls[0]![0]).toBe(original)
 session.projects=[{id:project,myRole:'VIEWER',status:'ARCHIVED'}];read.mockResolvedValueOnce({callId,status:'UNKNOWN',reason:'RESULT_NOT_RETAINED'});await flushPromises();expect(w.text()).toContain(original.key);button('读取原调用状态').click();await flushPromises();expect(read.mock.calls[1]![0]).toBe(original);expect(generate).toHaveBeenCalledTimes(1);expect(transport.publish).not.toHaveBeenCalled();expect(w.text()).toContain('正文未保留');expect(w.find('section.candidate-preview').exists()).toBe(false)
 session.user={...session.user!,permissions:[]};await flushPromises();expect(w.findComponent(Generation).exists()).toBe(false);expect(w.text()).not.toContain(original.key)
})
