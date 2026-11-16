<script setup lang="ts">
import {computed,inject,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute,useRouter} from 'vue-router'
import {can,projectId,currentProject,session} from '@/core/session'
import {api,identityEpoch,onIdentityChange,errorMessage,ApiError,IdentityChanged} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {formatTime} from '@/core/time'
import {WarningFilled} from '@element-plus/icons-vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {useResource} from '@/core/use-resource'
import {devicesApi} from '@/features/devices/api'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import RuleSourceInline from './RuleSourceInline.vue'
import {refreshRuleSourceEntry} from './rule-detail-source-refresh'
import {readRuleSourceNames,type RuleDeviceSourceContract} from './rule-source-api'
import RulePreprocessVersionEditor from './RulePreprocessVersionEditor.vue'
import RulePreprocessOperationTable from './RulePreprocessOperationTable.vue'
import RulePreprocessConditions from './RulePreprocessConditions.vue'
import type {PropertyOperationCommand} from './property-operations-draft'
import {propertyOperationLabel} from './property-operations-draft'
import RuleTagsEditor from './RuleTagsEditor.vue'
import RuleDeviceParticipationPanel from './RuleDeviceParticipationPanel.vue'
import {newRuleTag,ruleTagsValue,type RuleTagDraft} from './rule-tag-draft'
import {definitionUuid} from './device-task-definition-port'
import {propertyPreprocessHasStateControl,readPreprocessSnapshot,makeDevicePreprocessStateIntent,applyDevicePreprocessStateIntent,confirmDevicePreprocessState,type DevicePreprocessStateIntent,preprocessSeedSource,revisePreprocessor,replacePreprocessorTags,previewPreprocessor,knownPreprocessRejection,PreprocessOutcomeUnknown,LegacyRuleVersion,type PreprocessSnapshot,type PreprocessPreview} from './preprocess-control-api'
import {confirmRevision,preprocessSeedDeviceIds,loadPreprocessVersion,exactRevisionCounter,type PreprocessRevisionIntent,type PreprocessVersionSeed} from './preprocess-version-editor'
import {readRawRuleJson} from './raw-rule-json'
import {ruleKindLabels,conditionLabels,type ConditionGroupDraft} from './rule-builder-draft'
import UsageStatisticsPanel from './UsageStatisticsPanel.vue'
import RuleDebugLogPanel from './RuleDebugLogPanel.vue'
import {ruleDebugLogTransport} from './rule-debug-transport'
import {useDetailTab} from './detail-tab'
import {ruleDeletionIntent,removeMessageRule,readMessageRuleDeletion,type RuleDeletionIntent} from './message-rule-deletion'
const emit=defineEmits<{legacy:[]}>()
const route=useRoute(),router=useRouter(),tab=useDetailTab(['rule','devices','statistics','logs','settings'],'rule')
const sourceBusy=ref(false),sourceLocked=ref(false),sourceNavigation=ref(false),refreshSourceEntry=inject(refreshRuleSourceEntry)
const allowed=computed(()=>!!projectId.value&&can('rule:manage')),ruleId=computed(()=>typeof route.params.id==='string'?route.params.id:'')
const writable=computed(()=>allowed.value&&currentProject.value?.status==='ACTIVE')
const information=ref(false),informationName=ref(''),informationDescription=ref(''),tagsEditing=ref(false),previewShown=ref(false)
const metadata=ref<{createdAt?:string;updatedAt?:string}>({})
type SettingsIntent={attemptId:string;before:PreprocessSnapshot;kind:'information';name:string;description:string|null}|{attemptId:string;before:PreprocessSnapshot;kind:'tags';tags:Record<string,string>}
const settingsIntent=shallowRef<SettingsIntent>(),stateIntent=shallowRef<{intent:DevicePreprocessStateIntent;attempted:boolean}>()
const removal=shallowRef<PreprocessSnapshot>(),confirmedExit=ref(false),deletion=shallowRef<RuleDeletionIntent>(),deletionSealed=ref(false)
const stateSupported=computed(()=>propertyPreprocessHasStateControl(content.value?.draft.kind??''))
const operationCommand=shallowRef<PropertyOperationCommand>(),filterEditing=ref(false)
const turn=ref(0),editing=ref(false),fullEdit=ref(false),dirty=ref(false),tagDirty=ref(false),busy=ref(false),editorLocked=ref(false),unknown=ref(false),error=ref(''),notice=ref('')
const devicesVisited=ref(false),devicesBusy=ref(false),devicesLocked=ref(false)
const logsBusy=ref(false),logsLocked=ref(false),logsConfirming=ref(false),logsVisited=ref(false)
const blocked=computed(()=>!!stateIntent.value||busy.value||editorLocked.value||unknown.value||logsBusy.value||logsLocked.value||logsConfirming.value||devicesBusy.value||devicesLocked.value||sourceBusy.value||sourceLocked.value)
const navigationBlocked=computed(()=>deletionSealed.value||deletion.value&&unknown.value?busy.value:blocked.value||dirty.value||tagDirty.value||!!removal.value||information.value||tagsEditing.value||previewShown.value)
const tagRows=ref<RuleTagDraft[]>([]),sample=ref('{}'),preview=ref<PreprocessPreview>(),pending=ref<{before:PreprocessSnapshot;intent:PreprocessRevisionIntent}>()
const resolution=ref<{type:'known-rejected';attemptId:string}|{type:'confirmed';attemptId:string;seed:PreprocessVersionSeed}>()
let active=true,controller:AbortController|undefined
const props=defineProps<{deviceId?:string}>()
const expectedDevice=computed(()=>route.query.source==='device'&&typeof route.query.deviceId==='string'&&definitionUuid(route.query.deviceId)?route.query.deviceId:(definitionUuid(props.deviceId)?props.deviceId!:''))
const scopeKey=computed(()=>`${identityEpoch()}:${turn.value}:${projectId.value}:${ruleId.value}:${expectedDevice.value}`)
function scope(device=expectedDevice.value){return {projectId:projectId.value,deviceId:device,scopeKey:scopeKey.value}}
function checker(){const generation=turn.value,epoch=identityEpoch(),project=projectId.value,rule=ruleId.value,actor=session.user?.accountId;return ()=>actor===session.user?.accountId&&active&&generation===turn.value&&epoch===identityEpoch()&&project===projectId.value&&rule===ruleId.value&&allowed.value}
const resource=useResource(async signal=>{
 const current=checker(),input=scope(),id=ruleId.value
 try{
  const snapshot=await readPreprocessSnapshot(input,id,current,signal),names=await readRuleSourceNames(input.projectId,preprocessSeedSource(snapshot.seed),signal)
  if(!current())throw new IdentityChanged()
  return {snapshot,deviceName:preprocessSeedDeviceIds(snapshot.seed).map(id=>names.get(id)!).join('、')}
 }catch(cause){if(cause instanceof LegacyRuleVersion&&current())emit('legacy');throw cause}
})
function installTags(snapshot:PreprocessSnapshot){tagRows.value=Object.entries(snapshot.tags).map(([key,value])=>({...newRuleTag(),key,value}))}
function clear(){filterEditing.value=false;operationCommand.value=undefined;stateIntent.value=undefined;deletion.value=undefined;deletionSealed.value=false;removal.value=undefined;confirmedExit.value=false;turn.value++;controller?.abort();resource.clear();sourceBusy.value=false;sourceLocked.value=false;editing.value=false;fullEdit.value=false;dirty.value=false;tagDirty.value=false;busy.value=false;editorLocked.value=false;unknown.value=false;error.value='';notice.value='';sample.value='{}';preview.value=undefined;resolution.value=undefined;pending.value=undefined;settingsIntent.value=undefined;information.value=false;informationName.value='';informationDescription.value='';tagsEditing.value=false;previewShown.value=false;metadata.value={};tagRows.value=[];logsBusy.value=false;logsLocked.value=false;logsConfirming.value=false;logsVisited.value=false;devicesVisited.value=tab.value==='devices';devicesBusy.value=false;devicesLocked.value=false}
function identityCleared(){const seal=!!deletion.value||deletionSealed.value;clear();if(seal){deletionSealed.value=true;unknown.value=true;error.value='身份已变化，原删除结果尚未确认，请安全离开。'}}
const dispose=onIdentityChange(identityCleared)
onScopeDispose(()=>{active=false;controller?.abort();dispose()})
watch([projectId,ruleId,expectedDevice,allowed,()=>session.user?.accountId],(current,previous)=>{const seal=!!previous&&current[0]===previous[0]&&current[1]===previous[1]&&(!!deletion.value||deletionSealed.value);clear();if(seal){deletionSealed.value=true;unknown.value=true;error.value='当前身份或权限已变化，原删除结果尚未确认，请安全离开。'}else if(allowed.value&&definitionUuid(ruleId.value))void resource.reload()},{immediate:true})
watch(()=>resource.data.value?.snapshot,value=>{if(value)installTags(value)})
watch([tagRows,()=>resource.data.value?.snapshot.tags],()=>{const saved=resource.data.value?.snapshot.tags;if(!saved){tagDirty.value=false;return}try{const value=ruleTagsValue(tagRows.value);tagDirty.value=Object.keys(value).length!==Object.keys(saved).length||Object.keys(value).some(key=>!Object.hasOwn(saved,key)||value[key]!==saved[key])}catch{tagDirty.value=true}},{deep:true})
watch(()=>tab.value,value=>{if(value==='logs')logsVisited.value=true;if(value==='devices')devicesVisited.value=true},{immediate:true})
onBeforeRouteLeave(()=>!navigationBlocked.value||confirmedExit.value)
onBeforeRouteUpdate(to=>sourceNavigation.value||!navigationBlocked.value||to.fullPath===route.fullPath)
function beforeUnload(event:BeforeUnloadEvent){if(navigationBlocked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload);onScopeDispose(()=>window.removeEventListener('beforeunload',beforeUnload))
function destination(device=resource.data.value?.snapshot.seed.deviceId||expectedDevice.value){return route.query.origin==='directory'||!device?{path:'/rules/messages'}:{path:'/devices/'+device,query:{tab:'rules'}}}
function back(){if(!navigationBlocked.value)void router.push(destination())}
async function edit(){
 const data=resource.data.value;if(!writable.value||navigationBlocked.value||editing.value||!data)return
 const current=checker()
 if(tab.value!=='rule'){
  const query={...route.query};delete query.tab
  const result=await router.replace({query});if(result||!current()||navigationBlocked.value||resource.data.value!==data)return
 }
 if(current()){fullEdit.value=!operationCommand.value&&!filterEditing.value;editing.value=true}
}
const propertyRows=computed(()=>content.value?.draft.propertyOperations?.operations??content.value?.draft.functions??[])
async function openCommand(kind:PropertyOperationCommand['kind'],id?:string){if(!settingsReady.value)return;filterEditing.value=false;const index=id===undefined?-1:propertyRows.value.findIndex(row=>row.id===id);if((kind==='EDIT'||kind==='REMOVE')&&index<0)return;operationCommand.value=kind==='EDIT'||kind==='REMOVE'?{token:crypto.randomUUID(),kind,index}:{token:crypto.randomUUID(),kind};await edit();if(!editing.value)operationCommand.value=undefined}
async function openFilter(){if(!settingsReady.value||content.value?.draft.kind!=='ATTRS_RPT_PREPROC')return;filterEditing.value=true;operationCommand.value=undefined;await edit();if(!editing.value)filterEditing.value=false}
function denied(){clear()}
function start(){controller?.abort();controller=new AbortController();busy.value=true;error.value='';notice.value='';preview.value=undefined;return {current:checker(),signal:controller.signal}}
function failed(cause:unknown){
 error.value=errorMessage(cause);if(!knownPreprocessRejection(cause))unknown.value=true
 const authority=cause instanceof PreprocessOutcomeUnknown?cause.cause:cause
 if(authority instanceof ApiError&&[401,403,404].includes(authority.status)){if(unknown.value)error.value='原操作结果尚未确认。'+error.value;unknown.value=false;resource.clear();resource.error.value=authority;stateIntent.value=undefined;editing.value=false;editorLocked.value=false;dirty.value=false;tagDirty.value=false;tagRows.value=[];sample.value='{}';preview.value=undefined;pending.value=undefined;resolution.value=undefined;removal.value=undefined;settingsIntent.value=undefined;information.value=false;tagsEditing.value=false;previewShown.value=false;metadata.value={};devicesBusy.value=false;devicesLocked.value=false}
}
async function stateFailed(cause:unknown){
 const authority=cause instanceof PreprocessOutcomeUnknown?cause.cause:cause
 error.value=errorMessage(cause)
 if(authority instanceof ApiError&&[401,403].includes(authority.status)){stateIntent.value=undefined;failed(cause);return}
 if(knownPreprocessRejection(cause)){stateIntent.value=undefined;failed(cause)}else unknown.value=true
}
async function applyState(){
 const pending=stateIntent.value;if(!pending||pending.attempted||!writable.value||busy.value||unknown.value)return
 stateIntent.value={...pending,attempted:true};const {current,signal}=start()
 try{const snapshot=await applyDevicePreprocessStateIntent(scope(pending.intent.before.seed.deviceId),pending.intent,current,signal);if(current()){const data=resource.data.value;if(data)resource.data.value={...data,snapshot};stateIntent.value=undefined;unknown.value=false;notice.value='已核对当前启用状态。'}}catch(cause){if(current())await stateFailed(cause)}finally{if(current())busy.value=false}
}
async function changeState(enabled:boolean){
 const data=resource.data.value;if(!data||!writable.value||navigationBlocked.value||editing.value)return
 try{stateIntent.value={intent:makeDevicePreprocessStateIntent(scope(data.snapshot.seed.deviceId),data.snapshot,enabled,crypto.randomUUID()),attempted:false};await applyState()}catch(cause){error.value=errorMessage(cause);stateIntent.value=undefined}
}
async function verifyState(){
 const pending=stateIntent.value;if(!pending||!allowed.value||busy.value)return
 const {current,signal}=start();try{const snapshot=await readPreprocessSnapshot(scope(pending.intent.before.seed.deviceId),pending.intent.ruleId,current,signal);confirmDevicePreprocessState(pending.intent,snapshot);if(current()){const data=resource.data.value;if(data)resource.data.value={...data,snapshot};stateIntent.value=undefined;unknown.value=false;notice.value='已读取并核对当前启用状态，未重发请求。'}}catch(cause){if(current()){unknown.value=true;const authority=cause instanceof PreprocessOutcomeUnknown?cause.cause:cause;if(authority instanceof ApiError&&[401,403].includes(authority.status)){stateIntent.value=undefined;failed(cause)}else error.value=errorMessage(cause)}}finally{if(current())busy.value=false}
}
async function revisionSaved(before:PreprocessSnapshot,intent:PreprocessRevisionIntent,snapshot:PreprocessSnapshot,readOnly=false){
 const data=resource.data.value;if(!data)return
 resource.data.value={...data,snapshot};resolution.value={type:'confirmed',attemptId:intent.attemptId,seed:snapshot.seed};pending.value=undefined;notice.value='已保存完整新版本，启用状态保持不变。'
 if(propertyPreprocessHasStateControl(loadPreprocessVersion(before.seed,before.seed).draft.kind)&&before.seed.status==='ACTIVE'){
  editing.value=false;dirty.value=false;editorLocked.value=false;stateIntent.value={intent:makeDevicePreprocessStateIntent(scope(snapshot.seed.deviceId),snapshot,true,crypto.randomUUID()),attempted:false};unknown.value=false;notice.value='内容已保存，尚未完成生效。';if(!readOnly){busy.value=false;await applyState()}
 }
}
async function revise(intent:PreprocessRevisionIntent){
 const data=resource.data.value;if(!data||!allowed.value||busy.value||unknown.value||stateIntent.value)return
 const before=data.snapshot
 if(propertyPreprocessHasStateControl(loadPreprocessVersion(before.seed,before.seed).draft.kind)&&before.seed.status==='ACTIVE'&&BigInt(before.seed.definitionVersion)>9223372036854775805n){error.value='规则修订已达上限，无法完成保存并生效';return}
 const {current,signal}=start(),input=scope(before.seed.deviceId);pending.value={before,intent}
 try{const snapshot=await revisePreprocessor(input,before,intent,current,signal);if(current())await revisionSaved(before,intent,snapshot)}
 catch(cause){if(current()){failed(cause);if(knownPreprocessRejection(cause)){resolution.value={type:'known-rejected',attemptId:intent.attemptId};pending.value=undefined}}}
 finally{if(current())busy.value=false}
}
async function verify(){
 const data=resource.data.value,attempt=pending.value;if(!allowed.value||busy.value||!data||!attempt)return
 const {current,signal}=start()
 try{const snapshot=await readPreprocessSnapshot(scope(data.snapshot.seed.deviceId),ruleId.value,current,signal);confirmRevision(loadPreprocessVersion(attempt.before.seed,attempt.before.seed),attempt.intent,snapshot.seed);if(current()){unknown.value=false;await revisionSaved(attempt.before,attempt.intent,snapshot,true)}}catch(cause){if(current()){unknown.value=true;error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403].includes(cause.status))failed(cause)}}finally{if(current())busy.value=false}
}

async function saveTags(){
 const data=resource.data.value;if(!data||!writable.value||blocked.value||editing.value||removal.value||!tagsEditing.value||settingsIntent.value)return
 let wanted:Record<string,string>;try{wanted=ruleTagsValue(tagRows.value)}catch(cause){error.value=errorMessage(cause);return}
 const attemptId=crypto.randomUUID();settingsIntent.value={attemptId,before:data.snapshot,kind:'tags',tags:wanted};const {current,signal}=start()
 try{const snapshot=await replacePreprocessorTags(scope(data.snapshot.seed.deviceId),data.snapshot,wanted,attemptId,current,signal);if(current()){resource.data.value={...data,snapshot};settingsIntent.value=undefined;tagsEditing.value=false;notice.value='规则标签已完整核对。'}}catch(cause){if(current()){failed(cause);if(knownPreprocessRejection(cause))settingsIntent.value=undefined}}finally{if(current())busy.value=false}
}
async function runPreview(){
 const data=resource.data.value;if(!data||!allowed.value||blocked.value||removal.value)return
 // 本地样例错误不进入写入未知态，服务端执行只对明确已保存版本发一次请求。
 try{const bytes=new TextEncoder().encode(sample.value);if(bytes.length>65536)throw new Error('样例超过65536个UTF8字节');const {readRawRuleJson}=await import('./raw-rule-json');if(readRawRuleJson(bytes).kind!=='object')throw new Error('样例须为完整JSON对象')}catch(cause){error.value=errorMessage(cause);return}
 if(!allowed.value||blocked.value||resource.data.value!==data)return
 const {current}=start()
 try{const result=await previewPreprocessor(scope(data.snapshot.seed.deviceId),data.snapshot,sample.value,crypto.randomUUID(),current);if(current())preview.value=result}catch(cause){if(current())failed(cause)}finally{if(current())busy.value=false}
}
function deletionFailed(cause:unknown,intent:RuleDeletionIntent){
 const denied=cause instanceof ApiError&&[401,403].includes(cause.status)
 // 未见回执也清除源码和私有草稿，只留下原键最小意图；404仍不能证明迟到请求不会提交。
 clear();unknown.value=true;error.value='原删除结果尚未确认，请勿重复移除。'+errorMessage(cause)
 if(denied||session.user?.accountId!==intent.actor){deletionSealed.value=true;if(cause instanceof ApiError)resource.error.value=cause}else deletion.value=intent
}
async function deleted(){unknown.value=false;deletion.value=undefined;removal.value=undefined;confirmedExit.value=true;await router.replace(destination())}
async function remove(){
 const data=resource.data.value,before=removal.value
 if(!data||!before||!writable.value||busy.value||unknown.value||deletion.value||deletionSealed.value||data.snapshot!==before)return
 let intent:RuleDeletionIntent
 try{intent=ruleDeletionIntent(projectId.value,ruleId.value,session.user?.accountId??'',before.seed.definitionVersion)}catch(cause){error.value=errorMessage(cause);return}
 deletion.value=intent;const {current}=start()
 try{await removeMessageRule(intent);if(current())await deleted()}catch(cause){if(current()){
  if(knownPreprocessRejection(cause)&&cause instanceof ApiError&&[400,409].includes(cause.status)){deletion.value=undefined;removal.value=undefined;failed(cause)}else deletionFailed(cause,intent)
 }}finally{if(current())busy.value=false}
}
async function verifyDeletion(){
 const intent=deletion.value;if(!intent||!allowed.value||busy.value||deletionSealed.value)return
 if(intent.actor!==session.user?.accountId||intent.project!==projectId.value||intent.rule!==ruleId.value){deletionFailed(new IdentityChanged(),intent);return}
 const {current}=start();try{await readMessageRuleDeletion(intent);if(current())await deleted()}catch(cause){if(current())deletionFailed(cause,intent)}finally{if(current())busy.value=false}
}
function leaveDeletion(){if(busy.value)return;confirmedExit.value=true;void router.replace(destination())}
async function refreshDeviceContext():Promise<string>{
 const data=resource.data.value;if(!data||!allowed.value)throw new IdentityChanged()
 const current=checker();controller?.abort();controller=new AbortController()
 const snapshot=await readPreprocessSnapshot(scope(data.snapshot.seed.deviceId),ruleId.value,current,controller.signal)
 if(!current())throw new IdentityChanged()
 resource.data.value={...data,snapshot}
 return snapshot.seed.definitionVersion
}
async function sourceChanged(source:RuleDeviceSourceContract){sourceNavigation.value=true;try{if(refreshSourceEntry)await refreshSourceEntry(source);else await resource.reload()}finally{sourceNavigation.value=false}}
function sourceDenied(cause:ApiError,uncertain:boolean){const message=(uncertain?'原来源保存结果未确认。':'')+errorMessage(cause);clear();error.value=message;resource.error.value=cause}
function deviceDenied(cause:ApiError,uncertain:boolean){
 // 已失去核对权限时清除私有数据并允许退出，原写结果仍未确认，不保留已卸载面板的恢复锁。
 failed(cause)
 if(uncertain)error.value='设备许可结果尚未确认。'+error.value
}
function closeRemoval(value:boolean){if(!value&&!busy.value&&!unknown.value)removal.value=undefined}
function refresh(){if(stateIntent.value){if(unknown.value)void verifyState();return}if(deletion.value){void verifyDeletion();return}if(deletionSealed.value)return;if(navigationBlocked.value||editing.value)return;resource.clear();void resource.reload()}
const content=computed(()=>{const value=resource.data.value?.snapshot;if(!value)return;return loadPreprocessVersion(value.seed,value.seed)})
function conditionSummary(group:ConditionGroupDraft):string{
 const values=group.conditions.map(row=>{
  const value=row.operator==='EXISTS'?'':row.operator==='IN_RANGE'||row.operator==='OUT_RANGE'?'['+row.lower+', '+row.upper+']':row.valueType==='null'?'null':row.valueType==='boolean'?String(row.booleanValue):row.valueType==='string'?JSON.stringify(row.text):row.text
  return row.path+' '+conditionLabels[row.operator]+(value?' '+value:'')
 });values.push(...group.groups.map(child=>'（'+conditionSummary(child)+'）'));return values.join(group.operator==='ALL'?'，并且 ':'，或者 ')
}
const settingsReady=computed(()=>writable.value&&!!resource.data.value&&!resource.error.value&&!resource.loading.value&&!blocked.value&&!editing.value&&!pending.value&&!settingsIntent.value)
function cancelEdit(){if(blocked.value)return;filterEditing.value=false;operationCommand.value=undefined;editing.value=false;fullEdit.value=false;dirty.value=false;editorLocked.value=false}
function openInformation(){const data=resource.data.value;if(!data||!settingsReady.value||information.value||tagsEditing.value||removal.value)return;informationName.value=data.snapshot.seed.name;informationDescription.value=data.snapshot.seed.description??'';information.value=true;error.value=''}
function openTags(){const data=resource.data.value;if(!data||!settingsReady.value||information.value||tagsEditing.value||removal.value)return;installTags(data.snapshot);tagsEditing.value=true;error.value=''}
function closeSettings(){if(busy.value||unknown.value)return;information.value=false;tagsEditing.value=false;informationName.value='';informationDescription.value='';const data=resource.data.value;if(data)installTags(data.snapshot)}
function openPreview(){if(!editing.value||blocked.value||!resource.data.value)return;preview.value=undefined;sample.value='{}';previewShown.value=true}
function closePreview(){if(!busy.value&&!unknown.value){previewShown.value=false;preview.value=undefined;sample.value='{}'}}
function sameTags(a:Readonly<Record<string,string>>,b:Readonly<Record<string,string>>){return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>Object.hasOwn(b,key)&&a[key]===b[key])}
function confirmSettings(intent:SettingsIntent,after:PreprocessSnapshot){
 const before=intent.before,a=before.seed,b=after.seed,expected=BigInt(a.definitionVersion)+(intent.kind==='tags'&&sameTags(before.tags,intent.tags)?0n:1n)
 if(BigInt(b.definitionVersion)!==expected||b.ruleId!==a.ruleId||b.deviceSourceKind!==a.deviceSourceKind||b.deviceSourceId!==a.deviceSourceId||JSON.stringify(preprocessSeedDeviceIds(b))!==JSON.stringify(preprocessSeedDeviceIds(a))||b.deviceId!==a.deviceId||b.versionId!==a.versionId||b.versionNumber!==a.versionNumber||b.status!==a.status||b.activeVersionId!==a.activeVersionId||b.preprocessingJson!==a.preprocessingJson||b.source!==a.source||b.actionsJson!==a.actionsJson||b.name!==(intent.kind==='information'?intent.name:a.name)||b.description!==(intent.kind==='information'?intent.description:a.description)||!sameTags(after.tags,intent.kind==='tags'?intent.tags:before.tags))throw new Error('规则修改结果尚未完整核对，请勿重复保存')
}
async function saveInformation(){
 const data=resource.data.value;if(!data||!settingsReady.value||!information.value)return
 let intent:SettingsIntent
 try{const name=informationName.value.trim(),description=informationDescription.value.trim()||null;if(!name||name.length>128||(description?.length??0)>512)throw new Error('请核对规则名称和描述');exactRevisionCounter(data.snapshot.seed.definitionVersion);intent={kind:'information',attemptId:crypto.randomUUID(),before:data.snapshot,name,description}}catch(cause){error.value=errorMessage(cause);return}
 settingsIntent.value=intent;const {current,signal}=start();let accepted=false
 try{
  const fields:Record<keyof Pick<Schema<'MessageRuleWriteRequest'>,'name'|'description'|'expectedVersion'>,string>={name:JSON.stringify(intent.name),description:JSON.stringify(intent.description),expectedVersion:intent.before.seed.definitionVersion}
  await api(`/api/v1/projects/${projectId.value}/message-rules/${ruleId.value}`,{method:'put',query:{informationOnly:true},rawBody:'{'+Object.entries(fields).map(([key,value])=>JSON.stringify(key)+':'+value).join(',')+'}',headers:{'Content-Type':'application/json','Idempotency-Key':intent.attemptId}});accepted=true
  if(!current())return
  const snapshot=await readPreprocessSnapshot(scope(data.snapshot.seed.deviceId),ruleId.value,current,signal);if(!current())return;confirmSettings(intent,snapshot);resource.data.value={...data,snapshot};settingsIntent.value=undefined;information.value=false;notice.value='规则信息已保存。'
 }catch(cause){if(current()){if(accepted||!knownPreprocessRejection(cause))unknown.value=true;else settingsIntent.value=undefined;failed(cause)}}finally{if(current())busy.value=false}
}
async function verifySettings(){
 const data=resource.data.value,intent=settingsIntent.value;if(!data||!intent||!allowed.value||busy.value)return
 const {current,signal}=start()
 try{const snapshot=await readPreprocessSnapshot(scope(intent.before.seed.deviceId),ruleId.value,current,signal);if(!current())return;confirmSettings(intent,snapshot);resource.data.value={...data,snapshot};settingsIntent.value=undefined;information.value=false;tagsEditing.value=false;unknown.value=false;notice.value='已读取并核对保存结果。'}catch(cause){if(current()){unknown.value=true;error.value=errorMessage(cause)}}finally{if(current())busy.value=false}
}
async function readCurrent(){
 const data=resource.data.value;if(!data||!allowed.value||busy.value||pending.value||settingsIntent.value||!previewShown.value)return
 const {current,signal}=start()
 try{const snapshot=await readPreprocessSnapshot(scope(data.snapshot.seed.deviceId),ruleId.value,current,signal);if(current()){resource.data.value={...data,snapshot};unknown.value=false;notice.value='已读取当前规则，上次操作结果仍未确认。'}}catch(cause){if(current())failed(cause)}finally{if(current())busy.value=false}
}
async function readMetadata(snapshot:PreprocessSnapshot){
 const current=checker(),project=projectId.value,id=ruleId.value
 const bytes=await api<Uint8Array>(`/api/v1/projects/${project}/message-rules/${id}`,{responseType:'bytes'})
 if(!current()||resource.data.value?.snapshot!==snapshot)return
 const value=readRawRuleJson(bytes);if(value.at(['id']).string()!==id||value.at(['version']).integerText()!==snapshot.seed.definitionVersion)throw new Error('规则信息已变化，请刷新后再操作')
 metadata.value={createdAt:value.optional(['createdAt'])?.string(),updatedAt:value.optional(['updatedAt'])?.string()}
}
watch([()=>resource.data.value?.snapshot,()=>tab.value],([value,activeTab])=>{if(value&&activeTab==='rule')void readMetadata(value).catch(cause=>{if(resource.data.value?.snapshot===value){error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status))failed(cause)}})})
</script>
<template><main class="tl-page device-preprocess-detail-page">
 <PageHeader title="规则详情" back :back-disabled="navigationBlocked" @back="back"/>
 <el-alert v-if="error" :title="unknown?'结果尚未完整核对，请勿重复提交。'+error:error" type="error" :closable="false"/>
 <el-button v-if="unknown&&deletion" :disabled="busy||!allowed" @click="verifyDeletion">读取原删除回执</el-button>
 <el-button v-if="unknown&&(deletion||deletionSealed)" :disabled="busy" @click="leaveDeletion">安全离开</el-button>
 <el-button v-if="unknown&&stateIntent" :disabled="busy||!allowed" @click="verifyState">读取原状态核对</el-button>
 <el-button v-if="stateIntent&&!stateIntent.attempted" :disabled="busy||!writable" @click="applyState">继续完成生效</el-button>
 <el-button v-if="unknown&&pending" :disabled="busy||!allowed" @click="verify">重新读取核对</el-button>
 <el-button v-if="unknown&&settingsIntent&&!information&&!tagsEditing" :disabled="busy||!allowed" @click="verifySettings">读取原操作核对</el-button>
 <el-button v-if="unknown&&!pending&&!settingsIntent&&previewShown&&resource.data.value" :disabled="busy||!allowed" @click="readCurrent">读取当前规则核对</el-button>
 <el-alert v-if="notice" :title="notice" type="success" :closable="false"/>
 <AsyncState :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" @retry="refresh">
  <template v-if="allowed&&resource.data.value&&!resource.error.value">
   <header class="rule-heading" :class="{'related-device-heading':tab==='devices'}"><div class="rule-name"><h2>{{resource.data.value.snapshot.seed.name}}</h2><el-button size="small" aria-label="编辑完整规则" :disabled="!settingsReady||information||tagsEditing||!!removal" @click="edit">{{tab==='devices'?'编辑':'编辑完整规则'}}</el-button><el-button size="small" :disabled="!settingsReady||information||tagsEditing||!!removal" @click="openInformation">编辑</el-button></div><p>ID：{{ruleId}}</p></header>
   <el-tabs v-model="tab"><el-tab-pane label="规则" name="rule" :disabled="navigationBlocked"/><el-tab-pane label="设备" name="devices" :disabled="navigationBlocked||editing"/><el-tab-pane label="统计" name="statistics" :disabled="navigationBlocked||editing"/><el-tab-pane label="日志" name="logs" :disabled="navigationBlocked||editing"/><el-tab-pane label="设置" name="settings" :disabled="navigationBlocked||editing"/></el-tabs>
   <section v-if="tab==='rule'&&content">
    <el-row class="rule-information-grid" :gutter="10"><el-col :xs="24" :sm="24" :md="16"><section class="rule-card basic-information"><h3>基本信息</h3><dl><div><dt>规则类型</dt><dd>{{ruleKindLabels[content.draft.kind].label}}</dd></div><div><dt>设备来源类型</dt><dd>设备</dd></div><div><dt>设备来源</dt><dd><RuleSourceInline :rule-id="ruleId" :definition-version="resource.data.value.snapshot.seed.definitionVersion" :inactive="editing||busy||unknown||information||tagsEditing||previewShown||!!removal||devicesBusy||devicesLocked||logsBusy||logsLocked||logsConfirming" :refresh-context="sourceChanged" @busy="sourceBusy=$event" @locked="sourceLocked=$event" @denied="sourceDenied"/></dd></div><div v-if="content.draft.kind==='ATTRS_RPT_PREPROC'" class="detail-filter-slot"><dt>规则条件</dt><dd>
      <RulePreprocessVersionEditor v-if="editing&&filterEditing" filter-only :request-error="error" :recovery-pending="unknown&&!!pending" :recovering="busy" @recover="verify" :scope-key="scopeKey" :project-id="projectId" @denied="failed" :device-id="resource.data.value.snapshot.seed.deviceId" :device-name="resource.data.value.deviceName" :rule-id="ruleId" :can-read="allowed" :can-revise="writable&&editing&&!busy&&!unknown&&!previewShown" :seed="resource.data.value.snapshot.seed" :resolution="resolution" @submit="revise" @cancel="cancelEdit" @locked="editorLocked=$event" @dirty="dirty=$event" @saved="filterEditing=false;editing=false;dirty=false;editorLocked=false"/>
      <RulePreprocessConditions v-else :model-value="content.draft.filter" :disabled="!settingsReady" @edit="openFilter"/>
     </dd></div><div><dt>创建时间</dt><dd>{{formatTime(metadata.createdAt)}}</dd></div><div><dt>修改时间</dt><dd>{{formatTime(metadata.updatedAt)}}</dd></div></dl></section></el-col><el-col :xs="24" :sm="24" :md="8">
    <section class="rule-card rule-status"><h3>规则状态</h3><div><span>启用规则</span><el-switch v-if="stateSupported" aria-label="启用规则" :model-value="resource.data.value.snapshot.seed.status==='ACTIVE'" :disabled="!writable||navigationBlocked||editing" @change="changeState(Boolean($event))"/><span v-else>{{resource.data.value.snapshot.seed.status==='ACTIVE'?'已启用':'未启用'}}</span><el-button v-if="stateSupported&&resource.data.value.snapshot.seed.status==='ACTIVE'&&resource.data.value.snapshot.seed.activeVersionId!==resource.data.value.snapshot.seed.versionId" size="small" :disabled="!writable||navigationBlocked||editing" @click="changeState(true)">应用已保存内容</el-button></div></section></el-col></el-row>
    <section class="rule-card operations-card">
     <RulePreprocessVersionEditor v-if="editing&&!filterEditing" :detail="!fullEdit" :command="operationCommand" :request-error="error" :recovery-pending="unknown&&!!pending" :recovering="busy" @recover="verify" :scope-key="scopeKey" :project-id="projectId" @denied="failed" :device-id="resource.data.value.snapshot.seed.deviceId" :device-name="resource.data.value.deviceName" :rule-id="ruleId" :can-read="allowed" :can-revise="writable&&editing&&!busy&&!unknown&&!previewShown" :seed="resource.data.value.snapshot.seed" :resolution="resolution" @submit="revise" @cancel="cancelEdit" @locked="editorLocked=$event" @dirty="dirty=$event" @saved="filterEditing=false;operationCommand=undefined;editing=false;fullEdit=false;dirty=false;editorLocked=false"/>
     <RulePreprocessOperationTable v-else detail :model-value="propertyRows" :disabled="!settingsReady" @edit="openCommand('EDIT',$event)" @add="openCommand('ADD')" @sort="openCommand('SORT')" @remove="openCommand('REMOVE',$event)"/>

    </section>
    <section v-if="route.query.origin!=='directory'" class="preview-section"><h3>样例预览</h3><p>使用已保存版本处理属性样例，不派发动作。</p><el-input v-model="sample" aria-label="前处理属性样例" type="textarea" :rows="5" :disabled="navigationBlocked||editing"/><el-button type="primary" :disabled="!allowed||blocked||editing" @click="runPreview">预览已保存版本</el-button>
    <dl v-if="preview" class="preview-result"><dt>结果</dt><dd>{{preview.status}} · {{preview.resultCode}}</dd><dt>条件匹配</dt><dd>{{preview.matched?'是':'否'}}</dd><dt>函数尝试 / 成功</dt><dd>{{preview.functionsAttempted}} / {{preview.functionsSucceeded}}</dd><dt>CPU 毫秒</dt><dd>{{preview.guestCpuMillis??'未知'}}</dd><dt>审计事件</dt><dd>{{preview.eventId}}</dd><dt>输出</dt><dd><pre>{{preview.outputJson??'无完整输出'}}</pre></dd></dl></section>
   </section>
   <UsageStatisticsPanel v-else-if="tab==='statistics'" kind="rule" :id="ruleId" @denied="denied"/>
   <section v-else-if="tab==='settings'" class="rule-settings"><section><h3>规则描述</h3><p class="rule-settings-description">{{resource.data.value.snapshot.seed.description||'—'}}</p><el-button size="small" :disabled="!settingsReady" @click="openInformation">编辑</el-button></section><section><h3>标签</h3><el-table :data="Object.entries(resource.data.value.snapshot.tags).map(([name,value])=>({name,value}))" empty-text="无标签"><el-table-column prop="name" label="标签名称"/><el-table-column prop="value" label="值"/></el-table><el-button size="small" aria-label="编辑标签" :disabled="!settingsReady" @click="openTags">编辑</el-button></section><section><h3>移除规则</h3><p class="rule-settings-removal-tips">规则移除后将立即生效，应用该规则的设备将不会再触发该规则。</p><el-button type="danger" size="small" :disabled="navigationBlocked||!writable" @click="removal=resource.data.value.snapshot">移除规则</el-button></section></section>
  </template>
 </AsyncState>
 <RuleDeviceParticipationPanel v-if="allowed&&devicesVisited&&resource.data.value" :scope="{...scope(),ruleId}" :definition-version="resource.data.value.snapshot.seed.definitionVersion" :inactive="tab!=='devices'||editing||busy||unknown||resource.loading.value||!!resource.error.value||information||tagsEditing||previewShown||!!removal" :refresh-context="refreshDeviceContext" @busy="devicesBusy=$event" @locked="devicesLocked=$event" @denied="deviceDenied"/>
 <RuleDebugLogPanel v-if="allowed&&logsVisited&&resource.data.value" :rule-id="ruleId" :transport="ruleDebugLogTransport" :inactive="tab!=='logs'||editing||busy||unknown||resource.loading.value||!!resource.error.value||information||tagsEditing||previewShown||!!removal" @busy="logsBusy=$event" @locked="logsLocked=$event" @confirming="logsConfirming=$event" @denied="denied"/>
 <el-dialog :model-value="information" title="修改规则信息" width="500px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!busy&&!unknown" :show-close="!busy&&!unknown" @update:model-value="closeSettings"><el-form label-position="top" :disabled="busy||unknown"><el-form-item label="规则名称"><el-input v-model="informationName" aria-label="规则名称" maxlength="128"/></el-form-item><el-form-item label="规则描述"><el-input v-model="informationDescription" aria-label="规则描述" type="textarea" :rows="5" maxlength="512"/></el-form-item></el-form><template #footer><el-button v-if="unknown&&settingsIntent" :disabled="busy||!allowed" @click="verifySettings">读取原操作核对</el-button><el-button :disabled="busy||unknown" @click="closeSettings">取消</el-button><el-button type="primary" :disabled="!settingsReady" :loading="busy" @click="saveInformation">保存</el-button></template></el-dialog>
 <el-dialog :model-value="tagsEditing" title="修改标签" width="600px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!busy&&!unknown" :show-close="!busy&&!unknown" @update:model-value="closeSettings"><RuleTagsEditor v-model="tagRows" :disabled="blocked||!writable"/><template #footer><el-button v-if="unknown&&settingsIntent" :disabled="busy||!allowed" @click="verifySettings">读取原操作核对</el-button><el-button :disabled="busy||unknown" @click="closeSettings">取消</el-button><el-button type="primary" :disabled="blocked||!writable||!tagDirty" @click="saveTags">提交</el-button></template></el-dialog>
 <el-dialog :model-value="!!removal" title="提示" width="420px" align-center :close-on-click-modal="!busy&&!unknown" :close-on-press-escape="!busy&&!unknown" :show-close="!busy&&!unknown" @update:model-value="closeRemoval"><div class="removal-prompt"><el-icon><WarningFilled/></el-icon><span>确认移除规则吗？</span></div><template #footer><el-button aria-label="取消移除" :disabled="busy||unknown" @click="removal=undefined">取消</el-button><el-button type="primary" aria-label="确定移除" :disabled="busy||unknown||!writable" @click="remove">确定</el-button></template></el-dialog>

</main></template>
<style scoped>
.device-preprocess-detail-page{padding:20px 30px 50px;min-width:0}.device-preprocess-detail-page :deep(.el-tabs){margin-top:20px}.device-preprocess-detail-page :deep(.el-tabs__header){margin-bottom:15px}.device-preprocess-detail-page :deep(.el-tabs__nav-wrap::after){height:1px}.rule-heading{padding:10px 0 0;margin:0}.rule-name{display:flex;align-items:center;gap:20px}.rule-name>.el-button{height:28px;padding:7px 15px;font-size:12px;line-height:1}.rule-heading h2{margin:0;font-size:26px;font-weight:500;line-height:34px;color:#002822;overflow-wrap:anywhere}.rule-heading p{margin:0;padding:10px 0 0;font-size:14px;line-height:20px;color:#999;overflow-wrap:anywhere}.rule-information-grid{align-items:flex-start}.rule-card{border:1px solid #ebeef5;border-radius:4px;margin-top:10px;background:#fff;transition:box-shadow .3s}.rule-card:hover,.rule-card:focus{box-shadow:0 2px 12px 0 rgba(0,0,0,.1)}.rule-card h3{font-size:15px;line-height:28px;font-weight:600;color:#2f354d;margin:0;padding:12px 20px;border-bottom:1px solid #ebeef5}.basic-information dl{display:grid;grid-template-columns:1fr;column-gap:10px;margin:0;padding:20px}.basic-information dl>div{min-width:0;padding-bottom:20px}.basic-information dt{font-size:14px;line-height:18px;font-weight:600;color:#606266}.detail-filter-slot{grid-column:1 / -1}.basic-information dd{margin:3px 0 0;font-size:15px;line-height:20px;color:#002822;overflow-wrap:anywhere}.basic-information a{color:var(--el-color-primary);font-size:12px;background:#f5f7fa;padding:3px 8px;border-radius:3px}.rule-status>div{padding:20px 20px 40px}.rule-status .el-switch{display:flex;margin-top:7px}.rule-status span{display:block;font-size:14px;line-height:18px;font-weight:600;color:#606266}.rule-status p{font-size:13px;line-height:1.7;color:var(--tl-muted)}.conditions-card>p{padding:0 20px;font-size:14px;color:#606266;line-height:1.7;overflow-wrap:anywhere}.operations-card>header{display:flex;align-items:center;justify-content:space-between;padding-right:20px;border-bottom:1px solid #ebeef5}.operations-card>header h3{border:0}.operations-card>header>div{display:flex;gap:14px}.operation-summary{display:flex;align-items:center;gap:20px;min-height:86px;padding:20px 28px;border-bottom:1px solid #ebeef5;font-size:14px;color:#606266}.operation-summary:last-child{border-bottom:0}.operation-icon{display:inline-flex;justify-content:center;align-items:center;background:#16834d;color:white;width:30px;height:30px;border-radius:3px;font-size:17px}.operation-order{font-size:12px;color:#909399}.operation-summary>.el-button{margin-left:auto}.operations-card>.rule-preprocess-version-editor{padding:20px}.operations-card>.rule-preprocess-version-editor.detail-mode{padding:0}.preview-entry{margin:0 20px 20px}.rule-settings>section{margin-bottom:32px}.rule-settings>section>h3{margin:10px 0 0;font-size:16px;font-weight:700;line-height:22px;color:#002822}.rule-settings-description{margin:10px 0 10px;font-size:14px;line-height:20px;color:#606266}.rule-settings-removal-tips{margin:5px 0 10px;font-size:14px;line-height:20px;color:#909399}.rule-settings .el-table{margin-bottom:14px}.removal-prompt{display:flex;align-items:center;gap:12px;min-height:36px}.removal-prompt .el-icon{font-size:20px;color:var(--el-color-warning)}.preview-section{max-width:760px}.preview-section h3{display:none}.preview-section>p{font-size:13px;color:var(--el-text-color-secondary)}.preview-section>.el-button{margin-top:14px}.preview-result{display:grid;grid-template-columns:130px minmax(0,1fr);gap:10px;font-size:13px}.preview-result dd{margin:0;overflow-wrap:anywhere}.preview-result pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:400px;overflow:auto}@media(min-width:992px){.basic-information dl{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:767px){.device-preprocess-detail-page{padding-left:15px;padding-right:15px}}@media(max-width:560px){.preview-result{grid-template-columns:1fr}.operation-summary{padding:16px;gap:10px}}
</style>
