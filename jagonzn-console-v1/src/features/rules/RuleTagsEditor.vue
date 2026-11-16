<script setup lang="ts">
import {computed,ref,toRaw,watch} from 'vue'
import {newRuleTag,type RuleTagDraft} from './rule-tag-draft'
const props=defineProps<{modelValue:RuleTagDraft[];disabled?:boolean;ariaLabel?:string;maximumRows?:number|null}>()
const emit=defineEmits<{'update:modelValue':[value:RuleTagDraft[]]}>()
const empty={...newRuleTag(),placeholder:true},removedInitial=ref(false),rows=computed(()=>props.modelValue.length?props.modelValue:removedInitial.value?[]:[empty])
const maximum=computed(()=>props.maximumRows===null?Infinity:props.maximumRows??32)
let emitted:RuleTagDraft[]|undefined
function updateRows(value:RuleTagDraft[]){emitted=value;emit('update:modelValue',value)}
watch(()=>props.modelValue,value=>{if(toRaw(value)!==emitted)removedInitial.value=false;emitted=undefined})
function update(index:number,key:'key'|'value',value:string){if(!props.disabled)updateRows(rows.value.map((row,current)=>current===index?{...row,[key]:value}:row))}
function add(){if(!props.disabled&&rows.value.length<maximum.value)updateRows([...rows.value,{...newRuleTag(),placeholder:true}])}
function remove(id:string){if(!props.disabled){removedInitial.value=true;updateRows(rows.value.filter(row=>row.id!==id))}}
</script>
<template><section class="rule-tags-editor" :aria-label="ariaLabel||'规则标签'">
 <div class="tag-label">标签</div><div class="tag-fields">
 <div v-for="(row,index) in rows" :key="row.id" class="tag-row" :data-rule-tag-id="row.id">
  <el-input :model-value="row.key" size="small" :disabled="disabled" :aria-label="`标签 ${index+1} 名称`" placeholder="标签名称，比如：服务商" @update:model-value="update(index,'key',$event)"/>
  <el-input :model-value="row.value" size="small" :disabled="disabled" :aria-label="`标签 ${index+1} 值`" placeholder="标签值，比如：ThingsCloud" @update:model-value="update(index,'value',$event)"/>
  <el-button size="small" type="danger" :disabled="disabled" :aria-label="`移除标签 ${index+1}`" @click="remove(row.id)">移除</el-button>
 </div><div><el-button size="small" :disabled="disabled||rows.length>=maximum" @click="add">添加标签</el-button></div></div>
</section></template>
<style scoped>
.rule-tags-editor{margin-top:0;min-width:0}.tag-label{font-size:14px;font-weight:400;line-height:40px;color:#606266;padding-bottom:10px}.tag-fields{display:flex;flex-direction:column;gap:8px}.tag-row{display:flex;justify-content:flex-start;gap:8px;align-items:center}.tag-row>.el-input{flex:1;min-width:0}.rule-tags-editor :deep(.el-input__wrapper){height:32px;min-height:32px;padding:0 15px;border-radius:4px;box-sizing:border-box}.rule-tags-editor :deep(.el-input__inner){height:30px;line-height:30px;font-size:13px;color:#606266}.rule-tags-editor :deep(.el-input__inner::placeholder){color:#c0c4cc}.rule-tags-editor :deep(.el-button--small){height:32px;padding:9px 15px;font-size:12px;border-radius:3px}.tag-row>.el-button{flex:none;margin-left:0}.tag-row>.el-button:not(.is-disabled){background:#f56c6c;border-color:#f56c6c;color:#fff}.tag-row>.el-button:not(.is-disabled):hover{background:#f78989;border-color:#f78989}.tag-row>.el-button:not(.is-disabled):active{background:#dd6161;border-color:#dd6161}
</style>
