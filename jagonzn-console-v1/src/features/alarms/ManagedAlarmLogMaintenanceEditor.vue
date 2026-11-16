<script setup lang="ts">
import {onScopeDispose,watch} from 'vue'
import {can,projectId} from '../../core/session'
import {ApiError,assertIdentity,IdentityChanged} from '../../core/http'
import {useResource} from '../../core/use-resource'
import AlarmLogMaintenanceEditor from './AlarmLogMaintenanceEditor.vue'
import {alarmLogMaintenanceApi,alarmLogMaintenanceRequest,sameMaintenanceSaved} from './alarm-log-maintenance-api'
import type {AlarmLogMaintenanceDraft,AlarmLogMaintenanceEditContext} from './alarm-log-maintenance-draft'
const props=defineProps<{logId:string;normal:boolean}>(),emit=defineEmits<{close:[];saved:[]}>()
const resource=useResource(signal=>alarmLogMaintenanceApi.read(projectId.value,props.logId,signal))
async function read(){resource.clear();if(projectId.value&&props.logId&&can('alarm:maintain'))await resource.reload()}
watch([projectId,()=>props.logId,()=>can('alarm:maintain')],(value,previous)=>{resource.clear();if(previous?.length&&(value[0]!==previous[0]||value[1]!==previous[1]||!value[2]))return;if(value[2])void read()},{immediate:true})
watch(resource.error,value=>{if(value){resource.data.value=undefined;if(value instanceof ApiError&&[401,403,404].includes(value.status))emit('close')}})
onScopeDispose(resource.clear)
async function save(context:AlarmLogMaintenanceEditContext,value:AlarmLogMaintenanceDraft){
 assertIdentity(context.identityEpoch)
 if(context.projectId!==projectId.value||context.logId!==props.logId||!can('alarm:maintain'))throw new IdentityChanged()
 if(!resource.data.value||value.version!==resource.data.value.version)throw new ApiError('维护信息已变更',409)
 if(!props.normal&&value.solution!==resource.data.value.solution)throw new ApiError('当前日志不可修改解决方案',400)
 let body:ReturnType<typeof alarmLogMaintenanceRequest>
 try{body=alarmLogMaintenanceRequest(value)}catch(cause){throw new ApiError(cause instanceof Error?cause.message:'请核对维护信息',400)}
 const saved=await alarmLogMaintenanceApi.save(context.projectId,context.logId,body);assertIdentity(context.identityEpoch)
 try{const fresh=await alarmLogMaintenanceApi.read(context.projectId,context.logId);assertIdentity(context.identityEpoch);if(!sameMaintenanceSaved(saved,fresh))throw new ApiError('维护信息已再次变更',409)}
 catch(cause){if(cause instanceof IdentityChanged||cause instanceof ApiError&&[401,403,404,409].includes(cause.status))throw cause;throw new ApiError('维护保存后读取失败，请核对结果',0,undefined,undefined,true)}
}
</script>
<template><AlarmLogMaintenanceEditor :project-id="projectId" :log-id="logId" :normal="normal" :can-maintain="can('alarm:maintain')" :initial="resource.data.value" :loading="resource.loading.value" :error="resource.error.value" :save="save" @retry="read" @close="emit('close')" @saved="emit('saved')" /></template>
