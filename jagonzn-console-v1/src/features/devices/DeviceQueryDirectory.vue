<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {projectId,session,can,currentProject} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange,IdentityChanged} from '@/core/http'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import PageHeader from '@/ui/PageHeader.vue'
import {InfoFilled} from '@element-plus/icons-vue'
import AsyncState from '@/ui/AsyncState.vue'
import DevicePropertyQueryDialog from './DevicePropertyQueryDialog.vue'
import {savedPropertyQueryTransport,prepareSavedQuery,type SavedPropertyQuery,type SavedPropertyQueryTransport} from './device-saved-property-query-api'
import {propertyQueryTransport,type PropertyQueryTransport} from './device-property-query-api'
const props=withDefaults(defineProps<{savedTransport?:SavedPropertyQueryTransport;queryTransport?:PropertyQueryTransport}>(),{savedTransport:()=>savedPropertyQueryTransport,queryTransport:()=>propertyQueryTransport})
const readable=computed(()=>session.ready&&!session.transitioning&&!!projectId.value&&!!session.user?.accountId&&can('device:read'))
const dialog=shallowRef<InstanceType<typeof DevicePropertyQueryDialog>>(),locked=ref(false)
const writable=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||'')&&['OWNER','ADMIN'].includes(session.user?.projectRole||''))
const resource=useResource(signal=>props.savedTransport.list(projectId.value,signal))
const forbidden=computed(()=>!readable.value||resource.error.value instanceof ApiError&&[401,403].includes(resource.error.value.status))
function reload(){if(!readable.value||locked.value||resource.loading.value)return;resource.clear();void resource.reload()}
function changed(){if(readable.value){resource.clear();void resource.reload()}}
function open(id?:string){if(!readable.value||locked.value)return;if(id){if(!resource.data.value?.some(row=>row.id===id))return;void dialog.value?.openSaved(id)}else void dialog.value?.open()}
function reset(){versionController?.abort();versionsShown.value=false;versions.value=[];deleteShown.value=false;deleteTarget.value=undefined;deleteError.value='';deleteUnknown.value=false;dialog.value?.reset();locked.value=false;resource.clear();if(readable.value)void resource.reload()}
const versionsShown=ref(false),versions=shallowRef<readonly SavedPropertyQuery[]>([]),versionsLoading=ref(false),versionsError=ref(''),versionSource=shallowRef<SavedPropertyQuery>()
const deleteShown=ref(false),deleteTarget=shallowRef<SavedPropertyQuery>(),deleteBusy=ref(false),deleteError=ref(''),deleteUnknown=ref(false)
let versionSequence=0,versionController:AbortController|undefined
function closeVersions(){versionController?.abort();versionsShown.value=false;versions.value=[];versionsError.value='';versionSource.value=undefined;versionsLoading.value=false}
async function openVersions(row:SavedPropertyQuery){
 if(!readable.value||!projectId.value||locked.value)return
 const project=projectId.value,epoch=identityEpoch(),request=++versionSequence
 versionController?.abort();versionController=new AbortController();versionSource.value=row;versionsShown.value=true;versionsLoading.value=true;versionsError.value='';versions.value=[]
 try{const rows=await props.savedTransport.versions(project,row.id,versionController.signal);if(request!==versionSequence||epoch!==identityEpoch()||!versionsShown.value)return;versions.value=rows}
 catch(cause){if(request!==versionSequence||epoch!==identityEpoch()||!versionsShown.value||cause instanceof IdentityChanged)return;versionsError.value=errorMessage(cause)}
 finally{if(request===versionSequence)versionsLoading.value=false}
}
function startDelete(row:SavedPropertyQuery){if(!writable.value||locked.value)return;deleteTarget.value=row;deleteShown.value=true;deleteError.value='';deleteUnknown.value=false}
function closeDelete(){if(deleteBusy.value)return;deleteShown.value=false;deleteTarget.value=undefined;deleteError.value='';deleteUnknown.value=false}
async function confirmDelete(){
 const row=deleteTarget.value,project=projectId.value
 if(!row||!project||deleteBusy.value||!writable.value)return
 deleteBusy.value=true;deleteError.value=''
 try{const intent=await prepareSavedQuery(project,'DELETE',row.name,row.expression,row);await props.savedTransport.write(intent,new AbortController().signal);await props.savedTransport.recover(intent,new AbortController().signal);deleteShown.value=false;deleteTarget.value=undefined;changed()}
 catch(cause){deleteError.value=errorMessage(cause);deleteUnknown.value=true}
 finally{deleteBusy.value=false}
}
watch([()=>projectId.value,()=>session.user?.accountId,()=>readable.value,()=>props.savedTransport],reset,{immediate:true,flush:'sync'})
watch(resource.error,cause=>{if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){dialog.value?.reset();locked.value=false}},{flush:'sync'})
let alive=true
const dispose=onIdentityChange(()=>{dialog.value?.reset();locked.value=false;resource.clear();queueMicrotask(()=>{if(alive&&readable.value&&!resource.loading.value&&!resource.data.value)void resource.reload()})})
onScopeDispose(()=>{alive=false;dispose()})
</script>
<template><section class="tl-page query-directory"><PageHeader title="设备查询" :count="resource.data.value?String(resource.data.value.length):undefined"><el-button v-if="resource.data.value?.length" size="small" :disabled="forbidden||locked" :loading="resource.loading.value" @click="reload">刷新</el-button><el-button size="small" type="primary" :disabled="forbidden||locked" @click="open()">创建查询</el-button></PageHeader>
 <div class="tl-learning-resource"><el-icon aria-hidden="true"><InfoFilled/></el-icon><span>学习资源：<a href="https://www.thingscloud.xyz/docs/guide/device-manage/device-query.html" target="_blank" rel="noopener noreferrer">什么是设备查询？ ↗</a></span></div>
 <AsyncState :forbidden="forbidden" :loading="resource.loading.value" :error="resource.error.value" :empty="false" @retry="reload"><div v-if="resource.data.value?.length===0" class="query-empty"><img src="/reference/empty-content.png" alt=""/><h2>通过设备属性查询设备，支持 SQL</h2><p>可保存多组设备查询，支持灵活易用的 SQL 查询条件，内置丰富的运算类型和工具函数，助力海量设备管理。</p></div><template v-else-if="resource.data.value"><el-table :data="resource.data.value" row-key="id"><el-table-column prop="name" label="查询名称" min-width="190"/><el-table-column label="当前版本" width="100"><template #default="{row}">{{row.currentRevision}}</template></el-table-column><el-table-column prop="expression" label="查询条件" min-width="280" show-overflow-tooltip/><el-table-column label="保存时间" width="175"><template #default="{row}">{{formatTime(row.versionCreatedAt)}}</template></el-table-column><el-table-column label="操作" width="210"><template #default="{row}"><el-button link type="primary" :disabled="locked" @click="open(row.id)">打开查询</el-button><el-button link :disabled="locked" @click="openVersions(row)">版本</el-button><el-button v-if="writable" link type="danger" :disabled="locked" @click="startDelete(row)">删除</el-button></template></el-table-column></el-table></template></AsyncState>
 <el-dialog :model-value="versionsShown" title="查询版本" width="min(760px,95vw)" @update:model-value="!$event&&closeVersions()"><AsyncState :loading="versionsLoading" :error="versionsError"><el-table v-if="versions.length" :data="versions" row-key="revision"><el-table-column prop="revision" label="版本" width="80"/><el-table-column prop="name" label="名称" min-width="140"/><el-table-column prop="expression" label="查询条件" min-width="260" show-overflow-tooltip/><el-table-column label="保存时间" width="170"><template #default="{row}">{{formatTime(row.versionCreatedAt)}}</template></el-table-column></el-table></AsyncState><template #footer><el-button @click="closeVersions">关闭</el-button></template></el-dialog>
 <el-dialog :model-value="deleteShown" title="删除保存查询" width="min(460px,95vw)" :close-on-click-modal="false" @update:model-value="!$event&&closeDelete()"><p>确定删除“{{deleteTarget?.name}}”？版本与原键会保留，普通目录不再显示。</p><el-alert v-if="deleteError" :title="deleteError" type="error" :closable="false"/><template #footer><el-button :disabled="deleteBusy" @click="closeDelete">取消</el-button><el-button type="danger" :loading="deleteBusy" :disabled="deleteBusy" @click="confirmDelete">确认删除</el-button></template></el-dialog>
 <DevicePropertyQueryDialog ref="dialog" :disabled="forbidden" :transport="queryTransport" :saved-transport="savedTransport" @locked="locked=$event" @changed="changed"/></section></template>
<style scoped>.query-empty{padding:44px 20px 0;text-align:center}.query-empty img{width:160px;max-width:100%}.query-empty h2{margin:20px 0 0;font-size:26px;line-height:36px;font-weight:400;color:#002822}.query-empty p{width:500px;max-width:100%;margin:10px auto 0;padding:0 20px;font-size:14px;line-height:22px;color:#909399;box-sizing:border-box}.query-directory :deep(.cell){overflow-wrap:anywhere}</style>
