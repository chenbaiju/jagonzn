import {afterEach,expect,it,vi} from 'vitest'
vi.mock('../../src/features/rules/rule-function-editor-engine', () => import('./function-editor-engine-mock'))
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {defineComponent,ref,type Ref} from 'vue'
import ElementPlus from 'element-plus'
import RuleActionsEditor,{type ActionDraft} from '../../src/features/rules/RuleActionsEditor.vue'
import {contentBody} from '../../src/features/rules/message-rule-content-api'
let w:VueWrapper|undefined,rows:Ref<ActionDraft[]>
const catalog={actions:[{nodeType:'event-cloud-function',configSchema:{}},{nodeType:'current-device-properties-function',configSchema:{}},{nodeType:'current-device-command-function',configSchema:{}},{nodeType:'current-device-data-function',configSchema:{}},{nodeType:'current-device-cloud-properties-function',configSchema:{}},{nodeType:'current-device-report-data-function',configSchema:{}}]}
function setup(){rows=ref([]);const Host=defineComponent({components:{RuleActionsEditor},setup:()=>({rows,catalog}),template:'<RuleActionsEditor v-model="rows" :catalog="catalog"/>'});w=mount(Host,{attachTo:document.body,global:{plugins:[ElementPlus]}})}
function button(text:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()===text||node.querySelector('strong')?.textContent===text);expect(found,text).toBeDefined();return found!}
async function click(text:string){button(text).click();await flushPromises()}
async function input(label:string,value:string){const el=document.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[aria-label="${label}"]`)!;expect(el,label).toBeTruthy();el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));await flushPromises()}
afterEach(()=>{w?.unmount();w=undefined;document.body.innerHTML=''})
it('原站当前设备命令函数配置弹窗逐字保留源码；延迟1000以整数token提交、取消不覆盖',async()=>{
 setup();await click('添加操作');await click('向当前设备下发命令');const source='module.exports = function(report_attributes) {\r\n  return {method:"restart",params:{x:1}};\r\n};';await input('云函数源码',source);const actual=(document.querySelector('[aria-label="云函数源码"]') as HTMLTextAreaElement).value;const delay=w!.findAllComponents({name:'ElSwitch'}).find(node=>node.props('ariaLabel')==='是否延迟执行')!;delay.vm.$emit('update:modelValue',true);await flushPromises();const number=w!.findComponent({name:'ElInputNumber'});number.vm.$emit('update:modelValue',1000);await flushPromises();await click('保存');expect(rows.value).toHaveLength(1);expect((rows.value[0]!.config.function as {source:string}).source).toBe(actual)
 const body=contentBody({name:'函数',description:'',source:{kind:'DEVICE',referenceId:'20000000-0000-4000-8000-000000000001',name:'设备'},kind:'ATTRS_RPT',identifier:'',filterJson:'{"operator":"ALL","conditions":[],"groups":[]}',actions:rows.value});expect(body).toContain('"delaySeconds": 1000');expect(body).not.toContain('1e3');(document.querySelector('[aria-label="编辑操作"]') as HTMLButtonElement).click();await flushPromises();await input('云函数源码','module.exports = () => null;');await click('取消');expect((rows.value[0]!.config.function as {source:string}).source).toBe(actual)
})
it('原站属性下发自定义函数使用MQTT/TCP和目标流，不显示延迟或通用JSON配置',async()=>{
 setup();await click('添加操作');await click('自定义数据下发函数');expect(document.body.textContent).not.toContain('是否延迟执行');expect(document.querySelector('[aria-label="推送方式"]')).toBeTruthy();await click('保存');expect(rows.value).toHaveLength(0);expect(document.body.textContent).toContain('请选择推送方式');const group=w!.findComponent({name:'ElRadioGroup'});group.vm.$emit('update:modelValue','TCP');await input('自定义数据流','native');await click('保存');expect(rows.value).toHaveLength(1);expect(rows.value[0]!.config).toMatchObject({protocol:'TCP',streamIdentifier:'native',function:{format:'COMMON_JS',source:expect.stringContaining('function(push_attributes)')}});expect(rows.value[0]!.config.delaySeconds).toBeUndefined()
})

it('当前设备云端更新独立保存函数和延迟，不带下发协议字段',async()=>{
 setup();await click('添加操作');await click('向当前设备更新云端属性');expect(document.body.textContent).toContain('使用云函数构造更新属性');expect(document.body.textContent).not.toContain('推送方式');const text=document.querySelector<HTMLTextAreaElement>('[aria-label="云函数源码"]')!.value;expect(text).toContain('function(report_attributes)');expect(text).toContain('return update_attributes');await click('保存');expect(rows.value[0]!.nodeType).toBe('current-device-cloud-properties-function');expect(rows.value[0]!.config.protocol).toBeUndefined();expect(rows.value[0]!.config.streamIdentifier).toBeUndefined()
})
it('属性上报转DATA函数保留MQTT流和可选延迟，不使用push_attributes签名',async()=>{
 setup();await click('添加操作');await click('向当前设备下发自定义数据');expect(document.querySelector<HTMLTextAreaElement>('[aria-label="云函数源码"]')!.value).toContain('function(report_attributes)');const group=w!.findComponent({name:'ElRadioGroup'});group.vm.$emit('update:modelValue','MQTT');await input('自定义数据流','report-data');const delay=w!.findAllComponents({name:'ElSwitch'}).find(node=>node.props('ariaLabel')==='是否延迟执行')!;delay.vm.$emit('update:modelValue',true);await flushPromises();w!.findComponent({name:'ElInputNumber'}).vm.$emit('update:modelValue',3600);await flushPromises();await click('保存');expect(rows.value[0]!.nodeType).toBe('current-device-report-data-function');expect(rows.value[0]!.config).toMatchObject({protocol:'MQTT',streamIdentifier:'report-data'});expect(contentBody({name:'上报转DATA',description:'',source:{kind:'DEVICE',referenceId:'20000000-0000-4000-8000-000000000001',name:'设备'},kind:'ATTRS_RPT',identifier:'',filterJson:'{"operator":"ALL","conditions":[],"groups":[]}',actions:rows.value})).toContain('"delaySeconds": 3600')
})

it('事件自定义云函数逐字保留event签名，仅保存源码且取消不新增',async()=>{
 setup();await click('添加操作');await click('云函数');expect(document.querySelector<HTMLTextAreaElement>('[aria-label="云函数源码"]')!.value).toContain('function (event)');expect(document.body.textContent).not.toContain('是否延迟执行');expect(document.body.textContent).not.toContain('推送方式');await click('取消');expect(rows.value).toHaveLength(0)
 await click('添加操作');await click('云函数');const source='module.exports = function (event) {\n  return;\n};';await input('云函数源码',source);await click('保存');expect(rows.value).toHaveLength(1);expect(rows.value[0]!.nodeType).toBe('event-cloud-function');expect(Object.keys(rows.value[0]!.config)).toEqual(['function']);expect(rows.value[0]!.config.function).toEqual({format:'COMMON_JS',source})
})
