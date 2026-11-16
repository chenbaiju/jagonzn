import {afterEach,describe,it,expect,vi} from 'vitest'
vi.mock('../../src/features/rules/RuleFunctionCodeEditor.vue',()=>({default:{props:['modelValue','ariaLabel','disabled','readonly'],emits:['update:modelValue','busy'],template:'<el-input :model-value="modelValue" :aria-label="ariaLabel" :disabled="disabled" :readonly="readonly" type="textarea" @update:model-value="$emit(\'update:modelValue\',$event)"/>'}}))
// 本文件验证完整版本CAS/原件及未知恢复，函数控件采用同契约headless适配；真实表格/弹窗另有组件方法。
vi.mock('../../src/features/rules/RulePreprocessFunctionsEditor.vue',async()=>{const {defineComponent}=await import('vue');return {default:defineComponent({props:['modelValue','disabled'],emits:['update:modelValue','busy'],setup(props,{emit}){return {change:(index:number,source:string)=>{if(!props.disabled)emit('update:modelValue',props.modelValue.map((row:any,i:number)=>i===index?{...row,source}:row))},move:(index:number)=>{if(props.disabled||index===0)return;const values=[...props.modelValue];[values[index-1],values[index]]=[values[index],values[index-1]];emit('update:modelValue',values)}}},template:'<section><div v-for="(operation,index) in modelValue" :key="operation.id"><textarea :aria-label="`操作 ${index+1} 函数源码`" :value="operation.source" :disabled="disabled" @input="change(index,$event.target.value)"/><button :aria-label="`上移操作 ${index+1}`" :disabled="disabled||index===0" @click="move(index)">上移</button></div></section>'})}})
import {mount,flushPromises,type VueWrapper} from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Editor from '../../src/features/rules/RulePreprocessVersionEditor.vue'
import type {PreprocessVersionSeed,PreprocessRevisionIntent} from '../../src/features/rules/preprocess-version-editor'
import {versionSeed,confirmedSeed,source,second} from './preprocess-version-seed.fixture'
let view:VueWrapper|undefined
function setup(seed=versionSeed()){view=mount(Editor,{props:{scopeKey:seed.scopeKey,deviceId:seed.deviceId,deviceName:'权威设备 Alpha',ruleId:seed.ruleId,canRead:true,canRevise:true,seed},attachTo:document.body,global:{plugins:[ElementPlus]}});return view}
function button(label:string){const row=view!.findAll('button').find(node=>node.text()===label);expect(row,label).toBeDefined();return row!}
const intent=(index=0)=>view!.emitted('submit')![index]![0] as PreprocessRevisionIntent
async function changed(){await view!.get('[aria-label="规则名称"]').setValue('修改后的完整版本')}
afterEach(()=>{view?.unmount();view=undefined;document.body.innerHTML=''})
describe('完整版本保护（函数控件headless同契约）',()=>{
 it('无损回填数值、所有函数和null控件；无修改禁止追加版本',async()=>{
  setup();await flushPromises();expect((view!.get('[aria-label="数值比较值"]').element as HTMLInputElement).value).toBe('1.0000000000000001')
  expect((view!.get('[aria-label="区间下限"]').element as HTMLInputElement).value).toBe('9007199254740993')
  expect((view!.get('[aria-label="操作 1 函数源码"]').element as HTMLTextAreaElement).value).toBe(source.replace(/\r\n/g,'\n'))
  expect((view!.get('[aria-label="操作 2 函数源码"]').element as HTMLTextAreaElement).value).toBe(second)
  expect(button('保存新版本').attributes('disabled')).toBeDefined();expect(view!.text()).toContain('null')
  await button('保存新版本').trigger('click');expect(view!.emitted('submit')).toBeUndefined()
 })
 it('只改名称仍带完整条件和函数；未知结果全锁，只有匹配已知拒绝解锁',async()=>{
  setup();await changed();await button('保存新版本').trigger('click');const first=intent()
  expect(first.expectedDefinitionVersion).toBe('9007199254740993');expect(first.preprocessingJson).toContain('10000000000000001e-16');expect(first.preprocessingJson).toContain('checked:true');expect(first.preprocessingJson).toContain(JSON.stringify(source))
  expect(view!.get('[aria-label="操作 1 函数源码"]').attributes('disabled')).toBeDefined();expect(button('取消').attributes('disabled')).toBeDefined()
  await button('保存新版本').trigger('click');expect(view!.emitted('submit')).toHaveLength(1)
  await view!.setProps({resolution:{type:'known-rejected',attemptId:'unrelated'}});expect(button('保存新版本').attributes('disabled')).toBeDefined()
  await view!.setProps({resolution:{type:'known-rejected',attemptId:first.attemptId}});expect((view!.get('[aria-label="规则名称"]').element as HTMLInputElement).value).toBe(first.name)
  await button('保存新版本').trigger('click');expect(intent(1).attemptId).not.toBe(first.attemptId)
  await view!.setProps({resolution:{type:'known-rejected',attemptId:first.attemptId}});expect(button('保存新版本').attributes('disabled')).toBeDefined()
 })
 it('历史函数格式与顺序原件接口保持，错完整回读保未知锁，匹配回读才转新基线',async()=>{
  setup();await view!.get('[aria-label="上移操作 2"]').trigger('click');await view!.get('[aria-label="数值比较值"]').setValue('1.0000000000000002')
  await button('保存新版本').trigger('click');const value=intent();expect(value.preprocessingJson.indexOf(second)).toBeLessThan(value.preprocessingJson.indexOf('module.exports'))
  const correct=confirmedSeed(value)
  await view!.setProps({resolution:{type:'confirmed',attemptId:value.attemptId,seed:{...correct,versionNumber:'99'}}})
  expect(view!.emitted('saved')).toBeUndefined();expect(button('保存新版本').attributes('disabled')).toBeDefined()
  await view!.setProps({resolution:{type:'confirmed',attemptId:value.attemptId,seed:correct}})
  expect(view!.emitted('saved')).toHaveLength(1);expect(view!.text()).toContain('版本 8');expect(view!.text()).not.toContain('请勿重复保存')
  expect(button('保存新版本').attributes('disabled')).toBeDefined();expect((view!.get('[aria-label="操作 1 函数源码"]').element as HTMLTextAreaElement).value).toBe(second)
  await view!.setProps({seed:versionSeed()});expect(view!.text()).toContain('版本 8')
 })
 it('新的CAS/版本不能覆盖脏草稿，须明确放弃并载入；锁中不能载入',async()=>{
  setup();await changed();const next=versionSeed({definitionVersion:'9007199254740994',name:'服务端新名称'})
  await view!.setProps({seed:next});expect((view!.get('[aria-label="规则名称"]').element as HTMLInputElement).value).toBe('修改后的完整版本')
  expect(button('保存新版本').attributes('disabled')).toBeDefined()
  await button('放弃修改并载入最新版本').trigger('click');expect((view!.get('[aria-label="规则名称"]').element as HTMLInputElement).value).toBe('服务端新名称')
  await changed();await button('保存新版本').trigger('click')
  await view!.setProps({seed:versionSeed({definitionVersion:'9007199254740995'})})
  expect(button('放弃修改并载入最新版本').attributes('disabled')).toBeDefined()
 })
 it('范围切换清私有旧草稿，晚旧基线和旧拒绝不能解锁新范围',async()=>{
  setup();await changed();await button('保存新版本').trigger('click');const old=intent()
  await view!.setProps({scopeKey:'epoch2',seed:versionSeed()});expect(view!.text()).toContain('尚未读取完整版本');expect(view!.find('[aria-label="操作 1 函数源码"]').exists()).toBe(false)
  const fresh=versionSeed({scopeKey:'epoch2',name:'第二范围'})
  await view!.setProps({seed:fresh});await changed();await button('保存新版本').trigger('click')
  await view!.setProps({resolution:{type:'known-rejected',attemptId:old.attemptId}});expect(button('保存新版本').attributes('disabled')).toBeDefined()
  await view!.setProps({canRead:false});expect(view!.text()).toContain('无权读取');expect(view!.find('[aria-label="规则名称"]').exists()).toBe(false);expect(view!.find('[aria-label="操作 1 函数源码"]').exists()).toBe(false)
  expect(button('取消').attributes('disabled')).toBeDefined()
 })
 it('仅可读/long耗尽/来源未读完不发修订，保留真实读写权限边界',async()=>{
  setup();await view!.setProps({canRevise:false});expect(view!.get('[aria-label="规则名称"]').attributes('disabled')).toBeDefined()
  await button('保存新版本').trigger('click');expect(view!.emitted('submit')).toBeUndefined()
  await view!.setProps({canRevise:true,deviceName:''});expect(view!.get('[aria-label="规则名称"]').attributes('disabled')).toBeDefined()
  await view!.setProps({deviceName:'设备',seed:versionSeed({definitionVersion:'9223372036854775807'})});await button('载入最新版本').trigger('click')
  expect(view!.text()).toContain('已达上限');expect(view!.emitted('dirty')!.at(-1)).toEqual([false]);expect(button('保存新版本').attributes('disabled')).toBeDefined()
 })
 it('相同不可变标识下内容被换时封闭保存，原草稿仍保留',async()=>{
  setup();await changed();await view!.setProps({seed:versionSeed()});expect((view!.get('[aria-label="规则名称"]').element as HTMLInputElement).value).toBe('修改后的完整版本')
  const bad:PreprocessVersionSeed=versionSeed({preprocessingJson:versionSeed().preprocessingJson.replace('checked:true','checked:false')})
  await view!.setProps({seed:bad});expect(view!.text()).toContain('基线内容发生变化');expect(button('保存新版本').attributes('disabled')).toBeDefined();await flushPromises()
 })
 it('重新收到完整且一致的同基线后恢复编辑，保留用户草稿而非永久封锁',async()=>{
  setup();await changed();await view!.setProps({seed:versionSeed({preprocessingJson:versionSeed().preprocessingJson.replace('checked:true','checked:false')})});expect(button('保存新版本').attributes('disabled')).toBeDefined()
  await view!.setProps({seed:versionSeed()});expect(view!.text()).not.toContain('基线内容发生变化');expect((view!.get('[aria-label="规则名称"]').element as HTMLInputElement).value).toBe('修改后的完整版本');expect(button('保存新版本').attributes('disabled')).toBeUndefined();expect(view!.emitted('submit')).toBeUndefined()
 })

})
