<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute,useRouter} from 'vue-router'
import {ElMessageBox} from 'element-plus'
import {can,currentProject,projectId} from '@/core/session'
import {api,ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {readScene,readSceneLatest,readSceneVersion} from './scene-editor-api'
import SceneInformationDialog from './SceneInformationDialog.vue'
import SceneTagsDialog from './SceneTagsDialog.vue'
import SceneStatisticsPanel from './SceneStatisticsPanel.vue'
import SceneDebugLogPanel from './SceneDebugLogPanel.vue'
import {createSceneTagsIntent,readSceneTags,writeSceneTags,confirmSceneTagsDefinition,sceneTagsValue,type SceneTagsIntent} from './scene-tags-api'
import {definitionUuid} from './device-task-definition-port'
import {selectedTaskChoices,taskChoices,type TaskChoicePage} from './task-choices'
import TaskChoiceSelect from './TaskChoiceSelect.vue'
import {readTypeDevices} from '../device-types/type-devices-api'
import {useDeviceSceneRunState,type DeviceSceneRunIdentity} from './device-scene-run-state'
import {deviceSceneRunApi} from './device-scene-run-api'
import {cas} from './models'
import {writePreprocessJson,type ExactJson} from './preprocess-exact-json'
import {sceneCloudTransformConfig,scenePropertyTransformConfig,sceneCloudOperationText,scenePropertyPresentation,sceneTaskConfig,sceneTaskPresentation,sceneDelayConfig,sceneDelayPresentation,sceneExecutionPolicy} from './scene-editor-draft'
import {getTask} from './api'

const route=useRoute(),router=useRouter(),id=computed(()=>String(route.params.id||''))
const tab=computed({get:()=>route.query.tab==='settings'?'settings':route.query.tab==='stats'?'stats':route.query.tab==='logs'?'logs':'scene',set:(value:string)=>{if(!blocked.value)void router.replace({query:{...route.query,tab:value}})}})
const allowed=computed(()=>can('rule:manage')&&!!projectId.value&&definitionUuid(id.value))
const writable=computed(()=>allowed.value&&currentProject.value?.status==='ACTIVE')
const names=ref(new Map<string,string>()),taskNames=ref(new Map<string,string>()),writeError=ref(''),writing=ref(false)
type PendingStatus={project:string;id:string;before:number;status:'ACTIVE'|'PAUSED';versionId:string}
const pending=ref<PendingStatus>(),runIdentity=ref<DeviceSceneRunIdentity|null>(null)
const information=ref(false),informationBusy=ref(false),informationPending=ref(false),informationError=ref('')
type InformationIntent={project:string;id:string;body:Schema<'WriteSceneInformationRequest'>;expected:number;status:string;activeVersionId:string|null|undefined}
const informationIntent=ref<InformationIntent>()
const tagsOpen=ref(false),tagsBusy=ref(false),tagsPending=ref(false),tagsError=ref(''),tagsBase=ref<Schema<'RuleSceneView'>>()
const tagsIntent=ref<SceneTagsIntent>()
const deleteConfirming=ref(false),deleteBusy=ref(false),deleteError=ref('')
const logsBusy=ref(false),logsLocked=ref(false),logsConfirming=ref(false)
type DeleteIntent={project:string;id:string;version:number}
const deleteIntent=ref<DeleteIntent>()
const runContext=ref(''),contextCandidates=ref(new Set<string>())
const resource=useResource(async signal=>{
 const project=projectId.value,scene=id.value,definition=await readScene(project,scene,signal)
 const version=definition.activeVersionId?await readSceneVersion(project,scene,definition.activeVersionId,signal):await readSceneLatest(project,scene,signal)
 return {definition,version}
})
const rows=computed(()=>{
 const value:unknown=resource.data.value?.version.actions
 return Array.isArray(value)?value.map((row:unknown,index:number)=>{
  const node=row as {nodeType?:string;config?:Record<string,unknown>},config=node.config||{}
  const device=typeof config.deviceId==='string'?config.deviceId:resource.data.value?.version.deviceScope?.kind==='DEVICE'?resource.data.value.version.deviceScope.referenceId:undefined
  const transform=sceneCloudTransformConfig(node as Schema<'SceneActionRequest'>)||scenePropertyTransformConfig(node as Schema<'SceneActionRequest'>),task=sceneTaskConfig(node as Schema<'SceneActionRequest'>),delay=sceneDelayConfig(node as Schema<'SceneActionRequest'>)
  const appearance=transform?scenePropertyPresentation[transform.purpose]:delay?sceneDelayPresentation:task?sceneTaskPresentation:scenePropertyPresentation[node.nodeType==='scene-device-cloud-update-action'?'cloud-update':'downlink']
  return {index,references:transform?.operations.flatMap(op=>op.op==='set_ref'?[op.refDeviceId]:[])??[],operations:transform?.operations.map(row=>sceneCloudOperationText(row,displayProperty,id=>names.value.get(id)||id))??[],delay:delay?`延迟 ${delay.durationSeconds%60===0?delay.durationSeconds/60+' 分钟':delay.durationSeconds+' 秒'}`:'',type:node.nodeType||'',appearance,device:delay?'':device||'',task:task?.taskId||'',properties:config.properties&&typeof config.properties==='object'?Object.entries(config.properties):[]}
 }):[]
})
const labels:Record<string,string>={'scene-device-property-set-action':'下发属性','scene-device-property-transform-action':'下发属性','scene-device-cloud-update-action':'更新属性','scene-device-cloud-transform-action':'更新属性','scene-task-run-action':'执行任务','scene-delay-action':'延迟','device-property-set-action':'下发属性','device-command-action':'命令下发','notification-action':'发送通知','email-action':'邮件通知','webhook-action':'HTTP 请求','alarm-create-action':'创建告警','alarm-clear-action':'清除告警'}
const executionPolicy=computed(()=>sceneExecutionPolicy((resource.data.value?.version as {executionPolicy?:unknown}|undefined)?.executionPolicy))
function displayProperty(value:unknown){if(typeof value==='string')return value;try{return writePreprocessJson(value as ExactJson,true)}catch{return writePreprocessJson(value as ExactJson)}}
const baseBlocked=computed(()=>allowed.value&&!(resource.error.value instanceof ApiError&&[401,403,404].includes(resource.error.value.status))&&(writing.value||!!pending.value||run.blocked.value||informationBusy.value||informationPending.value||tagsBusy.value||tagsPending.value||deleteConfirming.value||deleteBusy.value||!!deleteIntent.value))
const blocked=computed(()=>baseBlocked.value||allowed.value&&!(resource.error.value instanceof ApiError&&[401,403,404].includes(resource.error.value.status))&&(logsBusy.value||logsLocked.value||logsConfirming.value))
const settingsTags=computed(()=>{try{return sceneTagsValue(resource.data.value?.definition.tags)}catch{return undefined}})
const tagRows=computed(()=>Object.entries(settingsTags.value||{}).map(([key,value])=>({key,value})))
const run=useDeviceSceneRunState(runIdentity,deviceSceneRunApi,async()=>{await resource.reload()},cause=>{resource.clear();resource.error.value=cause})
const runNotice=computed(()=>run.receipt.value?.status==='DISPATCHED'?'已触发一次执行':run.notice.value)
const needsRunContext=computed(()=>resource.data.value?.version.deviceScope?.kind==='DEVICE_TYPE'||resource.data.value?.version.deviceScope?.kind==='LEGACY_PROJECT'&&!definitionUuid(rows.value[0]?.device))
const contextLoader=computed(()=>{
 const project=projectId.value,scene=id.value,scope=resource.data.value?.version.deviceScope,epoch=identityEpoch()
 return async(cursor:string|undefined,signal:AbortSignal):Promise<TaskChoicePage>=>{
  let result:TaskChoicePage
  if(scope?.kind==='DEVICE_TYPE'&&definitionUuid(scope.referenceId)){
   const page=cursor===undefined?1:/^[1-9]\d{0,3}$/.test(cursor)?Number(cursor):0
   if(!page)throw new Error('设备候选页无效')
   const value=await readTypeDevices(project,scope.referenceId,{page,limit:24},signal)
   if(typeof value.total!=='string')throw new Error('类型设备候选总数不完整')
   const hasMore=BigInt(value.total)>BigInt(page*24)
   result={options:value.items.map(row=>({id:row.id!,label:row.name!})),hasMore,nextCursor:hasMore?String(page+1):undefined}
  }else result=await taskChoices(project,'devices',cursor,signal)
  if(signal.aborted||epoch!==identityEpoch()||project!==projectId.value||scene!==id.value||!allowed.value)throw new IdentityChanged()
  contextCandidates.value=new Set([...contextCandidates.value,...result.options.map(row=>row.id)]);return result
 }
})
function chooseContext(ids:string[]){if(blocked.value)return;if(ids.length>1||ids[0]&&!contextCandidates.value.has(ids[0])){writeError.value='请选择当前场景范围内的设备';return}runContext.value=ids[0]||''}
function updateRunIdentity(){
 if(run.locked.value||run.busy.value)return
 runIdentity.value=null;const value=resource.data.value;if(!value)return
 const scope=value.version.deviceScope,device=scope?.kind==='DEVICE'?scope.referenceId:needsRunContext.value?runContext.value:rows.value[0]?.device
 if(definitionUuid(device)&&definitionUuid(value.definition.id)&&definitionUuid(value.definition.activeVersionId))runIdentity.value={sceneId:value.definition.id,deviceId:device,versionId:value.definition.activeVersionId,definitionVersion:cas(value.definition.version),status:value.definition.status||''}
}
watch(runContext,updateRunIdentity)
watch(()=>resource.data.value,async(value,_previous,onCleanup)=>{
 const controller=new AbortController();onCleanup(()=>controller.abort())
 updateRunIdentity()
 if(!value){names.value=new Map();taskNames.value=new Map();return}
 const ids=[...new Set(rows.value.flatMap(row=>[row.device,...row.references]).filter(definitionUuid))]
 const epoch=identityEpoch(),key=id.value,project=projectId.value
 const tasks=[...new Set(rows.value.map(row=>row.task).filter(definitionUuid))].slice(0,20)
 const taskLabels=new Map<string,string>();let offset=0
 await Promise.allSettled([
  (async()=>{const choices=await selectedTaskChoices(project,'devices',ids,controller.signal);if(!controller.signal.aborted&&epoch===identityEpoch()&&key===id.value&&project===projectId.value&&allowed.value)names.value=new Map(choices.map(row=>[row.id,row.label]))})(),
  ...Array.from({length:Math.min(4,tasks.length)},async()=>{while(!controller.signal.aborted&&offset<tasks.length){const task=tasks[offset++]!;try{const result=await getTask(project,task,controller.signal);if(result.id===task&&typeof result.name==='string'&&result.name.trim())taskLabels.set(task,result.name)}catch{/* 已删除或失去读取资格的任务仍保留原标识。 */}}})
 ])
 if(!controller.signal.aborted&&epoch===identityEpoch()&&key===id.value&&project===projectId.value&&allowed.value)taskNames.value=taskLabels
})
function resetInformation(){information.value=false;informationBusy.value=false;informationPending.value=false;informationIntent.value=undefined;informationError.value=''}
function clearTags(){tagsOpen.value=false;tagsBusy.value=false;tagsPending.value=false;tagsError.value='';tagsBase.value=undefined;tagsIntent.value=undefined}
function resetSettings(){clearTags();if(deleteConfirming.value)ElMessageBox.close();deleteConfirming.value=false;deleteBusy.value=false;deleteIntent.value=undefined;deleteError.value=''}
function hideSettings(){tagsOpen.value=false;tagsBase.value=undefined;if(tagsIntent.value)tagsPending.value=true;if(deleteConfirming.value)ElMessageBox.close();deleteConfirming.value=false}
function reset(){resource.clear();names.value=new Map();taskNames.value=new Map();pending.value=undefined;writeError.value='';writing.value=false;runIdentity.value=null;runContext.value='';contextCandidates.value=new Set();resetInformation();resetSettings();if(allowed.value)void resource.reload()}
watch([projectId,id],reset,{immediate:true})
watch(allowed,value=>{resource.clear();names.value=new Map();taskNames.value=new Map();if(!value){information.value=false;if(informationBusy.value||informationIntent.value)informationPending.value=true;hideSettings()}if(!run.locked.value&&!run.busy.value)runIdentity.value=null;if(value)void resource.reload()})
const dispose=onIdentityChange(()=>{resource.clear();pending.value=undefined;names.value=new Map();taskNames.value=new Map();writeError.value='';writing.value=false;runIdentity.value=null;runContext.value='';contextCandidates.value=new Set();resetInformation();resetSettings()})
onScopeDispose(dispose)
function back(){if(!blocked.value)void router.push('/rules/scenes')}
function edit(){if(writable.value&&!blocked.value)void router.push(`/rules/scenes/${id.value}/edit`)}
function editInformation(){if(writable.value&&!blocked.value){informationError.value='';information.value=true}}
function matchesInformation(value:Schema<'RuleSceneView'>,intent:InformationIntent){return value.id===intent.id&&value.version===intent.expected&&value.name===intent.body.name&&(value.description||'')===(intent.body.description||'')&&value.status===intent.status&&(value.activeVersionId??null)===(intent.activeVersionId??null)}
async function saveInformation(body:Schema<'WriteSceneInformationRequest'>){
 const current=resource.data.value?.definition;if(!information.value||!current||!writable.value||blocked.value)return
 if(body.expectedVersion!==current.version){informationError.value='场景已变化，请取消后重新读取';return}
 const intent:InformationIntent={project:projectId.value,id:id.value,body,expected:cas(current.version)+(body.name!==current.name||(body.description||'')!==(current.description||'')?1:0),status:current.status||'',activeVersionId:current.activeVersionId},epoch=identityEpoch()
 informationIntent.value=intent;informationBusy.value=true;informationError.value=''
 try{
  const result=await api<Schema<'RuleSceneView'>>(`/api/v1/projects/${intent.project}/scenes/${intent.id}/information`,{method:'put',body})
  if(epoch!==identityEpoch()||intent.project!==projectId.value||intent.id!==id.value)return
  if(!matchesInformation(result,intent))throw new Error('场景信息回执与原意图尚未一致，请只读核对')
  informationIntent.value=undefined;informationPending.value=false;information.value=false
  if(allowed.value)await resource.reload()
 }catch(cause){if(epoch===identityEpoch()&&intent.project===projectId.value&&intent.id===id.value){
  informationError.value=errorMessage(cause)
  const rejected=cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409].includes(cause.status)
  informationPending.value=!rejected;if(rejected)informationIntent.value=undefined
  if(rejected&&cause instanceof ApiError&&[401,403,404].includes(cause.status)){information.value=false;resource.clear();resource.error.value=cause}
 }}finally{if(epoch===identityEpoch())informationBusy.value=false}
}
async function verifyInformation(){
 const intent=informationIntent.value;if(!intent||!informationPending.value||informationBusy.value||!allowed.value)return
 informationBusy.value=true;const epoch=identityEpoch()
 try{
  const value=await readScene(intent.project,intent.id)
  if(epoch!==identityEpoch()||intent.project!==projectId.value||intent.id!==id.value)return
  if(!matchesInformation(value,intent))throw new Error('当前信息尚未与保存意图一致，请继续只读核对；未重复保存')
  informationIntent.value=undefined;informationPending.value=false;informationError.value='';information.value=false;await resource.reload()
 }catch(cause){if(epoch===identityEpoch()){informationError.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){information.value=false;resource.clear();resource.error.value=cause;names.value=new Map()}}}finally{if(epoch===identityEpoch())informationBusy.value=false}
}
async function changeStatus(enabled:boolean){
 const value=resource.data.value;if(!value||!writable.value||blocked.value)return
 writing.value=true;writeError.value=''
 const p:PendingStatus={project:projectId.value,id:id.value,before:cas(value.definition.version),status:enabled?'ACTIVE':'PAUSED',versionId:value.version.id!},epoch=identityEpoch()
 try{
  if(enabled)await api<Schema<'RuleSceneView'>>(`/api/v1/projects/${p.project}/scenes/${p.id}/versions/${p.versionId}/activate`,{method:'post',query:{expectedVersion:p.before}})
  else await api<Schema<'RuleSceneView'>>(`/api/v1/projects/${p.project}/scenes/${p.id}/pause`,{method:'post',query:{expectedVersion:p.before}})
  if(epoch===identityEpoch()&&p.id===id.value&&p.project===projectId.value&&allowed.value)await resource.reload()
 }catch(cause){if(epoch===identityEpoch()&&p.id===id.value&&p.project===projectId.value){writeError.value=errorMessage(cause);if(!(cause instanceof ApiError)||cause.outcomeUnknown||![400,401,403,404,409].includes(cause.status))pending.value=p;else if([401,403,404].includes(cause.status)){resource.clear();resource.error.value=cause}}}
 finally{if(epoch===identityEpoch())writing.value=false}
}
async function verifyStatus(){
 const p=pending.value;if(!p||!allowed.value||writing.value)return
 writing.value=true;const epoch=identityEpoch()
 try{const value=await readScene(p.project,p.id);if(epoch!==identityEpoch()||p.project!==projectId.value||p.id!==id.value)return
  if(value.version!==p.before+1||value.status!==p.status||value.activeVersionId!==p.versionId)throw new Error('该次状态修改仍待核对，请勿重复操作')
  pending.value=undefined;writeError.value='';await resource.reload()
 }catch(cause){if(epoch===identityEpoch()){writeError.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){resource.clear();resource.error.value=cause;names.value=new Map()}}}finally{if(epoch===identityEpoch())writing.value=false}
}
async function execute(){if(blocked.value||!run.canRun.value)return;run.open();await run.confirm()}
function openTags(){if(!writable.value||blocked.value||!resource.data.value||!settingsTags.value)return;tagsError.value='';tagsBase.value=JSON.parse(JSON.stringify(resource.data.value.definition));tagsOpen.value=true}
function closeTags(){if(!tagsBusy.value&&!tagsPending.value)clearTags()}
async function saveTags(wanted:Readonly<Record<string,string>>){
 if(!tagsOpen.value||!tagsBase.value||!writable.value||blocked.value)return
 let intent:SceneTagsIntent
 try{if(resource.data.value?.definition.version!==tagsBase.value.version)throw new Error('场景已变化，请取消后重新读取');intent=createSceneTagsIntent(projectId.value,tagsBase.value,wanted)}catch(cause){tagsError.value=errorMessage(cause);return}
 tagsIntent.value=intent;tagsBusy.value=true;tagsError.value='';const epoch=identityEpoch();let accepted=false
 const current=()=>epoch===identityEpoch()&&intent.project===projectId.value&&intent.id===id.value&&allowed.value
 try{
  await writeSceneTags(intent);accepted=true;if(!current())return;await resource.reload();if(!current())return
  if(resource.error.value)throw resource.error.value;if(!resource.data.value)throw new Error('场景标签仍待核对')
  confirmSceneTagsDefinition(intent,resource.data.value.definition);clearTags()
 }catch(cause){if(current()){
  const known=!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,422].includes(cause.status)
  tagsPending.value=!known;if(known)tagsIntent.value=undefined;tagsError.value=errorMessage(cause)
  if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){hideSettings();resource.clear();resource.error.value=cause}
 }}finally{if(epoch===identityEpoch())tagsBusy.value=false}
}
async function verifyTags(){
 const intent=tagsIntent.value;if(!intent||!tagsPending.value||tagsBusy.value||!allowed.value||intent.project!==projectId.value||intent.id!==id.value)return
 tagsBusy.value=true;const epoch=identityEpoch(),current=()=>epoch===identityEpoch()&&intent.project===projectId.value&&intent.id===id.value&&allowed.value
 try{
  await readSceneTags(intent);if(!current())return;await resource.reload();if(!current())return
  if(resource.error.value)throw resource.error.value;if(!resource.data.value)throw new Error('场景标签仍待核对')
  confirmSceneTagsDefinition(intent,resource.data.value.definition);clearTags()
 }catch(cause){if(current()){tagsError.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){hideSettings();resource.clear();resource.error.value=cause}}}finally{if(epoch===identityEpoch())tagsBusy.value=false}
}
async function removeScene(){
 const definition=resource.data.value?.definition;if(!definition||!writable.value||blocked.value)return
 const intent:DeleteIntent={project:projectId.value,id:id.value,version:cas(definition.version)},epoch=identityEpoch()
 deleteConfirming.value=true;deleteError.value=''
 try{await ElMessageBox.confirm('确定要删除此场景吗？删除后不可恢复，请谨慎操作。','提示',{confirmButtonText:'确定',cancelButtonText:'取消',type:'warning'})}catch{return}finally{if(epoch===identityEpoch())deleteConfirming.value=false}
 if(epoch!==identityEpoch()||intent.project!==projectId.value||intent.id!==id.value||!writable.value)return
 if(resource.data.value?.definition.version!==intent.version){deleteError.value='场景已变化，请重新读取';return}
 deleteIntent.value=intent;deleteBusy.value=true
 try{
  await api<void>(`/api/v1/projects/${intent.project}/scenes/${intent.id}`,{method:'delete',query:{expectedVersion:intent.version}})
  if(epoch!==identityEpoch()||intent.project!==projectId.value||intent.id!==id.value)return
  resetSettings();resource.clear();await router.push('/rules/scenes')
 }catch(cause){if(epoch===identityEpoch()&&intent.project===projectId.value&&intent.id===id.value){
  const known=cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,422].includes(cause.status)
  if(known)deleteIntent.value=undefined;deleteError.value=errorMessage(cause)
  if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){resource.clear();resource.error.value=cause}
 }}finally{if(epoch===identityEpoch())deleteBusy.value=false}
}
async function verifyRemoval(){
 const intent=deleteIntent.value;if(!intent||deleteBusy.value||!allowed.value||intent.project!==projectId.value||intent.id!==id.value)return
 const epoch=identityEpoch();deleteBusy.value=true
 try{await readScene(intent.project,intent.id);if(epoch===identityEpoch()&&intent.project===projectId.value&&intent.id===id.value)deleteError.value='当前场景仍存在，删除结果尚待核对；未重复提交'}
 catch(cause){if(epoch===identityEpoch()&&intent.project===projectId.value&&intent.id===id.value){
  if(cause instanceof ApiError&&cause.status===404){resetSettings();resource.clear();await router.push('/rules/scenes')}
  else{deleteError.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403].includes(cause.status)){resource.clear();resource.error.value=cause}}
 }}finally{if(epoch===identityEpoch())deleteBusy.value=false}
}
onBeforeRouteLeave(()=>!blocked.value);onBeforeRouteUpdate(()=>!blocked.value)
function beforeUnload(event:BeforeUnloadEvent){if(blocked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload);onScopeDispose(()=>window.removeEventListener('beforeunload',beforeUnload))
</script>

<template><main class="tl-page scene-detail-page">
 <PageHeader title="场景详情" back :back-disabled="blocked" @back="back"/>
 <AsyncState :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" @retry="resource.reload">
  <template v-if="resource.data.value">
   <h2 class="scene-detail-name">{{resource.data.value.definition.name}}<el-button size="small" aria-label="编辑场景信息" :disabled="!writable||blocked" @click="editInformation">编辑</el-button></h2>
   <p class="scene-detail-id">ID：{{resource.data.value.definition.id}}</p>
   <el-alert v-if="writeError" :title="writeError" type="warning" :closable="false"><el-button v-if="pending" :disabled="writing" @click="verifyStatus">重新读取核对</el-button></el-alert>
   <el-alert v-if="informationPending&&!information" :title="informationError||'场景信息保存结果待核对'" type="warning" :closable="false"><el-button :disabled="informationBusy" @click="verifyInformation">重新读取核对</el-button></el-alert>
   <el-alert v-if="tagsPending&&!tagsOpen" :title="tagsError||'场景标签保存结果待核对'" type="warning" :closable="false"><el-button :disabled="tagsBusy" @click="verifyTags">重新读取标签核对</el-button></el-alert>
   <el-alert v-if="deleteError" :title="deleteError" type="warning" :closable="false"><el-button v-if="deleteIntent" :disabled="deleteBusy" @click="verifyRemoval">重新读取删除状态</el-button></el-alert>
   <el-alert v-if="run.error.value" :title="run.error.value" type="warning" :closable="false"><el-button v-if="run.locked.value" :disabled="run.busy.value" @click="run.verify">重新读取核对</el-button></el-alert>
   <p v-if="runNotice" role="status">{{runNotice}}</p>
   <el-tabs v-model="tab" class="tl-tabs"><el-tab-pane label="场景" name="scene"/><el-tab-pane label="日志" name="logs"/><el-tab-pane label="统计" name="stats"/><el-tab-pane label="设置" name="settings"/></el-tabs>
   <div v-if="tab==='scene'" class="scene-detail-grid"><div>
    <section class="scene-summary-card"><header>基本信息<el-button size="small" :disabled="!writable||blocked" @click="edit">编辑</el-button></header><dl><div><dt>创建时间</dt><dd>{{formatTime(resource.data.value.definition.createdAt)}}</dd></div><div><dt>修改时间</dt><dd>{{formatTime(resource.data.value.definition.updatedAt)}}</dd></div><template v-if="executionPolicy"><div><dt>并发优先级</dt><dd>{{executionPolicy.concurrencyPolicy==='terminate_prev'?'终止前次':'放弃本次'}}</dd></div><div><dt>动作失败策略</dt><dd>{{executionPolicy.actionFailPolicy==='stop'?'立即终止':'继续执行'}}</dd></div></template></dl></section>
    <section class="scene-summary-card"><header>动作列表<el-button size="small" :disabled="!writable||blocked" @click="edit">编辑</el-button></header><div class="scene-actions-list">
     <article v-for="row in rows" :key="row.index" class="scene-action-row"><span class="scene-action-icon" :style="{background:row.appearance.background,color:row.appearance.color}"><ReferenceIcon :glyph="row.appearance.glyph"/></span><div><strong>{{labels[row.type]||row.type}}</strong><p v-if="row.delay">{{row.delay}}</p><p v-if="row.device">设备：{{names.get(row.device)||row.device}}</p><p v-if="row.task">任务：{{taskNames.get(row.task)||row.task}}</p><p v-for="(operation,index) in row.operations" :key="`op-${index}`">{{operation}}</p><p v-for="[key,value] in row.properties" :key="key">{{key}}：{{displayProperty(value)}}</p></div></article>
    </div></section>
   </div><aside>
    <section class="scene-summary-card"><header>执行场景</header><div class="scene-card-body"><span>手动运行</span><el-form-item v-if="needsRunContext" label="选择设备"><TaskChoiceSelect :model-value="runContext?[runContext]:[]" :loader="contextLoader" :multiple="false" :maximum="1" :disabled="blocked||!writable" placeholder="请选择设备" @update:model-value="chooseContext"/></el-form-item><el-button type="primary" size="small" aria-label="运行场景" :disabled="!run.canRun.value||blocked" :loading="run.writing.value" @click="execute"><ReferenceIcon glyph="󰐊"/>运行</el-button></div></section>
    <section class="scene-summary-card"><header>场景状态</header><div class="scene-card-body"><span>启用场景</span><el-switch :model-value="resource.data.value.definition.status==='ACTIVE'" aria-label="启用场景" :disabled="!writable||blocked" :loading="writing" @change="(value:string|number|boolean)=>changeStatus(value===true)"/></div></section>
   </aside></div>
   <SceneStatisticsPanel v-else-if="tab==='stats'" :id="id" :name="resource.data.value.definition.name" @denied="cause=>{resource.clear();resource.error.value=cause}"/>
   <div v-else-if="tab==='settings'" class="scene-settings">
    <section><h3>场景描述</h3><p class="scene-description">{{resource.data.value.definition.description||''}}</p><el-button size="small" aria-label="编辑场景描述" :disabled="!writable||blocked" @click="editInformation">编辑</el-button></section>
    <section><h3>标签</h3><el-table v-if="settingsTags" :data="tagRows" size="small" empty-text="无标签"><el-table-column prop="key" label="标签名称"/><el-table-column prop="value" label="值"/></el-table><el-alert v-else title="场景标签回读不完整，请重新读取" type="warning" :closable="false"/><el-button size="small" aria-label="编辑场景标签" :disabled="!writable||blocked||!settingsTags" @click="openTags">编辑</el-button></section>
    <section><h3>删除场景</h3><p class="scene-settings-tips">删除后不可恢复，请谨慎操作。</p><el-button type="danger" size="small" aria-label="删除场景" :disabled="!writable||blocked" :loading="deleteBusy" @click="removeScene">删除场景</el-button></section>
   </div>
  </template>
 </AsyncState>
 <SceneDebugLogPanel v-if="definitionUuid(id)" :id="id" :inactive="!allowed||tab!=='logs'||resource.loading.value||!resource.data.value||!!resource.error.value" :disabled="baseBlocked" @busy="logsBusy=$event" @locked="logsLocked=$event" @confirming="logsConfirming=$event" @denied="cause=>{resource.clear();resource.error.value=cause}"/>
 <SceneInformationDialog v-model="information" :scene="resource.data.value?.definition" :busy="informationBusy" :pending="informationPending" :error="informationError" @save="saveInformation" @verify="verifyInformation"/>
 <SceneTagsDialog :model-value="tagsOpen" :tags="tagsBase?.tags||{}" :busy="tagsBusy" :pending="tagsPending" :error="tagsError" @update:model-value="value=>{if(!value)closeTags()}" @save="saveTags" @verify="verifyTags"/>
</main></template>

<style scoped>
.scene-detail-name{display:flex;align-items:center;gap:10px;margin:0;padding:10px 0 0;font-size:26px;font-weight:500;line-height:34px;color:#002822}.scene-detail-id{padding:10px 0 0;margin:0 0 20px;color:#999;font-size:14px;line-height:20px}.scene-detail-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:10px}.scene-summary-card{border:1px solid #ebeef5;border-radius:4px;background:#fff;margin-top:10px;overflow:hidden}.scene-summary-card>header{padding:12px 20px;border-bottom:1px solid #ebeef5;display:flex;justify-content:space-between;align-items:center;color:#2f354d;font-size:15px;font-weight:600;min-height:28px}.scene-summary-card dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:20px;margin:0}.scene-summary-card dl>div{line-height:20px;padding:0 0 20px;font-size:15px}.scene-summary-card dt{font-size:14px;line-height:18px;font-weight:600;color:#606266}.scene-summary-card dd{margin:3px 0 0;color:#002822;overflow-wrap:anywhere}.scene-actions-list{margin:20px;border:1px solid #f0f0f0;border-radius:4px;overflow:hidden}.scene-action-row{display:flex;align-items:center;gap:16px;border-bottom:1px solid #f0f0f0;min-height:60px;padding:10px 16px}.scene-action-row:last-child{border-bottom:0}.scene-action-icon{display:flex;align-items:center;justify-content:center;width:30px;height:30px;flex-shrink:0;background:#e3f2fd;color:#1e88e5;border-radius:5px;font-size:20px}.scene-action-row strong{font-size:14px;color:#333;font-weight:500;line-height:1.4}.scene-action-row p{margin:4px 0 0;font-size:13px;color:#888;overflow-wrap:anywhere}.scene-card-body{padding:20px;font-size:14px;color:#606266}.scene-card-body>span{display:block;font-weight:600;line-height:18px;margin-bottom:6px}.scene-description{padding:20px;margin:0;font-size:14px;color:#606266;white-space:pre-wrap;overflow-wrap:anywhere}.scene-detail-page>.el-alert{margin:10px 0}@media(max-width:991px){.scene-detail-grid{grid-template-columns:1fr}}
.scene-settings>section{margin-bottom:20px}.scene-settings h3{margin:10px 0 0;font-size:16px;line-height:22px;font-weight:700;color:#002822}.scene-settings .scene-description{padding:0;margin:10px 0 0;font-size:14px;line-height:20px;color:#606266}.scene-settings section>.el-button{margin-top:10px;height:28px;padding:7px 15px;font-size:12px;border-radius:3px}.scene-settings-tips{margin:5px 0 0;font-size:14px;line-height:20px;color:#909399}.scene-settings :deep(.el-table){font-size:12px}.scene-settings :deep(.el-table th.el-table__cell),.scene-settings :deep(.el-table td.el-table__cell){padding:6px 0}.scene-settings :deep(.el-table .cell){line-height:20px;padding:0 10px;font-size:12px}.scene-settings :deep(.el-table thead){color:#909399;font-weight:500}.scene-settings :deep(.el-table__empty-text){font-size:12px;line-height:60px;color:#909399}
</style>
