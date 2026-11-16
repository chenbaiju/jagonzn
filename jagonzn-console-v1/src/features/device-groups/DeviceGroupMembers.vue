<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {RouterLink,useRouter} from 'vue-router'
import {ArrowRight,Refresh,Search,WarningFilled} from '@element-plus/icons-vue'
import {session,currentProject,projectId} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {showOperationFeedback} from '@/ui/operation-feedback'
import {formatTime} from '@/core/time'
import DeviceGroupBulk from './DeviceGroupBulk.vue'
import DirectoryGlyph from '../devices/DirectoryGlyph.vue'
import {directoryDisplayFacts} from '../devices/directory-display-facts'
import {alarmLabel} from '../devices/page-alarm-status'
import {groupUuid,type DeviceGroup} from './device-group-api'
import {groupBulkKnownFailure,groupBulkObservation,groupBulkSelection} from './group-bulk'
import {memberTransport,memberFacts,prepareMemberEdge,type MemberPage,type MemberDevice,type EdgeIntent,type MemberTransport,type GroupScope} from './group-members-api'

const props=withDefaults(defineProps<{groupId:string;disabled?:boolean;advanced?:boolean;transport?:MemberTransport}>(),{
 disabled:false,advanced:false,transport:()=>memberTransport
})
const emit=defineEmits<{locked:[value:boolean];changed:[];refresh:[]}>()
const router=useRouter()
const roles=['OWNER','ADMIN','OPERATOR','VIEWER'],denied=ref(false)
const readable=computed(()=>session.ready&&!session.transitioning&&groupUuid.test(props.groupId)&&!!session.user?.accountId&&!!currentProject.value&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||'')&&!denied.value)
const writable=computed(()=>readable.value&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const group=shallowRef<DeviceGroup>(),bulkLocked=ref(false),advancedOpen=ref(false)
const data=shallowRef<MemberPage>(),scope=ref<GroupScope>('DIRECT'),page=ref(1),limit=ref<20|50>(20)
const keyword=ref(''),appliedKeyword=ref(''),loading=ref(false),listError=ref('')
const mode=ref<''|'add'|'remove'>(''),selected=shallowRef<MemberDevice[]>([]),chosen=shallowRef<MemberDevice[]>([])
const pending=shallowRef<EdgeIntent>(),busy=ref(false),unknown=ref(false),error=ref(''),currentFacts=ref(''),reviewed=ref(false)
const processed=ref(0),failed=ref(false)
const options=shallowRef<MemberDevice[]>([]),optionPage=ref(0),optionTotal=ref('0'),optionApplied=ref(''),optionLoading=ref(false),optionError=ref('')
const locked=computed(()=>mode.value!==''||bulkLocked.value)
const blocked=computed(()=>!writable.value||props.disabled||bulkLocked.value||busy.value||unknown.value)
const directWritable=computed(()=>writable.value&&!props.disabled&&!props.advanced&&scope.value==='DIRECT'&&data.value?.group.type==='STATIC')
const facts=computed(()=>data.value?memberFacts(data.value):undefined)
const selectedIds=computed(()=>selected.value.map(row=>row.id))
const selectedAll=computed(()=>!!data.value?.directory.items.length&&selected.value.length===data.value.directory.items.length)
const selectedSome=computed(()=>!!selected.value.length&&!selectedAll.value)
const chosenIds=computed(()=>chosen.value.map(row=>row.id))
const retainedOptions=computed(()=>chosen.value.filter(row=>!options.value.some(option=>option.id===row.id)))
const optionHasMore=computed(()=>BigInt(optionTotal.value)>BigInt(optionPage.value*20))

let optionTimer:ReturnType<typeof setTimeout>|undefined
let generation=0,listGeneration=0,optionGeneration=0,alive=true
let listController:AbortController|undefined,actionController:AbortController|undefined,optionController:AbortController|undefined
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,group:props.groupId,account:session.user?.accountId}}
function current(s:ReturnType<typeof capture>){
 return alive&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.group===props.groupId&&s.account===session.user?.accountId&&readable.value
}
function clearAction(){
 mode.value='';chosen.value=[];pending.value=undefined;busy.value=false;unknown.value=false;error.value='';currentFacts.value='';reviewed.value=false;processed.value=0;failed.value=false
 options.value=[];optionPage.value=0;optionTotal.value='0';optionApplied.value='';optionLoading.value=false;optionError.value=''
 clearTimeout(optionTimer);optionGeneration++;optionController?.abort()
}
function reset(){
 generation++;listGeneration++;listController?.abort();actionController?.abort();data.value=undefined;group.value=undefined
 bulkLocked.value=false;advancedOpen.value=false;scope.value='DIRECT';page.value=1;keyword.value='';appliedKeyword.value='';loading.value=false;listError.value='';selected.value=[];clearAction()
}
function refuse(cause:unknown){reset();denied.value=true;listError.value=errorMessage(cause)}
async function load(){
 if(!readable.value)return
 const s=capture(),token=++listGeneration
 listController?.abort();listController=new AbortController()
 loading.value=true;data.value=undefined;selected.value=[];listError.value=''
 const query={scope:scope.value,page:page.value,limit:limit.value,keyword:appliedKeyword.value}
 try{
  const value=await props.transport.members(s.project,s.group,query,listController.signal)
  if(!current(s)||token!==listGeneration)return
  if(!value.directory.items.length&&query.page>1){
   page.value=Math.max(1,Number((BigInt(value.directory.total)+BigInt(query.limit)-1n)/BigInt(query.limit)))
   void load();return
  }
  data.value=value;group.value=value.group
 }catch(cause){
  if(current(s)&&token===listGeneration&&!(cause instanceof IdentityChanged)){
   if(cause instanceof ApiError&&[401,403].includes(cause.status))refuse(cause)
   else listError.value=errorMessage(cause)
  }
 }finally{if(current(s)&&token===listGeneration)loading.value=false}
}
function changeScope(value:unknown){
 if(locked.value||loading.value||!['DIRECT','SUBTREE'].includes(String(value)))return
 scope.value=value as GroupScope;page.value=1;void load()
}
function refresh(){if(locked.value||loading.value)return;emit('refresh');void load()}
function search(){if(locked.value||loading.value)return;appliedKeyword.value=keyword.value;page.value=1;void load()}
function turn(value:number){if(locked.value||loading.value||value<1||value>1000000)return;page.value=value;void load()}
function resize(value:number){if(locked.value||loading.value||![20,50].includes(value))return;limit.value=value as 20|50;page.value=1;void load()}
function selectOne(row:MemberDevice,checked:boolean){
 if(!directWritable.value||locked.value||!data.value?.directory.items.some(item=>item.id===row.id))return
 selected.value=checked?[...selected.value.filter(item=>item.id!==row.id),row]:selected.value.filter(item=>item.id!==row.id)
}
function selectAll(checked:boolean){if(directWritable.value&&!locked.value)selected.value=checked?[...data.value!.directory.items]:[]}

async function loadDevices(append=false){
 if(blocked.value||mode.value!=='add')return
 const s=capture(),token=++optionGeneration,nextPage=append?optionPage.value+1:1
 optionController?.abort();optionController=new AbortController();optionLoading.value=true;optionError.value=''
 try{
  const value=await props.transport.devices(s.project,optionApplied.value,nextPage,optionController.signal)
  if(!current(s)||token!==optionGeneration)return
  const display=directoryDisplayFacts(value.items,value.displayFacts)
  if(!display)throw new Error('无法确认设备分组')
  const eligible=value.items.filter(row=>!display[row.id]?.staticGroups?.some(group=>group.id===s.group))
  const previous=append?options.value:[]
  options.value=[...new Map([...previous,...eligible].map(row=>[row.id,row])).values()]
  optionPage.value=nextPage;optionTotal.value=value.total
 }catch(cause){if(current(s)&&token===optionGeneration)optionError.value=errorMessage(cause)}
 finally{if(current(s)&&token===optionGeneration)optionLoading.value=false}
}
function open(kind:'add'|'remove'){
 if(!directWritable.value||locked.value||loading.value||kind==='remove'&&!selected.value.length)return
 clearAction();mode.value=kind
 if(kind==='add')void loadDevices()
 else chosen.value=[...selected.value]
}
function chooseDevices(value:unknown){
 if(blocked.value||!Array.isArray(value)||value.length>100)return
 const available=new Map([...chosen.value,...options.value].map(row=>[row.id,row]))
 chosen.value=value.map(id=>available.get(id)).filter((row):row is MemberDevice=>!!row)
}
function optionSearch(value:string){
 const query=value.trim().slice(0,128)
 if(blocked.value||query===optionApplied.value)return
 optionApplied.value=query;optionGeneration++;optionController?.abort();options.value=[];optionPage.value=0;optionTotal.value='0';optionError.value='';optionLoading.value=true
 clearTimeout(optionTimer);optionTimer=setTimeout(()=>void loadDevices(),200)
}
function optionScroll(event:Event){
 const list=event.target
 if(optionLoading.value||optionError.value||!optionHasMore.value||!(list instanceof HTMLElement)||!list.classList.contains('el-select-dropdown__wrap'))return
 if(list.scrollHeight-list.clientHeight-list.scrollTop<=32)void loadDevices(true)
}
function connectionLabel(status:MemberDevice['status']){return status==='ONLINE'?'在线':status==='OFFLINE'?'离线':'从未连接'}
function reloadMembers(){emit('changed');void load()}
function close(){
 if(busy.value||unknown.value)return
 const refreshNeeded=failed.value
 clearAction()
 if(refreshNeeded)reloadMembers()
}
function beforeClose(done:()=>void){if(!busy.value&&!unknown.value){close();done()}}
function visibleChanged(value:boolean){if(!value)close()}

async function submit(){
 if(blocked.value||!directWritable.value||failed.value||!chosen.value.length)return
 let devices:readonly MemberDevice[]
 try{devices=groupBulkSelection(chosen.value)}catch(cause){error.value=errorMessage(cause);return}
 const s=capture(),member=mode.value==='add',controller=new AbortController()
 actionController=controller;busy.value=true;error.value=''
 let changed=0
 try{
  for(const device of devices){
   if(!current(s))return
   if(!writable.value||props.disabled)throw new Error('当前写权限或页面状态已变化')
   const intent=prepareMemberEdge(s.project,device.id,s.group,member)
   const before=await props.transport.recover(intent,controller.signal)
   if(!current(s))return
   if(!writable.value||props.disabled)throw new Error('当前写权限或页面状态已变化')
   if('member'in before&&before.member===member){processed.value++;continue}
   pending.value=intent
   await props.transport.write(intent,controller.signal)
   if(!current(s))return
   pending.value=undefined
   changed++;processed.value++
  }
  const result=member?'已加入当前静态组':'已从当前静态组移除'
  const message=!changed?'所选设备的分组状态已符合要求，无需修改':devices.length===1?result:`${result}（已确认 ${devices.length} 台）`
  clearAction();showOperationFeedback(message);reloadMembers()
 }catch(cause){
  if(!current(s)||cause instanceof IdentityChanged)return
  unknown.value=!!pending.value&&!groupBulkKnownFailure(cause)
  failed.value=true
  error.value=`已确认 ${processed.value} / ${devices.length} 台。${errorMessage(cause)}`
  if(unknown.value)error.value+='。当前设备结果待核对，后续设备未提交。'
  else pending.value=undefined
 }finally{if(current(s))busy.value=false}
}
async function recover(){
 if(!readable.value||busy.value||!pending.value)return
 const s=capture(),original=pending.value
 busy.value=true;actionController=new AbortController();currentFacts.value=''
 try{
  const value=await props.transport.recover(original,actionController.signal)
  if(current(s)){currentFacts.value=groupBulkObservation(value);reviewed.value=true}
 }catch(cause){
  if(current(s)){
   if(cause instanceof ApiError&&cause.status===404){currentFacts.value='原设备或组当前不存在或不可见；原操作结果仍未知。';reviewed.value=true}
   else error.value=errorMessage(cause)
  }
 }finally{if(current(s))busy.value=false}
}
function finish(){
 if(!reviewed.value||busy.value)return
 clearAction();showOperationFeedback('已结束核对，请查看当前分组成员','warning');reloadMembers()
}
function viewInDirectory(){if(!locked.value&&!props.disabled)void router.push({name:'devices',query:{groupId:props.groupId,includeSubgroups:'1'}})}
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
watch([()=>props.groupId,()=>projectId.value,()=>session.user?.accountId,()=>readable.value,()=>props.transport],()=>{reset();if(readable.value)void load()},{immediate:true,flush:'sync'})
watch(()=>props.advanced,value=>{
 if(value)return
 advancedOpen.value=false
 if(scope.value!=='DIRECT'||appliedKeyword.value){
  scope.value='DIRECT';keyword.value='';appliedKeyword.value='';page.value=1;void load()
 }
})
watch(writable,value=>{if(!value&&!busy.value&&!unknown.value)clearAction()},{flush:'sync'})
const dispose=onIdentityChange(()=>{denied.value=false;reset();queueMicrotask(()=>{if(alive&&readable.value)void load()})})
onScopeDispose(()=>{clearTimeout(optionTimer);alive=false;generation++;listController?.abort();actionController?.abort();optionController?.abort();dispose();emit('locked',false)})
</script>

<template>
<section class="group-members">
 <div v-if="props.advanced" class="group-member-advanced">
  <el-button size="small" :disabled="locked" :aria-expanded="advancedOpen" @click="advancedOpen=!advancedOpen">高级成员管理</el-button>
 </div>
 <div v-show="!props.advanced||advancedOpen">
  <h2 v-if="!props.advanced">设备<span v-if="data"> ({{data.directory.total}})</span></h2>
  <div class="member-toolbar">
   <el-button v-if="directWritable" size="small" :disabled="locked||loading" @click="open('add')">添加设备</el-button>
   <el-button v-if="directWritable&&selected.length" size="small" type="danger" :disabled="locked||loading" @click="open('remove')">从分组中移除设备</el-button>
   <div class="member-tools">
    <template v-if="props.advanced">
     <el-input v-model="keyword" size="small" aria-label="组成员搜索" placeholder="设备名称或标识" maxlength="128" :disabled="locked" @keyup.enter="search"><template #prefix><el-icon><Search/></el-icon></template></el-input>
     <el-button size="small" :disabled="locked||loading" @click="search">搜索</el-button>
     <el-radio-group size="small" :model-value="scope" aria-label="组成员范围" :disabled="locked||loading" @update:model-value="changeScope"><el-radio-button value="DIRECT">本组</el-radio-button><el-radio-button value="SUBTREE">包含子组</el-radio-button></el-radio-group>
    </template>
    <el-button size="small" :icon="Refresh" aria-label="刷新成员" :disabled="!readable||locked||loading" @click="refresh">刷新</el-button>
    <el-button v-if="!props.advanced" size="small" :disabled="!readable||locked||loading" @click="viewInDirectory">在设备列表中查看 <el-icon class="member-view-arrow"><ArrowRight/></el-icon></el-button>
   </div>
  </div>
  <p v-if="scope==='SUBTREE'" class="boundary">显示本组及有效子组的去重设备并集。</p>
  <p v-else-if="props.advanced&&data?.group.type==='DYNAMIC'" class="boundary">动态组成员由已保存条件实时计算。</p>
  <AsyncState :forbidden="!readable" :loading="loading" :error="listError" @retry="load">
   <template v-if="data">
    <el-table :data="data.directory.items" row-key="id" empty-text="无设备">
     <el-table-column v-if="directWritable" width="56" align="center" class-name="member-selection">
      <template #header><el-checkbox :model-value="selectedAll" :indeterminate="selectedSome" :disabled="locked||!data.directory.items.length" aria-label="选择本页全部设备" @update:model-value="selectAll(!!$event)"/></template>
      <template #default="{row}"><el-checkbox :model-value="selectedIds.includes(row.id)" :disabled="locked" :aria-label="`选择设备 ${row.name}`" @update:model-value="selectOne(row,!!$event)"/></template>
     </el-table-column>
     <el-table-column label="设备名称" min-width="230"><template #default="{row}">
      <span class="member-device"><ReferenceIcon glyph="󰆧"/><RouterLink v-if="!locked&&!props.disabled" :to="{path:'/devices/'+row.id,query:{sourceGroupId:props.groupId}}">{{row.name}}</RouterLink><span v-else>{{row.name}}</span></span>
     </template></el-table-column>
     <el-table-column label="设备类型" width="180" show-overflow-tooltip><template #default="{row}"><RouterLink v-if="facts?.display[row.id]?.deviceTypeName&&facts.display[row.id]?.deviceTypeId&&!locked&&!props.disabled" class="member-type" :to="{path:'/device-types/'+facts.display[row.id].deviceTypeId,query:{sourceGroupId:props.groupId}}">{{facts.display[row.id]?.deviceTypeName}}</RouterLink><span v-else-if="facts?.display[row.id]?.deviceTypeName" class="member-type">{{facts.display[row.id]?.deviceTypeName}}</span></template></el-table-column>
     <el-table-column label="在线状态" width="120"><template #default="{row}"><span class="member-state" :class="{'is-online':row.status==='ONLINE'}"><DirectoryGlyph kind="connection"/>{{row.status==='ONLINE'?'在线':'离线'}}</span></template></el-table-column>
     <el-table-column label="活跃时间" width="180"><template #default="{row}"><span title="最近成功属性或事件上报">{{facts?.display[row.id]?.lastDataReportAt?formatTime(facts.display[row.id]?.lastDataReportAt):'-'}}</span></template></el-table-column>
     <el-table-column label="告警状态" width="100"><template #default="{row}"><span class="member-alarm" :class="{'is-active':facts?.alarm.states[row.id]==='ACTIVE'}">{{alarmLabel(facts?.alarm.states[row.id])}}</span></template></el-table-column>
    </el-table>
    <CursorPager v-if="BigInt(data.directory.total)>BigInt(limit)||page>1" :page="page" :limit="limit" :total="data.directory.total" :sizes="[20,50]" :loading="loading||locked" @update:page="turn" @update:limit="resize"/>
   </template>
  </AsyncState>
  <DeviceGroupBulk v-if="props.advanced&&advancedOpen&&group" :key="projectId+group.id" :group="group" :scope="scope" :keyword="appliedKeyword" :current-page="data" :disabled="props.disabled||loading" @locked="bulkLocked=$event" @changed="reloadMembers"/>
 </div>
 <el-dialog :model-value="mode!==''" :title="unknown?'核对原静态归属':mode==='add'?'添加设备':'提示'" :width="mode==='remove'?'min(420px,94vw)':'min(600px,94vw)'" :align-center="mode==='remove'" :class="{'group-add-dialog':mode==='add'&&!unknown,'group-member-remove-dialog':mode==='remove'&&!unknown}" destroy-on-close :close-on-click-modal="false" :close-on-press-escape="!busy&&!unknown" :before-close="beforeClose" @update:model-value="visibleChanged">
  <el-alert v-if="error" :title="error" type="warning" :closable="false"/>
  <template v-if="unknown">
   <p>待核对设备：{{chosen.find(row=>row.id===pending?.original.device)?.name}}</p>
   <p>原请求键：<code>{{pending?.original.key}}</code></p>
   <el-button :disabled="busy||!readable" @click="recover">只读核对当前关系</el-button><p role="status">{{currentFacts}}</p>
   <el-button :disabled="busy||!reviewed" @click="finish">结束本次核对</el-button>
  </template>
  <el-form v-else-if="mode==='add'" label-position="top" @submit.prevent>
   <el-form-item label="选择设备" @scroll.capture="optionScroll">
    <el-select :model-value="chosenIds" aria-label="选择设备" multiple filterable reserve-keyword :multiple-limit="100" :filter-method="optionSearch" :loading="optionLoading&&!options.length" :disabled="blocked||failed" placeholder="请选择" :no-data-text="optionApplied?'暂无匹配设备':'暂无可选设备'" size="large" :teleported="false" placement="bottom-start" popper-class="group-device-options" @update:model-value="chooseDevices">
     <template #label="{value,label}">{{chosen.find(row=>row.id===value)?.name??label}}</template>
     <el-option v-for="row in retainedOptions" :key="row.id" :value="row.id" :label="row.name" class="retained-device"/>
     <el-option v-for="row in options" :key="row.id" :value="row.id" :label="row.name" class="member-option">
      <ReferenceIcon glyph="󰆧" class="option-icon"/>
      <span class="option-identity"><strong :title="row.name">{{row.name}}</strong><small v-if="row.deviceKey!==row.name" :title="row.deviceKey">{{row.deviceKey}}</small></span>
      <span class="member-state" :class="{'is-online':row.status==='ONLINE'}"><DirectoryGlyph kind="connection"/>{{connectionLabel(row.status)}}</span>
     </el-option>
     <template v-if="optionHasMore&&options.length<6" #footer>
      <el-button size="small" text :disabled="blocked||optionLoading||!!optionError" @click="loadDevices(true)">加载更多</el-button>
     </template>
    </el-select>
   </el-form-item>
   <el-alert v-if="optionError" :title="optionError" type="error" :closable="false"/>
   <el-button v-if="optionError" size="small" :disabled="blocked||optionLoading" @click="loadDevices(optionPage>0)">重试</el-button>
  </el-form>
  <p v-else-if="mode==='remove'&&!failed" class="remove-question"><el-icon><WarningFilled/></el-icon>确认从设备组中移除吗？</p>
  <template #footer>
   <el-button v-if="!unknown" :size="mode==='remove'?'small':'default'" :disabled="busy" @click="close">{{failed?'关闭':'取消'}}</el-button>
   <el-button v-if="!unknown&&!failed" :size="mode==='remove'?'small':'default'" type="primary" :disabled="blocked||!chosen.length" :loading="busy" @click="submit">{{mode==='add'?'加入':'确定'}}</el-button>
  </template>
 </el-dialog>
</section>
</template>
<style scoped>
.group-members h2{margin:0 0 20px;color:#082a2a;font-size:22px;font-weight:400;line-height:32px}
.member-toolbar,.member-tools{display:flex;align-items:center;flex-wrap:wrap;gap:10px}
.member-tools{margin-left:auto}
.member-tools .el-input{width:185px}
.member-view-arrow{margin-left:5px}
.group-member-advanced{margin-top:24px}
.remove-question{display:flex;align-items:center;gap:12px;margin:0}
.remove-question .el-icon{font-size:22px;color:var(--el-color-warning)}
.group-members code{overflow-wrap:anywhere}
.group-members :deep(.member-selection .cell){padding:0}
.group-members :deep(.member-selection .el-checkbox){height:14px;vertical-align:middle}
.member-toolbar .el-button+.el-button{margin-left:0}
.member-device,.member-state{display:inline-flex;align-items:center;gap:8px}
.member-device>.reference-icon{font-size:18px;color:#909399}
.member-device a{color:var(--tl-primary);text-decoration:none}
.member-type{padding:3px 8px;border-radius:3px;background:var(--tl-fill);font-size:12px;color:#606266;text-decoration:none}
.member-device a:hover,.member-type:hover{text-decoration:none}
.member-state{gap:4px;white-space:nowrap;color:#909399;font-size:13px}
.member-state>svg{font-size:12px}
.member-state.is-online{color:#67c23a}
.member-alarm,.boundary{color:#909399}
.member-alarm{white-space:nowrap}
.member-alarm.is-active{color:#f56c6c}
.boundary{font-size:13px;line-height:22px}
.group-members :deep(.el-table .el-table__cell){height:48px;padding-block:8px}
.group-members :deep(.el-table th.el-table__cell){color:var(--tl-title);font-weight:600}
.group-add-dialog .el-form{padding-top:13px;min-height:116px}
.group-add-dialog .el-select{width:100%}
.group-add-dialog :deep(.el-select__selection){gap:4px}
.group-add-dialog :deep(.el-tag){height:24px;color:#909399}
.member-option.is-selected strong{color:var(--el-color-primary)}
.member-option.is-selected::after{display:none}
.group-member-remove-dialog :deep(.el-dialog__body){padding:8px 16px 4px}
.group-member-remove-dialog :deep(.el-dialog__header){padding:12px 16px 4px}
.group-member-remove-dialog :deep(.el-dialog__footer){padding:12px 16px}
.group-add-dialog :deep(.el-form-item__label){font-weight:700;color:#606266;margin-bottom:5px}
.group-add-dialog :deep(.group-device-options .el-select-dropdown__wrap){max-height:min(250px,40vh)}
.group-add-dialog :deep(.group-device-options .el-popper__arrow){left:36px!important;transform:none!important}
.member-option{display:flex;align-items:center;gap:12px;min-height:46px;height:auto;padding:6px 22px}
.member-option .option-icon{color:#999;font-size:28px}
.option-identity{display:grid;flex:1;min-width:0;line-height:18px}
.option-identity>strong,.option-identity>small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.option-identity small{font-size:12px;color:#909399}
.retained-device{display:none}
</style>
