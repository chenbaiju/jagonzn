<script setup lang="ts">
import {ref,watch} from 'vue'
import type {Schema} from '@/core/contracts'
import {cas} from './models'
import {validUnicode} from './preprocess-exact-json'
const props=defineProps<{modelValue:boolean;automation?:Schema<'AutomationView'>;busy?:boolean;pending?:boolean;error?:string}>()
const emit=defineEmits<{'update:modelValue':[value:boolean];save:[value:Schema<'WriteAutomationInformationRequest'>];verify:[]}>()
const name=ref(''),description=ref(''),expectedVersion=ref(0),localError=ref('')
watch([()=>props.modelValue,()=>props.automation?.id],()=>{
 if(!props.modelValue||!props.automation){name.value='';description.value='';expectedVersion.value=0;localError.value='';return}
 name.value=props.automation.name||'';description.value=props.automation.description||'';expectedVersion.value=cas(props.automation.version);localError.value=''
},{immediate:true})
function close(){if(!props.busy&&!props.pending)emit('update:modelValue',false)}
function save(){
 if(props.busy||props.pending||!props.automation)return
 const clean=name.value.trim(),descr=description.value.trim()
 if(!clean||!validUnicode(clean)||!validUnicode(descr)||(name.value!==props.automation.name&&[...clean].length>40)||(description.value!==(props.automation.description||'')&&[...descr].length>200)){localError.value='请填写名称，名称最多40字，描述最多200字';return}
 emit('save',{name:clean,description:descr||undefined,expectedVersion:expectedVersion.value})
}
</script>
<template><el-dialog class="automation-information-dialog" :model-value="modelValue" title="编辑信息" width="500px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!busy&&!pending" :show-close="!busy&&!pending" append-to-body @update:model-value="close">
 <el-form label-position="top" :disabled="busy||pending" @submit.prevent="save"><el-form-item label="名称"><el-input v-model="name" aria-label="自动化名称" maxlength="40" show-word-limit/></el-form-item><el-form-item label="描述"><el-input v-model="description" aria-label="自动化描述" type="textarea" :rows="5" maxlength="200" show-word-limit/></el-form-item></el-form>
 <el-alert v-if="localError||error" :title="localError||error" type="warning" :closable="false"/>
 <template #footer><el-button :disabled="busy||pending" @click="close">取消</el-button><el-button v-if="pending" :disabled="busy" @click="emit('verify')">重新读取核对</el-button><el-button type="primary" :loading="busy" :disabled="pending" @click="save">保存</el-button></template>
</el-dialog></template>
<style scoped>.automation-information-dialog :deep(.el-dialog__body){padding:30px 20px}.automation-information-dialog :deep(.el-form-item){margin-bottom:22px}.automation-information-dialog :deep(.el-form-item__label){padding:0;margin-bottom:0;line-height:32px;font-size:14px;font-weight:700;color:#606266}.automation-information-dialog :deep(.el-form-item__content){min-height:40px;line-height:40px}</style>
