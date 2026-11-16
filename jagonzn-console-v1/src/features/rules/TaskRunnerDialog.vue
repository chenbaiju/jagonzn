<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import type { Task } from './models'
import { cas, selectedDeviceIds,taskActionLabel,taskBaseActionLabel } from './models'
import { errorMessage, onIdentityChange, type ApiError } from '@/core/http'
import { projectId } from '@/core/session'
import type { TaskChoicePage } from './task-choices'
import TaskChoiceSelect from './TaskChoiceSelect.vue'
const props=defineProps<{ modelValue:boolean; task:Task; initialDeviceIds?:string[]; busy?:boolean; locked?:boolean; error?:string; loadCandidates:(cursor:string|undefined,signal:AbortSignal)=>Promise<TaskChoicePage> }>()
const emit=defineEmits<{ 'update:modelValue':[value:boolean]; run:[ids?:string[]]; denied:[cause:ApiError]; conflict:[cause:ApiError] }>()
const mode=ref<'all'|'selected'>('all'),ids=ref<string[]>([]),localError=ref('')
const invalidated=ref(false), candidateReady=ref(false), candidateLoading=ref(false)
const blocked=computed(()=>props.busy || props.locked || invalidated.value || !props.modelValue)
const actionLabel=computed(()=>{
 try {
  const base=taskBaseActionLabel(props.task),detail=taskActionLabel(props.task)
  return base===detail?base:`${base} - ${detail}`
 } catch {return '未知任务类型'}
})
watch(()=>props.modelValue,open=>{if(!open)return;invalidated.value=false;candidateReady.value=false;candidateLoading.value=false;mode.value=props.initialDeviceIds?.length?'selected':'all';ids.value=props.initialDeviceIds?.slice() ?? (props.task.targetType==='EXPLICIT_DEVICES'?props.task.targetDeviceIds?.slice() || []:[]);localError.value=''}, {immediate:true})
function invalidate(){if(!props.modelValue || invalidated.value)return;invalidated.value=true;ids.value=[];localError.value='任务或身份已变化，请重新打开运行器';emit('update:modelValue',false)}
watch([projectId,()=>props.task.id,()=>props.task.version],invalidate)
const disposeIdentity=onIdentityChange(invalidate);onScopeDispose(disposeIdentity)
async function candidates(cursor:string|undefined,signal:AbortSignal):Promise<TaskChoicePage>{
  candidateLoading.value=true
  try{const result=await props.loadCandidates(cursor,signal);if(!signal.aborted && !invalidated.value)candidateReady.value=true;return result}
  catch(cause){if(!signal.aborted)candidateReady.value=false;throw cause}
  finally{if(!signal.aborted)candidateLoading.value=false}
}
function close(value=false){if(!value && !props.busy)emit('update:modelValue',false)}
function submit(){if(blocked.value)return;if(props.task.status==='PAUSED'){ElMessage.error('任务已停用，无法运行');return}try{if(props.task.status!=='ACTIVE')throw new Error('任务状态未知，请重新读取');if(mode.value==='all')emit('run');else{if(!candidateReady.value || candidateLoading.value)throw new Error('请先成功读取目标设备');cas(props.task.version);emit('run',selectedDeviceIds(ids.value))}}catch(cause){localError.value=errorMessage(cause)}}
</script>
<template><el-dialog :model-value="modelValue" class="task-runner-dialog" title="运行任务" width="min(500px, calc(100% - 32px))" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" @update:model-value="close">
 <el-form class="task-runner-form" label-position="top"><el-form-item label="任务名称"><span class="task-runner-value">{{ task.name }}</span></el-form-item><el-form-item label="任务类型"><span class="task-runner-value">{{actionLabel}}</span></el-form-item>
 <el-form-item label="选择目标类型" class="task-runner-choice">
  <template #label>选择目标类型 <el-tooltip content="可以对任务的所有目标设备运行，也可以从中选择部分设备运行。" placement="top"><el-icon class="task-runner-help" tabindex="0" role="img" aria-label="选择目标类型说明"><QuestionFilled /></el-icon></el-tooltip></template>
  <el-radio-group v-model="mode" :disabled="blocked" aria-label="选择目标类型"><el-radio value="all">所有目标设备</el-radio><el-radio value="selected">指定目标设备</el-radio></el-radio-group>
 </el-form-item>
 <el-form-item v-if="mode==='selected'" label="指定目标设备">
  <TaskChoiceSelect v-if="modelValue && !invalidated" v-model="ids" class="task-runner-targets" :collapse-tags="false" :loader="candidates" :disabled="blocked" @denied="emit('denied',$event)" @conflict="emit('conflict',$event)" />
 </el-form-item></el-form>
 <el-alert v-if="localError || error" :title="localError || error" type="warning" :closable="false" />
 <template #footer><el-button :disabled="busy" @click="close()">取消</el-button><el-button type="primary" :loading="busy" :disabled="blocked || mode==='selected' && (!candidateReady || candidateLoading) || !['ACTIVE','PAUSED'].includes(task.status||'')" @click="submit">确定</el-button></template>
</el-dialog></template>

<style scoped>
:global(.task-runner-dialog .el-dialog__body){padding:30px 20px 47px}
.task-runner-form :deep(.el-form-item){margin-bottom:17px}
.task-runner-form :deep(.el-form-item:last-child){margin-bottom:0}
.task-runner-form :deep(.el-form-item .el-form-item__label){margin-bottom:0;color:#606266;font-size:14px;font-weight:600;line-height:22px}
.task-runner-form :deep(.el-form-item__content){line-height:22px}
.task-runner-value{color:#082a2a;font-size:14px;line-height:22px;overflow-wrap:anywhere}
.task-runner-choice :deep(.el-radio-group){margin-top:3px}
.task-runner-choice :deep(.el-radio){height:24px;margin-right:30px}
.task-runner-choice :deep(.el-radio:last-child){margin-right:0}
.task-runner-choice :deep(.el-radio__label){padding-left:10px;font-size:14px;line-height:24px}
:global(.task-runner-dialog .el-dialog__footer .el-button + .el-button){margin-left:10px}
.task-runner-targets{padding-bottom:2px}
:global(.task-runner-dialog .el-dialog__body > .el-alert){margin:16px 0 0}
.task-runner-help{margin-left:6px;color:#b9bec7;font-size:13px;vertical-align:-2px;cursor:help;}
</style>
