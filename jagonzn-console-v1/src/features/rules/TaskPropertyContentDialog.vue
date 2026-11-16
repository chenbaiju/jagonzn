<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import JsonCodeEditor from '@/ui/JsonCodeEditor.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {errorMessage} from '@/core/http'
import {formatTaskPropertyJson,taskPropertyValue,type TaskPropertyPurpose} from './task-content-api'

const props=withDefaults(defineProps<{modelValue:boolean;value?:unknown;purpose?:TaskPropertyPurpose;busy?:boolean;locked?:boolean;pending?:boolean;error?:string}>(),{purpose:'downlink'})
const emit=defineEmits<{'update:modelValue':[value:boolean];save:[properties:Record<string,unknown>];verify:[]}>()
const source=ref(''),localError=ref('')
const label=computed(()=>props.purpose==='cloud-update'?'更新属性 JSON':'下发属性 JSON')
// 打开时只复制一次原值；在途回读不能覆盖用户尚待确认的草稿。
watch(()=>props.modelValue,()=>{
 source.value='';localError.value=''
 if(!props.modelValue)return
 try{
  const raw=props.value===undefined?'{}':JSON.stringify(props.value)
  if(typeof raw!=='string')throw new Error(props.purpose==='cloud-update'?'更新属性内容不完整，请重新读取。':'下发属性内容不完整，请重新读取。')
  source.value=formatTaskPropertyJson(raw,props.purpose)
 }catch(cause){localError.value=errorMessage(cause)}
},{immediate:true})
function close(){if(props.busy||props.pending)return;source.value='';localError.value='';emit('update:modelValue',false)}
function format(){if(!props.modelValue||props.busy||props.locked||props.pending)return;try{source.value=formatTaskPropertyJson(source.value,props.purpose);localError.value=''}catch(cause){localError.value=errorMessage(cause)}}
function save(){if(!props.modelValue||props.busy||props.locked||props.pending)return;try{const value=taskPropertyValue(source.value,props.purpose);localError.value='';emit('save',value)}catch(cause){localError.value=errorMessage(cause)}}
</script>

<template>
 <el-dialog :model-value="modelValue" class="task-property-content-dialog" title="配置操作" width="min(800px,94vw)" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!busy&&!pending" :show-close="!busy&&!pending" destroy-on-close append-to-body @update:model-value="close">
  <el-form v-if="modelValue" :disabled="busy||locked||pending" @submit.prevent="save">
   <div class="property-json-label"><label>{{label}}</label><button type="button" :disabled="busy||locked||pending" @click="format"><ReferenceIcon glyph="󰚔"/> 整理</button></div>
   <JsonCodeEditor v-model="source" :ariaLabel="label" :height="300" :disabled="busy||locked||pending"/>
  </el-form>
  <el-alert v-if="localError||error" :title="localError||error" type="warning" :closable="false"/>
  <template #footer><el-form :disabled="false"><el-button :disabled="busy||pending" @click="close">取消</el-button><el-button v-if="pending" :disabled="busy" @click="emit('verify')">重新读取核对</el-button><el-button type="primary" :loading="busy" :disabled="locked||pending" @click="save">完成</el-button></el-form></template>
 </el-dialog>
</template>

<style scoped>
.property-json-label{display:flex;align-items:center;justify-content:space-between;color:#606266;font-size:14px;font-weight:700;line-height:32px}
.property-json-label button{padding:0;border:0;background:none;color:#606266;font:inherit;font-size:12px;cursor:pointer}
.property-json-label button:disabled{color:#c0c4cc;cursor:not-allowed}
.task-property-content-dialog :deep(.el-dialog__header){padding:20px 20px 10px}
.task-property-content-dialog :deep(.el-dialog__title){font-size:18px;font-weight:400}
.task-property-content-dialog :deep(.el-dialog__body){padding:30px 20px}
.task-property-content-dialog :deep(.el-dialog__footer){padding:10px 20px 20px}
.task-property-content-dialog :deep(.cm-editor),.task-property-content-dialog :deep(.tl-json-editor__fallback){font-size:16px}
</style>
