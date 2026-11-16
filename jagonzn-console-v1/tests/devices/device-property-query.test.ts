import {webcrypto} from 'node:crypto'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,DOMWrapper} from '@vue/test-utils'
import ElementPlus,{ElDialog} from 'element-plus'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
import Dialog from '../../src/features/devices/DevicePropertyQueryDialog.vue'
import {preparePropertyQuery,decodePropertyQueryResult,decodePropertyQueryValidation,propertyQueryTransport,type PropertyQueryIntent,type PropertyQueryTransport} from '../../src/features/devices/device-property-query-api'
import {session} from '../../src/core/session'
import * as http from '../../src/core/http'
const project='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',type='00000000-0000-4000-8000-000000000100',model='00000000-0000-4000-8000-000000000200'
const bytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value))
function body(intent:PropertyQueryIntent,n=1){return{grammarVersion:'DEVICE_PROPERTY_QUERY_V1',expressionDigest:intent.digest,evaluatedAt:'2026-10-29T12:34:56Z',candidateCount:String(n+1),matchedCount:String(n),unknownCount:'1',items:Array.from({length:n},(_,i)=>({deviceId:`00000000-0000-4000-8000-${String(i+500).padStart(12,'0')}`,deviceTypeId:type,name:`查询设备${i+1}`,status:'OFFLINE',modelVersionId:model}))}}
function port(){return{validate:vi.fn<PropertyQueryTransport['validate']>().mockImplementation(async intent=>decodePropertyQueryValidation(bytes({grammarVersion:'DEVICE_PROPERTY_QUERY_V1',expressionDigest:intent.digest,propertyKeys:['n']}),intent)),execute:vi.fn<PropertyQueryTransport['execute']>().mockImplementation(async intent=>decodePropertyQueryResult(bytes(body(intent,25)),intent))}}
let wrapper:ReturnType<typeof mount>|undefined
function button(label:string){const el=[...document.querySelectorAll<HTMLButtonElement>('button')].find(row=>row.textContent?.trim()===label||row.getAttribute('aria-label')===label);if(!el)throw new Error('缺少按钮：'+label);return new DOMWrapper(el)}
function input(){return new DOMWrapper(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="设备查询条件"]')!)}
function closeDialog(){wrapper!.getComponent(Dialog).findComponent(ElDialog).vm.$emit('update:modelValue',false)}
async function settle(){await flushPromises();await new Promise(resolve=>setTimeout(resolve,5));await flushPromises()}
async function setup(transport:PropertyQueryTransport){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/devices',component:Dialog,props:{transport,savedTransport:{list:vi.fn().mockResolvedValue([]),versions:vi.fn().mockResolvedValue([]),write:vi.fn(),recover:vi.fn()}}},{path:'/devices/:id',component:{template:'<p>设备详情</p>'}}]});await router.push('/devices');await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await settle();return wrapper.getComponent(Dialog)}
beforeEach(()=>{vi.stubGlobal('crypto',webcrypto);http.changeIdentity();session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read']} as never;session.projects=[{id:project,myRole:'OWNER',status:'ACTIVE'}]})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];document.body.innerHTML='';vi.restoreAllMocks();vi.unstubAllGlobals()})
it('精确表达式校验后真实查询一次，完整25结果仅本地翻页并保留类型交集',async()=>{
 const transport=port(),dialog=await setup(transport);dialog.vm.open(type,'温度类型');await settle();const expression='n = 9007199254740993.0000000001 and n.type = "cloud"';await input().setValue(expression)
 await button('查询').trigger('click');await settle();expect(transport.execute).toHaveBeenCalledTimes(1);expect(transport.execute.mock.calls[0]![0].body).toEqual({expression,deviceTypeId:type});expect(document.body.textContent).toContain('候选 26 台，匹配 25 台，未知 1 台');expect(document.querySelectorAll('tbody tr')).toHaveLength(24);await button('下一页').trigger('click');await settle();expect(document.querySelectorAll('tbody tr')).toHaveLength(1);expect(document.body.textContent).toContain('查询设备25');expect(transport.execute).toHaveBeenCalledTimes(1)
 closeDialog();await settle();dialog.vm.open();await settle();expect(input().element.value).toBe('');expect(document.body.textContent).not.toContain('候选 26 台');expect(transport.execute).toHaveBeenCalledTimes(1)
})
it('关闭与切scope取消只读请求，迟到结果不恢复旧文本或旧设备',async()=>{
 let resolve!:(value:Awaited<ReturnType<PropertyQueryTransport['execute']>>)=>void
 const transport=port();transport.execute.mockImplementation(()=>new Promise(done=>{resolve=done}));const dialog=await setup(transport);dialog.vm.open(type,'旧类型');await settle();await input().setValue('n > 1');await button('查询').trigger('click');await settle();const first=transport.execute.mock.calls[0]![0],signal=transport.execute.mock.calls[0]![1];closeDialog();await settle();expect(signal.aborted).toBe(true);resolve(decodePropertyQueryResult(bytes(body(first)),first));await settle();dialog.vm.open();await settle();expect(input().element.value).toBe('');expect(document.body.textContent).not.toContain('查询设备1')
 await input().setValue('n > 2');await button('查询').trigger('click');await settle();const second=transport.execute.mock.calls[1]![0],pending=transport.execute.mock.calls[1]![1];session.projects=[...session.projects,{id:other,myRole:'OWNER',status:'ACTIVE'}];session.user={...session.user!,currentProjectId:other};await settle();expect(pending.aborted).toBe(true);resolve(decodePropertyQueryResult(bytes(body(second)),second));await settle();dialog.vm.open();await settle();expect(input().element.value).toBe('');expect(document.body.textContent).not.toContain('查询设备1');expect(transport.execute).toHaveBeenCalledTimes(2)
})
it('失权清条件与结果且不自动重读，严格消费者拒绝坏摘要范围和数量',async()=>{
 const transport=port(),dialog=await setup(transport);transport.execute.mockRejectedValue(new http.ApiError('拒读',403));dialog.vm.open();await settle();await input().setValue('n > 0');await button('查询').trigger('click');await settle();expect(input().element.value).toBe('');expect(document.body.textContent).toContain('读取权限已不可用');expect(transport.execute).toHaveBeenCalledTimes(1)
 const intent=await preparePropertyQuery(project,'n > 0',type);for(const patch of [{expressionDigest:'a'.repeat(64)},{matchedCount:'0'},{candidateCount:'501'},{unknownCount:'2'}, {items:[{...body(intent).items[0],deviceTypeId:other}]}])expect(()=>decodePropertyQueryResult(bytes({...body(intent),...patch}),intent)).toThrow()
 const spy=vi.spyOn(http,'api').mockResolvedValue(bytes(body(intent)));await propertyQueryTransport.execute(intent,new AbortController().signal);expect(spy).toHaveBeenCalledWith(`/api/v1/projects/${project}/device-property-queries/execute`,expect.objectContaining({method:'post',body:{expression:'n > 0',deviceTypeId:type},responseType:'bytes',maxResponseBytes:4*1024*1024}));expect(spy.mock.calls[0]![1]?.headers).toBeUndefined()
 closeDialog();session.user={...session.user!,permissions:[]};await settle();dialog.vm.open();await settle();expect(dialog.getComponent(ElDialog).props('modelValue')).toBe(false);expect(input().element.value).toBe('');expect(transport.execute).toHaveBeenCalledTimes(1)
})
