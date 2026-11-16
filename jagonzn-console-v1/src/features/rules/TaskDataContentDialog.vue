<script setup lang="ts">
import {ref,watch} from 'vue'
import JsonCodeEditor from '@/ui/JsonCodeEditor.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {errorMessage} from '@/core/http'
import {formatTaskDataJson,taskDataValue} from './task-data-content'

const props=defineProps<{modelValue:boolean;value?:unknown;busy?:boolean;locked?:boolean;pending?:boolean;error?:string}>()
const emit=defineEmits<{'update:modelValue':[value:boolean];save:[value:ReturnType<typeof taskDataValue>];verify:[]}>()
const message=ref(''),format=ref('JSON'),localError=ref('')
let route:Record<string,unknown>|undefined
// 原文只在打开时复制；未知写回读不得覆盖本次原始消息草稿。
watch(()=>props.modelValue,()=>{
 message.value='';format.value='JSON';localError.value='';route=undefined
 if(!props.modelValue)return
 const value=props.value
 if(!value||typeof value!=='object'||Array.isArray(value)){localError.value='自定义数据配置不完整，请重新读取。';return}
 const fields=value as Record<string,unknown>
 if(Object.keys(fields).sort().join(',')!=='format,message,protocol,streamIdentifier'||!['HEX','TEXT','JSON'].includes(String(fields.format))||typeof fields.message!=='string'){localError.value='自定义数据配置不完整，请重新读取。';return}
 route={protocol:fields.protocol,streamIdentifier:fields.streamIdentifier};format.value=String(fields.format);message.value=fields.message
},{immediate:true})
function close(){if(props.busy||props.pending)return;message.value='';route=undefined;localError.value='';emit('update:modelValue',false)}
function tidy(){if(!props.modelValue||props.busy||props.locked||props.pending||format.value!=='JSON')return;try{message.value=formatTaskDataJson(message.value);localError.value=''}catch(cause){localError.value=errorMessage(cause)}}
function save(){if(!props.modelValue||props.busy||props.locked||props.pending)return;try{const value=taskDataValue({...route,format:format.value,message:message.value});localError.value='';emit('save',value)}catch(cause){localError.value=errorMessage(cause)}}
</script>
<template>
 <el-dialog :model-value="modelValue" class="task-data-content-dialog" title="配置操作" width="min(800px,94vw)" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!busy&&!pending" :show-close="!busy&&!pending" destroy-on-close append-to-body @update:model-value="close">
  <el-form v-if="modelValue" :disabled="busy||locked||pending" label-position="top" @submit.prevent="save">
   <el-form-item label="消息格式"><el-radio-group v-model="format" aria-label="消息格式"><el-radio value="HEX">HEX</el-radio><el-radio value="TEXT">Plaintext</el-radio><el-radio value="JSON">JSON</el-radio></el-radio-group></el-form-item>
   <div class="data-message-label"><label>下发消息</label><button v-if="format==='JSON'" type="button" :disabled="busy||locked||pending" @click="tidy"><ReferenceIcon glyph="󰚔"/> 整理</button></div>
   <JsonCodeEditor v-model="message" ariaLabel="下发消息" :height="260" :disabled="busy||locked||pending"/>
  </el-form>
  <el-alert v-if="localError||error" :title="localError||error" type="warning" :closable="false"/>
  <template #footer><el-button :disabled="busy||pending" @click="close">取消</el-button><el-button v-if="pending" :disabled="busy" @click="emit('verify')">重新读取核对</el-button><el-button type="primary" :loading="busy" :disabled="locked||pending||!route" @click="save">完成</el-button></template>
 </el-dialog>
</template>
<style scoped>
.data-message-label{display:flex;align-items:center;justify-content:space-between;color:#606266;font-size:14px;font-weight:700;line-height:32px}
.data-message-label button{padding:0;border:0;background:none;color:#606266;font:inherit;font-size:12px;cursor:pointer}
.data-message-label button:disabled{color:#c0c4cc;cursor:not-allowed}
.task-data-content-dialog :deep(.el-dialog__header){padding:20px 20px 10px}
.task-data-content-dialog :deep(.el-dialog__title){font-size:18px;font-weight:400}
.task-data-content-dialog :deep(.el-dialog__body){padding:30px 20px}
.task-data-content-dialog :deep(.el-dialog__footer){padding:10px 20px 20px}
.task-data-content-dialog :deep(.cm-editor),.task-data-content-dialog :deep(.tl-json-editor__fallback){font-size:16px}
</style>
