import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import {webcrypto} from 'node:crypto'
import {h} from 'vue'
import {createRouter,createMemoryHistory,RouterView} from 'vue-router'
vi.mock('../../src/features/rules/RuleFunctionCodeEditor.vue',()=>({default:{props:['modelValue','ariaLabel','disabled'],emits:['update:modelValue','busy'],template:'<textarea :value="modelValue" :aria-label="ariaLabel" :disabled="disabled" @input="$emit(\'update:modelValue\',$event.target.value)"/>'}}))
import MessageRuleActionDetailPage from '../../src/features/rules/MessageRuleActionDetailPage.vue'
import RulesPage from '../../src/features/rules/RulesPage.vue'
import {readRawRuleJson} from '../../src/features/rules/raw-rule-json'
import {changeIdentity,setAccessToken} from '../../src/core/http'
import {session} from '../../src/core/session'
import MessageRuleActionCreateFlow from '../../src/features/rules/MessageRuleActionCreateFlow.vue'
import {contentBody,decodeRuleContent,confirmRuleContent,makeRuleContentStateIntent,type RuleContentDraft} from '../../src/features/rules/message-rule-content-api'
import {parsePreprocessJson} from '../../src/features/rules/preprocess-exact-json'
import {sourceSelection,type RuleSourceSnapshot} from '../../src/features/rules/rule-source-api'
import {refreshRuleSourceEntry} from '../../src/features/rules/rule-detail-source-refresh'
const project='20000000-0000-4000-8000-000000000001',device='20000000-0000-4000-8000-000000000002',rule='20000000-0000-4000-8000-000000000003',version='20000000-0000-4000-8000-000000000004'
const source={kind:'DEVICE' as const,referenceId:device,name:'真实来源'}
const filter='{"operator":"ALL","conditions":[],"groups":[]}'
function raw(actions='[{"nodeType":"device-property-set-action","config":{"properties":{"total":9007199254740993,"precision":1.0000000000000001,"enabled":false}}}]'){
 return new TextEncoder().encode('{"rule":{"id":"'+rule+'","name":"上报规则","description":"","status":"PAUSED","activeVersionId":"'+version+'","version":9007199254740993},"versionId":"'+version+'","versionNumber":"1","deviceSource":'+JSON.stringify({kind:source.kind,referenceId:source.referenceId})+',"trigger":{"kind":"ATTRS_RPT","identifier":null,"filter":'+filter+'},"actions":'+actions+'}')
}
let wrapper:VueWrapper|undefined,calls:{method:string;path:string;body:string}[]=[],fail=false,readFail=false
beforeEach(()=>{changeIdentity();setAccessToken('content-fixture');session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['rule:manage','device:read']};session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}];calls=[];fail=false;readFail=false;vi.stubGlobal('crypto',webcrypto)
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(String(input),'http://localhost'),method=String(init?.method??'GET').toUpperCase(),body=String(init?.body??'');calls.push({method,path:url.pathname,body});if(url.pathname.endsWith('/message-rule-content-actions'))return Response.json({actions:[{nodeType:'device-property-set-action',configSchema:{type:'object',required:['properties'],properties:{properties:{type:'object'}}}}]});if(url.pathname.endsWith('/tags')){const posted=calls.find(call=>call.method==='POST');return Response.json({ruleId:rule,version:1,tags:posted?JSON.parse(posted.body).tags??{}:{}})}if(method==='POST'){if(fail)throw new TypeError('network lost');const sent=JSON.parse(body);return Response.json({rule:{id:rule,name:sent.name,description:sent.description,status:'PAUSED',version:1},versionId:version,versionNumber:'1',deviceSource:sent.deviceSource,trigger:sent.trigger,actions:sent.actions},{status:201})}if(url.pathname.endsWith('/message-rule-contents/'+rule)){if(readFail)return Response.json({message:'回读不可见'},{status:404});const sent=JSON.parse(calls.find(call=>call.method==='POST')!.body);return Response.json({rule:{id:rule,name:sent.name,description:sent.description,status:'PAUSED',version:1},versionId:version,versionNumber:'1',deviceSource:sent.deviceSource,trigger:sent.trigger,actions:sent.actions})}return Response.json({message:'unexpected'},{status:404})}))
})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];vi.unstubAllGlobals();changeIdentity();document.body.innerHTML=''})
function button(label:string){const found=wrapper!.findAll('button').find(node=>node.text()===label);expect(found,label).toBeDefined();return found!}
async function setup(kind:'ATTRS_RPT'|'ATTRS_PUSH'|'EVENT_RPT'|'DATA_RPT'='ATTRS_RPT'){wrapper=mount(MessageRuleActionCreateFlow,{props:{source,name:'上报规则',kind},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises();return wrapper}
async function add(){await button('添加操作').trigger('click');await flushPromises();const pick=[...document.querySelectorAll<HTMLButtonElement>('.action-picker button')].find(node=>node.textContent?.includes('向当前设备下发属性'))!;pick.click();await flushPromises();const name=document.querySelector<HTMLInputElement>('[aria-label="参数名称"]')!;name.value='temperature';name.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises();[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(node=>node.textContent?.trim()==='添加参数')!.click();await flushPromises();const value=document.querySelector<HTMLInputElement>('[aria-label="文本值"]')!;value.value='warm';value.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises();[...document.querySelectorAll<HTMLButtonElement>('.el-dialog button')].find(node=>node.textContent?.trim()==='保存')!.click();await flushPromises()}

describe('消息规则完整内容',()=>{
 it.each(['current-device-cloud-properties-function','current-device-report-data-function'])('%s保存延迟使用整数token且源码原文保持',nodeType=>{
  const config=parsePreprocessJson('{"function":{"format":"COMMON_JS","source":"module.exports = function(report_attributes) { return { x: 1 }; };"},"delaySeconds":1000}') as Record<string,never>
  const draft:RuleContentDraft={name:'函数精确配置',description:'',source,kind:'ATTRS_RPT',identifier:'',filterJson:filter,actions:[{id:'action',nodeType,config}]}
  const body=contentBody(draft),fields=readRawRuleJson(new TextEncoder().encode(body))
  expect(fields.at(['actions',0,'config','delaySeconds']).integerText()).toBe('1000')
  expect(fields.at(['actions',0,'config','function','source']).string()).toBe('module.exports = function(report_attributes) { return { x: 1 }; };')
 })
 it('读取与完整重交保留long、精确十进制、布尔值和未编辑操作，不经Number',()=>{
  const saved=decodeRuleContent(raw());expect(saved.definitionVersion).toBe('9007199254740993');const draft:RuleContentDraft={name:saved.name,description:saved.description,source,kind:saved.kind,identifier:'',filterJson:saved.filterJson,actions:saved.actions};const body=contentBody(draft,saved);expect(body).toContain('"expectedVersion":"9007199254740993"');expect(body).toContain('9007199254740993');expect(body).toContain('10000000000000001e-16');expect(body).toContain('"enabled":false');confirmRuleContent(draft,saved)
  draft.actions=[...draft.actions,{id:'second',nodeType:'device-command-action',config:parsePreprocessJson('{"commandKey":"restart","input":{"x":1}}') as never}];expect(()=>confirmRuleContent(draft,saved)).toThrow('回读不完整')
 })
 it.each(['ATTRS_RPT','ATTRS_PUSH','EVENT_RPT','DATA_RPT'] as const)('%s兼容动作完整保存与回读，不替代原站动作目录验收',async kind=>{
  await setup(kind);if(kind==='EVENT_RPT'||kind==='DATA_RPT')await wrapper!.get('[aria-label="'+(kind==='EVENT_RPT'?'事件标识符':'数据流标识符')+'"]').setValue('sample');await add();await button('创建').trigger('click');await vi.waitFor(()=>expect(wrapper!.emitted('created')?.[0]).toEqual([rule]));expect(calls.filter(call=>call.method==='POST')).toHaveLength(1);expect(calls.filter(call=>call.path.endsWith('/message-rule-contents/'+rule))).toHaveLength(1);expect(JSON.parse(calls.find(call=>call.method==='POST')!.body).trigger.kind).toBe(kind)
 })
 it('已受理后的GET404清私有草稿并封闭本次创建，不解释为原写拒绝或允许重发',async()=>{await setup();await add();readFail=true;await button('创建').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('原写未确认'));expect(wrapper!.findAll('button').some(node=>node.text()==='创建')).toBe(false);expect(wrapper!.find('[aria-label="文本值"]').exists()).toBe(false);expect(wrapper!.text()).toContain('没有此内容的读取权限');expect(calls.filter(call=>call.method==='POST')).toHaveLength(1);expect(wrapper!.emitted('created')).toBeUndefined();readFail=false;await flushPromises();expect(calls.filter(call=>call.method==='POST')).toHaveLength(1);expect(wrapper!.emitted('locked')?.at(-1)).toEqual([false])})
 it('未知写结果保留草稿并锁住，不把失败当创建成功或自动重发',async()=>{
  await setup();await add();fail=true;await button('创建').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('创建结果尚未完整核对'));expect(button('创建').attributes('disabled')).toBeDefined();expect(wrapper!.emitted('created')).toBeUndefined();expect(calls.filter(call=>call.method==='POST')).toHaveLength(1);expect(calls.filter(call=>call.path.includes('/message-rule-contents/'))).toHaveLength(0)
 })
})


function sourceView(ruleId:string,content:string){const parsed=JSON.parse(content),active=parsed.rule.activeVersionId??null,number=String(parsed.versionNumber??'1');return {ruleId,status:parsed.rule.status,readOnly:false,definitionVersion:String(parsed.rule.version),deviceSource:parsed.deviceSource,activeVersionId:active,activeVersionNumber:active?number:null,activeSourceSha256:active?'a'.repeat(64):null,latestVersionId:parsed.versionId,latestVersionNumber:number,latestSourceSha256:'a'.repeat(64)}}
it('动作详情信息与标签精确CAS保存未知时在弹窗内只读恢复，不重放原写',async()=>{
 let control='9007199254740993',title='上报规则',description='',savedTags:Record<string,string>={区域:'机房'},failRead=false,loseTags=false
 const writes:{kind:string;body:string}[]=[]
 const value=()=>new TextDecoder().decode(raw()).replace('"name":"上报规则"','"name":'+JSON.stringify(title)).replace('"description":""','"description":'+JSON.stringify(description)).replace('"version":9007199254740993','"version":'+control)
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input),'http://localhost'),method=init?.method??'GET',body=String(init?.body??'')
  if(url.pathname.endsWith('/device-source'))return Response.json(sourceView(rule,value()))
  if(url.pathname.endsWith('/message-rule-content-actions'))return Response.json({actions:[{nodeType:'device-property-set-action',configSchema:{type:'object',required:['properties'],properties:{properties:{type:'object'}}}}]})
  if(url.pathname.endsWith('/devices/'+device))return Response.json({id:device,name:'真实来源'})
  if(url.pathname.endsWith('/message-rules/'+rule)&&method==='PUT'){
   const fields=readRawRuleJson(new TextEncoder().encode(body));expect(fields.at(['expectedVersion']).integerText()).toBe(control);expect(url.searchParams.get('informationOnly')).toBe('true');expect(new Headers(init?.headers).get('Idempotency-Key')).toBeTruthy();writes.push({kind:'information',body});title=fields.at(['name']).string();description=fields.at(['description']).string();control=String(BigInt(control)+1n);failRead=true;return Response.json({id:rule})
  }
  if(url.pathname.endsWith('/tags')){
   if(method==='PUT'){const fields=readRawRuleJson(new TextEncoder().encode(body));expect(fields.at(['expectedVersion']).integerText()).toBe(control);writes.push({kind:'tags',body});savedTags=JSON.parse(fields.at(['tags']).raw());control=String(BigInt(control)+1n);if(loseTags)throw new TypeError('lost tags reply')}
   expect(method==='PUT'||url.searchParams.get('expectedDefinitionVersion')===control).toBe(true)
   return new Response('{"ruleId":'+JSON.stringify(rule)+',"version":'+control+',"tags":'+JSON.stringify(savedTags)+'}',{headers:{'Content-Type':'application/json'}})
  }
  if(url.pathname.endsWith('/message-rule-contents/'+rule)){if(failRead)return Response.json({message:'合成回读503'},{status:503});return new Response(value(),{headers:{'Content-Type':'application/json'}})}
  return Response.json({message:'unexpected'},{status:404})
 }))
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/rules/messages/:id',component:MessageRuleActionDetailPage},{path:'/away',component:{render:()=>h('p','离开')}}]});await router.push('/rules/messages/'+rule);await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await vi.waitFor(()=>expect(wrapper!.find('.rule-heading').exists()).toBe(true))
 await button('编辑').trigger('click');await flushPromises();await wrapper!.get('[aria-label="规则名称"]').setValue('新规则名称');await wrapper!.get('[aria-label="规则描述"]').setValue('  修改描述  ');await button('保存').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('结果尚未完整核对'));expect(writes).toHaveLength(1)
 expect(wrapper!.findAll('.el-dialog').find(dialog=>dialog.text().includes('修改规则信息'))!.text()).toContain('读取原信息核对');failRead=false;await button('读取原信息核对').trigger('click');await vi.waitFor(()=>expect(wrapper!.get('.rule-heading').text()).toContain('新规则名称'));expect(writes).toHaveLength(1);expect(control).toBe('9007199254740994')
 await router.replace({query:{tab:'settings'}});await flushPromises();const tagEdit=wrapper!.findAll('button').find(node=>node.attributes('aria-label')==='编辑标签')!;await tagEdit.trigger('click');await flushPromises();await wrapper!.get('[aria-label="标签 1 值"]').setValue('二号机房');loseTags=true;await button('提交').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('结果尚未完整核对'));expect(writes).toHaveLength(2);expect(wrapper!.findAll('.el-dialog').find(dialog=>dialog.text().includes('修改标签'))!.text()).toContain('读取原标签核对');await button('读取原标签核对').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('二号机房'));expect(writes).toHaveLength(2);expect(control).toBe('9007199254740995');expect(wrapper!.findAll('button').filter(node=>node.text()==='读取原标签核对')).toHaveLength(0)
 expect(await router.push('/away')).toBeUndefined()
})

it('目录typed启用展示候选、legacy保活动优先，过期卡片零写刷新且暂停unknown只核原活动版本',async()=>{
 const candidate='20000000-0000-4000-8000-000000000005',other='20000000-0000-4000-8000-000000000006'
 type Scenario='typed'|'legacy'|'stale-id'|'stale-version'|'stale-status'|'stale-active'|'pause-unknown'|'conflict'|'unsafe-cas'
 async function open(scenario:Scenario){
  let control=scenario==='unsafe-cas'?Number.MAX_SAFE_INTEGER:41,status=scenario==='pause-unknown'?'ACTIVE':'PAUSED',active=version,posts=0,directoryReads=0,ruleReads=0,wrongRecovery=true,denied=false,conflictRead=false
  const writes:{path:string;expected:string|null}[]=[]
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const url=new URL(String(input),'http://localhost'),method=init?.method??'GET'
   if(url.pathname.endsWith('/message-rules/directory')){directoryReads++;return Response.json({items:[{id:rule,name:'保密规则',status,version:control,activeVersionId:active,selectedVersionId:candidate,sourceKind:scenario==='legacy'?'LEGACY_PROJECT':'DEVICE',sourceReferenceId:scenario==='legacy'?null:device,ruleType:scenario==='legacy'?null:'ATTRS_RPT',actionTypes:[]}],nextCursor:null,totalCount:'1'})}
   if(method==='POST'){
    posts++;writes.push({path:url.pathname,expected:url.searchParams.get('expectedVersion')});expect(url.searchParams.get('expectedVersion')).toBe(String(control))
    if(scenario==='pause-unknown'){expect(url.pathname).toMatch(/\/pause$/);control++;status='PAUSED';throw new TypeError('原暂停响应丢失')}
    expect(url.pathname).toContain('/versions/'+(scenario==='legacy'?version:candidate)+'/activate')
    if(scenario==='conflict'&&posts===1){control++;return Response.json({message:'明确CAS冲突'},{status:409})}
    control++;status='ACTIVE';active=scenario==='legacy'?version:candidate
    if(scenario==='conflict')conflictRead=true
    return Response.json({id:rule,version:control,status,activeVersionId:active})
   }
   if(url.pathname.endsWith('/message-rules/'+rule)){
    ruleReads++;if(denied)return Response.json({message:'已撤权'},{status:403});if(conflictRead)return Response.json({message:'合成回读409'},{status:409})
    if(ruleReads===1){if(scenario==='stale-version')control++;if(scenario==='stale-status')status='ACTIVE';if(scenario==='stale-active')active=other}
    return Response.json({id:scenario==='stale-id'&&ruleReads===1?other:rule,version:control,status,activeVersionId:scenario==='pause-unknown'&&ruleReads>1&&wrongRecovery?candidate:active})
   }
   return Response.json({message:'unexpected'},{status:404})
  }))
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/rules/messages',component:RulesPage},{path:'/away',component:{render:()=>h('p','离开')}}]});await router.push('/rules/messages');await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await vi.waitFor(()=>expect(wrapper!.find('[role="switch"]').exists()).toBe(true))
  return {router,writes,initialDirectoryReads:directoryReads,get posts(){return posts},get directoryReads(){return directoryReads},rightRecovery:()=>wrongRecovery=false,deny:()=>denied=true}
 }
 function close(){wrapper?.unmount();wrapper=undefined;document.body.innerHTML=''}
 for(const scenario of ['typed','legacy'] as const){const f=await open(scenario);await wrapper!.get('[role="switch"]').trigger('click');await vi.waitFor(()=>expect(f.directoryReads).toBe(f.initialDirectoryReads+1));expect(f.posts).toBe(1);expect(f.writes[0]!.path).toContain('/versions/'+(scenario==='typed'?candidate:version)+'/activate');expect(f.writes[0]!.expected).toBe('41');expect(wrapper!.get('[role="switch"]').attributes('aria-checked')).toBe('true');close()}
 for(const scenario of ['stale-id','stale-version','stale-status','stale-active'] as const){const f=await open(scenario);await wrapper!.get('[role="switch"]').trigger('click');await vi.waitFor(()=>expect(f.directoryReads).toBe(f.initialDirectoryReads+1));expect(f.posts).toBe(0);expect(wrapper!.text()).toContain('请按最新状态重新操作');const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(false);close()}
 const paused=await open('pause-unknown');await wrapper!.get('[role="switch"]').trigger('click');await vi.waitFor(()=>expect(button('重新读取核对').exists()).toBe(true));expect(paused.posts).toBe(1);expect(paused.writes[0]!.path).toMatch(/\/pause$/);await button('重新读取核对').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('当前规则尚未确认本次状态变更'));expect(wrapper!.get('[role="switch"]').attributes('aria-disabled')).toBe('true');expect(paused.posts).toBe(1);paused.rightRecovery();await button('重新读取核对').trigger('click');await vi.waitFor(()=>expect(paused.directoryReads).toBe(paused.initialDirectoryReads+1));expect(paused.posts).toBe(1);expect(wrapper!.get('[role="switch"]').attributes('aria-checked')).toBe('false');close()
 const conflict=await open('conflict');await wrapper!.get('[role="switch"]').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('请按最新状态重新操作'));await vi.waitFor(()=>expect(wrapper!.get('[role="switch"]').attributes('aria-disabled')).toBe('false'));expect(conflict.posts).toBe(1);const free=new Event('beforeunload',{cancelable:true});window.dispatchEvent(free);expect(free.defaultPrevented).toBe(false)
 await wrapper!.get('[role="switch"]').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('合成回读409'));expect(conflict.posts).toBe(2);const locked=new Event('beforeunload',{cancelable:true});window.dispatchEvent(locked);expect(locked.defaultPrevented).toBe(true);expect(await conflict.router.replace({query:{status:'ACTIVE'}})).toBeTruthy();conflict.deny();await button('重新读取核对').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('原写未确认'));expect(wrapper!.text()).not.toContain('保密规则');expect(conflict.posts).toBe(2);expect(await conflict.router.push('/away')).toBeUndefined();close()
 const unsafe=await open('unsafe-cas');await wrapper!.get('[role="switch"]').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('版本无法安全提交'));expect(unsafe.posts).toBe(0)
})

it('详情排序取消无写，保存复用完整内容CAS；响应丢失只读恢复且未编辑原件不丢',async()=>{
 let ordered='[{"nodeType":"current-device-properties-function","config":{"function":{"format":"COMMON_JS","source":"module.exports = function(a) { return { x: 9007199254740993 }; };"},"delaySeconds":1000}},{"nodeType":"current-device-command-function","config":{"function":{"format":"COMMON_JS","source":"module.exports = function(a) { return { method: \'restart\', params: {} }; };"}}}]',updated=false,puts=0
 const nextVersion='20000000-0000-4000-8000-000000000005'
 const response=()=>{let text=new TextDecoder().decode(raw(ordered));if(updated)text=text.replace('"versionId":"'+version+'"','"versionId":"'+nextVersion+'"').replace('"versionNumber":"1"','"versionNumber":"2"').replace('"version":9007199254740993','"version":9007199254740994');return new Response(text,{headers:{'Content-Type':'application/json'}})}
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input),'http://localhost'),method=init?.method??'GET'
  if(url.pathname.endsWith('/message-rule-content-actions'))return Response.json({actions:[]})
  if(url.pathname.endsWith('/devices/'+device))return Response.json({id:device,name:'真实来源'})
  if(url.pathname.endsWith('/tags'))return new Response('{"ruleId":"'+rule+'","version":'+(updated?'9007199254740994':'9007199254740993')+',"tags":{}}')
  if(url.pathname.endsWith('/device-source'))return Response.json(sourceView(rule,await response().text()))
  if(url.pathname.endsWith('/message-rule-contents/'+rule)){
   if(method==='PUT'){puts++;const fields=readRawRuleJson(new TextEncoder().encode(String(init?.body)));expect(fields.at(['expectedVersion']).string()).toBe('9007199254740993');expect(fields.at(['baseVersionId']).string()).toBe(version);ordered=fields.at(['actions']).raw();expect(ordered.indexOf('current-device-command-function')).toBeLessThan(ordered.indexOf('current-device-properties-function'));expect(ordered).toContain('9007199254740993');updated=true;throw new TypeError('lost PUT reply')}
   return response()
  }
  return Response.json({message:'unexpected'},{status:404})
 }))
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/rules/messages/:id',component:MessageRuleActionDetailPage}]});await router.push('/rules/messages/'+rule);await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await vi.waitFor(()=>expect(wrapper!.find('.rule-heading').exists()).toBe(true))
 await button('排序').trigger('click');await wrapper.get('[aria-label="拖拽排序操作 1"]').trigger('keydown',{key:'ArrowDown'});await button('取消').trigger('click');expect(puts).toBe(0);expect(wrapper.findAll('.operation-card')[0]!.text()).toContain('向当前设备下发属性')
 await button('排序').trigger('click');await wrapper.get('[aria-label="拖拽排序操作 1"]').trigger('dragstart',{dataTransfer:{effectAllowed:'',setData:()=>undefined}});await wrapper.findAll('.operation-card')[1]!.trigger('drop');await button('保存排序').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('结果尚未完整核对'));expect(puts).toBe(1);expect(wrapper!.find('.rule-heading').exists()).toBe(false);expect(wrapper!.findAll('button').some(node=>['取消','保存排序'].includes(node.text()))).toBe(false);await button('读取原规则核对').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).not.toContain('结果尚未完整核对'));expect(puts).toBe(1);expect(wrapper.findAll('.operation-card')[0]!.text()).toContain('向当前设备下发命令');expect(wrapper.find('.sort-handle').exists()).toBe(false)
})

it('详情明确409锁住旧CAS；读取最新完整上下文后重新决定，新保存使用最新版本',async()=>{
 let control='9007199254740993',title='上报规则',puts=0
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input),'http://localhost'),method=init?.method??'GET'
  if(url.pathname.endsWith('/message-rule-content-actions'))return Response.json({actions:[]})
  if(url.pathname.endsWith('/devices/'+device))return Response.json({id:device,name:'真实来源'})
  if(url.pathname.endsWith('/tags'))return new Response('{"ruleId":"'+rule+'","version":'+control+',"tags":{}}')
  if(url.pathname.endsWith('/device-source'))return Response.json(sourceView(rule,new TextDecoder().decode(raw()).replace('"version":9007199254740993','"version":'+control).replace('"name":"上报规则"','"name":'+JSON.stringify(title))))
  if(url.pathname.endsWith('/message-rules/'+rule)&&method==='PUT'){puts++;const body=readRawRuleJson(new TextEncoder().encode(String(init?.body)));expect(body.at(['expectedVersion']).integerText()).toBe(control);if(puts===1){control='9007199254740994';title='另一窗口名称';return Response.json({message:'明确冲突'},{status:409})}title=body.at(['name']).string();control='9007199254740995';return Response.json({id:rule})}
  if(url.pathname.endsWith('/message-rule-contents/'+rule))return new Response(new TextDecoder().decode(raw()).replace('"version":9007199254740993','"version":'+control).replace('"name":"上报规则"','"name":'+JSON.stringify(title)))
  return Response.json({message:'unexpected'},{status:404})
 }))
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/rules/messages/:id',component:MessageRuleActionDetailPage}]});await router.push('/rules/messages/'+rule);await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await vi.waitFor(()=>expect(wrapper!.find('.rule-heading').exists()).toBe(true));await button('编辑').trigger('click');await wrapper.get('[aria-label="规则名称"]').setValue('我的修改');await button('保存').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('请读取最新规则后重新决定'));expect(puts).toBe(1);expect(button('保存').attributes('disabled')).toBeDefined();await button('读取最新规则').trigger('click');await vi.waitFor(()=>expect(wrapper!.get('.rule-heading').text()).toContain('另一窗口名称'));expect(puts).toBe(1);await button('编辑').trigger('click');await wrapper.get('[aria-label="规则名称"]').setValue('重新决定名称');await button('保存').trigger('click');await vi.waitFor(()=>expect(wrapper!.get('.rule-heading').text()).toContain('重新决定名称'));expect(puts).toBe(2)
})

it.each([200,404])('删除响应丢失后只GET本人原回执：首读%s仍未知、迟到原件匹配后退出且不重发',async status=>{
 let posts=0,reads=0,key='',contentReads=0
 const receipt=()=>({projectId:project,ruleId:rule,actorId:project,expectedDefinitionVersion:'9007199254740993',deletedDefinitionVersion:'9007199254740994',deletedAt:'2026-11-01T08:00:00Z'})
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input),'http://localhost'),method=init?.method??'GET'
  if(url.pathname.endsWith('/message-rule-content-actions'))return Response.json({actions:[]})
  if(url.pathname.endsWith('/devices/'+device))return Response.json({id:device,name:'真实来源'})
  if(url.pathname.endsWith('/tags'))return new Response('{"ruleId":"'+rule+'","version":9007199254740993,"tags":{}}')
  if(url.pathname.endsWith('/device-source'))return Response.json(sourceView(rule,new TextDecoder().decode(raw())))
  if(url.pathname.endsWith('/deletions')&&method==='POST'){posts++;key=new Headers(init?.headers).get('Idempotency-Key')!;expect(key).toBeTruthy();expect(JSON.parse(String(init?.body))).toEqual({expectedDefinitionVersion:'9007199254740993'});throw new TypeError('delete response lost')}
  if(url.pathname.endsWith('/deletions/by-key')){reads++;expect(method).toBe('GET');expect(url.search).toBe('');expect(new Headers(init?.headers).get('Original-Request-Key')).toBe(key);if(reads===1)return status===404?Response.json({message:'未查到原件'},{status:404}):Response.json({...receipt(),actorId:device});return Response.json(receipt())}
  if(url.pathname.endsWith('/message-rule-contents/'+rule)){contentReads++;return new Response(raw())}
  throw new Error('不应重DELETE或读取普通规则推断原结果：'+method+' '+url.pathname)
 }))
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/rules/messages/:id',component:MessageRuleActionDetailPage},{path:'/rules/messages',component:{render:()=>h('p','返回目录')}}]});await router.push({path:'/rules/messages/'+rule,query:{tab:'settings',origin:'directory'}});await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}});await vi.waitFor(()=>expect(wrapper!.find('.rule-heading').exists()).toBe(true));await button('移除规则').trigger('click');await flushPromises();const dialog=wrapper.findAll('.el-dialog').find(node=>node.text().includes('确认移除当前规则'))!;await dialog.findAll('button').find(node=>node.text()==='移除')!.trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('结果尚未完整核对'));expect(posts).toBe(1);await button('读取原删除回执').trigger('click');await vi.waitFor(()=>expect(reads).toBe(1));await flushPromises();expect(router.currentRoute.value.path).toBe('/rules/messages/'+rule);expect(contentReads).toBe(1);expect(posts).toBe(1)
 if(status===404){expect(wrapper!.find('.rule-heading').exists()).toBe(false);expect(wrapper!.text()).not.toContain('上报规则');expect(wrapper!.text()).toContain('当前未查到原删除回执')}
 else expect(wrapper!.text()).toContain('原删除回执不匹配')
 await button('读取原删除回执').trigger('click');await vi.waitFor(()=>expect(router.currentRoute.value.path).toBe('/rules/messages'));expect(posts).toBe(1);expect(reads).toBe(2);expect(contentReads).toBe(1)
})

it('结构化创建首POST携完整键值标签，标签回读丢失后只GET核同CAS与映射不补写',async()=>{
 const original=fetch;let tagReads=0
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(String(input),'http://localhost');if(url.pathname.endsWith('/tags')){tagReads++;expect(url.searchParams.get('expectedDefinitionVersion')).toBe('1');if(tagReads===1)throw new TypeError('tag read reply lost')}return original(input,init)}))
 await setup('EVENT_RPT');await wrapper!.get('[aria-label="事件标识符"]').setValue('event_sample');await add();expect(wrapper!.get('[aria-label="标签 1 名称"]').attributes('placeholder')).toBe('标签名称，比如：服务商');await wrapper!.get('[aria-label="标签 1 名称"]').setValue('空值');await button('添加标签').trigger('click');await wrapper!.get('[aria-label="标签 2 名称"]').setValue('__proto__');await wrapper!.get('[aria-label="标签 2 值"]').setValue('  额外原文  ');await button('创建').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('创建结果尚未完整核对'));expect(wrapper!.emitted('created')).toBeUndefined();expect(button('创建').attributes('disabled')).toBeDefined();await button('读取原规则核对').trigger('click');await vi.waitFor(()=>expect(wrapper!.emitted('created')?.[0]).toEqual([rule]));expect(tagReads).toBe(2);const writes=calls.filter(call=>call.method!=='GET');expect(writes).toHaveLength(1);expect(writes[0]!.method).toBe('POST');expect(JSON.parse(writes[0]!.body).tags).toEqual(Object.fromEntries([['空值',''],['__proto__','  额外原文  ']]));expect(writes.some(call=>call.path.endsWith('/tags'))).toBe(false)
})
it('创建标签重名拒绝且不丢空值或额外键，内容修订不附带标签对象',async()=>{
 await setup();await add();await wrapper!.get('[aria-label="标签 1 名称"]').setValue('部门');await button('添加标签').trigger('click');await wrapper!.get('[aria-label="标签 2 名称"]').setValue('部门');await wrapper!.get('[aria-label="标签 2 值"]').setValue('  原文  ');await button('创建').trigger('click');expect(wrapper!.text()).toContain('标签名称不能重复');expect(calls.filter(call=>call.method==='POST')).toHaveLength(0);expect((wrapper!.get('[aria-label="标签 2 值"]').element as HTMLInputElement).value).toBe('  原文  ');await wrapper!.get('[aria-label="标签 2 名称"]').setValue('额外键');await button('创建').trigger('click');await vi.waitFor(()=>expect(wrapper!.emitted('created')?.[0]).toEqual([rule]));const tags=JSON.parse(calls.find(call=>call.method==='POST')!.body).tags;expect(tags).toEqual({部门:'',额外键:'  原文  '});const before=decodeRuleContent(raw()),draft:RuleContentDraft={name:before.name,description:before.description,source,kind:before.kind,identifier:before.identifier,filterJson:before.filterJson,actions:before.actions,tags};expect(JSON.parse(contentBody(draft,before))).not.toHaveProperty('tags');expect(contentBody(draft,before)).toContain('9007199254740993');const large={...draft,actions:[{id:'large',nodeType:'device-property-set-action',config:{properties:{payload:'x'.repeat(40000)}}}],tags:Object.fromEntries(Array.from({length:32},(_,index)=>['键'+index,'😀'.repeat(256)]))};expect(new TextEncoder().encode(contentBody(large)).length).toBeGreaterThan(65536)
})

it('外部动作首存分离密码意图，回读按URL及随机writeId确认，不用密码哈希或忽略新ref',()=>{
 const writeId='20000000-0000-4000-8000-000000000010',ref='20000000-0000-4000-8000-000000000011',urlRef='20000000-0000-4000-8000-000000000012'
 const mqtt=parsePreprocessJson('{"host":"broker.example.com","port":8880,"username":"worker","topic":"events/fixture","messageFormat":"SIMPLE","tls":true,"credentialConfigured":false}') as Record<string,never>
 const draft:RuleContentDraft={name:'上报规则',description:'',source,kind:'ATTRS_RPT',identifier:'',filterJson:filter,actions:[{id:'url',nodeType:'external-url-forward-action',config:{url:'https://receiver.example.com/events',messageFormat:'ADVANCED',ignoreSslError:false}},{id:'mqtt',nodeType:'external-mqtt-forward-action',config:mqtt,credential:{mode:'REPLACE',writeId,value:'fixture-password-only'}}]}
 const sent=JSON.parse(contentBody(draft));expect(readRawRuleJson(new TextEncoder().encode(contentBody(draft))).at(['actions',1,'config','port']).integerText()).toBe('8880');expect(sent.actions[1].credential).toEqual({mode:'REPLACE',writeId,value:'fixture-password-only'});expect(sent.actions[1].config).not.toHaveProperty('credentialConfigured');expect(JSON.stringify(sent.actions[1].config)).not.toContain('fixture-password-only')
 const response=[{nodeType:'external-url-forward-action',config:{...draft.actions[0]!.config,targetRef:urlRef,targetDigest:'a'.repeat(64)}},{nodeType:'external-mqtt-forward-action',config:{host:'broker.example.com',port:8880,username:'worker',topic:'events/fixture',messageFormat:'SIMPLE',tls:true,targetDigest:'b'.repeat(64),credentialConfigured:true,credentialRef:ref,credentialWriteId:writeId}}]
 const read=()=>decodeRuleContent(raw(JSON.stringify(response)))
 expect(()=>confirmRuleContent(draft,read())).not.toThrow();response[1]!.config.credentialWriteId=device;expect(()=>confirmRuleContent(draft,read())).toThrow('未完整确认');response[1]!.config.credentialWriteId=writeId
 const leaked=JSON.parse(JSON.stringify(response));leaked[1].config.password='must-not-be-a-view';expect(()=>decodeRuleContent(raw(JSON.stringify(leaked)))).toThrow('未完整确认')
})

it('外部MQTT编辑省略密码保持权威引用，CLEAR须回读完全移除，不把配置标记当写权限',()=>{
 const ref='20000000-0000-4000-8000-000000000011',writeId='20000000-0000-4000-8000-000000000010'
 const response={nodeType:'external-mqtt-forward-action',config:{host:'broker.example.com',port:8880,topic:'events/fixture',messageFormat:'SIMPLE',tls:true,targetDigest:'b'.repeat(64),credentialConfigured:true,credentialRef:ref,credentialWriteId:writeId}}
 const saved=decodeRuleContent(raw(JSON.stringify([response]))),draft:RuleContentDraft={name:saved.name,description:saved.description,source,kind:saved.kind,identifier:'',filterJson:saved.filterJson,actions:saved.actions}
 expect(JSON.parse(contentBody(draft)).actions[0]).not.toHaveProperty('credential');expect(JSON.parse(contentBody(draft)).actions[0].config).not.toHaveProperty('credentialConfigured');expect(()=>confirmRuleContent(draft,saved)).not.toThrow()
 draft.actions=[{...saved.actions[0]!,credential:{mode:'CLEAR'}}];expect(()=>confirmRuleContent(draft,saved)).toThrow('未完整确认')
 const cleared=JSON.parse(JSON.stringify(response));cleared.config.credentialConfigured=false;delete cleared.config.credentialRef;delete cleared.config.credentialWriteId;expect(()=>confirmRuleContent(draft,decodeRuleContent(raw(JSON.stringify([cleared]))))).not.toThrow()
})

function ordinaryDetailFixture(external=false,status:'ACTIVE'|'PAUSED'='ACTIVE',initialControl='9007199254740993'){
 const second='20000000-0000-4000-8000-000000000099',sourceSet={kind:'DEVICE',referenceId:null,referenceIds:[device,second]},originalFunction='module.exports = attributes => attributes;\r\n'
 let currentActions='[{"nodeType":"current-device-properties-function","config":{"function":{"format":"COMMON_JS","source":'+JSON.stringify(originalFunction)+'}}},{"nodeType":"current-device-command-function","config":{"function":{"format":"COMMON_JS","source":"module.exports = attributes => ({method: \'restart\', params: {}});"}}}]',currentFilter='{"operator":"ALL","conditions":[{"pointer":"/temperature","operator":"GTE","value":2.0000000000000003}],"groups":[]}',control=initialControl,number='1',currentVersion=version,lose=false,deny=false,readStatus=0,wrongDigest=false,rejectStatus=0
 let activeVersion=version,activationMode:'normal'|'lost'|'ledger'|'reject'|'drift'=external?'reject':'normal',savedReads=0
 const privateUrl='https://receiver.example.com/private-original',urlRef='20000000-0000-4000-8000-000000000050',credentialRef='20000000-0000-4000-8000-000000000051'
 const sha=async(value:string)=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex')
 const calls:{method:string;path:string;body:string;expected:string|null;key:string|null}[]=[]
 const tags={区域:'机房',empty:''},title='原名称',description='完整描述'
 async function snapshot(){const actions=JSON.parse(currentActions);if(wrongDigest&&external)actions[0].config.targetDigest='0'.repeat(64);return '{"rule":{"id":'+JSON.stringify(rule)+',"name":'+JSON.stringify(title)+',"description":'+JSON.stringify(description)+',"status":'+JSON.stringify(status)+',"activeVersionId":'+JSON.stringify(activeVersion)+',"version":'+control+'},"versionId":'+JSON.stringify(currentVersion)+',"versionNumber":'+JSON.stringify(number)+',"deviceSource":'+JSON.stringify(sourceSet)+',"trigger":{"kind":"ATTRS_RPT","identifier":null,"filter":'+currentFilter+'},"actions":'+(wrongDigest&&external?JSON.stringify(actions):currentActions)+'}'}
 async function ready(){if(external)currentActions=JSON.stringify([{nodeType:'external-url-forward-action',config:{url:privateUrl,targetRef:urlRef,targetDigest:await sha(privateUrl),messageFormat:'SIMPLE',ignoreSslError:false}},{nodeType:'external-mqtt-forward-action',config:{host:'broker.example.com',port:8883,username:'worker',topic:'events/project',messageFormat:'SIMPLE',tls:true,credentialConfigured:false,targetDigest:'a'.repeat(64)}}])}
 async function fetcher(input:RequestInfo|URL,init?:RequestInit){const url=new URL(String(input),'http://localhost'),path=url.pathname,method=String(init?.method??'GET').toUpperCase(),body=String(init?.body??'');calls.push({path,method,body,expected:url.searchParams.get('expectedVersion'),key:new Headers(init?.headers).get('Idempotency-Key')})
  if(method==='POST'&&path.endsWith('/console/alarm-rule-source-properties/query'))return Response.json({kind:'DEVICE',sourceIds:[device,second],bindings:[{sourceId:device,modelVersionId:version,name:'来源甲'},{sourceId:second,modelVersionId:version,name:'来源乙'}],properties:[{key:'temperature',dataType:'NUMBER',label:'温度'}]})
  if(method==='POST'&&path.endsWith('/activate')){
   expect(path).toBe('/api/v1/projects/'+project+'/message-rules/'+rule+'/versions/'+currentVersion+'/activate');expect(url.searchParams.get('expectedVersion')).toBe(control);expect(new Headers(init?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
   if(activationMode==='ledger')return Response.json({code:10014,message:'原生效结果处理中'},{status:409})
   if(activationMode==='reject')return Response.json({message:'当前操作尚未接入运行'},{status:409})
   activeVersion=currentVersion;status='ACTIVE';control=String(BigInt(control)+1n)
   if(activationMode==='lost'){activationMode='normal';throw new TypeError('activation reply lost')}
   return new Response('{"id":'+JSON.stringify(rule)+',"status":"ACTIVE","activeVersionId":'+JSON.stringify(activeVersion)+',"version":'+control+'}')
  }
  if(path.endsWith('/message-rule-content-actions'))return Response.json({actions:(external?['external-url-forward-action','external-mqtt-forward-action']:['current-device-properties-function','current-device-command-function']).map(nodeType=>({nodeType,configSchema:{type:'object',properties:{},required:[]}}))})
  if(path.endsWith('/devices/'+device)||path.endsWith('/devices/'+second))return Response.json({id:path.split('/').at(-1),name:path.endsWith(device)?'来源甲':'来源乙'})
  if(path.endsWith('/tags'))return new Response('{"ruleId":'+JSON.stringify(rule)+',"version":'+control+',"tags":'+JSON.stringify(tags)+'}')
  if(path.endsWith('/message-rule-contents/'+rule)){
   if(method==='PUT'){
    if(deny)return Response.json({message:'当前已失权'},{status:403});if(rejectStatus)return Response.json({message:'当前配置被明确拒绝'},{status:rejectStatus})
    const value=readRawRuleJson(new TextEncoder().encode(body));expect(value.at(['expectedVersion']).string()).toBe(control);expect(value.at(['baseVersionId']).string()).toBe(currentVersion);expect(JSON.parse(value.at(['deviceSource']).raw())).toEqual(sourceSet);expect(value.at(['name']).string()).toBe(title);expect(value.at(['description']).string()).toBe(description);expect(value.optional(['tags'])).toBeUndefined();expect(value.optional(['activeVersionId'])).toBeUndefined();currentFilter=value.at(['trigger','filter']).raw();currentActions=value.at(['actions']).raw()
    if(external){const rows=JSON.parse(currentActions);for(const row of rows){if(row.nodeType==='external-url-forward-action')row.config={...row.config,targetRef:row.config.targetRef??urlRef,targetDigest:await sha(row.config.url)};else if(row.nodeType==='external-mqtt-forward-action'){row.config={...row.config,targetDigest:'a'.repeat(64),credentialConfigured:!!row.credential||!!row.config.credentialRef};if(row.credential?.mode==='REPLACE'){row.config.credentialRef=credentialRef;row.config.credentialWriteId=row.credential.writeId}delete row.credential}}currentActions=JSON.stringify(rows)}
    savedReads=0;control=String(BigInt(control)+1n);number=String(BigInt(number)+1n);currentVersion='70000000-0000-4000-8000-'+number.padStart(12,'0');if(lose){lose=false;throw new TypeError('PUT reply lost')}return new Response(await snapshot())
   }
   if(readStatus)return Response.json({message:'当前结果不可读'},{status:readStatus});if(++savedReads===2&&activationMode==='drift'){control=String(BigInt(control)+1n);activationMode='normal'}return new Response(await snapshot())
  }
  throw new Error('不允许未指定请求 '+method+' '+path)
 }
 return {ready,fetcher,calls,activation:(mode:typeof activationMode)=>activationMode=mode,resolveActivation:()=>{activeVersion=currentVersion;status='ACTIVE';control=String(BigInt(control)+1n);activationMode='normal'},get active(){return activeVersion},get latest(){return currentVersion},get control(){return control},reject:(status:number)=>rejectStatus=status,lose:()=>lose=true,deny:()=>deny=true,read:(status:number)=>readStatus=status,digest:(wrong:boolean)=>wrongDigest=wrong,writes:()=>calls.filter(row=>row.method!=='GET'&&!row.path.endsWith('/console/alarm-rule-source-properties/query')),get actions(){return currentActions},get filter(){return currentFilter},originalFunction,tags}
}
async function mountOrdinaryDetail(fixture:ReturnType<typeof ordinaryDetailFixture>){await fixture.ready();vi.stubGlobal('fetch',vi.fn(fixture.fetcher));const router=createRouter({history:createMemoryHistory(),routes:[{path:'/rules/messages/:id',component:MessageRuleActionDetailPage}]});await router.push('/rules/messages/'+rule);await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus],provide:{[refreshRuleSourceEntry as symbol]:async()=>{}},stubs:{RuleSourceInline:true}}});await vi.waitFor(()=>expect(wrapper!.findAll('.operation-card')).toHaveLength(2))}
function ordinaryDialog(){return Array.from(document.body.querySelectorAll<HTMLElement>('[role="dialog"]')).find(node=>node.closest<HTMLElement>('.el-overlay')?.style.display!=='none'&&['添加操作','配置操作','提示'].includes(node.querySelector('.el-dialog__title')?.textContent?.trim()??''))}
async function ordinaryClick(label:string,dialog=false){const root=dialog?ordinaryDialog()!:document.body,control=Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(row=>row.textContent?.trim()===label||row.getAttribute('aria-label')===label);expect(control,label).toBeTruthy();control!.click();await flushPromises()}
async function ordinaryCode(value:string){const control=document.body.querySelector<HTMLTextAreaElement>('[aria-label="云函数源码"]')!;expect(control).toBeTruthy();control.value=value;control.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises()}
async function ordinarySettled(){await vi.waitFor(()=>expect(ordinaryDialog()).toBeUndefined());await vi.waitFor(()=>expect(Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(row=>row.textContent?.trim()==='添加操作')?.disabled).toBe(false))}
it('普通消息详情动作ACTIVE直存独立生效，条件PAUSED不激活且双写CAS预算闭合',async()=>{
 const f=ordinaryDetailFixture();await mountOrdinaryDetail(f);expect(wrapper!.find('[aria-label="规则名称"]').exists()).toBe(false)
 await ordinaryClick('编辑规则条件');await wrapper!.get('[aria-label="数值比较值"]').setValue('3.0000000000000003');await ordinaryClick('取消规则条件');expect(f.writes()).toHaveLength(0)
 await ordinaryClick('编辑规则条件');expect((wrapper!.get('[aria-label="数值比较值"]').element as HTMLInputElement).value).toBe('2.0000000000000003');await wrapper!.get('[aria-label="数值比较值"]').setValue('3.0000000000000003');await ordinaryClick('保存规则条件');await ordinarySettled();expect(f.writes()).toHaveLength(1);expect(f.filter).toContain('30000000000000003e-16');expect(f.active).toBe(version)
 await ordinaryClick('编辑操作 1');await ordinaryCode('module.exports = value => ({cancelled:true});');await ordinaryClick('取消',true);expect(f.writes()).toHaveLength(1);expect(JSON.parse(f.actions)[0].config.function.source).toBe(f.originalFunction)
 await ordinaryClick('编辑操作 1');await ordinaryCode('module.exports = value => ({edited:true});');await ordinaryClick('保存',true);await ordinarySettled();expect(f.writes()).toHaveLength(3);expect(f.active).toBe(f.latest);expect(wrapper!.text()).toContain('已保存并生效')
 await ordinaryClick('添加操作');document.body.querySelector<HTMLElement>('[data-action-type="current-device-command-function"]')!.click();await flushPromises();await ordinaryCode('module.exports = value => ({method:"new",params:{}});');await ordinaryClick('保存',true);await ordinarySettled();expect(f.writes()).toHaveLength(5);expect(wrapper!.findAll('.operation-card')).toHaveLength(3)
 await ordinaryClick('排序');await wrapper!.get('[aria-label="拖拽排序操作 1"]').trigger('keydown',{key:'ArrowDown'});await ordinaryClick('取消');expect(f.writes()).toHaveLength(5)
 await ordinaryClick('排序');await wrapper!.get('[aria-label="拖拽排序操作 1"]').trigger('keydown',{key:'ArrowDown'});await ordinaryClick('保存排序');await ordinarySettled();expect(f.writes()).toHaveLength(7);expect(JSON.parse(f.actions)[0].nodeType).toBe('current-device-command-function')
 await ordinaryClick('移除操作 2');await ordinaryClick('确定',true);await ordinarySettled();expect(f.writes()).toHaveLength(9)
 await ordinaryClick('移除操作 2');await ordinaryClick('确定',true);await ordinarySettled();expect(f.writes()).toHaveLength(11)
 await ordinaryClick('移除操作 1');await ordinaryClick('确定',true);expect(document.body.textContent).toContain('请至少保留1项操作');expect(f.writes()).toHaveLength(11);await ordinaryClick('取消',true)
 expect(f.writes().filter(row=>row.method==='PUT')).toHaveLength(6);expect(f.writes().filter(row=>row.method==='POST')).toHaveLength(5);expect(new Set(f.writes().filter(row=>row.method==='POST').map(row=>row.key)).size).toBe(5);expect(f.active).toBe(f.latest);expect(f.control).toBe('9007199254741004');expect(f.filter).toContain('30000000000000003e-16')
 wrapper!.unmount();wrapper=undefined;document.body.innerHTML=''
 const paused=ordinaryDetailFixture(false,'PAUSED');await mountOrdinaryDetail(paused);await ordinaryClick('编辑操作 1');await ordinaryCode('module.exports = value => ({paused:true});');await ordinaryClick('保存',true);await ordinarySettled();expect(paused.writes()).toHaveLength(1);expect(paused.active).toBe(version);expect(paused.latest).not.toBe(version)
 wrapper!.unmount();wrapper=undefined;document.body.innerHTML=''
 const exhausted=ordinaryDetailFixture(false,'ACTIVE','9223372036854775806');await mountOrdinaryDetail(exhausted);await ordinaryClick('编辑操作 1');await ordinaryCode('module.exports = value => ({noBudget:true});');await ordinaryClick('保存',true);expect(exhausted.writes()).toHaveLength(0);expect(document.body.textContent).toContain('无法完成保存并生效')
})
it('普通消息内容未知显式继续且激活未知只GET，漂移拒绝403与身份变化保持原边界',async()=>{
 for(const mode of ['filter','function'] as const){
  const f=ordinaryDetailFixture();await mountOrdinaryDetail(f)
  if(mode==='filter'){await ordinaryClick('编辑规则条件');await wrapper!.get('[aria-label="数值比较值"]').setValue('4.0000000000000003')}else{await ordinaryClick('编辑操作 1');await ordinaryCode('module.exports = value => ({privatePending:true});')}
  f.lose();await ordinaryClick(mode==='filter'?'保存规则条件':'保存',mode==='function');await vi.waitFor(()=>expect(wrapper!.text()).toContain('结果尚未完整核对'));expect(ordinaryDialog()).toBeUndefined();expect(wrapper!.findAll('.operation-card')).toHaveLength(0);expect(f.writes()).toHaveLength(1)
  f.read(404);await ordinaryClick('读取原规则核对');expect(wrapper!.text()).toContain('结果尚未完整核对');expect(f.writes()).toHaveLength(1)
  f.read(0);await ordinaryClick('读取原规则核对');await vi.waitFor(()=>expect(wrapper!.findAll('.operation-card')).toHaveLength(2));expect(f.writes()).toHaveLength(1)
  if(mode==='function'){expect(wrapper!.text()).toContain('尚未完成生效');expect(wrapper!.get('[aria-label="返回"]').attributes('disabled')).toBeDefined();await ordinaryClick('继续完成生效');expect(f.writes()).toHaveLength(2)}
  await ordinarySettled();await ordinaryClick('编辑操作 1');await ordinaryCode('module.exports = value => ({privateDenied:true});');f.deny();await ordinaryClick('保存',true);await vi.waitFor(()=>expect(ordinaryDialog()).toBeUndefined());expect(wrapper!.findAll('.operation-card')).toHaveLength(0);expect(document.body.textContent).not.toContain('privateDenied');expect(f.writes()).toHaveLength(mode==='function'?3:2)
  changeIdentity();await flushPromises();expect(wrapper!.findAll('.operation-card')).toHaveLength(0);wrapper!.unmount();wrapper=undefined;document.body.innerHTML='';setAccessToken('content-fixture');session.ready=true;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['rule:manage','device:read']};session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}]
 }
 for(const mode of ['lost','ledger','drift','reject'] as const){
  const f=ordinaryDetailFixture();f.activation(mode);await mountOrdinaryDetail(f);await ordinaryClick('编辑操作 1');await ordinaryCode('module.exports = value => ({activation:true});');await ordinaryClick('保存',true)
  if(mode==='lost'||mode==='ledger'){
   await vi.waitFor(()=>expect(wrapper!.text()).toContain('生效结果尚未完整核对'));expect(f.writes()).toHaveLength(2);f.read(404);await ordinaryClick('读取原状态核对');expect(wrapper!.findAll('.operation-card')).toHaveLength(0);expect(f.writes()).toHaveLength(2)
   f.read(0);if(mode==='ledger')f.resolveActivation();await ordinaryClick('读取原状态核对');await ordinarySettled();expect(f.writes()).toHaveLength(2);expect(f.active).toBe(f.latest)
  }else{
   await vi.waitFor(()=>expect(wrapper!.text()).toContain(mode==='drift'?'规则状态已变化':'内容已保存，但生效未完成'));expect(f.writes()).toHaveLength(mode==='drift'?1:2);expect(f.active).toBe(version);expect(f.latest).not.toBe(version);expect(wrapper!.text()).not.toContain('已保存并生效')
  }
  wrapper!.unmount();wrapper=undefined;document.body.innerHTML=''
 }
})
it('普通外部动作写前固定server同型URL摘要，响应丢失清URL密码，错摘要不解锁且GET原意图恢复',async()=>{
 const f=ordinaryDetailFixture(true);await mountOrdinaryDetail(f);await ordinaryClick('编辑操作 1');const input=document.body.querySelector<HTMLInputElement>('[aria-label="推送URL"]')!;expect(input).toBeTruthy();input.value='https://receiver.example.com/new-private-path';input.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises();f.reject(400);await ordinaryClick('保存',true);expect(ordinaryDialog()?.textContent).toContain('当前配置被明确拒绝');expect(input.value).toBe('https://receiver.example.com/new-private-path');expect(f.writes()).toHaveLength(1);f.reject(409);await ordinaryClick('保存',true);await vi.waitFor(()=>expect(ordinaryDialog()).toBeUndefined());expect(wrapper!.text()).toContain('请读取最新规则后重新决定');expect(f.writes()).toHaveLength(2);f.reject(0);await ordinaryClick('读取最新规则');await ordinarySettled();await ordinaryClick('编辑操作 1');const revised=document.body.querySelector<HTMLInputElement>('[aria-label="推送URL"]')!;revised.value='https://receiver.example.com/new-private-path';revised.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises();f.lose();await ordinaryClick('保存',true);await vi.waitFor(()=>expect(wrapper!.text()).toContain('结果尚未完整核对'));expect(ordinaryDialog()).toBeUndefined();expect(document.body.textContent).not.toContain('new-private-path');f.read(404);await ordinaryClick('读取原规则核对');expect(f.writes()).toHaveLength(3);f.read(0);f.digest(true);await ordinaryClick('读取原规则核对');expect(wrapper!.text()).toContain('原URL保存结果尚未完整核对');expect(f.writes()).toHaveLength(3);f.digest(false);await ordinaryClick('读取原规则核对');await vi.waitFor(()=>expect(wrapper!.text()).toContain('继续完成生效'));await ordinaryClick('继续完成生效');expect(wrapper!.text()).toContain('内容已保存，但生效未完成');await ordinaryClick('读取最新规则');await ordinarySettled();expect(f.writes()).toHaveLength(4)
 await ordinaryClick('编辑操作 2');const password=document.body.querySelector<HTMLInputElement>('[aria-label="password"]')!;password.value='fixture-new-private-password';password.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises();f.lose();await ordinaryClick('保存',true);await vi.waitFor(()=>expect(wrapper!.text()).toContain('结果尚未完整核对'));expect(document.body.textContent).not.toContain('fixture-new-private-password');await ordinaryClick('读取原规则核对');await vi.waitFor(()=>expect(wrapper!.text()).toContain('继续完成生效'));await ordinaryClick('继续完成生效');await ordinaryClick('读取最新规则');await ordinarySettled();expect(f.writes()).toHaveLength(6)
 const {freezeRuleContentRecovery,confirmRuleContentRecovery}=await import('../../src/features/rules/rule-content-recovery');const snapshot=decodeRuleContent(new TextEncoder().encode(await (await f.fetcher('http://localhost/api/v1/projects/'+project+'/message-rule-contents/'+rule)).text())),draft:RuleContentDraft={name:snapshot.name,description:snapshot.description,kind:snapshot.kind,source:sourceSelection(snapshot.source),identifier:snapshot.identifier,filterJson:snapshot.filterJson,actions:snapshot.actions};const frozen=await freezeRuleContentRecovery(snapshot,draft);expect(JSON.stringify(frozen,(_,value)=>typeof value==='bigint'?String(value):value)).not.toContain('https://');expect(JSON.stringify(frozen,(_,value)=>typeof value==='bigint'?String(value):value)).not.toContain('fixture-new-private-password');expect(frozen.urls[0]!.digest).toBe(snapshot.actions[0]!.config.targetDigest);await expect(confirmRuleContentRecovery(frozen,snapshot)).rejects.toThrow()
})

it('创建返回上一步只清操作保描述标签，同步配置取消不清空且未知不允许返回',async()=>{
 await setup();await add();await wrapper!.get('[aria-label="规则描述"]').setValue('返回保留描述');await wrapper!.get('[aria-label="标签 1 名称"]').setValue('空值');const {default:Actions}=await import('../../src/features/rules/RuleActionsEditor.vue');const actions=()=>wrapper!.findComponent(Actions).props('modelValue');const original=actions()[0]!.config
 document.body.querySelector<HTMLButtonElement>('[aria-label="编辑操作"]')!.click();await flushPromises();const dialog=Array.from(document.body.querySelectorAll<HTMLElement>('[role="dialog"]')).find(node=>node.closest<HTMLElement>('.el-overlay')?.style.display!=='none'&&node.querySelector('.el-dialog__title')?.textContent?.trim()==='配置操作')!;Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(row=>row.textContent?.trim()==='取消')!.click();await flushPromises();expect(actions()).toHaveLength(1);expect(actions()[0]!.config).toEqual(original)
 await button('上一步').trigger('click');expect(wrapper!.emitted('previous')).toHaveLength(1);expect(actions()).toEqual([]);expect((wrapper!.get('[aria-label="规则描述"]').element as HTMLTextAreaElement).value).toBe('返回保留描述');expect((wrapper!.get('[aria-label="标签 1 名称"]').element as HTMLInputElement).value).toBe('空值');expect(calls.filter(row=>row.method==='POST')).toHaveLength(0);await wrapper!.setProps({name:'返回改名'});await add();fail=true;await button('创建').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('创建结果尚未完整核对'));expect(button('上一步').attributes('disabled')).toBeDefined();await button('上一步').trigger('click');expect(wrapper!.emitted('previous')).toHaveLength(1);expect(actions()).toHaveLength(1);expect(calls.filter(row=>row.method==='POST')).toHaveLength(1)
})


it('动作详情状态开关固定latest与active，漂移零写且未知仅精确GET恢复，保已有ID和时间',async()=>{
 const createdAt='2026-11-01T02:03:04Z',updatedAt='2026-11-01T04:05:06Z',original=new TextDecoder().decode(raw()),withTimes=original.replace('"status":"PAUSED"','"createdAt":'+JSON.stringify(createdAt)+',"updatedAt":'+JSON.stringify(updatedAt)+',"status":"PAUSED"')
 const before=decodeRuleContent(new TextEncoder().encode(withTimes)),old=decodeRuleContent(raw());expect(before.createdAt).toBe(createdAt);expect(before.updatedAt).toBe(updatedAt);expect(before.activeVersionId).toBe(version);expect(old.createdAt).toBeUndefined();expect(old.updatedAt).toBeUndefined();const anchor=makeRuleContentStateIntent(before,true,'20000000-0000-4000-8000-000000000099');expect(anchor).not.toHaveProperty('actions');expect(anchor).not.toHaveProperty('name');expect(anchor).not.toHaveProperty('filterJson');expect(decodeRuleContent(new TextEncoder().encode(original.replace('"activeVersionId":"'+version+'",',''))).activeVersionId).toBeUndefined()
 const draft:RuleContentDraft={name:before.name,description:before.description,source,kind:before.kind,identifier:before.identifier,filterJson:before.filterJson,actions:before.actions},body=contentBody(draft,before);expect(body).toBe(contentBody(draft,old));expect(JSON.parse(body)).not.toHaveProperty('createdAt');expect(JSON.parse(body)).not.toHaveProperty('updatedAt');expect(body).toContain('9007199254740993')
 expect(()=>confirmRuleContent(draft,{...before,definitionVersion:'9007199254740994',versionId:'20000000-0000-4000-8000-000000000005',versionNumber:'2',createdAt:'2026-11-02T01:00:00Z',updatedAt:'2026-11-02T02:00:00Z'},before)).not.toThrow()
 const candidate='20000000-0000-4000-8000-000000000005',other='20000000-0000-4000-8000-000000000006',base=9007199254740993n,actions=JSON.stringify([{nodeType:'current-device-properties-function',config:{function:{format:'COMMON_JS',source:'module.exports = function(report_attributes) { return {fan:false}; };'}}}])
 async function open(initial:'PAUSED'|'ACTIVE'='PAUSED',missingActive=false){
  let control=base,status=initial,active:string|null=missingActive?null:version,lastBefore=base,variant='exact',lose=false,drift=false,reject=false,ledgerUnknown=false,holdRead:Promise<void>|undefined,releaseRead:(()=>void)|undefined
  const calls:{method:string;path:string;expected:string|null;key:string|null}[]=[]
  function value(){let text=new TextDecoder().decode(raw(actions)).replace('"version":9007199254740993','"version":'+String(variant==='cas0'?lastBefore:variant==='cas2'?lastBefore+2n:control)).replace('"status":"PAUSED"','"createdAt":'+JSON.stringify(createdAt)+',"updatedAt":'+JSON.stringify(updatedAt)+',"status":'+JSON.stringify(status)).replace('"activeVersionId":"'+version+'"','"activeVersionId":'+JSON.stringify(variant==='wrong-active'?candidate:active)).replace('"versionId":"'+version+'"','"versionId":'+JSON.stringify(variant==='wrong-latest'?other:candidate)).replace('"versionNumber":"1"','"versionNumber":"2"');if(variant==='wrong-source')text=text.replace('"referenceId":"'+device+'"','"referenceId":"'+other+'"');return text}
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
   const url=new URL(String(input),'http://localhost'),method=init?.method??'GET';calls.push({method,path:url.pathname,expected:url.searchParams.get('expectedVersion'),key:new Headers(init?.headers).get('Idempotency-Key')})
   if(method==='POST'){
    expect(url.searchParams.get('expectedVersion')).toBe(String(control));expect(new Headers(init?.headers).get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/)
    if(reject)return Response.json({message:'本版本包含尚未接入运行的操作'},{status:409})
    if(ledgerUnknown){ledgerUnknown=false;return Response.json({code:10014,message:'原状态处理未决'},{status:409})}
    lastBefore=control;control++;if(url.pathname.endsWith('/activate')){expect(url.pathname).toContain('/versions/'+candidate+'/activate');status='ACTIVE';active=candidate}else{expect(url.pathname).toMatch(/\/pause$/);status='PAUSED'}
    if(lose){lose=false;throw new TypeError('原状态响应丢失')}
    return new Response(readRawRuleJson(new TextEncoder().encode(value())).at(['rule']).raw())
   }
   if(url.pathname.endsWith('/message-rule-contents/'+rule)){if(holdRead){const wait=holdRead;holdRead=undefined;await wait}if(variant==='404'||variant==='403')return Response.json({message:variant==='403'?'已撤销规则权限':'原状态暂不可读'},{status:Number(variant)});if(drift){drift=false;control++}return new Response(value())}
   if(url.pathname.endsWith('/message-rule-content-actions'))return Response.json({actions:[]})
   if(url.pathname.endsWith('/devices/'+device))return Response.json({id:device,name:'真实来源'})
   if(url.pathname.endsWith('/tags'))return new Response('{"ruleId":"'+rule+'","version":'+String(control)+',"tags":{}}')
   throw new Error('不允许额外读取 '+url.pathname)
  }))
  const router=createRouter({history:createMemoryHistory(),routes:[{path:'/rules/messages/:id',component:MessageRuleActionDetailPage},{path:'/away',component:{render:()=>h('p','离开')}}]});await router.push('/rules/messages/'+rule);await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus],provide:{[refreshRuleSourceEntry as symbol]:async()=>{}},stubs:{RuleSourceInline:true}}});await vi.waitFor(()=>expect(wrapper!.find('.basic-information').exists()).toBe(true))
  return{router,calls,writes:()=>calls.filter(row=>row.method!=='GET'),hold:()=>{holdRead=new Promise<void>(resolve=>{releaseRead=resolve})},release:()=>releaseRead?.(),lose:()=>lose=true,drift:()=>drift=true,reject:(value:boolean)=>reject=value,ledger:()=>ledgerUnknown=true,matchingState:()=>{control++;status='ACTIVE';active=candidate},view:(value:string)=>variant=value,get status(){return status},get active(){return active}}
 }
 const stateSwitch=()=>wrapper!.get('.rule-status [role="switch"]')
 const toggle=async()=>{await stateSwitch().trigger('click');await flushPromises()}
 const ready=async()=>{await vi.waitFor(()=>expect(stateSwitch().attributes('aria-disabled')).toBe('false'))}
 const close=()=>{wrapper?.unmount();wrapper=undefined;document.body.innerHTML=''}
 const normal=await open();expect(wrapper!.get('.rule-heading p').text()).toBe('ID：'+rule);expect(wrapper!.get('.basic-information').text()).toContain('设备来源类型设备');const metadata=wrapper!.findAll('.basic-information dl>div');expect(metadata.find(row=>row.get('dt').text()==='创建时间')!.get('dd').text()).toBe('2026-11-01 10:03:04');expect(metadata.find(row=>row.get('dt').text()==='修改时间')!.get('dd').text()).toBe('2026-11-01 12:05:06');expect(normal.calls).toHaveLength(4);expect(normal.writes()).toHaveLength(0)
 normal.hold();await stateSwitch().trigger('click');await vi.waitFor(()=>expect(stateSwitch().attributes('aria-checked')).toBe('true'));expect(wrapper!.findAll('button').some(row=>row.text()==='继续完成生效')).toBe(false);expect(wrapper!.find('.rule-heading').exists()).toBe(true);normal.release();await flushPromises();await ready();expect(normal.writes()).toHaveLength(1);expect(normal.calls.filter(row=>row.method==='GET')).toHaveLength(6);expect(normal.active).toBe(candidate);expect(normal.writes()[0]!.expected).toBe(String(base));await toggle();await vi.waitFor(()=>expect(stateSwitch().attributes('aria-checked')).toBe('false'));await ready();expect(normal.writes()).toHaveLength(2);expect(normal.writes()[1]!.path).toMatch(/\/pause$/)
 normal.reject(true);await toggle();await vi.waitFor(()=>expect(wrapper!.text()).toContain('本版本包含尚未接入运行的操作'));expect(normal.writes()).toHaveLength(3);expect(stateSwitch().attributes('aria-checked')).toBe('false');expect(wrapper!.findAll('button').some(row=>row.text()==='读取原状态核对')).toBe(false);normal.reject(false);await button('读取最新规则').trigger('click');await ready();expect(normal.writes()).toHaveLength(3);close()
 const stale=await open();stale.drift();await toggle();await vi.waitFor(()=>expect(wrapper!.text()).toContain('规则状态已变化'));expect(stale.writes()).toHaveLength(0);await button('读取最新规则').trigger('click');await ready();expect(stale.writes()).toHaveLength(0);close()
 const missing=await open('ACTIVE',true);await toggle();expect(wrapper!.text()).toContain('活动版本读取不完整');expect(missing.writes()).toHaveLength(0);close()
 const unknown=await open('ACTIVE');unknown.lose();await toggle();await vi.waitFor(()=>expect(wrapper!.text()).toContain('结果尚未完整核对'));expect(unknown.writes()).toHaveLength(1);expect(unknown.writes()[0]!.path).toMatch(/\/pause$/)
 for(const variant of ['cas0','cas2','wrong-active','wrong-latest','wrong-source']){unknown.view(variant);const reads=unknown.calls.filter(row=>row.method==='GET'&&row.path.endsWith('/message-rule-contents/'+rule)).length;await button('读取原状态核对').trigger('click');await vi.waitFor(()=>expect(button('读取原状态核对').attributes('disabled')).toBeUndefined());expect(unknown.calls.filter(row=>row.method==='GET'&&row.path.endsWith('/message-rule-contents/'+rule))).toHaveLength(reads+1);expect(wrapper!.text()).toContain('当前规则尚未确认目标状态');expect(stateSwitch().attributes('aria-disabled')).toBe('true');expect(unknown.writes()).toHaveLength(1)}
 unknown.view('404');await button('读取原状态核对').trigger('click');await vi.waitFor(()=>expect(wrapper!.find('.rule-heading').exists()).toBe(false));expect(button('读取原状态核对').exists()).toBe(true);const locked=new Event('beforeunload',{cancelable:true});window.dispatchEvent(locked);expect(locked.defaultPrevented).toBe(true);expect(unknown.writes()).toHaveLength(1)
 unknown.view('exact');await button('读取原状态核对').trigger('click');await ready();expect(stateSwitch().attributes('aria-checked')).toBe('false');expect(unknown.active).toBe(version);expect(unknown.writes()).toHaveLength(1)
 unknown.lose();await toggle();await vi.waitFor(()=>expect(wrapper!.text()).toContain('结果尚未完整核对'));unknown.view('403');await button('读取原状态核对').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('原写未确认'));expect(wrapper!.find('.rule-heading').exists()).toBe(false);expect(wrapper!.findAll('button').some(row=>row.text()==='读取原状态核对')).toBe(false);expect(unknown.writes()).toHaveLength(2);expect(await unknown.router.push('/away')).toBeUndefined();close()
 const identity=await open();identity.ledger();await toggle();await vi.waitFor(()=>expect(wrapper!.text()).toContain('原状态处理未决'));expect(button('读取原状态核对').exists()).toBe(true);expect(identity.writes()).toHaveLength(1);await button('读取原状态核对').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('当前规则尚未确认目标状态'));expect(identity.writes()).toHaveLength(1);identity.matchingState();await button('读取原状态核对').trigger('click');await ready();expect(identity.writes()).toHaveLength(1);identity.lose();await toggle();await vi.waitFor(()=>expect(wrapper!.text()).toContain('结果尚未完整核对'));changeIdentity();await flushPromises();expect(wrapper!.find('.rule-heading').exists()).toBe(false);expect(wrapper!.findAll('button').some(row=>row.text()==='读取原状态核对')).toBe(false);expect(identity.writes()).toHaveLength(2)
})


it('普通详情来源编辑不反向自锁，选择保存取消可用且父导航和其它写操作保持锁定',async()=>{
 const second='20000000-0000-4000-8000-000000000006',nextVersion='20000000-0000-4000-8000-000000000007',base='9007199254740993',sha='a'.repeat(64)
 const before:RuleSourceSnapshot={ruleId:rule,definitionVersion:base,status:'PAUSED',readOnly:false,deviceSource:{kind:'DEVICE',referenceId:device},activeVersionId:version,activeVersionNumber:'1',activeSourceSha256:sha,latestVersionId:version,latestVersionNumber:'1',latestSourceSha256:sha}
 let current=before
 const writes:{path:string;body:string}[]=[]
 const content=()=>'{"rule":{"id":'+JSON.stringify(rule)+',"name":"来源锁检查","description":"原说明","status":"PAUSED","activeVersionId":'+JSON.stringify(current.activeVersionId)+',"version":'+current.definitionVersion+'},"versionId":'+JSON.stringify(current.latestVersionId)+',"versionNumber":'+JSON.stringify(current.latestVersionNumber)+',"deviceSource":'+JSON.stringify(current.deviceSource)+',"trigger":{"kind":"ATTRS_RPT","identifier":null,"filter":'+filter+'},"actions":[{"nodeType":"device-property-set-action","config":{"properties":{"temperature":24.5}}}]}'
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input),'http://localhost'),method=String(init?.method??'GET').toUpperCase()
  if(url.pathname.endsWith('/device-source')){
   if(method==='PUT'){
    writes.push({path:url.pathname,body:String(init?.body)});const body=JSON.parse(String(init?.body))
    expect(body).toEqual({deviceSource:{kind:'DEVICE',referenceId:null,referenceIds:[device,second]},expectedDefinitionVersion:base,baseLatestVersionId:version,baseActiveVersionId:version})
    current={...before,definitionVersion:String(BigInt(base)+1n),deviceSource:body.deviceSource,activeVersionId:nextVersion,activeVersionNumber:'2',latestVersionId:nextVersion,latestVersionNumber:'2'}
   }
   return Response.json(current)
  }
  expect(method).toBe('GET')
  if(url.pathname.endsWith('/message-rule-contents/'+rule))return new Response(content(),{headers:{'Content-Type':'application/json'}})
  if(url.pathname.endsWith('/message-rule-content-actions'))return Response.json({actions:[]})
  if(url.pathname.endsWith('/tags'))return new Response('{"ruleId":'+JSON.stringify(rule)+',"version":'+current.definitionVersion+',"tags":{"origin":"retained"}}')
  if(url.pathname.endsWith('/devices/search'))return Response.json({items:[{id:device,name:'设备一'},{id:second,name:'设备二'}],hasMore:false,nextCursor:null})
  if(url.pathname.endsWith('/devices/'+device))return Response.json({id:device,projectId:project,name:'设备一'})
  if(url.pathname.endsWith('/devices/'+second))return Response.json({id:second,projectId:project,name:'设备二'})
  throw new Error('不应读取额外接口 '+url.pathname)
 }))
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/rules/messages/:id',component:MessageRuleActionDetailPage},{path:'/away',component:{render:()=>h('p','离开')}}]})
 await router.push('/rules/messages/'+rule);await router.isReady();wrapper=mount(RouterView,{attachTo:document.body,global:{plugins:[router,ElementPlus]}})
 const inline=()=>wrapper!.findComponent({name:'RuleSourceInline'}),picker=()=>inline().findComponent({name:'TaskChoiceSelect'})
 const sourceButton=(label:string)=>{const node=inline().findAll('button').find(value=>value.text()===label);expect(node,label).toBeDefined();return node!}
 await vi.waitFor(()=>expect(inline().find('.source-edit').exists()).toBe(true))
 await sourceButton('编辑').trigger('click')
 await vi.waitFor(()=>expect(picker().props('disabled')).toBe(false))
 expect(wrapper.get('[aria-label="返回"]').attributes('disabled')).toBeDefined()
 expect(wrapper.get('[role="switch"][aria-label="启用规则"]').attributes('aria-disabled')).toBe('true')
 expect(await router.push('/away')).toBeDefined();expect(router.currentRoute.value.path).toBe('/rules/messages/'+rule)
 picker().vm.$emit('update:modelValue',[device,second]);await vi.waitFor(()=>expect(picker().props('modelValue')).toEqual([device,second]))
 expect(sourceButton('保存').attributes('disabled')).toBeUndefined();expect(sourceButton('取消').attributes('disabled')).toBeUndefined()
 await sourceButton('取消').trigger('click');await vi.waitFor(()=>expect(inline().find('.source-edit').exists()).toBe(true))
 expect(writes).toHaveLength(0);expect(wrapper.get('[aria-label="返回"]').attributes('disabled')).toBeUndefined()
 await sourceButton('编辑').trigger('click');await vi.waitFor(()=>expect(picker().props('disabled')).toBe(false))
 picker().vm.$emit('update:modelValue',[device,second]);await vi.waitFor(()=>expect(picker().props('modelValue')).toEqual([device,second]))
 await sourceButton('保存').trigger('click');await vi.waitFor(()=>expect(inline().find('.source-edit').exists()).toBe(true))
 expect(writes).toHaveLength(1);expect(writes[0]!.path).toBe('/api/v1/projects/'+project+'/message-rules/'+rule+'/device-source')
 expect(inline().findAll('.source-tags a').map(value=>value.text())).toEqual(['设备一','设备二'])
 expect(wrapper.get('[aria-label="返回"]').attributes('disabled')).toBeUndefined();expect(current.status).toBe('PAUSED');expect(current.latestSourceSha256).toBe(sha)
})
