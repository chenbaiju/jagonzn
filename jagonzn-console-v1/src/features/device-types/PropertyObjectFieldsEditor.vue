<script setup lang="ts">
import {objectFieldTypes,type ObjectFieldDraft} from './property-object-fields'
const props=defineProps<{modelValue:readonly ObjectFieldDraft[];disabled?:boolean}>(),emit=defineEmits<{'update:modelValue':[value:ObjectFieldDraft[]]}>()
function update(index:number,key:keyof ObjectFieldDraft,value:unknown){if(props.disabled)return;emit('update:modelValue',props.modelValue.map((row,i)=>i===index?{...row,[key]:value}:{...row}))}
function add(){if(!props.disabled&&props.modelValue.length<64)emit('update:modelValue',[...props.modelValue.map(row=>({...row})),{key:'',name:'',description:'',dataType:'NUMBER',required:false,maxLength:4096}])}
function remove(index:number){if(!props.disabled)emit('update:modelValue',props.modelValue.filter((_,i)=>i!==index).map(row=>({...row})))}
</script>
<template><section class="object-fields"><div v-for="(row,index) in modelValue" :key="index" class="object-field-row">
 <el-input :model-value="row.name" :aria-label="`子字段名称${index+1}`" placeholder="名称" maxlength="64" :disabled="disabled" @update:model-value="update(index,'name',$event)"/>
 <el-input :model-value="row.key" :aria-label="`子字段标识符${index+1}`" placeholder="标识符" maxlength="64" :disabled="disabled" @update:model-value="update(index,'key',$event)"/>
 <el-select :model-value="row.dataType" :aria-label="`子字段类型${index+1}`" :disabled="disabled" @update:model-value="update(index,'dataType',$event)"><el-option v-for="[value,label] in objectFieldTypes" :key="value" :value="value" :label="label"/></el-select>
 <el-checkbox :model-value="row.required" :name="`object-required-${index+1}`" :disabled="disabled" @update:model-value="update(index,'required',$event)">必填</el-checkbox><el-button :disabled="disabled" @click="remove(index)">移除子字段</el-button>
 <el-input class="field-description" :model-value="row.description" :aria-label="`子字段说明${index+1}`" placeholder="说明（可选）" maxlength="512" :disabled="disabled" @update:model-value="update(index,'description',$event)"/><small v-if="row.dataType==='TEXT'" class="field-description">文本子字段最多 {{row.maxLength}} 个字符。</small>
 </div><el-button :disabled="disabled||modelValue.length>=64" @click="add">添加子字段</el-button><p class="tl-muted">当前表单支持 Number、Switch、Text 直接子字段；子字段名称和说明单独保存，不改变数据解释。</p></section></template>
<style scoped>.object-fields{width:100%}.object-field-row{display:grid;grid-template-columns:minmax(100px,1fr) minmax(100px,1fr) minmax(130px,1fr) auto auto;gap:8px;margin-bottom:16px}.field-description{grid-column:1/-1}.object-fields small{color:var(--tl-muted)}@media(max-width:700px){.object-field-row{grid-template-columns:1fr 1fr}.object-field-row .el-select{grid-column:1/-1}}</style>
