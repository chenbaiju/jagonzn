<script setup lang="ts">
import { onScopeDispose, watch } from 'vue'
import { can, projectId } from '../../core/session'
import { ApiError, assertIdentity, IdentityChanged } from '../../core/http'
import { useResource } from '../../core/use-resource'
import { alarmApi } from './api'
import GroupOrdinaryOptionsEditor from './GroupOrdinaryOptionsEditor.vue'
import { ordinaryGroupOptionsRequest, ordinaryGroupView } from './notification-group-contract'
import type { NotificationOrdinaryEditContext, NotificationOrdinaryOptions } from './notification-ordinary-options'
const props=defineProps<{groupId:string}>(),emit=defineEmits<{close:[];saved:[]}>()
const options=useResource(async signal=>ordinaryGroupView(await alarmApi.groupOrdinaryOptions(projectId.value,props.groupId,signal)))
const members=useResource(signal=>alarmApi.notificationMembers(projectId.value,signal))
function clear(){options.clear();members.clear()}
async function read(){clear();if(projectId.value&&props.groupId&&can('alarm:manage'))await options.reload()}
watch([projectId,()=>props.groupId,()=>can('alarm:manage')],(value,previous)=>{clear();if(previous?.length&&(value[0]!==previous[0]||value[1]!==previous[1]))return;if(value[2])void read()},{immediate:true})
watch(options.data,value=>{members.clear();if(value?.mode==='member'&&can('alarm:manage'))void members.reload()})
watch(options.error,value=>{if(value){options.data.value=undefined;members.clear()}})
onScopeDispose(clear)
async function save(context:NotificationOrdinaryEditContext,value:NotificationOrdinaryOptions){
 assertIdentity(context.identityEpoch)
 if(!can('alarm:manage')||context.projectId!==projectId.value||context.groupId!==props.groupId)throw new IdentityChanged()
 const body=ordinaryGroupOptionsRequest(value,members.data.value||[])
 const saved=await alarmApi.saveOrdinaryGroupOptions(context.projectId,context.groupId,body)
 try{const fresh=await alarmApi.groupOrdinaryOptions(context.projectId,context.groupId);assertIdentity(context.identityEpoch);if(JSON.stringify(saved)!==JSON.stringify(fresh))throw new ApiError('配置已再次变更',409)}
 catch(cause){if(cause instanceof IdentityChanged||cause instanceof ApiError&&[401,403,404,409].includes(cause.status))throw cause;throw new ApiError('保存后读取失败，请核对结果',0,undefined,undefined,true)}
}
</script>
<template><GroupOrdinaryOptionsEditor :project-id="projectId" :group-id="groupId" :can-manage="can('alarm:manage')" :initial="options.data.value" :loading="options.loading.value" :error="options.error.value" :members="members.data.value||[]" :member-loading="members.loading.value" :member-error="members.error.value" :save="save" @retry="read" @retry-members="members.reload" @close="emit('close')" @saved="emit('saved')" /></template>
