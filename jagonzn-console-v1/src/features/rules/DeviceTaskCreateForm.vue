<script setup lang="ts">
import {computed,onScopeDispose,reactive,ref,shallowRef,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {cas,objectJson,taskActionType,taskSelection,taskCommandRequestId,type TaskActionType} from './models'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import RuleTagsEditor from './RuleTagsEditor.vue'
import {taskTagsDraft,taskTagsValue} from './task-tags-api'
import type {RuleTagDraft} from './rule-tag-draft'
import TaskCommandContentDialog from './TaskCommandContentDialog.vue'
import RuleDataStreamIdentifier from './RuleDataStreamIdentifier.vue'
import TaskDataContentDialog from './TaskDataContentDialog.vue'
import TaskModbusRtuCommonDialog from './TaskModbusRtuCommonDialog.vue'
import TaskModbusTcpCommonDialog from './TaskModbusTcpCommonDialog.vue'
import {taskModbusTcpInput,type TaskModbusTcpCommon} from './task-modbus-tcp-common'
import TaskOtaUpgradeDialog from './TaskOtaUpgradeDialog.vue'
import {taskOtaUpgradeValue,type TaskOtaUpgradeInput} from './task-ota-upgrade'
import {hasTaskModbusRtuCommon,taskModbusRtuInput,type TaskModbusRtuCommon} from './task-modbus-rtu-common'
import {taskDataValue} from './task-data-content'
import {defaultTaskDataFunctionSource,taskDataFunctionValue,isTaskData} from './task-data-function'
import TaskPropertyFunctionDialog from './TaskPropertyFunctionDialog.vue'
import {defaultTaskPropertyFunctionSource,defaultTaskCloudFunctionSource,defaultTaskCommandFunctionSource,isTaskPropertyFunction,isTaskFunction,taskPropertyFunctionValue} from './task-property-function'
import TaskPropertyContentDialog from './TaskPropertyContentDialog.vue'
import {taskPropertyValue} from './task-content-api'
import TaskChoiceSelect from './TaskChoiceSelect.vue'
import TaskCreateScheduleFields from './TaskCreateScheduleFields.vue'
import {createTaskScheduleDraft,taskCreateScheduleIntent} from './task-create-schedule'
import {taskInitialScheduleRequest,taskInitialScheduleIntent,taskInitialScheduleMatches} from './task-initial-schedule'
import {taskOnceClockRunAtMatches} from './task-once-clock-fields'
import {canonicalTaskInstant} from './task-schedule-time'
import type {TaskChoiceKind} from './task-choices'
import {definitionUuid,type DeviceTaskDefinitionPort} from './device-task-definition-port'
import {taskCreationSource,taskCreationSourceKey,taskTargetsCreationSource,type TaskCreationSource} from './task-creation-source'
const props=defineProps<{source?:TaskCreationSource;deviceId?:string;deviceName?:string;transport:DeviceTaskDefinitionPort;stepped?:boolean}>()
const source=computed(()=>{const value=taskCreationSource(props.source,props.deviceId,props.deviceName);return value?.kind==='PROJECT'&&value.id!==projectId.value?undefined:value}),sourceKey=computed(()=>taskCreationSourceKey(source.value))
const emit=defineEmits<{close:[];created:[id:string,returnToDevice?:boolean];busy:[value:boolean];locked:[value:boolean];invalidated:[]}>()
const sourceTargetKind={DEVICE:'devices',DEVICE_TYPE:'device-types',DEVICE_GROUP:'device-groups'} as const
const initialTargetKind=computed(()=>source.value&&source.value.kind!=='PROJECT'?sourceTargetKind[source.value.kind]:undefined)
const sourceLabels={DEVICE:'设备',DEVICE_TYPE:'设备类型',DEVICE_GROUP:'设备组'} as const
const step=ref(1),targetKind=ref<TaskChoiceKind>(initialTargetKind.value??'devices'),targetDenied=ref(false)
function initialTargetIds():Record<TaskChoiceKind,string[]>{
 const ids:Record<TaskChoiceKind,string[]>={devices:[],'device-types':[],'device-groups':[]}
 if(source.value&&initialTargetKind.value)ids[initialTargetKind.value]=[source.value.id]
 return ids
}
const targetIds=reactive(initialTargetIds())
const selectableTargets=computed(()=>!!props.stepped&&!!props.transport.createTargets)
const originOptions = computed(() => {
 const origin = source.value
 if (!origin?.name) return []
 if (targetKind.value === initialTargetKind.value) {
  return [{ id: origin.id, label: origin.name }]
 }
 return []
})
const plannedCreation=computed(()=>selectableTargets.value&&!!props.transport.plan)
const planDraft=ref(createTaskScheduleDraft())
watch(targetKind,()=>{targetDenied.value=false})
function denyTarget(cause:ApiError){targetDenied.value=true;error.value=errorMessage(cause)}
const form=reactive({name:'',description:'',commandKey:'',input:'{}'}),busy=ref(false),unknown=ref(false),settled=ref(false),lookupAgain=ref(false),error=ref(''),notice=ref('')
const commandRequestId=ref<Schema<'SaveTaskJobRequest'>['commandRequestId']>()
const actionType=ref<TaskActionType|undefined>(props.stepped?undefined:'COMMAND'),propertyInput=ref('{}'),cloudInput=ref('{}'),configurationOpen=ref(false)
const functionSource=ref(defaultTaskPropertyFunctionSource),cloudFunctionSource=ref(defaultTaskCloudFunctionSource),commandFunctionSource=ref(defaultTaskCommandFunctionSource),configurationKind=ref<TaskActionType>(),configurationBusy=ref(false)
watch(actionType,kind=>{if(kind!=='COMMAND')commandRequestId.value=undefined},{flush:'sync'})
const propertyFamily=computed(()=>actionType.value==='PROPERTY_SET'||actionType.value==='PROPERTY_SET_FUNCTION')
const cloudFamily=computed(()=>actionType.value==='CLOUD_UPDATE'||actionType.value==='CLOUD_UPDATE_FUNCTION')
const commandFamily=computed(()=>actionType.value==='COMMAND'||actionType.value==='COMMAND_FUNCTION'||actionType.value==='OTA_UPGRADE')
const baseAction=computed<TaskActionType|undefined>({get:()=>actionType.value==='COMMAND_FUNCTION'||actionType.value==='OTA_UPGRADE'?'COMMAND':actionType.value==='DATA_DOWNLINK_FUNCTION'?'DATA_DOWNLINK':actionType.value==='CLOUD_UPDATE_FUNCTION'?'CLOUD_UPDATE':actionType.value==='PROPERTY_SET_FUNCTION'?'PROPERTY_SET':actionType.value,set:value=>{if(!configurationOpen.value)actionType.value=value}})
const configurationCommon=ref(false),configurationTcp=ref(false)
const editingAction=computed(()=>configurationKind.value??actionType.value)
const tagRows=ref<RuleTagDraft[]>([])
const dataInput=ref({protocol:'MQTT',streamIdentifier:'',format:'JSON',message:''})
const dataFunctionInput=ref<ReturnType<typeof taskDataFunctionValue>>({protocol:'MQTT',streamIdentifier:'',format:'COMMON_JS',source:defaultTaskDataFunctionSource})
const dataRoute=computed(()=>actionType.value==='DATA_DOWNLINK_FUNCTION'?dataFunctionInput.value:dataInput.value)
const configurationDataRoute=ref<{protocol:string;streamIdentifier:string}>()
const otaInput=ref<TaskOtaUpgradeInput>()
const configured=reactive({OTA_UPGRADE:false,COMMAND:false,PROPERTY_SET:false,CLOUD_UPDATE:false,DATA_DOWNLINK:false,PROPERTY_SET_FUNCTION:false,CLOUD_UPDATE_FUNCTION:false,DATA_DOWNLINK_FUNCTION:false,COMMAND_FUNCTION:false})
const configurationValue=computed(()=>editingAction.value==='OTA_UPGRADE'?otaInput.value:editingAction.value==='COMMAND_FUNCTION'?{format:'COMMON_JS',source:commandFunctionSource.value}:editingAction.value==='DATA_DOWNLINK_FUNCTION'?{format:'COMMON_JS',source:dataFunctionInput.value.source}:isTaskPropertyFunction(editingAction.value)?{format:'COMMON_JS',source:editingAction.value==='CLOUD_UPDATE_FUNCTION'?cloudFunctionSource.value:functionSource.value}:editingAction.value==='DATA_DOWNLINK'?{...dataInput.value}:editingAction.value==='PROPERTY_SET'?objectJson(propertyInput.value):editingAction.value==='CLOUD_UPDATE'?objectJson(cloudInput.value):editingAction.value==='COMMAND'?{method:form.commandKey,params:objectJson(form.input),...(commandRequestId.value===undefined?{}:{id:commandRequestId.value})}:undefined)
const configurationLabel=computed(()=>actionType.value==='DATA_DOWNLINK'?'自定义下发':actionType.value==='CLOUD_UPDATE'?'属性更新':actionType.value==='PROPERTY_SET'?'属性下发':'命令下发')
type AcceptedCreation={project:string;source:TaskCreationSource;id?:string;version?:number;runAt?:string;key?:string;originalVerified?:boolean;body:Schema<'SaveTaskJobRequest'>}
const acceptedCreation=shallowRef<AcceptedCreation>(),changedCreationId=ref<string>()
let generation=0,active=true,controller:AbortController|undefined
function clearCreationDraft(){planDraft.value=createTaskScheduleDraft();tagRows.value=[];step.value=1;targetKind.value=initialTargetKind.value??'devices';Object.assign(targetIds,initialTargetIds());targetDenied.value=false;actionType.value=props.stepped?undefined:'COMMAND';propertyInput.value='{}';cloudInput.value='{}';dataInput.value={protocol:'MQTT',streamIdentifier:'',format:'JSON',message:''};functionSource.value=defaultTaskPropertyFunctionSource;cloudFunctionSource.value=defaultTaskCloudFunctionSource;commandFunctionSource.value=defaultTaskCommandFunctionSource;dataFunctionInput.value={protocol:'MQTT',streamIdentifier:'',format:'COMMON_JS',source:defaultTaskDataFunctionSource};configurationDataRoute.value=undefined;configurationKind.value=undefined;configurationBusy.value=false;configurationOpen.value=false;configurationCommon.value=false;configurationTcp.value=false;otaInput.value=undefined;configured.OTA_UPGRADE=false;configured.COMMAND=false;configured.PROPERTY_SET=false;configured.CLOUD_UPDATE=false;configured.DATA_DOWNLINK=false;configured.PROPERTY_SET_FUNCTION=false;configured.CLOUD_UPDATE_FUNCTION=false;configured.DATA_DOWNLINK_FUNCTION=false;configured.COMMAND_FUNCTION=false;commandRequestId.value=undefined;Object.assign(form,{name:'',description:'',commandKey:'',input:'{}'})}
function invalidate(){acceptedCreation.value=undefined;changedCreationId.value=undefined;settled.value=false;lookupAgain.value=false;notice.value='';generation++;controller?.abort();controller=undefined;busy.value=false;unknown.value=false;error.value='';clearCreationDraft();emit('busy',false);emit('invalidated')}
/** 同一身份失去写权限仍保留已发请求；仅清可见草稿，之后只按原键读取。 */
function suspendCreation(){generation++;controller?.abort();controller=undefined;busy.value=false;clearCreationDraft();unknown.value=true;error.value='创建结果仍需按原请求核对，未重复创建。';emit('busy',false)}
watch(unknown,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(invalidate);onScopeDispose(()=>{active=false;generation++;controller?.abort();dispose()})
watch([projectId,sourceKey,()=>session.user?.accountId],invalidate)
watch(()=>can('task:manage'),value=>{if(!value){if(acceptedCreation.value&&(busy.value||unknown.value))suspendCreation();else invalidate()}})
function stableJson(value:unknown):string {
  if(typeof value==='number'&&(!Number.isFinite(value)||Number.isInteger(value)&&!Number.isSafeInteger(value)))throw new Error('命令参数含无法精确提交的数字')
  if(Array.isArray(value))return '['+value.map(stableJson).join(',')+']'
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stableJson((value as Record<string,unknown>)[key])).join(',')+'}'
  return JSON.stringify(value)
}
/** 目标按集合语义核对，不能用来源设备替代用户实际保存的范围。 */
function selectionSignature(value:Schema<'SaveTaskJobRequest'>|Schema<'TaskJobResponse'>){
 if(!value.targetType)throw new Error('任务目标回读不完整')
 const selection=taskSelection({targetType:value.targetType,targetGroupId:value.targetGroupId??undefined,targetDeviceTypeId:value.targetDeviceTypeId??undefined,targetDeviceIds:value.targetDeviceIds??undefined,targetGroupIds:value.targetGroupIds??undefined})
 if(selection.targetDeviceIds)selection.targetDeviceIds=selection.targetDeviceIds.map(id=>id.toLowerCase()).sort()
 if(selection.targetGroupIds)selection.targetGroupIds=selection.targetGroupIds.map(id=>id.toLowerCase()).sort()
 if(selection.targetDeviceTypeId)selection.targetDeviceTypeId=selection.targetDeviceTypeId.toLowerCase()
 return stableJson(selection)
}
function onceDefinitionMatches(value:Schema<'TaskJobResponse'>,body:Schema<'SaveTaskJobRequest'>){
 if(typeof value.runAt!=='string'||typeof value.timezone!=='string'||!body.initialSchedule)return false
 const intent=taskInitialScheduleIntent(body.initialSchedule,body.timezone)
 return intent.kind==='ONCE_CLOCK'?taskOnceClockRunAtMatches(intent,value.runAt,value.timezone,body.timezone):intent.kind==='ONCE'&&canonicalTaskInstant(value.runAt)===canonicalTaskInstant(intent.onceAt)
}
function matches(value:Schema<'TaskJobResponse'>,body:Schema<'SaveTaskJobRequest'>){
  const kind=taskActionType(body)
  return taskActionType(value)===kind&&value.name===body.name&&(value.description??'')===(body.description??'')&&(kind!=='COMMAND'?value.commandKey==null&&body.commandKey==null:value.commandKey===body.commandKey)&&value.scheduleType===body.scheduleType&&value.timezone===(body.initialSchedule?.timezoneMode==='CUSTOM'?body.initialSchedule.timezone:body.timezone)&&(!body.initialSchedule||value.cronExpression==null&&(body.scheduleType==='ONCE'?onceDefinitionMatches(value,body):value.runAt==null))&&value.status===(body.enabled?'ACTIVE':'PAUSED')&&selectionSignature(value)===selectionSignature(body)&&taskCommandRequestId(value.commandRequestId??undefined)===taskCommandRequestId(body.commandRequestId??undefined)&&stableJson(value.input)===stableJson(body.input)&&stableJson(taskTagsValue(value.tags))===stableJson(body.tags??{})
}
function openConfiguration(kind:TaskActionType|undefined=actionType.value,common=false,tcp=false){if(busy.value||configurationBusy.value||unknown.value||settled.value||!kind||props.stepped&&step.value!==1)return;error.value='';configurationDataRoute.value=kind==='DATA_DOWNLINK_FUNCTION'?{protocol:(configured.DATA_DOWNLINK_FUNCTION?dataFunctionInput.value:dataRoute.value).protocol,streamIdentifier:(configured.DATA_DOWNLINK_FUNCTION?dataFunctionInput.value:dataRoute.value).streamIdentifier}:undefined;configurationCommon.value=common;configurationTcp.value=tcp;configurationKind.value=kind;configurationOpen.value=true}
function closeConfiguration(value:boolean){if(value||busy.value||configurationBusy.value||unknown.value)return;configurationOpen.value=false;configurationKind.value=undefined;configurationDataRoute.value=undefined;configurationCommon.value=false;configurationTcp.value=false}
function functionBusy(value:boolean){configurationBusy.value=value;emit('busy',busy.value||value)}
function functionPreviewDenied(cause:ApiError){error.value=errorMessage(cause)}
function configureCommand(value:Pick<Schema<'SaveTaskJobRequest'>,'commandKey'|'input'|'commandRequestId'>){if(!configurationOpen.value||configurationKind.value!=='COMMAND'||busy.value||unknown.value||settled.value)return;taskActionType(value);if(typeof value.commandKey!=='string')throw new Error('命令标识不完整');form.commandKey=value.commandKey;form.input=JSON.stringify(value.input);commandRequestId.value=taskCommandRequestId(value.commandRequestId);actionType.value='COMMAND';configured.COMMAND=true;configurationOpen.value=false;configurationKind.value=undefined;error.value=''}
function configureProperties(value:Record<string,unknown>){const kind=configurationKind.value;if(!configurationOpen.value||kind!=='PROPERTY_SET'&&kind!=='CLOUD_UPDATE'||busy.value||unknown.value||settled.value)return;const text=JSON.stringify(taskPropertyValue(JSON.stringify(value),kind==='CLOUD_UPDATE'?'cloud-update':'downlink'));if(kind==='CLOUD_UPDATE')cloudInput.value=text;else propertyInput.value=text;configured[kind]=true;actionType.value=kind;configurationOpen.value=false;configurationKind.value=undefined;error.value=''}
/** 只有明确完成函数配置才选择函数类型；打开再取消不迁移固定属性。 */
function configurePropertyFunction(value:ReturnType<typeof taskPropertyFunctionValue>){const kind=configurationKind.value;if(!configurationOpen.value||!isTaskFunction(kind)||busy.value||unknown.value||settled.value)return;try{const text=taskPropertyFunctionValue(value).source;if(kind==='DATA_DOWNLINK_FUNCTION')dataFunctionInput.value=taskDataFunctionValue({...configurationDataRoute.value,format:'COMMON_JS',source:text});else if(kind==='CLOUD_UPDATE_FUNCTION')cloudFunctionSource.value=text;else if(kind==='PROPERTY_SET_FUNCTION')functionSource.value=text;else if(kind==='COMMAND_FUNCTION')commandFunctionSource.value=text;else return;actionType.value=kind;configured[kind]=true;configurationOpen.value=false;configurationKind.value=undefined;configurationDataRoute.value=undefined;error.value=''}catch(cause){error.value=errorMessage(cause)}}
/** 明确完成配置才选择OTA；目录和当前固件不是保存的前置。 */
function configureOta(value:TaskOtaUpgradeInput){if(!configurationOpen.value||configurationKind.value!=='OTA_UPGRADE'||busy.value||unknown.value||settled.value)return;try{otaInput.value=taskOtaUpgradeValue(value);actionType.value='OTA_UPGRADE';configured.OTA_UPGRADE=true;configurationOpen.value=false;configurationKind.value=undefined;error.value=''}catch(cause){error.value=errorMessage(cause)}}
/** 固定数据配置完成只保存本地原文，不提前创建或改写消息。 */
function configureModbus(value:TaskModbusRtuCommon){if(!configurationOpen.value||!configurationCommon.value||configurationTcp.value||busy.value||unknown.value||settled.value)return;try{dataFunctionInput.value=taskModbusRtuInput({...configurationDataRoute.value,common:value});actionType.value='DATA_DOWNLINK_FUNCTION';configured.DATA_DOWNLINK_FUNCTION=true;configurationOpen.value=false;configurationKind.value=undefined;configurationDataRoute.value=undefined;configurationCommon.value=false;configurationTcp.value=false;error.value=''}catch(cause){error.value=errorMessage(cause)}}
function configureModbusTcp(value:TaskModbusTcpCommon){if(!configurationOpen.value||!configurationTcp.value||busy.value||unknown.value||settled.value)return;try{dataFunctionInput.value=taskModbusTcpInput({...configurationDataRoute.value,common:value});actionType.value='DATA_DOWNLINK_FUNCTION';configured.DATA_DOWNLINK_FUNCTION=true;configurationOpen.value=false;configurationKind.value=undefined;configurationDataRoute.value=undefined;configurationCommon.value=false;configurationTcp.value=false;error.value=''}catch(cause){error.value=errorMessage(cause)}}
function commonConfiguration(kind:'MODBUS_RTU'|'MODBUS_TCP'='MODBUS_RTU'){try{const value=taskDataFunctionValue(dataFunctionInput.value);return 'common' in value&&value.common.kind===kind?value.common:undefined}catch{return}}
function configureData(value:ReturnType<typeof taskDataValue>){if(!configurationOpen.value||configurationKind.value!=='DATA_DOWNLINK'||busy.value||unknown.value||settled.value)return;dataInput.value=taskDataValue(value);actionType.value='DATA_DOWNLINK';configured.DATA_DOWNLINK=true;configurationOpen.value=false;configurationKind.value=undefined;error.value=''}
/** 后续配置变化不否定原创建已受理；只读原键精确证明身份，不推断当前仍与原计划相同。 */
async function proveOriginal(intent:AcceptedCreation,current:()=>boolean):Promise<boolean|undefined>{
 if(intent.originalVerified)return false
 if(!intent.key||!props.transport.creation||!controller)throw new Error('创建进度已变化，缺少同次原件证明，请继续核对')
 const raw=await props.transport.creation(intent.project,intent.key,controller.signal);if(!current())return
 const original=creationReference(raw)
 if(original.id!==intent.id||original.version!==intent.version)throw new Error('创建原件与同次任务身份不一致，请继续核对')
 intent.originalVerified=true;return original.deleted
}
function settleOriginal(intent:AcceptedCreation,deleted:boolean){
 acceptedCreation.value=undefined;unknown.value=false;settled.value=true;changedCreationId.value=deleted?undefined:intent.id
 notice.value=deleted?'原任务已创建后被移除，本次核对未再次创建。':'原任务已创建，当前配置已发生变化。请查看当前任务；本次核对未再次创建。'
}
/** 同次可信创建回执绑定的原ID/版本与原意图；读取失败绝不重发创建。 */
async function readAccepted(intent:AcceptedCreation,current:()=>boolean){
 const id=intent.id,version=intent.version
 if(!id||!version||!props.transport.definition||!controller)throw new Error('任务定义读取入口不可用')
 const saved=await props.transport.definition(intent.project,id,controller.signal);if(!current())return
 if(!saved||saved.id!==id)throw new Error('任务已创建但定义回读不一致，请核对后再操作')
 const observed=cas(saved.version)
 if(observed>version){const deleted=await proveOriginal(intent,current);if(!current()||deleted===undefined)return;settleOriginal(intent,deleted);return}
 if(observed!==version||!matches(saved,intent.body)||intent.runAt&&canonicalTaskInstant(saved.runAt!)!==intent.runAt)throw new Error('任务已创建但定义回读不一致，请核对后再操作')
 if(intent.body.initialSchedule){
  if(!props.transport.plan)throw new Error('初始计划读取入口不可用')
  const plan=await props.transport.plan(intent.project,id,controller.signal);if(!current())return
  if(!plan||cas(plan.token)!==version||plan.live!==intent.body.enabled)throw new Error('任务已创建但初始计划回读不一致，请继续核对，不要重复创建')
  const onceProgressed=intent.body.enabled===true&&intent.body.initialSchedule.mode==='ONCE'&&plan.kind==='MANUAL'&&plan.consumed===true
  if(onceProgressed){const deleted=await proveOriginal(intent,current);if(!current()||deleted===undefined)return;if(deleted){settleOriginal(intent,true);return}}
  else if(plan.consumed!==false||plan.kind!==intent.body.initialSchedule.mode||!plan.seed||!taskInitialScheduleMatches(intent.body.initialSchedule,plan.seed,saved.runAt,intent.body.timezone))throw new Error('任务已创建但初始计划回读不一致，请继续核对，不要重复创建')
 }
 const returnToSource=taskTargetsCreationSource(saved,intent.source)
 if(returnToSource&&intent.source.kind==='DEVICE'){
  const preference=await props.transport.preference(intent.project,id,intent.source.id,version,controller.signal);if(!current())return
  if(preference.deviceId!==intent.source.id||preference.definitionVersion!==version||typeof preference.allowed!=='boolean')throw new Error('任务已创建但设备关联未能核实，请核对后再操作')
  cas(preference.version)
 }
 acceptedCreation.value=undefined;unknown.value=false
 if(returnToSource)emit('created',id);else emit('created',id,false)
}
/** 领域原件只接受已正式约定的三个必要字段，不将缺失或额外内容补成成功。 */
function creationReference(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('任务创建原件不完整，请继续按原请求核对')
 const record=value as Record<string,unknown>
 if(Object.keys(record).length!==3||Object.keys(record).some(key=>!['jobId','initialDefinitionVersion','deleted'].includes(key))||!definitionUuid(record.jobId)||record.initialDefinitionVersion!==1||typeof record.deleted!=='boolean')throw new Error('任务创建原件不完整，请继续按原请求核对')
 return {id:record.jobId,version:1,deleted:record.deleted}
}
async function verify(){
 let intent=acceptedCreation.value
 if(!unknown.value||busy.value||!intent||intent.project!==projectId.value||taskCreationSourceKey(intent.source)!==sourceKey.value||!can('task:read'))return
 const project=intent.project,origin=taskCreationSourceKey(intent.source),epoch=identityEpoch(),turn=generation,current=()=>active&&turn===generation&&epoch===identityEpoch()&&project===projectId.value&&origin===sourceKey.value&&can('task:read')
 busy.value=true;emit('busy',true);error.value='';controller=new AbortController()
 try{
  if((!intent.id||lookupAgain.value)&&intent.key&&props.transport.creation){
   const raw=await props.transport.creation(intent.project,intent.key,controller.signal);if(!current())return
   const original=creationReference(raw)
   if(intent.id&&intent.id!==original.id||intent.version&&intent.version!==original.version)throw new Error('任务创建原件与同次回执不匹配，请继续核对')
   intent={...intent,id:original.id,version:original.version,originalVerified:!original.deleted};acceptedCreation.value=intent;lookupAgain.value=false
   if(original.deleted){acceptedCreation.value=undefined;unknown.value=false;settled.value=true;notice.value='原任务已创建后被移除，本次核对未再次创建。';return}
  }
  await readAccepted(intent,current)
 }catch(cause){if(current()&&!(cause instanceof IdentityChanged)){lookupAgain.value=cause instanceof ApiError&&cause.status===404;error.value=lookupAgain.value?'尚未找到同次创建原件或当前定义，结果仍待核对，不要重复创建':errorMessage(cause);unknown.value=true}}
 finally{if(current()){busy.value=false;controller=undefined;emit('busy',false)}}
}
function currentTimerSelection(){
 const origin=source.value;if(!origin)throw new Error('请选择任务来源')
 return selectableTargets.value?taskSelection(targetKind.value==='devices'?{targetType:'EXPLICIT_DEVICES',targetDeviceIds:targetIds.devices}:targetKind.value==='device-types'?{targetType:'DEVICE_TYPE',targetDeviceTypeId:targetIds['device-types'][0]}:{targetType:'DEVICE_GROUPS',targetGroupIds:targetIds['device-groups']}):{targetType:'EXPLICIT_DEVICES' as const,targetDeviceIds:[origin.id]}
}
const timerSelection=computed(()=>{try{return currentTimerSelection()}catch{return undefined}})
/** 下一步和最终提交共用原校验；第一步不创建key、不调用写端口。 */
function draftBody():Schema<'SaveTaskJobRequest'>{
 const origin=source.value
 if(!origin||!(selectableTargets.value?props.transport.createTargets:origin.kind==='DEVICE'&&props.transport.create)||!props.transport.definition)throw new Error('当前任务来源创建入口不可用')
 const timezone=currentProject.value?.timezone
 if(!timezone)throw new Error('项目时区不可用，请重新读取项目')
 if(actionType.value!=='COMMAND'&&actionType.value!=='PROPERTY_SET'&&actionType.value!=='CLOUD_UPDATE'&&actionType.value!=='DATA_DOWNLINK'&&actionType.value!=='PROPERTY_SET_FUNCTION'&&actionType.value!=='CLOUD_UPDATE_FUNCTION'&&actionType.value!=='DATA_DOWNLINK_FUNCTION'&&actionType.value!=='COMMAND_FUNCTION'&&actionType.value!=='OTA_UPGRADE')throw new Error('请选择任务类型')
 if(!form.name.trim()||form.name.trim().length>128||form.description.length>512)throw new Error('请填写有效任务名称和说明')
 if(actionType.value==='COMMAND'&&(!form.commandKey.trim()||form.commandKey.trim().length>64))throw new Error('请配置有效的下发命令')
 if(targetDenied.value)throw new Error('没有所选目标的读取权限，请重新核对目标')
 const selection=currentTimerSelection()
 const tags=taskTagsDraft(tagRows.value)
 const input=actionType.value==='OTA_UPGRADE'?taskOtaUpgradeValue(otaInput.value):actionType.value==='COMMAND_FUNCTION'?taskPropertyFunctionValue({format:'COMMON_JS',source:commandFunctionSource.value}):actionType.value==='DATA_DOWNLINK_FUNCTION'?taskDataFunctionValue(dataFunctionInput.value):isTaskPropertyFunction(actionType.value)?taskPropertyFunctionValue({format:'COMMON_JS',source:actionType.value==='CLOUD_UPDATE_FUNCTION'?cloudFunctionSource.value:functionSource.value}):actionType.value==='DATA_DOWNLINK'?taskDataValue(dataInput.value):actionType.value==='PROPERTY_SET'?taskPropertyValue(propertyInput.value):actionType.value==='CLOUD_UPDATE'?taskPropertyValue(cloudInput.value,'cloud-update'):objectJson(form.input);stableJson(input)
 const plan=plannedCreation.value?taskCreateScheduleIntent(planDraft.value,timezone):{kind:'MANUAL' as const}
 const initial=plan.kind==='MANUAL'?undefined:taskInitialScheduleRequest(plan,timezone)
 return {name:form.name.trim(),description:form.description.trim()||undefined,...(actionType.value!=='COMMAND'?{actionType:actionType.value,commandKey:null}:{commandKey:form.commandKey.trim(),...(commandRequestId.value===undefined?{}:{commandRequestId:taskCommandRequestId(commandRequestId.value)})}),input,...(Object.keys(tags).length?{tags}:{}),scheduleType:initial?.mode||'MANUAL',timezone,...selection,enabled:plannedCreation.value,...(initial?{initialSchedule:initial}:{})}
}
function next(){if(busy.value||configurationOpen.value||configurationBusy.value||unknown.value||settled.value)return;try{draftBody();error.value='';step.value=2}catch(cause){error.value=errorMessage(cause)}}
function previous(){if(!busy.value&&!configurationBusy.value&&!unknown.value&&!settled.value)step.value=1}
async function submit(){
  if(props.stepped&&step.value!==2)return
  if(busy.value||configurationOpen.value||configurationBusy.value||unknown.value||settled.value||!can('task:manage')||!projectId.value)return
  const project=projectId.value,origin=source.value;if(!origin)return
  const originKey=taskCreationSourceKey(origin),epoch=identityEpoch(),turn=generation,current=()=>active&&turn===generation&&epoch===identityEpoch()&&project===projectId.value&&originKey===sourceKey.value&&can('task:manage')
  let attempted=false,accepted=false
  try{
    const body=draftBody(),create=selectableTargets.value?props.transport.createTargets:props.transport.create
    if(!create)throw new Error('当前设备任务创建入口不可用')
    const submitted:Schema<'SaveTaskJobRequest'>=JSON.parse(JSON.stringify(body))
    const key=props.transport.creation?crypto.randomUUID():undefined
    acceptedCreation.value={project,source:origin,key,body:submitted};lookupAgain.value=false;notice.value=''
    busy.value=true;emit('busy',true);error.value='';controller=new AbortController();attempted=true
    const value=await (selectableTargets.value?props.transport.createTargets!(project,body,key):key?props.transport.create!(project,origin.id,body,key):props.transport.create!(project,origin.id,body));accepted=true;if(!current())return
    if(!value||!definitionUuid(value.id)||!matches(value,submitted))throw new Error('任务创建回执与提交范围不一致，请核对后再操作')
    if(submitted.initialSchedule&&cas(value.version)!==1)throw new Error('任务初始版本回执不匹配，请按原请求核对')
    const intent:AcceptedCreation={project,source:origin,id:value.id,version:cas(value.version),key,body:submitted,...(submitted.initialSchedule?.time&&typeof value.runAt==='string'?{runAt:canonicalTaskInstant(value.runAt)}:{})};acceptedCreation.value=intent
    await readAccepted(intent,current)
  }catch(cause){if(current()&&!(cause instanceof IdentityChanged)){error.value=errorMessage(cause);unknown.value=accepted||attempted&&(!(cause instanceof ApiError)||cause.outcomeUnknown||![400,401,403,404,409].includes(cause.status)||!!acceptedCreation.value?.key&&cause.status===409);if(!unknown.value)acceptedCreation.value=undefined}}
  finally{if(current()){busy.value=false;controller=undefined;emit('busy',false)}}
}
function close(){if(!busy.value&&!configurationBusy.value&&!unknown.value)emit('close')}
defineExpose({requestClose:close})
</script>
<template><section class="device-task-create-form" :class="{ 'task-wizard': stepped }">
 <el-form label-position="top" :disabled="busy||unknown||settled" :class="{ 'wizard-form': stepped }" @submit.prevent="submit">
  <p v-if="source&&source.kind!=='PROJECT'" :class="selectableTargets?'wizard-origin':'wizard-help'">来源{{sourceLabels[source.kind]}}：{{source.name||source.id}}</p>
  <template v-if="!stepped||step===1">
   <el-form-item label="任务名称" :class="{'wizard-name':stepped}"><el-input v-model="form.name" aria-label="新任务名称" maxlength="128"/></el-form-item>
   <h2 v-if="stepped" class="wizard-section">设置目标设备</h2>
   <p v-if="stepped" class="wizard-help">执行任务的目标设备，可以是多个指定的设备，也可以是一个设备类型下的所有设备。 <a href="https://www.thingscloud.xyz/docs/guide/tasks/overview.html" target="_blank" rel="noopener noreferrer">了解详情 <ReferenceIcon glyph="󰏌"/></a></p>
   <template v-if="selectableTargets">
    <el-form-item label="目标类型" class="wizard-radio-field"><el-radio-group v-model="targetKind" aria-label="新任务目标类型"><el-radio value="devices">设备</el-radio><el-radio value="device-types">设备类型</el-radio><el-radio value="device-groups">设备组</el-radio></el-radio-group></el-form-item>
    <el-form-item label="选择目标" class="wizard-name">
     <TaskChoiceSelect :key="targetKind" v-model="targetIds[targetKind]" :kind="targetKind" :selected-options="originOptions" :multiple="targetKind!=='device-types'" :maximum="targetKind==='device-types'?1:targetKind==='device-groups'?100:10000" :disabled="busy||unknown||settled" @denied="denyTarget">
      <template #option="{ choice }">
       <span class="task-target-option" :class="{ 'task-target-option--device': targetKind==='devices' }">
        <span v-if="targetKind==='device-groups'" class="el-checkbox__input" :class="{ 'is-checked': targetIds[targetKind].includes(choice.id) }" aria-hidden="true"><span class="el-checkbox__inner"/></span>
        <ReferenceIcon v-else glyph="󰆧"/>
        <span class="task-target-option-name">{{ choice.label }}</span>
       </span>
      </template>
     </TaskChoiceSelect>
    </el-form-item>
   </template>
   <el-form-item v-else label="目标设备">{{source?.name||source?.id}}</el-form-item>
   <h2 v-if="stepped" class="wizard-section">设置任务及操作</h2>
   <p v-if="stepped" class="wizard-help">任务可以对目标设备按预设的时间策略执行任务。 <a href="https://www.thingscloud.xyz/docs/guide/tasks/overview.html" target="_blank" rel="noopener noreferrer">了解详情 <ReferenceIcon glyph="󰏌"/></a></p>
   <el-form-item label="任务类型" class="wizard-radio-field"><el-radio-group v-model="baseAction" aria-label="新任务类型" :disabled="busy||unknown||settled||configurationOpen"><el-radio value="PROPERTY_SET">属性下发</el-radio><el-radio value="CLOUD_UPDATE">属性更新</el-radio><el-radio value="COMMAND">命令下发</el-radio><el-radio value="DATA_DOWNLINK">自定义数据下发</el-radio></el-radio-group></el-form-item>
   <template v-if="isTaskData(actionType)"><el-form-item label="推送方式" class="wizard-radio-field"><el-radio-group v-model="dataRoute.protocol" aria-label="推送方式" :disabled="busy||unknown||settled||configurationOpen"><el-radio value="MQTT">MQTT</el-radio><el-radio value="TCP">TCP</el-radio></el-radio-group></el-form-item><el-form-item label="自定义数据流"><RuleDataStreamIdentifier v-model="dataRoute.streamIdentifier" :choices="[]" :disabled="busy||unknown||settled||configurationOpen"/></el-form-item></template>
   <el-form-item v-if="propertyFamily||cloudFamily" label="选择任务" class="wizard-operation-picker" :class="{'wizard-operation-picker--property':propertyFamily}"><div class="task-property-options">
    <button type="button" class="task-operation-card" :class="{'is-configured':cloudFamily?actionType==='CLOUD_UPDATE'&&configured.CLOUD_UPDATE:actionType==='PROPERTY_SET'&&configured.PROPERTY_SET}" :aria-label="cloudFamily?'配置属性更新':'配置属性下发'" :disabled="busy||unknown||settled" @click="openConfiguration(cloudFamily?'CLOUD_UPDATE':'PROPERTY_SET')"><ReferenceIcon :glyph="cloudFamily?'󱋖':'󰭽'"/><span><strong>{{cloudFamily?'属性更新':'属性下发'}}</strong><span>{{cloudFamily?'向设备更新固定的云端私有属性集合。':'向设备下发固定的属性集合。'}}</span></span></button>
    <button type="button" class="task-operation-card" :class="{'is-configured':cloudFamily?actionType==='CLOUD_UPDATE_FUNCTION'&&configured.CLOUD_UPDATE_FUNCTION:actionType==='PROPERTY_SET_FUNCTION'&&configured.PROPERTY_SET_FUNCTION}" :aria-label="cloudFamily?'配置云函数属性更新':'配置云函数属性下发'" :disabled="busy||unknown||settled" @click="openConfiguration(cloudFamily?'CLOUD_UPDATE_FUNCTION':'PROPERTY_SET_FUNCTION')"><ReferenceIcon glyph="󰡱"/><span><strong>{{cloudFamily?'云函数属性更新':'云函数属性下发'}}</strong><span>{{cloudFamily?'编写 Javascript 云函数，动态生成更新的云端私有属性集合。':'编写 Javascript 云函数，动态生成向设备下发的属性集合。'}}</span></span></button>
   </div></el-form-item>
   <el-form-item v-else-if="isTaskData(actionType)" label="选择任务" class="wizard-operation-picker"><div class="task-property-options task-data-options">
    <button type="button" class="task-operation-card" :class="{'is-configured':actionType==='DATA_DOWNLINK'&&configured.DATA_DOWNLINK}" aria-label="配置自定义下发" :disabled="busy||unknown||settled" @click="openConfiguration('DATA_DOWNLINK')"><ReferenceIcon glyph="󰭽"/><span><strong>自定义下发</strong><span>向设备下发自定义数据。支持 JSON、Plaintext、HEX 等消息格式。</span></span></button>
    <button type="button" class="task-operation-card" :class="{'is-configured':actionType==='DATA_DOWNLINK_FUNCTION'&&configured.DATA_DOWNLINK_FUNCTION&&!hasTaskModbusRtuCommon(dataFunctionInput)}" aria-label="配置云函数自定义下发" :disabled="busy||unknown||settled" @click="openConfiguration('DATA_DOWNLINK_FUNCTION')"><ReferenceIcon glyph="󰡱"/><span><strong>云函数自定义下发</strong><span>编写 Javascript 云函数，动态生成向设备下发的自定义数据。</span></span></button>
    <button type="button" class="task-operation-card" :class="{'is-configured':actionType==='DATA_DOWNLINK_FUNCTION'&&configured.DATA_DOWNLINK_FUNCTION&&!!commonConfiguration()}" aria-label="配置Modbus RTU通用" :disabled="busy||unknown||settled" @click="openConfiguration('DATA_DOWNLINK_FUNCTION',true)"><ReferenceIcon glyph="󰱦"/><span><strong>Modbus RTU 下发</strong><span>向设备下发 Modbus RTU 指令，可用于读取或写入从站数据。</span></span></button>
    <button type="button" class="task-operation-card" :class="{'is-configured':actionType==='DATA_DOWNLINK_FUNCTION'&&configured.DATA_DOWNLINK_FUNCTION&&!!commonConfiguration('MODBUS_TCP')}" aria-label="配置Modbus TCP通用" :disabled="busy||unknown||settled" @click="openConfiguration('DATA_DOWNLINK_FUNCTION',true,true)"><ReferenceIcon glyph="󰱦"/><span><strong>Modbus TCP 下发</strong><span>向设备下发 Modbus TCP 指令，可用于读取或写入从站数据。</span></span></button>
   </div></el-form-item>
   <el-form-item v-else-if="commandFamily" label="选择任务" class="wizard-operation-picker wizard-operation-picker--command"><div class="task-property-options">
    <button type="button" class="task-operation-card" :class="{'is-configured':actionType==='COMMAND'&&configured.COMMAND}" aria-label="配置命令下发" :disabled="busy||unknown||settled" @click="openConfiguration('COMMAND')"><ReferenceIcon glyph="󰭽"/><span><strong>命令下发</strong><span>向设备下发固定的命令。</span></span></button>
    <button type="button" class="task-operation-card" :class="{'is-configured':actionType==='COMMAND_FUNCTION'&&configured.COMMAND_FUNCTION}" aria-label="配置云函数命令下发" :disabled="busy||unknown||settled" @click="openConfiguration('COMMAND_FUNCTION')"><ReferenceIcon glyph="󰡱"/><span><strong>云函数命令下发</strong><span>编写 Javascript 云函数，动态生成向设备下发的命令。</span></span></button>
    <button type="button" class="task-operation-card" :class="{'is-configured':actionType==='OTA_UPGRADE'&&configured.OTA_UPGRADE}" aria-label="配置OTA推送" :disabled="busy||unknown||settled" @click="openConfiguration('OTA_UPGRADE')"><ReferenceIcon glyph="󱋖"/><span><strong>OTA 升级推送</strong><span>通过设备当前版本和 OTA 版本库的比对，生成向设备下发的 OTA 升级命令。</span></span></button>
   </div></el-form-item>
   <el-form-item v-else-if="actionType" label="选择任务"><button type="button" class="task-operation-card" :class="{'is-configured':configured[actionType]}" :aria-label="'配置'+configurationLabel" :disabled="busy||unknown||settled" @click="openConfiguration()"><ReferenceIcon :glyph="actionType==='CLOUD_UPDATE'?'󱋖':'󰭽'"/><span><strong>{{configurationLabel}}</strong><span>{{actionType==='CLOUD_UPDATE'?'向设备更新固定的云端私有属性集合。':actionType==='PROPERTY_SET'?'向设备下发固定的属性集合。':'向设备下发固定的命令。'}}</span></span></button></el-form-item>
   <template v-if="stepped"><h2 class="wizard-section wizard-timing">任务定时设置</h2><TaskCreateScheduleFields v-if="plannedCreation" v-model="planDraft" :selection="timerSelection" :project-zone="currentProject?.timezone" :disabled="busy||unknown||settled"/><p v-else>关闭定时</p></template>
  </template>
  <template v-if="!stepped||step===2"><h2 v-if="stepped" class="wizard-section wizard-settings">其它设置</h2><el-form-item :label="stepped?'规则描述':'任务描述（选填）'" :class="{'wizard-name wizard-description':stepped}"><el-input v-model="form.description" aria-label="新任务描述" type="textarea" maxlength="512" :rows="stepped?5:2"/></el-form-item><RuleTagsEditor v-model="tagRows" ariaLabel="任务标签" :disabled="busy||unknown||settled" :class="{'wizard-tags':stepped}"/></template>
 </el-form>
 <TaskOtaUpgradeDialog v-if="editingAction==='OTA_UPGRADE'" :model-value="configurationOpen" :value="otaInput" :selection="timerSelection" :busy="busy||unknown||settled" :error="error" @update:model-value="closeConfiguration" @save="configureOta"/>
 <TaskModbusTcpCommonDialog :selection="timerSelection" v-else-if="configurationTcp" :model-value="configurationOpen" :value="commonConfiguration('MODBUS_TCP')" :busy="busy||unknown||settled" :error="error" @update:model-value="closeConfiguration" @save="configureModbusTcp" @busy="functionBusy" @denied="functionPreviewDenied"/>
 <TaskModbusRtuCommonDialog :selection="timerSelection" v-else-if="configurationCommon" :model-value="configurationOpen" :value="commonConfiguration()" :busy="busy||unknown||settled" :error="error" @update:model-value="closeConfiguration" @save="configureModbus" @busy="functionBusy" @denied="functionPreviewDenied"/>
 <TaskPropertyFunctionDialog v-else-if="isTaskFunction(editingAction)" :creation-layout="stepped" :purpose="editingAction==='COMMAND_FUNCTION'?'command':editingAction==='DATA_DOWNLINK_FUNCTION'?'data':editingAction==='CLOUD_UPDATE_FUNCTION'?'cloud-update':'downlink'" :model-value="configurationOpen" :value="configurationValue" :busy="busy||unknown||settled" :error="error" @update:model-value="closeConfiguration" @save="configurePropertyFunction" @busy="functionBusy" @denied="functionPreviewDenied"/>
 <TaskDataContentDialog v-else-if="editingAction==='DATA_DOWNLINK'" :model-value="configurationOpen" :value="configurationValue" @update:model-value="closeConfiguration" @save="configureData"/>
 <TaskCommandContentDialog v-else-if="editingAction==='COMMAND'" :creation-layout="stepped" :model-value="configurationOpen" :value="configurationValue" @update:model-value="closeConfiguration" @configured="configureCommand"/>
 <TaskPropertyContentDialog v-else-if="editingAction==='PROPERTY_SET'||editingAction==='CLOUD_UPDATE'" :model-value="configurationOpen" :value="configurationValue" :purpose="editingAction==='CLOUD_UPDATE'?'cloud-update':'downlink'" @update:model-value="closeConfiguration" @save="configureProperties"/>
 <el-alert v-if="error" :title="error" type="warning" :closable="false"/>
 <el-alert v-if="unknown" :title="acceptedCreation?.id?'任务已受理，后续核对尚未完成。请重新读取核对，不要重复创建。':acceptedCreation?.key?'本次创建结果未知，请按原请求重新读取核对，不要重复创建。':'本次创建结果未知，未取得可信任务编号，暂时无法核对。不要重复创建。'" type="warning" :closable="false"/>
 <p v-if="unknown&&acceptedCreation?.id" role="status">任务编号：{{acceptedCreation.id}}</p>
 <el-button v-if="unknown&&(acceptedCreation?.id||acceptedCreation?.key&&transport.creation)" :loading="busy" :disabled="busy" @click="verify">重新读取核对</el-button>
 <el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <el-button v-if="changedCreationId" @click="emit('created',changedCreationId,false)">查看已创建任务</el-button>
 <p v-if="!plannedCreation" class="tl-muted">创建后暂不启用定时，可在任务详情中继续配置。</p>
 <footer class="create-actions" :class="{'is-stepped':stepped,'wizard-next':stepped&&step===1}">
  <template v-if="stepped&&step===1"><el-button type="primary" :disabled="busy||configurationBusy||configurationOpen||unknown||settled" @click="next">下一步</el-button></template>
  <template v-else>
   <el-button v-if="stepped&&!settled" :disabled="busy||unknown||settled" @click="previous">上一步</el-button>
   <el-button v-else :disabled="busy||unknown" @click="close">{{settled?(source?.kind==='PROJECT'?'返回所有任务':source?.kind==='DEVICE_TYPE'?'返回类型任务':'返回设备任务'):'取消'}}</el-button>
   <el-button type="primary" :loading="busy" :disabled="busy||unknown||settled" @click="submit">创建</el-button>
  </template>
 </footer>
</section></template>
<style scoped>
.task-operation-card{display:flex;align-items:center;gap:16px;width:min(100%,350px);padding:16px;border:1px solid #dcdfe6;border-radius:4px;background:#fff;color:#606266;text-align:left;cursor:pointer}
.task-operation-card:hover,.task-operation-card.is-configured{border-color:var(--tl-primary)}.task-operation-card:disabled{cursor:not-allowed;opacity:.65}.task-operation-card>span{display:flex;flex-direction:column;gap:4px}.task-operation-card strong{font-size:16px;line-height:24px;font-weight:400;color:var(--tl-title)}.task-operation-card span span{font-size:13px;line-height:20px}.task-operation-card :deep(.reference-icon){font-size:28px;color:#1e88e5}
.create-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.create-actions .el-button+.el-button{margin-left:0}.create-actions.is-stepped{justify-content:flex-start}.wizard-section{font-size:20px;line-height:28px;font-weight:400;margin:40px 0 8px;color:var(--tl-title)}.wizard-section:first-child{margin-top:0}.wizard-name{width:100%;max-width:350px}.wizard-command{width:100%;max-width:760px}.wizard-help{margin:0 0 24px;font-size:14px;line-height:22px;color:var(--tl-muted);overflow-wrap:anywhere}.wizard-help a{margin-left:6px;color:var(--tl-primary);text-decoration:none;white-space:nowrap}.wizard-help a:hover{text-decoration:underline}
</style>

<style scoped>.task-property-options{display:flex;flex-direction:column;gap:10px;width:100%}.task-data-options .task-operation-card{width:100%;min-height:84px;gap:12px;padding:16px 20px;border-radius:0}.task-data-options .task-operation-card :deep(.reference-icon){display:inline-flex;align-items:center;justify-content:center;flex:none;width:40px;height:40px;font-size:24px;border-radius:3px;background:#409eff;color:#fff}</style>

<style scoped>
.wizard-origin { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.wizard-form .wizard-section { margin: 48px 0 6px; color: #002822; }
.wizard-form .wizard-help { margin-bottom: 26px; color: #666; }
.wizard-form .wizard-help a { display: inline-flex; align-items: center; gap: 4px; color: #1e88e5; font-weight: 500; }
.wizard-help .reference-icon { font-size: 14px; }
.wizard-form :deep(.el-form-item--label-top .el-form-item__label) { margin-bottom: 6px; color: var(--tl-text); font-size: 14px; font-weight: 600; line-height: 22px; }
.wizard-form .wizard-radio-field { margin-bottom: 26px; }
.wizard-form .wizard-radio-field :deep(.el-radio),
.wizard-form :deep(.schedule-modes .el-radio) { height: 24px; }
.wizard-form .wizard-radio-field :deep(.el-form-item__content),
.wizard-form :deep(.create-schedule-fields .el-form-item__content) { line-height: 24px; }
.wizard-form :deep(.el-radio__label) { padding-left: 10px; }
.wizard-form .wizard-name :deep(.el-select__wrapper) { padding-inline: 15px; }
.task-target-option { display: flex; align-items: center; gap: 12px; }
.task-target-option .reference-icon { color: #999; }
.task-target-option--device .reference-icon { font-size: 26px; }
.task-target-option--device .task-target-option-name { font-weight: 700; }
.task-target-option-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.wizard-form .wizard-operation-picker :deep(.el-form-item__label) { margin-bottom: 14px; }
.wizard-form .task-operation-card { width: 100%; min-height: 84px; gap: 10px; padding: 16px 20px; border-color: var(--tl-border); }
.wizard-form .task-operation-card:hover, .wizard-form .task-operation-card.is-configured { border-color: var(--tl-primary); }
.wizard-form .task-operation-card.is-configured { border-radius: 0; }
.wizard-form .task-operation-card > span { gap: 2px; }
.wizard-form .task-operation-card > .reference-icon { flex: none; flex-direction: row; width: 40px; height: 40px; border-radius: 4px; background: #458685; color: #fff; font-size: 24px; }
.wizard-form .wizard-operation-picker--command .task-operation-card > .reference-icon { background: #34c995; }
.wizard-form .wizard-operation-picker--property .task-operation-card > .reference-icon { background: #f9bd26; }
.wizard-form .task-data-options .task-operation-card > .reference-icon { background: #609ff4; }
.wizard-form .wizard-timing { margin-top: 70px; margin-bottom: 10px; }
.wizard-form .wizard-operation-picker + .wizard-timing { margin-top: 78px; }
.wizard-form .wizard-settings { margin: 0 0 10px; padding-top: 4px; }
.wizard-form .wizard-description { margin-bottom: 28px; }
.wizard-tags :deep(.tag-label) { padding: 0; margin-bottom: 6px; line-height: 22px; font-weight: 600; }
.task-wizard .create-actions.is-stepped { gap: 10px; margin-top: 50px; }
.task-wizard .create-actions.wizard-next { margin-top: 100px; }
@media (max-width: 600px) {
 .wizard-form .wizard-section, .wizard-form .wizard-operation-picker + .wizard-timing { margin-top: 32px; }
 .wizard-form .wizard-settings { margin-top: 0; }
 .task-wizard .create-actions.wizard-next { margin-top: 50px; }
}
</style>
