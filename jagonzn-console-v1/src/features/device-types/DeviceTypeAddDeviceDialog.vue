<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {useRouter} from 'vue-router'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import DirectoryGlyph from '../devices/DirectoryGlyph.vue'
import {devicesApi,type Device} from '../devices/api'
import {directoryReferenceKeys} from '../devices/directory-reference-identity'
import {assertProfile,type ValidDeviceProfile} from '../devices/reference-profile'
import {prepareTypeAssignment,submitTypeAssignment,decodeTypeAssignment,type TypeAssignmentIntent} from '../devices/device-type-assignment-api'
import {readTypeDeviceCandidates,typeDeviceUuid} from './type-devices-api'
import {readAssociation,prepareAttach,submitAttach,readAttachOperation,prepareCrossTypeChange,submitCrossTypeChange,readCrossTypeOperation,type AttachIntent,type CrossIntent} from '../devices/device-type-association-api'
import {modelCandidateTransport} from './model-candidate-api'
const props=defineProps<{open:boolean;deviceTypeId:string}>(),emit=defineEmits<{'update:open':[value:boolean];changed:[];locked:[value:boolean]}>()
type Candidate=Device & {businessKey:string|null;currentTypeName?:string|null}
type Addition={kind:'attach';intent:AttachIntent}|{kind:'cross';intent:CrossIntent}|{kind:'assign';intent:TypeAssignmentIntent}
const candidatePageSize=24
const router=useRouter(),candidates=shallowRef<Candidate[]>([]),total=ref(''),page=ref(1),keyword=ref(''),selected=shallowRef<Candidate[]>([]),loading=ref(false),busy=ref(false),error=ref('')
const versionNumbers=ref<Record<string,string>>({})
const selectedIds=computed(()=>selected.value.map(row=>row.id!))
const rebindDevices=computed(()=>selected.value.filter(row=>row.id! in versionNumbers.value))
const pending=shallowRef<Addition>(),unknown=computed(()=>!!pending.value),current=shallowRef<ValidDeviceProfile>()
const allowed=computed(()=>can('device:read')&&can('device:update')&&!!projectId.value&&!session.transitioning&&currentProject.value?.status==='ACTIVE'&&typeDeviceUuid.test(props.deviceTypeId)&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const nextPage=computed(()=>page.value<10000&&total.value!==''&&BigInt(page.value)*BigInt(candidatePageSize)<BigInt(total.value))
let generation=0,sequence=0,disposed=false,controller:AbortController|undefined
let searchTimer:ReturnType<typeof setTimeout>|undefined
function stopReading(){clearTimeout(searchTimer);controller?.abort()}
function reset(){generation++;sequence++;stopReading();candidates.value=[];total.value='';page.value=1;keyword.value='';selected.value=[];versionNumbers.value={};loading.value=false;busy.value=false;error.value='';pending.value=undefined;current.value=undefined;emit('update:open',false)}
function checkpoint(){const g=generation,project=projectId.value,type=props.deviceTypeId,identity=identityEpoch();return()=>{if(disposed||g!==generation||project!==projectId.value||type!==props.deviceTypeId||identity!==identityEpoch()||!allowed.value)throw new IdentityChanged()}}
function load(number=1,debounce=false){
 if(!allowed.value||!props.open||unknown.value||busy.value)return
 const check=checkpoint(),request=++sequence
 stopReading();error.value=''
 if(number===1){candidates.value=[];total.value=''}
 if(keyword.value.length>128){loading.value=false;error.value='搜索内容不能超过 128 个字符';return}
 const project=projectId.value,type=props.deviceTypeId
 const query={page:number,limit:candidatePageSize,keyword:keyword.value},requestController=new AbortController()
 controller=requestController;loading.value=true
 async function read(){
  try{
   const result=await readTypeDeviceCandidates(project,type,query,requestController.signal);check();if(request!==sequence)return
   const keys=directoryReferenceKeys(result.items,result.referenceIdentities)
   const existing=new Set(candidates.value.map(row=>row.id))
   const rows=result.items.filter(row=>(row.deviceTypeId==null||row.deviceTypeId!==props.deviceTypeId)&&!existing.has(row.id)).map(row=>({...row,businessKey:keys[row.id!]??null,currentTypeName:result.display?.[row.id!]?.deviceTypeName??null}))
   candidates.value=[...candidates.value,...rows]
   total.value=result.total!;page.value=number
  }catch(cause){if(request===sequence&&!(cause instanceof IdentityChanged)){error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status))reset()}}
  finally{if(request===sequence)loading.value=false}
 }
 if(debounce)searchTimer=setTimeout(()=>void read(),250)
 else void read()
}
function loadMoreOnScroll(event:Event){
 const list=event.target
 if(loading.value||!nextPage.value||!(list instanceof HTMLElement)||!list.classList.contains('el-select-dropdown__wrap'))return
 if(list.clientHeight>0&&list.scrollTop+list.clientHeight>=list.scrollHeight-24)load(page.value+1)
}
function search(query:string){
 if(!allowed.value||!props.open||unknown.value||busy.value)return
 const value=query.trim()
 if(value===keyword.value)return
 keyword.value=value;load(1,true)
}
function choose(ids:string[]){
 if(!allowed.value||!props.open||busy.value||unknown.value)return
 const available=new Map([...candidates.value,...selected.value].map(row=>[row.id,row]))
 selected.value=[...new Set(ids)].flatMap(id=>{
  const row=available.get(id)
  return row&&(row.deviceTypeId==null||row.deviceTypeId!==props.deviceTypeId)?[row]:[]
 })
 for(const device of Object.keys(versionNumbers.value))if(!selectedIds.value.includes(device))delete versionNumbers.value[device]
 error.value=''
}
function forget(device:string,removeCandidate=false){
 selected.value=selected.value.filter(row=>row.id!==device)
 delete versionNumbers.value[device]
 if(removeCandidate)candidates.value=candidates.value.filter(row=>row.id!==device)
}
function close(){
 if(busy.value)return
 sequence++;stopReading();loading.value=false
 if(!unknown.value){candidates.value=[];total.value='';selected.value=[];versionNumbers.value={}}
 emit('update:open',false)
}
function beforeClose(done:()=>void){if(!busy.value){close();done()}}
async function prepareAddition(device:string,signal:AbortSignal,check:()=>void):Promise<Addition|undefined>{
 const project=projectId.value,type=props.deviceTypeId
 const profile=await devicesApi.profile(project,device,signal);check();assertProfile(profile,device)
 if(profile.deviceTypeId===props.deviceTypeId){forget(device,true);throw new Error('此设备已属于目标类型，请选择其他设备')}
 const association=await readAssociation(project,device,signal);check()
 if(association.deviceTypeId!==profile.deviceTypeId)throw new Error('设备关联已经变化，请重新读取')
 if(profile.deviceTypeId!==null){
  if(association.state!=='ASSOCIATED')throw new Error('设备当前关联状态已变化，请重新读取候选')
  const latest=await modelCandidateTransport.latest(project,type,signal);check()
  return {kind:'cross',intent:prepareCrossTypeChange(project,device,type,latest.version.id,association)}
 }
 if(association.state!=='DETACHED')return {kind:'assign',intent:prepareTypeAssignment(project,device,profile.deviceTypeId,type)}
 if(association.retainedDeviceTypeId!==type){
  const latest=await modelCandidateTransport.latest(project,type,signal);check()
  return {kind:'attach',intent:prepareAttach(project,device,type,latest.version.id,association,true)}
 }
 const version=(versionNumbers.value[device]??='').trim()
 if(!version){versionNumbers.value={...versionNumbers.value,[device]:''};throw new Error('请填写该设备要恢复的物模型版本')}
 if(!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version))throw new Error('请填写完整的已发布物模型版本号')
 const snapshot=await modelCandidateTransport.byNumber(project,type,version,signal);check()
 return {kind:'attach',intent:prepareAttach(project,device,type,snapshot.version.id,association)}
}
async function add(){
 const rows=selected.value
 if(!allowed.value||!props.open||busy.value||loading.value||unknown.value||!rows.length)return
 const check=checkpoint()
 controller?.abort();controller=new AbortController()
 const signal=controller.signal
 busy.value=true;error.value='';current.value=undefined
 let active:Candidate|undefined,sent:Addition|undefined,accepted=false,completed=0
 try{
  const additions:{row:Candidate;addition:Addition}[]=[]
  for(const row of rows){
   active=row
   const addition=await prepareAddition(row.id!,signal,check)
   check()
   if(addition)additions.push({row,addition})
  }
  if(additions.length!==rows.length)return
  for(const {row,addition} of additions){
   check();active=row;sent=addition;accepted=false
   if(addition.kind==='attach'){
    const original=addition.intent
    await submitAttach(original,signal);accepted=true;check()
    const saved=await readAssociation(original.project,original.device,signal);check()
    if(saved.deviceTypeId!==original.body.deviceTypeId||saved.modelVersionId!==original.body.modelVersionId)throw new Error('重新添加后的当前类型或模型未确认，请核对原操作')
   }else if(addition.kind==='cross'){
    const original=addition.intent
    await submitCrossTypeChange(original,signal);accepted=true;check()
    const saved=await readAssociation(original.project,original.device,signal);check()
    if(saved.deviceTypeId!==original.body.deviceTypeId||saved.modelVersionId!==original.body.modelVersionId)throw new Error('跨类型换绑后的当前类型或模型未确认，请核对原操作')
   }else{
    const original=addition.intent
    const result=await submitTypeAssignment(original,signal);accepted=true;check();decodeTypeAssignment(result,original)
    const saved=await devicesApi.profile(original.project,original.device,signal);check();assertProfile(saved,original.device)
    if(saved.deviceTypeId!==original.next)throw new Error('添加后当前类型与目标不同，请读取当前设备核对')
   }
   forget(row.id!,true);completed++
  }
  emit('update:open',false)
 }catch(cause){
  try{check()}catch{return}
  if(cause instanceof IdentityChanged)return
  let message=errorMessage(cause)
  if(sent&&(accepted||!(cause instanceof ApiError)||cause.outcomeUnknown||cause.status===0||cause.status>=500)){
   pending.value=sent
  }else if(sent&&cause instanceof ApiError&&cause.status===409){
   forget(sent.intent.device)
   if(cause.code===30063)message='设备已有物模型版本绑定，不能直接换类型。原类型与模型保持不变。'
  }
  error.value=rows.length>1?`${completed?`已添加 ${completed} 台设备。`:''}${active?.name}：${message}`:message
 }finally{
  try{check();busy.value=false;if(completed)emit('changed')}catch{}
 }
}
function finishReconciliation(device:string){
 forget(device,true)
 current.value=undefined
 pending.value=undefined
 emit('changed')
 if(!selected.value.length)close()
 else{keyword.value='';load()}
}
async function reconcile(){
 const addition=pending.value
 if(!addition||busy.value||!allowed.value)return
 const original=addition.intent,check=checkpoint()
 controller?.abort();controller=new AbortController();busy.value=true;error.value='';current.value=undefined
 try{
  if(addition.kind==='attach'){
   try{await readAttachOperation(addition.intent,controller.signal);check();busy.value=false;finishReconciliation(original.device);return}
   catch(cause){check();if(!(cause instanceof ApiError)||cause.status!==404)throw cause}
  }else if(addition.kind==='cross'){
   try{await readCrossTypeOperation(addition.intent,controller.signal);check();busy.value=false;finishReconciliation(original.device);return}
   catch(cause){check();if(!(cause instanceof ApiError)||cause.status!==404)throw cause}
  }
  const value=await devicesApi.profile(original.project,original.device,controller.signal);check();assertProfile(value,original.device);current.value=value
 }
 catch(cause){try{check();if(!(cause instanceof IdentityChanged))error.value=errorMessage(cause)}catch{}}
 finally{try{check();busy.value=false}catch{}}
}
function useCurrent(){if(current.value?.deviceTypeId===props.deviceTypeId&&!busy.value&&pending.value)finishReconciliation(pending.value.intent.device)}
function create(){if(!allowed.value||busy.value||unknown.value)return;close();void router.push(`/device-types/${props.deviceTypeId}/devices/create`)}
watch([busy,unknown],()=>emit('locked',busy.value||unknown.value),{immediate:true,flush:'sync'})
watch([()=>projectId.value,()=>props.deviceTypeId,()=>session.user?.accountId,()=>session.user?.projectRole,()=>currentProject.value?.myRole,()=>allowed.value],reset,{flush:'sync'})
watch(()=>props.open,value=>{
 if(!value||!allowed.value||unknown.value)return
 selected.value=[];versionNumbers.value={};page.value=1;keyword.value='';load()
},{immediate:true})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{disposed=true;sequence++;stopReading();dispose();emit('locked',false)})
</script>
<template><el-dialog :model-value="open&&allowed" title="添加设备" class="type-add-device-dialog" width="min(500px,94vw)" :close-on-click-modal="false" :show-close="!busy" :before-close="beforeClose">
 <el-alert v-if="error" :title="error" type="error" :closable="false"/>
 <template v-if="unknown"><el-alert title="添加结果尚未确认，保留原意图且不会再次提交。请读取当前设备核对。" type="warning" :closable="false"/><p v-if="current">{{current.deviceTypeId===deviceTypeId?'当前设备已属于目标类型。':'当前设备尚未显示为目标类型，原操作结果仍未确认。'}}</p><el-button :loading="busy" @click="reconcile">读取当前设备</el-button><el-button v-if="current?.deviceTypeId===deviceTypeId" :disabled="busy" @click="useCurrent">采用当前结果并刷新</el-button></template>
 <el-form v-else label-position="top" @submit.prevent>
  <el-form-item label="选择设备" @scroll.capture="loadMoreOnScroll">
   <el-select :model-value="selectedIds" aria-label="选择设备" multiple filterable clearable reserve-keyword
    :filter-method="search" :loading="loading&&!candidates.length" :disabled="busy" placeholder="请选择" :no-data-text="keyword?'暂无匹配设备':'暂无可选设备'"
    :teleported="false" placement="bottom-start" popper-class="type-add-device-options" @update:model-value="choose">
    <template #label="{value,label}">{{selected.find(row=>row.id===value)?.name??label}}</template>
    <el-option v-for="row in candidates" :key="row.id" :value="row.id!" :label="row.name" class="candidate-option">
     <ReferenceIcon glyph="󰆧" class="candidate-device-icon"/>
     <span class="candidate-identity">
      <strong :title="row.name">{{row.name}}</strong>
      <small :title="row.businessKey??undefined">{{row.businessKey}}</small>
      <small v-if="row.deviceTypeId" class="candidate-current-type">当前类型：{{row.currentTypeName||row.deviceTypeId}}</small>
     </span>
     <span class="candidate-state" :class="{'is-online':row.status==='ONLINE'}">
      <DirectoryGlyph kind="connection" class="candidate-state-icon"/>
      <span>{{row.status==='ONLINE'?'在线':'离线'}}</span>
     </span>
    </el-option>
   </el-select>
  </el-form-item>
  <el-form-item v-for="row in rebindDevices" :key="row.id" :label="selected.length===1?'物模型版本':row.name+'的物模型版本'">
   <el-input v-model="versionNumbers[row.id!]" :aria-label="selected.length===1?'重新添加物模型版本':row.name+'的物模型版本'" maxlength="32" placeholder="请输入已发布版本，例如 2.0.0" :disabled="busy"/>
   <p class="rebind-version-note">此设备已解除关联，请明确选择未在旧关联使用过的已发布版本。</p>
  </el-form-item>
 </el-form>
 <template #footer>
  <div class="type-add-device-actions">
   <el-button v-if="!unknown" class="create-new-device" :disabled="busy" @click="create">创建新设备</el-button>
   <el-button :disabled="busy" @click="close">{{unknown?'关闭':'取消'}}</el-button>
   <el-button v-if="!unknown" type="primary" :loading="busy" :disabled="!selected.length||loading" @click="add">添加</el-button>
  </div>
 </template>
</el-dialog></template>
<style scoped>
.el-select{width:100%}
.el-select :deep(.el-select__selection){gap:4px}
.el-select :deep(.el-tag){height:24px;color:#909399}
.type-add-device-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:10px}
.type-add-device-actions .el-button{margin-left:0}
.create-new-device{margin-right:auto}
.candidate-current-type{color:var(--tl-muted);font-size:11px;line-height:1.3;display:block;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rebind-version-note{margin:6px 0 0;font-size:12px;line-height:20px;color:var(--tl-muted)}
</style>
<style>
.type-add-device-dialog .el-dialog__body{padding:36px 20px 52px}
.type-add-device-dialog .el-form-item{margin-bottom:0}
.type-add-device-dialog .el-form-item+.el-form-item{margin-top:20px}
.type-add-device-dialog .el-form-item__label{font-weight:700;margin-bottom:5px}
.type-add-device-dialog .el-alert{margin-bottom:14px}
.type-add-device-options.el-popper{width:min(496px,calc(100vw - 24px))}
.type-add-device-options.el-popper[data-popper-placement^="bottom"]>.el-popper__arrow,
.type-add-device-options.el-popper[data-popper-placement^="top"]>.el-popper__arrow{left:36px!important;transform:none!important}
.type-add-device-options .el-select-dropdown__wrap{max-height:min(250px,40vh)}
.type-add-device-options .el-select-dropdown__list{padding:5px 0}
.type-add-device-options .candidate-option{display:grid;grid-template-columns:26px minmax(0,1fr) 44px;align-items:center;gap:14px;height:48px;padding:0 20px;line-height:18px}
.type-add-device-options .candidate-device-icon{width:26px;height:26px;color:#999;font-size:28px}
.type-add-device-options .candidate-identity{display:grid;grid-template-rows:18px 18px;min-width:0}
.type-add-device-options .candidate-identity strong,.type-add-device-options .candidate-identity small{display:block;overflow:hidden;text-overflow:ellipsis}
.type-add-device-options .candidate-identity strong{font-size:14px;font-weight:700}
.type-add-device-options .candidate-option.is-selected strong{color:var(--el-color-primary)}
.type-add-device-options .candidate-option.is-selected::after{display:none}
.type-add-device-options .candidate-identity small{color:#909399;font-size:12px}
.type-add-device-options .candidate-state{display:inline-flex;align-items:center;justify-content:flex-end;gap:1px;color:#999;font-size:13px;line-height:18px;white-space:nowrap}
.type-add-device-options .candidate-state-icon{display:block;flex:none;width:14px;height:14px}
.type-add-device-options .candidate-state.is-online{color:#67c23a}
</style>
