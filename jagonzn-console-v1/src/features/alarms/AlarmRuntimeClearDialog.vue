<script setup lang="ts">
import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { onIdentityChange } from '../../core/http'
import { projectId, session } from '../../core/session'
import { useAlarmRuntimeInstance } from './use-alarm-runtime-instance'
import { alarmRuntimeClearContent, type AlarmRuntimeClearContent, type AlarmRuntimeInstanceIdentity } from './alarm-runtime-instance-api'
const props=defineProps<{identity?:AlarmRuntimeInstanceIdentity;modelValue:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:boolean];cleared:[]}>()
const state=useAlarmRuntimeInstance(()=>props.identity,()=>props.modelValue)
const draft=reactive<AlarmRuntimeClearContent>({alarmReason:'',solution:'',remark:''}),formError=ref('')
const error=computed(()=>formError.value||state.error.value)
const disabled=computed(()=>!state.confirming.value||!state.writable.value||state.writing.value||state.review.value)
function resetDraft(){draft.alarmReason='';draft.solution='';draft.remark='';formError.value=''}
// 资源ID相同时，账号、会话或权限变化也必须清除手输资料。
const stopIdentity=onIdentityChange(resetDraft)
onScopeDispose(()=>{stopIdentity();resetDraft()})
watch(()=>[projectId.value,session.user?.accountId,state.readable.value,state.writable.value,state.denied.value],resetDraft,{flush:'sync'})
watch(()=>[props.identity?.instanceId,props.identity?.ruleId,props.identity?.deviceId],resetDraft,{flush:'sync'})
watch(()=>props.modelValue,shown=>{if(shown&&!state.review.value)resetDraft()})
watch(()=>[draft.alarmReason,draft.solution,draft.remark],()=>{formError.value=''})
watch(state.value,()=>{if(props.modelValue&&!state.review.value&&state.canClear.value)state.beginClear()})
function close(){if(state.writing.value)return;state.cancelClear();emit('update:modelValue',false)}
async function confirm(){
 if(disabled.value)return
 let content:Readonly<AlarmRuntimeClearContent>
 try{content=alarmRuntimeClearContent(draft)}catch(cause){formError.value=cause instanceof Error?cause.message:'解除资料格式不合法';return}
 if(await state.confirmClear(content)){emit('cleared');emit('update:modelValue',false)}
}
function proceed(){if(state.continueWithCurrent())state.beginClear()}
</script>
<template>
 <el-dialog :model-value="modelValue" title="解除告警" width="min(700px,94vw)" :lock-scroll="false" :show-close="!state.writing.value" :close-on-click-modal="false" :close-on-press-escape="!state.writing.value" @update:model-value="(shown:boolean)=>{if(!shown)close()}">
  <p v-if="state.loading.value" role="status">正在读取当前告警…</p>
  <el-alert v-if="error" :title="error" type="error" :closable="false" />
  <template v-if="state.review.value&&!state.denied.value"><p>上次操作结果需要核对，请读取当前状态后再决定是否继续。</p><el-button :loading="state.loading.value" :disabled="state.writing.value" @click="state.reread">读取当前状态</el-button><p v-if="state.value.value">当前状态：{{ state.value.value.conditionState==='CLEARED'?'已解除':state.value.value.conditionState==='ACTIVE'?'告警中':'待定' }}</p><el-button v-if="state.canContinue.value" @click="proceed">按当前状态继续</el-button></template>
  <p v-else-if="state.value.value?.conditionState==='CLEARED'">此告警已解除。</p>
  <div class="clear-form"><el-form label-position="top" :disabled="disabled" @submit.prevent="confirm">
   <el-form-item label="告警原因"><el-input v-model="draft.alarmReason" type="textarea" :rows="3" placeholder="可选" :disabled="disabled" aria-label="告警原因" /></el-form-item>
   <el-form-item label="解决方案"><el-input v-model="draft.solution" type="textarea" :rows="3" placeholder="可选" :disabled="disabled" aria-label="解决方案" /></el-form-item>
   <el-form-item label="其它备注"><el-input v-model="draft.remark" type="textarea" :rows="3" placeholder="可选" :disabled="disabled" aria-label="其它备注" /></el-form-item>
  </el-form></div>
  <template #footer><el-button :disabled="state.writing.value" @click="close">取消</el-button><el-button type="primary" :loading="state.writing.value" :disabled="disabled" @click="confirm">提交</el-button></template>
 </el-dialog>
</template>
<style scoped>.clear-form{margin-bottom:20px}</style>
