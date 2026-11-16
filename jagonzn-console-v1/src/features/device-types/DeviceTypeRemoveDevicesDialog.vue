<script setup lang="ts">
import {showOperationFeedback} from '@/ui/operation-feedback'
import {computed,onScopeDispose,ref,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {ElMessage} from 'element-plus'
import {WarningFilled} from '@element-plus/icons-vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {devicesApi} from '../devices/api'
import {assertProfile} from '../devices/reference-profile'
import {readAssociation,prepareDetach,submitDetach,readDetachOperation,type DetachIntent} from '../devices/device-type-association-api'
import {typeDeviceUuid} from './type-devices-api'

const props=defineProps<{open:boolean;deviceTypeId:string;devices:readonly {id:string;name:string}[]}>()
const emit=defineEmits<{'update:open':[value:boolean];changed:[];locked:[value:boolean]}>()
type RemovalRow={id:string;name:string;status:'READY'|'RUNNING'|'DONE'|'FAILED'|'UNKNOWN'|'NOTRUN';detail:string;intent?:DetachIntent;observed?:string|null}
const rows=ref<RemovalRow[]>([]),phase=ref<'confirm'|'result'>('confirm'),busy=ref(false),error=ref('')
const readable=computed(()=>can('device:read')&&!!session.user?.accountId&&!!projectId.value&&!session.transitioning&&typeDeviceUuid.test(props.deviceTypeId))
const writable=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const unknown=computed(()=>rows.value.some(row=>row.status==='UNKNOWN'))
const canFinish=computed(()=>unknown.value&&rows.value.filter(row=>row.status==='UNKNOWN').every(row=>row.observed!==undefined))
const labels={READY:'待移除',RUNNING:'正在移除',DONE:'已移除',FAILED:'未移除',UNKNOWN:'待核对',NOTRUN:'未执行'}
let generation=0,disposed=false,controller:AbortController|undefined
function checkpoint(){const state={generation,project:projectId.value,type:props.deviceTypeId,account:session.user?.accountId,epoch:identityEpoch()};return()=>{if(disposed||state.generation!==generation||state.project!==projectId.value||state.type!==props.deviceTypeId||state.account!==session.user?.accountId||state.epoch!==identityEpoch()||!readable.value)throw new IdentityChanged()}}
function reset(){generation++;controller?.abort();rows.value=[];busy.value=false;phase.value='confirm';error.value='';emit('update:open',false)}
function close(){if(busy.value||unknown.value)return;emit('update:open',false)}
function initialize(){
 if(busy.value||unknown.value)return
 phase.value='confirm';error.value=''
 if(!writable.value||props.devices.length<1||props.devices.length>24||new Set(props.devices.map(row=>row.id)).size!==props.devices.length||props.devices.some(row=>!typeDeviceUuid.test(row.id)||!row.name.trim())){rows.value=[];error.value='请重新选择当前页设备';return}
 rows.value=props.devices.map(row=>({id:row.id,name:row.name,status:'READY',detail:''}))
}
function failureText(cause:unknown){return errorMessage(cause)}
async function confirm(){
 if(!writable.value||busy.value||phase.value!=='confirm'||!rows.value.length||error.value)return
 const check=checkpoint(),project=projectId.value,type=props.deviceTypeId
 controller=new AbortController();const signal=controller.signal;busy.value=true;phase.value='result'
 try{
  for(const row of rows.value){
   check();if(!writable.value){row.status='FAILED';row.detail='当前账号或项目已不允许修改设备类型';break}
   row.status='RUNNING';let sent=false,accepted=false
   try{
    const before=await readAssociation(project,row.id,signal);check()
    if(before.deviceTypeId===null){row.status='DONE';row.detail='当前设备已不属于任何类型';continue}
    if(before.deviceTypeId!==type)throw new Error('设备类型已经变化，请刷新后核对')
    if(!writable.value)throw new Error('当前账号或项目已不允许修改设备类型')
    const intent=prepareDetach(project,row.id,type,before);row.intent=intent;sent=true
    await submitDetach(intent,signal);accepted=true;check()
    const after=await devicesApi.profile(project,row.id,signal);check();assertProfile(after,row.id)
    if(after.deviceTypeId!==null)throw new Error('移除后当前类型未确认，请读取当前设备核对')
    row.status='DONE';row.detail='已从当前设备类型中移除'
   }catch(cause){
    check()
    const uncertain=sent&&(accepted||!(cause instanceof ApiError)||cause.outcomeUnknown||cause.status===0||cause.status>=500)
    row.status=uncertain?'UNKNOWN':'FAILED';row.detail=failureText(cause)
    if(uncertain||cause instanceof ApiError&&[401,403].includes(cause.status))break
   }
  }
  check();for(const row of rows.value)if(row.status==='READY'){row.status='NOTRUN';row.detail='本次操作已停止'}
  if(!unknown.value&&rows.value.some(row=>row.status==='DONE'))emit('changed')
  if(rows.value.every(row=>row.status==='DONE')){busy.value=false;showOperationFeedback('已从设备类型中移除');close()}
 }catch(cause){if(!(cause instanceof IdentityChanged))error.value=errorMessage(cause)}
 finally{try{check();busy.value=false}catch{}}
}
async function review(){
 if(!unknown.value||busy.value||!readable.value)return
 const check=checkpoint(),project=projectId.value;controller=new AbortController();busy.value=true;error.value=''
 try{for(const row of rows.value.filter(row=>row.status==='UNKNOWN')){
   row.observed=undefined
   try{if(!row.intent)throw new Error('缺少原移除请求');await readDetachOperation(row.intent,controller.signal);check();row.status='DONE';row.detail='已通过原操作回执确认移除';continue}
   catch(cause){check();if(!(cause instanceof ApiError)||cause.status!==404)throw cause}
   const current=await devicesApi.profile(project,row.id,controller.signal);check();assertProfile(current,row.id);row.observed=current.deviceTypeId
  }
  if(!unknown.value){emit('changed');showOperationFeedback('已核对移除结果');busy.value=false;close()}}
 catch(cause){try{check();error.value=errorMessage(cause)}catch{}}
 finally{try{check();busy.value=false}catch{}}
}
function finishReview(){if(!readable.value||busy.value||!canFinish.value)return;for(const row of rows.value)if(row.status==='UNKNOWN'){row.status='FAILED';row.detail='已核对当前状态；原请求历史结果仍未确认'}emit('changed');ElMessage.warning('已采用当前类型状态，原移除结果仍未确认');close()}
function guardNavigation(){if(busy.value||unknown.value){ElMessage.warning('请等待移除完成，或先核对移除结果');return false}return true}
onBeforeRouteLeave(guardNavigation);onBeforeRouteUpdate(guardNavigation)
function beforeUnload(event:BeforeUnloadEvent){if(busy.value||unknown.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload)
watch([()=>projectId.value,()=>props.deviceTypeId,()=>session.user?.accountId,readable],reset,{flush:'sync'})
watch(()=>props.open,value=>{if(value)initialize()},{immediate:true})
watch([()=>props.open,busy,unknown],()=>emit('locked',props.open||busy.value||unknown.value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset)
onScopeDispose(()=>{disposed=true;controller?.abort();dispose();window.removeEventListener('beforeunload',beforeUnload);emit('locked',false)})
</script>

<template>
 <el-dialog :model-value="props.open&&readable" :title="phase==='confirm'?'提示':'从类型中移除设备'" width="min(420px,94vw)" align-center class="type-device-removal-dialog" :close-on-click-modal="false" :close-on-press-escape="!busy&&!unknown" :show-close="!busy&&!unknown" :before-close="(done:()=>void)=>{if(!busy&&!unknown){close();done()}}">
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <p v-if="phase==='confirm'" class="type-removal-question"><el-icon><WarningFilled/></el-icon>确认从设备类型中移除吗？</p>
  <template v-else>
   <ul class="type-removal-results"><li v-for="row in rows" :key="row.id"><span>{{row.name}}</span><b>{{labels[row.status]}}</b><small v-if="row.detail">{{row.detail}}</small><small v-if="row.observed!==undefined">当前状态：{{row.observed===null?'未关联设备类型':row.observed===deviceTypeId?'仍关联当前类型':'已关联其他类型'}}。当前状态不证明原请求的历史结果。</small></li></ul>
   <p v-if="unknown" class="type-removal-note">移除结果尚未确认，已停止后续操作。读取原操作与当前状态不会重复提交。</p>
  </template>
  <template #footer>
   <template v-if="unknown"><el-button size="small" :loading="busy" @click="review">核对移除结果</el-button><el-button size="small" type="primary" :disabled="busy||!canFinish" @click="finishReview">采用当前结果并刷新</el-button></template>
   <template v-else><el-button size="small" :disabled="busy" @click="close">{{phase==='confirm'?'取消':'关闭'}}</el-button><el-button v-if="phase==='confirm'" size="small" type="primary" :disabled="!writable||!rows.length||!!error" :loading="busy" @click="confirm">确定</el-button></template>
  </template>
 </el-dialog>
</template>

<style scoped>
.type-removal-question{display:flex;align-items:center;gap:12px;margin:0;font-size:14px;line-height:24px;color:var(--tl-text)}.type-removal-question .el-icon{font-size:22px;color:#e6a23c;flex:none}.type-removal-results{list-style:none;margin:0;padding:0;max-height:280px;overflow:auto}.type-removal-results li{display:flex;flex-wrap:wrap;gap:8px;padding:8px 0;font-size:14px}.type-removal-results li>span{flex:1;overflow-wrap:anywhere}.type-removal-results b{font-size:12px;font-weight:400}.type-removal-results small,.type-removal-note{flex-basis:100%;font-size:12px;line-height:20px;color:var(--tl-muted)}
</style>
<style>
.el-dialog.type-device-removal-dialog .el-dialog__header{padding:15px 16px 10px}.el-dialog.type-device-removal-dialog .el-dialog__body{padding:10px 16px 14px}.el-dialog.type-device-removal-dialog .el-dialog__footer{padding:0 16px 12px}.el-dialog.type-device-removal-dialog .el-dialog__headerbtn{top:14px;right:16px}.el-dialog.type-device-removal-dialog .el-dialog__footer .el-button+.el-button{margin-left:10px}
</style>
