import {webcrypto} from 'node:crypto'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {parseDashboardRuntimeResponse,isStrictJsonNumber} from '@things-link/client-contracts/dashboard/v1'
import Action from '../../src/features/devices/PlatformPropertyAction.vue'
import Properties from '../../src/features/devices/DeviceProperties.vue'
import {readNumberDraft} from '../../src/features/devices/single-property-number'
import {session} from '../../src/core/session'
import {ApiError,changeIdentity,identityEpoch} from '../../src/core/http'

// 真实会话、组件和属性适配器；仅替换 HTTP 传输，不另造正文或恢复实现。
const transport=vi.hoisted(()=>({api:vi.fn()}))
vi.mock('../../src/core/http',async original=>({...await original<typeof import('../../src/core/http')>(),api:transport.api}))
const project='00000000-0000-4000-8000-000000000001',device='00000000-0000-4000-8000-000000000002',model='00000000-0000-4000-8000-000000000003',operation='00000000-0000-4000-8000-000000000004',type='00000000-0000-4000-8000-000000000005'
const key='target-number',base=`/api/v1/projects/${project}/devices/${device}`
const oldText='9007199254740993'
type Kind='DOWNLINK'|'CLOUD_UPDATE'
let wrapper:VueWrapper<any>|undefined,action:VueWrapper<any>|undefined,kind:Kind,rawCurrent:string,unknownWrite:boolean,unexpected:string[]
const name=(value:Kind)=>value==='DOWNLINK'?'下发属性':'更新云端属性'
const receipt=()=>({operationId:operation,projectId:project,deviceId:device,modelVersionId:model,kind,acceptedAt:'2026-10-27T00:00:00Z',commandId:kind==='DOWNLINK'?operation:null})
const current=()=>new TextEncoder().encode(`{"projectId":"${project}","deviceId":"${device}","modelVersionId":"${model}","values":[{"propertyKey":"${key}","state":"VALUE","sourceKind":"${kind==='DOWNLINK'?'PLATFORM_DOWNLINK':'PLATFORM_CLOUD_UPDATE'}","value":${rawCurrent},"modelVersionId":"${model}","occurredAt":null,"updatedAt":"2026-10-27T00:00:00Z","operationId":"${operation}","reportedRevision":null}]}`)
function button(label:string,host=action!){const found=host.findAll('button').find(x=>x.text()===label);if(!found)throw new Error('缺少按钮：'+label);return found}
function input(){return action!.get<HTMLInputElement>('input[aria-label="单属性数值"]')}
function writes(){return transport.api.mock.calls.filter(([,o])=>o?.method==='post'||o?.method==='put')}
function recoveries(){return transport.api.mock.calls.filter(([url])=>url.startsWith(base+'/platform-properties/submissions/'))}
function snapshot(raw=oldText,dataType='NUMBER'){return{project,device,model,epoch:identityEpoch(),key,name:'冻结数值',nameIsCurrent:false,accessType:kind==='DOWNLINK'?'SHARED':'CLOUD_PRIVATE',dataType,value:raw}}
function unmount(){wrapper?.unmount();wrapper=undefined;action=undefined;document.body.innerHTML=''}
async function direct(raw=oldText,dataType='NUMBER'){
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
 vi.stubGlobal('crypto',webcrypto);transport.api.mockReset();changeIdentity();kind='CLOUD_UPDATE';rawCurrent=oldText;unknownWrite=false;unexpected=[]
 session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['device:read','device:control']} as never;session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}]
 transport.api.mockImplementation(async(url:string,options?:{method?:string;rawBody?:string})=>{
  if(url===base+'/reference-profile')return{deviceId:device,name:'数值设备',deviceKey:'device-key-01',businessKey:null,description:null,deviceTypeId:type,referenceVersion:'0',profileToken:'a'.repeat(64)}
  if(url===base+'/thing-model-binding')return{deviceId:device,deviceTypeId:type,version:{id:model,schemaDigest:'digest'}}
  if(url===`/api/v1/projects/${project}/device-types/${type}/thing-model-versions/${model}`)return{version:{id:model,schemaDigest:'digest'},modelSnapshot:{properties:{[key]:{name:'冻结数值',dataType:'NUMBER',accessType:kind==='DOWNLINK'?'SHARED':'CLOUD_PRIVATE'}}}}
  if(url===base+'/platform-properties/current')return current()
  if(url===base+'/platform-properties/submissions/'+kind)return receipt()
  if(url===base+'/platform-properties/'+(kind==='DOWNLINK'?'downlink':'cloud')&&options?.method===(kind==='DOWNLINK'?'post':'put')){
   // 本夹具只把已断言数值词法的正文用于受理回读，不替代生产严格解析器。
   const body=parseDashboardRuntimeResponse(new TextEncoder().encode(options.rawBody!)),properties=body.properties as Record<string,unknown>
   if(isStrictJsonNumber(properties[key] as never))rawCurrent=(properties[key] as {lexical:string}).lexical
   if(unknownWrite)throw new ApiError('响应未确认',0,undefined,undefined,true)
   return receipt()
  }
  unexpected.push(url);throw new Error('未登记测试读取：'+url)
 })
})
afterEach(()=>{unmount();session.user=null;session.projects=[];vi.unstubAllGlobals();expect(unexpected).toEqual([])})

it.each((['table','cards'] as const).flatMap(presentation=>(['DOWNLINK','CLOUD_UPDATE'] as const).map(value=>({presentation,value}))))('NUMBER数值入口 $presentation/$value 保原词法和取消零写',async({presentation,value})=>{
 kind=value;await host(presentation)
 expect(input().element.value).toBe(oldText);expect(input().attributes('type')).toBe('text');expect(input().attributes('inputmode')).toBe('decimal');expect(input().attributes('aria-valuenow')).toBeUndefined()
 expect(action!.find('textarea[aria-label="单属性JSON值"]').exists()).toBe(false);expect(wrapper!.findAllComponents(Action)).toHaveLength(2)
 await input().setValue('0.1234567890123456789');await button('取消').trigger('click');await flushPromises();expect(writes()).toHaveLength(0)
})

it.each(['DOWNLINK','CLOUD_UPDATE'] as const)('NUMBER %s 手填大数长小数指数有符号零和空白逐字提交',async value=>{
 kind=value
 for(const raw of ['9007199254740993','0.1234567890123456789012345678901234567890123456789012345678901234567890123456789','1.234567890123456789e+13','-0','  -0.00E-000  ','1e-5000']){
  await direct();transport.api.mockClear();await input().setValue(raw);expect(input().element.value).toBe(raw);expect(writes()).toHaveLength(0)
  await button('提交').trigger('click');await vi.waitFor(()=>expect(action!.emitted('saved')).toHaveLength(1));expect(writes()).toHaveLength(1)
  const options=writes()[0]![1];expect(options.rawBody).toBe(`{"expectedModelVersionId":"${model}","properties":{"${key}":${raw}}}`)
  expect(options.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);expect(recoveries()).toHaveLength(0)
 }
})
it('NUMBER精确加减一与箭头经过大数、小数、指数和零，不隐式提交',async()=>{
 for(const [raw,up,down] of [['9007199254740993','9007199254740994','9007199254740992'],['0.00000000000000000001','1.00000000000000000001','-0.99999999999999999999'],['-1.5','-0.5','-2.5'],['-0','1','-1'],['1e13','10000000000001','9999999999999'],['-1e-3','0.999','-1.001'],['1','2','0']]){
  await direct(raw!);await action!.get('button[aria-label="数值增加一"]').trigger('click');expect(input().element.value).toBe(up)
  await input().setValue(raw!);await input().trigger('keydown',{key:'ArrowDown'});expect(input().element.value).toBe(down)
  await input().setValue(raw!);await input().trigger('keydown',{key:'ArrowUp'});expect(input().element.value).toBe(up);expect(writes()).toHaveLength(0)
 }
})
it('NUMBER空值与非数字不能默认零，注入和溢出在写前拒绝并保原草稿',async()=>{
 for(const raw of ['', ' ', 'null','true','"0"','{}','[]','01','+1','1.','NaN','Infinity','1e309','1,"v":2','1,"other":2']){
  await direct(raw);transport.api.mockClear();expect(input().element.value).toBe(raw);expect(button('提交').attributes('disabled')).toBeDefined()
  expect(action!.get('button[aria-label="数值增加一"]').attributes('disabled')).toBeDefined();await input().trigger('keydown',{key:'ArrowUp'});await button('提交').trigger('click');await flushPromises()
  expect(input().element.value).toBe(raw);expect(writes()).toHaveLength(0);expect(recoveries()).toHaveLength(0)
 }
})
it('NUMBER步进4096展开预算仅限制加减，原超长指数手填仍允许原样提交',async()=>{
 await direct('1e-4095');expect(action!.get('button[aria-label="数值增加一"]').attributes('disabled')).toBeUndefined()
 await action!.get('button[aria-label="数值增加一"]').trigger('click');expect(input().element.value).toBe('1.'+'0'.repeat(4094)+'1');expect(writes()).toHaveLength(0)
 for(const raw of ['1e-4096','1e-5000','0.'+'0'.repeat(4096)+'1']){
  await direct(raw);transport.api.mockClear();expect(action!.text()).toContain('该数值暂不支持按钮增减，请直接编辑。');expect(action!.get('button[aria-label="数值增加一"]').attributes('disabled')).toBeDefined();expect(button('提交').attributes('disabled')).toBeUndefined()
  await input().trigger('keydown',{key:'ArrowUp'});expect(input().element.value).toBe(raw);await button('提交').trigger('click');await vi.waitFor(()=>expect(action!.emitted('saved')).toHaveLength(1));expect(writes()[0]![1].rawBody).toContain(`"${key}":${raw}`)
 }
})
it.each(['DOWNLINK','CLOUD_UPDATE'] as const)('NUMBER %s UNKNOWN真实同scope刷新保原词法、key/hash及父锁，人工仅GET恢复',async value=>{
 kind=value;unknownWrite=true;await host('cards');const raw=' 9007199254740993.000000000000000001e-1 ';await input().setValue(raw);await button('提交').trigger('click');await vi.waitFor(()=>expect(action!.text()).toContain('本次操作不能再次提交'))
 const sent=writes()[0]![1];expect(input().attributes('disabled')).toBeDefined();expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true])
 const epoch=identityEpoch();session.user={...session.user!,permissions:[...session.user!.permissions!]};session.projects=session.projects.map(p=>({...p}));await flushPromises();expect(identityEpoch()).toBe(epoch);expect(wrapper!.emitted('busy')?.at(-1)).toEqual([true])
 await input().trigger('keydown',{key:'ArrowUp'});await flushPromises();expect(input().element.value).toBe(raw);expect(writes()).toHaveLength(1)
 await button('取消').trigger('click');await button(name(kind)).trigger('click');await flushPromises();expect(input().element.value).toBe(raw)
 await button('核对原请求').trigger('click');await vi.waitFor(()=>expect(action!.emitted('saved')).toHaveLength(1));expect(writes()).toHaveLength(1);expect(recoveries()).toHaveLength(1)
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sent.rawBody)),hash=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('')
 expect(recoveries()[0]![1].headers).toEqual({'Original-Request-Key':sent.headers['Idempotency-Key'],'X-Request-Body-SHA256':hash});expect(sent.rawBody).toContain(`"${key}":${raw}`);expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false])
})
it('NUMBER真实身份与权限失效清草稿，idle模型刷新不能复用旧数值',async()=>{
 await direct();await input().setValue('123');await action!.setProps({draftRevision:1});await flushPromises();expect(action!.find('input[aria-label="单属性数值"]').exists()).toBe(false)
 action!.vm.startSingle(snapshot('7'));await flushPromises();expect(input().element.value).toBe('7')
 session.user={...session.user!,permissions:['device:read']};await flushPromises();expect(action!.find('input[aria-label="单属性数值"]').exists()).toBe(false);expect(writes()).toHaveLength(0)
 session.user={...session.user!,permissions:['device:read','device:control']};await direct();unknownWrite=true;await button('提交').trigger('click');await vi.waitFor(()=>expect(writes()).toHaveLength(1));changeIdentity();await flushPromises();expect(action!.emitted('busy')?.at(-1)).toEqual([false]);expect(recoveries()).toHaveLength(0)
})
it('NUMBER运行数字不沿用Schema的64字节或指数12约束，步进辅助不会截断手填',()=>{
 const raw='0.'+'1234567890'.repeat(20);expect(readNumberDraft(raw)?.lexical).toBe(raw);expect(readNumberDraft('1e13')?.lexical).toBe('1e13')
 expect(readNumberDraft('  -0.00E-000  ')?.lexical).toBe('-0.00E-000');expect(readNumberDraft('1e-100000')?.increase).toBeUndefined();expect(readNumberDraft('1e-100000')?.lexical).toBe('1e-100000')
 expect(readNumberDraft('1e309')).toBeUndefined();expect(readNumberDraft('1,"v":2')).toBeUndefined();expect(readNumberDraft('1,"other":2')).toBeUndefined()
})
