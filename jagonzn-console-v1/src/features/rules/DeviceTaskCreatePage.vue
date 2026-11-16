<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute,useRouter} from 'vue-router'
import {can,currentProject,projectId,session} from '@/core/session'
import {onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import {devicesApi} from '@/features/devices/api'
import {typeProfileTransport} from '@/features/device-types/profile-api'
import {groupTransport} from '@/features/device-groups/device-group-api'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import {definitionUuid} from './device-task-definition-port'
import {deviceTaskDefinitionApi} from './device-task-definition-api'
import DeviceTaskCreateForm from './DeviceTaskCreateForm.vue'
import {taskCreationRouteSource,taskCreationSourceKey,taskCreationSourcePath,type TaskCreationSource} from './task-creation-source'
const route=useRoute(),router=useRouter(),busy=ref(false),locked=ref(false),confirmedReturn=ref<string>()
const source=computed(()=>taskCreationRouteSource(route.query,projectId.value)),sourceKey=computed(()=>taskCreationSourceKey(source.value))
const allowed=computed(()=>!!projectId.value&&can('task:manage')&&(source.value?.kind!=='DEVICE_TYPE'||session.ready&&!session.transitioning&&session.user?.currentProjectId===projectId.value&&currentProject.value?.id===projectId.value&&currentProject.value.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value.myRole||'')))
const resource=useResource(async signal=>{
 const origin=source.value,project=projectId.value;if(!origin)throw new Error('任务来源参数无效')
 if(origin.kind==='PROJECT'){if(origin.id!==project)throw new Error('项目创建范围已变化');return {kind:origin.kind,id:project} satisfies TaskCreationSource}
 if(origin.kind==='DEVICE_GROUP'){
  const group=await groupTransport.read(project,origin.id,signal)
  return {...origin,name:group.name} satisfies TaskCreationSource
 }
 if(origin.kind==='DEVICE_TYPE'){
  const profile=await typeProfileTransport.read(project,origin.id,signal)
  if(profile.type.id!==origin.id||profile.type.projectId!==project||!profile.type.name.trim())throw new Error('来源设备类型读取不匹配，请从类型详情重新进入')
  return {kind:origin.kind,id:origin.id,name:profile.type.name} satisfies TaskCreationSource
 }
 const value=await devicesApi.read(project,origin.id,signal)
 if(!value||value.id!==origin.id||typeof value.name!=='string'||!value.name.trim())throw new Error('来源设备读取不匹配，请从设备详情重新进入')
 return {kind:origin.kind,id:origin.id,name:value.name} satisfies TaskCreationSource
})
function clear(){resource.clear();busy.value=false;locked.value=false;confirmedReturn.value=undefined}
const releaseIdentity=onIdentityChange(clear);onScopeDispose(releaseIdentity)
watch([projectId,sourceKey,allowed],()=>{clear();if(source.value&&allowed.value)void resource.reload()},{immediate:true})
function back(){if(busy.value||locked.value)return;void router.push(source.value?taskCreationSourcePath(source.value):'/tasks/jobs')}
/** 只在权威定义明确保留来源目标时返回来源；其它范围进入实际任务详情。 */
async function created(id:string,returnToSource=true){if(!allowed.value||!definitionUuid(id)||!source.value)return;const destination=returnToSource?taskCreationSourcePath(source.value):`/tasks/jobs/${id}`;confirmedReturn.value=destination;try{await router.replace(destination)}finally{confirmedReturn.value=undefined}}
function allowNavigation(destination:string){return !busy.value&&!locked.value||confirmedReturn.value===destination}
onBeforeRouteLeave(to=>allowNavigation(to.fullPath));onBeforeRouteUpdate(to=>allowNavigation(to.fullPath))
function beforeUnload(event:BeforeUnloadEvent){if(busy.value||locked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload);onScopeDispose(()=>window.removeEventListener('beforeunload',beforeUnload))
</script>
<template><main class="tl-page device-task-create-page">
 <PageHeader title="创建任务" back :back-disabled="busy||locked" @back="back"/>
 <el-alert v-if="!source" title="任务创建入口参数无效，请重新从所有任务、设备、设备类型或设备组进入。" type="error" :closable="false"/>
 <AsyncState v-else :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" @retry="!busy&&!locked&&resource.reload()"><section v-if="resource.data.value" class="create-panel"><DeviceTaskCreateForm stepped :key="projectId+sourceKey" :source="resource.data.value" :transport="deviceTaskDefinitionApi" @close="back" @invalidated="clear" @created="created" @busy="busy=$event" @locked="locked=$event"/></section></AsyncState>
</main></template>
<style scoped>
.create-panel{width:100%;min-width:0}.device-task-create-page{min-width:0;padding:20px 30px 50px}.device-task-create-page :deep(.tl-page-header){min-height:24px;margin-bottom:24px}
.device-task-create-page :deep(.tl-page-header h1.is-secondary){color:var(--tl-title)}
.device-task-create-page :deep(.tl-back){font-weight:500}
@media(max-width:600px){.device-task-create-page{padding:20px 15px 40px}}
</style>
