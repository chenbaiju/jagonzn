<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Task, TaskWrite } from './models'
import { taskEditor, taskSelection } from './models'
import { errorMessage, type ApiError } from '@/core/http'
import TaskChoiceSelect from './TaskChoiceSelect.vue'
const props=defineProps<{ modelValue:boolean; task?:Task; busy?:boolean; locked?:boolean; error?:string }>()
const emit=defineEmits<{ 'update:modelValue':[value:boolean]; save:[value:TaskWrite]; denied:[cause:ApiError] }>()
const kind=ref<'devices'|'device-types'|'device-groups'>('devices'),selected=ref<string[]>([]),draft=ref<TaskWrite>(),localError=ref(''),legacySingleGroup=ref(false)
watch([()=>props.modelValue,()=>props.task?.id],()=>{
 draft.value=undefined;selected.value=[];localError.value='';legacySingleGroup.value=false
 if(!props.modelValue || !props.task)return
 try {
  draft.value=taskEditor(props.task)
  if(props.task.targetType==='DEVICE_TYPE'){kind.value='device-types';selected.value=props.task.targetDeviceTypeId?[props.task.targetDeviceTypeId]:[]}
  else if(props.task.targetType==='DEVICE_GROUP' || props.task.targetType==='DEVICE_GROUPS'){kind.value='device-groups';legacySingleGroup.value=props.task.targetType==='DEVICE_GROUP';selected.value=props.task.targetType==='DEVICE_GROUP'?(props.task.targetGroupId?[props.task.targetGroupId]:[]):props.task.targetGroupIds?.slice() || []}
  else {kind.value='devices';selected.value=props.task.targetType==='EXPLICIT_DEVICES'?props.task.targetDeviceIds?.slice() || []:[]}
 }catch(cause){localError.value=errorMessage(cause)}
},{immediate:true})
function changeKind(value:'devices'|'device-types'|'device-groups'){if(props.busy || props.locked)return;kind.value=value;selected.value=[];legacySingleGroup.value=false;localError.value=''}
function close(value=false){if(!value && !props.busy){draft.value=undefined;emit('update:modelValue',false)}}
function save(){
 if(props.busy || props.locked || !draft.value)return
 try{
  const selection=taskSelection(kind.value==='device-types'?{targetType:'DEVICE_TYPE',targetDeviceTypeId:selected.value[0]}:kind.value==='device-groups'?(legacySingleGroup.value && selected.value.length===1?{targetType:'DEVICE_GROUP',targetGroupId:selected.value[0]}:{targetType:'DEVICE_GROUPS',targetGroupIds:selected.value}):{targetType:'EXPLICIT_DEVICES',targetDeviceIds:selected.value})
  emit('save',{...draft.value,targetGroupId:undefined,targetDeviceTypeId:undefined,targetDeviceIds:undefined,targetGroupIds:undefined,...selection})
 }catch(cause){localError.value=errorMessage(cause)}
}
</script>
<template><el-dialog :model-value="modelValue" title="设置目标设备" width="500px" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" @update:model-value="close">
 <el-form v-if="draft" label-position="top"><el-form-item label="目标类型"><el-radio-group :model-value="kind" :disabled="busy || locked" @update:model-value="changeKind"><el-radio value="devices">设备</el-radio><el-radio value="device-types">设备类型</el-radio><el-radio value="device-groups">设备组</el-radio></el-radio-group></el-form-item>
 <el-form-item label="选择目标"><TaskChoiceSelect v-if="modelValue" :key="kind" v-model="selected" :kind="kind" :multiple="kind !== 'device-types'" :maximum="kind === 'device-groups' ? 100 : kind === 'device-types' ? 1 : 10000" :disabled="busy || locked" @denied="emit('denied',$event)" /></el-form-item></el-form>
 <el-alert v-if="localError || error" :title="localError || error" type="error" :closable="false" />
 <template #footer><el-button :disabled="busy" @click="close()">取消</el-button><el-button type="primary" :disabled="locked || !draft" :loading="busy" @click="save">确定</el-button></template>
</el-dialog></template>
