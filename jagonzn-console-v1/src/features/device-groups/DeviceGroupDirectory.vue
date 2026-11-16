<script setup lang="ts">
import {computed,onScopeDispose,reactive,ref,shallowRef,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute,useRouter} from 'vue-router'
import {Plus,Sort,ArrowDown,QuestionFilled,WarningFilled} from '@element-plus/icons-vue'
import {ClickOutside as vClickOutside,ElDialog} from 'element-plus'
import {session,projectId,currentProject} from '@/core/session'
import {THINGSLINK_EXTRAS_VISIBLE} from '@/core/replica-scope'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import {showOperationFeedback} from '@/ui/operation-feedback'
import TasksPage from '@/features/rules/TasksPage.vue'
import {useDetailTab} from '@/features/rules/detail-tab'
import DeviceGroupMembers from './DeviceGroupMembers.vue'
import DeviceGroupSortDialog from './DeviceGroupSortDialog.vue'
import GroupColorDrawer from './GroupColorDrawer.vue'
import {groupTransport,groupDraft,prepareGroup,groupMatchesIntent,groupUuid,type DeviceGroup,type GroupTreePage,type GroupDraft,type GroupIntent,type GroupTransport} from './device-group-api'
const props=withDefaults(defineProps<{transport?:GroupTransport}>(),{transport:()=>groupTransport})
const route=useRoute(),router=useRouter()
const roles=['OWNER','ADMIN','OPERATOR','VIEWER'],readDenied=ref(false)
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&!!currentProject.value&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||'')&&!readDenied.value)
const writable=computed(()=>readable.value&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const tab=useDetailTab(['overview','tasks','settings'],'overview')
const showAdvancedSettings=computed(()=>THINGSLINK_EXTRAS_VISIBLE&&tab.value==='settings')
const path=shallowRef<DeviceGroup[]>([]),page=ref(1),size=ref(20),data=shallowRef<GroupTreePage>(),loading=ref(false),listError=ref(''),routeError=ref('')
const activeGroup=computed(()=>path.value.at(-1))
const canCreateGroup=computed(()=>!activeGroup.value||activeGroup.value.parentId===null)
const editSection=ref<'information'|'tags'>('information')
const parent=computed(()=>path.value.at(-1)?.id??null),mode=ref<GroupIntent['kind']|''>(''),form=reactive<GroupDraft>(groupDraft()),selected=shallowRef<DeviceGroup>(),busy=ref(false),error=ref(''),unknown=ref(false),conflict=ref(false),intent=shallowRef<GroupIntent>(),acceptedId=ref(''),facts=ref(''),recovered=ref(false),createBlocked=ref(false)
const parentTrigger=ref<{ref?:HTMLButtonElement}>()
const picker=ref(false),pickerPage=ref(1),pickerData=shallowRef<GroupTreePage>(),pickerLoading=ref(false),pickerError=ref('')
const membersLocked=ref(false),tasksLocked=ref(false)
const sortOpen=ref(false)
const sortLocked=ref(false)
const locked=computed(()=>mode.value!==''||membersLocked.value||tasksLocked.value),writeBlocked=computed(()=>!writable.value||busy.value||unknown.value||conflict.value)
let generation=0,listToken=0,pickerToken=0,alive=true,listController:AbortController|undefined,writeController:AbortController|undefined,pickerController:AbortController|undefined,routeController:AbortController|undefined
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,account:session.user?.accountId}}
function current(s:ReturnType<typeof capture>){return alive&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.account===session.user?.accountId&&readable.value}
function resetEditor(){mode.value='';selected.value=undefined;intent.value=undefined;acceptedId.value='';busy.value=false;unknown.value=false;conflict.value=false;error.value='';facts.value='';recovered.value=false;picker.value=false;pickerToken++;pickerController?.abort();pickerData.value=undefined;Object.assign(form,groupDraft())}
function invalidate(){sortOpen.value=false;sortLocked.value=false;membersLocked.value=false;tasksLocked.value=false;generation++;listToken++;pickerToken++;listController?.abort();writeController?.abort();pickerController?.abort();routeController?.abort();path.value=[];page.value=1;data.value=undefined;loading.value=false;listError.value='';routeError.value='';createBlocked.value=false;resetEditor()}
function deny(cause:unknown){invalidate();readDenied.value=true;listError.value=errorMessage(cause)}
async function load(){if(!readable.value)return;const s=capture(),token=++listToken;listController?.abort();listController=new AbortController();loading.value=true;listError.value='';data.value=undefined;const query={parentId:parent.value,page:page.value,size:size.value}
 try{const value=await props.transport.list(s.project,query,listController.signal);if(current(s)&&token===listToken)data.value=value}
 catch(cause){if(current(s)&&token===listToken&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status))deny(cause);else listError.value=errorMessage(cause)}}finally{if(current(s)&&token===listToken)loading.value=false}}
function groupLocation(groupId?:string,create=false){
 return {path:groupId?`/device-groups/${groupId}`:'/device-groups',query:create?{create:'1'}:{}}
}
function enter(group:DeviceGroup){if(!locked.value&&!loading.value)void router.push(groupLocation(group.id))}
function breadcrumb(index:number){if(!locked.value)void router.push(groupLocation(path.value[index]?.id))}
function beginCreate(){
 if(!writable.value||createBlocked.value||!canCreateGroup.value)return
 mode.value='create'
 Object.assign(form,groupDraft(undefined,parent.value,activeGroup.value?.name??'根组'))
 form.tags.push({key:'',value:''})
}
async function syncRoute(){
 routeController?.abort()
 if(!readable.value)return
 const groupId=route.params.groupId,create=route.query.create==='1'
 const raw=typeof groupId==='string'?groupId:''
 resetEditor();routeError.value=''
 if(groupId!==undefined&&groupId!==''&&(!raw||!groupUuid.test(raw))){
  routeError.value='设备组链接无效';data.value=undefined;path.value=[];loading.value=false;return
 }
 if(raw!==(activeGroup.value?.id??'')||!data.value){
  const index=path.value.findIndex(group=>group.id===raw)
  const cached=data.value?.items.find(item=>item.group.id===raw)?.group
  listToken++;listController?.abort();data.value=undefined
  page.value=1;loading.value=true
  if(!raw)path.value=[]
  else if(index>=0)path.value=path.value.slice(0,index+1)
  else if(cached)path.value=[...path.value,cached]
  else{
   path.value=[]
   const controller=new AbortController(),s=capture()
   routeController=controller
   const ancestors:DeviceGroup[]=[]
   try{
    for(let id:string|null=raw;id;){
     if(ancestors.length>=16||ancestors.some(group=>group.id===id))throw new Error('设备组层级无效')
     const group:DeviceGroup=await props.transport.read(s.project,id,controller.signal)
     if(!current(s)||controller.signal.aborted)return
     ancestors.unshift(group);id=group.parentId
    }
    path.value=ancestors
   }catch(cause){
    if(!current(s)||controller.signal.aborted)return
    routeError.value=errorMessage(cause);loading.value=false;return
   }
  }
  void load()
 }
 if(create){
  if(writable.value&&!createBlocked.value&&canCreateGroup.value)beginCreate()
  else void router.replace(groupLocation(activeGroup.value?.id))
 }
}
function turn(next:number){if(locked.value||loading.value||next<1||next>1000000)return;page.value=next;void load()}
function resize(next:number){if(locked.value||loading.value||![20,50,100].includes(next))return;size.value=next;page.value=1;void load()}
async function open(kind:GroupIntent['kind'],group?:DeviceGroup,section:'information'|'tags'='information'){if(!writable.value||locked.value||loading.value||kind==='create'&&(createBlocked.value||!canCreateGroup.value))return
 if(kind==='create'){void router.push(groupLocation(activeGroup.value?.id,true));return}
 resetEditor();mode.value=kind;editSection.value=section
 if(!group)return;busy.value=true;const s=capture();writeController=new AbortController()
 try{const value=await props.transport.read(s.project,group.id,writeController.signal);if(!current(s))return;selected.value=value;Object.assign(form,groupDraft(value,null,path.value.find(part=>part.id===value.parentId)?.name??value.parentId??'根组'))
  if(section==='tags'&&!form.tags.length)form.tags.push({key:'',value:''})
 }
 catch(cause){if(current(s)){error.value=errorMessage(cause);conflict.value=true}}
 finally{if(current(s))busy.value=false}}
function close(){if(busy.value||unknown.value)return;if(mode.value==='create')void router.replace(groupLocation(activeGroup.value?.id));else resetEditor()}
function visibleChanged(value:boolean){if(!value)close()}
function beforeClose(done:()=>void){if(!busy.value&&!unknown.value){resetEditor();done()}}
async function submit(){if(writeBlocked.value||!mode.value)return;let chosen:GroupIntent
 try{chosen=prepareGroup(projectId.value,mode.value,form,selected.value)}catch(cause){error.value=errorMessage(cause);return}
 intent.value=chosen;busy.value=true;unknown.value=true;recovered.value=false;error.value='';facts.value='';const s=capture();writeController=new AbortController();let acknowledged=false
 try{const result=await props.transport.write(chosen,writeController.signal);if(!current(s))return
  if(chosen.kind!=='delete'&&(!result||!groupMatchesIntent(result,chosen)))throw new ApiError('写回执与原完整意图不符',200,undefined,undefined,true)
  acknowledged=true;if(result)acceptedId.value=result.id
  if(!writable.value){error.value='当前写权限已变化；请只读核对原请求';return}
  let destination:ReturnType<typeof groupLocation>|undefined
  if(chosen.kind!=='delete'){if(!result)throw new Error('写入回执缺少设备组身份');const actual=await props.transport.read(s.project,result.id,writeController.signal);if(!current(s))return;if(BigInt(actual.revision)<BigInt(result.revision))throw new Error('当前组版本早于写回执，请只读核对')
   if(activeGroup.value?.id===actual.id){
    if(activeGroup.value.parentId===actual.parentId)path.value=[...path.value.slice(0,-1),actual]
    else destination=groupLocation()
   }
   if(chosen.kind==='create')destination=groupLocation(activeGroup.value?.id)
   showOperationFeedback(`已保存设备组 ${actual.name}`)
  }else{
   if(activeGroup.value?.id===chosen.groupId)destination=groupLocation(path.value.at(-2)?.id)
   showOperationFeedback('设备组已移除')
  }
  unknown.value=false;busy.value=false;resetEditor()
  if(destination)await router.replace(destination)
  if(current(s)&&!loading.value)void load()
 }catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){
  if(!acknowledged&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&cause.status>=400&&cause.status<500){unknown.value=false;error.value=errorMessage(cause);if([401,403].includes(cause.status)){deny(cause);return}if(cause.status===409&&chosen.kind!=='create')conflict.value=true}
  else {unknown.value=true;error.value=`原操作结果未知：${errorMessage(cause)}。请保留原请求，仅作只读核对。`}
 }}finally{if(current(s))busy.value=false}}
async function recover(){if(!readable.value||busy.value||!intent.value)return;const original=intent.value,s=capture();busy.value=true;facts.value='';writeController=new AbortController()
 try{const id=acceptedId.value||original.groupId
  if(id){const value=await props.transport.read(s.project,id,writeController.signal);if(!current(s))return;facts.value=`当前组：${value.name}；版本 ${value.revision}；父组 ${value.parentId??'根组'}。当前事实不能证明原请求的历史结果。`}
  else {const result=await props.transport.list(s.project,{parentId:form.parentId,page:1,size:50},writeController.signal);if(!current(s))return;const candidates=result.items.filter(item=>item.group.name===form.name.trim()).map(item=>item.group.id);facts.value=candidates.length?`当前该层首50项可见同名组：${candidates.join('、')}；不证明原请求创建成功。`:'当前该层首50项未找到同名组；局部页不能证明全局不存在，也不能重发原创建。'}
  recovered.value=true
 }catch(cause){if(current(s)){if(cause instanceof ApiError&&cause.status===404&&original.groupId){facts.value='原组当前不存在或不可见；不能据此证明原删除请求完成。';recovered.value=true}else error.value=errorMessage(cause)}}finally{if(current(s))busy.value=false}}
function finishReview(){if(!recovered.value||busy.value)return;if(intent.value?.kind==='create')createBlocked.value=true;showOperationFeedback('已结束核对，原操作结果仍未确认','warning');unknown.value=false;close();void load()}
async function reread(){if(!readable.value||busy.value||!selected.value)return;busy.value=true;const s=capture(),id=selected.value.id;writeController=new AbortController()
 try{const value=await props.transport.read(s.project,id,writeController.signal);if(!current(s))return;selected.value=value;Object.assign(form,groupDraft(value,null,value.parentId??'根组'));conflict.value=false;error.value='已读取当前资料；请重新检查后再发起新的操作'}catch(cause){if(current(s))error.value=errorMessage(cause)}finally{if(current(s))busy.value=false}}
async function loadPicker(){if(writeBlocked.value||!picker.value)return;const s=capture(),token=++pickerToken;pickerController?.abort();pickerController=new AbortController();pickerLoading.value=true;pickerData.value=undefined;pickerError.value=''
 try{const value=await props.transport.list(s.project,{parentId:null,page:pickerPage.value,size:20},pickerController.signal);if(current(s)&&token===pickerToken)pickerData.value=value}catch(cause){if(current(s)&&token===pickerToken)pickerError.value=errorMessage(cause)}finally{if(current(s)&&token===pickerToken)pickerLoading.value=false}}
function openPicker(){if(writeBlocked.value)return;picker.value=true;pickerPage.value=1;void loadPicker()}
function closePicker(){if(!picker.value)return;picker.value=false;pickerController?.abort();pickerToken++}
function escapePicker(event:KeyboardEvent){
 if(!picker.value)return
 event.stopPropagation()
 closePicker()
 parentTrigger.value?.ref?.focus()
}
function unavailableParent(group:DeviceGroup){
 return group.parentId!==null||group.id===selected.value?.id||mode.value==='move'&&group.id!==selected.value?.parentId&&!!data.value?.total
}
function chooseParent(group?:DeviceGroup){
 if(writeBlocked.value||group&&unavailableParent(group))return
 form.parentId=group?.id??null
 form.parentName=group?.name??'根组'
 closePicker()
 parentTrigger.value?.ref?.focus()
}
function pickerTurn(value:number){if(pickerLoading.value||value<1||value>1000000)return;pickerPage.value=value;void loadPicker()}
const dialogWidth=computed(()=>mode.value==='edit'&&editSection.value==='tags'?'min(800px,94vw)':mode.value==='move'?'min(600px,94vw)':mode.value==='delete'&&!unknown.value?'min(420px,94vw)':'min(500px,94vw)')
const dialogTitle=computed(()=>mode.value==='move'?'移动设备组':mode.value==='delete'?unknown.value?'核对移除设备组':'提示':editSection.value==='tags'?'编辑标签':'修改信息')
watch([()=>projectId.value,()=>session.user?.accountId,()=>readable.value,()=>props.transport],()=>{invalidate();if(readable.value)void syncRoute()},{immediate:true,flush:'sync'})
watch([()=>route.params.groupId,()=>route.query.create],()=>void syncRoute())
const dispose=onIdentityChange(()=>{readDenied.value=false;invalidate();queueMicrotask(()=>{if(alive&&readable.value)void syncRoute()})})
const navigationLocked=computed(()=>busy.value||unknown.value||membersLocked.value||tasksLocked.value||sortLocked.value)
onBeforeRouteLeave(()=>!navigationLocked.value);onBeforeRouteUpdate(()=>!navigationLocked.value)
function unload(event:BeforeUnloadEvent){if(navigationLocked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',unload)
onScopeDispose(()=>{alive=false;generation++;listController?.abort();writeController?.abort();pickerController?.abort();routeController?.abort();dispose();window.removeEventListener('beforeunload',unload)})
</script>
<template>
 <main class="tl-page group-directory">
  <div v-show="mode!=='create'">
   <PageHeader v-if="activeGroup" class="group-detail-header" title="设备组详情" back :back-disabled="locked" @back="breadcrumb(path.length-2)"/>
   <PageHeader v-else title="设备组" :count="data?.total">
    <el-button size="small" :icon="Sort" :disabled="!readable||loading||locked||!!routeError" @click="sortOpen=true">分组排序</el-button>
    <el-button v-if="writable" size="small" type="primary" :icon="Plus" :disabled="locked||loading||createBlocked||!!routeError" @click="open('create')">创建设备组</el-button>
   </PageHeader>
   <el-alert v-if="routeError" :title="routeError" type="error" :closable="false"><el-button link :disabled="loading||locked" @click="syncRoute">重新读取</el-button></el-alert>
   <template v-if="activeGroup">
    <div class="group-heading"><h2>{{activeGroup.name}}</h2><el-button v-if="writable" size="small" class="group-compact-button" :disabled="locked||loading" @click="open('edit',activeGroup)">编辑</el-button></div>
    <p class="group-id">ID：{{activeGroup.id}}</p>
    <el-tabs v-model="tab" class="tl-tabs group-tabs" :before-leave="()=>!locked">
     <el-tab-pane label="概要" name="overview"/>
     <el-tab-pane label="任务" name="tasks"/>
     <el-tab-pane label="设置" name="settings"/>
    </el-tabs>
   </template>
   <div v-show="!activeGroup||tab==='overview'">
    <section v-if="canCreateGroup||data?.total||listError" :class="activeGroup?'group-children':'group-root-cards'">
     <template v-if="activeGroup">
      <h3>子设备组<span v-if="data"> ({{data.total}})</span></h3>
      <el-button v-if="writable&&canCreateGroup" size="small" :disabled="locked||loading||createBlocked" @click="open('create')">创建子组</el-button>
     </template>
     <AsyncState :forbidden="!readable" :loading="loading" :error="listError" @retry="load">
      <template v-if="data">
       <el-empty v-if="!activeGroup&&!data.items.length" description="暂无设备组" :image-size="72"/>
       <div v-if="data.items.length" class="group-grid">
        <button v-for="item in data.items" :key="item.group.id" type="button" class="group-card" :class="{'group-card--colored':item.group.color}" :style="{'--group-color':item.group.color??undefined}" :disabled="locked" @click="enter(item.group)">
         <strong :title="item.group.name">{{item.group.name}}</strong>
         <span class="group-card-meta">
          <span>{{item.deviceCount}} 设备</span>
          <span>{{item.childCount}} 子组</span>
          <span v-if="item.group.type==='DYNAMIC'">动态组</span>
         </span>
        </button>
       </div>
       <CursorPager v-if="data.total>size||page>1" :page="page" :limit="size" :sizes="[20,50,100]" :total="String(data.total)" :has-next="data.hasMore" :loading="loading||locked" @update:page="turn" @update:limit="resize"/>
      </template>
     </AsyncState>
    </section>
   </div>
   <TasksPage v-if="activeGroup&&tab==='tasks'" :key="projectId+':'+activeGroup.id" :group-id="activeGroup.id" @locked="tasksLocked=$event"/>
   <div v-if="activeGroup&&tab==='settings'" class="group-settings">
    <section class="group-description-section">
     <h3>设备组描述</h3>
     <p v-if="activeGroup.description" class="group-description">{{activeGroup.description}}</p>
     <el-button v-if="writable" size="small" class="group-compact-button" aria-label="编辑描述" :disabled="locked||loading" @click="open('edit',activeGroup)">编辑</el-button>
    </section>
    <section class="group-tags-section">
     <h3>标签</h3>
     <el-table size="small" :data="Object.entries(activeGroup.tags).map(([name,value])=>({name,value}))" empty-text="无标签">
      <el-table-column label="标签名称" prop="name"/><el-table-column label="值" prop="value"/>
     </el-table>
     <el-button v-if="writable" size="small" class="group-compact-button" aria-label="编辑标签" :disabled="locked||loading" @click="open('edit',activeGroup,'tags')">编辑</el-button>
    </section>
    <section v-if="writable"><h3>移除设备组</h3><p>仅当设备组中没有设备和子组时，才可以移除。该操作无法恢复。</p><el-button size="small" class="group-compact-button" type="danger" :disabled="locked||loading" @click="open('delete',activeGroup)">移除设备组</el-button></section>
   </div>
   <div v-if="activeGroup&&showAdvancedSettings" class="group-settings-extras">
    <h3>高级设置</h3>
    <el-button v-if="writable" size="small" class="group-compact-button" :disabled="locked||loading" aria-label="移动设备组" @click="open('move',activeGroup)">移动</el-button>
   </div>
   <DeviceGroupMembers v-if="activeGroup" v-show="tab==='overview'||showAdvancedSettings" :key="projectId+':'+activeGroup.id" :group-id="activeGroup.id" :disabled="mode!==''" :advanced="showAdvancedSettings" @locked="membersLocked=$event" @refresh="load" @changed="load"/>
  </div>
  <DeviceGroupSortDialog v-if="sortOpen" v-model="sortOpen" :project="projectId" :writable="writable" :transport="props.transport" @locked="sortLocked=$event" @saved="load"/>
  <PageHeader v-if="mode==='create'" class="group-create-header" :title="activeGroup?'创建子组':'创建设备组'" back :back-disabled="busy||unknown" @back="close"/>
  <component :is="mode==='create'?'section':ElDialog" v-if="mode" :class="{'group-create':mode==='create','group-dialog':mode!=='create','group-dialog--tags':mode==='edit'&&editSection==='tags','group-dialog--remove':mode==='delete'&&!unknown}" v-bind="mode==='create'?{}:{modelValue:true,title:dialogTitle,width:dialogWidth,alignCenter:mode==='delete'&&!unknown,closeOnClickModal:false,closeOnPressEscape:!busy&&!unknown,beforeClose}" @update:model-value="visibleChanged">
   <el-alert v-if="error" :title="error" type="warning" :closable="false"/>
   <div v-if="unknown" class="group-review"><p>原请求键：<code>{{intent?.key}}</code></p><p>仅可读取当前设备组状态核对结果。</p><el-button :disabled="!readable||busy" @click="recover">只读核对原操作</el-button><p role="status">{{facts}}</p><el-button :disabled="!recovered||busy" @click="finishReview">结束本次核对</el-button></div>
   <el-button v-if="conflict&&!unknown&&selected" :disabled="busy||!readable" @click="reread">重新读取当前组资料</el-button>
   <p v-if="mode==='delete'&&!unknown" class="group-remove-question"><el-icon aria-hidden="true"><WarningFilled/></el-icon>确认移除设备组吗？</p>
   <el-form v-if="mode!=='delete'" label-position="top" class="group-form" :disabled="writeBlocked" @submit.prevent="submit">
    <template v-if="mode==='create'||mode==='edit'&&editSection==='information'">
     <el-form-item class="group-form-field" label="组名称"><el-input v-model="form.name" aria-label="组名称" maxlength="128"/></el-form-item>
     <el-form-item class="group-form-field" label="组颜色">
      <template #label>组颜色 <el-tooltip content="用于标记设备组" placement="top"><el-icon class="group-field-help" tabindex="0" aria-label="组颜色用于标记设备组"><QuestionFilled/></el-icon></el-tooltip></template>
      <GroupColorDrawer v-model="form.color" :disabled="writeBlocked"/>
     </el-form-item>
    </template>
    <template v-if="mode==='create'||mode==='move'">
     <el-form-item class="group-form-field" label="所属父组">
      <div v-click-outside="closePicker" class="group-parent-control" @keydown.esc="escapePicker">
       <el-button ref="parentTrigger" class="group-parent-trigger" :class="{'is-open':picker}" aria-label="选择父组" :aria-expanded="picker" :aria-controls="picker?'group-parent-options':undefined" :disabled="writeBlocked" @click="picker?closePicker():openPicker()">{{form.parentId?form.parentName:'不加入父组'}}<el-icon><ArrowDown/></el-icon></el-button>
       <section v-if="picker" id="group-parent-options" class="parent-picker" aria-label="父组选择">
        <button type="button" class="parent-option-label" :class="{'is-selected':!form.parentId}" :disabled="writeBlocked" @click="chooseParent()">不加入父组</button>
        <p v-if="pickerError" role="alert">{{pickerError}}</p><p v-if="pickerLoading">正在读取父组…</p>
        <button v-for="item in pickerData?.items" :key="item.group.id" type="button" class="parent-option-label" :class="{'is-selected':form.parentId===item.group.id}" :disabled="writeBlocked||unavailableParent(item.group)" @click="chooseParent(item.group)">{{item.group.name}}</button>
        <p v-if="pickerData&&!pickerData.items.length">当前层暂无设备组</p>
        <CursorPager v-if="pickerData&&(pickerData.total>20||pickerPage>1)" :page="pickerPage" :limit="20" :total="String(pickerData.total)" :has-next="pickerData.hasMore" :loading="pickerLoading||writeBlocked" :show-sizes="false" @update:page="pickerTurn"/>
       </section>
      </div>
     </el-form-item>
     <el-form-item v-if="mode==='move'" label="顺序"><el-input v-model="form.sortOrder" aria-label="组顺序" inputmode="numeric"/></el-form-item>
    </template>
    <el-form-item v-if="mode==='create'||mode==='edit'&&editSection==='information'" class="group-form-field" label="组描述"><el-input v-model="form.description" aria-label="组描述" type="textarea" :rows="5" maxlength="500" class="group-description-input"/></el-form-item>
    <el-form-item v-if="mode==='create'||mode==='edit'&&editSection==='tags'" label="标签">
     <div class="group-tag-editor"><div v-for="(row,index) in form.tags" :key="index"><el-input v-model="row.key" size="small" :aria-label="`组标签名称${index+1}`" placeholder="标签名称，比如：服务商"/><el-input v-model="row.value" size="small" :aria-label="`组标签值${index+1}`" placeholder="标签值，比如：ThingsLink"/><el-button size="small" type="danger" aria-label="移除标签" @click="form.tags.splice(index,1)">移除</el-button></div><el-button size="small" :disabled="writeBlocked||form.tags.length>=20" @click="form.tags.push({key:'',value:''})">添加标签</el-button></div>
    </el-form-item>
    <template v-if="mode==='create'&&THINGSLINK_EXTRAS_VISIBLE">
     <details class="group-form-field group-order">
      <summary>高级设置</summary>
      <el-form-item label="组类型"><el-select v-model="form.type" aria-label="组类型"><el-option value="STATIC" label="静态组"/><el-option value="DYNAMIC" label="动态组"/></el-select></el-form-item>
      <el-form-item v-if="form.type==='DYNAMIC'" label="动态组条件"><el-input v-model="form.rule" aria-label="动态组白名单条件" type="textarea" :rows="5"/><small>支持设备类型、在线状态和标签条件。</small></el-form-item>
      <el-form-item label="顺序"><el-input v-model="form.sortOrder" aria-label="组顺序" inputmode="numeric"/></el-form-item>
     </details>
    </template>
   </el-form>
   <div v-if="mode==='create'" class="group-create-actions"><el-button type="primary" :disabled="writeBlocked" :loading="busy" @click="submit">创建</el-button><el-button :disabled="busy||unknown" @click="close">取消</el-button></div>
   <template v-if="mode!=='create'&&!unknown" #footer><el-button :size="mode==='delete'?'small':'default'" :disabled="busy" @click="close">取消</el-button><el-button :size="mode==='delete'?'small':'default'" type="primary" :disabled="writeBlocked||!selected" :loading="busy" @click="submit">{{mode==='delete'?'确定':mode==='move'?'确认移动':editSection==='tags'?'提交':'保存'}}</el-button></template>
  </component>
 </main>
</template>

<style scoped>
.group-directory{padding:20px 30px 30px}
.group-root-cards{margin-top:40px}
.group-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:20px 0 0}
.group-card{display:flex;flex-direction:column;align-items:flex-start;gap:0;min-width:0;min-height:95px;padding:20px;border:1px solid var(--tl-border);border-radius:4px;background:var(--tl-surface,#fff);color:#303133;text-align:left;font:inherit;cursor:pointer;transition:box-shadow .16s,color .16s}
.group-card--colored{border-inline-start:4px solid var(--group-color);padding-inline-start:17px}
.group-card strong{max-width:100%;font-size:16px;font-weight:600;line-height:22px;overflow-wrap:anywhere}
.group-card-meta{display:flex;flex-wrap:wrap;gap:12px;margin-top:5px;color:#888;font-size:14px;line-height:22px}
.group-card:enabled:hover,.group-card:focus-visible{color:var(--tl-primary);box-shadow:0 2px 12px #00000014}
.group-card:disabled{cursor:default}
.group-detail-header{min-height:32px}
.group-heading{display:flex;flex-wrap:wrap;align-items:center;gap:18px;margin:22px 0 6px}
.group-heading h2{margin:0;color:#082a2a;font-size:28px;line-height:36px;font-weight:400;overflow-wrap:anywhere}
.group-id{margin:0 0 20px;color:#909399;font-size:13px;overflow-wrap:anywhere}
.group-tabs{margin-bottom:8px}
.group-children h3{margin:0 0 20px;color:#082a2a;font-size:22px;font-weight:400;line-height:32px}
.group-children{margin-bottom:48px}
.group-settings{display:grid;gap:30px}
.group-settings h3,.group-settings-extras h3{margin:0 0 4px;color:#082a2a;font-size:16px;line-height:24px;font-weight:600}
.group-settings p{margin:0 0 8px;color:#909399;line-height:22px}
.group-description-section:not(:has(.group-description)) h3{margin-bottom:10px}
.group-settings .group-description{white-space:pre-wrap;overflow-wrap:anywhere;color:#606266}
.group-settings .el-table{margin-bottom:10px;font-size:12px}
.group-settings :deep(.el-table th.el-table__cell){padding:4px 0;color:var(--tl-title);font-weight:500}
.group-settings :deep(.el-table td.el-table__cell){padding:8px 0}
.group-settings :deep(.el-table__empty-text){min-height:60px;line-height:60px}
.group-settings-extras{margin-top:30px;padding-top:20px;border-top:1px solid var(--tl-border)}
.group-settings-extras h3{margin-bottom:8px}
.group-compact-button.el-button--small{height:28px;padding-block:6px}
.group-create-header{min-height:30px}
.group-field-help{margin-left:6px;color:#b9bec8;vertical-align:-1px;font-size:13px}
.group-form :deep(.el-color-picker__trigger){width:32px;height:32px}
.group-form :deep(.el-color-picker__color){border:0}
.group-form :deep(.el-color-picker__empty){color:#909399}
.group-form-field{max-width:100%}
.group-form .el-select,.group-tag-editor{width:100%}
.group-create .group-form-field{width:min(350px,100%)}
.group-form .el-form-item{margin-bottom:28px}
.group-form :deep(.el-form-item__label){margin-bottom:5px;color:#606266;font-weight:600;line-height:20px}
.group-form small{display:block;color:var(--tl-muted);line-height:20px}
.group-order{margin:0;color:#606266;font-size:13px}
.group-order summary{cursor:pointer}
.group-order .el-form-item{margin:8px 0 0}
.group-parent-control{position:relative;width:100%}
.group-parent-trigger{width:100%;padding-inline:15px;justify-content:flex-start;color:#606266;font-weight:400}
.group-parent-trigger :deep(>span){width:100%;justify-content:space-between}
.group-parent-trigger :deep(.el-icon){margin:0;color:#c0c4cc}
.group-parent-trigger.is-open{border-color:var(--tl-primary);background:#fff}
.group-parent-trigger.is-open :deep(.el-icon){transform:rotate(180deg)}
.group-tag-editor>div{display:flex;gap:8px;margin-bottom:8px}
.group-tag-editor .el-input{min-width:0}
.group-tag-editor :deep(.el-input__wrapper){padding-inline:15px}
.group-create-actions{margin-top:12px}
.group-review code{overflow-wrap:anywhere}
.parent-picker{position:absolute;z-index:2;top:calc(100% + 12px);left:0;width:100%;max-height:min(280px,44vh);overflow:auto;padding:5px 0;border:1px solid var(--tl-border);border-radius:4px;background:#fff;box-shadow:0 2px 12px #00000014}
.parent-picker>p{margin:0;padding:4px 12px;line-height:24px}
.parent-option-label{display:block;width:100%;min-height:34px;padding:6px 20px;border:0;background:none;color:var(--tl-text);text-align:left;line-height:22px;overflow-wrap:anywhere;cursor:pointer}
.parent-option-label:enabled:hover{background:var(--tl-fill)}
.parent-option-label.is-selected{color:var(--tl-primary);font-weight:600}
.parent-option-label:disabled{color:var(--tl-muted);cursor:default}
.group-dialog .group-form{padding-top:18px;padding-bottom:5px}
.group-dialog--tags .group-form{padding-top:28px}
.group-dialog--remove{--el-dialog-padding-primary:15px}
.group-remove-question{display:flex;align-items:center;gap:12px;margin:0;color:#606266}
.group-remove-question .el-icon{color:#e6a23c;font-size:24px}
.group-dialog .group-form .el-form-item{margin-bottom:29px}
.group-description-input :deep(.el-textarea__inner){min-height:117px!important}
@media(max-width:1450px){.group-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:1050px){.group-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){.group-directory{padding:20px 15px}.group-grid{grid-template-columns:1fr}.group-tag-editor>div{flex-wrap:wrap}.group-tag-editor .el-input{flex:1 1 40%}}
</style>
