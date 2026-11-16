<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {can,projectId,session} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import type {RuleSourceInput} from './rule-source-selection'
import {deviceSourceMembers,type RuleDeviceSourceContract} from './rule-source-api'
import {coordinateRuleSource,coordinateTransformDraft,readRuleCoordinateProperties,type CoordinateConversion,type CoordinateTransformDraft} from './coordinate-transform-draft'

const props=withDefaults(defineProps<{projectId:string;source:RuleSourceInput|RuleDeviceSourceContract;draft?:CoordinateTransformDraft;disabled?:boolean;validationError?:string;top?:string;recoveryPending?:boolean;recovering?:boolean}>(),{disabled:false})
const emit=defineEmits<{save:[draft:CoordinateTransformDraft];cancel:[];busy:[value:boolean];recover:[];denied:[error:ApiError]}>()
const inputProperty=ref(''),outputProperty=ref(''),conversion=ref<CoordinateConversion>('WGS84_TO_GCJ02'),choices=ref<readonly string[]>([]),loading=ref(false),candidateReady=ref(false),sealed=ref(false),error=ref(''),candidateError=ref('')
const permitted=computed(()=>!!props.projectId&&props.projectId===projectId.value&&!session.transitioning&&can('rule:manage'))
const locked=computed(()=>props.disabled||!permitted.value||sealed.value)
let turn=0,active=true,controller:AbortController|undefined,previousScope:string|undefined
function sourceKey(){try{const source=coordinateRuleSource(props.source);return source.kind+':'+deviceSourceMembers(source).join(',')}catch{return ''}}
function clearDraft(){inputProperty.value='';outputProperty.value='';conversion.value='WGS84_TO_GCJ02'}
function stop(){turn++;controller?.abort();choices.value=[];candidateReady.value=false;loading.value=false;emit('busy',false)}
async function reset(){
 stop();error.value='';candidateError.value=''
 const scope=props.projectId+':'+String(session.user?.accountId)+':'+sourceKey(),sameScope=previousScope===undefined||previousScope===scope;previousScope=scope
 clearDraft()
 if(sameScope&&props.draft&&!sealed.value){inputProperty.value=props.draft.inputProperty;outputProperty.value=props.draft.outputProperty;conversion.value=props.draft.conversion}
 if(!permitted.value||sealed.value)return
 const generation=turn,epoch=identityEpoch(),actor=session.user?.accountId,project=props.projectId,source=sourceKey();controller=new AbortController();const signal=controller.signal
 const current=()=>active&&generation===turn&&epoch===identityEpoch()&&actor===session.user?.accountId&&project===props.projectId&&source===sourceKey()&&permitted.value&&!signal.aborted
 loading.value=true;emit('busy',true)
 try{const result=await readRuleCoordinateProperties(project,props.source,signal);if(current()){choices.value=result;candidateReady.value=true}}
 catch(cause){if(current()){choices.value=[];if(cause instanceof ApiError&&[401,403].includes(cause.status)){sealed.value=true;clearDraft();error.value=errorMessage(cause);emit('denied',cause)}else candidateError.value=errorMessage(cause)+'；可手动填写属性。'}}
 finally{if(current()){loading.value=false;emit('busy',false)}}
}
watch([()=>props.draft,sourceKey,()=>props.projectId,()=>session.user?.accountId,permitted],()=>{void reset()},{immediate:true,deep:true})
const dispose=onIdentityChange(()=>{stop();sealed.value=true;clearDraft();candidateError.value='';error.value='当前身份已变化，请关闭后重新配置。'})
function suggestions(query:string,done:(values:{value:string}[])=>void){done(choices.value.filter(key=>key.toLowerCase().includes(query.toLowerCase())).map(value=>({value})))}
function save(){if(locked.value||loading.value)return;try{coordinateRuleSource(props.source);const draft=coordinateTransformDraft({inputProperty:inputProperty.value,conversion:conversion.value,outputProperty:outputProperty.value});if(candidateReady.value&&(!choices.value.includes(draft.inputProperty)||!choices.value.includes(draft.outputProperty)))throw new Error('请选择当前设备来源共有的坐标属性');error.value='';emit('save',draft)}catch(cause){error.value=errorMessage(cause)}}
function cancel(){if(props.disabled)return;stop();clearDraft();emit('cancel')}
onScopeDispose(()=>{active=false;stop();dispose()})
</script>
<template><el-dialog :model-value="true" title="配置操作" :top="top??'15vh'" :lock-scroll="false" width="1000px" class="rule-coordinate-transform-dialog" :close-on-click-modal="false" :close-on-press-escape="!disabled" :show-close="!disabled" :before-close="cancel" append-to-body>
 <el-form label-position="top" :disabled="locked" @submit.prevent="save">
  <el-form-item label="原始坐标属性"><el-autocomplete v-model="inputProperty" :fetch-suggestions="suggestions" :trigger-on-focus="true" aria-label="原始坐标属性" :maxlength="32" :loading="loading"/></el-form-item>
  <el-form-item label="转换方式"><el-select v-model="conversion" aria-label="转换方式"><el-option label="GPS 转 火星坐标系" value="WGS84_TO_GCJ02"/><el-option label="GPS 转 百度坐标系" value="WGS84_TO_BD09"/></el-select></el-form-item>
  <el-form-item label="生成坐标属性"><el-autocomplete v-model="outputProperty" :fetch-suggestions="suggestions" :trigger-on-focus="true" aria-label="生成坐标属性" :maxlength="32" :loading="loading"/></el-form-item>
 </el-form>
 <el-alert v-if="candidateError" :title="candidateError" type="warning" :closable="false"/>
 <el-alert v-if="error||validationError" :title="error||validationError" type="warning" :closable="false"/>
 <template #footer><el-form :disabled="false" class="dialog-actions"><el-button v-if="recoveryPending" :disabled="recovering" @click="emit('recover')">读取核对</el-button><el-button :disabled="disabled" @click="cancel">取消</el-button><el-button type="primary" :disabled="locked||loading" @click="save">保存</el-button></el-form></template>
</el-dialog></template>
<style scoped>
.rule-coordinate-transform-dialog{max-width:94vw}.rule-coordinate-transform-dialog .el-form-item{margin-bottom:22px}.rule-coordinate-transform-dialog :deep(.el-form-item__label){font-size:14px;font-weight:400;color:#606266;line-height:40px;padding-bottom:10px}.rule-coordinate-transform-dialog :deep(.el-autocomplete),.rule-coordinate-transform-dialog :deep(.el-select){width:100%}.rule-coordinate-transform-dialog :deep(.el-input__wrapper),.rule-coordinate-transform-dialog :deep(.el-select__wrapper){height:40px;min-height:40px;padding:0 15px}.rule-coordinate-transform-dialog :deep(.el-input__inner),.rule-coordinate-transform-dialog :deep(.el-select__selected-item){font-size:14px;color:#606266}
</style>
