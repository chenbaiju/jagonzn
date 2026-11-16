<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {errorMessage} from '../../core/http'
import {alarmLogExportColumns,buildAlarmLogExportFile,type AlarmLogExportKey,type AlarmLogExportFormat,type AlarmLogExportDisplayRow,type AlarmLogExportFile} from './alarm-log-export-file'
/** 显示组件由当前身份/筛选宿主提供loader和download；不自行决定读取范围。 */
const props=defineProps<{modelValue:boolean;scopeKey:string;load:(signal:AbortSignal)=>Promise<readonly AlarmLogExportDisplayRow[]>;download:(file:AlarmLogExportFile)=>Promise<void>|void}>()
const emit=defineEmits<{'update:modelValue':[value:boolean]}>()
const selected=ref<AlarmLogExportKey[]>(alarmLogExportColumns.map(column=>column.key)),format=ref<AlarmLogExportFormat>('xls'),busy=ref(false),error=ref(''),empty=ref(false)
const disabled=computed(()=>busy.value||selected.value.length===0)
let serial=0,controller:AbortController|undefined
function cancel(){serial++;controller?.abort();busy.value=false;error.value='';empty.value=false}
watch(()=>props.scopeKey,()=>{cancel();emit('update:modelValue',false)},{flush:'sync'})
watch(()=>props.modelValue,value=>{if(!value)cancel()},{flush:'sync'})
onScopeDispose(cancel)
async function generate(){
 if(disabled.value||!props.modelValue)return
 const request=++serial,scope=props.scopeKey,columns=[...selected.value],type=format.value;controller=new AbortController();const signal=controller.signal
 busy.value=true;error.value='';empty.value=false
 try{
  const rows=await props.load(signal)
  if(request!==serial||signal.aborted||scope!==props.scopeKey||!props.modelValue)return
  if(!rows.length){empty.value=true;return}
  const file=buildAlarmLogExportFile(rows,columns,type)
  await props.download(file)
  if(request===serial&&scope===props.scopeKey&&props.modelValue)emit('update:modelValue',false)
 }catch(cause){if(request===serial&&!signal.aborted)error.value=errorMessage(cause)}
 finally{if(request===serial)busy.value=false}
}
</script>
<template>
 <el-dialog :model-value="modelValue" title="导出告警消息" width="min(520px,94vw)" :lock-scroll="false" :close-on-click-modal="false" append-to-body @update:model-value="$emit('update:modelValue',$event)">
  <el-alert title="提醒" description="单次最多导出当前筛选条件下按列表顺序排列的前 1000 条告警消息。" type="info" show-icon :closable="false" class="export-notice" />
  <el-form label-position="top" :disabled="busy">
   <el-form-item label="导出字段"><el-checkbox-group v-model="selected" class="export-columns"><el-checkbox v-for="column in alarmLogExportColumns" :key="column.key" :value="column.key">{{ column.label }}</el-checkbox></el-checkbox-group></el-form-item>
   <el-form-item label="导出格式"><el-radio-group v-model="format"><el-radio value="xls">Excel</el-radio><el-radio value="csv">CSV</el-radio></el-radio-group></el-form-item>
  </el-form>
  <el-alert v-if="empty" title="当前筛选条件下没有可导出的告警消息" type="warning" :closable="false" />
  <el-alert v-if="error" :title="error" type="error" :closable="false" />
  <template #footer><el-button @click="$emit('update:modelValue',false)">取消</el-button><el-button type="primary" :disabled="disabled" :loading="busy" @click="generate">{{busy?'正在导出...':'导出'}}</el-button></template>
 </el-dialog>
</template>
<style scoped>.export-notice{margin-bottom:16px}.export-columns{display:flex;flex-direction:column;gap:4px}.export-columns :deep(.el-checkbox){margin-right:0;height:24px}.export-columns :deep(.el-checkbox__label){white-space:normal;color:var(--tl-text);font-weight:400;padding-left:12px}</style>
