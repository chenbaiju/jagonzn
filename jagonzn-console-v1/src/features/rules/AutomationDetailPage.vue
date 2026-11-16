<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute,useRouter} from 'vue-router'
import {ElMessageBox} from 'element-plus'
import type {Schema} from '@/core/contracts'
import {can,currentProject,projectId} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import AutomationInformationDialog from './AutomationInformationDialog.vue'
import AutomationDebugLogPanel from './AutomationDebugLogPanel.vue'
import AutomationStatisticsPanel from './AutomationStatisticsPanel.vue'
import AutomationTagsDialog from './AutomationTagsDialog.vue'
import {automationMetadataSnapshot,automationInformationIntent,automationTagsIntent,writeAutomationMetadata,readAutomationMetadata,deleteAutomation,type AutomationMetadataIntent} from './automation-metadata-api'
import {readAutomation,readAutomationVersion,readAutomationLatest,reviseAutomation,activateAutomation,pauseAutomation} from './automation-editor-api'
import {getTask,listScenes} from './api'
import {automationTagsValue,automationPropertyTrigger,automationTriggerRow,automationPropertySourceSelection,automationSourceLabels,automationReportTriggers,automationReportTriggerConfig,automationReportTriggerValue,cloneAutomationValue,automationTargetAction,automationSceneRun,automationSceneSummary,automationTaskRun,automationTaskSummary,automationCloudOperationText,automationActionStyle,automationTriggerPresentation,automationDeviceCondition,automationDeviceConditionAction,automationConditionPresentation,automationAlarmCondition,automationAlarmConditionAction,automationAlarmConditionPresentation,automationCurrentConditionText,automationTimeCondition,automationTimeConditionAction,automationTimeConditionPresentation,automationTimeConditionSummary,automationOperatorLabels,automationDurationLabel,automationObject,automationSignature,automationDraftBody,loadedAutomationDraft,assertAutomationContent,type AutomationBody,type AutomationReportTrigger} from './automation-editor-draft'
import {automationMixedConfig,automationMixedValue,automationMixedPresentation,automationMixedSummary,automationMixedDeviceIds,type AutomationMixedTrigger} from './automation-mixed-triggers'
import {selectedTaskChoices} from './task-choices'
import {useAutomationAlarmRuleNames} from './automation-alarm-rule-choices'
import {definitionUuid} from './device-task-definition-port'
import {cas} from './models'
import {ExactDecimal,writePreprocessJson} from './preprocess-exact-json'
const route=useRoute(),router=useRouter(),id=computed(()=>String(route.params.id||''))
const allowed=computed(()=>can('rule:manage')&&!!projectId.value&&definitionUuid(id.value)),writable=computed(()=>allowed.value&&currentProject.value?.status==='ACTIVE')
const names=ref(new Map<string,string>()),sceneNames=ref(new Map<string,string>()),taskNames=ref(new Map<string,string>()),busy=ref(false),error=ref('')
const metadataOpen=ref<'information'|'tags'>(),metadataBefore=ref<Schema<'AutomationView'>>(),metadataIntent=ref<AutomationMetadataIntent>(),metadataBusy=ref(false),metadataError=ref('')
const deleteConfirming=ref(false),deleteBusy=ref(false),deleteError=ref(''),deleteIntent=ref<{project:string;id:string;epoch:number;version:number}>()
const metadataPending=computed(()=>!!metadataIntent.value&&!metadataBusy.value)
let live=true
type StateIntent={mode:'state';project:string;id:string;before:number;enabled:boolean;versionId:string;body:AutomationBody}
type RevisionIntent={mode:'revision';project:string;id:string;before:number;enabled:boolean;expectedFinalCAS:number;expectedStatus:'DRAFT'|'ACTIVE'|'PAUSED';previousVersionId:string;previousActiveVersionId:string|null;selectedVersionId?:string;body:AutomationBody}
type AutomationOperationIntent=StateIntent|RevisionIntent
const logsBusy=ref(false),logsLocked=ref(false),logsConfirming=ref(false)
const intent=ref<AutomationOperationIntent>(),operationBlocked=computed(()=>busy.value||!!intent.value||metadataBusy.value||!!metadataIntent.value||deleteConfirming.value||deleteBusy.value||!!deleteIntent.value),blocked=computed(()=>allowed.value&&(operationBlocked.value||!!metadataOpen.value||logsBusy.value||logsLocked.value||logsConfirming.value))
const tab=computed({get:()=>route.query.tab==='settings'?'settings':route.query.tab==='logs'?'logs':route.query.tab==='stats'?'stats':'automation',set:(value:string)=>{if(!blocked.value)void router.replace({query:{...route.query,tab:['logs','stats','settings'].includes(value)?value:undefined}})}})
const resource=useResource(async signal=>{
 const project=projectId.value,key=id.value,first=await readAutomation(project,key,signal)
 if(first.status!=='DRAFT'&&!definitionUuid(first.activeVersionId))throw new Error('自动化当前发布版本无法读取，不能改用未发布候选。')
 const version=first.status==='DRAFT'?await readAutomationLatest(project,key,signal):await readAutomationVersion(project,key,first.activeVersionId!,signal),last=await readAutomation(project,key,signal)
 if(first.version!==last.version||first.status!==last.status||first.activeVersionId!==last.activeVersionId||last.status!=='DRAFT'&&last.activeVersionId!==version.id)throw new Error('自动化正在变化，请重新读取。')
 return {definition:last,version}
})
const alarmNames=useAutomationAlarmRuleNames(()=>resource.data.value?.version.conditions)
function clearMetadata(){metadataOpen.value=undefined;metadataBefore.value=undefined;metadataIntent.value=undefined;metadataBusy.value=false;metadataError.value=''}
function clearDelete(){if(deleteConfirming.value)ElMessageBox.close();deleteConfirming.value=false;deleteBusy.value=false;deleteIntent.value=undefined;deleteError.value=''}
function reset(){resource.clear();names.value=new Map();sceneNames.value=new Map();taskNames.value=new Map();intent.value=undefined;busy.value=false;error.value='';clearMetadata();clearDelete();if(allowed.value)void resource.reload()}
watch([projectId,id],reset,{immediate:true})
watch(allowed,value=>{resource.clear();names.value=new Map();sceneNames.value=new Map();taskNames.value=new Map();busy.value=false;error.value='';if(!value){metadataOpen.value=undefined;metadataBefore.value=undefined;metadataBusy.value=false;metadataError.value='';if(deleteConfirming.value)ElMessageBox.close();deleteConfirming.value=false;deleteBusy.value=false;deleteError.value=''}if(value)void resource.reload()})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{live=false;dispose();if(deleteConfirming.value)ElMessageBox.close()})
const mixed=computed(()=>automationMixedConfig(resource.data.value?.version.triggerType,resource.data.value?.version.triggerConfig))
const reportTriggers=computed(()=>automationReportTriggers(resource.data.value?.version.triggerType,resource.data.value?.version.triggerConfig))
const trigger=computed(()=>automationPropertyTrigger(resource.data.value?.version.triggerConfig))
const sourceId=computed(()=>{const config=resource.data.value?.version.triggerConfig;return automationObject(config)&&'deviceId' in config&&definitionUuid(config.deviceId)?config.deviceId:''})
const triggerLabel=computed(()=>resource.data.value?.version.triggerType==='PROPERTY_REPORTED'||resource.data.value?.version.triggerType==='PROPERTY_CHANGED'?'设备属性变化':resource.data.value?.version.triggerType==='ONE_SHOT'?'日期时间':resource.data.value?.version.triggerType==='CRON'?'重复时间':'已有触发器')
const conditions=computed(()=>resource.data.value?.version.conditions.map((node,index)=>({index,config:automationDeviceCondition(node),time:automationTimeCondition(node),alarm:automationAlarmCondition(node)}))??[])
const actions=computed(()=>resource.data.value?.version.actions.map((node,index)=>({index,scene:automationSceneRun(node),task:automationTaskRun(node),config:automationTargetAction(node)}))??[])
watch(()=>resource.data.value,async(value,_old,onCleanup)=>{
 names.value=new Map();sceneNames.value=new Map();taskNames.value=new Map();if(!value||!allowed.value)return
 const controller=new AbortController();onCleanup(()=>controller.abort());const project=projectId.value,key=id.value,epoch=identityEpoch(),ids=[...new Set([sourceId.value,...(reportTriggers.value?.map(row=>row.deviceId)??[]),...automationMixedDeviceIds(mixed.value),...conditions.value.map(row=>row.config?.deviceId??row.alarm?.deviceId??''),...actions.value.map(row=>row.config?.deviceId??'')].filter(definitionUuid))].slice(0,100)
 const sceneIds=[...new Set(actions.value.map(row=>row.scene?.sceneId??'').filter(definitionUuid))].slice(0,100)
 if(ids.length)try{const rows=await selectedTaskChoices(project,'devices',ids,controller.signal);if(!controller.signal.aborted&&project===projectId.value&&key===id.value&&epoch===identityEpoch()&&allowed.value)names.value=new Map(rows.map(row=>[row.id,row.label]))}catch{/* 名称不可读取时保留真实UUID。 */}
 if(sceneIds.length)try{const page=await listScenes(project,{limit:100},controller.signal);if(!controller.signal.aborted&&project===projectId.value&&key===id.value&&epoch===identityEpoch()&&allowed.value)sceneNames.value=new Map((page.items??[]).map(row=>[row.id!,row.name??row.id!]))}catch{/* 场景名称不可读取时保留真实UUID。 */}
 const taskIds=[...new Set(actions.value.map(row=>row.task?.taskId??'').filter(definitionUuid))].slice(0,20),taskLabels=new Map<string,string>();let offset=0
 await Promise.all(Array.from({length:Math.min(4,taskIds.length)},async()=>{while(!controller.signal.aborted&&offset<taskIds.length){const task=taskIds[offset++]!;try{const result=await getTask(project,task,controller.signal);if(result.id===task&&typeof result.name==='string'&&result.name.trim())taskLabels.set(task,result.name)}catch{/* 已删除或失去读取资格的任务仍保留原标识。 */}}}))
 if(!controller.signal.aborted&&project===projectId.value&&key===id.value&&epoch===identityEpoch()&&allowed.value)taskNames.value=taskLabels
})
function valueText(value:unknown){if(value instanceof ExactDecimal){try{return writePreprocessJson(value,true)}catch{return value.canonical()}}return typeof value==='string'?value:automationSignature(value)}
function edit(){if(writable.value&&!blocked.value&&!resource.loading.value&&!resource.error.value)void router.push(`/rules/automations/${id.value}/edit`)}
function back(){if(!blocked.value)void router.push('/rules/automations')}
function scope(value:AutomationOperationIntent,epoch:number){return live&&value.project===projectId.value&&value.id===id.value&&epoch===identityEpoch()&&allowed.value}
function matches(value:StateIntent,definition:Schema<'AutomationView'>){return definition.id===value.id&&definition.version===value.before+1&&definition.status===(value.enabled?'ACTIVE':'PAUSED')&&definition.activeVersionId===value.versionId}
async function confirmState(value:StateIntent){
 const first=await readAutomation(value.project,value.id)
 if(!matches(value,first))throw new Error('该次状态修改仍待核对；未重复提交。')
 const version=await readAutomationVersion(value.project,value.id,value.versionId),last=await readAutomation(value.project,value.id)
 if(!matches(value,last)||version.id!==value.versionId)throw new Error('该次状态修改仍待核对；未重复提交。')
 assertAutomationContent(value.body,last,version)
}
async function changeState(enabled:string|number|boolean){
 const loaded=resource.data.value;if(typeof enabled!=='boolean'||!loaded||!writable.value||blocked.value||resource.loading.value||resource.error.value||enabled===(loaded.definition.status==='ACTIVE'))return
 let value:StateIntent
 try{if(!definitionUuid(loaded.version.id))throw new Error('自动化完整版本无法读取');const before=cas(loaded.definition.version);cas(before+1);value={mode:'state',project:projectId.value,id:id.value,before,enabled,versionId:loaded.version.id,body:automationDraftBody(loadedAutomationDraft(loaded.definition,loaded.version))}}catch(cause){error.value=errorMessage(cause);return}
 intent.value=value;busy.value=true;error.value='';const epoch=identityEpoch();let accepted=false
 try{
  const response=enabled?await activateAutomation(value.project,value.id,value.versionId,value.before):await pauseAutomation(value.project,value.id,value.before);accepted=true
  if(!scope(value,epoch))return
  if(!matches(value,response))throw new Error('自动化状态回执与原意图不一致，请只读核对。')
  await confirmState(value);if(!scope(value,epoch))return;intent.value=undefined;busy.value=false;await resource.reload()
 }catch(cause){if(scope(value,epoch)&&!(cause instanceof IdentityChanged)){const known=!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,422,429].includes(cause.status);if(known)intent.value=undefined;error.value=errorMessage(cause)}}finally{if(scope(value,epoch))busy.value=false}
}
function matchesRevision(value:RevisionIntent,definition:Schema<'AutomationView'>){
 return definition.id===value.id&&cas(definition.version)===value.expectedFinalCAS&&definition.status===value.expectedStatus&&(value.expectedStatus==='DRAFT'?definition.activeVersionId==null:definitionUuid(definition.activeVersionId)&&definition.activeVersionId!==value.previousActiveVersionId&&(!value.selectedVersionId||definition.activeVersionId===value.selectedVersionId))
}
async function confirmRevision(value:RevisionIntent){
 const first=await readAutomation(value.project,value.id)
 if(!matchesRevision(value,first))throw new Error('自动化当前内容保存结果尚待核对；未重复提交。')
 const version=first.status==='DRAFT'?await readAutomationLatest(value.project,value.id):await readAutomationVersion(value.project,value.id,first.activeVersionId!),last=await readAutomation(value.project,value.id)
 if(!matchesRevision(value,last)||first.activeVersionId!==last.activeVersionId||!definitionUuid(version.id)||version.id===value.previousVersionId||value.selectedVersionId&&version.id!==value.selectedVersionId||last.status!=='DRAFT'&&last.activeVersionId!==version.id)throw new Error('自动化新版本尚未与原保存意图一致；未重复提交。')
 assertAutomationContent(value.body,last,version);value.selectedVersionId=version.id
}
/** 条件和触发卡共用一次完整内容修订及同一份原意图恢复，不重发未知写。 */
async function reviseContent(body:AutomationBody){
 const loaded=resource.data.value;if(!loaded||!writable.value||blocked.value||resource.loading.value||resource.error.value)return
 let value:RevisionIntent
 try{
  const before=cas(loaded.definition.version),status=loaded.definition.status,ptr=loaded.definition.activeVersionId??null
  if(!definitionUuid(loaded.version.id)||!['DRAFT','ACTIVE','PAUSED'].includes(status??'')||status==='DRAFT'&&ptr!=null||status!=='DRAFT'&&!definitionUuid(ptr))throw new Error('自动化当前完整版本无法读取。')
  value={mode:'revision',project:projectId.value,id:id.value,before,enabled:status==='ACTIVE',expectedFinalCAS:cas(before+(status==='ACTIVE'?2:ptr?3:1)),expectedStatus:status as RevisionIntent['expectedStatus'],previousVersionId:loaded.version.id,previousActiveVersionId:ptr,body}
 }catch(cause){error.value=errorMessage(cause);return}
 intent.value=value;busy.value=true;error.value='';const epoch=identityEpoch();let accepted=false
 try{
  const response=await reviseAutomation(value.project,value.id,value.body,value.before,value.enabled);accepted=true
  if(!scope(value,epoch))return
  if(!matchesRevision(value,response))throw new Error('自动化内容保存回执与原意图不一致，请只读核对。')
  if(response.activeVersionId)value.selectedVersionId=response.activeVersionId
  await confirmRevision(value);if(!scope(value,epoch))return;intent.value=undefined;busy.value=false;await resource.reload()
 }catch(cause){if(scope(value,epoch)&&!(cause instanceof IdentityChanged)){const known=!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,422,429].includes(cause.status);if(known)intent.value=undefined;error.value=errorMessage(cause)}}finally{if(scope(value,epoch))busy.value=false}
}
async function changeConditionEnabled(index:number,enabled:string|number|boolean){
 const loaded=resource.data.value,node=loaded?.version.conditions[index],config=node&&automationDeviceCondition(node),time=node&&automationTimeCondition(node),alarm=node&&automationAlarmCondition(node)
 if(typeof enabled!=='boolean'||!loaded||!node||!config&&!time&&!alarm||enabled===(alarm?.enabled??time?.enabled??config?.enabled)||!writable.value||blocked.value||resource.loading.value||resource.error.value)return
 try{const body=automationDraftBody(loadedAutomationDraft(loaded.definition,loaded.version));body.conditions[index]=alarm?automationAlarmConditionAction({...alarm,enabled}):time?automationTimeConditionAction({...time,enabled}):automationDeviceConditionAction(config!.deviceId,enabled,config!.relation,config!.conditions,config!.schemaVersion);await reviseContent(body)}catch(cause){error.value=errorMessage(cause)}
}
async function changeTriggerEnabled(index:number,enabled:string|number|boolean){
 if(mixed.value){const loaded=resource.data.value,row=mixed.value.triggers[index];if(typeof enabled!=='boolean'||!loaded||!row||row.enabled===enabled||!writable.value||blocked.value||resource.loading.value||resource.error.value)return;try{const body=automationDraftBody(loadedAutomationDraft(loaded.definition,loaded.version)),rows=cloneAutomationValue(mixed.value.triggers);rows[index]={...rows[index]!,enabled};body.triggerConfig=automationMixedValue(rows,mixed.value);await reviseContent(body)}catch(cause){error.value=errorMessage(cause)}return}
 const loaded=resource.data.value,rows=reportTriggers.value,row=rows?.[index]
 if(typeof enabled!=='boolean'||!loaded||!rows||!row||row.enabled===enabled||!writable.value||blocked.value||resource.loading.value||resource.error.value)return
 try{const body=automationDraftBody(loadedAutomationDraft(loaded.definition,loaded.version)),next=cloneAutomationValue(rows);next[index]={...next[index]!,enabled};body.triggerConfig=automationReportTriggerConfig(next,body.triggerConfig);await reviseContent(body)}catch(cause){error.value=errorMessage(cause)}
}
function mixedReport(row:AutomationMixedTrigger){return row.kind==='PROPERTY_REPORTED'||row.kind==='PROPERTY_CHANGED'?automationTriggerRow(row.options,row.enabled):undefined}
function propertySourceLabel(row:AutomationReportTrigger){const source=automationPropertySourceSelection(automationReportTriggerValue(row));return 'sourceSelection' in row&&source&&source!=='ALL'?automationSourceLabels[source]:''}
function reportPredicate(row:AutomationReportTrigger){return automationPropertyTrigger(automationReportTriggerValue(row))}
async function verifyState(){
 const value=intent.value;if(!value||busy.value||!allowed.value)return
 busy.value=true;error.value='';const epoch=identityEpoch()
 try{if(value.mode==='revision')await confirmRevision(value);else await confirmState(value);if(!scope(value,epoch))return;intent.value=undefined;busy.value=false;await resource.reload()}catch(cause){if(scope(value,epoch))error.value=errorMessage(cause)}finally{if(scope(value,epoch))busy.value=false}
}
const tags=computed(()=>{try{return automationTagsValue(resource.data.value?.definition.tags)}catch{return undefined}})
const tagRows=computed(()=>Object.entries(tags.value??{}).map(([key,value])=>({key,value})))
function metadataScope(value:{project:string;id:string;epoch:number}){return live&&value.project===projectId.value&&value.id===id.value&&value.epoch===identityEpoch()&&allowed.value}
function openMetadata(kind:'information'|'tags'){
 if(!writable.value||blocked.value||resource.loading.value||resource.error.value||!resource.data.value)return
 try{metadataBefore.value=automationMetadataSnapshot(resource.data.value.definition);metadataError.value='';metadataOpen.value=kind}catch(cause){metadataError.value=errorMessage(cause)}
}
function closeMetadata(){if(!metadataBusy.value&&!metadataIntent.value){metadataOpen.value=undefined;metadataBefore.value=undefined;metadataError.value=''}}
async function performMetadata(value:AutomationMetadataIntent){
 metadataIntent.value=value;metadataBusy.value=true;metadataError.value='';let accepted=false
 try{
  await writeAutomationMetadata(value);accepted=true;if(!metadataScope(value))return
  await readAutomationMetadata(value);if(!metadataScope(value)||metadataIntent.value!==value)return
  clearMetadata();await resource.reload()
 }catch(cause){if(metadataScope(value)){const known=!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,422,429].includes(cause.status);if(known)metadataIntent.value=undefined;metadataError.value=errorMessage(cause)}}finally{if(metadataScope(value))metadataBusy.value=false}
}
async function saveInformation(body:Schema<'WriteAutomationInformationRequest'>){
 if(metadataOpen.value!=='information'||!metadataBefore.value||!writable.value||operationBlocked.value)return
 try{if(resource.data.value?.definition.version!==metadataBefore.value.version)throw new Error('自动化已变化，请取消后重新读取');await performMetadata(automationInformationIntent(projectId.value,metadataBefore.value,body))}catch(cause){metadataError.value=errorMessage(cause)}
}
async function saveTags(value:Record<string,string>){
 if(metadataOpen.value!=='tags'||!metadataBefore.value||!writable.value||operationBlocked.value)return
 try{if(resource.data.value?.definition.version!==metadataBefore.value.version)throw new Error('自动化已变化，请取消后重新读取');await performMetadata(automationTagsIntent(projectId.value,metadataBefore.value,value))}catch(cause){metadataError.value=errorMessage(cause)}
}
async function verifyMetadata(){
 const value=metadataIntent.value;if(!value||metadataBusy.value||!metadataScope(value))return
 metadataBusy.value=true;metadataError.value=''
 try{await readAutomationMetadata(value);if(!metadataScope(value)||metadataIntent.value!==value)return;clearMetadata();await resource.reload()}catch(cause){if(metadataScope(value))metadataError.value=errorMessage(cause)}finally{if(metadataScope(value))metadataBusy.value=false}
}
async function removeAutomation(){
 const definition=resource.data.value?.definition;if(!definition||!writable.value||blocked.value)return
 const value={project:projectId.value,id:id.value,epoch:identityEpoch(),version:cas(definition.version)}
 deleteConfirming.value=true;deleteError.value=''
 try{await ElMessageBox.confirm('确定要删除此自动化吗？删除后不可恢复，请谨慎操作。','提示',{type:'warning',confirmButtonText:'确定',cancelButtonText:'取消'})}catch{return}finally{if(metadataScope(value))deleteConfirming.value=false}
 if(!metadataScope(value)||!writable.value)return
 if(resource.data.value?.definition.version!==value.version){deleteError.value='自动化已变化，请重新读取';return}
 deleteIntent.value=value;deleteBusy.value=true
 try{await deleteAutomation(value.project,value.id,value.version);if(!metadataScope(value))return;clearDelete();resource.clear();await router.push('/rules/automations')}catch(cause){if(metadataScope(value)){if(cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,422,429].includes(cause.status))deleteIntent.value=undefined;deleteError.value=errorMessage(cause)}}finally{if(metadataScope(value))deleteBusy.value=false}
}
async function verifyDeletion(){
 const value=deleteIntent.value;if(!value||deleteBusy.value||!metadataScope(value))return
 deleteBusy.value=true
 try{await readAutomation(value.project,value.id);if(metadataScope(value))deleteError.value='当前自动化仍存在，删除结果尚待核对；未重复提交'}catch(cause){if(metadataScope(value)){if(cause instanceof ApiError&&cause.status===404){clearDelete();resource.clear();await router.push('/rules/automations')}else deleteError.value=errorMessage(cause)}}finally{if(metadataScope(value))deleteBusy.value=false}
}
onBeforeRouteLeave(()=>!blocked.value);onBeforeRouteUpdate(()=>!blocked.value)
function beforeUnload(event:BeforeUnloadEvent){if(blocked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload);onScopeDispose(()=>window.removeEventListener('beforeunload',beforeUnload))
</script>
<template><main class="tl-page automation-detail-page"><PageHeader title="自动化详情" back :back-disabled="blocked" @back="back"/><AsyncState :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" @retry="resource.reload"><template v-if="resource.data.value">
 <h2 class="automation-detail-name">{{resource.data.value.definition.name}}<el-button size="small" aria-label="编辑自动化信息" :disabled="!writable||blocked" @click="openMetadata('information')">编辑</el-button></h2><p class="automation-detail-id">ID：{{resource.data.value.definition.id}}</p>
 <el-alert v-if="error||intent" :title="error||'原状态修改结果待核对；未重复提交'" type="warning" :closable="false"><el-button v-if="intent" :disabled="busy" @click="verifyState">重新读取核对</el-button></el-alert>
 <el-alert v-if="metadataIntent&&!metadataOpen||metadataError&&!metadataOpen" :title="metadataError||'原元信息保存结果待核对；未重复提交'" type="warning" :closable="false"><el-button v-if="metadataIntent" :disabled="metadataBusy" @click="verifyMetadata">重新读取元信息核对</el-button></el-alert>
 <el-alert v-if="deleteError" :title="deleteError" type="warning" :closable="false"><el-button v-if="deleteIntent" :disabled="deleteBusy" @click="verifyDeletion">重新读取删除状态</el-button></el-alert>
 <el-tabs v-model="tab" class="tl-tabs" :before-leave="()=>!blocked"><el-tab-pane label="自动化" name="automation"/><el-tab-pane label="运行日志" name="logs"/><el-tab-pane label="统计" name="stats"/><el-tab-pane label="设置" name="settings"/></el-tabs>
 <div v-if="tab==='automation'" class="automation-detail-grid"><div><section class="automation-summary-card"><header>基本信息<el-button size="small" aria-label="编辑自动化" :disabled="!writable||blocked" @click="edit">编辑</el-button></header><dl><div><dt>创建时间</dt><dd>{{formatTime(resource.data.value.definition.createdAt)}}</dd></div><div><dt>修改时间</dt><dd>{{formatTime(resource.data.value.definition.updatedAt)}}</dd></div></dl></section>
 <section class="automation-summary-card"><header>触发器<el-button size="small" :disabled="!writable||blocked" @click="edit">编辑</el-button></header><div v-if="mixed" class="automation-read-list"><article v-for="(row,index) in mixed.triggers" :key="index" class="automation-trigger-row" :class="{'is-disabled':!row.enabled}"><span class="automation-read-icon" :style="{background:automationMixedPresentation(row.kind).background,color:automationMixedPresentation(row.kind).color}"><ReferenceIcon :glyph="automationMixedPresentation(row.kind).glyph"/></span><div><div class="automation-condition-title"><strong>{{automationMixedPresentation(row.kind).label}}</strong><el-switch :model-value="row.enabled" :aria-label="`启用混合触发器 ${index+1}`" title="启用/禁用触发器" class="compact-switch" size="small" :disabled="!writable||blocked||resource.loading.value" :loading="busy" @change="changeTriggerEnabled(index,$event)"/></div><template v-if="mixedReport(row)"><p>设备：<router-link v-if="can('device:read')" :to="`/devices/${mixedReport(row)!.deviceId}`">{{names.get(mixedReport(row)!.deviceId)||mixedReport(row)!.deviceId}}</router-link><span v-else>{{mixedReport(row)!.deviceId}}</span></p><p v-if="propertySourceLabel(mixedReport(row)!)">{{propertySourceLabel(mixedReport(row)!)}}</p><template v-if="reportPredicate(mixedReport(row)!)"><p v-for="(condition,i) in reportPredicate(mixedReport(row)!)!.conditions" :key="i">{{condition.propertyKey}} {{automationOperatorLabels[condition.operator]}} {{valueText(condition.value)}}</p><p v-if="reportPredicate(mixedReport(row)!)!.conditions.length>1">{{reportPredicate(mixedReport(row)!)!.relation==='ALL'?'满足全部（AND）':'满足任一（OR）'}}</p><p v-if="reportPredicate(mixedReport(row)!)!.durationSeconds>0">持续{{automationDurationLabel(reportPredicate(mixedReport(row)!)!.durationSeconds)}}</p></template></template><p v-else>{{automationMixedSummary(row)}}</p></div></article></div><div v-else-if="reportTriggers" class="automation-read-list"><article v-for="(row,index) in reportTriggers" :key="index" class="automation-trigger-row" :class="{'is-disabled':!row.enabled}"><span class="automation-read-icon" :style="{background:automationTriggerPresentation.background,color:automationTriggerPresentation.color}"><ReferenceIcon :glyph="automationTriggerPresentation.glyph"/></span><div><div class="automation-condition-title"><strong>{{automationTriggerPresentation.label}}</strong><el-switch :model-value="row.enabled" :aria-label="`启用设备触发器 ${index+1}`" title="启用/禁用触发器" class="compact-switch" size="small" :disabled="!writable||blocked||resource.loading.value" :loading="busy" @change="changeTriggerEnabled(index,$event)"/></div><p>设备：<router-link v-if="can('device:read')" :to="`/devices/${row.deviceId}`">{{names.get(row.deviceId)||row.deviceId}}</router-link><span v-else>{{row.deviceId}}</span></p><p v-if="propertySourceLabel(row)">{{propertySourceLabel(row)}}</p><template v-if="reportPredicate(row)"><p v-for="(condition,i) in reportPredicate(row)!.conditions" :key="i">{{condition.propertyKey}} {{automationOperatorLabels[condition.operator]}} {{valueText(condition.value)}}</p><p v-if="reportPredicate(row)!.conditions.length>1">{{reportPredicate(row)!.relation==='ALL'?'满足全部（AND）':'满足任一（OR）'}}</p><p v-if="reportPredicate(row)!.durationSeconds>0">持续{{automationDurationLabel(reportPredicate(row)!.durationSeconds)}}</p></template></div></article></div><div v-else class="automation-read-list"><article><span class="automation-read-icon" :style="{background:automationTriggerPresentation.background,color:automationTriggerPresentation.color}"><ReferenceIcon :glyph="automationTriggerPresentation.glyph"/></span><div><strong>{{triggerLabel}}</strong><p v-if="sourceId">设备：<router-link v-if="can('device:read')" :to="`/devices/${sourceId}`">{{names.get(sourceId)||sourceId}}</router-link><span v-else>{{names.get(sourceId)||sourceId}}</span></p><template v-if="trigger"><p v-for="(condition,index) in trigger.conditions" :key="index">{{condition.propertyKey}} {{automationOperatorLabels[condition.operator]}} {{valueText(condition.value)}}</p><p v-if="trigger.conditions.length>1">{{trigger.relation==='ALL'?'满足全部（AND）':'满足任一（OR）'}}</p><p v-if="trigger.durationSeconds>0">持续{{automationDurationLabel(trigger.durationSeconds)}}</p></template></div></article></div></section>
 <section v-if="mixed" class="automation-summary-card"><header>其它设置</header><dl><div><dt>时区设置</dt><dd>{{mixed.timezoneMode==='FOLLOW_PROJECT'?'跟随项目时区':'自定义时区'}} · {{resource.data.value.version.resolvedTimezone}}</dd></div></dl></section>
 <section v-if="resource.data.value.version.conditions.length" class="automation-summary-card"><header>条件<el-button size="small" :disabled="!writable||blocked" @click="edit">编辑</el-button></header><div class="automation-read-list"><article v-for="row in conditions" :key="row.index" :class="{'is-disabled':(row.alarm?.enabled??row.time?.enabled??row.config?.enabled)===false}"><template v-if="row.alarm"><span class="automation-read-icon" :style="{background:automationAlarmConditionPresentation.background,color:automationAlarmConditionPresentation.color}"><ReferenceIcon :glyph="automationAlarmConditionPresentation.glyph"/></span><div><div class="automation-condition-title"><strong>{{automationAlarmConditionPresentation.label}}</strong><el-switch :model-value="row.alarm.enabled" :aria-label="`启用告警条件 ${row.index+1}`" title="启用/禁用条件" class="compact-switch" size="small" :disabled="!writable||blocked||resource.loading.value" :loading="busy" @change="changeConditionEnabled(row.index,$event)"/></div><p>设备：<router-link v-if="can('device:read')" :to="`/devices/${row.alarm.deviceId}`">{{names.get(row.alarm.deviceId)||row.alarm.deviceId}}</router-link><span v-else>{{row.alarm.deviceId}}</span></p><p>告警规则：<router-link v-if="can('alarm:read')" :to="`/alarm-rules/${row.alarm.alarmRuleId}`">{{alarmNames.get(row.alarm.alarmRuleId)||row.alarm.alarmRuleId}}</router-link><span v-else>{{row.alarm.alarmRuleId}}</span></p><p>状态={{row.alarm.alarmState==='alerting'?'告警中':'正常'}}</p></div></template><template v-else-if="row.time"><span class="automation-read-icon" :style="{background:automationTimeConditionPresentation.background,color:automationTimeConditionPresentation.color}"><ReferenceIcon :glyph="automationTimeConditionPresentation.glyph"/></span><div><div class="automation-condition-title"><strong>{{automationTimeConditionPresentation.label}}</strong><el-switch :model-value="row.time.enabled" :aria-label="`启用时间条件 ${row.index+1}`" title="启用/禁用条件" class="compact-switch" size="small" :disabled="!writable||blocked||resource.loading.value" :loading="busy" @change="changeConditionEnabled(row.index,$event)"/></div><p>{{automationTimeConditionSummary(row.time)}}</p></div></template><template v-else-if="row.config"><span class="automation-read-icon" :style="{background:automationConditionPresentation.background,color:automationConditionPresentation.color}"><ReferenceIcon :glyph="automationConditionPresentation.glyph"/></span><div><div class="automation-condition-title"><strong>{{automationConditionPresentation.label}}</strong><el-switch :model-value="row.config.enabled" :aria-label="`启用设备条件 ${row.index+1}`" title="启用/禁用条件" class="compact-switch" size="small" :disabled="!writable||blocked||resource.loading.value" :loading="busy" @change="changeConditionEnabled(row.index,$event)"/></div><p>设备：<router-link v-if="can('device:read')" :to="`/devices/${row.config.deviceId}`">{{names.get(row.config.deviceId)||row.config.deviceId}}</router-link><span v-else>{{row.config.deviceId}}</span></p><p v-for="(condition,index) in row.config.conditions" :key="index">{{automationCurrentConditionText(condition)}}</p><p v-if="row.config.conditions.length>1">{{row.config.relation==='ALL'?'满足全部（AND）':'满足任一（OR）'}}</p></div></template><div v-else><strong>已有条件</strong><p>原有条件配置保持不变</p></div></article></div></section>
 <section class="automation-summary-card"><header>动作列表<el-button size="small" :disabled="!writable||blocked" @click="edit">编辑</el-button></header><div class="automation-read-list"><article v-for="row in actions" :key="row.index"><span class="automation-read-icon" :style="{background:automationActionStyle(resource.data.value.version.actions[row.index]!).background,color:automationActionStyle(resource.data.value.version.actions[row.index]!).color}"><ReferenceIcon :glyph="automationActionStyle(resource.data.value.version.actions[row.index]!).glyph"/></span><div><strong>{{row.config||row.scene||row.task?automationActionStyle(resource.data.value.version.actions[row.index]!).label:'已有操作'}}</strong><template v-if="row.task"><p>设备：{{names.get(row.task.deviceId)||row.task.deviceId}}</p><p>任务：{{taskNames.get(row.task.taskId)||row.task.taskId}}</p></template><template v-else-if="row.scene"><p>场景：<router-link :to="`/rules/scenes/${row.scene.sceneId}`">{{sceneNames.get(row.scene.sceneId)||row.scene.sceneId}}</router-link></p><p>{{automationSceneSummary(row.scene,sceneNames.get(row.scene.sceneId))}}</p></template><template v-else-if="row.config"><p>设备：<router-link v-if="can('device:read')" :to="`/devices/${row.config.deviceId}`">{{names.get(row.config.deviceId)||row.config.deviceId}}</router-link><span v-else>{{names.get(row.config.deviceId)||row.config.deviceId}}</span></p><template v-if="'operations' in row.config"><p v-for="operation in row.config.operations" :key="operation.propertyKey">{{automationCloudOperationText(operation,valueText)}}</p></template><template v-else><p v-for="[key,value] in Object.entries(row.config.properties)" :key="key">{{key}}：{{valueText(value)}}</p></template></template><p v-else>原有操作配置保持不变</p></div></article></div></section>
 </div><aside><section class="automation-summary-card"><header>自动化状态</header><div class="automation-card-body"><span>启用自动化</span><el-switch :model-value="resource.data.value.definition.status==='ACTIVE'" aria-label="启用自动化" :disabled="!writable||blocked||resource.loading.value" :loading="busy" @change="changeState"/></div></section></aside></div>
 <AutomationStatisticsPanel v-else-if="tab==='stats'" :id="id" :name="resource.data.value.definition.name" @denied="cause=>{resource.clear();resource.error.value=cause}"/><div v-else-if="tab==='settings'" class="automation-settings"><section><h3>自动化描述</h3><p class="automation-description">{{resource.data.value.definition.description||''}}</p><el-button size="small" aria-label="编辑自动化描述" :disabled="!writable||blocked" @click="openMetadata('information')">编辑</el-button></section>
 <section><h3>标签</h3><el-table v-if="tags" :data="tagRows" size="small" empty-text="无标签"><el-table-column prop="key" label="标签名称"/><el-table-column prop="value" label="值"/></el-table><el-alert v-else title="自动化标签读取不完整，请重新读取" type="warning" :closable="false"/><el-button size="small" aria-label="编辑自动化标签" :disabled="!writable||blocked||!tags" @click="openMetadata('tags')">编辑</el-button></section>
 <section><h3>删除自动化</h3><p class="automation-settings-tips">删除后不可恢复，请谨慎操作。</p><el-button type="danger" size="small" aria-label="删除自动化" :disabled="!writable||blocked" :loading="deleteBusy" @click="removeAutomation">删除自动化</el-button></section></div>
 </template></AsyncState>
 <AutomationDebugLogPanel v-if="definitionUuid(id)" :id="id" :inactive="!allowed||tab!=='logs'||resource.loading.value||!resource.data.value||!!resource.error.value" :disabled="operationBlocked||!!metadataOpen" @busy="logsBusy=$event" @locked="logsLocked=$event" @confirming="logsConfirming=$event" @denied="cause=>{resource.clear();resource.error.value=cause}"/>
 <AutomationInformationDialog :model-value="metadataOpen==='information'" :automation="metadataBefore" :busy="metadataBusy" :pending="metadataPending" :error="metadataError" @update:model-value="closeMetadata" @save="saveInformation" @verify="verifyMetadata"/>
 <AutomationTagsDialog :model-value="metadataOpen==='tags'" :tags="metadataBefore?.tags||{}" :busy="metadataBusy" :pending="metadataPending" :error="metadataError" @update:model-value="closeMetadata" @save="saveTags" @verify="verifyMetadata"/>
 </main></template>
<style scoped>.automation-detail-name{display:flex;align-items:center;gap:10px;margin:0;padding:10px 0 0;font-size:26px;font-weight:500;line-height:34px;color:#002822}.automation-detail-id{padding:10px 0 0;margin:0 0 20px;color:#999;font-size:14px;line-height:20px}.automation-detail-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:10px}.automation-summary-card{border:1px solid #ebeef5;border-radius:4px;background:#fff;margin-top:10px;overflow:hidden}.automation-summary-card:hover{box-shadow:0 2px 12px 0 rgba(0,0,0,.1)}.automation-summary-card>header{padding:12px 20px;border-bottom:1px solid #ebeef5;display:flex;justify-content:space-between;align-items:center;color:#2f354d;font-size:15px;font-weight:600;min-height:28px}.automation-summary-card dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:20px;margin:0}.automation-summary-card dl>div{line-height:20px;padding:0 0 20px;font-size:15px}.automation-summary-card dt{font-size:14px;line-height:18px;font-weight:600;color:#606266}.automation-summary-card dd{margin:3px 0 0;color:#002822;overflow-wrap:anywhere}.automation-read-list{margin:20px;border:1px solid #f0f0f0;border-radius:4px;overflow:hidden}.automation-read-list article{display:flex;align-items:center;gap:16px;min-height:60px;padding:10px 16px;border-bottom:1px solid #f0f0f0}.automation-read-list article:last-child{border-bottom:0}.automation-read-icon{width:30px;height:30px;display:flex;align-items:center;justify-content:center;flex:none;border-radius:5px;font-size:20px}.automation-read-list strong{font-size:14px;font-weight:500;color:#333;line-height:1.4}.automation-read-list p{margin:4px 0 0;font-size:13px;color:#888;overflow-wrap:anywhere}.automation-read-list a{color:inherit;text-decoration:none}.automation-read-list a:hover{color:#409eff}.automation-card-body{padding:20px;font-size:14px;color:#606266}.automation-card-body>span{display:block;font-weight:600;line-height:18px;margin-bottom:6px}.automation-detail-page :deep(.el-alert){margin:10px 0}@media(max-width:991px){.automation-detail-grid{grid-template-columns:1fr}}.automation-settings>section{margin-bottom:20px}.automation-settings h3{margin:10px 0 0;font-size:16px;line-height:22px;font-weight:700;color:#002822}.automation-description{padding:0;margin:10px 0 0;font-size:14px;line-height:20px;color:#606266;white-space:pre-wrap;overflow-wrap:anywhere}.automation-settings section>.el-button{margin-top:10px;height:28px;padding:7px 15px;font-size:12px;border-radius:3px}.automation-settings-tips{margin:5px 0 0;font-size:14px;line-height:20px;color:#909399}.automation-settings :deep(.el-table){font-size:12px}.automation-settings :deep(.el-table th.el-table__cell),.automation-settings :deep(.el-table td.el-table__cell){padding:6px 0}.automation-settings :deep(.el-table .cell){line-height:20px;padding:0 10px;font-size:12px}.automation-settings :deep(.el-table thead){color:#909399;font-weight:500}.automation-settings :deep(.el-table__empty-text){font-size:12px;line-height:60px;color:#909399}.automation-read-list article.is-disabled{opacity:.5}.automation-condition-title{display:flex;align-items:center}.automation-condition-title .compact-switch{margin-left:12px}</style>
