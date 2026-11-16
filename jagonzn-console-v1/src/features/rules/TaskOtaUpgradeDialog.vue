<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {can,projectId} from '@/core/session'
import {errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import type {TaskSelectionWrite} from './models'
import {taskOtaUpgradeValue,taskOtaVersionAttributes,type TaskOtaUpgradeInput} from './task-ota-upgrade'
const props=defineProps<{modelValue:boolean;value?:unknown;selection?:TaskSelectionWrite;busy?:boolean;locked?:boolean;pending?:boolean;error?:string}>()
const emit=defineEmits<{'update:modelValue':[value:boolean];save:[value:TaskOtaUpgradeInput];verify:[]}>()
const versionProperty=ref(''),module=ref('main'),localError=ref(''),candidateError=ref(''),loading=ref(false)
const permitted=computed(()=>!!projectId.value&&can('task:manage')),blocked=computed(()=>!!(props.busy||props.locked||props.pending||!permitted.value))
let active=true,generation=0,request=0,controller:AbortController|undefined
function stop(){generation++;request++;controller?.abort();controller=undefined;loading.value=false;candidateError.value=''}
function reset(){stop();versionProperty.value='';module.value='main';localError.value='';if(props.modelValue&&props.value!==undefined)try{const value=taskOtaUpgradeValue(props.value);versionProperty.value=value.versionProperty;module.value=value.module}catch(cause){localError.value=errorMessage(cause)}}
watch(()=>props.modelValue,reset,{immediate:true})
watch(()=>JSON.stringify(props.selection),stop)
watch([projectId,permitted],()=>{stop();versionProperty.value='';module.value='main';localError.value=''})
const dispose=onIdentityChange(()=>{stop();versionProperty.value='';module.value='main';localError.value=''})
onScopeDispose(()=>{active=false;stop();dispose()})
async function suggestions(prefix:string,done:(rows:{value:string;name:string}[])=>void){
 controller?.abort();controller=undefined;const selection=props.selection,project=projectId.value,epoch=identityEpoch(),local=generation,turn=++request,selectionKey=JSON.stringify(selection)
 if(!active||blocked.value||!props.modelValue||!selection||prefix.length>64||/[\u0000-\u001f\u007f]/.test(prefix)){done([]);return}
 controller=new AbortController();const signal=controller.signal;loading.value=true;candidateError.value=''
 const current=()=>active&&!signal.aborted&&props.modelValue&&permitted.value&&project===projectId.value&&epoch===identityEpoch()&&local===generation&&turn===request&&selectionKey===JSON.stringify(props.selection)
 try{const rows=await taskOtaVersionAttributes(project,selection,prefix,signal);if(current())done(rows)}catch{if(current()){candidateError.value='版本属性建议暂不可用。';done([])}}finally{if(current())loading.value=false}
}
function close(){if(props.busy||props.pending)return;stop();emit('update:modelValue',false)}
function save(){if(blocked.value)return;try{const value=taskOtaUpgradeValue({versionProperty:versionProperty.value,module:module.value});localError.value='';emit('save',value)}catch(cause){localError.value=errorMessage(cause)}}
</script>
<template><el-dialog :model-value="modelValue" title="配置操作" width="min(800px,94vw)" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!busy&&!pending" :show-close="!busy&&!pending" destroy-on-close append-to-body @update:model-value="close">
 <el-form v-if="modelValue" label-position="top" :disabled="blocked" @submit.prevent="save">
  <el-form-item><template #label>版本属性 <el-tooltip content="选择记录设备当前版本号的属性标识符，用于计算是否有可用的新版本。"><span class="help-mark" tabindex="0">?</span></el-tooltip></template><el-autocomplete v-model="versionProperty" :fetch-suggestions="suggestions" :trigger-on-focus="true" :loading="loading" :maxlength="32" size="small" placeholder="填写属性标识符" aria-label="OTA版本属性"><template #default="{item}"><span class="ota-property-suggestion"><span>{{item.value}}</span><span class="ota-property-name">{{item.name}}</span></span></template></el-autocomplete></el-form-item>
  <el-form-item><template #label>模块 <el-tooltip content="对应 OTA 版本库中的模块标识符，适用于多模块固件升级场景。"><span class="help-mark" tabindex="0">?</span></el-tooltip></template><el-input v-model="module" size="small" aria-label="OTA模块"/></el-form-item>
 </el-form>
 <el-alert v-if="candidateError" :title="candidateError" type="warning" :closable="false"/><el-alert v-if="localError||error" :title="localError||error" type="warning" :closable="false"/>
 <template #footer><el-button :disabled="busy||pending" @click="close">取消</el-button><el-button v-if="pending" :disabled="busy" @click="emit('verify')">重新读取核对</el-button><el-button type="primary" :loading="busy" :disabled="blocked" @click="save">完成</el-button></template>
</el-dialog></template>
<style scoped>
.ota-property-suggestion{display:flex;align-items:center}.ota-property-name{flex:1;text-align:right;margin-left:50px;font-size:13px}.help-mark{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border:1px solid #909399;border-radius:50%;font-size:11px;line-height:12px;color:#909399;margin-left:5px}:deep(.el-autocomplete){width:100%}
</style>
