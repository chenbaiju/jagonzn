import {afterEach,beforeEach,expect,it,vi} from 'vitest'
vi.mock('../../src/features/rules/rule-function-editor-engine', () => import('./function-editor-engine-mock'))
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {defineComponent,ref,type Ref} from 'vue'
import {webcrypto} from 'node:crypto'
import ElementPlus from 'element-plus'
import RuleActionsEditor,{type ActionDraft} from '../../src/features/rules/RuleActionsEditor.vue'
import RuleActionDeviceTarget from '../../src/features/rules/RuleActionDeviceTarget.vue'
import TaskChoiceSelect from '../../src/features/rules/TaskChoiceSelect.vue'
import {changeIdentity,setAccessToken} from '../../src/core/http'
import {session} from '../../src/core/session'
import {ExactDecimal} from '../../src/features/rules/preprocess-exact-json'
import {contentBody} from '../../src/features/rules/message-rule-content-api'
const project='20000000-0000-4000-8000-000000000001',target='20000000-0000-4000-8000-000000000002',otherProject='20000000-0000-4000-8000-000000000003'
const types=['device-report-properties-function','device-report-cloud-properties-function','device-report-command-function','device-report-data-function'] as const
const labels=['向指定设备下发属性','向指定设备更新云端属性','向指定设备下发命令','向指定设备下发自定义数据']
let wrapper:VueWrapper|undefined,rows:Ref<ActionDraft[]>,deny=false
function button(text:string){const el=[...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()===text||node.querySelector('strong')?.textContent===text);expect(el,text).toBeDefined();return el!}
async function click(text:string){button(text).click();await flushPromises()}
function setup(initial:ActionDraft[]=[],choices:readonly string[]=types){rows=ref(initial);const catalog={actions:choices.map(nodeType=>({nodeType,configSchema:{}}))};const Host=defineComponent({components:{RuleActionsEditor},setup:()=>({rows,catalog}),template:'<RuleActionsEditor v-model="rows" :catalog="catalog"/>'});wrapper=mount(Host,{attachTo:document.body,global:{plugins:[ElementPlus]}})}
beforeEach(()=>{changeIdentity();setAccessToken('target-fixture');session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['rule:manage','device:read']};session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}];deny=false;vi.stubGlobal('crypto',webcrypto);vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{const url=new URL(String(input),'http://localhost');if(url.pathname.endsWith('/devices/search'))return Response.json({items:[],hasMore:false,nextCursor:null});if(url.pathname.endsWith('/devices/'+target))return deny?Response.json({message:'设备不可读取'},{status:403}):Response.json({id:target,name:'目标设备实名'});return Response.json({message:'unexpected'},{status:404})}))})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;document.body.innerHTML='';session.user=null;session.projects=[];vi.unstubAllGlobals();changeIdentity()})
it.each(types)('%s只保存已核对目标、report_attributes函数和合法延迟；DATA另保协议/流',async type=>{
 setup();await click('添加操作');await click(labels[types.indexOf(type)]!);await click('保存');expect(rows.value).toHaveLength(0);expect(document.body.textContent).toContain('请选择并核对目标设备');const source=document.querySelector<HTMLTextAreaElement>('[aria-label="云函数源码"]')!.value;expect(source).toContain('function(report_attributes)');expect(document.body.textContent).toContain(type==='device-report-cloud-properties-function'?'更新到设备':'下发到设备');wrapper!.findComponent(TaskChoiceSelect).vm.$emit('update:modelValue',[target]);await flushPromises();await vi.waitFor(()=>expect(wrapper!.findComponent(TaskChoiceSelect).text()).toContain('目标设备实名'));expect(wrapper!.findComponent(TaskChoiceSelect).text()).not.toContain(target)
 const delay=wrapper!.findAllComponents({name:'ElSwitch'}).find(node=>node.props('ariaLabel')==='是否延迟执行')!;delay.vm.$emit('update:modelValue',true);await flushPromises();wrapper!.findComponent({name:'ElInputNumber'}).vm.$emit('update:modelValue',1000);await flushPromises()
 if(type==='device-report-data-function'){wrapper!.findComponent({name:'ElRadioGroup'}).vm.$emit('update:modelValue','TCP');const input=document.querySelector<HTMLInputElement>('[aria-label="自定义数据流"]')!;input.value='target-stream';input.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises()}
 await click('保存');expect(rows.value).toHaveLength(1);expect(rows.value[0]!.nodeType).toBe(type);expect(rows.value[0]!.config).toMatchObject({targetDeviceId:target,function:{format:'COMMON_JS',source}});expect((rows.value[0]!.config.delaySeconds as ExactDecimal).literal).toBe('1000');const body=contentBody({name:'目标函数',description:'',source:{kind:'DEVICE_TYPE',referenceId:otherProject,name:'来源类型'},kind:'ATTRS_RPT',identifier:'',filterJson:'{"operator":"ALL","conditions":[],"groups":[]}',actions:rows.value});expect(body).toContain('"delaySeconds": 1000');if(type==='device-report-data-function')expect(rows.value[0]!.config).toMatchObject({protocol:'TCP',streamIdentifier:'target-stream'});else expect(rows.value[0]!.config.protocol).toBeUndefined()
})
it('编辑目标没有当前读取权限时不回填裸UUID、不放行保存，取消保留原件',async()=>{
 const initial:ActionDraft={id:'saved',nodeType:types[0],config:{targetDeviceId:target,function:{format:'COMMON_JS',source:'module.exports = function(report_attributes) { return {}; };'}}};deny=true;setup([initial]);await flushPromises();await wrapper!.get('[aria-label="编辑操作"]').trigger('click');await flushPromises();await vi.waitFor(()=>expect(document.body.textContent).toContain('设备不可读取'));expect(wrapper!.findComponent(TaskChoiceSelect).text()).not.toContain(target);await click('保存');expect(rows.value[0]!.config).toEqual(initial.config);expect(document.body.textContent).toContain('请选择并核对目标设备');await click('取消');expect(rows.value).toEqual([initial])
})
it('目标设备读取晚到跨项目时丢弃，不把旧scope实名或标识带入新选择',async()=>{
 let complete:(value:Response)=>void=()=>undefined
 vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{const url=new URL(String(input),'http://localhost');if(url.pathname.endsWith('/devices/search'))return Response.json({items:[],hasMore:false,nextCursor:null});return new Promise<Response>(resolve=>{complete=resolve})}))
 wrapper=mount(RuleActionDeviceTarget,{props:{initialId:target},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises();session.user={...session.user!,currentProjectId:otherProject};await flushPromises();complete(Response.json({id:target,name:'旧项目晚到实名',projectId:project}));await flushPromises();expect(wrapper.emitted('selected')?.filter(event=>event[0]!==undefined)).toHaveLength(0);expect(wrapper.text()).not.toContain('旧项目晚到实名');expect(wrapper.findComponent(TaskChoiceSelect).props('modelValue')).toEqual([])
})

it.each([['event-device-properties-function','向其它设备下发属性'],['event-device-command-function','向其它设备下发命令']] as const)('%s保留event入参和实名目标，不出现延迟或DATA配置',async(type,label)=>{
 setup([],[type]);await click('添加操作');await click(label);
 expect(document.body.textContent).not.toContain('是否延迟执行');expect(document.body.textContent).not.toContain('推送方式');
 const source=document.querySelector<HTMLTextAreaElement>('[aria-label="云函数源码"]')!.value;expect(source).toContain('function (event)');
 wrapper!.findComponent(TaskChoiceSelect).vm.$emit('update:modelValue',[target]);await flushPromises();await vi.waitFor(()=>expect(wrapper!.findComponent(TaskChoiceSelect).text()).toContain('目标设备实名'));
 await click('保存');expect(rows.value).toHaveLength(1);expect(rows.value[0]!.config).toEqual({targetDeviceId:target,function:{format:'COMMON_JS',source}});
})


it.each(['ATTRS_RPT','EVENT_RPT'] as const)('%s TYPE只过滤相应新增目标菜单，未定/DEVICE不变且历史原件仍可编辑取消',async triggerKind=>{
 const eventTypes=['event-device-properties-function','event-device-command-function']
 const choices=[...types,...eventTypes,'current-device-properties-function','event-cloud-function']
 const excluded=triggerKind==='ATTRS_RPT'?[...types]:eventTypes
 const code=triggerKind==='ATTRS_RPT'?'module.exports = function(report_attributes) { return null; };':'module.exports = function (event) { return null; };'
 const initial:ActionDraft[]=excluded.map((nodeType,index)=>({id:'saved-'+index,nodeType,config:{targetDeviceId:target,function:{format:'COMMON_JS',source:code},...(nodeType==='device-report-data-function'?{protocol:'TCP',streamIdentifier:'saved-stream'}:{})}}))
 const original=JSON.stringify(initial)
 const catalog={actions:choices.map(nodeType=>({nodeType,configSchema:{properties:{targetDeviceId:{type:'string'}},required:['targetDeviceId']}}))}
 wrapper=mount(RuleActionsEditor,{props:{modelValue:initial,catalog,triggerKind},attachTo:document.body,global:{plugins:[ElementPlus]}})
 const selected=()=>[...document.querySelectorAll<HTMLElement>('[data-action-type]')].map(node=>node.dataset.actionType)
 await click('添加操作');expect(selected()).toEqual(choices)
 await wrapper.setProps({deviceSource:{kind:'DEVICE_TYPE',members:[]}});expect(selected()).toEqual(choices)
 await wrapper.setProps({deviceSource:{kind:'DEVICE_TYPE',referenceId:otherProject,name:'实际类型'}})
 expect(selected()).toEqual(choices.filter(type=>!excluded.includes(type)))
 await wrapper.setProps({deviceSource:{kind:'DEVICE',referenceIds:[project,target]}})
 expect(selected()).toEqual(choices)
 await wrapper.setProps({deviceSource:{kind:'DEVICE_TYPE',referenceId:otherProject}})
 expect(selected()).toEqual(choices.filter(type=>!excluded.includes(type)))
 const close=document.querySelector<HTMLButtonElement>('.el-dialog__headerbtn');expect(close).not.toBeNull();close!.click();await flushPromises()
 expect(wrapper.findAll('[aria-label="编辑操作"]')).toHaveLength(initial.length)
 for(let index=0;index<initial.length;index++){
  await wrapper.findAll('[aria-label="编辑操作"]')[index]!.trigger('click');await flushPromises()
  expect(wrapper.findComponent({name:'RuleFunctionCodeEditor'}).props('modelValue')).toBe(code)
  await vi.waitFor(()=>expect(wrapper!.findComponent(TaskChoiceSelect).text()).toContain('目标设备实名'))
  if(initial[index]!.nodeType==='device-report-data-function')expect(document.querySelector<HTMLInputElement>('[aria-label="自定义数据流"]')!.value).toBe('saved-stream')
  await click('取消')
 }
 expect(JSON.stringify(initial)).toBe(original)
 expect(wrapper.emitted('update:modelValue')).toBeUndefined()
})
