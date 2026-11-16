<script setup lang="ts">
import {showOperationFeedback} from '@/ui/operation-feedback'
import {ref,computed,watch,onScopeDispose} from 'vue'
import {ElMessage} from 'element-plus'
import {can,projectId,currentProject} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,onIdentityChange} from '@/core/http'
import {useDeviceGuard} from './use-device-guard'
import {prepareRemoval,submitRemoval,decodeRemoval,readRemovalCurrent,readRemovalSubmission,type RemovalReceipt} from './current-property-removal-api'
const props=defineProps<{deviceId:string;modelVersionId?:string;keys:readonly string[];disabled?:boolean;hideTrigger?:boolean}>(),emit=defineEmits<{saved:[];busy:[value:boolean]}>()
const open=ref(false),status=ref<'idle'|'sending'|'accepted'|'unknown'>('idle'),error=ref(''),checking=ref(false),denied=ref(false)
const writable=computed(()=>can('device:control')&&currentProject.value?.status==='ACTIVE'),blocked=computed(()=>status.value==='sending'||checking.value||status.value==='unknown')
watch(blocked,value=>emit('busy',value),{immediate:true,flush:'sync'})
const receipt=ref<RemovalReceipt>(),capture=useDeviceGuard(()=>props.deviceId)
let generation=0,controller:AbortController|undefined,intent:Readonly<{project:string;device:string;model:string;key:string;bodyHash:string;prepared:ReturnType<typeof prepareRemoval>}>|undefined
function reset(){generation++;controller?.abort();controller=undefined;open.value=false;status.value='idle';error.value='';checking.value=false;receipt.value=undefined;intent=undefined}
function resetScope(){denied.value=false;reset()}
function deny(){reset();denied.value=true;ElMessage.error('操作权限已失效，请刷新权限后重试')}
const dispose=onIdentityChange(resetScope);onScopeDispose(()=>{reset();dispose();emit('busy',false)})
watch([()=>projectId.value,()=>props.deviceId,()=>can('device:control')],resetScope)
watch(()=>props.modelVersionId,model=>{if(intent&&model!==intent.model&&!blocked.value&&status.value!=='accepted')resetScope()})
function start(){
 if(denied.value||!can('device:control')||status.value==='sending'||checking.value)return
 if(status.value==='unknown'||status.value==='accepted'){open.value=true;return}
 if(!writable.value||props.disabled||!props.modelVersionId)return
 try{const prepared=prepareRemoval(props.modelVersionId,props.keys);reset();intent=Object.freeze({project:projectId.value,device:props.deviceId,model:props.modelVersionId,key:crypto.randomUUID(),bodyHash:'',prepared});open.value=true}catch(cause){ElMessage.error(errorMessage(cause))}
}
defineExpose({start})
function close(){if(status.value==='sending'||checking.value)return;if(status.value==='accepted'){reset();return}open.value=false}
async function confirm(current:number,check:()=>void){
 if(!receipt.value)return;const accepted=receipt.value;checking.value=true;controller=new AbortController()
 try{const newValue=await readRemovalCurrent(accepted,controller.signal);check();if(current!==generation)return;reset();emit('saved');showOperationFeedback(newValue?'已移除，已有新属性值到达':'移除成功')}
 catch(cause){if(current===generation&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}error.value=`已移除，当前值核对未完成。${errorMessage(cause)}`;emit('saved')}}
 finally{if(current===generation)checking.value=false}
}
async function submit(){
 if(denied.value||!intent||status.value!=='idle'||!writable.value)return
 const current=generation,check=capture(),original=intent;status.value='sending';error.value='';let beforeWrite=true
 try{
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(original.prepared.body));check();if(current!==generation)return
  // 摘要等待期间项目可能归档；首次写前再核资格，不影响已发送原件的只读恢复。
  if(!writable.value)throw new Error('项目当前不可修改，本次操作尚未提交。')
  intent=Object.freeze({...original,bodyHash:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('')});beforeWrite=false
  const bytes=await submitRemoval(original.project,original.device,original.prepared.body,original.key);check();if(current!==generation)return;receipt.value=decodeRemoval(bytes,original.project,original.device,original.model,original.prepared.keys);status.value='accepted';await confirm(current,check)
 }catch(cause){if(current===generation&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}status.value=beforeWrite||cause instanceof ApiError&&!cause.outcomeUnknown&&cause.status>=400&&cause.status<500&&![10010,10014].includes(cause.code||0)?'idle':'unknown';error.value=errorMessage(cause)}}
}
async function recover(){
 if(status.value!=='unknown'||checking.value||!intent||!can('device:control'))return
 const original=intent,current=generation,check=capture();checking.value=true;error.value='';controller=new AbortController()
 try{const value=await readRemovalSubmission(original.project,original.device,original.model,original.prepared.keys,original.key,original.bodyHash,controller.signal);check();if(current!==generation)return;receipt.value=value;status.value='accepted';await confirm(current,check)}
 catch(cause){if(current===generation&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}status.value='unknown';error.value=cause instanceof ApiError&&cause.status===404?'暂未定位原请求回执，请稍后核对；本次操作不会再次删除。':errorMessage(cause)}}
 finally{if(current===generation)checking.value=false}
}
function reread(){if(status.value==='accepted'&&!checking.value)void confirm(generation,capture())}
</script>
<template><el-button v-if="!hideTrigger&&!denied&&can('device:control')&&(keys.length||status==='unknown'||status==='accepted')" type="danger" :disabled="status==='sending'||checking||((disabled||!modelVersionId||!writable)&&status!=='unknown'&&status!=='accepted')" @click="start">移除属性</el-button><el-dialog v-if="!denied" :model-value="open" title="移除属性" width="min(420px,94vw)" :close-on-click-modal="false" :show-close="status!=='sending'&&!checking" :close-on-press-escape="status!=='sending'&&!checking" @close="close"><p>确认删除选中的属性吗？</p><el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="status==='unknown'" title="操作结果暂时无法确认，请核对原请求。本次操作不能再次提交。" type="warning" :closable="false"/><template #footer><el-button :disabled="status==='sending'||checking" @click="close">取消</el-button><el-button v-if="status==='accepted'" :loading="checking" @click="reread">重新核对</el-button><el-button v-else-if="status==='unknown'" :loading="checking" @click="recover">核对原请求</el-button><el-button v-else type="danger" :loading="status==='sending'||checking" :disabled="status!=='idle'||!writable" @click="submit">确认</el-button></template></el-dialog></template>
