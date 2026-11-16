<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import RuleTagsEditor from './RuleTagsEditor.vue'
import {sceneTagRows} from './scene-editor-draft'
import type {RuleTagDraft} from './rule-tag-draft'
import {sceneTagInputValue} from './scene-tag-input'
import {errorMessage} from '@/core/http'
const props=defineProps<{modelValue:boolean;tags:Readonly<Record<string,string>>;busy?:boolean;pending?:boolean;error?:string}>()
const emit=defineEmits<{'update:modelValue':[value:boolean];save:[tags:Record<string,string>];verify:[]}>()
const rows=ref<RuleTagDraft[]>([]),localError=ref(''),unreadable=ref(false),blocked=computed(()=>!!props.busy||!!props.pending)
watch(()=>props.modelValue,open=>{rows.value=[];localError.value='';unreadable.value=false;if(open){try{rows.value=sceneTagRows(props.tags)}catch(cause){unreadable.value=true;localError.value=errorMessage(cause)}}},{immediate:true})
function close(){if(!blocked.value)emit('update:modelValue',false)}
function save(){if(blocked.value||unreadable.value)return;try{const tags=sceneTagInputValue(rows.value,true);localError.value='';emit('save',tags)}catch(cause){localError.value=errorMessage(cause)}}
</script>
<template><el-dialog class="scene-tags-dialog" :model-value="modelValue" title="编辑标签" width="800px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!blocked" :show-close="!blocked" destroy-on-close append-to-body @update:model-value="close">
 <el-form label-position="top" @submit.prevent><RuleTagsEditor v-if="modelValue" v-model="rows" aria-label="场景标签" :disabled="blocked" :maximum-rows="null"/></el-form><el-alert v-if="error||localError" :title="error||localError" type="warning" :closable="false"/>
 <template #footer><el-button :disabled="blocked" @click="close">取消</el-button><el-button v-if="pending" :disabled="busy" @click="emit('verify')">重新读取标签核对</el-button><el-button type="primary" :loading="busy" :disabled="blocked||unreadable" @click="save">保存</el-button></template>
</el-dialog></template>

<style scoped>.scene-tags-dialog :deep(.el-dialog__body){padding:30px 20px}.scene-tags-dialog :deep(.tag-label){font-weight:700}</style>
