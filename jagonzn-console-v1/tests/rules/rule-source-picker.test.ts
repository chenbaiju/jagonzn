import {beforeEach,afterEach,it,expect,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus,{ElSelect} from 'element-plus'
import {invalidateIdentity,setAccessToken} from '../../src/core/http'
import RuleSourcePicker from '../../src/features/rules/RuleSourcePicker.vue'
const state=vi.hoisted(()=>({project:null as any}))
vi.mock('../../src/core/session',async()=>{const {ref}=await import('vue');state.project=ref('');return {projectId:state.project}})
const project='10000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000001'
let wrapper:VueWrapper|undefined
const response=(value:unknown)=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}})
function setup(){wrapper=mount(RuleSourcePicker,{attachTo:document.body,global:{plugins:[ElementPlus]}});return wrapper}
beforeEach(()=>{state.project.value=project;setAccessToken('test-source-only')})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;vi.unstubAllGlobals();setAccessToken('');document.body.innerHTML=''})
it('设备来源使用有界真实候选并回读归属和名称，不沿用候选中的旧名称',async()=>{
 const calls:string[]=[]
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{const url=new URL(String(input));calls.push(url.pathname+url.search);if(url.pathname.endsWith('/device-types/search'))return response({items:[],hasMore:false,nextCursor:null});if(url.pathname.endsWith('/devices/search'))return response({items:[{id:device,name:'旧名称'}],hasMore:false,nextCursor:null});if(url.pathname.endsWith('/devices/'+device))return response({id:device,projectId:project,name:'当前名称'});throw new Error('未批准的接口')}))
 const view=setup();await view.get('input[value="DEVICE"]').setValue();await flushPromises();view.findComponent(ElSelect).vm.$emit('update:modelValue',device);await flushPromises()
 expect(calls.some(call=>call.includes('/devices/search?')&&call.includes('limit=50'))).toBe(true);expect(calls.at(-1)).toBe(`/api/v1/projects/${project}/devices/${device}`)
 expect(view.emitted('update:modelValue')!.at(-1)).toEqual([{kind:'DEVICE',referenceId:device,name:'当前名称'}]);expect(view.emitted('busy')!.at(-1)).toEqual([false])
 await view.get('input[value="DEVICE_TYPE"]').setValue();await flushPromises();expect(view.emitted('update:modelValue')!.at(-1)).toEqual([undefined])
})
it('身份切换清掉待选来源，迟到的单设备响应不能给新身份补入旧私有名称',async()=>{
 let release!:(value:Response)=>void,readSignal:AbortSignal|undefined
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(String(input));if(url.pathname.endsWith('/devices/search'))return response({items:[{id:device,name:'候选'}],hasMore:false,nextCursor:null});if(url.pathname.endsWith('/devices/'+device)){readSignal=init?.signal??undefined;return new Promise<Response>(resolve=>{release=resolve})}throw new Error('未批准的接口')}))
 const view=setup();await view.get('input[value="DEVICE"]').setValue();await flushPromises();view.findComponent(ElSelect).vm.$emit('update:modelValue',device);await flushPromises();expect(release).toBeDefined();invalidateIdentity();await flushPromises();release(response({id:device,projectId:project,name:'旧身份私有名称'}));await flushPromises()
 expect(readSignal?.aborted).toBe(true);expect(view.emitted('update:modelValue')!.at(-1)).toEqual([undefined]);expect(JSON.stringify(view.emitted('update:modelValue'))).not.toContain('旧身份私有名称');expect(view.emitted('busy')!.at(-1)).toEqual([false])
})
