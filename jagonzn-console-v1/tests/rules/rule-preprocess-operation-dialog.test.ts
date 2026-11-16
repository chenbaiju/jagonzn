import {afterEach,beforeEach,it,expect,vi} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {defineComponent,ref} from 'vue'
import ElementPlus from 'element-plus'
import {ApiError,changeIdentity} from '../../src/core/http'
import {webcrypto} from 'node:crypto'
import type {FunctionDraft} from '../../src/features/rules/rule-builder-draft'
vi.mock('../../src/features/rules/RuleFunctionCodeEditor.vue',()=>({default:{name:'RuleFunctionCodeEditor',props:['modelValue','ariaLabel','disabled'],emits:['update:modelValue','busy'],template:'<textarea :value="modelValue" :aria-label="ariaLabel" :disabled="disabled" @input="$emit(\'update:modelValue\',$event.target.value)"/>'}}))
vi.mock('../../src/features/rules/RuleGatewayFunctionPreview.vue',()=>({default:{name:'RuleGatewayFunctionPreview',props:['source','nodeType','disabled'],emits:['busy','denied'],template:'<button :disabled="disabled">测试云函数</button>'}}))
import Editor from '../../src/features/rules/RulePreprocessFunctionsEditor.vue'
import Dialog from '../../src/features/rules/RulePreprocessFunctionDialog.vue'
const common='module.exports = attributes => attributes;\r\n',legacy='attributes => ({...attributes, legacy: true})'
let wrapper:VueWrapper|undefined
function setup(){const Host=defineComponent({components:{Editor},setup(){return{scope:ref('scope1'),value:ref<FunctionDraft[]>([{id:'common-one',format:'COMMON_JS',source:common},{id:'legacy-two',format:'FUNCTION_EXPRESSION',source:legacy}])}},template:'<Editor v-model="value" :scope-key="scope" kind="ATTRS_PUSH_PREPROC" project-id="10000000-0000-4000-8000-000000000001"/>'});wrapper=mount(Host,{attachTo:document.body,global:{plugins:[ElementPlus]}});return wrapper}
function button(label:string){const row=Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(node=>node.textContent?.trim()===label||node.getAttribute('aria-label')===label);expect(row,label).toBeDefined();return row!}
async function click(label:string){button(label).click();await flushPromises()}
async function code(value:string){const input=document.body.querySelector<HTMLTextAreaElement>('[aria-label="预处理函数"]')!;expect(input).toBeTruthy();input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));await flushPromises()}
const values=()=>wrapper!.findComponent(Editor).props('modelValue') as FunctionDraft[]
beforeEach(()=>{changeIdentity();vi.stubGlobal('crypto',webcrypto)})
afterEach(()=>{wrapper?.unmount();wrapper=undefined;vi.unstubAllGlobals();document.body.innerHTML=''})
it('前处理操作表配置取消不改原件，历史表达式保格式，排序拖拽与移除保持完整列表',async()=>{
 setup();await flushPromises();expect(wrapper!.find('textarea').exists()).toBe(false);expect(wrapper!.text()).not.toContain('函数格式');expect(wrapper!.text()).not.toContain('UTF8');expect(wrapper!.text()).not.toContain('module.exports')
 await click('编辑操作 1');await code('module.exports = attributes => ({changed: true});');await click('取消');expect(values()[0]!.source).toBe(common)
 await click('编辑操作 2');await code('attributes => ({...attributes, keep: true})');expect(wrapper!.findComponent(Dialog).findComponent({name:'RuleGatewayFunctionPreview'}).exists()).toBe(false);await click('保存');expect(values()[1]).toMatchObject({format:'FUNCTION_EXPRESSION',source:'attributes => ({...attributes, keep: true})'});expect(values()[0]!.source).toBe(common)
 await click('编辑操作 1');await code('x'.repeat(65536));await click('保存');expect(document.body.textContent).toContain('操作函数总内容超过允许大小');expect(values()[0]!.source).toBe(common);await click('取消')
 await click('排序');await click('上移操作 2');expect(values().map(row=>row.id)).toEqual(['legacy-two','common-one']);await wrapper!.get('[data-function-id="common-one"]').trigger('dragstart',{dataTransfer:{setData:vi.fn()}});await wrapper!.get('[data-function-id="legacy-two"]').trigger('drop');await flushPromises();expect(values().map(row=>row.id)).toEqual(['common-one','legacy-two']);await click('完成排序');await click('移除操作 2');expect(values()).toEqual([{id:'common-one',format:'COMMON_JS',source:common}])
})
it('配置弹窗传当前COMMON_JS草稿到共享预览，格式化及测试联锁，失权销毁私有草稿并封写',async()=>{
 setup();await flushPromises();await click('编辑操作 1');await code('module.exports = attributes => ({current: true});');const dialog=wrapper!.findComponent(Dialog),preview=dialog.findComponent({name:'RuleGatewayFunctionPreview'}),editor=dialog.findComponent({name:'RuleFunctionCodeEditor'});expect(preview.props('nodeType')).toBe('attributes-push-preprocess-function');expect(preview.props('source')).toBe('module.exports = attributes => ({current: true});');expect(values()[0]!.source).toBe(common)
 editor.vm.$emit('busy',true);await flushPromises();expect(button('保存').disabled).toBe(true);expect(preview.props('disabled')).toBe(true);editor.vm.$emit('busy',false);preview.vm.$emit('busy',true);await flushPromises();expect(button('保存').disabled).toBe(true);expect(editor.props('disabled')).toBe(true);preview.vm.$emit('busy',false);await flushPromises();expect(button('保存').disabled).toBe(false)
 preview.vm.$emit('denied',new ApiError('已撤权',403));await flushPromises();expect(wrapper!.findComponent(Dialog).exists()).toBe(false);expect(wrapper!.text()).not.toContain('预处理函数');expect(wrapper!.findComponent(Editor).emitted('denied')).toHaveLength(1);expect(wrapper!.findComponent(Editor).emitted('busy')?.at(-1)).toEqual([false]);expect(values()[0]!.source).toBe(common);(wrapper!.vm as unknown as {value:FunctionDraft[];scope:string}).value=[];(wrapper!.vm as unknown as {scope:string}).scope='scope2';await flushPromises();expect(button('添加操作').disabled).toBe(false);expect(wrapper!.text()).not.toContain('当前权限已变化')
})

it('PUSH创建先显示单FUNCTION选择器，配置取消不写且允许保留多个函数',async()=>{
 setup();await flushPromises();await click('添加操作');expect(document.body.querySelectorAll('[data-preprocess-choice]')).toHaveLength(1);expect(document.body.querySelector('[data-preprocess-choice="FUNCTION"]')).toBeTruthy();expect(wrapper!.findComponent(Dialog).exists()).toBe(false);await click('取消');expect(values()).toHaveLength(2)
 await click('添加操作');(document.body.querySelector('[data-preprocess-choice="FUNCTION"]') as HTMLButtonElement).click();await flushPromises();expect(wrapper!.findComponent(Dialog).exists()).toBe(true);await code('module.exports = attributes => attributes;');await click('保存');expect(values()).toHaveLength(3);expect(values()[0]!.source).toBe(common);expect(values()[1]!.source).toBe(legacy);expect(values()[2]!.source).toBe('module.exports = attributes => attributes;')
})
