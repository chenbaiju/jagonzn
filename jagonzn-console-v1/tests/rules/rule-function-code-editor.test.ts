import {afterEach,expect,it,vi} from 'vitest'
vi.mock('../../src/features/rules/rule-function-editor-engine', () => import('./function-editor-engine-mock'))
import {DOMWrapper,mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {defineComponent,ref} from 'vue'
import RuleFunctionCodeEditor from '../../src/features/rules/RuleFunctionCodeEditor.vue'
import ElementPlus from 'element-plus'
import DataDownlinkFunctionDialog from '../../src/features/rules/DataDownlinkFunctionDialog.vue'
import DataPropertyFunctionDialog from '../../src/features/rules/DataPropertyFunctionDialog.vue'
import GatewayDataParserDialog from '../../src/features/rules/GatewayDataParserDialog.vue'
import DeviceRulePreprocessBuilder from '../../src/features/rules/DeviceRulePreprocessBuilder.vue'
const state=vi.hoisted(()=>({destroy:vi.fn(),errors:[] as {type:string}[]}))
vi.mock('../../src/features/rules/rule-function-editor-engine',()=>({createFunctionEditor:()=>({setValue:vi.fn(),configure:vi.fn(),measure:vi.fn(),destroy:state.destroy,errors:()=>state.errors})}))
let wrapper:VueWrapper|undefined
const value=ref('')
function setup(source:string){value.value=source;const Host=defineComponent({components:{RuleFunctionCodeEditor},setup:()=>({value}),template:'<RuleFunctionCodeEditor v-model="value" ariaLabel="云函数源码"/>'});wrapper=mount(Host,{attachTo:document.body})}
afterEach(()=>{wrapper?.unmount();wrapper=undefined;document.body.innerHTML='';state.destroy.mockClear();state.errors=[];vi.unstubAllGlobals()})
it('明确整理才用真实Babel四空格格式化草稿；错误保原文且不发送写请求',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
 const source='module.exports=function(event){/*保留说明*/return {temperature:event.temperature};};';setup(source);await flushPromises();expect(value.value).toBe(source)
 await wrapper!.get('button').trigger('click');await vi.waitFor(()=>expect(value.value).toContain('\n    /*保留说明*/'),{timeout:3000});expect(value.value).toContain('function (event)');expect(value.value).toContain('return { temperature: event.temperature };')
 value.value='module.exports = function(';await flushPromises();await wrapper!.get('button').trigger('click');await vi.waitFor(()=>expect(wrapper!.text()).toContain('函数代码格式化失败'),{timeout:3000});expect(value.value).toBe('module.exports = function(');expect(fetch).not.toHaveBeenCalled()
})
it('异步整理不覆盖新草稿，readonly不提供整理，卸载销毁编辑器并释放busy',async()=>{
 wrapper=mount(RuleFunctionCodeEditor,{props:{modelValue:'module.exports=function(x){return x;};',ariaLabel:'源码'},attachTo:document.body});await flushPromises();await wrapper.get('button').trigger('click');await wrapper.setProps({modelValue:'// 外部新草稿\nmodule.exports = function(event) { return event; };'});await vi.waitFor(()=>expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false]),{timeout:2000});expect(wrapper.emitted('update:modelValue')).toBeUndefined();await wrapper.setProps({readonly:true});expect(wrapper.find('button').exists()).toBe(false);wrapper.unmount();expect(state.destroy).toHaveBeenCalledOnce();expect(wrapper.emitted('busy')?.at(-1)).toEqual([false]);wrapper=undefined
})

it('三DATA弹窗只在明确整理改草稿，busy阻止保存测试而不自禁formatter，取消销毁不迟到回写',async()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch)
 const project='20000000-0000-4000-8000-000000000001',typeId='30000000-0000-4000-8000-000000000001',stream={identifier:'raw',name:'输入',format:'TEXT' as const}
 const source='  module.exports=function(identifier,data){return {type:"text",msg:"x"};};\r\n'
 const mountings=[
  ()=>mount(DataDownlinkFunctionDialog,{props:{projectId:project,typeId,scopeKey:'editor',streamIdentifier:'raw',streams:[stream],modelValue:{protocol:'MQTT',streamIdentifier:'raw',source}},attachTo:document.body,global:{plugins:[ElementPlus]}}),
  ()=>mount(DataPropertyFunctionDialog,{props:{projectId:project,typeId,scopeKey:'editor',stream,inputProfile:'LEGACY_SINGLE',modelValue:{format:'COMMON_JS',source}},attachTo:document.body,global:{plugins:[ElementPlus]}}),
  ()=>mount(GatewayDataParserDialog,{props:{projectId:project,typeId,scopeKey:'editor',stream,modelValue:{source}},attachTo:document.body,global:{plugins:[ElementPlus]}}),
 ]
 const button=(label:string)=>Array.from(document.body.querySelectorAll('button')).find(row=>row.textContent?.trim()===label)!
 for(const create of mountings){
  wrapper=create();await flushPromises();const editor=wrapper.getComponent(RuleFunctionCodeEditor);expect(editor.props('modelValue')).toBe(source)
  const modified=source.replace('"x"','"edited"');editor.vm.$emit('update:modelValue',modified);await flushPromises();expect(editor.props('modelValue')).toBe(modified)
  await editor.get('button').trigger('click');expect((button('保存') as HTMLButtonElement).disabled).toBe(true);expect((button('测试云函数') as HTMLButtonElement).disabled).toBe(true);expect(editor.props('disabled')).toBe(false)
  button('保存').click();expect(wrapper.emitted('save')).toBeUndefined()
  await vi.waitFor(()=>expect(wrapper!.emitted('busy')?.at(-1)).toEqual([false]),{timeout:3000})
  const formatted=editor.props('modelValue');expect(formatted).toContain('\n    return');expect(formatted).toContain('"edited"');button('保存').click();await flushPromises();expect(wrapper.emitted('save')?.[0]?.[0]).toMatchObject({source:formatted})
  wrapper.unmount();wrapper=undefined;document.body.innerHTML=''
 }
 wrapper=mountings[2]!();await flushPromises();const editor=wrapper.getComponent(RuleFunctionCodeEditor),before=state.destroy.mock.calls.length;await editor.get('button').trigger('click');button('取消').click();await flushPromises();expect(wrapper.findComponent(RuleFunctionCodeEditor).exists()).toBe(false);expect(state.destroy.mock.calls.length).toBe(before+1);expect(wrapper.emitted('cancel')).toHaveLength(1)
 await new Promise(resolve=>setTimeout(resolve,600));expect(wrapper.emitted('save')).toBeUndefined();expect(wrapper.emitted('busy')?.at(-1)).toEqual([false]);expect(fetch).not.toHaveBeenCalled()
})
async function openAdd(){await wrapper!.findAll('button').find(row=>row.text()==='添加操作')!.trigger('click');await flushPromises();const choice=document.body.querySelector<HTMLButtonElement>('[data-preprocess-choice="FUNCTION"]');if(choice){choice.click();await flushPromises()}}
async function saveDialog(){const ds=[...document.querySelectorAll<HTMLElement>('.el-dialog')].filter(node=>node.closest<HTMLElement>('.el-overlay')?.style.display!=='none');const d=ds[ds.length-1];expect(d).toBeDefined();const b=[...d!.querySelectorAll('button')].find(n=>n.textContent?.trim()==='保存');expect(b).toBeDefined();await new DOMWrapper(b!).trigger('click');await flushPromises()}
it('预处理创建父表单可切换函数格式并保存表达式原文',async()=>{
 const device='20000000-0000-4000-8000-000000000001';wrapper=mount(DeviceRulePreprocessBuilder,{props:{scopeKey:'editor-format',deviceId:device,deviceName:'设备',externalFirstStep:true,initialName:'格式规则',initialKind:'ATTRS_RPT_PREPROC'},attachTo:document.body,global:{plugins:[ElementPlus]}});await flushPromises()
 const button=(label:string)=>wrapper!.findAll('button').find(row=>row.text()===label)!
 await button('添加操作').trigger('click');await flushPromises();const editor=wrapper.getComponent(RuleFunctionCodeEditor);editor.vm.$emit('update:modelValue','module.exports = attributes => attributes;');await flushPromises();await saveDialog()
 const select=wrapper.findAllComponents({name:'ElSelect'}).find(row=>row.props('ariaLabel')==='操作 1 函数格式')!;expect(select).toBeDefined();select.vm.$emit('update:modelValue','FUNCTION_EXPRESSION');await flushPromises()
 await wrapper.findAll('button').find(row=>row.attributes('aria-label')==='编辑操作 1')!.trigger('click');await flushPromises();await new DOMWrapper(document.body).get('[aria-label="预处理函数"]').setValue('attributes => attributes');await saveDialog()
 await button('创建').trigger('click');const submitted=wrapper.emitted('submit')?.[0]?.[0] as {draft:{preprocessingJson:string}};expect(JSON.parse(submitted.draft.preprocessingJson).functions).toEqual([{format:'FUNCTION_EXPRESSION',source:'attributes => attributes'}])
})
