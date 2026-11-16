<script setup lang="ts">
import { onScopeDispose, ref, watch } from 'vue'
import AsyncState from '../../ui/AsyncState.vue'
import { ApiError, assertIdentity, errorMessage, identityEpoch, IdentityChanged, onIdentityChange } from '../../core/http'
import { copyMaintenanceDraft, type AlarmLogMaintenanceDraft, type AlarmLogMaintenanceEditContext } from './alarm-log-maintenance-draft'
const props=defineProps<{projectId:string;logId:string;normal:boolean;canMaintain:boolean;initial?:AlarmLogMaintenanceDraft;loading?:boolean;error?:unknown;save:(context:AlarmLogMaintenanceEditContext,value:AlarmLogMaintenanceDraft)=>Promise<void>}>()
const emit=defineEmits<{close:[];saved:[];retry:[]}>()
const draft=ref<AlarmLogMaintenanceDraft>(),busy=ref(false),error=ref(''),review=ref(false)
let serial=0
function clear(){serial++;draft.value=undefined;busy.value=false;error.value='';review.value=false}
function read(){
 clear();if(!props.canMaintain||props.loading||props.error||!props.initial)return
 const value=props.initial
 if(!Number.isInteger(value.version)||value.version<0||value.version>2147483647||[value.alarmReason,value.solution,value.remark].some(field=>typeof field!=='string')){error.value='维护信息不完整，请重新读取。';return}
 draft.value=copyMaintenanceDraft(value)
}
watch([()=>props.initial,()=>props.loading,()=>props.error],read,{immediate:true})
watch([()=>props.projectId,()=>props.logId],()=>{clear();emit('close')})
watch(()=>props.canMaintain,value=>{if(!value){clear();emit('close')}},{flush:'sync'})
const dispose=onIdentityChange(()=>{clear();emit('close')});onScopeDispose(()=>{clear();dispose()})
async function save(){
 if(busy.value||review.value||!props.canMaintain||!props.projectId||!props.logId||!draft.value||props.loading||props.error)return
 if(draft.value.version===2147483647){error.value='当前维护信息无法继续编辑，请重新读取。';review.value=true;return}
 const context={projectId:props.projectId,logId:props.logId,identityEpoch:identityEpoch()},snapshot=copyMaintenanceDraft(draft.value),request=++serial
 busy.value=true;error.value=''
 try{await props.save(context,snapshot);assertIdentity(context.identityEpoch);if(request!==serial||context.projectId!==props.projectId||context.logId!==props.logId)return;emit('saved');emit('close')}
 catch(cause){
  if(cause instanceof IdentityChanged||request!==serial)return
  if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){clear();emit('close');return}
  const validation=cause instanceof ApiError&&!cause.outcomeUnknown&&(cause.status===400||cause.status===422)
  review.value=!validation
  error.value=validation?errorMessage(cause):cause instanceof ApiError&&cause.status===409?'维护信息已变更，请关闭后重新读取。':'保存结果未知，请关闭后重新读取核对。'
 }
 finally{if(request===serial)busy.value=false}
}
</script>
<template><el-dialog :model-value="true" title="编辑维护信息" width="min(700px, 94vw)" :show-close="!busy" :close-on-click-modal="false" :close-on-press-escape="!busy" @close="!busy&&emit('close')"><AsyncState :loading="loading" :error="props.error" @retry="emit('retry')"><el-form v-if="draft" label-position="top">
 <el-form-item label="告警原因"><el-input v-model="draft.alarmReason" type="textarea" :rows="3" placeholder="选填" :disabled="busy||!canMaintain" aria-label="告警原因" /></el-form-item>
 <el-form-item v-if="normal" label="解决方案"><el-input v-model="draft.solution" type="textarea" :rows="3" placeholder="选填" :disabled="busy||!canMaintain" aria-label="解决方案" /></el-form-item>
 <el-form-item label="其它备注"><el-input v-model="draft.remark" type="textarea" :rows="3" placeholder="选填" :disabled="busy||!canMaintain" aria-label="其它备注" /></el-form-item>
 </el-form></AsyncState><el-alert v-if="error" :title="error" type="error" :closable="false" /><template #footer><el-button :disabled="busy" @click="emit('close')">取消</el-button><el-button type="primary" :loading="busy" :disabled="busy||review||loading||!!props.error||!draft||!canMaintain" @click="save">提交</el-button></template></el-dialog></template>
