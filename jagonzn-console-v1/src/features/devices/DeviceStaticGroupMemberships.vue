<script setup lang="ts">
import {showOperationFeedback} from '@/ui/operation-feedback'
import {ref,shallowRef,computed,watch,onScopeDispose} from 'vue'
import {can,projectId,currentProject,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,onIdentityChange} from '@/core/http'
import {useDeviceGuard,isDeviceScopeCurrent} from './use-device-guard'
import {readStaticGroups,readStaticGroup,prepareStaticGroup,changeStaticGroup,decodeStaticGroups,decodeStaticGroup,type StaticGroupMembership,type StaticGroupIntent} from './static-group-membership-api'
const props=defineProps<{deviceId:string}>(),emit=defineEmits<{changed:[]}>()
const members=shallowRef<StaticGroupMembership[]>([]),loading=ref(false),listError=ref(''),denied=ref(false)
const open=ref(false),options=shallowRef<StaticGroupMembership[]>([]),selected=ref(''),more=ref<string>(),optionLoading=ref(false),optionError=ref('')
const busy=ref(false),error=ref(''),unknown=ref(false),intent=shallowRef<StaticGroupIntent>(),current=shallowRef<StaticGroupMembership>()
const readable=computed(()=>can('device:read')&&!denied.value),writable=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE')
const capture=useDeviceGuard(()=>props.deviceId)
let generation=0,listSequence=0,optionSequence=0,uiSequence=0,disposed=false
let listController:AbortController|undefined,optionController:AbortController|undefined,writeController:AbortController|undefined
const scope=()=>({project:projectId.value,device:props.deviceId})
function reset(){generation++;listSequence++;optionSequence++;uiSequence++;listController?.abort();optionController?.abort();writeController?.abort();members.value=[];options.value=[];selected.value='';more.value=undefined;loading.value=false;optionLoading.value=false;busy.value=false;unknown.value=false;intent.value=undefined;current.value=undefined;open.value=false;error.value='';listError.value='';optionError.value='';denied.value=false}
function unavailable(cause:unknown){reset();denied.value=true;listError.value=errorMessage(cause)}
function still(check:()=>void,g:number){return !disposed&&g===generation&&isDeviceScopeCurrent(check)}
async function loadMembers(){
 if(!readable.value||!projectId.value||!props.deviceId||disposed)return false
 const g=generation,seq=++listSequence,check=capture(),selectedScope=scope();listController?.abort();listController=new AbortController()
 const signal=AbortSignal.any([listController.signal,AbortSignal.timeout(15000)]);members.value=[];loading.value=true;listError.value=''
 try{
  const result:StaticGroupMembership[]=[];let after:string|undefined
  for(let page=0;page<20;page++){
   const decoded=decodeStaticGroups(await readStaticGroups(selectedScope,true,after,signal),selectedScope,true,after)
   if(!still(check,g)||seq!==listSequence||!readable.value)return false
   result.push(...decoded.items)
   if(!decoded.hasMore){members.value=result;return true}
   after=decoded.nextAfterGroupId||undefined
  }
  throw new Error('当前归属超过本次完整读取范围，请稍后核对')
 }catch(cause){if(still(check,g)&&seq===listSequence&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403,404].includes(cause.status))unavailable(cause);else listError.value=signal.aborted?'设备分组读取超时，请重新读取':errorMessage(cause)}return false}
 finally{if(g===generation&&seq===listSequence)loading.value=false}
}
async function loadOptions(append=false){
 if(!writable.value||!open.value||unknown.value||optionLoading.value||options.value.length>=1000)return
 const g=generation,seq=++optionSequence,check=capture(),selectedScope=scope(),after=append?more.value:undefined
 optionController?.abort();optionController=new AbortController();optionLoading.value=true;optionError.value=''
 if(!append){options.value=[];more.value=undefined}
 try{
  const page=decodeStaticGroups(await readStaticGroups(selectedScope,false,after,optionController.signal),selectedScope,false,after)
  if(!still(check,g)||seq!==optionSequence||!open.value||!writable.value)return
  options.value=[...options.value,...page.items];more.value=page.hasMore?page.nextAfterGroupId||undefined:undefined
  if(more.value&&options.value.length>=1000)optionError.value='本次可选范围已达上限，尚有未读取设备组'
 }catch(cause){if(still(check,g)&&seq===optionSequence&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403,404].includes(cause.status))unavailable(cause);else optionError.value=errorMessage(cause)}}
 finally{if(g===generation&&seq===optionSequence)optionLoading.value=false}
}
function close(){uiSequence++;open.value=false;optionSequence++;optionController?.abort();optionLoading.value=false;options.value=[];more.value=undefined;selected.value='';optionError.value='';error.value='';current.value=undefined;if(!unknown.value&&!busy.value)intent.value=undefined}
async function start(){if(!writable.value||busy.value||loading.value)return;close();open.value=true;if(unknown.value&&intent.value)await refreshCurrent();else await loadOptions()}
async function refreshCurrent(){
 const original=intent.value;if(!original||!readable.value||busy.value)return
 const g=generation,u=uiSequence,check=capture();writeController?.abort();writeController=new AbortController();busy.value=true;error.value='';current.value=undefined
 try{const value=decodeStaticGroup(await readStaticGroup(original,original.group,writeController.signal),original,original.group);if(still(check,g)&&u===uiSequence&&readable.value)current.value=value}
 catch(cause){if(still(check,g)&&u===uiSequence&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status))unavailable(cause);else error.value=cause instanceof ApiError&&cause.status===404?'暂未读到该组当前归属，请继续核对；不会重新提交。':errorMessage(cause)}}
 finally{if(g===generation)busy.value=false}
}
async function returnToList(){if(!current.value||busy.value)return;const g=generation;if(await loadMembers()&&g===generation){unknown.value=false;intent.value=undefined;current.value=undefined;close()}}
async function change(group:string,member:boolean){
 if(!writable.value||busy.value||unknown.value)return
 const chosen=prepareStaticGroup(scope(),group,member),g=generation,u=uiSequence,check=capture();writeController=new AbortController();intent.value=chosen;unknown.value=true;busy.value=true;current.value=undefined;error.value='';let accepted=false
 try{
  const written=decodeStaticGroup(await changeStaticGroup(chosen,writeController.signal),chosen,chosen.group);accepted=true
  if(!still(check,g)||u!==uiSequence||!writable.value)return
  if(written.member!==chosen.member)throw new Error('分组保存回执与选择不符，请核对当前归属')
  const actual=decodeStaticGroup(await readStaticGroup(chosen,chosen.group,writeController.signal),chosen,chosen.group)
  if(!still(check,g)||u!==uiSequence||!writable.value)return
  if(actual.member!==chosen.member)throw new Error('当前归属已发生变化，请重新核对')
  unknown.value=false;intent.value=undefined;close();await loadMembers()
  if(still(check,g)){emit('changed');showOperationFeedback(chosen.member?'加入成功':'移除成功')}
 }catch(cause){if(still(check,g)&&u===uiSequence&&!(cause instanceof IdentityChanged)){
  if(cause instanceof ApiError&&[401,403].includes(cause.status)){unavailable(cause);return}
  const rejected=!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,404,409,413,422,429].includes(cause.status)
  if(rejected){unknown.value=false;intent.value=undefined;selected.value='';if(!open.value)listError.value=errorMessage(cause)}else{unknown.value=true;open.value=true}
  error.value=errorMessage(cause)
 }}finally{if(g===generation)busy.value=false}
}
function join(){const group=options.value.find(row=>row.groupId===selected.value&&!row.member);if(!group){error.value='请选择尚未加入的有效设备组';return}void change(group.groupId,true)}
function scopeChanged(){reset();if(readable.value)void loadMembers()}
const dispose=onIdentityChange(scopeChanged)
watch(()=>[projectId.value,props.deviceId,session.user?.accountId,can('device:read'),can('device:update'),currentProject.value?.status],scopeChanged,{immediate:true,flush:'sync'})
onScopeDispose(()=>{disposed=true;reset();dispose()})
</script>
<template>
<el-alert v-if="listError" :title="listError" type="error" :closable="false"/>
<el-button v-if="listError&&!denied" link type="primary" :loading="loading" @click="loadMembers">重新读取分组</el-button>
<template v-if="readable"><el-table v-if="members.length" :data="members" class="device-static-group-memberships" v-loading="loading"><el-table-column prop="name" label="分组名称" min-width="180"/><el-table-column v-if="writable" label="" width="100" align="center"><template #default="{row}"><el-button size="small" :disabled="busy||unknown" @click="change(row.groupId,false)">删除</el-button></template></el-table-column></el-table><el-button v-if="writable" size="small" class="device-static-group-memberships__join" :disabled="busy||loading" @click="start">加入设备组</el-button></template>
<el-dialog :model-value="open" :title="unknown?'核对设备分组':'加入设备组'" width="600px" class="device-static-group-membership-dialog" :close-on-click-modal="false" destroy-on-close @close="close">
<template v-if="unknown"><el-alert title="保存结果尚未确认，只核对原设备组当前归属，不会重新提交。" type="warning" :closable="false"/><p v-if="current">{{current.name}}：{{current.member?'已加入':'未加入'}}</p></template>
<template v-else><el-form label-position="top"><el-form-item label="设备组"><el-select v-model="selected" aria-label="设备组" placeholder="请选择" filterable :disabled="busy" :loading="optionLoading"><el-option v-for="row in options" :key="row.groupId" :value="row.groupId" :label="row.name" :disabled="row.member"/></el-select><el-button v-if="more" text :loading="optionLoading" :disabled="options.length>=1000||busy" @click="loadOptions(true)">加载更多设备组</el-button></el-form-item></el-form><el-alert v-if="optionError" :title="optionError" type="error" :closable="false"/><el-button v-if="optionError&&options.length<1000" link type="primary" @click="loadOptions(!!more)">重新读取候选</el-button></template>
<el-alert v-if="error" :title="error" type="error" :closable="false"/>
<template #footer><el-button @click="close">{{unknown?'关闭':'取消'}}</el-button><template v-if="unknown"><el-button :loading="busy" @click="refreshCurrent">核对当前归属</el-button><el-button v-if="current" type="primary" :disabled="busy" @click="returnToList">返回分组列表</el-button></template><el-button v-else type="primary" :loading="busy" :disabled="!writable||!selected||optionLoading" @click="join">确 定</el-button></template>
</el-dialog>
</template>
<style scoped>.device-static-group-memberships__join{margin-top:10px}.device-static-group-memberships :deep(.cell){overflow-wrap:anywhere}</style>
<style>.device-static-group-membership-dialog{max-width:calc(100vw - 32px)}.device-static-group-membership-dialog .el-dialog__body{padding:30px 20px;max-height:calc(85dvh - 125px);overflow:auto}.device-static-group-membership-dialog .el-select{width:100%;max-width:360px}.device-static-group-membership-dialog .el-form-item__label{height:32px;line-height:32px;padding:0;font-weight:700;color:#606266}.device-static-group-membership-dialog .el-alert{margin-bottom:12px}.device-static-group-membership-dialog .el-dialog__footer{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.device-static-group-membership-dialog .el-dialog__footer .el-button+.el-button{margin-left:0}</style>
