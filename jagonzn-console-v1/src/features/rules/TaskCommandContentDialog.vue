<script setup lang="ts">
import {ref,watch} from 'vue'
import JsonCodeEditor from '@/ui/JsonCodeEditor.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {errorMessage} from '@/core/http'
import type {Task,TaskWrite} from './models'
import {taskCommandBody,taskCommandJson,taskCommandValue} from './task-content-api'
const props=defineProps<{modelValue:boolean;task?:Task;value?:unknown;busy?:boolean;locked?:boolean;pending?:boolean;error?:string;creationLayout?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:boolean];save:[body:TaskWrite];configured:[content:Pick<TaskWrite,'commandKey'|'input'|'commandRequestId'>];verify:[]}>()
const source=ref(''),localError=ref('')
watch([()=>props.modelValue,()=>props.task?.id],()=>{localError.value='';source.value='';if(props.modelValue)try{if(props.task)source.value=taskCommandJson(props.task);else if(props.value!==undefined){const raw=JSON.stringify(props.value,null,2);if(typeof raw!=='string')throw new Error('下发命令内容不完整。');source.value=raw}}catch(cause){localError.value=errorMessage(cause)}},{immediate:true})
function close(){if(props.busy||props.pending)return;source.value='';localError.value='';emit('update:modelValue',false)}
function format(){if(!props.modelValue||props.busy||props.locked||props.pending||!props.task&&props.value===undefined)return;try{const body=taskCommandValue(source.value);source.value=JSON.stringify({method:body.commandKey,params:body.input,...(body.commandRequestId===undefined?{}:{id:body.commandRequestId})},null,2);localError.value=''}catch(cause){localError.value=errorMessage(cause)}}
function save(){if(!props.modelValue||props.busy||props.locked||props.pending||!props.task&&props.value===undefined)return;try{localError.value='';if(props.task)emit('save',taskCommandBody(props.task,source.value));else emit('configured',taskCommandValue(source.value))}catch(cause){localError.value=errorMessage(cause)}}
</script>
<template><el-dialog :model-value="modelValue" class="task-command-content-dialog" :class="{'task-create-command-dialog':creationLayout}" title="配置操作" width="min(800px,94vw)" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!busy&&!pending" :show-close="!busy&&!pending" append-to-body @update:model-value="close">
 <el-form :disabled="busy||locked" @submit.prevent="save"><div class="command-json-label"><label>下发命令 JSON</label><button type="button" :disabled="busy||locked" @click="format"><ReferenceIcon glyph="󰚔"/> 整理</button></div><JsonCodeEditor v-model="source" ariaLabel="下发命令 JSON" :height="300" :disabled="busy||locked"/></el-form>
 <el-alert v-if="localError||error" :title="localError||error" type="warning" :closable="false"/>
 <template #footer><el-form :disabled="false"><el-button :disabled="busy||pending" @click="close">取消</el-button><el-button v-if="pending" :disabled="busy" @click="emit('verify')">重新读取核对</el-button><el-button type="primary" :loading="busy" :disabled="locked||pending||!task&&value===undefined" @click="save">完成</el-button></el-form></template>
</el-dialog></template>
<style scoped>
.command-json-label{display:flex;align-items:center;justify-content:space-between;color:#606266;font-size:14px;font-weight:700;line-height:40px}.command-json-label button{padding:0;border:0;background:none;color:#606266;font:inherit;font-size:12px;cursor:pointer}.command-json-label button:disabled{color:#c0c4cc;cursor:not-allowed}.task-command-content-dialog :deep(.el-dialog__body){padding:30px 20px}.task-command-content-dialog :deep(.cm-editor){font-size:16px}.task-command-content-dialog :deep(.tl-json-editor__fallback){font-size:16px}
:global(.task-create-command-dialog > .el-dialog__body) { padding-top: 27px; padding-bottom: 52px; }
:global(.task-create-command-dialog .cm-editor),
:global(.task-create-command-dialog .tl-json-editor__fallback) { font-size: 16px; }
</style>
