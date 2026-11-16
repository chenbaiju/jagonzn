import {afterEach,expect,it} from 'vitest'
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import {defineComponent,ref} from 'vue'
import ElementPlus from 'element-plus'
import RuleActionsEditor,{type ActionDraft} from '../../src/features/rules/RuleActionsEditor.vue'
import {ExactDecimal} from '../../src/features/rules/preprocess-exact-json'
let wrapper:VueWrapper|undefined
const catalog={actions:[]}
afterEach(()=>{wrapper?.unmount();wrapper=undefined;document.body.innerHTML=''})
it('详情只在排序状态接受本列表拖拽或方向键，保持操作原件；禁用和结束后不再调整',async()=>{
 const original:ActionDraft[]=[{id:'one',nodeType:'current-device-properties-function',config:{function:{format:'COMMON_JS',source:'module.exports = a => ({x: 1});'},delaySeconds:new ExactDecimal('1000')}},{id:'two',nodeType:'current-device-command-function',config:{function:{format:'COMMON_JS',source:'module.exports = a => ({method:"restart",params:{}});'}}}]
 const rows=ref(original),sorting=ref(false),disabled=ref(false)
 const Host=defineComponent({components:{RuleActionsEditor},setup:()=>({rows,sorting,disabled,catalog}),template:'<RuleActionsEditor v-model="rows" :catalog="catalog" read-only :sorting="sorting" :disabled="disabled"/>'})
 wrapper=mount(Host,{attachTo:document.body,global:{plugins:[ElementPlus]}});expect(wrapper.find('.sort-handle').exists()).toBe(false)
 sorting.value=true;await flushPromises();await wrapper.get('[aria-label="拖拽排序操作 1"]').trigger('dragstart',{dataTransfer:{effectAllowed:'',setData:()=>undefined}});await wrapper.get('[data-action-id="two"]').trigger('drop');expect(rows.value.map(row=>row.id)).toEqual(['two','one']);expect(rows.value[1]!.config.delaySeconds).toBeInstanceOf(ExactDecimal);expect(rows.value[1]!.config.function).toEqual(original[0]!.config.function)
 await wrapper.get('[aria-label="拖拽排序操作 2"]').trigger('keydown',{key:'ArrowUp'});expect(rows.value.map(row=>row.id)).toEqual(['one','two'])
 disabled.value=true;await flushPromises();await wrapper.get('[aria-label="拖拽排序操作 1"]').trigger('keydown',{key:'ArrowDown'});expect(rows.value.map(row=>row.id)).toEqual(['one','two']);sorting.value=false;await flushPromises();await wrapper.get('[data-action-id="two"]').trigger('drop');expect(rows.value.map(row=>row.id)).toEqual(['one','two'])
})
