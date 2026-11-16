<script setup lang="ts">
import {showOperationFeedback} from '@/ui/operation-feedback'
import {ref,computed,watch,onMounted,onScopeDispose,nextTick} from 'vue'
import {ElMessageBox,type TableInstance} from 'element-plus'
import {Plus,ArrowRight} from '@element-plus/icons-vue'
import {projectId} from '@/core/session'
import {onIdentityChange} from '@/core/http'
import {formatTime} from '@/core/time'
import DeviceLearningResource from './DeviceLearningResource.vue'
import {useDeviceUserAssociations} from './use-device-user-associations'
import {useDeviceGuard,isDeviceScopeCurrent} from './use-device-guard'
import type {DeviceUserAssociation} from './user-associations-api'

const props=defineProps<{deviceId:string}>()
const emit=defineEmits<{'create-user':[];'open-user':[appUserId:string];'open-users':[];'manage-apps':[];busy:[value:boolean]}>()
const state=useDeviceUserAssociations(()=>props.deviceId)
const{rows,selected,loading,error,denied,nextCursor,dialog,choices,chosen,candidateLoading,candidateError,candidateNext,writeBusy,writeError,unknown,notice,selectingAll,canRead,canManage,canAdd}=state
const blocked=computed(()=>writeBusy.value||unknown.value)
watch(blocked,value=>emit('busy',value),{immediate:true,flush:'sync'})
onScopeDispose(()=>emit('busy',false))
const table=ref<TableInstance>(),sentinel=ref<HTMLElement>(),capture=useDeviceGuard(()=>props.deviceId)
let observer:IntersectionObserver|undefined,alive=true,confirming=false
function maybeContinue(){if(alive&&nextCursor.value&&!loading.value&&!writeBusy.value&&!selectingAll.value&&!dialog.value&&sentinel.value){const box=sentinel.value.getBoundingClientRect();if(box.top<=window.innerHeight&&box.bottom>=0)void state.load(false)}}
onMounted(()=>{if(typeof IntersectionObserver!=='undefined'){observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))maybeContinue()});if(sentinel.value)observer.observe(sentinel.value)}window.addEventListener('scroll',maybeContinue,true)})
watch([nextCursor,loading,dialog,writeBusy,selectingAll],async()=>{await nextTick();maybeContinue()})
watch(notice,value=>{if(value)showOperationFeedback(value)})
function stopConfirm(){if(confirming){confirming=false;ElMessageBox.close()}}
watch(()=>[projectId.value,props.deviceId,canManage.value],stopConfirm)
const stopIdentity=onIdentityChange(stopConfirm)
onScopeDispose(()=>{alive=false;observer?.disconnect();window.removeEventListener('scroll',maybeContinue,true);stopConfirm();stopIdentity()})
function closeAdd(done:()=>void){state.cancelDialog();done()}
function createUser(){if(!canAdd.value||writeBusy.value||unknown.value)return;state.cancelDialog();emit('create-user')}
function searchCandidates(query:string){void state.loadCandidates(query,true)}
async function selectAll(values:DeviceUserAssociation[]){
 if(!values.length||!nextCursor.value)return
 const check=capture(),all=await state.collectAllSelection()
 if(!isDeviceScopeCurrent(check))return
 if(!all)table.value?.clearSelection()
 else for(const row of all)table.value?.toggleRowSelection(row,true)
}
async function remove(){
 if(!canManage.value||writeBusy.value||unknown.value||!selected.value.length)return
 const targets=selected.value.map(row=>row.bindingId),check=capture();confirming=true
 try{await ElMessageBox.confirm('确认移除关联用户吗？','提示',{type:'warning',confirmButtonText:'确定',cancelButtonText:'取消'});if(isDeviceScopeCurrent(check))await state.remove(targets)}catch{}finally{confirming=false}
}
</script>
<template>
 <section class="device-user-associations" aria-label="设备关联用户">
  <DeviceLearningResource kind="user"/>
  <div class="source-user-toolbar"><div class="source-user-actions"><el-button v-if="canAdd" size="small" :icon="Plus" :disabled="writeBusy||unknown||selectingAll" @click="state.openAdd">添加关联用户</el-button><el-button v-if="selected.length" size="small" type="danger" :loading="writeBusy&&!dialog" :disabled="!canManage||unknown||selectingAll" @click="remove">移除关联用户</el-button></div><div class="source-user-actions source-user-links"><el-button size="small" @click="emit('open-users')">所有用户<el-icon class="user-link-arrow"><ArrowRight/></el-icon></el-button><el-button size="small" @click="emit('manage-apps')">管理应用<el-icon class="user-link-arrow"><ArrowRight/></el-icon></el-button></div></div>
  <el-alert v-if="writeError&&!dialog" :title="writeError" type="error" :closable="false"/>
  <el-button v-if="unknown&&!dialog" link :disabled="writeBusy" @click="state.verifyUnknown">重新核对</el-button>
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <el-button v-if="error&&!denied" link @click="state.load(true)">重试</el-button>
  <el-alert v-if="!canRead" title="当前角色无权查看关联用户" type="warning" :closable="false"/>
  <el-table v-if="canRead" class="tl-device-detail-table" ref="table" v-loading="loading||selectingAll" :data="rows" row-key="bindingId" empty-text="无关联用户" style="width:100%;margin-top:10px" @selection-change="state.setSelection" @select-all="selectAll">
   <el-table-column type="selection" width="48" align="center" :selectable="()=>!writeBusy&&!selectingAll"/>
   <el-table-column label="用户名称"><template #default="{row}"><el-link type="primary" @click="emit('open-user',row.appUserId)">{{row.displayName}}</el-link></template></el-table-column>
   <el-table-column prop="username" label="登录名"/>
   <el-table-column label="最后访问时间" width="180"><template #default="{row}">{{row.lastVisitedAt?formatTime(row.lastVisitedAt):'-'}}</template></el-table-column>
  </el-table>
  <div ref="sentinel" aria-hidden="true" class="user-list-sentinel"/>
  <el-dialog :model-value="dialog" title="添加关联用户" width="min(500px,94vw)" :close-on-click-modal="false" :before-close="closeAdd" destroy-on-close class="source-user-add-dialog">
   <el-alert title="您可以将设备关联到多个用户，也可让用户主动添加设备。" type="info" :closable="false" show-icon/>
   <el-alert v-if="writeError" :title="writeError" type="error" :closable="false"/>
   <el-button v-if="unknown" link :disabled="writeBusy" @click="state.verifyUnknown">重新核对</el-button>
   <el-form label-position="top" class="source-user-form" @submit.prevent="state.add"><el-form-item label="选择用户"><el-select v-model="chosen" multiple filterable remote reserve-keyword :remote-method="searchCandidates" :loading="candidateLoading" :disabled="writeBusy||unknown" placeholder="请选择用户" aria-label="选择用户" style="width:100%" @popup-scroll="()=>candidateNext&&state.loadCandidates(undefined,false)"><el-option v-for="choice in choices" :key="choice.appUserId" :value="choice.appUserId" :label="choice.displayName?`${choice.displayName} (${choice.username})`:choice.username"/></el-select><span v-if="candidateError" class="user-candidate-error">{{candidateError}}</span></el-form-item></el-form>
   <template #footer><div class="source-user-add-footer"><el-button class="user-create-link" :disabled="writeBusy||unknown||!canAdd" @click="createUser">创建新用户</el-button><el-button @click="state.cancelDialog">取消</el-button><el-button type="primary" :loading="writeBusy" :disabled="!canAdd||unknown" @click="state.add">添加</el-button></div></template>
  </el-dialog>
 </section>
</template>
<style scoped>
.source-user-toolbar{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:10px;}.source-user-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}.source-user-actions :deep(.el-button+.el-button){margin-left:0;}.source-user-toolbar :deep(.el-button){height:32px;padding:9px 15px;font-size:12px;line-height:1;border-radius:3px;}.source-user-links{margin-left:auto;}.user-link-arrow{margin-left:5px;}.user-list-sentinel{height:1px;}.user-candidate-error{font-size:12px;color:var(--el-color-danger);}.source-user-add-footer{display:flex;align-items:center;justify-content:flex-end;}.user-create-link{margin-right:auto;}
</style>
<style>
.source-user-add-dialog .el-dialog__header{padding:20px 20px 10px;}.source-user-add-dialog .el-dialog__body{padding:30px 20px;max-height:calc(85dvh - 124px);overflow-y:auto;}.source-user-add-dialog .el-dialog__footer{padding:10px 20px 20px;}.source-user-add-dialog .source-user-form{margin-top:20px;}.source-user-add-dialog .el-form-item{margin-bottom:22px;}.source-user-add-dialog .el-form-item__label{height:32px;line-height:32px;padding:0;margin:0;color:#606266;font-weight:700;}
</style>
