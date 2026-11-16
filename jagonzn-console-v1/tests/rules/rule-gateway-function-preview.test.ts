import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {defineComponent} from 'vue'
import ElementPlus from 'element-plus'
import RuleGatewayFunctionPreview from '../../src/features/rules/RuleGatewayFunctionPreview.vue'
import RuleEventPreviewDevicePicker from '../../src/features/rules/RuleEventPreviewDevicePicker.vue'
import TaskChoiceSelect from '../../src/features/rules/TaskChoiceSelect.vue'
import * as ruleSourceApi from '../../src/features/rules/rule-source-api'
import * as typeDevicesApi from '../../src/features/device-types/type-devices-api'
import {ApiError,changeIdentity,setAccessToken} from '../../src/core/http'
import {session} from '../../src/core/session'

const project='20000000-0000-4000-8000-000000000001'
const source='module.exports = function(report_attributes) { return { child: { temperature: report_attributes.temperature } }; };'
const JsonEditor=defineComponent({props:['modelValue','ariaLabel','readonly','disabled'],emits:['update:modelValue'],template:'<textarea :value="modelValue" :aria-label="ariaLabel" :readonly="readonly" :disabled="disabled" @input="$emit(\'update:modelValue\',$event.target.value)"/>'})
let wrapper:VueWrapper|undefined
beforeEach(()=>{changeIdentity();setAccessToken('preview-fixture');session.ready=true;session.transitioning=false;session.user={accountId:project,currentProjectId:project,projectRole:'OWNER',permissions:['rule:manage']};session.projects=[{id:project,status:'ACTIVE',myRole:'OWNER'}]})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;session.user=null;session.projects=[];vi.unstubAllGlobals();changeIdentity();document.body.innerHTML=''})
async function setup(){wrapper=mount(RuleGatewayFunctionPreview,{props:{source},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{JsonCodeEditor:JsonEditor}}});await wrapper.get('button').trigger('click');await flushPromises()}
async function run(){const button=wrapper!.findAll('button').find(node=>node.text()==='运行')!;expect(button).toBeDefined();await button.trigger('click');await flushPromises()}

it('用未保存全文和输入执行纯预览，错误状态不显示成功输出或保存操作',async()=>{
 const calls:{path:string;body:string;method:string}[]=[];let reject=false
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{calls.push({path:String(url),body:String(init?.body),method:String(init?.method)});return Response.json(reject?{phase:'EXECUTION',status:'FAILURE',errorCode:'SCRIPT_RUNTIME_ERROR',durationMillis:2}:{phase:'EXECUTION',status:'SUCCESS',outputJson:'{"child":{"temperature":25.5}}',durationMillis:2})}))
 await setup();await wrapper!.get('[aria-label="设备上报属性样例"]').setValue('{"temperature":25.5}');await run()
 expect(calls).toHaveLength(1);expect(calls[0]!.path).toContain(`/projects/${project}/message-rule-function-previews/gateway-properties`);expect(calls[0]!.method).toBe('POST')
 expect(JSON.parse(calls[0]!.body)).toEqual({nodeType:'report-gateway-properties-function',function:{format:'COMMON_JS',source},input:{temperature:25.5}})
 expect((wrapper!.get('[aria-label="生成转发子设备的属性"]').element as HTMLTextAreaElement).value).toContain('25.5')
 reject=true;await run();expect(wrapper!.text()).toContain('SCRIPT_RUNTIME_ERROR');expect(wrapper!.find('[aria-label="生成转发子设备的属性"]').exists()).toBe(false);expect(wrapper!.findAll('button').some(node=>node.text()==='保存')).toBe(false)
})

it('源码改变丢弃晚到输出，真实失权清除样例并上报父入口',async()=>{
 let complete:(value:Response)=>void=()=>undefined
 vi.stubGlobal('fetch',vi.fn(async()=>new Promise<Response>(resolve=>{complete=resolve})))
 await setup();await run();await wrapper!.setProps({source:'module.exports = function(report_attributes) { return {}; };'});complete(Response.json({phase:'EXECUTION',status:'SUCCESS',outputJson:'{"private":"old"}',durationMillis:1}));await flushPromises();expect(wrapper!.find('[aria-label="生成转发子设备的属性"]').exists()).toBe(false)
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({message:'当前权限不可读取'},{status:403})))
 await wrapper!.get('[aria-label="设备上报属性样例"]').setValue('{"private":"sample"}');await run();expect(wrapper!.emitted('denied')).toHaveLength(1);expect(wrapper!.find('[aria-label="设备上报属性样例"]').exists()).toBe(false);expect(wrapper!.text()).not.toContain('sample');expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false])
})

it.each([['event-device-properties-function','生成的下发属性'],['event-device-command-function','生成的下发命令']] as const)('%s发送事件原函数到纯预览入口且不携带真实目标',async(nodeType,label)=>{
 const calls:{path:string;body:Record<string,unknown>}[]=[];let mode='SUCCESS'
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{calls.push({path:String(url),body:JSON.parse(String(init?.body))});return mode==='DENIED'?Response.json({message:'当前权限不可读取'},{status:403}):Response.json(mode==='FAILURE'?{phase:'EXECUTION',status:'FAILURE',errorCode:'SANDBOX_SCRIPT_FAILURE',durationMillis:1}:{phase:'EXECUTION',status:'SUCCESS',outputJson:'{"temperature":26}',durationMillis:1})}))
 const eventSource='module.exports = function(event) { return { temperature: event.temperature }; };'
 wrapper=mount(RuleGatewayFunctionPreview,{props:{source:eventSource,nodeType},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{JsonCodeEditor:JsonEditor}}})
 await wrapper.get('button').trigger('click');expect(wrapper.get(`[aria-label="${label}"]`).element).toHaveProperty('value','');expect(wrapper.text()).toContain('模拟设备上报属性');await wrapper.get('[aria-label="设备上报属性样例"]').setValue('{"temperature":26}');const test=async()=>{await wrapper!.findAll('button').find(node=>node.text()==='测试')!.trigger('click');await flushPromises()};await test()
 expect(calls).toHaveLength(1);expect(calls[0]!.path).toContain('/message-rule-function-previews/event-target')
 expect(calls[0]!.body).toEqual({nodeType,function:{format:'COMMON_JS',source:eventSource},input:{temperature:26}})
 expect(wrapper.get(`[aria-label="${label}"]`).element).toHaveProperty('value',expect.stringContaining('26'));expect(wrapper.text()).toContain('测试调用成功')
 mode='FAILURE';await test();expect(wrapper.get(`[aria-label="${label}"]`).element).toHaveProperty('value','');expect(wrapper.text()).toContain('测试调用失败 SANDBOX_SCRIPT_FAILURE');expect(wrapper.text()).not.toContain('测试调用成功');mode='DENIED';await test();expect(wrapper.emitted('denied')).toHaveLength(1);expect(wrapper.find('[aria-label="设备上报属性样例"]').exists()).toBe(false);expect(wrapper.find(`[aria-label="${label}"]`).exists()).toBe(false);expect(wrapper.emitted('busy')?.at(-1)).toEqual([false]);expect(calls).toHaveLength(3)
})

it('ATTRS_PUSH草稿只发单参属性输入并核实际字节，null无下发、错误和不符字节不能冒成功',async()=>{
 const calls:{path:string;body:Record<string,unknown>}[]=[];let mode='TEXT'
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{calls.push({path:String(url),body:JSON.parse(String(init?.body))});return Response.json(mode==='NULL'?{phase:'EXECUTION',status:'SUCCESS',outputJson:'null',durationMillis:1,payloadBytes:0}:mode==='ERROR'?{phase:'EXECUTION',status:'FAILURE',durationMillis:1,errorCode:'FUNCTION_OUTPUT_INVALID'}:{phase:'EXECUTION',status:'SUCCESS',durationMillis:1,outputJson:'{"type":"text","msg":"ON"}',format:'TEXT',payloadBase64:mode==='TAMPER'?'T0ZG':'T04=',payloadBytes:2})}))
 const pushSource='module.exports = function(push_attributes) { return {type:"text",msg:push_attributes.enabled?"ON":"OFF"}; };'
 wrapper=mount(RuleGatewayFunctionPreview,{props:{source:pushSource,nodeType:'current-device-data-function'},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{JsonCodeEditor:JsonEditor}}});await wrapper.get('button').trigger('click');await wrapper.get('[aria-label="设备下发属性样例"]').setValue('{"enabled":true}');const test=async()=>{await wrapper!.findAll('button').find(node=>node.text()==='测试')!.trigger('click');await flushPromises()};await test();expect(calls[0]!.path).toContain('/message-rule-function-previews/attributes-push-data');expect(calls[0]!.body).toEqual({nodeType:'current-device-data-function',function:{format:'COMMON_JS',source:pushSource},input:{enabled:true}});expect((wrapper.get('[aria-label="生成的下发自定义数据"]').element as HTMLTextAreaElement).value).toBe('ON');expect(wrapper.text()).toContain('测试调用成功');mode='NULL';await test();expect(wrapper.text()).toContain('函数返回null，不生成下行数据');expect(wrapper.find('[aria-label="生成的下发自定义数据"]').exists()).toBe(false);mode='TAMPER';await test();expect(wrapper.text()).not.toContain('测试调用成功');expect(wrapper.find('[aria-label="生成的下发自定义数据"]').exists()).toBe(false);mode='ERROR';await test();expect(wrapper.text()).toContain('FUNCTION_OUTPUT_INVALID');expect(wrapper.text()).not.toContain('测试调用成功');expect(wrapper.findAll('button').some(node=>node.text()==='保存')).toBe(false);expect(calls).toHaveLength(4)
})

it('八类上报设备函数共用独立纯预览且标签准确，DATA核原字节和null而不发送目标配置',async()=>{
 const calls:{path:string;body:Record<string,unknown>}[]=[];let mode='NORMAL'
 const nodes=[['current-device-properties-function','生成的下发属性'],['current-device-cloud-properties-function','生成的更新属性'],['current-device-command-function','生成的下发命令'],['current-device-report-data-function','生成的下发自定义数据'],['device-report-properties-function','生成的下发属性'],['device-report-cloud-properties-function','生成的更新属性'],['device-report-command-function','生成的下发命令'],['device-report-data-function','生成的下发自定义数据']] as const
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{const body=JSON.parse(String(init?.body));calls.push({path:String(url),body});const data=['current-device-report-data-function','device-report-data-function'].includes(body.nodeType);return Response.json(mode==='ERROR'?{phase:'EXECUTION',status:'FAILURE',errorCode:'FUNCTION_OUTPUT_INVALID',durationMillis:1}:data?(mode==='NULL'?{phase:'EXECUTION',status:'SUCCESS',outputJson:'null',payloadBytes:0,durationMillis:1}:{phase:'EXECUTION',status:'SUCCESS',outputJson:'{"type":"text","msg":"ON"}',format:'TEXT',payloadBase64:mode==='TAMPER'?'T0ZG':'T04=',payloadBytes:2,durationMillis:1}):{phase:'EXECUTION',status:'SUCCESS',outputJson:'{"enabled":true}',durationMillis:1})}))
 const reportSource='module.exports = function(report_attributes) { return { enabled: report_attributes.enabled }; };'
 const test=async()=>{await wrapper!.findAll('button').find(node=>node.text()==='测试')!.trigger('click');await flushPromises()}
 for(const[nodeType,label]of nodes){
  wrapper?.unmount();wrapper=mount(RuleGatewayFunctionPreview,{props:{source:reportSource,nodeType},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{JsonCodeEditor:JsonEditor}}});await wrapper.get('button').trigger('click');await wrapper.get('[aria-label="设备上报属性样例"]').setValue('{"enabled":true}');await test()
  expect(calls.at(-1)!.path).toContain(`/projects/${project}/message-rule-function-previews/reported-device`);expect(calls.at(-1)!.body).toEqual({nodeType,function:{format:'COMMON_JS',source:reportSource},input:{enabled:true}});expect(wrapper.find(`[aria-label="${label}"]`).exists()).toBe(true)
 }
 expect(calls).toHaveLength(8);expect((wrapper!.get('[aria-label="生成的下发自定义数据"]').element as HTMLTextAreaElement).value).toBe('ON')
 mode='NULL';await test();expect(wrapper!.text()).toContain('函数返回null，不生成下行数据');expect(wrapper!.find('[aria-label="生成的下发自定义数据"]').exists()).toBe(false)
 mode='TAMPER';await test();expect(wrapper!.text()).not.toContain('测试调用成功');expect(wrapper!.find('[aria-label="生成的下发自定义数据"]').exists()).toBe(false)
 mode='ERROR';await test();expect(wrapper!.text()).toContain('FUNCTION_OUTPUT_INVALID');expect(wrapper!.text()).not.toContain('测试调用成功');expect(wrapper!.findAll('button').some(node=>node.text()==='保存')).toBe(false)
})

it('两前处理测试当前未保存源码和精确JSON样例，按上报下发区分标签并清旧输出',async()=>{
 const calls:{path:string;body:Record<string,unknown>}[]=[];let fail=false
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{calls.push({path:String(url),body:JSON.parse(String(init?.body))});return Response.json(fail?{phase:'EXECUTION',status:'FAILURE',errorCode:'FUNCTION_OUTPUT_INVALID',durationMillis:1}:{phase:'EXECUTION',status:'SUCCESS',outputJson:'{"temperature":26.5}',durationMillis:1})}))
 for(const nodeType of ['attributes-report-preprocess-function','attributes-push-preprocess-function'] as const){
  wrapper?.unmount();const input=nodeType==='attributes-push-preprocess-function'?'设备下发属性':'设备上报属性',draft='module.exports = attributes => ({ temperature: 26.5 });'
  wrapper=mount(RuleGatewayFunctionPreview,{props:{source:draft,nodeType},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{JsonCodeEditor:JsonEditor}}});await wrapper.get('button').trigger('click');await wrapper.get(`[aria-label="${input}样例"]`).setValue('{"temperature":"26.5"}');await wrapper.findAll('button').find(node=>node.text()==='测试')!.trigger('click');await flushPromises();expect(calls.at(-1)!.path).toContain('/message-rule-function-previews/property-preprocess');expect(calls.at(-1)!.body).toEqual({nodeType,function:{format:'COMMON_JS',source:draft},input:{temperature:'26.5'}});expect(wrapper.find('[aria-label="预处理后的属性"]').exists()).toBe(true)
 }
 fail=true;await wrapper!.findAll('button').find(node=>node.text()==='测试')!.trigger('click');await flushPromises();expect(wrapper!.text()).toContain('FUNCTION_OUTPUT_INVALID');expect(wrapper!.find('[aria-label="预处理后的属性"]').exists()).toBe(false);expect(calls).toHaveLength(3)
})


it('EVENT模拟设备只读完整来源候选且显式选择，分页和失权不保留旧设备',async()=>{
 const first='30000000-0000-4000-8000-000000000001',second='30000000-0000-4000-8000-000000000002',type='40000000-0000-4000-8000-000000000001'
 const multi={kind:'DEVICE' as const,referenceId:null,referenceIds:[first,second]},single={kind:'DEVICE' as const,referenceId:second},byType={kind:'DEVICE_TYPE' as const,referenceId:type}
 let pending=false,deny=false,complete:(value:Map<string,string>)=>void=()=>undefined,oldSignal:AbortSignal|undefined
 const names=vi.spyOn(ruleSourceApi,'readRuleSourceNames').mockImplementation(async(_project,source,signal)=>{if(deny)throw new ApiError('当前来源不可读取',403);if(pending){oldSignal=signal;return new Promise(resolve=>{complete=resolve})}return new Map(ruleSourceApi.deviceSourceMembers(source).map(id=>[id,id===first?'真实来源一':'真实来源二']))})
 const typePage=(items:Awaited<ReturnType<typeof typeDevicesApi.readTypeDevices>>['items'],total:string):Awaited<ReturnType<typeof typeDevicesApi.readTypeDevices>>=>({items,total,display:{},alarms:{states:{},unavailable:0},activity:{contractVersion:1,policyReadSupported:true,mode:'DISABLED',observationEpoch:null,supportedFilters:[],positiveKindsByProtocol:{MQTT:[],HTTP:[],COAP:[],TCP:[]},negativeCoverage:'NOT_QUALIFIED',asOf:'2026-11-02T00:00:00Z'}})
 const pages=vi.spyOn(typeDevicesApi,'readTypeDevices').mockImplementation(async(_project,_type,query)=>typePage(query.page===1?[{id:first,name:'类型实际设备一'}]:[{id:second,name:'类型实际设备二'}],'25'))
 const open=async(deviceSource:ruleSourceApi.RuleDeviceSourceContract)=>{wrapper?.unmount();wrapper=mount(RuleEventPreviewDevicePicker,{props:{projectId:project,deviceSource},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises()}
 const picker=()=>wrapper!.getComponent(TaskChoiceSelect),options=()=>picker().findAllComponents({name:'ElOption'}).map(row=>row.props('value'))
 try{
  await open(multi);expect(names).toHaveBeenLastCalledWith(project,multi,expect.any(AbortSignal));expect(options()).toEqual([first,second]);expect(picker().props('modelValue')).toEqual([]);expect(picker().props('placeholder')).toBe('请选择设备')
  picker().vm.$emit('update:modelValue',[second]);await flushPromises();expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual([second]);await wrapper!.setProps({modelValue:second});picker().vm.$emit('update:modelValue',[]);await flushPromises();expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual(['']);picker().vm.$emit('update:modelValue',[type]);await flushPromises();expect(wrapper!.text()).toContain('请选择当前来源中的设备');expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual([''])
  await open(byType);expect(pages).toHaveBeenLastCalledWith(project,type,{page:1,limit:24},expect.any(AbortSignal));expect(options()).toEqual([first]);expect(picker().props('modelValue')).toEqual([]);await picker().findAll('button').find(row=>row.text()==='加载更多')!.trigger('click');await flushPromises();expect(pages).toHaveBeenLastCalledWith(project,type,{page:2,limit:24},expect.any(AbortSignal));expect(options()).toEqual([first,second]);picker().vm.$emit('update:modelValue',[second]);await flushPromises();expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual([second])
  pending=true;await open(multi);expect(oldSignal?.aborted).toBe(false);pending=false;await wrapper!.setProps({deviceSource:single});await flushPromises();expect(oldSignal?.aborted).toBe(true);complete(new Map([[first,'旧来源私有名称'],[second,'旧来源私有名称']]));await flushPromises();expect(options()).toEqual([second]);expect(wrapper!.text()).not.toContain('旧来源私有名称');expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual([''])
  deny=true;await open(single);expect(wrapper!.emitted('denied')).toHaveLength(1);expect(wrapper!.findComponent(TaskChoiceSelect).exists()).toBe(false);expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual(['']);expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false])
  deny=false;pages.mockResolvedValueOnce(typePage([],'0'));await open(byType);expect(options()).toEqual([]);expect(wrapper!.emitted('denied')).toBeUndefined();expect(picker().props('modelValue')).toEqual([])
  changeIdentity();await flushPromises();expect(wrapper!.findComponent(TaskChoiceSelect).exists()).toBe(false);expect(wrapper!.emitted('update:modelValue')?.at(-1)).toEqual(['']);expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false])
 }finally{names.mockRestore();pages.mockRestore()}
})


it.each([['event-device-properties-function','生成的下发属性'],['event-device-command-function','生成的下发命令']] as const)('%s模拟上下文只在显式选择后发送完整pair，清除或换来源保手填event并丢弃晚到',async(nodeType,label)=>{
 const first='30000000-0000-4000-8000-000000000001',second='30000000-0000-4000-8000-000000000002',deviceSource={kind:'DEVICE' as const,referenceId:null,referenceIds:[first,second]},nextSource={kind:'DEVICE' as const,referenceId:first}
 const names=vi.spyOn(ruleSourceApi,'readRuleSourceNames').mockImplementation(async(_project,source)=>new Map(ruleSourceApi.deviceSourceMembers(source).map(id=>[id,id===first?'设备一':'设备二'])))
 const calls:{path:string;body:Record<string,unknown>;signal:AbortSignal}[]=[];let pending=false,denied=false,complete:(value:Response)=>void=()=>undefined
 vi.stubGlobal('fetch',vi.fn(async(url:RequestInfo|URL,init?:RequestInit)=>{calls.push({path:String(url),body:JSON.parse(String(init?.body)),signal:init?.signal as AbortSignal});if(pending)return new Promise<Response>(resolve=>{complete=resolve});return denied?Response.json({message:'权限已撤销'},{status:403}):Response.json({phase:'EXECUTION',status:'SUCCESS',outputJson:'{"temperature":26}',durationMillis:1})}))
 try{
  wrapper=mount(RuleGatewayFunctionPreview,{props:{source,nodeType,deviceSource},attachTo:document.body,global:{plugins:[ElementPlus],stubs:{JsonCodeEditor:JsonEditor}}});await wrapper.get('button').trigger('click');await flushPromises();await wrapper.get('[aria-label="设备上报属性样例"]').setValue('{"temperature":26,"manual":"保持手填"}')
  const test=async()=>{await wrapper!.findAll('button').find(row=>row.text()==='测试')!.trigger('click');await flushPromises()},choose=async(id:string)=>{wrapper!.getComponent(RuleEventPreviewDevicePicker).getComponent(TaskChoiceSelect).vm.$emit('update:modelValue',id?[id]:[]);await flushPromises()},base={nodeType,function:{format:'COMMON_JS',source},input:{temperature:26,manual:'保持手填'}}
  await test();expect(calls).toHaveLength(1);expect(calls[0]!.body).toEqual(base);expect(wrapper.emitted('busy')?.at(-1)).toEqual([false])
  await choose(second);expect(wrapper.get(`[aria-label="${label}"]`).element).toHaveProperty('value','');await test();expect(calls[1]!.body).toEqual({...base,deviceSource,sampleDeviceId:second});expect(calls[1]!.path).toContain('/message-rule-function-previews/event-target');expect(wrapper.get('[aria-label="设备上报属性样例"]').element).toHaveProperty('value','{"temperature":26,"manual":"保持手填"}')
  await choose('');await test();expect(calls[2]!.body).toEqual(base)
  await choose(second);pending=true;await test();expect(calls).toHaveLength(4);await wrapper.setProps({deviceSource:nextSource});await flushPromises();expect(calls[3]!.signal.aborted).toBe(true);expect(wrapper.getComponent(RuleEventPreviewDevicePicker).props('modelValue')).toBe('');complete(Response.json({phase:'EXECUTION',status:'SUCCESS',outputJson:'{"private":"late"}',durationMillis:1}));await flushPromises();expect(wrapper.get(`[aria-label="${label}"]`).element).toHaveProperty('value','');expect(wrapper.get('[aria-label="设备上报属性样例"]').element).toHaveProperty('value','{"temperature":26,"manual":"保持手填"}')
  pending=false;denied=true;await choose(first);await test();expect(calls[4]!.body).toEqual({...base,deviceSource:nextSource,sampleDeviceId:first});expect(wrapper.emitted('denied')).toHaveLength(1);expect(wrapper.find('[aria-label="设备上报属性样例"]').exists()).toBe(false);expect(wrapper.findComponent(RuleEventPreviewDevicePicker).exists()).toBe(false);expect(wrapper.emitted('busy')?.at(-1)).toEqual([false]);expect(calls).toHaveLength(5)
 }finally{names.mockRestore()}
})
