<script setup lang="ts">
import {showOperationFeedback} from '@/ui/operation-feedback'
import {computed,onMounted,onBeforeUnmount,watch} from 'vue'
import {onBeforeRouteLeave} from 'vue-router'
import {ElMessage} from 'element-plus'
import {ArrowDown,Remove,Delete,VideoPlay,VideoPause} from '@element-plus/icons-vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import DirectoryGlyph from './DirectoryGlyph.vue'
import {useDeviceBatchActions} from './use-device-batch-actions'
import type {BatchAction,BatchStatus} from './device-batch-api'

const props=withDefaults(defineProps<{deviceIds:string[];selectedGroupId?:string;disabled?:boolean;groupManagementAvailable?:boolean;userManagementAvailable?:boolean;nested?:boolean}>(),{disabled:false,groupManagementAvailable:false,userManagementAvailable:false,nested:false})
const emit=defineEmits<{changed:[];cleared:[];locked:[value:boolean];'manage-groups':[];'manage-users':[]}>()
const state=useDeviceBatchActions({deviceIds:()=>props.deviceIds,selectedGroupId:()=>props.selectedGroupId,disabled:()=>props.disabled,changed:()=>emit('changed'),cleared:()=>emit('cleared'),locked:value=>emit('locked',value)})
const{shown,phase,rows,metadata,loading,preparing,writing,checking,error,denied,staleSelection,group,user,choices,groups,optionLoading,optionError,more,selection,readable,counts,unknown,locked,busy}=state
// 普通草稿可离开；已发送或待核对的批次必须保留原件，直至结束或原作用域失效。
const navigationBlocked=computed(()=>writing.value||checking.value||unknown.value)
onBeforeRouteLeave(()=>{
 if(!navigationBlocked.value)return true
 ElMessage.warning('请等待批量操作完成，或核对并结束本次操作后再离开页面')
 return false
})
function beforeUnload(event:BeforeUnloadEvent){if(navigationBlocked.value){event.preventDefault();event.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',beforeUnload))
onBeforeUnmount(()=>window.removeEventListener('beforeunload',beforeUnload))
watch(state.notice,value=>{if(value)showOperationFeedback(value)},{flush:'sync'})
const names:Record<BatchAction,string>={'add-group':'添加到设备组','remove-group':'从当前分组移除',associate:'关联到用户',remove:'批量移除设备',enable:'批量启用设备',disable:'批量停用设备'}
const labels:Record<BatchStatus,string>={READY:'待确认',NOOP:'无需修改',RUNNING:'正在提交',SUCCESS:'已完成',FAILED:'失败',UNKNOWN:'待核对',NOTRUN:'未执行'}
const title=computed(()=>unknown.value?'核对批量操作':state.action.value?names[state.action.value]:'批量操作')
const targetLabel=computed(()=>state.action.value==='associate'?choices.value.find(c=>c.appUserId===user.value)?.username:rows.value[0]?.targetName)
const ready=computed(()=>!props.disabled&&!busy.value&&!locked.value&&metadata.value.length===selection.value.length&&selection.value.length>0)
const disabledAction=(kind:BatchAction)=>!ready.value||!state.allowed(kind)
const canPrepare=computed(()=>!props.disabled&&!busy.value&&!optionLoading.value&&!optionError.value&&!denied.value&&!staleSelection.value&&!!state.action.value&&state.allowed(state.action.value))
function command(value:string|number|object){if(typeof value==='string'&&Object.hasOwn(names,value))state.start(value as BatchAction)}
function searchUsers(value:string){void state.loadUsers(value,false)}
function manage(kind:'groups'|'users'){
 if(busy.value||unknown.value||!state.action.value||!state.allowed(state.action.value)||!(kind==='groups'?props.groupManagementAvailable:props.userManagementAvailable))return
 state.close();if(kind==='groups')emit('manage-groups');else emit('manage-users')
}
function close(done:()=>void){if(writing.value||preparing.value||checking.value)return;state.close();done()}
</script>
<template>
 <div v-if="deviceIds.length||unknown" class="device-batch-actions" aria-label="设备选择操作">
  <el-dropdown v-if="readable&&!unknown" trigger="click" :teleported="!nested" :disabled="!ready" @command="command">
   <el-button size="small" :loading="loading" :disabled="!ready">批量操作<el-icon class="batch-arrow"><ArrowDown/></el-icon></el-button>
   <template #dropdown><el-dropdown-menu>
    <el-dropdown-item command="add-group" :disabled="disabledAction('add-group')"><svg class="batch-menu-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="4.5" y="2.5" width="9" height="9" rx="1"/><path d="M2.5 5v8.5h8.5M9 4.5v5M6.5 7h5"/></svg>添加到设备组</el-dropdown-item>
    <el-dropdown-item v-if="selectedGroupId" command="remove-group" :disabled="disabledAction('remove-group')"><el-icon><Remove/></el-icon>从当前分组移除</el-dropdown-item>
    <el-dropdown-item command="associate" :disabled="disabledAction('associate')"><svg class="batch-menu-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="9" cy="5" r="2.2"/><path d="M5 12.5c.3-2 1.7-3 4-3s3.7 1 4 3H5ZM3 5v4M1 7h4"/></svg>关联到用户</el-dropdown-item>
    <el-dropdown-item command="remove" divided :disabled="disabledAction('remove')"><el-icon><Delete/></el-icon>移除设备</el-dropdown-item>
    <el-dropdown-item command="enable" :disabled="disabledAction('enable')||!counts.enable"><el-icon class="batch-enable"><VideoPlay/></el-icon>启用设备 ({{counts.enable}})</el-dropdown-item>
    <el-dropdown-item command="disable" :disabled="disabledAction('disable')||!counts.disable"><el-icon class="batch-disable"><VideoPause/></el-icon>停用设备 ({{counts.disable}})</el-dropdown-item>
   </el-dropdown-menu></template>
  </el-dropdown>
  <el-button v-if="!unknown" type="danger" plain size="small" :disabled="locked||busy||disabled" @click="state.clear"><ReferenceIcon glyph="󰅚"/>取消选择</el-button>
  <el-button v-else size="small" :disabled="writing||checking" @click="state.reopen">核对上次操作</el-button>
  <template v-if="error&&!shown"><span class="batch-error" role="alert">{{error}}</span><el-button v-if="!denied&&!unknown" link :disabled="busy" @click="state.reload">重新读取</el-button></template>
 </div>
 <el-dialog :append-to-body="nested" :model-value="shown" :title="title" width="50%" class="device-batch-dialog" :class="{'is-removal':state.action.value==='remove'&&phase==='confirm'}" :close-on-click-modal="false" :close-on-press-escape="!writing&&!preparing&&!checking" :before-close="close" destroy-on-close>
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <el-alert v-if="staleSelection" title="选择已变化，本次操作不会继续发送。请结束核对后重新选择。" type="warning" :closable="false"/>
  <template v-if="phase==='choose'">
   <el-form v-if="state.action.value==='add-group'||state.action.value==='associate'" label-position="top" @submit.prevent="state.submit.value">
    <el-form-item v-if="state.action.value==='add-group'" label="选择设备组"><el-select v-model="group" filterable placeholder="请选择" aria-label="选择设备组" :loading="optionLoading" :disabled="preparing"><el-option v-for="g in groups" :key="g.id" :value="g.id" :label="g.name"/></el-select></el-form-item>
    <el-form-item v-else label="选择用户"><el-select v-model="user" filterable remote :remote-method="searchUsers" placeholder="请选择" aria-label="选择用户" :loading="optionLoading" :disabled="preparing"><el-option v-for="u in choices" :key="u.appUserId" :value="u.appUserId" :label="u.displayName?`${u.displayName} (${u.username})`:u.username"/></el-select></el-form-item>
   </el-form>
   <el-alert v-if="optionError" :title="optionError" type="error" :closable="false"/>
   <el-button v-if="more" link :loading="optionLoading" @click="state.loadMore">加载更多</el-button>
   <el-button v-if="optionError&&state.action.value==='add-group'" link :disabled="optionLoading" @click="state.loadGroups(false)">重新读取设备组</el-button>
  </template>
  <template v-else>
   <p v-if="targetLabel" class="batch-target">{{state.action.value==='associate'?'关联用户':'设备组'}}：{{targetLabel}}</p>
   <p v-if="phase==='confirm'" class="batch-subtitle">{{state.action.value==='remove'?'移除以下设备':'以下设备'}}</p>
   <ul class="batch-device-list" :class="{'batch-remove-list':state.action.value==='remove'&&phase==='confirm'}"><li v-for="row in rows" :key="row.id"><el-icon v-if="state.action.value==='remove'&&phase==='confirm'" class="batch-device-icon"><DirectoryGlyph kind="device"/></el-icon><span>{{row.name}}</span><span v-if="state.action.value!=='remove'||phase!=='confirm'||row.status!=='READY'" :class="['batch-status',{'batch-error':row.status==='UNKNOWN'||row.status==='FAILED'}]">{{labels[row.status]}}</span><small v-if="row.status!=='READY'">{{row.detail}}</small><small v-if="row.observation">{{row.observation}}</small></li></ul>
   <div v-if="phase==='confirm'" class="batch-tips"><b>温馨提示：</b><ul v-if="state.action.value==='remove'" class="batch-remove-tips"><li>设备移除后无法恢复，请您确认无误后提交移除。</li><li>若设备在最近 24 小时内有上报数据，无法移除。</li><li>若设备是网关类型设备，且存在子设备，无法移除。</li></ul><p v-else-if="state.action.value==='disable'">停用后设备将无法连接到平台、上报数据或接收下发消息；设备可重新启用。</p><p v-else-if="state.action.value==='enable'">启用后设备可按当前接入配置连接到平台。</p><p v-else-if="state.action.value==='remove-group'">只移除所选设备在当前静态组中的归属。</p><p v-else-if="state.action.value==='associate'">将所选设备关联到当前用户；已关联的设备不重复提交。</p><p v-if="state.action.value!=='remove'||rows.length>1">逐台执行，遇到无法确认的结果立即停止，已完成的操作不会回滚。</p></div>
   <template v-if="unknown"><p class="batch-muted">读取当前状态不会重新提交，也不代表原请求的历史结果。</p><el-button size="small" :loading="checking" :disabled="writing" @click="state.verify">读取当前状态</el-button></template>
  </template>
  <template #footer>
   <el-button v-if="phase==='choose'&&state.action.value==='add-group'" class="batch-manage" :disabled="busy||!groupManagementAvailable" @click="manage('groups')">管理设备组</el-button>
   <el-button v-if="phase==='choose'&&state.action.value==='associate'" class="batch-manage" :disabled="busy||!userManagementAvailable" @click="manage('users')">管理用户</el-button>
   <el-button :disabled="writing||preparing||checking" @click="state.close">{{phase==='result'?'关闭':'取消'}}</el-button>
   <el-button v-if="phase==='choose'&&(state.action.value==='add-group'||state.action.value==='associate')" type="primary" :loading="preparing||writing" :disabled="!canPrepare" @click="state.submit.value">提交</el-button>
   <el-button v-else-if="phase==='confirm'" :type="state.action.value==='remove'||state.action.value==='disable'?'danger':'primary'" :disabled="!canPrepare||!rows.some(r=>r.status==='READY')" :loading="writing" @click="state.confirm.value">{{state.action.value==='remove'?'移除':'确定'}}</el-button>
   <el-button v-else type="primary" :disabled="!state.canFinish.value" @click="state.finish">{{unknown?'已核对，结束本次操作':'完成'}}</el-button>
  </template>
 </el-dialog>
</template>
<style scoped>
.batch-menu-icon{width:14px;height:14px;margin-right:5px;fill:none;stroke:currentColor;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round;flex:none;}
.device-batch-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.device-batch-actions :deep(.el-button){height:33px;font-size:13px}.device-batch-actions :deep(.el-button+.el-button){margin-left:0}.device-batch-count{font-size:13px;color:#606266}.batch-arrow{margin-left:8px}.batch-enable{color:var(--el-color-success)}.batch-disable{color:var(--el-color-warning)}.batch-error{color:var(--el-color-danger);font-size:13px}.batch-muted{color:#909399;font-size:13px;line-height:1.6}.batch-target{overflow-wrap:anywhere;margin:0 0 16px}.batch-subtitle{font-size:14px;font-weight:700;margin:0 0 10px}.batch-device-list{list-style:none;padding:0;margin:0;max-height:240px;overflow:auto}.batch-device-list li{display:flex;flex-wrap:wrap;gap:8px;padding:6px 0;overflow-wrap:anywhere}.batch-device-list li>span:first-child{flex:1;min-width:180px}.batch-remove-list li{justify-content:flex-start;gap:8px;padding:2px 0;color:#606266;font-size:14px}.batch-remove-list li>span:first-of-type{flex:initial;min-width:0}.batch-device-icon{color:#999;font-size:18px}.batch-remove-tips{margin:2px 0 0;padding-left:17px;color:#606266}.batch-remove-tips li{padding:0;line-height:20px}.batch-device-list small{flex-basis:100%;font-size:12px;color:#909399}.batch-status{font-size:12px;color:#606266}.batch-tips{margin-top:20px;font-size:13px;color:#606266;line-height:1.6}.batch-tips b{color:var(--el-color-danger)}.batch-tips p{margin:4px 0}
</style>
<style>
.el-dialog.device-batch-dialog{max-width:calc(100vw - 32px);padding:0}.device-batch-dialog .el-dialog__header{padding:20px 20px 10px;margin-right:0}.device-batch-dialog .el-dialog__body{padding:30px 20px;max-height:calc(85dvh - 125px);overflow:auto}.device-batch-dialog .el-dialog__footer{padding:10px 20px 20px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.device-batch-dialog .el-dialog__footer .el-button+.el-button{margin-left:0}.device-batch-dialog.is-removal .el-dialog__footer .el-button{height:40px;padding:0 20px}.device-batch-dialog .batch-manage{margin-right:auto}.device-batch-dialog .el-select{width:100%}.device-batch-dialog .el-form-item__label{height:32px;line-height:32px;padding:0;font-weight:700;color:#606266}.device-batch-dialog .el-alert{margin-bottom:12px}
</style>
