<script setup lang="ts">
import {useRouter} from 'vue-router'
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {session,projectId,currentProject,can} from '@/core/session'
import {ApiError,errorMessage,IdentityChanged,identityEpoch,onIdentityChange} from '@/core/http'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {Plus,Refresh,VideoPlay} from '@element-plus/icons-vue'
import NotificationCustomerChannels from '../alarms/NotificationCustomerChannels.vue'
import DeviceAlarmHistory from '../alarms/DeviceAlarmHistory.vue'
import {ruleKinds,ruleKindLabels} from '../rules/rule-builder-draft'
import type {DeviceRuleDefinition} from '../rules/device-rule-definition-port'
import {externalAction} from '../rules/rule-external-action-draft'
import {definitionUuid,type DeviceTaskDefinition} from '../rules/device-task-definition-port'
import {cas,taskActionLabel,taskActionType,taskBaseActionLabel,type Task} from '../rules/models'
import {isTaskFunction} from '../rules/task-property-function'
import {getTask,runTask,runTaskOnDevices} from '../rules/api'
import {taskRunnerChoices} from '../rules/task-choices'
import TaskRunnerDialog from '../rules/TaskRunnerDialog.vue'
import {taskScheduleTransport} from '../rules/task-schedule-transport'
import {showOperationFeedback} from '@/ui/operation-feedback'
import {typeAssociationsTransport,type TypeAssociationsTransport,type TypeRuleFilters,type TypeRulePage,type TypeTaskPage,type TypeAlarmPage} from './type-associations-api'
const props=withDefaults(defineProps<{typeId:string;kind?:'rules'|'tasks'|'alarms';disabled?:boolean;transport?:TypeAssociationsTransport}>(),{disabled:false,transport:()=>typeAssociationsTransport})
const router=useRouter()
function openRule(rule:string){if(!props.disabled&&rulesAllowed.value&&definitionUuid(rule))void router.push({path:'/rules/messages/'+rule,query:{source:'device-type',deviceTypeId:props.typeId}})}
const emit=defineEmits<{'create-task':[typeId:string];'create-alarm':[typeId:string];'edit-alarm':[typeId:string,ruleId:string];'create-rule':[typeId:string]}>()
type Kind='rules'|'tasks'|'alarms'
const roles=['OWNER','ADMIN','OPERATOR','VIEWER'],member=computed(()=>session.ready&&!session.transitioning&&definitionUuid(props.typeId)&&!!session.user?.accountId&&!!currentProject.value&&['ACTIVE','ARCHIVED'].includes(currentProject.value.status||'')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value.myRole||''))
const rulesAllowed=computed(()=>member.value&&can('rule:manage')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||'')),tasksAllowed=computed(()=>member.value),alarmsAllowed=computed(()=>member.value&&can('alarm:read'))
const taskCreateAllowed=computed(()=>tasksAllowed.value&&currentProject.value?.status==='ACTIVE'&&can('task:manage')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const ruleCreateAllowed=computed(()=>rulesAllowed.value&&currentProject.value?.status==='ACTIVE'&&can('device:read'))
const taskReadable=computed(()=>tasksAllowed.value&&can('task:read'))
const taskRunAllowed=computed(()=>taskReadable.value&&can('task:run')&&currentProject.value?.status==='ACTIVE')
function createRule(){if(ruleCreateAllowed.value&&!props.disabled)emit('create-rule',props.typeId)}
const alarmManageAllowed=computed(()=>alarmsAllowed.value&&currentProject.value?.status==='ACTIVE'&&can('device:read')&&can('alarm:manage')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
function createAlarm(){if(alarmManageAllowed.value&&!props.disabled)emit('create-alarm',props.typeId)}
function createTask(){if(taskCreateAllowed.value&&!props.disabled)emit('create-task',props.typeId)}
const allowed=(kind:Kind)=>kind==='rules'?rulesAllowed.value:kind==='tasks'?tasksAllowed.value:alarmsAllowed.value
const active=ref<Kind>('rules'),ruleFilters=ref<TypeRuleFilters>({status:'',ruleType:''}),taskStatus=ref<''|'ACTIVE'|'PAUSED'>(''),ruleCursors=ref<(string|undefined)[]>([undefined]),taskCursors=ref<(string|undefined)[]>([undefined]),alarmPage=ref(1)
const taskTypes = ['属性下发', '属性更新', '命令下发', '自定义数据下发'] as const
const taskType = ref<'' | typeof taskTypes[number]>('')
const showRuleIntroduction=computed(()=>ruleCursors.value.length===1&&!ruleFilters.value.status&&!ruleFilters.value.ruleType)
const showTaskIntroduction = computed(() => taskCursors.value.length === 1 && !taskStatus.value && !taskType.value)
const rules=shallowRef<TypeRulePage>(),tasks=shallowRef<TypeTaskPage>(),alarms=shallowRef<TypeAlarmPage>(),loading=ref<Record<Kind,boolean>>({rules:false,tasks:false,alarms:false}),errors=ref<Record<Kind,string>>({rules:'',tasks:'',alarms:''})
const historyRuleId=ref<string>()
function hasAlarmRule(id:string){return !props.disabled&&active.value==='alarms'&&alarmsAllowed.value&&!loading.value.alarms&&definitionUuid(id)&&alarms.value?.items.some(row=>row.id===id)}
function editAlarm(id:string){if(alarmManageAllowed.value&&hasAlarmRule(id))emit('edit-alarm',props.typeId,id)}
function showAlarmHistory(id:string){if(hasAlarmRule(id))historyRuleId.value=id}
const actionBadges=shallowRef<Record<string,ReturnType<typeof actionStyle>[]>>({})
const taskSchedules=shallowRef<Record<string,string>>({})
const scheduleLabels={MANUAL:'关闭定时',ONCE:'只运行一次',DAILY:'每日定时',INTERVAL:'间隔时间重复',SOLAR:'日出日落',UNMAPPED:'CRON'}
const runner=shallowRef<Task>(),runnerError=ref(''),runnerBusy=ref(false),runnerUnknown=ref(false)
let runnerRequest:AbortController|undefined
let generation=0,alive=true;const tickets={rules:0,tasks:0,alarms:0},controllers:Partial<Record<Kind,AbortController>>={}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,type:props.typeId,account:session.user?.accountId}}
function current(s:ReturnType<typeof capture>,kind:Kind){return alive&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.type===props.typeId&&s.account===session.user?.accountId&&allowed(kind)}
function clear(kind:Kind){tickets[kind]++;controllers[kind]?.abort();loading.value={...loading.value,[kind]:false};errors.value={...errors.value,[kind]:''};if(kind==='rules'){rules.value=undefined;actionBadges.value={};ruleCursors.value=[undefined]}else if(kind==='tasks'){tasks.value=undefined;taskSchedules.value={};taskCursors.value=[undefined]}else{alarms.value=undefined;alarmPage.value=1;historyRuleId.value=undefined}}
function reset(){generation++;resetRunner();for(const kind of ['rules','tasks','alarms'] as const)clear(kind)}
async function loadRuleActions(rows:DeviceRuleDefinition[],s:ReturnType<typeof capture>,ticket:number,signal:AbortSignal){
 const read=props.transport.ruleActions
 if(!read)return
 for(let index=0;index<rows.length;index+=4){
  const batch=rows.slice(index,index+4)
  const result=await Promise.allSettled(batch.map(row=>read(s.project,s.type,row,signal)))
  if(!current(s,'rules')||tickets.rules!==ticket)return
  actionBadges.value={...actionBadges.value,...Object.fromEntries(result.flatMap((entry,i)=>entry.status==='fulfilled'?[[batch[i]!.id,entry.value.map(actionStyle)]]:[]))}
 }
}
function actionStyle(type:string){
 if(externalAction(type))return {glyph:'󰤲',tone:'external',label:type==='external-mqtt-forward-action'?'推送到外部 MQTT':'推送到外部 URL'}
 if(type==='report-gateway-properties-function')return {glyph:'󰡱',tone:'gateway',label:'向当前网关上报子设备属性'}
 if(['report-cloud-function','event-cloud-function','cloud-function'].includes(type))return {glyph:'󰡱',tone:'function',label:'自定义云函数'}
 if(type.startsWith('DATA_'))return {glyph:'󰡱',tone:'function',label:'自定义数据操作'}
 return {glyph:'󰭽',tone:'default',label:'规则操作'}
}
// 类型目录只支持状态查询。沿同一组授权游标跳过无匹配页，避免把首个空页当成整个类型无结果。
async function loadTaskPage(s: ReturnType<typeof capture>, signal: AbortSignal) {
 const status = taskStatus.value, type = taskType.value
 const used = [...taskCursors.value]
 for (;;) {
  signal.throwIfAborted()
  const page = await props.transport.tasks(s.project, s.type, status, used.slice(), signal)
  if (!type) return page
  const items = page.items.filter(row => taskBaseActionLabel(row) === type)
  if (items.length || !page.hasMore || !page.nextCursor) return { ...page, items }
  used.push(page.nextCursor)
 }
}
async function loadTaskSchedules(rows:DeviceTaskDefinition[],scope:ReturnType<typeof capture>,ticket:number,signal:AbortSignal){
 for(let start=0;start<rows.length;start+=4){
  if(!taskReadable.value||!current(scope,'tasks')||signal.aborted||tickets.tasks!==ticket)return
  const results=await Promise.allSettled(rows.slice(start,start+4).map(async row=>{
   const plan=await taskScheduleTransport.readPlan(scope.project,row.id,signal)
   return plan.token===row.version&&plan.live===(row.status==='ACTIVE')?[row.id,scheduleLabels[plan.kind]] as const:undefined
  }))
  if(!taskReadable.value||!current(scope,'tasks')||signal.aborted||tickets.tasks!==ticket)return
  taskSchedules.value={...taskSchedules.value,...Object.fromEntries(results.flatMap(result=>result.status==='fulfilled'&&result.value?[result.value]:[]))}
 }
}
async function load(kind:Kind){if(!allowed(kind))return;const s=capture(),ticket=++tickets[kind];controllers[kind]?.abort();const controller=new AbortController();controllers[kind]=controller;loading.value={...loading.value,[kind]:true};errors.value={...errors.value,[kind]:''};if(kind==='rules'){rules.value=undefined;actionBadges.value={}}else if(kind==='tasks'){tasks.value=undefined;taskSchedules.value={}}else alarms.value=undefined
 try{if(kind==='rules'){const value=await props.transport.rules(s.project,s.type,{...ruleFilters.value},[...ruleCursors.value],controller.signal);if(current(s,kind)&&tickets[kind]===ticket){rules.value=value;void loadRuleActions(value.items,s,ticket,controller.signal)}}else if(kind==='tasks'){const value=await loadTaskPage(s,controller.signal);if(current(s,kind)&&tickets[kind]===ticket){tasks.value=value;void loadTaskSchedules(value.items,s,ticket,controller.signal)}}else{const value=await props.transport.alarms(s.project,s.type,alarmPage.value,controller.signal);if(current(s,kind)&&tickets[kind]===ticket)alarms.value=value}}
 catch(cause){if(current(s,kind)&&tickets[kind]===ticket&&!(cause instanceof IdentityChanged))errors.value={...errors.value,[kind]:errorMessage(cause)}}finally{if(current(s,kind)&&tickets[kind]===ticket)loading.value={...loading.value,[kind]:false}}}
function select(value:unknown){if(props.disabled||!['rules','tasks','alarms'].includes(String(value)))return;const kind=value as Kind;if(!allowed(kind))return;active.value=kind;if(!(kind==='rules'?rules.value:kind==='tasks'?tasks.value:alarms.value)&&!loading.value[kind])void load(kind)}
function refresh(kind:Kind){if(props.disabled||loading.value[kind]||!allowed(kind))return;clear(kind);void load(kind)}
function previous(kind:'rules'|'tasks'){const cursors=kind==='rules'?ruleCursors:taskCursors;if(props.disabled||loading.value[kind]||cursors.value.length<2)return;cursors.value=cursors.value.slice(0,-1);void load(kind)}
function next(kind:'rules'|'tasks'){const data=kind==='rules'?rules.value:tasks.value,cursors=kind==='rules'?ruleCursors:taskCursors;if(props.disabled||loading.value[kind]||!data?.hasMore||!data.nextCursor)return;cursors.value.push(data.nextCursor);void load(kind)}
function ruleStatus(value:unknown){if(props.disabled||loading.value.rules||!['','ACTIVE','PAUSED'].includes(String(value)))return;ruleFilters.value={...ruleFilters.value,status:value as TypeRuleFilters['status']};refresh('rules')}
function ruleType(value:unknown){if(props.disabled||loading.value.rules||value!==''&&!ruleKinds.some(kind=>kind===value))return;ruleFilters.value={...ruleFilters.value,ruleType:value as TypeRuleFilters['ruleType']};refresh('rules')}
function ruleLabel(value:unknown){const kind=ruleKinds.find(kind=>kind===value);return kind?ruleKindLabels[kind].label:'历史未记录'}
function filterTaskStatus(value: unknown) {
 if (props.disabled || loading.value.tasks || value !== '' && value !== 'ACTIVE' && value !== 'PAUSED') return
 taskStatus.value = value
 refresh('tasks')
}
function filterTaskType(value: unknown) {
 if (props.disabled || loading.value.tasks) return
 const type = taskTypes.find(item => item === value)
 if (!type && value !== '') return
 taskType.value = type ?? ''
 refresh('tasks')
}
function openTask(id: string) {
 if (!props.disabled && !runnerBusy.value && taskReadable.value) void router.push(`/tasks/jobs/${id}`)
}
function resetRunner(){
 runnerRequest?.abort();runnerRequest=undefined
 runner.value=undefined;runnerBusy.value=false;runnerError.value='';runnerUnknown.value=false
}
function closeTaskRunner(shown:boolean){if(!shown&&!runnerBusy.value)runner.value=undefined}
async function readRunnerTask(scope:ReturnType<typeof capture>,row:Pick<DeviceTaskDefinition,'id'|'version'|'status'>,signal:AbortSignal){
 const task=await getTask(scope.project,row.id,signal)
 if(task.id!==row.id||task.targetType!=='DEVICE_TYPE'||task.targetDeviceTypeId!==scope.type.toLowerCase()||task.version!==row.version||task.status!==row.status){
  throw new Error('任务资料已变化，请刷新任务列表。')
 }
 taskActionType(task)
 return task
}
function runnerCurrent(scope:ReturnType<typeof capture>){return current(scope,'tasks')&&active.value==='tasks'&&taskRunAllowed.value}
async function openTaskRunner(row:DeviceTaskDefinition){
 if(props.disabled||!taskRunAllowed.value||runnerBusy.value||runnerUnknown.value||runner.value||!tasks.value?.items.includes(row))return
 const scope=capture(),request=new AbortController()
 runnerRequest=request;runnerBusy.value=true;runnerError.value=''
 try{
  const task=await readRunnerTask(scope,row,request.signal)
  if(runnerCurrent(scope)&&runnerRequest===request)runner.value=task
 }catch(cause){
  if(runnerCurrent(scope)&&runnerRequest===request&&!(cause instanceof IdentityChanged))runnerError.value=errorMessage(cause)
 }finally{
  if(runnerRequest===request){runnerRequest=undefined;runnerBusy.value=false}
 }
}
function loadTaskRunnerCandidates(cursor:string|undefined,signal:AbortSignal){
 const task=runner.value
 if(!task?.id||!taskRunAllowed.value||runnerUnknown.value)throw new Error('请重新选择任务。')
 return taskRunnerChoices(projectId.value,task.id,cas(task.version),cursor,signal)
}
function runnerNeedsRefresh(cause:ApiError){
 runner.value=undefined;runnerError.value=errorMessage(cause)
}
async function submitTaskRun(ids?:string[]){
 const task=runner.value
 if(props.disabled||!task?.id||task.status!=='ACTIVE'||!taskRunAllowed.value||runnerBusy.value||runnerUnknown.value)return
 const scope=capture(),request=new AbortController()
 const stillCurrent=()=>runnerCurrent(scope)&&runner.value===task&&runnerRequest===request
 runnerRequest=request;runnerBusy.value=true;runnerError.value=''
 let sent=false
 try{
  const version=cas(task.version)
  if(ids===undefined)await readRunnerTask(scope,{id:task.id,version,status:task.status},request.signal)
  if(!stillCurrent())return
  sent=true
  if(ids===undefined)await runTask(scope.project,task.id,undefined,true)
  else await runTaskOnDevices(scope.project,task.id,version,ids)
  if(!stillCurrent())return
  runner.value=undefined;showOperationFeedback('执行已受理')
 }catch(cause){
  if(!stillCurrent()||cause instanceof IdentityChanged)return
  if(sent&&cause instanceof ApiError&&cause.outcomeUnknown){
   runnerUnknown.value=true
   runnerError.value='任务运行结果待核对，请在任务详情查看任务日志。'
  }else if(!sent||(cause instanceof ApiError&&[401,403,404,409].includes(cause.status))){
   runner.value=undefined;runnerError.value=errorMessage(cause)
  }else runnerError.value=errorMessage(cause)
 }finally{
  if(runnerRequest===request){runnerRequest=undefined;runnerBusy.value=false}
 }
}
function alarmTurn(value:number){if(props.disabled||loading.value.alarms||value<1||value>1000000)return;alarmPage.value=value;void load('alarms')}
function available(){return (['rules','tasks','alarms'] as const).filter(allowed)}
function scopeChanged(){reset();ruleFilters.value={status:'',ruleType:''};taskStatus.value='';taskType.value='';if(props.kind)active.value=props.kind;else if(!allowed(active.value))active.value=available()[0]??'tasks';if(allowed(active.value))void load(active.value)}
watch([()=>props.typeId,()=>props.kind,()=>projectId.value,()=>session.user?.accountId,()=>member.value,()=>props.transport],scopeChanged,{immediate:true,flush:'sync'})
watch([rulesAllowed,tasksAllowed,alarmsAllowed],()=>{for(const kind of ['rules','tasks','alarms'] as const)if(!allowed(kind))clear(kind);if(!props.kind&&!allowed(active.value)){active.value=available()[0]??'tasks';if(allowed(active.value))void load(active.value)}},{flush:'sync'})
watch(taskReadable,readable=>{
 if(active.value==='tasks'&&readable)void load('tasks')
 else taskSchedules.value={}
},{flush:'sync'})
watch(taskRunAllowed,allowed=>{if(!allowed)resetRunner()},{flush:'sync'})
const dispose=onIdentityChange(scopeChanged)
onScopeDispose(()=>{alive=false;reset();dispose()})
</script>
<template><section class="type-associations">
 <h2 v-if="!kind">{{kind==='rules'?'消息规则':kind==='tasks'?'任务':kind==='alarms'?'告警规则':'类型关联'}}</h2><el-tabs v-if="!kind" :model-value="active" @update:model-value="select"><el-tab-pane v-if="rulesAllowed" name="rules" label="消息规则"/><el-tab-pane v-if="tasksAllowed" name="tasks" label="任务"/><el-tab-pane v-if="alarmsAllowed" name="alarms" label="告警规则"/></el-tabs>
 <p v-if="!member||(kind&&!allowed(kind))" role="alert">当前账号没有此内容的读取权限</p>
 <div v-if="active==='rules'&&rulesAllowed" class="type-association-list">
  <div class="type-association-toolbar">
   <div class="type-association-filters">
    <el-select size="small" :model-value="ruleFilters.ruleType" aria-label="类型规则种类" placeholder="不限规则类型" :disabled="disabled||loading.rules" @update:model-value="ruleType">
     <el-option value="" label="不限规则类型"/><el-option v-for="kind in ruleKinds" :key="kind" :value="kind" :label="ruleKindLabels[kind].label"/>
    </el-select>
    <el-select size="small" :model-value="ruleFilters.status" aria-label="类型规则状态" placeholder="不限规则状态" :disabled="disabled||loading.rules" @update:model-value="ruleStatus">
     <el-option value="" label="不限规则状态"/><el-option value="ACTIVE" label="正常"/><el-option value="PAUSED" label="已停用"/>
    </el-select>
   </div>
   <div class="type-association-tools">
    <el-button size="small" :icon="Refresh" :disabled="disabled||loading.rules" @click="refresh('rules')">刷新</el-button>
    <el-button v-if="ruleCreateAllowed" size="small" :icon="Plus" type="primary" :disabled="disabled" @click="createRule">创建规则</el-button>
   </div>
  </div>
  <AsyncState :loading="loading.rules" :error="errors.rules" @retry="load('rules')">
   <div v-if="rules&&!rules.items.length&&(ruleCursors.length>1||showRuleIntroduction)" class="type-association-empty">
    <img src="/reference/empty-content.png" alt="" width="160"/>
    <h3>{{ruleCursors.length>1?'当前类型暂无关联消息规则':'无所不能的消息规则'}}</h3>
    <p v-if="showRuleIntroduction">通过消息规则，ThingsLink 可以对设备属性和事件的上报进行各种预设的计算和联动，从而实现设备自动化、智能化。</p>
    <el-button v-if="ruleCreateAllowed&&showRuleIntroduction" type="primary" :disabled="disabled" @click="createRule">创建规则</el-button>
   </div>
   <div v-else-if="rules" class="type-rule-cards">
    <article v-for="row in rules.items" :key="row.id" class="type-rule-card">
     <button type="button" :disabled="disabled" class="type-rule-card-link" @click="openRule(row.id)">
      <span class="type-rule-card-title" :title="row.name">{{row.name}}</span>
      <span class="type-rule-card-subtitle">设备类型 - {{ruleLabel(row.ruleType)}}</span>
      <span class="type-rule-card-status" :class="{'is-active':row.status==='ACTIVE'}">{{row.status==='ACTIVE'?'已启用':'未启用'}}</span>
      <span class="type-rule-card-actions">
       <span v-for="(action,index) in actionBadges[row.id]" :key="index" class="type-rule-action" :class="action.tone" :title="action.label" role="img" :aria-label="action.label">
        <ReferenceIcon :glyph="action.glyph"/>
       </span>
      </span>
     </button>
    </article>
   </div>
  </AsyncState>
  <CursorPager v-if="rules?.hasMore||ruleCursors.length>1" :page="ruleCursors.length" :has-next="rules?.hasMore" :limit="24" :show-sizes="false" :loading="loading.rules||disabled" @previous="previous('rules')" @next="next('rules')"/>
 </div>
 <div v-if="active==='tasks'&&tasksAllowed" class="type-association-list">
  <div class="type-association-toolbar">
   <div class="type-association-filters">
    <el-select size="small" :model-value="taskType" :empty-values="[null,undefined]" value-on-clear="" clearable aria-label="类型任务种类" :disabled="disabled||loading.tasks||runnerBusy" @update:model-value="filterTaskType">
     <el-option value="" label="不限任务类型"/>
     <el-option v-for="type in taskTypes" :key="type" :value="type" :label="type"/>
    </el-select>
    <el-select size="small" :model-value="taskStatus" :empty-values="[null,undefined]" value-on-clear="" clearable aria-label="类型任务状态" :disabled="disabled||loading.tasks||runnerBusy" @update:model-value="filterTaskStatus">
     <el-option value="" label="不限任务状态"/><el-option value="ACTIVE" label="已启用"/><el-option value="PAUSED" label="未启用"/>
    </el-select>
   </div>
   <div class="type-association-tools">
    <el-button size="small" :icon="Refresh" :disabled="disabled||loading.tasks||runnerBusy" @click="refresh('tasks')">刷新</el-button>
    <el-button v-if="taskCreateAllowed" size="small" :icon="Plus" type="primary" :disabled="disabled||runnerBusy" @click="createTask">创建任务</el-button>
   </div>
  </div>
  <el-alert v-if="runnerError&&!runner" :title="runnerError" type="warning" :closable="false" class="type-task-feedback"/>
  <AsyncState :loading="loading.tasks" :error="errors.tasks" @retry="load('tasks')">
   <div v-if="tasks&&!tasks.items.length&&showTaskIntroduction" class="type-association-empty type-task-empty">
    <img src="/reference/empty-content.png" alt="" width="160"/>
    <h3>让设备批量或定时执行任务</h3>
    <p>通过任务，您可以从云端下发消息或控制指令到设备，触发设备完成各类操作。</p>
    <el-button v-if="taskCreateAllowed" type="primary" :disabled="disabled" @click="createTask">创建任务</el-button>
   </div>
   <div v-else-if="tasks?.items.length" class="type-task-cards">
    <article v-for="row in tasks.items" :key="row.id" class="type-task-card">
     <header class="type-task-card-header">
      <button v-if="taskReadable" type="button" class="type-task-card-title" :title="row.name" :disabled="disabled||runnerBusy" @click="openTask(row.id)">{{row.name}}</button>
      <span v-else class="type-task-card-title" :title="row.name">{{row.name}}</span>
      <span class="type-task-card-status" :class="{'is-active':row.status==='ACTIVE'}">{{row.status==='ACTIVE'?'已启用':'未启用'}}</span>
     </header>
     <p class="type-task-card-description">
      <span class="type-task-card-badge"><ReferenceIcon :glyph="isTaskFunction(row.actionType)?'󰡱':'󰭽'"/></span>
      <span>{{taskActionLabel(row)}} - 设备类型</span>
     </p>
     <p v-if="taskActionType(row)==='COMMAND'" class="type-task-card-command">{{row.commandKey}}</p>
     <footer class="type-task-card-footer">
      <el-button v-if="taskRunAllowed" size="small" :icon="VideoPlay" :disabled="disabled||runnerBusy||runnerUnknown" @click="openTaskRunner(row)">运行任务</el-button>
      <span v-if="taskReadable" class="type-task-schedule" :title="taskSchedules[row.id]?'':'定时状态未读取'">{{taskSchedules[row.id]||'-'}}</span>
     </footer>
    </article>
   </div>
   <span v-else-if="tasks" class="type-task-no-results" role="status">没有符合条件的任务</span>
  </AsyncState>
  <CursorPager v-if="tasks?.hasMore||taskCursors.length>1" :page="taskCursors.length" :has-next="tasks?.hasMore" :limit="24" :show-sizes="false" grouped :loading="loading.tasks||disabled||runnerBusy" @previous="previous('tasks')" @next="next('tasks')"/>
  <TaskRunnerDialog v-if="runner&&taskRunAllowed" :model-value="true" :task="runner" :busy="runnerBusy" :locked="disabled||runnerUnknown" :error="runnerError" :load-candidates="loadTaskRunnerCandidates" @update:model-value="closeTaskRunner" @run="submitTaskRun" @denied="runnerNeedsRefresh" @conflict="runnerNeedsRefresh"/>
 </div>
 <div v-if="active==='alarms'&&alarmsAllowed" class="type-association-list type-alarm-list">
  <div class="type-association-toolbar">
   <div class="type-association-tools">
    <el-button size="small" :icon="Refresh" :disabled="disabled||loading.alarms" @click="refresh('alarms')">刷新</el-button>
    <el-button v-if="alarmManageAllowed" size="small" :icon="Plus" type="primary" :disabled="disabled" @click="createAlarm">创建告警规则</el-button>
   </div>
  </div>
  <AsyncState :loading="loading.alarms" :error="errors.alarms" @retry="load('alarms')">
   <el-table v-if="alarms" :data="alarms.items" class="type-alarm-table" empty-text="暂无数据">
    <el-table-column prop="name" label="规则名称" min-width="150"/>
    <el-table-column label="严重级别" min-width="75">
     <template #default="{row}"><el-tag class="type-alarm-level" size="small" effect="plain" :type="row.level==='NORMAL'?'info':row.level==='IMPORTANT'?'warning':'danger'">{{row.level==='NORMAL'?'普通':row.level==='IMPORTANT'?'重要':'紧急'}}</el-tag></template>
    </el-table-column>
    <el-table-column label="规则可用" min-width="71">
     <template #default="{row}"><span class="type-alarm-status" :class="{'is-enabled':row.enabled}">{{row.enabled?'已启用':'未启用'}}</span></template>
    </el-table-column>
    <el-table-column label="通知组" min-width="115">
     <template #default="{row}">
      <div v-if="row.notificationGroups.length" class="type-alarm-groups"><el-tag v-for="group in row.notificationGroups" :key="group.id" size="small" type="info" :title="group.id">{{group.name??'通知组已失效/无法读取名称'}}</el-tag></div>
      <span v-else class="type-alarm-unset">未设置</span>
     </template>
    </el-table-column>
    <el-table-column label="用户通知" min-width="235"><template #default="{row}"><NotificationCustomerChannels :channels="row.customerChannels"/></template></el-table-column>
    <el-table-column min-width="166" align="right">
     <template #default="{row}">
      <div class="type-alarm-actions">
       <el-button v-if="alarmManageAllowed" size="small" :disabled="disabled" @click="editAlarm(row.id)">编辑</el-button>
       <el-button size="small" :disabled="disabled" @click="showAlarmHistory(row.id)">告警历史</el-button>
      </div>
     </template>
    </el-table-column>
   </el-table>
  </AsyncState>
  <CursorPager v-if="alarms&&Number(alarms.total)>24||alarmPage>1" :page="alarmPage" :limit="24" :total="alarms?.total" :show-sizes="false" grouped :loading="loading.alarms||disabled" @update:page="alarmTurn"/>
  <el-dialog :model-value="!!historyRuleId" title="告警历史" width="min(900px,calc(100vw - 32px))" class="type-rule-history-dialog" destroy-on-close append-to-body @update:model-value="(value:boolean)=>{if(!value)historyRuleId=undefined}">
   <DeviceAlarmHistory v-if="historyRuleId" :key="historyRuleId" :rule-id="historyRuleId"/>
  </el-dialog>
 </div>

</section></template>
<style scoped>
.type-associations{padding:15px 0}.type-associations h2{font-size:18px;font-weight:500;margin:0 0 12px}.boundary,.creation-boundary{color:var(--tl-muted);font-size:13px;line-height:22px;margin:10px 0}.type-associations :deep(.cell){overflow-wrap:anywhere}.type-associations :deep(.el-table){margin-top:12px}
</style>
<style scoped>.type-alarm-groups{display:flex;flex-wrap:wrap;gap:6px}.type-alarm-groups :deep(.el-tag){max-width:100%;height:auto;white-space:normal;overflow-wrap:anywhere}.type-alarm-unset{color:#c0c4cc}</style>

<style scoped>
.type-association-list { padding-top: 12px; }
.type-association-toolbar, .type-association-filters, .type-association-tools { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.type-association-toolbar { justify-content: space-between; margin-bottom: 20px; }
.type-association-filters .el-select { width: 150px; }
.type-association-filters :deep(.el-select__wrapper) { min-height: 33px; padding: 0 10px 0 15px; font-size: 13px; }
.type-association-filters :deep(.el-select__placeholder) { color: #606266; }
.type-association-tools { margin-left: auto; }
.type-association-tools .el-button { margin: 0; padding: 8px 15px; }
.type-alarm-list :deep(.type-alarm-table) { margin-top: 0; }
.type-alarm-table :deep(th.el-table__cell) { color: var(--tl-title); font-weight: 600; }
.type-alarm-table :deep(.cell) { padding-inline: 10px; }
.type-alarm-level { height: 24px; margin-inline: 6px; }
.type-alarm-status { margin-inline: 6px; color: var(--tl-muted); font-weight: 500; }
.type-alarm-status.is-enabled { color: var(--el-color-success); }
.type-alarm-table :deep(td.el-table__cell) { padding-block: 12px; }
.type-alarm-actions { display: flex; justify-content: flex-end; gap: 10px; }
.type-alarm-actions .el-button { height: 28px; margin: 0; }
:global(.type-rule-history-dialog .el-dialog__body) { padding-top: 31px; }
.type-association-empty { padding: 40px 20px; text-align: center; }
.type-association-empty img { display: block; height: auto; margin: 0 auto 20px; }
.type-association-empty h3 { margin: 0 0 10px; font-size: 24px; line-height: 32px; font-weight: 400; color: #002822; }
.type-association-empty p { max-width: 460px; margin: 0 auto 20px; font-size: 14px; line-height: 22px; color: #999; }
.type-task-empty h3 { font-size: 26px; line-height: 36px; }
.type-task-no-results { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.type-rule-cards, .type-task-cards { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; }
.type-task-card { display: flex; flex-direction: column; min-width: 0; min-height: 141px; padding: 20px; border: 1px solid var(--tl-border); border-radius: 4px; background: #fff; }
.type-task-card:hover { box-shadow: 0 2px 12px rgb(0 0 0 / 10%); }
.type-task-card-header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.type-task-card-title { min-width: 0; padding: 0; overflow: hidden; border: 0; background: none; color: var(--tl-title); text-align: left; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; font-weight: 600; line-height: 22px; }
button.type-task-card-title:not(:disabled) { cursor: pointer; }
.type-task-card-status { flex: none; color: var(--tl-muted); font-size: 12px; line-height: 20px; }
.type-task-card-status.is-active { color: var(--el-color-success); }
.type-task-card-description { display: flex; align-items: center; gap: 5px; margin: 10px 0 0; color: #888; font-size: 14px; line-height: 22px; }
.type-task-card-badge { display: inline-flex; padding: 1px 5px; border-radius: 4px; background: #458685; color: #fff; }
.type-task-card-badge .reference-icon { font-size: 14px; }
.type-task-card-command { margin: 5px 0 0; color: var(--tl-muted); font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }
.type-task-card-footer { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: auto; padding-top: 14px; }
.type-task-card-footer .el-button { height: 28px; }
.type-task-schedule { margin-left: auto; color: var(--tl-muted); font-size: 13px; line-height: 20px; }
.type-task-feedback { margin-bottom: 12px; }
.type-rule-card { position: relative; min-width: 0; min-height: 129px; border: 1px solid #ebeef5; border-radius: 4px; background: #fff; }
.type-rule-card:hover { box-shadow: 0 2px 12px rgb(0 0 0 / 10%); }
.type-rule-card-link { display: block; width: 100%; padding: 20px 20px 58px; border: 0; background: none; text-align: left; cursor: pointer; }
.type-rule-card-link:disabled { cursor: default; }
.type-rule-card-title { display: block; margin-right: 55px; overflow: hidden; color: #303133; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; font-weight: 600; line-height: 22px; }
.type-rule-card-subtitle { display: block; margin-top: 5px; color: #888; font-size: 14px; line-height: 22px; }
.type-rule-card-status { position: absolute; top: 20px; right: 20px; color: #909399; font-size: 12px; line-height: 22px; }
.type-rule-card-status.is-active { color: #67c23a; }
.type-rule-card-actions { position: absolute; left: 20px; right: 20px; bottom: 20px; display: flex; gap: 5px; overflow: hidden; pointer-events: none; }
.type-rule-action { display: grid; flex: 0 0 28px; height: 28px; place-items: center; border-radius: 5px; color: #fff; background: #1677ff; pointer-events: auto; }
.type-rule-action .reference-icon { font-size: 14px; }
.type-rule-action.function { background: #107c41; }
.type-rule-action.gateway { background: #7c3aed; }
.type-rule-action.external { background: #eab308; }
@media (min-width:1920px) { .type-rule-cards, .type-task-cards { grid-template-columns: repeat(4,minmax(0,1fr)); } }
@media (max-width:991px) { .type-rule-cards, .type-task-cards { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width:767px) { .type-rule-cards, .type-task-cards { grid-template-columns: minmax(0,1fr); } }
</style>
