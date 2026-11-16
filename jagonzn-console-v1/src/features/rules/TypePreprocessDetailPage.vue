<script setup lang="ts">
import {computed,inject,onScopeDispose,provide,ref,shallowRef,watch} from 'vue'
import RuleSourceInline from './RuleSourceInline.vue'
import RuleDataInputStreamDialog from './RuleDataInputStreamDialog.vue'
import {refreshRuleSourceEntry} from './rule-detail-source-refresh'
import {sameDeviceSource,deviceSourceMembers,type RuleDeviceSourceContract} from './rule-source-api'
import {deviceDataSourceContextKey,readDeviceDataSourceContext,commonDeviceDataStreams,deviceDataInputStreams,deviceDataSourceProfile,type DeviceDataSourceContext} from './device-data-source-context'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute,useRouter} from 'vue-router'
import {can,currentProject,projectId,session} from '@/core/session'
import {api,ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {formatTime} from '@/core/time'
import {WarningFilled} from '@element-plus/icons-vue'
import UsageStatisticsPanel from './UsageStatisticsPanel.vue'
import RuleDebugLogPanel from './RuleDebugLogPanel.vue'
import RuleDeviceParticipationPanel from './RuleDeviceParticipationPanel.vue'
import RuleTagsEditor from './RuleTagsEditor.vue'
import {ruleDebugLogTransport} from './rule-debug-transport'
import {useDetailTab} from './detail-tab'
import {readRawRuleJson} from './raw-rule-json'
import {ruleDeletionIntent,removeMessageRule,readMessageRuleDeletion,type RuleDeletionIntent} from './message-rule-deletion'
import {exactRevisionCounter} from './preprocess-version-editor'
import {newRuleTag,ruleTagsValue,type RuleTagDraft} from './rule-tag-draft'
import {dataOperationLabels} from './data-operations-api'
import DataOperationsEditor from './DataOperationsEditor.vue'
import {dataOperationView,applyDataOperationDraft,type DataOperationCommand} from './data-operation-draft'
import {validateDataOperationsContext,type DataOperations} from './data-operations-api'
import RulePreprocessFunctionsEditor from './RulePreprocessFunctionsEditor.vue'
import RulePreprocessOperationTable from './RulePreprocessOperationTable.vue'
import ModbusRtuParserSummary from './ModbusRtuParserSummary.vue'
import RulePreprocessConditions from './RulePreprocessConditions.vue'
import type {PropertyOperationCommand} from './property-operations-draft'
import {propertyOperationLabel} from './property-operations-draft'
import RuleConditionGroupEditor from './RuleConditionGroupEditor.vue'
import {loadTypePreprocessContent,typePreprocessDraftChanged,makeTypePreprocessRevisionIntent,confirmTypePreprocessRevision,upgradeSingleDataOperation,type LoadedTypePreprocessContent,type TypePreprocessEditDraft,type TypePreprocessRevisionIntent} from './preprocess-version-editor'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {definitionUuid} from './device-task-definition-port'
import {ruleKindLabels} from './rule-builder-draft'
import {preprocessHasStateControl,readTypePreprocessor,makeTypePreprocessStateIntent,applyTypePreprocessStateIntent,confirmTypePreprocessState,type TypePreprocessStateIntent,reviseTypePreprocessor,knownPreprocessRejection,PreprocessOutcomeUnknown,makeTypePreprocessActivationIntent,activateTypePreprocessIntent,confirmTypePreprocessActivation,type TypePreprocessActivationIntent} from './preprocess-control-api'
import {typeProfileTransport} from '../device-types/profile-api'
import {dataStreamTransport,dataStreamTemplate,type DataStreamItem} from '../device-types/data-stream-publication-api'
const sourceBusy=ref(false),sourceLocked=ref(false),sourceNavigation=ref(false),refreshSourceEntry=inject(refreshRuleSourceEntry)
const props=defineProps<{typeId:string;dataSource?:RuleDeviceSourceContract}>(),route=useRoute(),router=useRouter()
const deviceContext=shallowRef<DeviceDataSourceContext>(),dataSourceKey=computed(()=>props.dataSource?JSON.stringify(props.dataSource):'')
provide(deviceDataSourceContextKey,computed(()=>deviceContext.value))
const validOrigin=computed(()=>{try{return props.dataSource?.kind==='DEVICE'?deviceSourceMembers(props.dataSource).length>0:definitionUuid(props.typeId)}catch{return false}})
const dataContexts=computed(()=>deviceContext.value?.members.map(member=>{const stream=member.streams.find(stream=>stream.identifier===data.value?.streamIdentifier);return{deviceKind:member.profile.type.deviceKind,payloadProtocol:member.profile.type.payloadProtocol,streamFormat:stream?.format??'',streamTemplate:stream?dataStreamTemplate(stream):undefined}}))
const tab=useDetailTab(['rule','devices','statistics','logs','settings'],'rule')
const devicesVisited=ref(false),devicesBusy=ref(false),devicesLocked=ref(false),logsVisited=ref(false),logsBusy=ref(false),logsLocked=ref(false),logsConfirming=ref(false)
const panelsBlocked=computed(()=>sourceBusy.value||sourceLocked.value||devicesBusy.value||devicesLocked.value||logsBusy.value||logsLocked.value||logsConfirming.value)
const information=ref(false),tagEditing=ref(false),removal=ref(false),confirmedExit=ref(false),informationName=ref(''),informationDescription=ref(''),tagRows=ref<RuleTagDraft[]>([])
const metadata=ref<{createdAt?:string;updatedAt?:string}>({})
type TypeFacts=Awaited<ReturnType<typeof readTypePreprocessor>>
type SettingsIntent={attemptId:string;before:TypeFacts;kind:'information';name:string;description:string|null}|{attemptId:string;before:TypeFacts;kind:'tags';tags:Record<string,string>}|{attemptId:string;deletion:RuleDeletionIntent;kind:'remove'}
const settingsIntent=shallowRef<SettingsIntent>(),stateIntent=shallowRef<TypePreprocessStateIntent>()
const ruleId=computed(()=>typeof route.params.id==='string'&&definitionUuid(route.params.id)?route.params.id:'')
const allowed=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&currentProject.value?.id===projectId.value&&['ACTIVE','ARCHIVED'].includes(currentProject.value.status??'')&&['OWNER','ADMIN'].includes(session.user.projectRole??'')&&['OWNER','ADMIN'].includes(currentProject.value.myRole??'')&&can('rule:manage')&&can('device:read')&&validOrigin.value&&!!ruleId.value)
const writable=computed(()=>allowed.value&&currentProject.value?.status==='ACTIVE')
const data=shallowRef<Awaited<ReturnType<typeof readTypePreprocessor>>>(),typeName=ref(''),loading=ref(false),busy=ref(false),unknown=ref(false),error=ref(''),notice=ref(''),dataError=ref(''),streams=shallowRef<readonly DataStreamItem[]>([])
const sourceKind=ref(''),sourceProtocol=ref(''),stagedOperations=shallowRef<DataOperations>(),operationsLocked=ref(false)
const gatewayDataAvailable=ref(false),subdeviceAddressAllowed=ref(false)
const sourceEditing=ref(false)
const inputStreamEditing=ref(false)
const operationCommand=shallowRef<PropertyOperationCommand>(),dataCommand=shallowRef<DataOperationCommand>(),filterEditing=ref(false)
const editing=ref(false),loaded=shallowRef<LoadedTypePreprocessContent>(),draft=ref<TypePreprocessEditDraft>(),pending=shallowRef<{loaded:LoadedTypePreprocessContent;intent:TypePreprocessRevisionIntent;candidate?:Awaited<ReturnType<typeof readTypePreprocessor>>;inputStreamOnly?:boolean;activation?:TypePreprocessActivationIntent;activationAttempted?:boolean}>()
const dataNative=computed(()=>data.value?.subdeviceNativeParser??data.value?.nativeParser)
const dirty=computed(()=>{if(!editing.value||!loaded.value||!draft.value)return false;try{return typePreprocessDraftChanged(loaded.value,draft.value)}catch{return true}})
const navigationBlocked=computed(()=>inputStreamEditing.value||sourceEditing.value||busy.value||unknown.value||!!pending.value||!!stateIntent.value||dirty.value||operationsLocked.value||panelsBlocked.value||information.value||tagEditing.value||removal.value)
const sourceEditorDisabled=computed(()=>!writable.value||busy.value||unknown.value||loading.value||operationsLocked.value||panelsBlocked.value)
const editingBlocked=computed(()=>sourceEditorDisabled.value||sourceEditing.value)
const dataStream=computed(()=>streams.value.find(s=>s.identifier===data.value?.streamIdentifier))
const dataReady=computed(()=>{
 const value=data.value,stream=dataStream.value;if(value?.kind!=='DATA_RPT')return true
 if(!stream)return false
 if(value.dataOperations){try{for(const context of dataContexts.value??[{deviceKind:sourceKind.value,payloadProtocol:sourceProtocol.value,streamFormat:stream.format,streamTemplate:dataStreamTemplate(stream)}])validateDataOperationsContext(value.dataOperations,context);return ['TEXT','HEX','JSON'].includes(stream.format)&&value.dataOperations.operations.every(op=>!op.dataDownlink||subdeviceAddressAllowed.value||streams.value.some(target=>target.identifier===op.dataDownlink!.streamIdentifier))}catch{return false}}
 return (dataNative.value?stream.format==='HEX':['TEXT','HEX','JSON'].includes(stream.format))&&(!value.subdeviceNativeParser||subdeviceAddressAllowed.value)&&(!subdeviceAddressAllowed.value||!value.nativeParser)&&(!value.gatewayParser||gatewayDataAvailable.value)&&(!value.dataDownlink||streams.value.some(s=>s.identifier===value.dataDownlink!.streamIdentifier))
})
const stateSupported=computed(()=>preprocessHasStateControl(data.value?.kind??''))
const newCandidate=computed(()=>!!data.value&&data.value.first.activeVersionId!==data.value.versionId)
let alive=true,generation=0,controller:AbortController|undefined
function clearEditor(){inputStreamEditing.value=false;filterEditing.value=false;operationCommand.value=undefined;dataCommand.value=undefined;sourceEditing.value=false;stagedOperations.value=undefined;operationsLocked.value=false;editing.value=false;loaded.value=undefined;draft.value=undefined}
function reset(){stateIntent.value=undefined;generation++;controller?.abort();deviceContext.value=undefined;data.value=undefined;sourceBusy.value=false;sourceLocked.value=false;typeName.value='';sourceKind.value='';sourceProtocol.value='';gatewayDataAvailable.value=false;subdeviceAddressAllowed.value=false;streams.value=[];loading.value=false;busy.value=false;unknown.value=false;error.value='';notice.value='';dataError.value='';pending.value=undefined;settingsIntent.value=undefined;information.value=false;tagEditing.value=false;removal.value=false;confirmedExit.value=false;metadata.value={};tagRows.value=[];devicesBusy.value=false;devicesLocked.value=false;logsBusy.value=false;logsLocked.value=false;logsConfirming.value=false;devicesVisited.value=tab.value==='devices';logsVisited.value=tab.value==='logs';clearEditor()}
function capture(){return{generation,epoch:identityEpoch(),projectId:projectId.value,actor:session.user?.accountId,deviceTypeId:props.typeId,...(props.dataSource?{deviceSource:props.dataSource}:{}),sourceKey:dataSourceKey.value,ruleId:ruleId.value,scopeKey:`${identityEpoch()}:${generation}:${projectId.value}:${props.typeId}:${ruleId.value}`}}
function current(s:ReturnType<typeof capture>){return alive&&allowed.value&&s.actor===session.user?.accountId&&generation===s.generation&&s.epoch===identityEpoch()&&projectId.value===s.projectId&&props.typeId===s.deviceTypeId&&dataSourceKey.value===s.sourceKey&&ruleId.value===s.ruleId}
function denied(cause:unknown){const actual=cause instanceof PreprocessOutcomeUnknown?cause.cause:cause;if(actual instanceof ApiError&&actual.status===404&&(pending.value||settingsIntent.value||stateIntent.value)&&unknown.value)return;if(actual instanceof ApiError&&[401,403,404].includes(actual.status)){data.value=undefined;deviceContext.value=undefined;pending.value=undefined;settingsIntent.value=undefined;stateIntent.value=undefined;unknown.value=false;information.value=false;tagEditing.value=false;removal.value=false;tagRows.value=[];metadata.value={};clearEditor()}}
async function load(){
 if(!allowed.value||busy.value||loading.value||unknown.value||stateIntent.value||editing.value||pending.value||settingsIntent.value||panelsBlocked.value||information.value||tagEditing.value||removal.value)return
 const s=capture();controller?.abort();controller=new AbortController();loading.value=true;error.value=''
 try{const value=await readTypePreprocessor(s,s.ruleId,()=>current(s),controller.signal,!!s.deviceSource);if(!current(s))return;if(s.deviceSource&&!sameDeviceSource(s.deviceSource,value.deviceSource)){await sourceChanged(value.deviceSource);return}
  if(s.deviceSource){const context=await readDeviceDataSourceContext(s.projectId,s.deviceSource,controller.signal);if(!current(s))return;deviceContext.value=context;const profile=deviceDataSourceProfile(context);typeName.value=context.members.map(member=>member.name).join('、');sourceKind.value=profile.deviceKind;sourceProtocol.value=profile.payloadProtocol;gatewayDataAvailable.value=context.members.every(member=>member.profile.type.deviceKind==='GATEWAY'&&member.profile.type.payloadProtocol==='STANDARD_GATEWAY');subdeviceAddressAllowed.value=context.members.every(member=>member.profile.type.deviceKind==='SUB_DEVICE');streams.value=commonDeviceDataStreams(context);dataError.value=''}
  else{const profile=await typeProfileTransport.read(s.projectId,s.deviceTypeId,controller.signal);if(!current(s))return;if(profile.type.id!==s.deviceTypeId||profile.type.projectId!==s.projectId)throw new Error('类型资料来源不匹配');typeName.value=profile.type.name;sourceKind.value=profile.type.deviceKind;sourceProtocol.value=profile.type.payloadProtocol;gatewayDataAvailable.value=profile.type.deviceKind==='GATEWAY'&&profile.type.payloadProtocol==='STANDARD_GATEWAY';subdeviceAddressAllowed.value=profile.type.deviceKind==='SUB_DEVICE';streams.value=[];dataError.value='';if(value.kind==='DATA_RPT')try{const publication=await dataStreamTransport.read(s.projectId,s.deviceTypeId,controller.signal);if(current(s))streams.value=publication.publication?.definition.streams.filter(stream=>!stream.disabled)??[]}catch(cause){if(current(s))dataError.value=errorMessage(cause)}}
  if(current(s)){data.value=value;unknown.value=false}
 }catch(cause){if(current(s)){error.value=errorMessage(cause);data.value=undefined}}finally{if(current(s))loading.value=false}
}
function edit(){if(!writable.value||busy.value||loading.value||unknown.value||pending.value||editing.value||!data.value||panelsBlocked.value||information.value||tagEditing.value||removal.value)return;try{loaded.value=loadTypePreprocessContent(capture(),data.value);draft.value=loaded.value.draft;editing.value=true;error.value='';notice.value='';tab.value='rule'}catch(cause){error.value=errorMessage(cause)}}
const propertyRows=computed(()=>{const value=data.value;if(!value||value.kind==='DATA_RPT')return [];try{const current=loadTypePreprocessContent(capture(),value).draft;return current.propertyOperations?.operations??current.functions}catch{return []}})
function openCommand(kind:PropertyOperationCommand['kind'],id?:string){if(!settingsReady.value)return;filterEditing.value=false;const index=id===undefined?-1:propertyRows.value.findIndex(row=>row.id===id);if((kind==='EDIT'||kind==='REMOVE')&&index<0)return;edit();if(editing.value)operationCommand.value=kind==='EDIT'||kind==='REMOVE'?{token:crypto.randomUUID(),kind,index}:{token:crypto.randomUUID(),kind}}
const propertyFilter=computed(()=>{const value=data.value;if(!value||value.kind!=='ATTRS_RPT_PREPROC')return;try{return loadTypePreprocessContent(capture(),value).draft.filter}catch{return undefined}})
const dataOperationsView=computed(()=>{if(data.value?.kind!=='DATA_RPT')return;try{return dataOperationView(loadTypePreprocessContent(capture(),data.value).draft)}catch{return undefined}})
const editableDataOperations=computed(()=>draft.value?stagedOperations.value??dataOperationView(draft.value):undefined)
const legacyDataMode=computed(()=>!data.value?.dataOperations&&(!editing.value||!draft.value?.dataOperations&&!stagedOperations.value))
function openDataCommand(value:{kind:'ADD'|'SORT'}|{kind:'EDIT'|'REMOVE';id:string}){if(!settingsReady.value||data.value?.kind!=='DATA_RPT')return;if(!dataStream.value){error.value='当前发布中没有此数据流，请重新读取发布配置';return}edit();if(!editing.value||!draft.value)return;try{if(value.kind==='ADD'&&!draft.value.dataOperations)stagedOperations.value=upgradeSingleDataOperation(draft.value,props.dataSource?deviceDataInputStreams(deviceContext.value,props.dataSource,data.value.streamIdentifier!):[dataStream.value]);dataCommand.value={...value,token:crypto.randomUUID()}}catch(cause){clearEditor();error.value=errorMessage(cause)}}
function stageDataOrder(value:DataOperations){if(sourceEditorDisabled.value||!draft.value||dataCommand.value?.kind!=='SORT')return;try{draft.value=applyDataOperationDraft(draft.value,value,false)}catch(cause){error.value=errorMessage(cause)}}
function commitDataOperation(value:DataOperations){if(sourceEditorDisabled.value||!draft.value||!loaded.value||!dataCommand.value)return;try{draft.value=applyDataOperationDraft(draft.value,value,dataCommand.value.kind==='ADD');stagedOperations.value=undefined;commitOperation()}catch(cause){error.value=errorMessage(cause)}}
function openInputStream(){if(!settingsReady.value||data.value?.kind!=='DATA_RPT')return;edit();if(editing.value)inputStreamEditing.value=true}
function saveInputStream(identifier:string){if(!inputStreamEditing.value||sourceEditorDisabled.value||!draft.value)return;draft.value.streamIdentifier=identifier;if(!dirty.value){cancelEdit();return}void save(true,true)}
function openFilter(){if(!settingsReady.value||data.value?.kind!=='ATTRS_RPT_PREPROC')return;edit();if(editing.value)filterEditing.value=true}
function commitOperation(){if(sourceEditorDisabled.value)return;if(!dirty.value){clearEditor();return}void save(true)}
function cancelEdit(){if(busy.value||unknown.value||operationsLocked.value)return;clearEditor();error.value='';notice.value=''}
function saved(value:Awaited<ReturnType<typeof readTypePreprocessor>>,message='已保存最新内容；规则保持未启用。'){data.value=value;pending.value=undefined;unknown.value=false;clearEditor();notice.value=message}
async function activateSaved(){
 const original=pending.value;if(!writable.value||!original?.activation||original.activationAttempted)return
 const s=capture();pending.value={...original,activationAttempted:true};controller?.abort();controller=new AbortController();busy.value=true;error.value=''
 try{const after=await activateTypePreprocessIntent(s,original.activation,()=>current(s),controller.signal);if(current(s))saved(after,'已保存并生效。')}
 catch(cause){if(current(s)){error.value=errorMessage(cause);if(knownPreprocessRejection(cause)){saved(original.candidate!,'内容已保存，但生效未完成；请核对当前状态。')}else{unknown.value=true;denied(cause)}}}finally{if(current(s))busy.value=false}
}
async function revisionSaved(value:Awaited<ReturnType<typeof readTypePreprocessor>>,readOnly=false){
 const original=pending.value;if(!original)throw new Error('原修订意图已不可用')
 if(original.inputStreamOnly){saved(value,'已保存自定义数据流；候选内容尚未生效。');return}
 if(preprocessHasStateControl(original.loaded.before.kind)&&original.loaded.before.first.status==='ACTIVE'){
  const activation=makeTypePreprocessActivationIntent(capture(),value,crypto.randomUUID());data.value=value;pending.value={...original,candidate:value,activation,activationAttempted:false};unknown.value=false;clearEditor();notice.value='内容已保存，尚未完成生效。'
  if(!readOnly)await activateSaved()
 }else saved(value)
}
async function save(fromOperation=false,inputStreamOnly=false){
 if((fromOperation?sourceEditorDisabled.value:editingBlocked.value)||!loaded.value||!draft.value||!dirty.value)return
 let intent:TypePreprocessRevisionIntent;try{if(!inputStreamOnly&&preprocessHasStateControl(loaded.value.before.kind)&&loaded.value.before.first.status==='ACTIVE'&&BigInt(loaded.value.before.first.version)>9223372036854775805n)throw new Error('规则修订已达上限，无法完成保存并生效');if(draft.value.dataOperations){if(!dataStream.value)throw new Error('请选择当前发布的上报流');for(const context of dataContexts.value??[{deviceKind:sourceKind.value,payloadProtocol:sourceProtocol.value,streamFormat:dataStream.value.format,streamTemplate:dataStreamTemplate(dataStream.value)}])validateDataOperationsContext(draft.value.dataOperations,context)}intent=makeTypePreprocessRevisionIntent(loaded.value,draft.value,crypto.randomUUID())}catch(cause){error.value=errorMessage(cause);return}
 const s=capture(),before=loaded.value;pending.value={loaded:before,intent,inputStreamOnly};controller?.abort();controller=new AbortController();busy.value=true;error.value='';notice.value=''
 try{const value=await reviseTypePreprocessor(s,before.before,intent,()=>current(s),controller.signal);if(current(s))await revisionSaved(value)}catch(cause){if(current(s)){error.value=errorMessage(cause);if(knownPreprocessRejection(cause)){pending.value=undefined;notice.value='修订已被拒绝，草稿已保留；若基线已变化，请取消编辑后刷新。'}else{unknown.value=true;if(inputStreamOnly)inputStreamEditing.value=false}denied(cause)}}finally{if(current(s))busy.value=false}
}
async function verifyRevision(){
 if(!allowed.value||busy.value||!pending.value)return
 const s=capture(),original=pending.value;controller?.abort();controller=new AbortController();busy.value=true;error.value=''
 try{const value=await readTypePreprocessor(s,s.ruleId,()=>current(s),controller.signal);if(original.activation){confirmTypePreprocessActivation(original.activation,value);if(current(s))saved(value,'已核对保存并生效。')}else{confirmTypePreprocessRevision(original.loaded,original.intent,value);if(current(s))await revisionSaved(value,true)}}catch(cause){if(current(s)){unknown.value=true;error.value=errorMessage(cause);denied(cause)}}finally{if(current(s))busy.value=false}
}
async function change(enabled:boolean){
 if(!writable.value||busy.value||loading.value||unknown.value||stateIntent.value||pending.value||editing.value||!data.value||panelsBlocked.value||information.value||tagEditing.value||removal.value||!preprocessHasStateControl(data.value.kind)||enabled&&!dataReady.value||!enabled&&data.value.first.status!=='ACTIVE')return
 const s=capture();let intent:TypePreprocessStateIntent;try{intent=makeTypePreprocessStateIntent(s,data.value,enabled,crypto.randomUUID())}catch(cause){error.value=errorMessage(cause);return}
 stateIntent.value=intent;controller?.abort();controller=new AbortController();busy.value=true;error.value='';notice.value=''
 try{const value=await applyTypePreprocessStateIntent(s,intent,()=>current(s),controller.signal);if(current(s)){data.value=value;stateIntent.value=undefined;notice.value='已核对当前启用状态。'}}catch(cause){if(current(s)){error.value=errorMessage(cause);if(knownPreprocessRejection(cause))stateIntent.value=undefined;else unknown.value=true;denied(cause)}}finally{if(current(s))busy.value=false}
}
async function verifyState(){
 const intent=stateIntent.value;if(!intent||!allowed.value||busy.value)return
 const s=capture();controller?.abort();controller=new AbortController();busy.value=true;error.value=''
 try{const value=await readTypePreprocessor(s,intent.ruleId,()=>current(s),controller.signal);confirmTypePreprocessState(intent,value);if(current(s)){data.value=value;stateIntent.value=undefined;unknown.value=false;notice.value='已读取并核对当前启用状态，未重发请求。'}}catch(cause){if(current(s)){unknown.value=true;error.value=errorMessage(cause);denied(cause)}}finally{if(current(s))busy.value=false}
}

function destination(){if(props.dataSource){const origin=String(route.query.deviceId??'').toLowerCase();return route.query.source==='device'&&deviceSourceMembers(props.dataSource).includes(origin)?{path:'/devices/'+origin,query:{tab:'rules'}}:{path:'/rules/messages'}}return route.query.origin==='directory'?{path:'/rules/messages'}:{path:'/device-types/'+props.typeId,query:{tab:'rules'}}}
function back(){if(!navigationBlocked.value)void router.push(destination())}
onBeforeRouteLeave(()=>!navigationBlocked.value||confirmedExit.value);onBeforeRouteUpdate(to=>sourceNavigation.value||!navigationBlocked.value||to.fullPath===route.fullPath)
const settingsReady=computed(()=>writable.value&&!!data.value&&!busy.value&&!loading.value&&!unknown.value&&!pending.value&&!editing.value&&!panelsBlocked.value&&!settingsIntent.value)

async function readMetadata(s:ReturnType<typeof capture>,value:TypeFacts,signal?:AbortSignal){
 const bytes=await api<Uint8Array>(`/api/v1/projects/${s.projectId}/message-rules/${s.ruleId}`,{signal,responseType:'bytes'})
 if(!current(s)||data.value!==value)return
 const record=readRawRuleJson(bytes)
 if(record.at(['id']).string()!==s.ruleId||record.at(['version']).integerText()!==value.first.version)throw new Error('规则信息已变化，请刷新后再操作')
 metadata.value={createdAt:record.optional(['createdAt'])?.string(),updatedAt:record.optional(['updatedAt'])?.string()}
}
function controlScope(){const s=capture();return {projectId:s.projectId,ruleId:s.ruleId,scopeKey:s.scopeKey}}
async function refreshDeviceContext(){
 const s=capture(),value=await readTypePreprocessor(s,s.ruleId,()=>current(s))
 if(!current(s))throw new Error('当前规则范围已变化')
 data.value=value;return value.first.version
}
async function sourceChanged(source:RuleDeviceSourceContract){sourceNavigation.value=true;try{if(refreshSourceEntry)await refreshSourceEntry(source);else{await refreshDeviceContext();if(data.value)await readMetadata(capture(),data.value)}}finally{sourceNavigation.value=false}}
function sourceDenied(cause:ApiError,uncertain:boolean){const message=(uncertain?'原来源保存结果未确认。':'')+errorMessage(cause);reset();error.value=message}
function panelDenied(cause:ApiError){error.value=errorMessage(cause);denied(cause)}
function openInformation(){if(!settingsReady.value||!data.value||information.value||tagEditing.value||removal.value)return;informationName.value=data.value.first.name;informationDescription.value=data.value.first.description??'';information.value=true;error.value=''}
function openTags(){if(!settingsReady.value||!data.value||information.value||tagEditing.value||removal.value)return;tagRows.value=Object.entries(data.value.tags).map(([key,value])=>({...newRuleTag(),key,value}));tagEditing.value=true;error.value=''}
function closeSettings(){if(busy.value||unknown.value)return;information.value=false;tagEditing.value=false;removal.value=false;informationName.value='';informationDescription.value='';tagRows.value=[]}
function sameTags(a:Readonly<Record<string,string>>,b:Readonly<Record<string,string>>){return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>Object.hasOwn(b,key)&&a[key]===b[key])}
function confirmSettings(intent:SettingsIntent,after:TypeFacts){
 if(intent.kind==='remove')throw new Error('移除结果尚不能确认，请勿重复移除')
 const before=intent.before,expected=BigInt(before.first.version)+(intent.kind==='tags'&&sameTags(before.tags,intent.tags)?0n:1n)
 const name=intent.kind==='information'?intent.name:before.first.name,description=intent.kind==='information'?intent.description:before.first.description,tags=intent.kind==='tags'?intent.tags:before.tags
 if(BigInt(after.first.version)!==expected||after.first.id!==before.first.id||after.first.name!==name||after.first.description!==description||after.first.status!==before.first.status||after.first.activeVersionId!==before.first.activeVersionId||!sameDeviceSource(after.deviceSource,before.deviceSource)||after.versionId!==before.versionId||after.versionNumber!==before.versionNumber||after.source!==before.source||after.sourceSha256!==before.sourceSha256||after.actionsJson!==before.actionsJson||after.preprocessingJson!==before.preprocessingJson||after.sourceFormat!==before.sourceFormat||after.streamIdentifier!==before.streamIdentifier||after.nativeParserJson!==before.nativeParserJson||after.subdeviceNativeParserJson!==before.subdeviceNativeParserJson||after.gatewayParserJson!==before.gatewayParserJson||after.dataDownlinkJson!==before.dataDownlinkJson||after.dataOperationsJson!==before.dataOperationsJson||!sameTags(after.tags,tags))throw new Error('规则修改结果尚未完整核对，请勿重复保存')
}
async function saveSettings(kind:'information'|'tags'|'remove'){
 if(!settingsReady.value||!data.value)return
 let intent:SettingsIntent
 try{
  if(kind==='information'){
   const name=informationName.value.trim(),description=informationDescription.value.trim()||null
   if(!information.value||!name||name.length>128||(description?.length??0)>512)throw new Error('请核对规则名称和描述')
   intent={kind,attemptId:crypto.randomUUID(),before:data.value,name,description}
  }else if(kind==='tags'){if(!tagEditing.value)return;intent={kind,attemptId:crypto.randomUUID(),before:data.value,tags:ruleTagsValue(tagRows.value)}}
  else {if(!removal.value)return;const deletion=ruleDeletionIntent(projectId.value,String(route.params.id??''),session.user?.accountId??'',data.value.first.version);intent={kind,attemptId:deletion.key,deletion}}
  exactRevisionCounter(intent.kind==='remove'?intent.deletion.expectedVersion:intent.before.first.version)
 }catch(cause){error.value=errorMessage(cause);return}
 const s=capture(),root=`/api/v1/projects/${s.projectId}/message-rules/${s.ruleId}` as const
 settingsIntent.value=intent;busy.value=true;error.value='';notice.value='';let accepted=false
 try{
  const headers={'Content-Type':'application/json','Idempotency-Key':intent.attemptId}
  if(intent.kind==='remove'){
   await removeMessageRule(intent.deletion);accepted=true
   if(current(s)){settingsIntent.value=undefined;unknown.value=false;confirmedExit.value=true;await router.replace(destination())}
   return
  }
  if(intent.kind==='information'){
   const fields:Record<keyof Pick<Schema<'MessageRuleWriteRequest'>,'name'|'description'|'expectedVersion'>,string>={name:JSON.stringify(intent.name),description:JSON.stringify(intent.description),expectedVersion:intent.before.first.version}
   await api(root,{method:'put',query:{informationOnly:true},headers,rawBody:'{'+Object.entries(fields).map(([key,value])=>JSON.stringify(key)+':'+value).join(',')+'}'})
  }else{
   const fields:Record<keyof Schema<'MessageRuleTagsWriteRequest'>,string>={expectedVersion:intent.before.first.version,tags:JSON.stringify(intent.tags)}
   await api(`${root}/tags`,{method:'put',headers,rawBody:'{'+Object.entries(fields).map(([key,value])=>JSON.stringify(key)+':'+value).join(',')+'}'})
  }
  accepted=true
  const after=await readTypePreprocessor(s,s.ruleId,()=>current(s));if(!current(s))return
  confirmSettings(intent,after);data.value=after;settingsIntent.value=undefined;unknown.value=false;busy.value=false;closeSettings();notice.value='已保存'
 }catch(cause){if(current(s)){error.value=errorMessage(cause);unknown.value=accepted||!knownPreprocessRejection(cause);if(!unknown.value)settingsIntent.value=undefined;denied(cause)}}finally{if(current(s))busy.value=false}
}
function leaveRemovalUnconfirmed(){if(!busy.value&&unknown.value&&settingsIntent.value?.kind==='remove'){confirmedExit.value=true;void router.replace(destination())}}
async function verifySettings(){
 const intent=settingsIntent.value;if(!allowed.value||busy.value||!intent)return
 const s=capture();busy.value=true;error.value=''
 try{
  if(intent.kind==='remove'){await readMessageRuleDeletion(intent.deletion);if(!current(s))return;settingsIntent.value=undefined;unknown.value=false;removal.value=false;confirmedExit.value=true;await router.replace(destination());return}
  const after=await readTypePreprocessor(s,s.ruleId,()=>current(s));if(!current(s))return;confirmSettings(intent,after);data.value=after;settingsIntent.value=undefined;unknown.value=false;busy.value=false;closeSettings();notice.value='已读取并核对保存结果'
 }catch(cause){if(current(s)){
  if(intent.kind==='remove'&&cause instanceof ApiError&&cause.status===404){reset();settingsIntent.value=intent;unknown.value=true;removal.value=true;error.value='当前未查到原删除回执，结果仍未确认，请勿再次移除。'}
  else{unknown.value=true;error.value=errorMessage(cause);denied(cause)}
 }}finally{if(current(s))busy.value=false}
}
watch(()=>tab.value,value=>{if(value==='devices')devicesVisited.value=true;if(value==='logs')logsVisited.value=true},{immediate:true})
watch(()=>data.value,value=>{if(value)void readMetadata(capture(),value).catch(cause=>{if(data.value===value){error.value=errorMessage(cause);denied(cause)}})})
function beforeUnload(event:BeforeUnloadEvent){if(navigationBlocked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload)
watch([()=>props.typeId,dataSourceKey,ruleId,projectId,()=>session.user?.accountId,allowed],()=>{reset();if(allowed.value)void load()},{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;reset();dispose();window.removeEventListener('beforeunload',beforeUnload)})
</script>
<template><main class="tl-page type-rule-detail">
 <PageHeader title="规则详情" back :back-disabled="navigationBlocked" @back="back"/>
 <div v-if="data" class="reference-object-heading"><div class="rule-name"><h2>{{data.first.name}}</h2><el-button size="small" :disabled="!settingsReady" @click="openInformation">编辑</el-button><el-button size="small" :disabled="!settingsReady" @click="load">刷新</el-button></div><p>ID：{{ruleId}}</p></div>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="notice" :title="notice" type="success" :closable="false"/>
 <p v-if="unknown" role="status">操作结果未知，保留原请求和版本；仅通过读取核对，不自动重发。</p>
 <el-button v-if="pending&&unknown" :disabled="!allowed||busy" @click="verifyRevision">{{pending.activation?'读取保存生效结果':'读取原修订核对'}}</el-button>
 <el-button v-if="settingsIntent&&unknown&&!information&&!tagEditing" :disabled="!allowed||busy" @click="verifySettings">{{settingsIntent?.kind==='remove'?'读取原删除回执':'读取原操作核对'}}</el-button>
 <el-button v-if="unknown&&stateIntent" :disabled="!allowed||busy||loading" @click="verifyState">读取原状态核对</el-button>
 <el-button v-if="pending?.activation&&!pending.activationAttempted" type="primary" :disabled="!writable||busy" @click="activateSaved">继续完成生效</el-button>
 <AsyncState :forbidden="!allowed" :loading="loading"><template v-if="data">
  <el-tabs v-model="tab"><el-tab-pane label="规则" name="rule" :disabled="navigationBlocked"/><el-tab-pane label="设备" name="devices" :disabled="navigationBlocked||editing"/><el-tab-pane label="统计" name="statistics" :disabled="navigationBlocked||editing"/><el-tab-pane label="日志" name="logs" :disabled="navigationBlocked||editing"/><el-tab-pane label="设置" name="settings" :disabled="navigationBlocked||editing"/></el-tabs>
  <section v-if="tab==='rule'">
   <el-row class="rule-information-grid" :gutter="10"><el-col :xs="24" :sm="24" :md="16"><section class="rule-card basic-information"><h3>基本信息</h3><dl><div><dt>规则类型</dt><dd>{{ruleKindLabels[data.kind].label}}</dd></div><div><dt>设备来源类型</dt><dd>{{dataSource?'设备':'设备类型'}}</dd></div><div><dt>设备来源</dt><dd><RuleSourceInline :rule-id="ruleId" :definition-version="data.first.version" :inactive="editing||busy||unknown||loading||information||tagEditing||removal||devicesBusy||devicesLocked||logsBusy||logsLocked||logsConfirming" :refresh-context="sourceChanged" @busy="sourceBusy=$event" @locked="sourceLocked=$event" @denied="sourceDenied"/></dd></div><div v-if="data.kind==='DATA_RPT'"><dt>自定义数据流标识符</dt><dd>{{data.streamIdentifier}}<el-button class="input-stream-edit" aria-label="编辑自定义数据流" size="small" :disabled="!settingsReady" @click="openInputStream">编辑</el-button></dd></div><div v-if="data.kind==='ATTRS_RPT_PREPROC'&&propertyFilter" class="detail-filter-slot"><dt>规则条件</dt><dd><RulePreprocessConditions v-if="editing&&filterEditing&&draft" v-model="draft.filter" editing :disabled="sourceEditorDisabled" :error="error" :recovery-pending="unknown&&!!pending" :recovering="busy" @save="commitOperation" @cancel="cancelEdit" @recover="verifyRevision"/><RulePreprocessConditions v-else :model-value="propertyFilter" :disabled="!settingsReady" @edit="openFilter"/></dd></div><div><dt>创建时间</dt><dd>{{formatTime(metadata.createdAt)}}</dd></div><div><dt>修改时间</dt><dd>{{formatTime(metadata.updatedAt)}}</dd></div></dl></section></el-col><el-col :xs="24" :sm="24" :md="8">
   <section class="rule-card rule-status"><h3>规则状态</h3><div><span>启用规则</span><el-switch v-if="stateSupported" aria-label="启用规则" :model-value="data.first.status==='ACTIVE'" :disabled="!writable||navigationBlocked||editing||loading||data.first.status!=='ACTIVE'&&!dataReady" @change="change(Boolean($event))"/><span v-else>{{data.first.status==='ACTIVE'?'已启用':'未启用'}}</span><p v-if="data.kind==='DATA_RPT'&&!dataReady">{{dataError||'当前发布的数据流不符合规则配置，请核对DATA设置。'}}</p><el-button v-if="stateSupported&&newCandidate&&data.first.status==='ACTIVE'" size="small" :disabled="!writable||navigationBlocked||editing||!dataReady" @click="change(true)">应用已保存内容</el-button></div></section></el-col></el-row>
   <p v-if="newCandidate&&stateSupported" role="status">最新保存内容尚未生效。{{data.first.status==='ACTIVE'?'当前仍运行上次启用的内容。':''}}</p>
   <section class="rule-card operations-card"><template v-if="data.kind!=='DATA_RPT'">
    <RulePreprocessFunctionsEditor v-if="editing&&draft&&!filterEditing" detail :command="operationCommand" :request-error="error" :recovery-pending="unknown&&!!pending" :recovering="busy" @recover="verifyRevision" v-model="draft.functions" v-model:property-operations="draft.propertyOperations" :source="data.deviceSource" :scope-key="capture().scopeKey" :project-id="projectId" :kind="data.kind" :disabled="sourceEditorDisabled" @busy="sourceEditing=$event" @denied="panelDenied" @commit="commitOperation" @cancel-command="cancelEdit"/>
    <ModbusRtuParserSummary v-if="!editing&&dataNative" :value="dataNative"/><RulePreprocessOperationTable v-else detail :model-value="propertyRows" :disabled="!settingsReady" @edit="openCommand('EDIT',$event)" @add="openCommand('ADD')" @sort="openCommand('SORT')" @remove="openCommand('REMOVE',$event)"/>
   </template><template v-else><ModbusRtuParserSummary v-if="!editing&&dataNative" :value="dataNative"/><DataOperationsEditor v-if="dataOperationsView" :model-value="editing&&editableDataOperations?editableDataOperations:dataOperationsView" detail :command="dataCommand" :legacy="legacyDataMode" :request-error="error" :recovery-pending="unknown&&!!pending" :project-id="projectId" :type-id="typeId" :scope-key="capture().scopeKey" :stream="dataStream" :streams="streams" :device-kind="sourceKind" :payload-protocol="sourceProtocol" :source-contexts="dataContexts" :disabled="inputStreamEditing||(editing?sourceEditorDisabled:!settingsReady)" @update:model-value="stageDataOrder" @command="openDataCommand" @commit="commitDataOperation" @cancel-command="cancelEdit" @locked="sourceEditing=$event"/>
  </template>
   </section>
  </section>
  <UsageStatisticsPanel v-else-if="tab==='statistics'" kind="rule" :id="ruleId" @denied="panelDenied"/>
  <section v-else-if="tab==='settings'" class="rule-settings">
   <section><h3>规则描述</h3><p class="rule-settings-description">{{data.first.description||'—'}}</p><el-button size="small" :disabled="!settingsReady" @click="openInformation">编辑</el-button></section>
   <section><h3>标签</h3><el-table :data="Object.entries(data.tags).map(([name,value])=>({name,value}))" empty-text="无标签"><el-table-column prop="name" label="标签名称"/><el-table-column prop="value" label="值"/></el-table><el-button size="small" :disabled="!settingsReady" @click="openTags">编辑</el-button></section>
   <section><h3>移除规则</h3><p class="rule-settings-removal-tips">规则移除后将立即生效，应用该规则的设备将不会再触发该规则。</p><el-button size="small" type="danger" :disabled="!settingsReady" @click="removal=true">移除规则</el-button></section>
  </section>
 </template></AsyncState>
 <RuleDataInputStreamDialog v-if="inputStreamEditing&&data" :identifier="data.streamIdentifier!" :choices="streams" :disabled="busy||unknown||!writable" :validation-error="error" @save="saveInputStream" @cancel="cancelEdit"/>
 <RuleDeviceParticipationPanel v-if="allowed&&data&&devicesVisited" :scope="controlScope()" :definition-version="data.first.version" :inactive="tab!=='devices'||editing||busy||unknown||loading||!!information||tagEditing||removal" :refresh-context="refreshDeviceContext" @busy="devicesBusy=$event" @locked="devicesLocked=$event" @denied="panelDenied"/>
 <RuleDebugLogPanel v-if="allowed&&data&&logsVisited" :rule-id="ruleId" :transport="ruleDebugLogTransport" :inactive="tab!=='logs'||editing||busy||unknown||loading||information||tagEditing||removal" @busy="logsBusy=$event" @locked="logsLocked=$event" @confirming="logsConfirming=$event" @denied="panelDenied"/>
 <el-dialog :model-value="information" title="修改规则信息" width="500px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!busy&&!unknown" :show-close="!busy&&!unknown" @update:model-value="closeSettings"><el-form label-position="top" :disabled="busy||unknown"><el-form-item label="规则名称"><el-input v-model="informationName" aria-label="规则名称" maxlength="128"/></el-form-item><el-form-item label="规则描述"><el-input v-model="informationDescription" aria-label="规则描述" type="textarea" :rows="5" maxlength="512"/></el-form-item></el-form><template #footer><el-button v-if="unknown&&settingsIntent" :disabled="busy||!allowed" @click="verifySettings">{{settingsIntent?.kind==='remove'?'读取原删除回执':'读取原操作核对'}}</el-button><el-button :disabled="busy||unknown" @click="closeSettings">取消</el-button><el-button type="primary" :loading="busy" :disabled="!settingsReady" @click="saveSettings('information')">保存</el-button></template></el-dialog>
 <el-dialog :model-value="tagEditing" title="修改标签" width="600px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!busy&&!unknown" :show-close="!busy&&!unknown" @update:model-value="closeSettings"><RuleTagsEditor v-model="tagRows" :disabled="busy||unknown"/><template #footer><el-button v-if="unknown&&settingsIntent" :disabled="busy||!allowed" @click="verifySettings">{{settingsIntent?.kind==='remove'?'读取原删除回执':'读取原操作核对'}}</el-button><el-button :disabled="busy||unknown" @click="closeSettings">取消</el-button><el-button type="primary" :loading="busy" :disabled="!settingsReady" @click="saveSettings('tags')">提交</el-button></template></el-dialog>
 <el-dialog :model-value="removal" title="提示" width="420px" align-center :close-on-click-modal="!busy&&!unknown" :close-on-press-escape="!busy&&!unknown" :show-close="!busy&&!unknown" @update:model-value="closeSettings"><div class="removal-prompt"><el-icon><WarningFilled/></el-icon><span>确认移除规则吗？</span></div><template #footer><el-button v-if="unknown&&settingsIntent" :disabled="busy||!allowed" @click="verifySettings">{{settingsIntent?.kind==='remove'?'读取原删除回执':'读取原操作核对'}}</el-button><el-button v-if="unknown&&settingsIntent?.kind==='remove'" :disabled="busy" @click="leaveRemovalUnconfirmed">保留未确认结果并返回</el-button><el-button :disabled="busy||unknown" @click="closeSettings">取消</el-button><el-button type="primary" :loading="busy" :disabled="!settingsReady" @click="saveSettings('remove')">确定</el-button></template></el-dialog>
</main></template>
<style scoped>
.input-stream-edit{display:block;margin-top:10px}.type-rule-detail{padding:20px 30px 50px;min-width:0}.reference-object-heading{padding:10px 0 0;margin:0}.rule-name{display:flex;align-items:center;gap:20px}.rule-name>.el-button{height:28px;padding:7px 15px;font-size:12px;line-height:1}.reference-object-heading h2{margin:0;font-size:26px;font-weight:500;line-height:34px;color:#002822;overflow-wrap:anywhere}.reference-object-heading p{margin:0;padding:10px 0 0;font-size:14px;line-height:20px;color:#999;overflow-wrap:anywhere}.type-rule-detail :deep(.el-tabs__nav-wrap::after){height:1px}.type-rule-detail :deep(.el-tabs){margin-top:20px}.type-rule-detail :deep(.el-tabs__header){margin-bottom:15px}.rule-information-grid{align-items:flex-start}.rule-card{border:1px solid #ebeef5;border-radius:4px;margin-top:10px;background:#fff;transition:box-shadow .3s}.rule-card:hover,.rule-card:focus{box-shadow:0 2px 12px 0 rgba(0,0,0,.1)}.rule-card h3{font-size:15px;line-height:28px;font-weight:600;color:#2f354d;margin:0;padding:12px 20px;border-bottom:1px solid #ebeef5}.basic-information dl{display:grid;grid-template-columns:1fr;column-gap:10px;margin:0;padding:20px}.basic-information dl>div{min-width:0;padding-bottom:20px}.basic-information dt{font-size:14px;line-height:18px;font-weight:600;color:#606266}.detail-filter-slot{grid-column:1 / -1}.basic-information dd{margin:3px 0 0;font-size:15px;line-height:20px;color:#002822;overflow-wrap:anywhere}.basic-information a{color:var(--el-color-primary);font-size:12px;background:#f5f7fa;padding:3px 8px;border-radius:3px}.rule-status>div{padding:20px 20px 40px}.rule-status span{display:block;font-size:14px;line-height:18px;font-weight:600;color:#606266}.rule-status .el-switch{display:flex;margin-top:7px}.rule-status p,.type-rule-detail>p{font-size:13px;line-height:1.7;color:var(--tl-muted)}.operations-card>header{display:flex;align-items:center;justify-content:space-between;padding-right:20px;border-bottom:1px solid #ebeef5}.operations-card>header h3{border:0}.operations-card>header>div{display:flex;gap:14px}.operation-summary{display:flex;align-items:center;gap:20px;min-height:86px;padding:20px 28px;border-bottom:1px solid #ebeef5;font-size:14px;color:#606266}.operation-summary:last-child{border-bottom:0}.operation-icon{display:inline-flex;justify-content:center;align-items:center;background:#16834d;color:white;width:30px;height:30px;border-radius:3px;font-size:17px}.operation-summary small{display:block;margin-top:5px;font-size:12px;color:#909399}.operation-summary>.el-button{margin-left:auto}.operations-card>.el-form,.operations-card>p,.operations-card>.el-button{margin:20px}.type-rule-detail .el-form>.el-form-item{max-width:460px}.rule-settings>section{margin-bottom:32px}.rule-settings>section>h3{margin:10px 0 0;font-size:16px;font-weight:700;line-height:22px;color:#002822}.rule-settings-description{margin:10px 0 10px;font-size:14px;line-height:20px;color:#606266}.rule-settings-removal-tips{margin:5px 0 10px;font-size:14px;line-height:20px;color:#909399}.rule-settings .el-table{margin-bottom:14px}.removal-prompt{display:flex;align-items:center;gap:12px;min-height:36px}.removal-prompt .el-icon{font-size:20px;color:var(--el-color-warning)}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:480px;overflow:auto;background:var(--tl-bg,#f7f8fa);padding:16px}.operation-list>.modbus-summary{margin:20px}@media(min-width:992px){.basic-information dl{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.type-rule-detail{padding:20px 15px}.operation-summary{gap:10px;padding:16px}}
</style>
