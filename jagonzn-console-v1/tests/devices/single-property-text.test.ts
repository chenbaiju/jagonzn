import {webcrypto} from 'node:crypto'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'
import Action from '../../src/features/devices/PlatformPropertyAction.vue'
import Properties from '../../src/features/devices/DeviceProperties.vue'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity,identityEpoch} from '../../src/core/http'

// 真实会话、组件和属性适配器；仅替换 HTTP 传输，不另造正文或恢复实现。
const transport=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:transport.api}))
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',model='00000000-0000-4000-8000-000000000003',operation='00000000-0000-4000-8000-000000000004',type='00000000-0000-4000-8000-000000000005'
const key='target-text',base=`/api/v1/projects/${project}/devices/${device}`
const oldText='  旧值"\\Ω😀\n第二行\t '
type Kind='DOWNLINK'|'CLOUD_UPDATE'
let wrapper:VueWrapper<any>|undefined,action:VueWrapper<any>|undefined,kind:Kind,rawCurrent:string,unknownWrite:boolean,unexpected:string[]
const name=(value:Kind)=>value==='DOWNLINK'?'下发属性':'更新云端属性'
const receipt=()=>({operationId:operation,projectId:project,deviceId:device,modelVersionId:model,kind,acceptedAt:'2026-10-27T00:00:00Z',commandId:kind==='DOWNLINK'?operation:null})
const current=()=>new TextEncoder().encode(`{"projectId":"${project}","deviceId":"${device}","modelVersionId":"${model}","values":[{"propertyKey":"${key}","state":"VALUE","sourceKind":"${kind==='DOWNLINK'?'PLATFORM_DOWNLINK':'PLATFORM_CLOUD_UPDATE'}","value":${rawCurrent},"modelVersionId":"${model}","occurredAt":null,"updatedAt":"2026-10-27T00:00:00Z","operationId":"${operation}","reportedRevision":null}]}`)
function button(label:string,host=action!){const found=host.findAll('button').find(x=>x.text()===label);if(!found)throw new Error('缺少按钮：'+label);return found}
function input(){return action!.get<HTMLTextAreaElement>('textarea[aria-label="单属性文本值"]')}
function writes(){return transport.api.mock.calls.filter(([,o])=>o?.method==='post'||o?.method==='put')}
function recoveries(){return transport.api.mock.calls.filter(([url])=>url.startsWith(base+'/platform-properties/submissions/'))}
function snapshot(raw=JSON.stringify(oldText),dataType='TEXT'){return{project,device,model,epoch:identityEpoch(),key,name:'冻结文本',nameIsCurrent:false,accessType:kind==='DOWNLINK'?'SHARED':'CLOUD_PRIVATE',dataType,value:raw}}
function unmount(){wrapper?.unmount();wrapper=undefined;action=undefined;document.body.innerHTML=''}
async function direct(raw=JSON.stringify(oldText),dataType='TEXT'){
 unmount();wrapper=mount(Action,{props:{deviceId:device,modelVersionId:model,kind},attachTo:document.body,global:{plugins:[ElementPlus]}});action=wrapper
 action.vm.startSingle(snapshot(raw,dataType));await flushPromises();return action
}
async function host(presentation:'cards'|'table'){
 unmount();wrapper=mount(Properties,{props:{deviceId:device,presentation},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises()
 if(presentation==='cards'){await vi.waitFor(()=>expect(wrapper!.find(`button[aria-label="更多属性操作：${key}"]`).exists()).toBe(true));await wrapper.get(`button[aria-label="更多属性操作：${key}"]`).trigger('click');await flushPromises();const item=[...document.querySelectorAll<HTMLElement>('.el-dropdown-menu__item')].find(node=>node.textContent?.trim()===name(kind));expect(item).toBeTruthy();item!.click();await flushPromises()}
 else{await vi.waitFor(()=>expect(wrapper!.find(`button[aria-label="${name(kind)}：${key}"]`).exists()).toBe(true));await wrapper.get(`button[aria-label="${name(kind)}：${key}"]`).trigger('click');await flushPromises()}
 action=wrapper.findAllComponents(Action).find(x=>x.props('kind')===kind)!;return action
}
beforeEach(()=>{
 vi.stubGlobal('crypto',webcrypto);transport.api.mockReset();changeIdentity();kind='CLOUD_UPDATE';rawCurrent=JSON.stringify(oldText);unknownWrite=false;unexpected=[]
 session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:control']} as never;session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}]
 transport.api.mockImplementation(async(url:string,options?:{method?:string;rawBody?:string})=>{
  if(url===base+'/reference-profile')return{deviceId:device,name:'文本设备',deviceKey:'device-key-01',businessKey:null,description:null,deviceTypeId:type,referenceVersion:'0',profileToken:'a'.repeat(64)}
  if(url===base+'/thing-model-binding')return{deviceId:device,deviceTypeId:type,version:{id:model,schemaDigest:'digest'}}
  if(url===`/api/v1/projects/${project}/device-types/${type}/thing-model-versions/${model}`)return{version:{id:model,schemaDigest:'digest'},modelSnapshot:{properties:{[key]:{name:'冻结文本',dataType:'TEXT',accessType:kind==='DOWNLINK'?'SHARED':'CLOUD_PRIVATE'}}}}
  if(url===base+'/platform-properties/current')return current()
  if(url===base+'/platform-properties/submissions/'+kind)return receipt()
  if(url===base+'/platform-properties/'+(kind==='DOWNLINK'?'downlink':'cloud')&&options?.method===(kind==='DOWNLINK'?'post':'put')){
   // 本夹具只把已断言字符串的正文用于受理回读，不替代生产严格解析器。
   const body=parseDashboardRuntimeResponse(new TextEncoder().encode(options.rawBody!)),properties=body.properties as Record<string,unknown>
   if(typeof properties[key]==='string')rawCurrent=JSON.stringify(properties[key])
   if(unknownWrite)throw new ApiError('响应未确认',0,undefined,undefined,true)
   return receipt()
  }
  unexpected.push(url);throw new Error('未登记测试读取：'+url)
 })
})
afterEach(()=>{unmount();session.user=null;session.projects=[];vi.unstubAllGlobals();expect(unexpected).toEqual([])})

it.each((['table','cards'] as const).flatMap(presentation=>(['DOWNLINK','CLOUD_UPDATE'] as const).map(value=>({presentation,value}))))('TEXT原文本入口 $presentation/$value 两行且取消零写',async({presentation,value})=>{
 kind=value;await host(presentation)
 expect(input().element.value).toBe(oldText);expect(input().attributes('rows')).toBe('2');expect(input().attributes('maxlength')).toBeUndefined()
 expect(action!.find('textarea[aria-label="单属性JSON值"]').exists()).toBe(false);expect(wrapper!.findAllComponents(Action)).toHaveLength(2)
 await input().setValue('新草稿');await button('取消').trigger('click');await flushPromises();expect(writes()).toHaveLength(0)
})
it.each(['DOWNLINK','CLOUD_UPDATE'] as const)('TEXT %s 字符串词法、合法空值和特殊字符只在显式提交写入',async value=>{
 kind=value
 for(const text of ['', '0','false','9007199254740993','  保留空白  ','引号"\\Ω😀\n下一行\t','"},"other":1,"target-text":"']){
  await direct();transport.api.mockClear();await input().setValue(text);expect(writes()).toHaveLength(0)
  await button('提交').trigger('click');await vi.waitFor(()=>expect(action!.emitted('saved')).toHaveLength(1))
  expect(writes()).toHaveLength(1);const options=writes()[0]![1],body=parseDashboardRuntimeResponse(new TextEncoder().encode(options.rawBody))
  expect(body.expectedModelVersionId).toBe(model);expect(Object.keys(body.properties as object)).toEqual([key]);expect((body.properties as Record<string,unknown>)[key]).toBe(text)
  expect(options.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);expect(recoveries()).toHaveLength(0)
 }
})
it('TEXT坏当前值明确未选，不能伪装合法空文本，显式空文本仍需提交',async()=>{
 for(const raw of ['null','false','0','{}','[]','badJSON','"\\ud800"','"\\u0000"']){
  await direct(raw);transport.api.mockClear();expect(input().element.value).toBe('');expect(action!.text()).toContain('当前值不符合文本类型');expect(button('提交').attributes('disabled')).toBeDefined()
  await button('使用空文本').trigger('click');expect(button('提交').attributes('disabled')).toBeUndefined();expect(writes()).toHaveLength(0)
  await button('提交').trigger('click');await vi.waitFor(()=>expect(action!.emitted('saved')).toHaveLength(1));expect(writes()).toHaveLength(1);expect(rawCurrent).toBe('""')
 }
})
it('TEXT用户输入U+0000与孤立代理项沿原合同拒绝，保留草稿且零写',async()=>{
 for(const text of ['a\u0000b','a\ud800b','a\udc00b']){
  await direct();transport.api.mockClear();await input().setValue(text);await button('提交').trigger('click');await flushPromises()
  expect(input().element.value).toBe(text);expect(writes()).toHaveLength(0);expect(recoveries()).toHaveLength(0);expect(action!.find('.el-alert--error').exists()).toBe(true)
 }
})
it('TEXT整正文1MiB精确边界、多字节与超4MiB草稿按字节拒绝且不截断',async()=>{
 const envelope=`{"expectedModelVersionId":"${model}","properties":{"${key}":""}}`,budget=1048576-new TextEncoder().encode(envelope).byteLength
 await direct();await input().setValue('x'.repeat(budget));await button('提交').trigger('click');await vi.waitFor(()=>expect(action!.emitted('saved')).toHaveLength(1));expect(new TextEncoder().encode(writes()[0]![1].rawBody).byteLength).toBe(1048576)
 for(const text of ['x'.repeat(budget+1),'Ω'.repeat(Math.floor(budget/2)+1),'x'.repeat(4194305)]){
  await direct();transport.api.mockClear();await input().setValue(text);await button('提交').trigger('click');await flushPromises()
  expect(input().element.value).toBe(text);expect(writes()).toHaveLength(0);expect(action!.find('.el-alert--error').exists()).toBe(true)
 }
},15000)
it.each(['DOWNLINK','CLOUD_UPDATE'] as const)('TEXT %s UNKNOWN保原文本/key/hash和父锁，关闭重开仅GET恢复',async value=>{
 kind=value;unknownWrite=true;await host('cards');await input().setValue('0"\\Ω');await button('提交').trigger('click');await vi.waitFor(()=>expect(action!.text()).toContain('本次操作不能再次提交'))
 const sent=writes()[0]![1];expect(input().attributes('disabled')).toBeDefined();expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true])
 const epoch=identityEpoch();session.user={...session.user!,permissions:[...session.user!.permissions!]};await flushPromises();expect(identityEpoch()).toBe(epoch);expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true])
 await button('取消').trigger('click');await button(name(kind)).trigger('click');await flushPromises();expect(input().element.value).toBe('0"\\Ω')
 await button('核对原请求').trigger('click');await vi.waitFor(()=>expect(action!.emitted('saved')).toHaveLength(1));expect(writes()).toHaveLength(1);expect(recoveries()).toHaveLength(1)
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sent.rawBody)),hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')
 expect(recoveries()[0]![1].headers).toEqual({'Original-Request-Key':sent.headers['Idempotency-Key'],'X-Request-Body-SHA256':hash});expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false])
})
it('TEXT闲置草稿刷新与真实身份失效仍清空，不复用旧显示值',async()=>{
 await direct();await input().setValue('闲置草稿');await action!.setProps({draftRevision:1});await flushPromises();expect(action!.text()).not.toContain('属性标识符')
 action!.vm.startSingle(snapshot('"新值"'));await flushPromises();expect(input().element.value).toBe('新值')
 unknownWrite=true;await button('提交').trigger('click');await vi.waitFor(()=>expect(action!.text()).toContain('本次操作不能再次提交'));changeIdentity();await flushPromises();expect(action!.emitted('busy')?.at(-1)).toEqual([false]);expect(recoveries()).toHaveLength(0);expect(writes()).toHaveLength(1)
})
it('NUMBER保原数值精度且全局JSON不误做TEXT字符串转换',async()=>{
 unknownWrite=true;await direct('9007199254740993','NUMBER');expect(action!.find('textarea[aria-label="单属性文本值"]').exists()).toBe(false)
 const raw=action!.get<HTMLInputElement>('input[aria-label="单属性数值"]');expect(raw.element.value).toBe('9007199254740993');await raw.setValue('0.1234567890123456789');await button('提交').trigger('click');await vi.waitFor(()=>expect(writes()).toHaveLength(1));expect(writes()[0]![1].rawBody).toContain(`"${key}":0.1234567890123456789`)
 unmount();wrapper=mount(Action,{props:{deviceId:device,modelVersionId:model,kind},attachTo:document.body,global:{plugins:[ElementPlus]}});action=wrapper;await button(name(kind)).trigger('click');await flushPromises();expect(action.find('textarea[aria-label="属性JSON"]').exists()).toBe(true);expect(action.find('textarea[aria-label="单属性文本值"]').exists()).toBe(false)
})
