<script setup lang="ts">
import {ref,watch,onScopeDispose} from 'vue'
import {can,projectId} from '@/core/session'
import {onIdentityChange,IdentityChanged,ApiError,errorMessage} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {useDeviceGuard} from './use-device-guard'
import {devicesApi} from './api'
import DeviceCommandSend from './DeviceCommandSend.vue'
const props=defineProps<{deviceId:string;kind:'shadow'|'command';shadow?:Schema<'DeviceShadowResponse'>}>()
const emit=defineEmits<{saved:[];busy:[value:boolean]}>()
const open=ref(false),input=ref('{}'),busy=ref(false),error=ref(''),unknown=ref(false)
const capture=useDeviceGuard(()=>props.deviceId)
let generation=0
function clear(){generation++;open.value=false;input.value='{}';error.value='';unknown.value=false}
const dispose=onIdentityChange(clear);onScopeDispose(()=>{clear();dispose()})
watch(()=>[props.deviceId,projectId.value,can('device:control')],clear)
function start(){clear();input.value=props.shadow?.desired||'{}';open.value=true}
async function submit(){if(busy.value||unknown.value||!can('device:control'))return;const current=generation,check=capture();error.value='';try{
 const value=JSON.parse(input.value);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('请输入JSON对象')
 busy.value=true
 if(props.shadow?.version===undefined)throw new Error('请先重新读取影子版本')
 await devicesApi.desired(projectId.value,props.deviceId,{desired:input.value,version:props.shadow.version})
 check();if(current!==generation)return
 emit('saved');open.value=false
 }catch(e){if(current===generation&&!(e instanceof IdentityChanged)){error.value=errorMessage(e);unknown.value=e instanceof ApiError&&e.outcomeUnknown}}finally{busy.value=false}}
</script>
<template><DeviceCommandSend v-if="kind==='command'" :device-id="deviceId" @saved="emit('saved')" @busy="emit('busy',$event)"/><template v-else><el-button v-if="can('device:control')" type="primary" plain @click="start">编辑期望状态</el-button><el-dialog :model-value="open" title="编辑期望状态" width="min(640px,94vw)" destroy-on-close @close="clear"><el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="unknown" title="结果未知，请关闭后重新读取核对；本次操作不会自动重发。" type="warning" :closable="false"/><el-form label-position="top"><el-form-item label="期望状态 JSON"><el-input v-model="input" type="textarea" :rows="9" :disabled="busy||unknown"/></el-form-item></el-form><template #footer><el-button @click="clear">关闭</el-button><el-button type="primary" :loading="busy" :disabled="unknown" @click="submit">保存期望值</el-button></template></el-dialog></template></template>
