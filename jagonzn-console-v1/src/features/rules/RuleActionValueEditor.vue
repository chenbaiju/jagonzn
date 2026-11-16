<script setup lang="ts">
import {computed,ref,type PropType} from 'vue'
import {ExactDecimal,type ExactJson} from './preprocess-exact-json'
defineOptions({name:'RuleActionValueEditor'})
// 值包含布尔与文本时禁止Vue把空文本按Boolean prop转换为true。
const props=defineProps({modelValue:{type:null as unknown as PropType<ExactJson>,required:true},disabled:Boolean,depth:{type:Number,default:0}})
const emit=defineEmits<{'update:modelValue':[value:ExactJson]}>()
const key=ref(''),error=ref('')
const children=ref<{valid:()=>boolean}[]>([])
defineExpose({valid:()=>!error.value&&children.value.every(child=>child.valid())})
const kind=computed(()=>props.modelValue instanceof ExactDecimal?'number':props.modelValue===null?'null':Array.isArray(props.modelValue)?'array':typeof props.modelValue)
const entries=computed(()=>kind.value==='object'?Object.entries(props.modelValue as Record<string,ExactJson>):[])
function changeKind(value:string){if(props.disabled)return;error.value='';emit('update:modelValue',value==='number'?new ExactDecimal('0'):value==='boolean'?false:value==='null'?null:value==='array'?[]:value==='object'?Object.create(null):'')}
function number(value:string){if(props.disabled)return;try{const exact=new ExactDecimal(value);emit('update:modelValue',exact);error.value=''}catch{error.value='请输入有效数值'}}
function member(name:string,value:ExactJson){if(!props.disabled)emit('update:modelValue',Object.assign(Object.create(null),props.modelValue,{[name]:value}))}
function remove(name:string){if(props.disabled)return;const value=Object.assign(Object.create(null),props.modelValue);delete value[name];emit('update:modelValue',value)}
function add(){if(props.disabled||props.depth>=8)return;const name=key.value.trim();if(!name||Object.hasOwn(props.modelValue as object,name)){error.value='请输入不重复的参数名称';return}member(name,'');key.value='';error.value=''}
function item(index:number,value:ExactJson){if(!props.disabled)emit('update:modelValue',(props.modelValue as ExactJson[]).map((old,i)=>i===index?value:old))}
</script>
<template><div class="action-value">
 <el-select :model-value="kind" aria-label="值类型" size="small" :disabled="disabled" @update:model-value="changeKind"><el-option label="文本" value="string"/><el-option label="数值" value="number"/><el-option label="开关" value="boolean"/><el-option label="空值" value="null"/><el-option v-if="depth<8" label="对象" value="object"/><el-option v-if="depth<8" label="列表" value="array"/></el-select>
 <el-input v-if="kind==='string'" :model-value="modelValue as string" aria-label="文本值" :disabled="disabled" @update:model-value="!disabled&&emit('update:modelValue',$event)"/>
 <el-input v-else-if="kind==='number'" :model-value="(modelValue as ExactDecimal).literal" aria-label="数值" :disabled="disabled" @update:model-value="number"/>
 <el-switch v-else-if="kind==='boolean'" :model-value="modelValue as boolean" aria-label="开关值" :disabled="disabled" @update:model-value="!disabled&&emit('update:modelValue',!!$event)"/>
 <div v-else-if="kind==='object'" class="value-children"><div v-for="[name,value] in entries" :key="name" class="value-member"><span>{{name}}</span><RuleActionValueEditor ref="children" :model-value="value" :depth="depth+1" :disabled="disabled" @update:model-value="member(name,$event)"/><el-button text :disabled="disabled" @click="remove(name)">移除</el-button></div><div v-if="depth<8" class="value-add"><el-input v-model="key" aria-label="参数名称" placeholder="参数名称" :disabled="disabled"/><el-button :disabled="disabled" @click="add">添加参数</el-button></div></div>
 <div v-else-if="kind==='array'" class="value-children"><div v-for="(value,index) in modelValue as ExactJson[]" :key="index" class="value-member"><span>{{index+1}}</span><RuleActionValueEditor ref="children" :model-value="value" :depth="depth+1" :disabled="disabled" @update:model-value="item(index,$event)"/><el-button text :disabled="disabled" @click="!disabled&&emit('update:modelValue',(modelValue as ExactJson[]).filter((_,i)=>i!==index))">移除</el-button></div><el-button v-if="depth<8" :disabled="disabled" @click="!disabled&&emit('update:modelValue',[...(modelValue as ExactJson[]),''])">添加一项</el-button></div>
 <p v-if="error" role="alert">{{error}}</p>
</div></template>
<style scoped>.action-value{display:flex;gap:8px;flex-wrap:wrap;align-items:center;min-width:0}.action-value>.el-select{width:86px;flex:none}.action-value>.el-input{min-width:120px;flex:1}.value-children{width:100%;padding:10px 0 0 12px;border-left:2px solid #ebeef5}.value-member,.value-add{display:flex;align-items:flex-start;gap:8px;margin-bottom:10px}.value-member>span{min-width:65px;line-height:32px;font-size:13px;overflow-wrap:anywhere}.value-member>.action-value{flex:1}.value-add>.el-input{max-width:240px}.action-value p{color:var(--el-color-danger);font-size:12px;margin:0}</style>
