<script setup lang="ts">
import type {OtaMetadataDraft} from './ota-management-metadata-api'
import {MAX_DEVICE_TAGS} from '../devices/tag-rules'
const props=withDefaults(defineProps<{modelValue:OtaMetadataDraft;disabled?:boolean;section?:'all'|'name'|'details'|'description'}>(),{section:'all'})
const emit=defineEmits<{'update:modelValue':[value:OtaMetadataDraft]}>()
function field(key:'name'|'description',value:string){if(!props.disabled)emit('update:modelValue',{...props.modelValue,[key]:value})}
function tag(index:number,key:'key'|'value',value:string){if(!props.disabled)emit('update:modelValue',{...props.modelValue,tags:props.modelValue.tags.map((row,current)=>current===index?{...row,[key]:value}:row)})}
function add(){if(!props.disabled&&props.modelValue.tags.length<MAX_DEVICE_TAGS)emit('update:modelValue',{...props.modelValue,tags:[...props.modelValue.tags,{key:'',value:''}]})}
function remove(index:number){if(!props.disabled)emit('update:modelValue',{...props.modelValue,tags:props.modelValue.tags.filter((_,current)=>current!==index)})}
</script>
<template>
 <el-form-item v-if="section==='all'||section==='name'" label="版本名称" required><el-input :model-value="modelValue.name" aria-label="OTA版本名称" maxlength="256" :disabled="disabled" placeholder="例如：温湿度传感器正式版" @update:model-value="field('name',$event)"/></el-form-item>
 <el-form-item v-if="section!=='name'" label="版本说明"><el-input :model-value="modelValue.description??''" type="textarea" aria-label="OTA版本说明" :rows="3" maxlength="4096" :disabled="disabled" placeholder="填写更新内容" @update:model-value="field('description',$event)"/></el-form-item>
 <el-form-item v-if="section==='all'||section==='details'" label="标签"><div class="ota-tag-rows"><div v-for="(row,index) in modelValue.tags" :key="index" class="ota-tag-row"><el-input :model-value="row.key" :aria-label="`标签名称${index+1}`" placeholder="标签名称" :disabled="disabled" @update:model-value="tag(index,'key',$event)"/><el-input :model-value="row.value" :aria-label="`标签值${index+1}`" maxlength="128" placeholder="标签值" :disabled="disabled" @update:model-value="tag(index,'value',$event)"/><el-button :disabled="disabled" @click="remove(index)">移除</el-button></div><el-button :disabled="disabled||modelValue.tags.length>=MAX_DEVICE_TAGS" @click="add">添加标签</el-button></div></el-form-item>
</template>
<style scoped>.ota-tag-rows{width:100%}.ota-tag-row{display:flex;gap:8px;margin-bottom:10px}.ota-tag-row :deep(.el-input){min-width:0}@media(max-width:560px){.ota-tag-row{flex-wrap:wrap}.ota-tag-row :deep(.el-input){flex:1 1 40%}}</style>
