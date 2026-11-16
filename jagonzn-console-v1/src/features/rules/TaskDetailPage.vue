<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { can, projectId, currentProject, session } from '@/core/session'
import { useResource } from '@/core/use-resource'
import { ApiError, IdentityChanged, errorMessage, identityEpoch, onIdentityChange } from '@/core/http'
import { formatTime } from '@/core/time'
import { getTask, saveTaskInformation, saveTaskTargets, deleteTask, enableTask, disableTask, runTask, runTaskOnDevices } from './api'
import { WarningFilled } from '@element-plus/icons-vue'
import { cas,taskSelection,taskActionLabel,taskActionType,taskBaseActionLabel,taskEditor } from './models'
import { taskRunnerChoices } from './task-choices'
import TaskRunnerDialog from './TaskRunnerDialog.vue'
import TaskAppVisibilityPanel from './TaskAppVisibilityPanel.vue'
import {readTaskAppVisibility,writeTaskAppVisibility,createTaskAppVisibilityIntent,confirmTaskAppVisibility,type TaskAppVisibility,type TaskAppVisibilityKey,type TaskAppVisibilityIntent} from './task-app-visibility-api'
import type { Task, TaskWrite } from './models'
import TaskCommandContentDialog from './TaskCommandContentDialog.vue'
import TaskDataContentDialog from './TaskDataContentDialog.vue'
import TaskModbusRtuCommonDialog from './TaskModbusRtuCommonDialog.vue'
import TaskModbusTcpCommonDialog from './TaskModbusTcpCommonDialog.vue'
import {type TaskModbusTcpCommon} from './task-modbus-tcp-common'
import {taskModbusTcpBody} from './task-content-api'
import TaskOtaUpgradeDialog from './TaskOtaUpgradeDialog.vue'
import {taskOtaUpgradeValue,type TaskOtaUpgradeInput} from './task-ota-upgrade'
import {taskOtaUpgradeBody} from './task-content-api'
import {hasTaskModbusRtuCommon,type TaskModbusRtuCommon} from './task-modbus-rtu-common'
import {taskModbusRtuBody} from './task-content-api'
import TaskDataRouteDialog from './TaskDataRouteDialog.vue'
import RuleTagsEditor from './RuleTagsEditor.vue'
import {newRuleTag,type RuleTagDraft} from './rule-tag-draft'
import {taskTagsDraft,taskTagsValue,createTaskTagsIntent,confirmTaskTags,confirmTaskTagsDefinition,readTaskTags,writeTaskTags,type TaskTagsIntent} from './task-tags-api'
import {taskDataValue} from './task-data-content'
import {taskDataFunctionValue,isTaskData} from './task-data-function'
import TaskPropertyFunctionDialog from './TaskPropertyFunctionDialog.vue'
import {taskPropertyFunctionValue,isTaskFunction} from './task-property-function'
import TaskPropertyContentDialog from './TaskPropertyContentDialog.vue'
import {createTaskContentIntent,confirmTaskContent,saveTaskContent,taskPropertyBody,taskCloudBody,taskDataBody,taskPropertyFunctionBody,taskDataFunctionBody,taskCommandFunctionBody,taskDataRouteBody,type TaskDataRoute,type TaskContentIntent} from './task-content-api'
import PageHeader from '@/ui/PageHeader.vue'
import {showOperationFeedback} from '@/ui/operation-feedback'
import AsyncState from '@/ui/AsyncState.vue'
import SectionPanel from '@/ui/SectionPanel.vue'
import TaskInformationDialog from './TaskInformationDialog.vue'
import TaskTargetsDialog from './TaskTargetsDialog.vue'
import TaskTargetSummary from './TaskTargetSummary.vue'
import { useDetailTab } from './detail-tab'
import UsageStatisticsPanel from './UsageStatisticsPanel.vue'
import TaskDebugLogPanel from './TaskDebugLogPanel.vue'
import { taskDebugLogTransport } from './task-debug-transport'
import TaskRelatedDevicesPanel from './TaskRelatedDevicesPanel.vue'
import { taskRelatedDevicesTransport } from './task-related-devices-transport'
import TaskSchedulePanel from './TaskSchedulePanel.vue'
import { taskScheduleTransport } from './task-schedule-transport'
import {definitionUuid} from './device-task-definition-port'
import {taskCreationSourcePath} from './task-creation-source'
const route = useRoute(), router = useRouter(), tab = useDetailTab(['task', 'schedule', 'devices', 'statistics', 'logs', 'settings'], 'task'), editing = ref(false), busy = ref(false), locked = ref(false), writeError = ref('')
const returnPath=computed(()=>{
  const groupId=route.query.deviceGroupId
  return definitionUuid(groupId)?taskCreationSourcePath({kind:'DEVICE_GROUP',id:groupId.toLowerCase()}):'/tasks/jobs'
})
const id = computed(() => String(route.params.id || '')), allowed = computed(() => can('task:read')), manage = computed(() => can('task:manage')), runnable = computed(() => can('task:run'))
const logsBusy = ref(false), logsLocked = ref(false), logsConfirming = ref(false)
const logsVisited = ref(false), devicesVisited = ref(false), devicesBusy = ref(false), devicesLocked = ref(false)
const devicesPanel = ref<InstanceType<typeof TaskRelatedDevicesPanel>>()
const scheduleVisited = ref(false), scheduleBusy = ref(false), scheduleLocked = ref(false), scheduleEditing = ref(false)
const schedulePanel = ref<InstanceType<typeof TaskSchedulePanel>>()
const visibility=ref<TaskAppVisibility>(),visibilityLoading=ref(false),visibilityBusy=ref(false),visibilityError=ref(''),visibilityIntent=ref<TaskAppVisibilityIntent>()
const visibilityBlocked=computed(()=>visibilityBusy.value||!!visibilityIntent.value)
const contentFunctionBusy=ref(false)
const contentPurpose=ref<'content'|'route'>('content')
const contentEditing=ref(false),contentBase=ref<Task>(),contentIntent=ref<TaskContentIntent>(),contentPending=ref(false),contentConflict=ref(false)
const tagEditing=ref(false),tagRows=ref<RuleTagDraft[]>([]),tagBase=ref<Task>(),tagIntent=ref<TaskTagsIntent>(),tagPending=ref(false)
const contentChildrenBlocked = computed(() => visibilityBlocked.value || logsBusy.value || logsLocked.value || logsConfirming.value || devicesBusy.value || devicesLocked.value || scheduleBusy.value || scheduleLocked.value || scheduleEditing.value)
const childBlocked = computed(() => contentChildrenBlocked.value || contentEditing.value || tagEditing.value)
watch([projectId, id, () => tab.value], (current, previous) => {
  if (!previous || current[0] !== previous[0] || current[1] !== previous[1]) { logsVisited.value = false; logsBusy.value = false; logsLocked.value = false; logsConfirming.value = false; devicesVisited.value = false; devicesBusy.value = false; devicesLocked.value = false; scheduleVisited.value = false; scheduleBusy.value = false; scheduleLocked.value = false; scheduleEditing.value = false }
  if (current[2] === 'logs') logsVisited.value = true
  if (current[2] === 'devices') devicesVisited.value = true
  if (current[2] === 'schedule') scheduleVisited.value = true
}, { immediate: true })
const resource = useResource(async signal => {
  const project = projectId.value, job = id.value
  const value = await getTask(project, job, signal)
  if (!value || value.id !== job) throw new Error('任务返回身份不完整，请重新读取')
  return value
})
const timerSelection=computed(()=>{const value=resource.data.value;if(!value?.targetType)return;try{return taskSelection({targetType:value.targetType,targetGroupId:value.targetGroupId??undefined,targetDeviceTypeId:value.targetDeviceTypeId??undefined,targetDeviceIds:value.targetDeviceIds??undefined,targetGroupIds:value.targetGroupIds??undefined})}catch{return undefined}})
const settingsTags=computed(()=>{try{return resource.data.value?taskTagsValue(resource.data.value.tags):undefined}catch{return}})
const tagTableRows=computed(()=>Object.entries(settingsTags.value??{}).map(([key,value])=>({key,value})))
const targetsEditing = ref(false), running=ref(false)
type EnabledIntent={project:string;id:string;enabled:boolean;version:number}
const activeEnabled=ref<EnabledIntent>(),pendingEnabled=ref<EnabledIntent>()
const pendingManagementWrite=ref<Pick<EnabledIntent,'project'|'id'>>()
const pendingRun=ref<Pick<EnabledIntent,'project'|'id'>>()
/** 未决写按各自权限保留同任务核对上下文；普通草稿或范围失效不锁住退出。 */
const navigationBlocked=computed(()=>{
 const intent=pendingEnabled.value||activeEnabled.value||pendingManagementWrite.value||contentIntent.value||tagIntent.value||visibilityIntent.value
 return allowed.value&&(
  contentFunctionBusy.value&&manage.value
  ||  !!intent&&manage.value&&intent.project===projectId.value&&intent.id===id.value
  ||!!pendingRun.value&&runnable.value&&pendingRun.value.project===projectId.value&&pendingRun.value.id===id.value
 )
})
onBeforeRouteLeave(()=>!navigationBlocked.value)
onBeforeRouteUpdate(to=>String(to.params.id||'')===id.value||!navigationBlocked.value)
function beforeUnload(event:BeforeUnloadEvent){if(navigationBlocked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload);onScopeDispose(()=>window.removeEventListener('beforeunload',beforeUnload))
const removal = ref<{ project: string; id: string; expectedVersion: number }>()
const targetLabels: Record<string, string> = { ALL_DEVICES: '所有设备', DEVICE_GROUP: '设备组', DEVICE_TYPE: '设备类型', EXPLICIT_DEVICES: '指定设备', DEVICE_GROUPS: '多个设备组' }
const targetLabel = computed(() => targetLabels[resource.data.value?.targetType || ''] || '—')
let active = true, generation = 0,visibilityTurn=0
let visibilityController:AbortController|undefined
function clearVisibility(){visibilityTurn++;visibilityController?.abort();visibility.value=undefined;visibilityLoading.value=false;visibilityBusy.value=false;visibilityError.value='';visibilityIntent.value=undefined}
function clearContent(){contentPurpose.value='content';contentFunctionBusy.value=false;contentEditing.value=false;contentBase.value=undefined;contentIntent.value=undefined;contentPending.value=false;contentConflict.value=false}
function clearTags(){tagEditing.value=false;tagRows.value=[];tagBase.value=undefined;tagIntent.value=undefined;tagPending.value=false}
function clearEditor() { clearContent();clearTags();generation++;activeEnabled.value=undefined;pendingEnabled.value=undefined;pendingManagementWrite.value=undefined;pendingRun.value=undefined; running.value=false; editing.value = false; targetsEditing.value = false; removal.value = undefined; busy.value = false; locked.value = false; writeError.value = '' }
const dispose = onIdentityChange(()=>{clearVisibility();clearEditor()}); onScopeDispose(() => { active = false;clearVisibility();dispose() })
/** 失权不遗忘同身份已发出的内容请求；原正文仅内部核对，不恢复为可编辑草稿。 */
function suspendContent(){const intent=contentIntent.value;clearEditor();if(intent){contentIntent.value=intent;contentPending.value=true;locked.value=true;writeError.value='任务内容保存结果仍需核对，未重复保存。'}}
watch([projectId, id,()=>session.user?.accountId], () => { clearVisibility();clearEditor(); resource.clear(); if (projectId.value && allowed.value) void resource.reload() }, { immediate: true })
watch(allowed,value=>{clearVisibility();if(contentIntent.value&&(contentPending.value||busy.value))suspendContent();else clearEditor();resource.clear();if(value&&projectId.value)void resource.reload()})
watch(manage, () => { if (!manage.value) { if(contentIntent.value&&(contentPending.value||busy.value)){suspendContent();return}if(runnable.value&&(running.value||pendingRun.value))return;const needsCheck = locked.value || busy.value; clearEditor(); if (needsCheck) { locked.value = true; writeError.value = '请重新读取任务核对最新状态' } } })
watch(manage,value=>{if(!value){visibilityTurn++;visibilityController?.abort();visibilityLoading.value=false;visibilityBusy.value=false;if(visibilityIntent.value)visibilityError.value='应用可见性保存结果仍需核对，未重复保存。'}})
watch(runnable,()=>{if(!runnable.value && (running.value||pendingRun.value)){const needsCheck=busy.value || locked.value;clearEditor();if(needsCheck){locked.value=true;writeError.value='请重新读取任务核对最新状态'}}})
watch(resource.error,cause=>{if(cause instanceof ApiError&&[401,403].includes(cause.status)){if(!contentIntent.value)clearContent();clearTags()}})
watch(resource.error, cause => { if (cause instanceof ApiError && [401,403,404].includes(cause.status)) { clearVisibility();generation++;activeEnabled.value=undefined;pendingEnabled.value=undefined;pendingManagementWrite.value=undefined;pendingRun.value=undefined; running.value=false; editing.value = false; targetsEditing.value = false; removal.value = undefined; busy.value = false; resource.data.value = undefined } })
/** 主Tab专投影只读；父CAS变化后重新读取，不把缺字段或旧版本当默认关闭。 */
async function loadVisibility(){
 if(!allowed.value||!projectId.value||resource.data.value?.id!==id.value||visibilityIntent.value)return
 const turn=++visibilityTurn,scope=generation,epoch=identityEpoch(),project=projectId.value,job=id.value
 const current=()=>active&&turn===visibilityTurn&&scope===generation&&epoch===identityEpoch()&&project===projectId.value&&job===id.value&&allowed.value
 visibilityController?.abort();visibilityController=new AbortController();visibilityLoading.value=true;visibilityError.value=''
 try{const observed=await readTaskAppVisibility(project,job,visibilityController.signal);if(!current())return;if(cas(observed.version)!==cas(resource.data.value?.version))throw new Error('任务版本已变化，请重新读取任务后核对应用可见性。');visibility.value=observed}
 catch(cause){if(current()&&!(cause instanceof IdentityChanged)){visibility.value=undefined;visibilityError.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status))denied(cause)}}
 finally{if(current())visibilityLoading.value=false}
}
watch([()=>resource.data.value?.id,()=>resource.data.value?.version,()=>tab.value],()=>{if(tab.value==='task'&&allowed.value&&resource.data.value?.id===id.value&&!visibilityIntent.value&&!visibilityBusy.value&&!visibilityLoading.value)void loadVisibility()})
const visibilityInactive=computed(()=>tab.value!=='task'||!allowed.value||!manage.value||currentProject.value?.status!=='ACTIVE'||busy.value||locked.value||visibilityBlocked.value||visibilityLoading.value||running.value||editing.value||targetsEditing.value||contentEditing.value||tagEditing.value||!!removal.value||!!activeEnabled.value||logsBusy.value||logsLocked.value||logsConfirming.value||devicesBusy.value||devicesLocked.value||scheduleBusy.value||scheduleLocked.value||scheduleEditing.value||resource.loading.value||!!resource.error.value||resource.data.value?.id!==id.value)
/** 未决意图由父页持有，避免父任务刷新时子卡片卸载丢失恢复上下文。 */
async function confirmVisibility(intent:TaskAppVisibilityIntent,current:()=>boolean){
 const observed=await readTaskAppVisibility(intent.project,intent.id);if(!current())return
 const confirmed=confirmTaskAppVisibility(intent,observed)
 await resource.reload();if(!current())return
 if(resource.error.value)throw resource.error.value
 if(resource.data.value?.id!==intent.id||cas(resource.data.value?.version)!==intent.expectedVersion)throw new Error('任务版本尚未与原应用可见性目标一致，请继续读取核对。')
 visibility.value=confirmed;visibilityIntent.value=undefined;visibilityError.value=''
}
async function changeVisibility(key:TaskAppVisibilityKey,value:boolean){
 if(visibilityInactive.value||!visibility.value)return
 let intent:TaskAppVisibilityIntent
 try{if(cas(visibility.value.version)!==cas(resource.data.value?.version))throw new Error('任务版本已变化，请重新读取。');intent=createTaskAppVisibilityIntent(projectId.value,visibility.value,key,value)}catch(cause){visibilityError.value=errorMessage(cause);return}
 visibilityIntent.value=intent;visibilityBusy.value=true;visibilityError.value=''
 const scope=generation,epoch=identityEpoch(),current=()=>active&&scope===generation&&epoch===identityEpoch()&&intent.project===projectId.value&&intent.id===id.value&&allowed.value&&manage.value
 let accepted=false
 try{const response=await writeTaskAppVisibility(intent);accepted=true;if(!current())return;confirmTaskAppVisibility(intent,response);await confirmVisibility(intent,current)}
 catch(cause){if(current()&&!(cause instanceof IdentityChanged)){
  const known=!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,422,429].includes(cause.status)
  visibilityError.value=errorMessage(cause)
  if(known)visibilityIntent.value=undefined
  if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){denied(cause);return}
  if(known&&cause instanceof ApiError&&cause.status===409){visibility.value=undefined;await resource.reload();if(current()&&!resource.error.value)await loadVisibility()}
 }}finally{if(current())visibilityBusy.value=false}
}
/** UNKNOWN只读比较完整三bool与精确父版本，绝不重新PUT。 */
async function verifyVisibility(){
 const intent=visibilityIntent.value
 if(!intent||visibilityBusy.value||busy.value||!allowed.value||intent.project!==projectId.value||intent.id!==id.value)return
 const scope=generation,epoch=identityEpoch(),current=()=>active&&scope===generation&&epoch===identityEpoch()&&intent.project===projectId.value&&intent.id===id.value&&allowed.value
 visibilityBusy.value=true
 try{await confirmVisibility(intent,current)}catch(cause){if(current()&&!(cause instanceof IdentityChanged)){visibilityError.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status))denied(cause)}}finally{if(current())visibilityBusy.value=false}
}
async function rereadVisibility(){if(visibilityIntent.value){await verifyVisibility();return}if(visibilityBusy.value||busy.value)return;await resource.reload();if(!resource.error.value&&!visibilityLoading.value)await loadVisibility()}
async function save(body: TaskWrite) {
  if (!manage.value || running.value || busy.value || locked.value || childBlocked.value || removal.value || targetsEditing.value || !resource.data.value) return
  const epoch = identityEpoch(), scope = generation, project = projectId.value, job = id.value
  const current = () => active && scope === generation && epoch === identityEpoch() && project === projectId.value && job === id.value && manage.value
  pendingManagementWrite.value={project,id:job};busy.value = true; writeError.value = ''
  try { await saveTaskInformation(project, job, body); if (!current()) return; editing.value = false; await resource.reload() }
  catch (e) { if (current() && !(e instanceof IdentityChanged)) {
    writeError.value = errorMessage(e); locked.value = e instanceof ApiError && (e.outcomeUnknown || e.status === 409)
    if (e instanceof ApiError && [401,403,404].includes(e.status)) { resource.clear(); resource.error.value = e }
  } }
  finally { if (current()) { busy.value = false; if(!locked.value)pendingManagementWrite.value=undefined } }
}
/** 固定命令配置独立打开；完整定义与原CAS只在本次意图内冻结。 */
function openContent(){
 const task=resource.data.value
 if(!allowed.value||!manage.value||busy.value||locked.value||childBlocked.value||running.value||editing.value||targetsEditing.value||removal.value||resource.error.value||activeEnabled.value||!task?.id||task.id!==id.value)return
 try{const base=JSON.parse(JSON.stringify(task)) as Task;createTaskContentIntent(projectId.value,base,{...taskEditor(base)});contentBase.value=base;contentPurpose.value='content';contentEditing.value=true;writeError.value=''}catch(cause){writeError.value=errorMessage(cause)}
}
function openDataRoute(){
 if(contentEditing.value||!isTaskData(contentType(resource.data.value))||!dataRouteConfiguration(resource.data.value!))return
 openContent();if(contentEditing.value)contentPurpose.value='route'
}
async function saveDataRoute(value:TaskDataRoute){
 const base=contentBase.value;if(!base||!contentEditing.value||contentPurpose.value!=='route'||base.id!==id.value)return
 try{await saveContent(taskDataRouteBody(base,value))}catch(cause){writeError.value=errorMessage(cause)}
}
function contentType(task:Task|undefined){if(!task)return;try{return taskActionType(task)}catch{return}}
function contentLabel(task:Task|undefined){if(!task||!contentType(task))return '—';return taskActionLabel(task)}
async function saveProperties(value:Record<string,unknown>){const base=contentBase.value;if(!base||!contentEditing.value||base.id!==id.value)return;try{await saveContent(taskActionType(base)==='CLOUD_UPDATE'?taskCloudBody(base,value):taskPropertyBody(base,value))}catch(cause){writeError.value=errorMessage(cause)}}
async function saveOta(value:TaskOtaUpgradeInput){const base=contentBase.value;if(!base||!contentEditing.value||base.id!==id.value)return;try{await saveContent(taskOtaUpgradeBody(base,value))}catch(cause){writeError.value=errorMessage(cause)}}
function otaConfiguration(task:Task|undefined){if(!task)return;try{return taskActionType(task)==='OTA_UPGRADE'?taskOtaUpgradeValue(task.input):undefined}catch{return}}
function otaSelection(task:Task|undefined){if(!task)return;try{const value=taskEditor(task);return {targetType:value.targetType,targetGroupId:value.targetGroupId,targetDeviceTypeId:value.targetDeviceTypeId,targetDeviceIds:value.targetDeviceIds,targetGroupIds:value.targetGroupIds}}catch{return}}
async function saveModbus(value:TaskModbusRtuCommon){const base=contentBase.value;if(!base||!contentEditing.value||base.id!==id.value)return;try{await saveContent(taskModbusRtuBody(base,value))}catch(cause){writeError.value=errorMessage(cause)}}
async function saveModbusTcp(value:TaskModbusTcpCommon){const base=contentBase.value;if(!base||!contentEditing.value||base.id!==id.value)return;try{await saveContent(taskModbusTcpBody(base,value))}catch(cause){writeError.value=errorMessage(cause)}}
function commonConfiguration(task:Task|undefined){if(!task||!hasTaskModbusRtuCommon(task.input))return;try{const value=taskDataFunctionValue(task.input);return 'common' in value?value.common:undefined}catch{return}}
function commonParameterLabel(task:Task|undefined){const config=commonConfiguration(task);return config&&('registerAttribute' in config||'registerAttributes' in config)?'设备属性':config?.functionCode==='05'?'线圈值':config?.functionCode==='06'?'寄存器值':'数量'}
function commonWord(task:Task|undefined){const config=commonConfiguration(task);return config?('registerAttribute' in config?config.registerAttribute:'registerAttributes' in config?config.registerAttributes.join(', '):config.functionCode==='10'?config.registerValues.length:config.functionCode==='0F'?config.coilValues.length:config.functionCode==='05'||config.functionCode==='06'?config.registerValue:config.quantity):undefined}
async function saveData(value:ReturnType<typeof taskDataValue>){const base=contentBase.value;if(!base||!contentEditing.value||base.id!==id.value)return;try{await saveContent(taskDataBody(base,value))}catch(cause){writeError.value=errorMessage(cause)}}
async function savePropertyFunction(value:ReturnType<typeof taskPropertyFunctionValue>){const base=contentBase.value;if(!base||!contentEditing.value||base.id!==id.value)return;try{await saveContent(taskActionType(base)==='COMMAND_FUNCTION'?taskCommandFunctionBody(base,value):taskActionType(base)==='DATA_DOWNLINK_FUNCTION'?taskDataFunctionBody(base,value):taskPropertyFunctionBody(base,value))}catch(cause){writeError.value=errorMessage(cause)}}
function dataConfiguration(task:Task){try{return taskActionType(task)==='DATA_DOWNLINK'?taskDataValue(task.input):undefined}catch{return}}
function dataRouteConfiguration(task:Task){try{return taskActionType(task)==='DATA_DOWNLINK_FUNCTION'?taskDataFunctionValue(task.input):dataConfiguration(task)}catch{return}}
function functionConfiguration(task:Task|undefined){if(!task)return;try{if(taskActionType(task)==='DATA_DOWNLINK_FUNCTION'){const input=taskDataFunctionValue(task.input);return taskPropertyFunctionValue({format:input.format,source:input.source})}return task.input}catch{return task.input}}
function closeContent(value:boolean){if(value||busy.value||contentPending.value||contentFunctionBusy.value)return;clearContent()}
function contentDependenciesChanged(){scheduleVisited.value=false;devicesVisited.value=false;running.value=false}
async function saveContent(body:TaskWrite){
 const base=contentBase.value
 if(!contentEditing.value||!base||!allowed.value||!manage.value||busy.value||locked.value||contentFunctionBusy.value||contentChildrenBlocked.value)return
 let intent:TaskContentIntent
 try{intent=createTaskContentIntent(projectId.value,base,body)}catch(cause){writeError.value=errorMessage(cause);return}
 contentIntent.value=intent
 const epoch=identityEpoch(),turn=generation,current=()=>active&&turn===generation&&epoch===identityEpoch()&&intent.project===projectId.value&&intent.id===id.value&&allowed.value&&manage.value
 busy.value=true;writeError.value='';let accepted=false
 try{
  const response=await saveTaskContent(intent.project,intent.id,intent.body);accepted=true;if(!current())return
  confirmTaskContent(intent,response);await resource.reload();if(!current())return
  if(resource.error.value)throw resource.error.value
  if(!resource.data.value)throw new Error('任务内容回读不完整，请继续核对。')
  confirmTaskContent(intent,resource.data.value);contentDependenciesChanged();clearContent();locked.value=false
 }catch(cause){if(current()&&!(cause instanceof IdentityChanged)){
  const known=!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409].includes(cause.status)
  contentPending.value=!known;contentConflict.value=known&&cause instanceof ApiError&&cause.status===409;locked.value=contentPending.value||contentConflict.value;writeError.value=errorMessage(cause)
  if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){if(known)clearContent();denied(cause)}
 }}finally{if(current())busy.value=false}
}
/** 未知只读确认当前完整期望状态，不重PUT，也不归因原请求已受理。 */
async function verifyContent(){
 const intent=contentIntent.value
 if(!intent||!contentPending.value||busy.value||!allowed.value||intent.project!==projectId.value||intent.id!==id.value)return
 const epoch=identityEpoch(),turn=generation,current=()=>active&&turn===generation&&epoch===identityEpoch()&&intent.project===projectId.value&&intent.id===id.value&&allowed.value
 busy.value=true
 try{
  await resource.reload();if(!current())return
  if(resource.error.value)throw resource.error.value
  if(!resource.data.value)throw new Error('任务内容仍待核对，未重复保存。')
  confirmTaskContent(intent,resource.data.value);contentDependenciesChanged();clearContent();locked.value=false;writeError.value='已核对当前任务内容，未重复保存。'
 }catch(cause){if(current()&&!(cause instanceof IdentityChanged)){locked.value=true;writeError.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403].includes(cause.status))denied(cause)}}
 finally{if(current())busy.value=false}
}
function openTags(){
 const task=resource.data.value
 if(tab.value!=='settings'||!allowed.value||!manage.value||busy.value||locked.value||childBlocked.value||running.value||editing.value||targetsEditing.value||removal.value||resource.loading.value||resource.error.value||activeEnabled.value||!task?.id||task.id!==id.value)return
 try{const tags=taskTagsValue(task.tags);tagBase.value=JSON.parse(JSON.stringify(task)) as Task;tagRows.value=Object.entries(tags).map(([key,value])=>({...newRuleTag(),key,value}));tagEditing.value=true;writeError.value=''}catch(cause){writeError.value=errorMessage(cause)}
}
function closeTags(){if(!busy.value&&!tagPending.value)clearTags()}
/** 独立标签CAS只提交集合；普通任务内容、目标与计划不进入此请求。 */
async function saveTags(){
 const base=tagBase.value
 if(!tagEditing.value||!base||tagIntent.value||busy.value||locked.value||contentChildrenBlocked.value||!allowed.value||!manage.value||base.id!==id.value)return
 let intent:TaskTagsIntent
 try{intent=createTaskTagsIntent(projectId.value,base,taskTagsDraft(tagRows.value))}catch(cause){writeError.value=errorMessage(cause);return}
 tagIntent.value=intent
 const epoch=identityEpoch(),turn=generation,current=()=>active&&turn===generation&&epoch===identityEpoch()&&intent.project===projectId.value&&intent.id===id.value&&allowed.value&&manage.value
 busy.value=true;writeError.value='';let accepted=false
 try{
  const response=await writeTaskTags(intent);accepted=true;if(!current())return
  confirmTaskTags(intent,response);await resource.reload();if(!current())return
  if(resource.error.value)throw resource.error.value
  if(!resource.data.value)throw new Error('任务标签仍待核对，请勿重复提交。')
  confirmTaskTagsDefinition(intent,resource.data.value);clearTags();locked.value=false
 }catch(cause){if(current()&&!(cause instanceof IdentityChanged)){
  const known=!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,422].includes(cause.status)
  tagPending.value=!known;locked.value=!known||cause instanceof ApiError&&cause.status===409;writeError.value=errorMessage(cause)
  if(known)tagIntent.value=undefined
  if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){if(known)clearTags();denied(cause)}
 }}finally{if(current())busy.value=false}
}
/** UNKNOWN仅GET确认精确集合和版本，再读完整定义；永不补第二次PUT。 */
async function verifyTags(){
 const intent=tagIntent.value
 if(!intent||!tagPending.value||busy.value||!allowed.value||!manage.value||intent.project!==projectId.value||intent.id!==id.value)return
 const epoch=identityEpoch(),turn=generation,current=()=>active&&turn===generation&&epoch===identityEpoch()&&intent.project===projectId.value&&intent.id===id.value&&allowed.value&&manage.value
 busy.value=true
 try{
  const response=await readTaskTags(intent.project,intent.id);if(!current())return
  confirmTaskTags(intent,response);await resource.reload();if(!current())return
  if(resource.error.value)throw resource.error.value
  if(!resource.data.value)throw new Error('任务标签仍待核对，请勿重复提交。')
  confirmTaskTagsDefinition(intent,resource.data.value);clearTags();locked.value=false;writeError.value='已核对当前任务标签，未重复提交。'
 }catch(cause){if(current()&&!(cause instanceof IdentityChanged)){locked.value=true;writeError.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403].includes(cause.status))denied(cause)}}
 finally{if(current())busy.value=false}
}
function openInformation() {
  if (!allowed.value || !manage.value || busy.value || locked.value || childBlocked.value || running.value || targetsEditing.value || removal.value || resource.error.value || !resource.data.value || activeEnabled.value) return
  editing.value = true
}
function openTargets() {
  if (!allowed.value || !manage.value || running.value || busy.value || locked.value || childBlocked.value || editing.value || removal.value || resource.error.value || !resource.data.value || activeEnabled.value) return
  targetsEditing.value = true
}
function denied(cause: ApiError) { resource.clear(); resource.error.value = cause }
async function saveTargets(body: TaskWrite) {
  if (!allowed.value || !manage.value || !targetsEditing.value || busy.value || locked.value || childBlocked.value || removal.value || !resource.data.value) return
  const epoch=identityEpoch(), scope=generation, project=projectId.value, job=id.value
  const current=()=>active && scope===generation && epoch===identityEpoch() && project===projectId.value && job===id.value && allowed.value && manage.value
  pendingManagementWrite.value={project,id:job};busy.value=true;writeError.value=''
  try { await saveTaskTargets(project,job,body);if(!current())return;targetsEditing.value=false;await resource.reload() }
  catch(cause){if(current() && !(cause instanceof IdentityChanged)){writeError.value=errorMessage(cause);locked.value=cause instanceof ApiError && (cause.outcomeUnknown || cause.status===409);if(cause instanceof ApiError && [401,403,404].includes(cause.status))denied(cause)}}
  finally{if(current()){busy.value=false;if(!locked.value)pendingManagementWrite.value=undefined}}
}
function openRemoval() {
  if(activeEnabled.value)return
  const task = resource.data.value
  if (!allowed.value || !manage.value || running.value || busy.value || locked.value || childBlocked.value || editing.value || targetsEditing.value || resource.error.value) return
  if (!task?.id || task.id !== id.value || !Number.isSafeInteger(task.version) || !task.version || task.version < 1) { writeError.value = '请重新读取任务核对最新状态'; return }
  removal.value = { project: projectId.value, id: task.id, expectedVersion: task.version }
}
function closeRemoval(value: boolean) { if (!value && !busy.value) removal.value = undefined }
async function remove() {
  const intent = removal.value
  if (!intent || !allowed.value || !manage.value || busy.value || locked.value || childBlocked.value || intent.project !== projectId.value || intent.id !== id.value) return
  const epoch = identityEpoch(), scope = generation
  const current = () => active && scope === generation && epoch === identityEpoch() && intent.project === projectId.value && intent.id === id.value && allowed.value && manage.value
  pendingManagementWrite.value={project:intent.project,id:intent.id};busy.value = true; writeError.value = ''
  try { await deleteTask(intent.project, intent.id, intent.expectedVersion); if (!current()) return; pendingManagementWrite.value=undefined;removal.value = undefined; resource.clear(); await router.push(returnPath.value) }
  catch (e) { if (current() && !(e instanceof IdentityChanged)) {
    writeError.value = errorMessage(e); locked.value = e instanceof ApiError && (e.outcomeUnknown || e.status === 409)
    if (e instanceof ApiError && [401,403,404].includes(e.status)) { resource.clear(); resource.error.value = e }
  } }
  finally { if (current()) { busy.value = false; if(!locked.value)pendingManagementWrite.value=undefined } }
}
function closeRunner(value:boolean){if(!value && !busy.value)running.value=false}
function openRunner(){if(activeEnabled.value)return;const task=resource.data.value;if(!allowed.value || !runnable.value || busy.value || locked.value || childBlocked.value || editing.value || targetsEditing.value || removal.value || resource.error.value || !task?.id || task.id!==id.value || !['ACTIVE','PAUSED'].includes(task.status||''))return;try{cas(task.version);writeError.value='';running.value=true}catch(cause){writeError.value=errorMessage(cause)}}
const loadRunnerCandidates=(cursor:string|undefined,signal:AbortSignal)=>{const task=resource.data.value;if(!running.value || !task?.id || task.id!==id.value)throw new Error('请重新读取任务');return taskRunnerChoices(projectId.value,task.id,cas(task.version),cursor,signal)}
function runnerConflict(cause:ApiError){if(!running.value)return;locked.value=true;running.value=false;writeError.value=errorMessage(cause)}
async function submitRun(ids?:string[]){
 const task=resource.data.value
 if(!running.value || !allowed.value || !runnable.value || busy.value || locked.value || childBlocked.value || !task?.id || task.id!==id.value || task.status!=='ACTIVE')return
 const epoch=identityEpoch(),scope=generation,project=projectId.value,job=task.id
 const current=()=>active && generation===scope && epoch===identityEpoch() && project===projectId.value && job===id.value && allowed.value && runnable.value
 pendingRun.value={project,id:job};busy.value=true;writeError.value=''
 try {
  if(ids===undefined)await runTask(project,job,undefined,true)
  else await runTaskOnDevices(project,job,cas(task.version),ids)
  if(!current())return
  running.value=false
  showOperationFeedback('执行已受理')
  await resource.reload()
 }
 catch(cause){if(current() && !(cause instanceof IdentityChanged)){writeError.value=errorMessage(cause);locked.value=cause instanceof ApiError && (cause.outcomeUnknown || cause.status===409);if(cause instanceof ApiError && [401,403,404].includes(cause.status))denied(cause)}}
 finally{if(current()){busy.value=false;if(!locked.value)pendingRun.value=undefined}}
}
/** 复用既有全局启停端口；开关直接保存，精确回读前保留服务器状态。 */
function changeEnabled(value:unknown){
 const task=resource.data.value
 if(typeof value!=='boolean'||!allowed.value||!manage.value||busy.value||locked.value||childBlocked.value||running.value||editing.value||targetsEditing.value||removal.value||activeEnabled.value||resource.loading.value||resource.error.value||!task?.id||task.id!==id.value||task.status!=='ACTIVE'&&task.status!=='PAUSED'||value===(task.status==='ACTIVE'))return
 try{activeEnabled.value={project:projectId.value,id:task.id,enabled:value,version:cas(task.version)};writeError.value='';void saveEnabled()}catch(cause){writeError.value=errorMessage(cause)}
}
function enabledMatches(intent:EnabledIntent){const task=resource.data.value;return task?.id===intent.id&&task.status===(intent.enabled?'ACTIVE':'PAUSED')&&cas(task.version)>=intent.version}
async function saveEnabled(){
 const intent=activeEnabled.value
 if(!intent||!allowed.value||!manage.value||busy.value||locked.value||childBlocked.value||intent.project!==projectId.value||intent.id!==id.value)return
 const epoch=identityEpoch(),turn=generation,current=()=>active&&turn===generation&&epoch===identityEpoch()&&intent.project===projectId.value&&intent.id===id.value&&allowed.value&&manage.value
 busy.value=true;writeError.value='';pendingEnabled.value={...intent,version:intent.version+1};let accepted=false
 try{
  const response=await (intent.enabled?enableTask(intent.project,intent.id):disableTask(intent.project,intent.id));accepted=true;if(!current())return
  if(response.id!==intent.id||response.status!==(intent.enabled?'ACTIVE':'PAUSED'))throw new Error('任务启停回执不完整，请重新读取核对')
  pendingEnabled.value={...intent,version:Math.max(intent.version+1,cas(response.version))};activeEnabled.value=undefined
  await resource.reload();if(!current())return
  if(resource.error.value)throw resource.error.value
  if(!enabledMatches(pendingEnabled.value))throw new Error('任务启停已受理，但当前状态回读不一致，请继续核对')
  pendingEnabled.value=undefined
 }catch(cause){if(current()&&!(cause instanceof IdentityChanged)){
  writeError.value=errorMessage(cause);activeEnabled.value=undefined;locked.value=accepted||!(cause instanceof ApiError)||cause.outcomeUnknown||![400,401,403,404].includes(cause.status)
  // 明确的业务冲突没有受理启停：仍需回读，但不能要求回读达到未执行的目标状态。
  if(!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.status===409&&cause.code!==10014)pendingEnabled.value=undefined
  if(!locked.value)pendingEnabled.value=undefined
  if(cause instanceof ApiError&&[401,403,404].includes(cause.status))denied(cause)
 }}finally{if(current())busy.value=false}
}
async function rereadDevices() {
  if (busy.value || devicesBusy.value || !allowed.value) return
  const project = projectId.value, job = id.value, epoch = identityEpoch()
  running.value = false; editing.value = false; targetsEditing.value = false; removal.value = undefined
  await router.replace({ query: { ...route.query, tab: 'devices' } })
  if (project !== projectId.value || job !== id.value || epoch !== identityEpoch()) return
  if (locked.value || resource.error.value) await reread()
  await nextTick()
  if (project === projectId.value && job === id.value && epoch === identityEpoch()) await devicesPanel.value?.reread()
}
async function rereadSchedule() {
  if (busy.value || scheduleBusy.value || !allowed.value) return
  const project = projectId.value, job = id.value, epoch = identityEpoch()
  running.value = false; editing.value = false; targetsEditing.value = false; removal.value = undefined
  await router.replace({ query: { ...route.query, tab: 'schedule' } })
  if (project !== projectId.value || job !== id.value || epoch !== identityEpoch()) return
  if (locked.value || resource.error.value) await reread()
  await nextTick()
  if (project === projectId.value && job === id.value && epoch === identityEpoch()) await schedulePanel.value?.reread()
}
async function refreshTaskContext() {
  await reread()
  if (resource.error.value) throw resource.error.value
  if (resource.data.value?.id !== id.value) throw new Error('任务身份无法核对，请重新读取')
}
async function reread() {
  if (busy.value || logsBusy.value) return
  if(visibilityIntent.value){await verifyVisibility();return}
  if(tagIntent.value&&tagPending.value){await verifyTags();return}
  if(contentIntent.value&&contentPending.value){await verifyContent();return}
  if(contentEditing.value){await resource.reload();return}
  const epoch = identityEpoch(), scope = generation, project = projectId.value, job = id.value
  running.value = false; editing.value = false; targetsEditing.value = false; removal.value = undefined
  await resource.reload()
  // 范围被替换后，旧人工读取不能解除新任务自己的核对锁。
  if (active && generation === scope && identityEpoch() === epoch && projectId.value === project && id.value === job && allowed.value
    && !resource.error.value && resource.data.value?.id === job) {
      try{if(pendingEnabled.value&&!enabledMatches(pendingEnabled.value)){locked.value=true;writeError.value='当前任务状态尚未与本次启停请求一致，请继续读取核对';return}}catch(cause){locked.value=true;writeError.value=errorMessage(cause);return}
      pendingEnabled.value=undefined;activeEnabled.value=undefined;pendingManagementWrite.value=undefined;pendingRun.value=undefined;locked.value = false; writeError.value = ''
    }
}
</script>
<template><main class="tl-page">
  <PageHeader title="任务详情" back @back="router.push(returnPath)" />
  <div v-if="resource.data.value" class="reference-object-heading"><h2>{{ resource.data.value.name }}</h2><el-button size="small" v-if="manage" :disabled="busy || locked || childBlocked || !!activeEnabled || running || targetsEditing || !!removal || !!resource.error.value" @click="openInformation">编辑</el-button><p>ID：{{ resource.data.value.id }}</p></div>
  <el-alert v-if="visibilityIntent" :title="visibilityError||'应用可见性保存结果正在核对'" type="warning" :closable="false"><el-button :disabled="visibilityBusy||busy||!allowed" @click="verifyVisibility">重新读取应用可见性核对</el-button></el-alert>
  <el-alert v-if="writeError" :title="writeError" type="error" :closable="false"><el-button v-if="locked" @click="reread">重新读取核对</el-button></el-alert>
  <el-alert v-if="devicesLocked" title="设备操作结果尚未核对，请重新读取任务与设备" type="error" :closable="false"><el-button :disabled="busy || devicesBusy" @click="rereadDevices">核对设备状态</el-button></el-alert>
  <el-alert v-if="scheduleLocked" title="定时设置结果尚未核对，请重新读取任务与计划" type="error" :closable="false"><el-button :disabled="busy || scheduleBusy" @click="rereadSchedule">核对定时设置</el-button></el-alert>
  <el-alert v-if="logsLocked" title="日志操作结果尚未核对，请返回日志页签读取最新状态" type="error" :closable="false"><el-button @click="router.replace({ query: { ...route.query, tab: 'logs' } })">查看日志核对</el-button></el-alert>
  <AsyncState :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" @retry="reread">
    <el-tabs v-model="tab" class="tl-tabs"><el-tab-pane label="任务" name="task" /><el-tab-pane label="定时" name="schedule" /><el-tab-pane label="设备" name="devices" /><el-tab-pane label="统计" name="statistics" /><el-tab-pane label="日志" name="logs" /><el-tab-pane label="设置" name="settings" /></el-tabs>
    <template v-if="resource.data.value">
      <div v-show="tab === 'task'" class="task-overview-grid">
        <div class="task-main-column"><SectionPanel title="基本信息"><dl class="task-info-grid">
          <div><dt>目标类型</dt><dd>{{ targetLabel }}</dd></div>
          <div><dt>目标</dt><dd class="task-saved-targets"><TaskTargetSummary :task="resource.data.value" /><el-button v-if="manage" size="small" aria-label="编辑目标" :disabled="busy || locked || childBlocked || !!activeEnabled || running || editing || !!removal || !!resource.error.value" @click="openTargets">编辑</el-button></dd></div>
          <div><dt>创建时间</dt><dd>{{ formatTime(resource.data.value.createdAt) }}</dd></div>
          <div><dt>修改时间</dt><dd>{{ formatTime(resource.data.value.updatedAt) }}</dd></div>
        </dl></SectionPanel>
          <SectionPanel v-if="tab==='task'" title="任务内容" class="task-content-card"><el-button v-if="manage" size="small" class="task-content-edit" aria-label="编辑任务内容" :disabled="busy||locked||childBlocked||!!activeEnabled||running||editing||targetsEditing||!!removal||!!resource.error.value||!contentType(resource.data.value)" @click="openContent">编辑</el-button><dl class="task-info-grid task-command-fields">
            <div><dt>任务类型</dt><dd>{{contentType(resource.data.value)?taskBaseActionLabel(resource.data.value):'—'}}</dd></div>
            <div v-if="contentType(resource.data.value)==='COMMAND'"><dt>命令标识</dt><dd>{{ resource.data.value.commandKey || '—' }}</dd></div>
            <template v-if="contentType(resource.data.value)==='OTA_UPGRADE'"><div><dt>任务</dt><dd>OTA 推送</dd></div><div><dt>版本属性</dt><dd>{{otaConfiguration(resource.data.value)?.versionProperty||'—'}}</dd></div><div><dt>模块</dt><dd>{{otaConfiguration(resource.data.value)?.module||'—'}}</dd></div></template><div v-else-if="commonConfiguration(resource.data.value)"><dt>{{commonConfiguration(resource.data.value)?.kind==='MODBUS_TCP'?'Modbus TCP通用':'Modbus RTU通用'}}</dt><dd>从机 {{commonConfiguration(resource.data.value)?.unitId}} · 功能码 {{commonConfiguration(resource.data.value)?.functionCode}} · 起始地址 {{commonConfiguration(resource.data.value)?.registerAddress}} · {{commonParameterLabel(resource.data.value)}} {{commonWord(resource.data.value)}}</dd></div><div v-else-if="isTaskFunction(contentType(resource.data.value))"><dt>任务</dt><dd>{{contentLabel(resource.data.value)}}</dd></div>
            <template v-if="isTaskData(contentType(resource.data.value))"><div><dt>推送方式</dt><dd>{{dataRouteConfiguration(resource.data.value)?.protocol||'—'}}</dd><el-button v-if="manage" size="small" class="task-data-route-edit" aria-label="编辑推送方式" :disabled="busy||locked||childBlocked||!!activeEnabled||running||editing||targetsEditing||!!removal||!!resource.error.value||!dataRouteConfiguration(resource.data.value)" @click="openDataRoute">编辑</el-button></div><div><dt>自定义数据流</dt><dd>{{dataRouteConfiguration(resource.data.value)?.streamIdentifier||'—'}}</dd><el-button v-if="manage" size="small" class="task-data-route-edit" aria-label="编辑自定义数据流" :disabled="busy||locked||childBlocked||!!activeEnabled||running||editing||targetsEditing||!!removal||!!resource.error.value||!dataRouteConfiguration(resource.data.value)" @click="openDataRoute">编辑</el-button></div><template v-if="contentType(resource.data.value)==='DATA_DOWNLINK'"><div><dt>消息格式</dt><dd>{{dataConfiguration(resource.data.value)?.format==='TEXT'?'Plaintext':dataConfiguration(resource.data.value)?.format||'—'}}</dd></div><div class="task-command-parameters"><dt>下发消息</dt><dd><pre>{{dataConfiguration(resource.data.value)?.message}}</pre></dd></div></template></template>
            <div v-else-if="contentType(resource.data.value)!=='OTA_UPGRADE'&&!isTaskFunction(contentType(resource.data.value))" class="task-command-parameters"><dt>{{contentType(resource.data.value)==='CLOUD_UPDATE'?'更新属性':contentType(resource.data.value)==='PROPERTY_SET'?'下发属性':contentType(resource.data.value)==='COMMAND'?'命令参数':'任务内容'}}</dt><dd><pre>{{ resource.data.value.input == null ? '—' : JSON.stringify(resource.data.value.input, null, 2) }}</pre></dd></div>
          </dl></SectionPanel>
          <TaskAppVisibilityPanel v-if="tab==='task'" :value="visibility" :disabled="visibilityInactive" :loading="visibilityLoading||visibilityBusy" :error="visibilityIntent?'':visibilityError" @change="changeVisibility" @retry="rereadVisibility"/>
        </div>
        <aside class="task-state-column"><SectionPanel title="任务状态"><div v-if="tab==='task'&&allowed&&resource.data.value&&!resource.error.value" class="task-global-enabled"><span>启用任务</span><p class="task-state-description">任务停用后，不论是手动运行还是定时运行，都无法启动任务。</p><el-switch :model-value="resource.data.value.status==='ACTIVE'" aria-label="启用任务" :disabled="!manage||busy||locked||childBlocked||running||editing||targetsEditing||!!removal||!!activeEnabled||resource.loading.value||!['ACTIVE','PAUSED'].includes(resource.data.value.status||'')" @change="changeEnabled"/></div></SectionPanel>
          <SectionPanel title="任务运行" class="task-run-card"><span>手动运行任务</span><p class="task-state-description">不论任务是否开启定时，都可以手动运行任务。</p><el-button type="primary" size="small" v-if="allowed && runnable && resource.data.value && !resource.error.value" :disabled="busy || locked || childBlocked || !!activeEnabled || running || editing || targetsEditing || !!removal || !['ACTIVE','PAUSED'].includes(resource.data.value.status||'')" @click="openRunner">打开运行器</el-button></SectionPanel>
        </aside>
      </div>
      <UsageStatisticsPanel v-if="tab === 'statistics'" kind="task" :id="id" @denied="denied" />
      <template v-if="tab === 'settings'">
        <SectionPanel title="任务描述" class="task-settings-section"><p v-if="resource.data.value.description" class="task-settings-description">{{ resource.data.value.description }}</p><el-button v-if="manage" size="small" aria-label="编辑任务描述" :disabled="busy||locked||childBlocked||!!activeEnabled||running||targetsEditing||!!removal||!!resource.error.value" @click="openInformation">编辑</el-button></SectionPanel>
        <SectionPanel title="标签" class="task-settings-section task-tags-settings"><el-table v-if="settingsTags" :data="tagTableRows" empty-text="无标签"><el-table-column prop="key" label="标签名称"/><el-table-column prop="value" label="值"/></el-table><el-alert v-else title="任务标签回读不完整，请重新读取。" type="warning" :closable="false"/><el-button v-if="manage" size="small" class="task-settings-tags-edit" aria-label="编辑任务标签" :disabled="busy||locked||childBlocked||running||editing||targetsEditing||!!removal||!!activeEnabled||!!resource.error.value||!settingsTags" @click="openTags">编辑</el-button></SectionPanel>
        <SectionPanel title="移除任务" class="task-settings-section task-removal-settings"><p class="tl-muted">任务移除后无法恢复。</p><el-button v-if="manage" type="danger" size="small" :disabled="busy||locked||childBlocked||!!activeEnabled||running||editing||targetsEditing||!!resource.error.value" @click="openRemoval">移除任务</el-button></SectionPanel>
      </template>
    </template>
  </AsyncState>
  <TaskSchedulePanel v-if="scheduleVisited" ref="schedulePanel" :selection="timerSelection" interval-supported solar-supported :job-id="id" :project-zone="currentProject?.timezone" :transport="taskScheduleTransport" :refresh-context="refreshTaskContext" :inactive="tab !== 'schedule' || visibilityBlocked || logsBusy || logsLocked || logsConfirming || !allowed || resource.loading.value && !scheduleBusy || !!resource.error.value || resource.data.value?.id !== id || busy || locked || tagEditing || devicesBusy || devicesLocked || running || editing || targetsEditing || !!removal || !!activeEnabled" @busy="scheduleBusy = $event" @locked="scheduleLocked = $event" @editing="scheduleEditing = $event" @denied="denied" />
  <TaskRelatedDevicesPanel v-if="devicesVisited" ref="devicesPanel" :job-id="id" :definition-version="resource.data.value?.version" :enabled="resource.data.value?.status === 'ACTIVE'" :transport="taskRelatedDevicesTransport" :refresh-context="refreshTaskContext" :inactive="tab !== 'devices' || visibilityBlocked || logsBusy || logsLocked || logsConfirming || !allowed || resource.loading.value || !!resource.error.value || resource.data.value?.id !== id || busy || locked || tagEditing || scheduleBusy || scheduleLocked || scheduleEditing || running || editing || targetsEditing || !!removal || !!activeEnabled" @busy="devicesBusy = $event" @locked="devicesLocked = $event" @denied="denied" />
  <TaskDebugLogPanel v-if="logsVisited" :job-id="id" :transport="taskDebugLogTransport" :inactive="tab !== 'logs' || visibilityBlocked || !allowed || resource.loading.value || !!resource.error.value || resource.data.value?.id !== id || busy || locked || tagEditing || devicesBusy || devicesLocked || scheduleBusy || scheduleLocked || scheduleEditing || running || editing || targetsEditing || !!removal || !!activeEnabled" @busy="logsBusy = $event" @locked="logsLocked = $event" @confirming="logsConfirming = $event" @denied="denied" />
  <TaskRunnerDialog v-if="running && resource.data.value" :model-value="true" :task="resource.data.value" :busy="busy" :locked="locked || childBlocked || !!activeEnabled || !allowed || !runnable" :error="writeError" :load-candidates="loadRunnerCandidates" @update:model-value="closeRunner" @run="submitRun" @denied="denied" @conflict="runnerConflict" />
  <el-dialog :model-value="tagEditing" title="编辑标签" width="min(800px,94vw)" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!busy&&!tagPending" :show-close="!busy&&!tagPending" destroy-on-close append-to-body @update:model-value="closeTags"><RuleTagsEditor v-if="tagEditing" v-model="tagRows" ariaLabel="任务标签" :disabled="busy||locked||tagPending||!manage"/><el-alert v-if="writeError" :title="writeError" type="warning" :closable="false"/><template #footer><el-button :disabled="busy||tagPending" @click="closeTags">取消</el-button><el-button v-if="tagPending" :disabled="busy" @click="verifyTags">重新读取标签核对</el-button><el-button type="primary" :loading="busy" :disabled="locked||tagPending||!manage" @click="saveTags">提交</el-button></template></el-dialog>
  <TaskDataRouteDialog v-if="contentPurpose==='route'" :model-value="contentEditing" :value="contentBase?dataRouteConfiguration(contentBase):undefined" :busy="busy" :locked="locked" :pending="contentPending" :error="writeError" @update:model-value="closeContent" @save="saveDataRoute" @verify="verifyContent"/>
  <TaskOtaUpgradeDialog v-else-if="contentType(contentBase)==='OTA_UPGRADE'" :model-value="contentEditing" :value="contentBase?.input" :selection="otaSelection(contentBase)" :busy="busy" :locked="locked" :pending="contentPending" :error="writeError" @update:model-value="closeContent" @save="saveOta" @verify="verifyContent"/>
  <TaskModbusTcpCommonDialog :selection="timerSelection" v-else-if="commonConfiguration(contentBase)?.kind==='MODBUS_TCP'" :model-value="contentEditing" :value="commonConfiguration(contentBase)" :busy="busy" :locked="locked" :pending="contentPending" :error="writeError" @update:model-value="closeContent" @save="saveModbusTcp" @verify="verifyContent" @busy="contentFunctionBusy=$event" @denied="denied"/>
  <TaskModbusRtuCommonDialog :selection="timerSelection" v-else-if="commonConfiguration(contentBase)?.kind==='MODBUS_RTU'" :model-value="contentEditing" :value="commonConfiguration(contentBase)" :busy="busy" :locked="locked" :pending="contentPending" :error="writeError" @update:model-value="closeContent" @save="saveModbus" @verify="verifyContent" @busy="contentFunctionBusy=$event" @denied="denied"/>
  <TaskPropertyFunctionDialog v-else-if="isTaskFunction(contentType(contentBase))" :purpose="contentType(contentBase)==='COMMAND_FUNCTION'?'command':contentType(contentBase)==='DATA_DOWNLINK_FUNCTION'?'data':contentType(contentBase)==='CLOUD_UPDATE_FUNCTION'?'cloud-update':'downlink'" :model-value="contentEditing" :value="functionConfiguration(contentBase)" :busy="busy" :locked="locked" :pending="contentPending" :error="writeError" @update:model-value="closeContent" @save="savePropertyFunction" @verify="verifyContent" @busy="contentFunctionBusy=$event" @denied="denied"/>
  <TaskDataContentDialog v-else-if="contentType(contentBase)==='DATA_DOWNLINK'" :model-value="contentEditing" :value="contentBase?.input" :busy="busy" :locked="locked" :pending="contentPending" :error="writeError" @update:model-value="closeContent" @save="saveData" @verify="verifyContent"/>
  <TaskPropertyContentDialog v-else-if="contentType(contentBase)==='PROPERTY_SET'||contentType(contentBase)==='CLOUD_UPDATE'" :model-value="contentEditing" :value="contentBase?.input" :purpose="contentType(contentBase)==='CLOUD_UPDATE'?'cloud-update':'downlink'" :busy="busy" :locked="locked" :pending="contentPending" :error="writeError" @update:model-value="closeContent" @save="saveProperties" @verify="verifyContent"/>
  <TaskCommandContentDialog v-else :model-value="contentEditing" :task="contentBase" :busy="busy" :locked="locked" :pending="contentPending" :error="writeError" @update:model-value="closeContent" @save="saveContent" @verify="verifyContent" />
  <TaskInformationDialog v-model="editing" :task="resource.data.value" :busy="busy" :locked="locked || childBlocked || !!activeEnabled || !manage || targetsEditing" :error="writeError" @save="save" />
  <TaskTargetsDialog v-model="targetsEditing" :task="resource.data.value" :busy="busy" :locked="locked || childBlocked || !!activeEnabled || !manage" :error="writeError" @save="saveTargets" @denied="denied" />
  <el-dialog :model-value="!!removal" title="提示" width="420px" align-center :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" @update:model-value="closeRemoval">
    <div class="task-removal-prompt"><el-icon class="task-removal-warning"><WarningFilled /></el-icon><span>确认移除任务吗？</span></div>
    <template #footer><el-button :disabled="busy" @click="closeRemoval(false)">取消</el-button><el-button type="primary" :loading="busy" :disabled="locked || childBlocked || !manage" @click="remove">确定</el-button></template>
  </el-dialog>
</main></template>
<style scoped>.task-main-column>.task-content-card{margin-bottom:10px}.task-data-route-edit{margin-top:10px;height:28px;padding:7px 15px}.task-settings-section{border:0;border-radius:0;margin:0 0 30px;overflow:visible}.task-settings-section :deep(.tl-section-panel__header){padding:0;min-height:22px;background:transparent;border:0}.task-settings-section :deep(.tl-section-panel__header h2){font-size:16px;line-height:22px;font-weight:600;color:#002822}.task-settings-section :deep(.tl-section-panel__body){padding:0;margin-top:16px}.task-tags-settings :deep(.tl-section-panel__body){margin-top:6px}.task-tags-settings :deep(.el-table th.el-table__cell){padding:6px 0;font-size:12px;font-weight:400;color:#303133}.task-tags-settings :deep(.el-table td.el-table__cell){padding:6px 0;font-size:12px;color:#606266}.task-tags-settings :deep(.el-table .cell){line-height:20px;padding:0 10px;font-size:inherit}.task-tags-settings :deep(.el-table__empty-text){font-size:12px;line-height:60px;color:#999}.task-settings-tags-edit{margin-top:10px}.task-settings-description{margin:0 0 12px;white-space:pre-wrap}.task-removal-settings :deep(.tl-section-panel__body){margin-top:4px}.task-removal-settings p{margin:0 0 10px}.task-content-card{position:relative}.task-content-edit{position:absolute;right:16px;top:8px}.task-command-parameters{grid-column:1/-1}.task-command-parameters pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font-size:13px;line-height:20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.task-overview-grid :deep(.tl-section-panel__header){background:#fff}.task-info-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin:0}.task-info-grid>div{min-width:0}.task-info-grid dt{color:var(--tl-text);font-size:12px;line-height:20px;margin-bottom:4px}.task-info-grid dd{margin:0;color:var(--tl-title);line-height:20px;overflow-wrap:anywhere}.task-run-card> :deep(.tl-section-panel__body){font-size:14px;line-height:20px}.task-run-card :deep(.el-button){margin-top:6px}.task-state-column{min-width:0}@media(max-width:600px){.task-info-grid{grid-template-columns:1fr;gap:20px}}.task-overview-grid{display:grid;grid-template-columns:minmax(0,2fr) minmax(260px,1fr);gap:16px;align-items:start}.task-global-enabled{display:flex;flex-direction:column;align-items:flex-start;gap:6px;font-size:14px;color:var(--tl-text)}.task-state-description{color:var(--tl-muted);font-size:12px;line-height:20px;margin:0}@media(max-width:840px){.task-overview-grid{grid-template-columns:1fr}}.reference-object-heading { display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin:10px 0 24px; }.reference-object-heading h2 { margin:0;font-size:26px;line-height:34px;font-weight:400;color:#002822;overflow-wrap:anywhere;min-width:0; }.reference-object-heading p { width:100%;margin:0;color:var(--tl-muted);font-size:12px;overflow-wrap:anywhere; }.task-saved-targets { display:flex;flex-direction:column;align-items:flex-start;flex-wrap:wrap;gap:8px; }.task-saved-targets span { overflow-wrap:anywhere;max-width:100%; }.task-removal-prompt { display:flex;align-items:center;gap:12px;min-height:36px; }.task-removal-warning { color:var(--el-color-warning);font-size:20px;flex-shrink:0; }</style>
