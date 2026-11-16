<script setup lang="ts">
import {copySucceeded,copyFailed} from '@/ui/copy-feedback'
import { ref, watch, onScopeDispose } from 'vue'
import { can, projectId } from '@/core/session'
import { useResource } from '@/core/use-resource'
import { onIdentityChange, IdentityChanged, errorMessage } from '@/core/http'
import { formatTime } from '@/core/time'
import AsyncState from '@/ui/AsyncState.vue'
import {useDeviceGuard,isDeviceScopeCurrent} from './use-device-guard'
import { devicesApi } from './api'
const props = defineProps<{deviceId:string}>()
const capture=useDeviceGuard(()=>props.deviceId)
const resource=useResource(signal=>devicesApi.credentials(projectId.value,props.deviceId,signal))
const secret=ref(''),busy=ref(false),error=ref(''),confirm=ref(false)
let generation=0
function clear(){ generation++;secret.value='';confirm.value=false;error.value='' }
const dispose=onIdentityChange(clear)
onScopeDispose(()=>{clear();dispose()})
watch(()=>[projectId.value,props.deviceId,can('device:update')],()=>{clear();resource.clear();if(projectId.value&&can('device:update'))void resource.reload()},{immediate:true})
async function generate(){if(busy.value||!confirm.value||!can('device:update'))return;const current=++generation;secret.value='';busy.value=true;error.value='';try{const result=await devicesApi.generateCredential(projectId.value,props.deviceId);if(current===generation){secret.value=result.plainSecret||'';confirm.value=false;await resource.reload()}}catch(e){if(current===generation&&!(e instanceof IdentityChanged))error.value=errorMessage(e)}finally{busy.value=false}}
async function revoke(id:string){if(busy.value||!can('device:update'))return;const check=capture();busy.value=true;error.value='';try{await devicesApi.revokeCredential(projectId.value,props.deviceId,id);check();await resource.reload()}catch(e){if(isDeviceScopeCurrent(check)&&!(e instanceof IdentityChanged))error.value=errorMessage(e)}finally{busy.value=false}}
async function copy(){
 if(!secret.value||!can('device:update'))return
 const value=secret.value,check=capture(),request=generation
 const current=()=>request===generation&&isDeviceScopeCurrent(check)&&can('device:update')&&secret.value===value
 try{await navigator.clipboard.writeText(value);if(current())copySucceeded()}
 catch{if(current())copyFailed('复制失败，请手动复制')}
}
</script>
<template><section><AsyncState :forbidden="!can('device:update')" :loading="resource.loading.value" :error="resource.error.value" @retry="resource.reload">
  <el-alert title="明文密钥仅在生成时显示一次。关闭或切换设备后清除，请妥善保管。" type="warning" :closable="false" />
  <el-alert v-if="error" :title="error" type="error" :closable="false" />
  <div v-if="secret" class="secret"><el-input :model-value="secret" type="password" show-password readonly aria-label="一次明文密钥" /><el-button @click="copy">复制密钥</el-button><el-button @click="secret=''">清除</el-button></div>
  <div class="tl-toolbar"><el-checkbox v-model="confirm">确认生成新凭据</el-checkbox><el-button type="primary" :disabled="!confirm" :loading="busy" @click="generate">生成凭据</el-button></div>
  <el-table :data="resource.data.value"><el-table-column prop="displayName" label="名称" /><el-table-column prop="authType" label="认证类型" /><el-table-column label="创建时间"><template #default="{row}">{{formatTime(row.createdAt)}}</template></el-table-column><el-table-column label="操作"><template #default="{row}"><el-popconfirm title="作废后设备无法再使用此凭据连接，确认作废？" @confirm="revoke(row.id)"><template #reference><el-button link type="danger" :disabled="busy">作废</el-button></template></el-popconfirm></template></el-table-column></el-table>
</AsyncState></section></template>
<style scoped>.secret {display:flex;gap:8px;margin:20px 0;}.tl-toolbar {margin-top:20px;}</style>
