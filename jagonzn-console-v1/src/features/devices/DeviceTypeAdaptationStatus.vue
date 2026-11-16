<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {can,projectId} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {readAdaptation,adaptationStateLabel,type Adaptation} from './device-type-association-api'
const props=defineProps<{deviceId:string}>()
const allowed=computed(()=>can('device:read')&&!!projectId.value)
const value=ref<Adaptation>(),loading=ref(false),error=ref(''),missing=ref(false)
let sequence=0,controller:AbortController|undefined,disposed=false
const label=computed(()=>loading.value?'读取中':missing.value?'未登记':adaptationStateLabel(value.value))
const tone=computed<'success'|'info'|'warning'>(()=>!value.value||missing.value?'info':value.value.status==='READY'?'success':value.value.status==='NOT_ASSOCIATED'?'info':'warning')
const detail=computed(()=>{
 if(!value.value||missing.value)return ''
 const attempts=value.value.attempts?`已执行 ${value.value.attempts} 轮`:'尚未执行'
 return value.value.reason?`${attempts}；等待原因：${value.value.reason}`:attempts
})
function reset(){sequence++;controller?.abort();value.value=undefined;error.value='';missing.value=false;loading.value=false}
async function load(){
 if(!allowed.value||!props.deviceId)return
 const request=++sequence,epoch=identityEpoch(),project=projectId.value
 controller?.abort();controller=new AbortController()
 loading.value=true;error.value='';missing.value=false
 try{const result=await readAdaptation(project,props.deviceId,controller.signal);if(disposed||request!==sequence||epoch!==identityEpoch())return;value.value=result}
 catch(cause){
  if(disposed||request!==sequence||epoch!==identityEpoch()||cause instanceof IdentityChanged)return
  value.value=undefined
  if(cause instanceof ApiError&&cause.status===404)missing.value=true
  else error.value=errorMessage(cause)
 }
 finally{if(request===sequence)loading.value=false}
}
watch(()=>[props.deviceId,allowed.value] as const,()=>{reset();void load()},{immediate:true,flush:'sync'})
const dispose=onIdentityChange(()=>{reset();void load()})
onScopeDispose(()=>{disposed=true;reset();dispose()})
</script>
<template><p v-if="allowed" class="device-type-adaptation"><span>接入适配：</span><el-tag size="small" :type="tone">{{label}}</el-tag><span v-if="detail" class="device-type-adaptation-detail">{{detail}}</span><el-button v-if="error" size="small" link @click="load">重试</el-button><span v-if="error" class="device-type-adaptation-detail">{{error}}</span></p></template>
<style scoped>
.device-type-adaptation{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0 0;font-size:13px;color:var(--tl-muted)}
.device-type-adaptation-detail{color:var(--tl-muted);font-size:12px}
</style>
