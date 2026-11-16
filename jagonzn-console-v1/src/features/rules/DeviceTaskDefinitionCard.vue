<script setup lang="ts">
import {computed,ref,toRef,watch} from 'vue'
import {useRouter} from 'vue-router'
import {InfoFilled,VideoPlay} from '@element-plus/icons-vue'
import {can,projectId} from '@/core/session'
import {ApiError} from '@/core/http'
import AsyncState from '@/ui/AsyncState.vue'
import {showOperationFeedback} from '@/ui/operation-feedback'
import {cas,taskBaseActionLabel} from './models'
import {definitionUuid,type DeviceTaskDefinition,type DeviceTaskDefinitionPort} from './device-task-definition-port'
import {useTaskRelatedDevicesState,type RelatedDevicesTransport} from './task-related-devices-state'
const props=defineProps<{row:DeviceTaskDefinition;deviceId:string;deviceName?:string;transport:DeviceTaskDefinitionPort;refreshContext:()=>Promise<void>}>()
const emit=defineEmits<{busy:[id:string,value:boolean];denied:[cause:ApiError]}>()
const router=useRouter(),runOpen=ref(false)
const job=computed(()=>props.row.id),definition=computed(()=>props.row.version),enabled=computed(()=>props.row.status==='ACTIVE')
const relationLabel=computed(()=>({EXPLICIT_DEVICES:'设备',DEVICE_TYPE:'设备类型',ALL_DEVICES:'所有设备',DEVICE_GROUP:'设备分组',DEVICE_GROUPS:'设备分组'}[props.row.targetType]||'设备'))
const transport:RelatedDevicesTransport={
  readRows:async(project,id,version,cursor,signal)=>{
    if(cursor)throw new Error('单设备定时偏好不支持设备列表游标')
    const value=await props.transport.preference(project,id,props.deviceId,version,signal)
    if(!value||!definitionUuid(value.deviceId)||value.deviceId!==props.deviceId||value.definitionVersion!==version||typeof value.allowed!=='boolean')throw new Error('设备任务定时偏好身份不匹配，请重新读取')
    return {rows:[{key:value.deviceId,label:props.deviceName||value.deviceId,scheduled:value.allowed,writeToken:cas(value.version)}],definitionToken:cas(value.definitionVersion)}
  },
  changeSchedule:async(project,id,device,version,preference,allowed)=>{
    if(device!==props.deviceId)throw new Error('当前设备任务范围已改变')
    const value=await props.transport.change(project,id,device,version,preference,allowed)
    if(!value||value.deviceId!==device||value.allowed!==allowed||value.definitionVersion!==version||cas(value.version)!==preference+1)throw new Error('设备定时偏好回执不匹配，请重新读取')
    return {key:device,scheduled:value.allowed,writeToken:value.version,definitionToken:value.definitionVersion}
  },
  runRows:async(project,id,version,devices)=>{
    if(devices.length!==1||devices[0]!==props.deviceId)throw new Error('仅允许运行当前设备任务')
    await props.transport.run(project,id,props.deviceId,version)
  }
}
const state=useTaskRelatedDevicesState(job,definition,enabled,transport,()=>props.refreshContext(),undefined,'CURRENT_DEVICE_MANUAL')
const preference=computed(()=>state.page.data.value?.rows[0])
watch(()=>state.busy.value||state.locked.value,value=>emit('busy',props.row.id,value),{immediate:true,flush:'sync'})
watch(state.page.error,cause=>{if(cause instanceof ApiError&&[401,403,404].includes(cause.status))emit('denied',cause)})
watch(state.notice,value=>{if(value)showOperationFeedback(value)})
watch([projectId,toRef(props,'deviceId'),definition,()=>state.canRun.value],()=>{runOpen.value=false})
async function run(){if(!runOpen.value||!state.canRun.value)return;await state.run([props.deviceId]);if(!state.locked.value)runOpen.value=false}
function detail(){if(can('task:read')&&!state.busy.value&&!state.locked.value)void router.push(`/tasks/jobs/${props.row.id}`)}
</script>
<template><article class="device-task-card">
  <header><button type="button" class="definition-name" :disabled="state.busy.value||state.locked.value" @click="detail">{{row.name}}</button><span class="definition-status">{{row.status==='ACTIVE'?'已启用':'未启用'}}</span></header>
  <p class="definition-kind">{{taskBaseActionLabel(row)}} - {{relationLabel}}</p><p v-if="row.actionType==='COMMAND'" class="definition-command">{{row.commandKey}}</p>
  <div class="definition-run"><el-button v-if="can('task:run')" :icon="VideoPlay" size="small" :disabled="!state.canRun.value" @click="runOpen=true">运行任务</el-button></div>
  <footer><span>允许该设备 <el-tooltip content="设置是否允许当前设备定时执行任务。该选项不影响手动执行任务。"><el-icon aria-label="设备定时许可说明"><InfoFilled/></el-icon></el-tooltip></span><el-switch v-if="preference" :model-value="preference.scheduled" :disabled="!state.canManage.value" aria-label="允许该设备定时执行" @update:model-value="state.toggle(deviceId,!!$event)"/><span v-else class="preference-unknown">未确认</span></footer>
  <AsyncState v-if="state.page.error.value" :error="state.page.error.value" @retry="state.reload()"/>
  <p v-if="state.writeError.value" class="definition-feedback" role="alert">{{state.writeError.value}}</p>
  <el-button v-if="state.locked.value" size="small" :disabled="state.busy.value" @click="state.reload()">重新读取核对</el-button>
  <el-dialog :model-value="runOpen" title="运行任务" width="500px" :close-on-click-modal="!state.busy.value" :close-on-press-escape="!state.busy.value" :show-close="!state.busy.value" @update:model-value="!state.busy.value&&(runOpen=$event)">
    <el-form label-position="top"><el-form-item label="任务名称">{{row.name}}</el-form-item><el-form-item label="目标设备">{{deviceName||deviceId}}</el-form-item></el-form><p>仅对当前设备发起一次手动运行。</p><p v-if="state.writeError.value" role="alert">{{state.writeError.value}}</p>
    <template #footer><el-button :disabled="state.busy.value" @click="runOpen=false">取消</el-button><el-button type="primary" :loading="state.busy.value" :disabled="!state.canRun.value" @click="run">确定</el-button></template>
  </el-dialog>
</article></template>
<style scoped>
.device-task-card{border:1px solid var(--tl-border);padding:16px 20px;background:#fff;min-width:0}.device-task-card header{display:flex;gap:10px;justify-content:space-between;align-items:flex-start}.definition-name{padding:0;border:0;background:none;color:#333;font:inherit;font-size:16px;font-weight:600;text-align:left;cursor:pointer;overflow-wrap:anywhere}.definition-name:disabled{cursor:default}.definition-status{flex:none;color:#999;font-size:12px;line-height:22px}.definition-kind,.definition-command{margin:5px 0;color:#888;font-size:13px;overflow-wrap:anywhere}.definition-run{min-height:32px;margin:10px 0}.device-task-card footer{border-top:1px solid #eee;padding-top:10px;display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#999;gap:12px}.device-task-card footer>span{display:inline-flex;gap:5px;align-items:center}.definition-feedback{font-size:13px;overflow-wrap:anywhere}.preference-unknown{color:#999}
</style>
