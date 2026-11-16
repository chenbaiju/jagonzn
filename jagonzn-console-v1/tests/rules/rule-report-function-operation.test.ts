import {afterEach,expect,it,vi} from 'vitest'
vi.mock('../../src/features/rules/rule-function-editor-engine', () => import('./function-editor-engine-mock'))
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {defineComponent,ref} from 'vue'
import ElementPlus from 'element-plus'
import RuleActionsEditor,{type ActionDraft} from '../../src/features/rules/RuleActionsEditor.vue'
import {ExactDecimal} from '../../src/features/rules/preprocess-exact-json'
let wrapper:VueWrapper|undefined
const types=['report-cloud-function','report-gateway-properties-function'] as const
const catalog={actions:types.map(nodeType=>({nodeType,configSchema:{type:'object',required:['function'],properties:{function:{type:'object'}}}}))}
afterEach(()=>{wrapper?.unmount();wrapper=undefined;document.body.innerHTML=''})
function button(label:string){const found=[...document.querySelectorAll<HTMLButtonElement>('button')].find(node=>node.textContent?.trim()===label);expect(found,label).toBeDefined();return found!}
async function click(label:string){button(label).click();await flushPromises()}
async function choose(type:typeof types[number]){await click('添加操作');document.querySelector<HTMLButtonElement>(`[data-action-type="${type}"]`)!.click();await flushPromises()}
it.each(types)('%s保持上报函数签名，编辑/取消/保存且不携带旧延迟或下发配置',async type=>{
 const rows=ref<ActionDraft[]>([]),Host=defineComponent({components:{RuleActionsEditor},setup:()=>({rows,catalog}),template:'<RuleActionsEditor v-model="rows" :catalog="catalog"/>'});wrapper=mount(Host,{attachTo:document.body,global:{plugins:[ElementPlus]}})
 await choose(type);const source=document.querySelector<HTMLTextAreaElement>('[aria-label="云函数源码"]')!.value;expect(source).toContain('function (report_attributes)');expect(source).not.toContain('function (event)');expect(source).not.toContain('identifier, data');expect(source).toContain(type==='report-cloud-function'?'return;':'var data = {};');if(type==='report-gateway-properties-function')expect(source).toContain('return data;');expect(document.body.textContent).not.toContain('是否延迟执行');expect(document.body.textContent).not.toContain('推送方式');expect(document.body.textContent).not.toContain('下发到设备');await click('取消');expect(rows.value).toHaveLength(0)
 await choose(type);await click('保存');expect(rows.value).toHaveLength(1);expect(rows.value[0]!.nodeType).toBe(type);expect(rows.value[0]!.config).toEqual({function:{format:'COMMON_JS',source}})
 rows.value=[{...rows.value[0]!,config:{...rows.value[0]!.config,delaySeconds:new ExactDecimal('1000'),targetDeviceId:'20000000-0000-4000-8000-000000000001',protocol:'MQTT',streamIdentifier:'old'}}];await flushPromises();await wrapper.get('[aria-label="编辑操作"]').trigger('click');await flushPromises();expect(document.body.textContent).not.toContain('是否延迟执行');expect(document.body.textContent).not.toContain('推送方式');expect(document.body.textContent).not.toContain('下发到设备');await click('保存');expect(rows.value[0]!.config).toEqual({function:{format:'COMMON_JS',source}})
})
