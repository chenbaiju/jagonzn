<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {prepareTypeDelete,readTypeDeleteSnapshot,readTypeDeleteState,submitTypeDelete,type TypeDeleteIntent,type TypeDeleteSnapshot} from './type-delete-api'
import {typeDeviceUuid} from './type-devices-api'
const props=withDefaults(defineProps<{deviceTypeId:string;disabled?:boolean}>(),{disabled:false})
const emit=defineEmits<{locked:[value:boolean];removed:[]}>()
const open=ref(false),loading=ref(false),busy=ref(false),unknown=ref(false),attempted=ref(false),ended=ref(false),error=ref(''),currentState=ref('')
const snapshot=shallowRef<TypeDeleteSnapshot>(),intent=shallowRef<TypeDeleteIntent>()
const authorized=computed(()=>!!projectId.value&&typeDeviceUuid.test(props.deviceTypeId)&&!session.transitioning&&can('device:read')&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const removable=computed(()=>authorized.value&&!loading.value&&!busy.value&&!unknown.value&&!attempted.value&&snapshot.value?.deviceCount==='0'&&snapshot.value?.productLibraryPublished===false)
let generation=0,disposed=false,controller:AbortController|undefined
function reset(){generation++;controller?.abort();controller=undefined;open.value=false;loading.value=false;busy.value=false;unknown.value=false;attempted.value=false;ended.value=false;snapshot.value=undefined;intent.value=undefined;error.value='';currentState.value=''}
function checkpoint(){const g=generation,epoch=identityEpoch(),project=projectId.value,type=props.deviceTypeId;return()=>{if(disposed||g!==generation||epoch!==identityEpoch()||project!==projectId.value||type!==props.deviceTypeId||!authorized.value)throw new IdentityChanged()}}
async function load(){
 if(!authorized.value||busy.value||unknown.value||ended.value)return
 generation++;const check=checkpoint();controller?.abort();controller=new AbortController();loading.value=true;error.value='';snapshot.value=undefined
 try{const value=await readTypeDeleteSnapshot(projectId.value,props.deviceTypeId,controller.signal);check();snapshot.value=value;attempted.value=false;intent.value=undefined}
 catch(cause){try{check();error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403].includes(cause.status))reset()}catch{}}
 finally{try{check();loading.value=false}catch{}}
}
function start(){if(!authorized.value||props.disabled||ended.value||loading.value)return;open.value=true;if(!unknown.value)void load()}
function close(){if(busy.value)return;generation++;controller?.abort();open.value=false;loading.value=false;if(!unknown.value)snapshot.value=undefined}
function beforeClose(done:()=>void){if(!busy.value){close();done()}}
async function remove(){
 if(!removable.value)return
 const original=prepareTypeDelete(projectId.value,props.deviceTypeId),check=checkpoint();intent.value=original;attempted.value=true;controller?.abort();controller=new AbortController();busy.value=true;error.value=''
 try{await submitTypeDelete(original,controller.signal);check();unknown.value=false;busy.value=false;open.value=false;emit('removed')}
 catch(cause){try{check();error.value=errorMessage(cause);unknown.value=cause instanceof ApiError&&cause.outcomeUnknown;if(cause instanceof ApiError&&[401,403].includes(cause.status))reset()}catch{}}
 finally{try{check();busy.value=false}catch{}}
}
async function readCurrent(){
 const original=intent.value;if(!authorized.value||!unknown.value||!original||busy.value)return
 const check=checkpoint();controller?.abort();controller=new AbortController();busy.value=true;error.value='';currentState.value=''
 try{const current=await readTypeDeleteState(original.project,original.type,controller.signal);check();currentState.value=`当前仍能读取“${current.name}”。原移除结果尚未确认，不会再次提交。`}
 catch(cause){try{check();if(cause instanceof ApiError&&cause.status===404)currentState.value='当前类型不存在或不可见，仍不能确认原移除请求是否成功。';else{error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403].includes(cause.status))reset()}}catch{}}
 finally{try{check();busy.value=false}catch{}}
}
function finishCheck(){if(!unknown.value||busy.value)return;unknown.value=false;ended.value=true;open.value=false;currentState.value='已结束本次核对，移除结果仍未确认；未标记为移除成功。'}
watch([busy,unknown],()=>emit('locked',busy.value||unknown.value),{immediate:true,flush:'sync'})
watch([()=>projectId.value,()=>props.deviceTypeId,()=>session.user?.accountId,()=>session.user?.projectRole,()=>currentProject.value?.myRole,()=>authorized.value],reset,{flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{disposed=true;controller?.abort();dispose();emit('locked',false)})
</script>
<template><section class="type-delete">
 <el-button v-if="authorized" size="small" type="danger" :disabled="disabled||ended" @click="start">移除设备类型</el-button>
 <p v-if="ended&&authorized" role="status">{{currentState}}</p>
 <el-dialog :model-value="open&&authorized" title="移除设备类型" width="min(420px,94vw)" align-center :close-on-click-modal="false" :show-close="!busy" :before-close="beforeClose">
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <template v-if="unknown"><el-alert title="移除结果尚未确认，原请求不会再次发送。请读取当前状态核对。" type="warning" :closable="false"/><p v-if="currentState">{{currentState}}</p><el-button :loading="busy" @click="readCurrent">读取当前状态</el-button><el-button :disabled="busy" @click="finishCheck">结束本次核对</el-button></template>
  <template v-else><p v-if="loading">正在核对设备类型、关联设备与产品库状态…</p><template v-if="snapshot"><p>确定移除“{{snapshot.type.name}}”？此类型之后将不再出现在可用类型目录中。</p><p>关联的规则、任务和告警规则将一并移除，该操作无法恢复。</p><p v-if="snapshot.productLibraryPublished" role="status">该设备类型仍在产品库发布，请先撤回后再移除。</p><p v-else-if="snapshot.deviceCount!=='0'" role="status">当前仍有 {{snapshot.deviceCount}} 台关联设备，不能移除。</p><p v-else>没有关联设备且未在产品库发布的类型可以移除，服务端会再次检查当前状态。</p></template><el-button v-if="error||attempted" :disabled="loading||busy" @click="load">重新读取</el-button></template>
  <template #footer><el-button size="small" :disabled="busy" @click="close">{{unknown?'关闭':'取消'}}</el-button><el-button v-if="!unknown" size="small" type="danger" :loading="busy" :disabled="!removable" @click="remove">确定移除</el-button></template>
 </el-dialog>
</section></template>
<style scoped>.type-delete>p{color:var(--tl-muted);font-size:13px;line-height:20px}.type-delete :deep(.el-dialog p){overflow-wrap:anywhere}</style>
