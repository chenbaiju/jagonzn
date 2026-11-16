<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {ApiError,errorMessage,onIdentityChange} from '@/core/http'
import RuleFunctionCodeEditor from './RuleFunctionCodeEditor.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import RuleGatewayFunctionPreview from './RuleGatewayFunctionPreview.vue'
import {validUnicode} from './preprocess-exact-json'
import type {FunctionDraft,PreprocessKind} from './rule-builder-draft'
const props=defineProps<{modelValue:FunctionDraft;kind?:PreprocessKind;projectId?:string;sourceLimit?:number;disabled?:boolean;validationError?:string;top?:string;recoveryPending?:boolean;recovering?:boolean}>()
const emit=defineEmits<{save:[value:FunctionDraft];cancel:[];busy:[value:boolean];recover:[];denied:[cause:ApiError]}>()
const source=ref(props.modelValue.source),formatting=ref(false),previewBusy=ref(false),sealed=ref(false),error=ref('')
const blocked=computed(()=>!!props.disabled||formatting.value||previewBusy.value||sealed.value)
const common=computed(()=>props.modelValue.format==='COMMON_JS')
const node=computed(()=>props.kind==='ATTRS_PUSH_PREPROC'?'attributes-push-preprocess-function' as const:'attributes-report-preprocess-function' as const)
watch([formatting,previewBusy],()=>emit('busy',formatting.value||previewBusy.value),{immediate:true,flush:'sync'})
function clearPrivate(){source.value='';formatting.value=false;previewBusy.value=false;sealed.value=true;error.value='当前权限或身份已变化，请关闭后重新读取。'}
function denied(cause:ApiError){clearPrivate();emit('denied',cause)}
function save(){if(blocked.value)return;try{if(!['COMMON_JS','FUNCTION_EXPRESSION'].includes(props.modelValue.format)||!source.value.trim()||!validUnicode(source.value))throw new Error('请填写完整的预处理函数');if(new TextEncoder().encode(source.value).length>Math.min(65536,props.sourceLimit??65536))throw new Error('操作函数总内容超过允许大小');error.value='';emit('save',{...props.modelValue,source:source.value})}catch(cause){error.value=errorMessage(cause)}}
function cancel(){if(formatting.value||props.disabled)return;source.value='';previewBusy.value=false;emit('cancel')}
watch(()=>props.modelValue,()=>{source.value=props.modelValue.source;error.value='';sealed.value=false},{deep:true})
const dispose=onIdentityChange(clearPrivate);onScopeDispose(()=>{source.value='';emit('busy',false);dispose()})
</script>
<template><el-dialog :model-value="true" title="配置操作" :top="top??'15vh'" :lock-scroll="false" width="min(1000px,94vw)" class="preprocess-function-dialog" :close-on-click-modal="false" :close-on-press-escape="!formatting&&!disabled" :show-close="!formatting&&!disabled" :before-close="cancel" append-to-body>
 <el-form label-position="top" @submit.prevent="save"><div class="function-learning"><ReferenceIcon glyph="󰋽"/><a href="https://www.thingscloud.xyz/docs/guide/rules/built-in-cloud-func.html" target="_blank" rel="noopener noreferrer">学习云函数示例及内置函数库 <ReferenceIcon glyph="󰏌"/></a></div><el-form-item label="预处理函数">
  <RuleFunctionCodeEditor v-if="common&&!sealed" v-model="source" ariaLabel="预处理函数" :disabled="disabled||previewBusy" @busy="formatting=$event"/>
  <el-input v-else-if="!sealed" v-model="source" aria-label="预处理函数" type="textarea" :rows="12" :disabled="blocked"/>
 </el-form-item><RuleGatewayFunctionPreview v-if="common&&!sealed" :source="source" :node-type="node" :disabled="disabled||formatting" @busy="previewBusy=$event" @denied="denied"/></el-form>
 <el-alert v-if="error||validationError" :title="error||validationError" type="error" :closable="false"/>
 <template #footer><el-form :disabled="false" class="dialog-actions"><el-button v-if="recoveryPending" :disabled="recovering" @click="emit('recover')">读取核对</el-button><el-button :disabled="formatting||disabled" @click="cancel">取消</el-button><el-button type="primary" :disabled="blocked" @click="save">保存</el-button></el-form></template>
</el-dialog></template>
<style scoped>
.function-learning{display:flex;align-items:center;gap:10px;padding:15px;background:#ecf5ff;margin:0 0 20px;line-height:20px;font-size:14px}.function-learning a{color:#1e88e5;text-decoration:none}.function-learning a:hover{color:#51bbff}.function-learning>.reference-icon{font-size:16px;color:#1e88e5}.preprocess-function-dialog :deep(.el-form-item__label){font-size:14px;font-weight:400;color:#606266;line-height:40px;padding-bottom:10px}.preprocess-function-dialog :deep(.el-form-item__content){display:block;min-width:0}.preprocess-function-dialog :deep(.el-form-item){margin-bottom:22px}
</style>
