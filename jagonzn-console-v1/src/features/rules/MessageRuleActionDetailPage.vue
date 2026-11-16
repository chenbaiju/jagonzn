<script setup lang="ts">
import {computed,inject,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute,useRouter} from 'vue-router'
import {api,ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,projectId,session} from '@/core/session'
import {ruleDeletionIntent,removeMessageRule,readMessageRuleDeletion,type RuleDeletionIntent} from './message-rule-deletion'
import {devicesApi} from '@/features/devices/api'
import {formatTime} from '@/core/time'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import {showOperationFeedback} from '@/ui/operation-feedback'
import RuleSourceInline from './RuleSourceInline.vue'
import {refreshRuleSourceEntry} from './rule-detail-source-refresh'
import {sourceSelection,deviceSourceMembers,readRuleSourceNames,type RuleDeviceSourceContract} from './rule-source-api'
import RuleActionsEditor,{type ActionDraft,type ActionCommand} from './RuleActionsEditor.vue'
import RulePreprocessConditions from './RulePreprocessConditions.vue'
import {freezeRuleContentRecovery,confirmRuleContentRecovery,privateFreeContent,type RuleContentRecovery} from './rule-content-recovery'
import RuleTagsEditor from './RuleTagsEditor.vue'
import {newRuleTag,ruleTagsValue,type RuleTagDraft} from './rule-tag-draft'
import {readRawRuleJson} from './raw-rule-json'
import RuleDeviceParticipationPanel from './RuleDeviceParticipationPanel.vue'
import RuleDebugLogPanel from './RuleDebugLogPanel.vue'
import UsageStatisticsPanel from './UsageStatisticsPanel.vue'
import {ruleDebugLogTransport} from './rule-debug-transport'
import {useDetailTab} from './detail-tab'
import {definitionUuid} from './device-task-definition-port'
import {ruleKindLabels,newConditionGroup} from './rule-builder-draft'
import {readRuleConditionDraft,preprocessConditionJson} from './preprocess-version-editor'
import {parsePreprocessJson,writePreprocessJson} from './preprocess-exact-json'
import {contentBody,confirmRuleContent,exactContentIdentity,readMessageActionCatalog,readRuleContent,writeRuleContent,makeRuleContentStateIntent,makeRuleContentCandidateActivationIntent,ruleContentStateBaselineMatches,confirmRuleContentState,submitRuleContentState,type RuleContentStateIntent,type RuleContentSnapshot,type RuleContentDraft} from './message-rule-content-api'
import type {Schema} from '@/core/contracts'
const route=useRoute(),router=useRouter(),tab=useDetailTab(['rule','devices','statistics','logs','settings'],'rule')
const id=computed(()=>String(route.params.id??'')),allowed=computed(()=>!!projectId.value&&can('rule:manage'))
const data=shallowRef<RuleContentSnapshot>(),catalog=shallowRef<Schema<'Catalog'>>(),sourceName=ref(''),loading=ref(false),busy=ref(false),unknown=ref(false),conflicted=ref(false),unavailable=ref(false),error=ref(''),notice=ref(''),editing=ref(false),sorting=ref(false),info=ref(false),removal=ref(false),confirmedExit=ref(false)
const filterEditing=ref(false),actionLocked=ref(false),actionCommand=shallowRef<ActionCommand>()
const suspendedFilter=shallowRef<ReturnType<typeof newConditionGroup>>()
const sourceBusy=ref(false),sourceLocked=ref(false),sourceNavigation=ref(false),refreshSourceEntry=inject(refreshRuleSourceEntry)
const name=ref(''),description=ref(''),identifier=ref(''),filter=ref(newConditionGroup()),actions=ref<ActionDraft[]>([]),editor=ref<InstanceType<typeof RuleActionsEditor>>()
const devicesVisited=ref(false),devicesBusy=ref(false),devicesLocked=ref(false),logsVisited=ref(false),logsBusy=ref(false),logsLocked=ref(false),logsConfirming=ref(false)
const panelBlocked=computed(()=>devicesBusy.value||devicesLocked.value||logsBusy.value||logsLocked.value||logsConfirming.value)
const tags=shallowRef<Readonly<Record<string,string>>>({}),tagRows=ref<RuleTagDraft[]>([]),tagEditing=ref(false)
const blocked=computed(()=>busy.value||unknown.value||conflicted.value||panelBlocked.value||sourceBusy.value||sourceLocked.value||!!stateIntent.value),navigationBlocked=computed(()=>blocked.value||(editing.value&&!filterEditing.value)||sorting.value||info.value||removal.value||tagEditing.value||actionLocked.value)
// 来源自己的busy/locked只锁父页面，不回传为自己的外部禁用条件。
const sourceInactive=computed(()=>busy.value||unknown.value||conflicted.value||panelBlocked.value||!!stateIntent.value||(editing.value&&!filterEditing.value)||sorting.value||info.value||removal.value||tagEditing.value||actionLocked.value)
const scope=computed(()=>({projectId:projectId.value,ruleId:id.value,scopeKey:`${identityEpoch()}:${generation}:${projectId.value}:${id.value}`}))
const pending=shallowRef<{before:RuleContentSnapshot;draft:RuleContentDraft;result?:RuleContentSnapshot;recovery?:RuleContentRecovery;activation?:{actor:string;scopeKey:string}}>()
const deletionIntent=shallowRef<RuleDeletionIntent>()
const stateIntent=shallowRef<{project:string;actor:string;scopeKey:string;intent:RuleContentStateIntent;attempted:boolean}>()
const informationIntent=shallowRef<{before:RuleContentSnapshot;name:string;description:string;accepted:boolean;attemptId:string}>()
const tagIntent=shallowRef<{before:RuleContentSnapshot;previous:Readonly<Record<string,string>>;wanted:Record<string,string>;accepted:boolean;attemptId:string}>()
let alive=true,generation=0,controller:AbortController|undefined
function capture(){const turn=generation,epoch=identityEpoch(),project=projectId.value,rule=id.value;return {project,rule,current:()=>alive&&turn===generation&&epoch===identityEpoch()&&project===projectId.value&&rule===id.value&&allowed.value}}
function reset(){suspendedFilter.value=undefined;filterEditing.value=false;actionLocked.value=false;actionCommand.value=undefined;generation++;controller?.abort();data.value=undefined;catalog.value=undefined;sourceName.value='';sourceBusy.value=false;sourceLocked.value=false;loading.value=false;busy.value=false;unknown.value=false;conflicted.value=false;unavailable.value=false;error.value='';notice.value='';editing.value=false;sorting.value=false;info.value=false;removal.value=false;confirmedExit.value=false;pending.value=undefined;deletionIntent.value=undefined;stateIntent.value=undefined;informationIntent.value=undefined;tagIntent.value=undefined;tags.value={};tagRows.value=[];tagEditing.value=false;name.value='';description.value='';identifier.value='';actions.value=[];filter.value=newConditionGroup();devicesBusy.value=false;devicesLocked.value=false;logsBusy.value=false;logsLocked.value=false;logsConfirming.value=false}
function denyAuthority(cause:unknown,uncertain=false){
 if(!(cause instanceof ApiError)||![401,403,404].includes(cause.status))return false
 const message=(uncertain?'原写未确认。':'')+errorMessage(cause);reset();unavailable.value=true;error.value=message;return true
}
function markConflict(cause:unknown,accepted=false){if(accepted||!(cause instanceof ApiError)||cause.status!==409||cause.outcomeUnknown||cause.code===10014)return;conflicted.value=true;error.value='规则已变化，请读取最新规则后重新决定。'+errorMessage(cause)}
async function refreshConflict(){
 if(!conflicted.value||busy.value||!allowed.value||unavailable.value)return
 const s=capture();busy.value=true
 try{const fresh=await readRuleContent(s.project,s.rule);if(!s.current())return;if(fresh.id!==s.rule)throw new Error('当前规则读取不匹配');const [nodes,labels,savedTags]=await Promise.all([readMessageActionCatalog(s.project,fresh.kind),readRuleSourceNames(s.project,fresh.source),readTags(s.project,s.rule,fresh.definitionVersion)]);if(!s.current())return;data.value=fresh;catalog.value=nodes;sourceName.value=deviceSourceMembers(fresh.source).map(id=>labels.get(id)!).join('、');tags.value=savedTags;pending.value=undefined;informationIntent.value=undefined;tagIntent.value=undefined;deletionIntent.value=undefined;filterEditing.value=false;actionCommand.value=undefined;editing.value=false;sorting.value=false;info.value=false;tagEditing.value=false;removal.value=false;actions.value=[];tagRows.value=[];conflicted.value=false;unknown.value=false;notice.value='';error.value='已读取最新规则，请按当前内容重新操作。'}catch(cause){if(s.current()){error.value=errorMessage(cause);denyAuthority(cause)}}finally{if(s.current())busy.value=false}
}
async function leaveUnresolved(){if(busy.value||panelBlocked.value)return;confirmedExit.value=true;try{const failure=await router.push(destination());if(failure)confirmedExit.value=false}catch(cause){confirmedExit.value=false;error.value=errorMessage(cause)}}
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;controller?.abort();dispose()})
async function load(){if(!allowed.value||unavailable.value||blocked.value)return;const s=capture();controller?.abort();controller=new AbortController();loading.value=true;error.value=''
 try{const value=await readRuleContent(s.project,s.rule,controller.signal);if(!s.current())return;if(value.id!==s.rule)throw new Error('规则内容读取不匹配');const [nodes,labels,savedTags]=await Promise.all([readMessageActionCatalog(s.project,value.kind,controller.signal),readRuleSourceNames(s.project,value.source,controller.signal),readTags(s.project,s.rule,value.definitionVersion,controller.signal)]);if(!s.current())return;data.value=value;catalog.value=nodes;sourceName.value=deviceSourceMembers(value.source).map(id=>labels.get(id)!).join('、');tags.value=savedTags}catch(cause){if(s.current()){error.value=errorMessage(cause);data.value=undefined;denyAuthority(cause)}}finally{if(s.current())loading.value=false}}
watch([projectId,id,allowed],()=>{reset();if(allowed.value&&definitionUuid(id.value))void load()},{immediate:true})
watch(tab,value=>{if(value==='devices')devicesVisited.value=true;if(value==='logs')logsVisited.value=true},{immediate:true})
function back(){if(navigationBlocked.value)return;void router.push(destination())}
function destination(){if(route.query.origin==='directory')return '/rules/messages';const device=route.query.deviceId,type=route.query.deviceTypeId;return route.query.source==='device'&&definitionUuid(device)?`/devices/${device}?tab=rules`:route.query.source==='device-type'&&definitionUuid(type)?`/device-types/${type}?tab=rules`:'/rules/messages'}
function edit(){const value=data.value;if(!value||blocked.value)return;name.value=value.name;description.value=value.description;identifier.value=value.identifier;filter.value=readRuleConditionDraft(value.filterJson);actions.value=value.actions.map(row=>({...row,config:parsePreprocessJson(writePreprocessJson(row.config)) as ActionDraft['config']}));editing.value=true}
/** 状态意图范围单独固定，不让普通读取或其它弹窗重置原意图。 */
function stateScopeKey(){return `${identityEpoch()}:${generation}:${projectId.value}:${id.value}`}
function stateCurrent(original:NonNullable<typeof stateIntent.value>){return allowed.value&&original.project===projectId.value&&original.actor===session.user?.accountId&&original.scopeKey===stateScopeKey()&&original.intent.ruleId===id.value}
watch(()=>session.user?.accountId,actor=>{if(stateIntent.value&&stateIntent.value.actor!==actor||pending.value?.activation&&pending.value.activation.actor!==actor)reset()})
async function installState(fresh:RuleContentSnapshot,current:()=>boolean,contentSaved=false){
 if(!data.value||!catalog.value){
  const [nodes,labels,savedTags]=await Promise.all([readMessageActionCatalog(projectId.value,fresh.kind),readRuleSourceNames(projectId.value,fresh.source),readTags(projectId.value,fresh.id,fresh.definitionVersion)])
  if(!current())return
  catalog.value=nodes;sourceName.value=deviceSourceMembers(fresh.source).map(id=>labels.get(id)!).join('、');tags.value=savedTags
 }
 if(!current())return
 data.value=fresh;stateIntent.value=undefined;unknown.value=false;unavailable.value=false;error.value='';notice.value=contentSaved?'已保存并生效。':'';showOperationFeedback(fresh.status==='ACTIVE'?'规则已启用':'规则已停用')
}
function stateReadFailure(cause:unknown){
 error.value=errorMessage(cause);unknown.value=true
 if(cause instanceof ApiError&&cause.status===404){sealContent();unknown.value=true}
 else if(cause instanceof ApiError&&[401,403].includes(cause.status))denyAuthority(cause,true)
}
async function changeState(enabled:boolean){
 const before=data.value,actor=session.user?.accountId;if(!before||!actor||!allowed.value||navigationBlocked.value||loading.value||unavailable.value||enabled===(before.status==='ACTIVE'))return
 let intent:RuleContentStateIntent;try{intent=makeRuleContentStateIntent(before,enabled,crypto.randomUUID())}catch(cause){error.value=errorMessage(cause);return}
 stateIntent.value={project:projectId.value,actor,scopeKey:stateScopeKey(),intent,attempted:false};notice.value='';await applyPendingState()
}
function contentActivation(intent:RuleContentStateIntent){return intent.status==='ACTIVE'&&intent.enabled}
/** 新状态意图只发送一次；候选激活与内容PUT是两个独立结果，GET不得采用新CAS补发。 */
async function applyPendingState(){
 const original=stateIntent.value;if(!original||original.attempted||busy.value||!allowed.value)return
 if(!stateCurrent(original)){reset();return}
 const s=capture(),current=()=>s.current()&&stateCurrent(original),contentSaved=contentActivation(original.intent);busy.value=true;error.value='';let accepted=false
 try{
  const freshBefore=await readRuleContent(original.project,original.intent.ruleId);if(!current())return
  if(!ruleContentStateBaselineMatches(original.intent,freshBefore)){stateIntent.value=undefined;conflicted.value=true;error.value='规则状态已变化，请读取最新规则后重新决定。';showOperationFeedback('规则状态已变化，请重新读取','warning');return}
  original.attempted=true;stateIntent.value={...original}
  await submitRuleContentState(original.project,original.intent,current);if(!current())return;accepted=true
  const fresh=await readRuleContent(original.project,original.intent.ruleId);if(!current())return;confirmRuleContentState(original.intent,fresh);await installState(fresh,current,contentSaved)
 }catch(cause){if(current()){
  const rejected=!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[400,401,403,404,409,422].includes(cause.status)
  if(!original.attempted||rejected){stateIntent.value=undefined;unknown.value=false;error.value=(contentSaved?'内容已保存，但生效未完成。':'')+errorMessage(cause);showOperationFeedback('规则状态更新失败','error');if(original.attempted&&cause instanceof ApiError&&cause.status===409)conflicted.value=true;denyAuthority(cause)}else{if(contentSaved)notice.value='内容已保存，生效结果尚未完整核对。';stateReadFailure(cause);showOperationFeedback('规则状态尚未确认','warning')}
 }}finally{if(s.current())busy.value=false}
}
async function verifyState(){
 const original=stateIntent.value;if(!original||!original.attempted||busy.value||!allowed.value)return
 if(!stateCurrent(original)){reset();return}
 const s=capture(),current=()=>s.current()&&stateCurrent(original);busy.value=true
 try{const fresh=await readRuleContent(original.project,original.intent.ruleId);if(!current())return;confirmRuleContentState(original.intent,fresh);await installState(fresh,current,contentActivation(original.intent))}catch(cause){if(current())stateReadFailure(cause)}finally{if(s.current())busy.value=false}
}
const savedFilter=shallowRef(newConditionGroup())
watch(()=>data.value?.kind==='ATTRS_RPT'?data.value.filterJson:undefined,value=>{savedFilter.value=value===undefined?newConditionGroup():readRuleConditionDraft(value)},{immediate:true})
function clearContentDraft(){actionLocked.value=false;filterEditing.value=false;actionCommand.value=undefined;editing.value=false;sorting.value=false;actions.value=[];filter.value=newConditionGroup();name.value='';description.value='';identifier.value=''}
function restoreFilter(){const draft=suspendedFilter.value;suspendedFilter.value=undefined;if(draft&&data.value){edit();filter.value=draft;filterEditing.value=true}}
function cancelContent(){if(blocked.value)return;clearContentDraft();restoreFilter()}
function openFilter(){if(navigationBlocked.value||data.value?.kind!=='ATTRS_RPT')return;edit();filterEditing.value=true}
function openCommand(value:{kind:'ADD'}|{kind:'EDIT'|'REMOVE';id:string}){if(navigationBlocked.value||!data.value)return;if(filterEditing.value)suspendedFilter.value=filter.value;edit();filterEditing.value=false;actionCommand.value={...value,token:crypto.randomUUID()}}
function startSort(){if(navigationBlocked.value)return;if(filterEditing.value)suspendedFilter.value=filter.value;edit();filterEditing.value=false;editing.value=false;sorting.value=true}
function cancelSort(){if(blocked.value)return;clearContentDraft();restoreFilter()}
function sealContent(){clearContentDraft();data.value=undefined;catalog.value=undefined;sourceName.value='';tags.value={};tagRows.value=[];unavailable.value=true}
function savedContent(before:RuleContentSnapshot,fresh:RuleContentSnapshot,activation?:{actor:string;scopeKey:string}){
 let intent:RuleContentStateIntent|undefined
 if(activation){if(activation.actor!==session.user?.accountId||activation.scopeKey!==stateScopeKey())throw new Error('原保存身份已变化，请重新读取');intent=makeRuleContentCandidateActivationIntent(before,fresh,crypto.randomUUID())}
 data.value=fresh;clearContentDraft();restoreFilter();pending.value=undefined;unknown.value=false;unavailable.value=false;error.value=''
 if(intent&&activation){stateIntent.value={project:projectId.value,actor:activation.actor,scopeKey:activation.scopeKey,intent,attempted:false};notice.value='内容已保存，尚未完成生效。'}else notice.value=''
}
async function save(fromOperation=false){const before=data.value;if(!before||!editing.value&&!sorting.value||blocked.value||!fromOperation&&!editor.value?.valid())return
 const activateAfterSave=before.status==='ACTIVE'&&(sorting.value||!!actionCommand.value),actor=session.user?.accountId
 let draft:RuleContentDraft,body:string;try{if(activateAfterSave&&!definitionUuid(before.activeVersionId))throw new Error('活动版本读取不完整，无法完成保存并生效');if(activateAfterSave&&(BigInt(before.definitionVersion)>9223372036854775805n||!actor))throw new Error('规则修订已达上限或账号已变化，无法完成保存并生效');draft={name:filterEditing.value?before.name:name.value,description:filterEditing.value?before.description:description.value,source:sourceSelection(before.source),kind:before.kind,identifier:filterEditing.value?before.identifier:identifier.value,filterJson:preprocessConditionJson(filter.value),actions:filterEditing.value?before.actions:actions.value};body=contentBody(draft,before)}catch(cause){error.value=errorMessage(cause);return}
 const activation=activateAfterSave?{actor:actor!,scopeKey:stateScopeKey()}:undefined,s=capture();busy.value=true;error.value='';notice.value='';let attempted=false
 try{const recovery=await freezeRuleContentRecovery(before,draft);if(!s.current())return;pending.value={before,draft,recovery,activation};attempted=true;const result=await writeRuleContent(s.project,body,before,s.current);if(!s.current())return;confirmRuleContent(draft,result,before);pending.value={before,draft,result,recovery,activation};const fresh=await readRuleContent(s.project,s.rule);if(!s.current())return;confirmRuleContent(draft,fresh,before);if(fresh.versionId!==result.versionId)throw new Error('保存后的规则版本已变化，请核对');savedContent(before,fresh,activation);if(activation){busy.value=false;await applyPendingState()}}
 catch(cause){if(s.current()){error.value=errorMessage(cause);unknown.value=attempted&&(!!pending.value?.result||!(cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[400,401,403,404,409,422].includes(cause.status)));if(unknown.value&&pending.value?.recovery){const original=pending.value;pending.value={before:original.recovery!.before,draft:original.recovery!.draft,recovery:original.recovery,activation:original.activation,...(original.result?{result:privateFreeContent(original.result)}:{})};sealContent()}else if(!unknown.value)pending.value=undefined;markConflict(cause,unknown.value);if(conflicted.value&&!unknown.value)clearContentDraft();if(!unknown.value||!(cause instanceof ApiError&&cause.status===404))denyAuthority(cause,unknown.value)}}finally{if(s.current())busy.value=false}
}
async function recover(){const original=pending.value;if(!original?.recovery||busy.value||!allowed.value)return;const s=capture();busy.value=true;try{const fresh=await readRuleContent(s.project,s.rule);if(!s.current())return;await confirmRuleContentRecovery(original.recovery,fresh,original.result?.versionId);if(!s.current())return;const [nodes,labels,savedTags]=await Promise.all([readMessageActionCatalog(s.project,fresh.kind),readRuleSourceNames(s.project,fresh.source),readTags(s.project,s.rule,fresh.definitionVersion)]);if(!s.current())return;savedContent(original.before,fresh,original.activation);catalog.value=nodes;sourceName.value=deviceSourceMembers(fresh.source).map(id=>labels.get(id)!).join('、');tags.value=savedTags}catch(cause){if(s.current()){error.value=errorMessage(cause);if(cause instanceof ApiError&&cause.status===404){sealContent();unknown.value=true}else denyAuthority(cause,true)}}finally{if(s.current())busy.value=false}}

function openInfo(){if(!data.value||navigationBlocked.value)return;name.value=data.value.name;description.value=data.value.description;info.value=true}
function informationMatches(intent:NonNullable<typeof informationIntent.value>,fresh:RuleContentSnapshot){
 const before=intent.before
 const content=(value:RuleContentSnapshot)=>exactContentIdentity({source:{kind:String(value.source.kind),members:deviceSourceMembers(value.source)},kind:value.kind,identifier:value.identifier,filter:parsePreprocessJson(value.filterJson),actions:value.actions.map(({nodeType,config})=>({nodeType,config}))})
 if(fresh.id!==before.id||fresh.definitionVersion!==(BigInt(before.definitionVersion)+1n).toString()||fresh.versionId!==before.versionId||fresh.versionNumber!==before.versionNumber||fresh.status!==before.status||fresh.name!==intent.name||fresh.description!==intent.description||content(fresh)!==content(before))throw new Error('规则信息回读未确认，请保留原操作，不重复保存')
}
async function saveInfo(){
 const before=data.value;if(!before||blocked.value||!info.value||!name.value.trim()||name.value.trim().length>128||description.value.length>512)return
 const s=capture(),intent={before,name:name.value.trim(),description:description.value.trim(),accepted:false,attemptId:crypto.randomUUID()};informationIntent.value=intent;busy.value=true;error.value=''
 try{
  await api(`/api/v1/projects/${s.project}/message-rules/${s.rule}`,{method:'put',query:{informationOnly:true},rawBody:'{"name":'+JSON.stringify(intent.name)+',"description":'+JSON.stringify(intent.description)+',"expectedVersion":'+before.definitionVersion+'}',headers:{'Content-Type':'application/json','Idempotency-Key':intent.attemptId}});intent.accepted=true
  if(!s.current())return
  const fresh=await readRuleContent(s.project,s.rule);if(!s.current())return;informationMatches(intent,fresh);data.value=fresh;informationIntent.value=undefined;info.value=false
 }catch(cause){if(s.current()){error.value=errorMessage(cause);unknown.value=intent.accepted||!(cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[400,401,403,404,409,422].includes(cause.status));if(!unknown.value)informationIntent.value=undefined;markConflict(cause,unknown.value);denyAuthority(cause,unknown.value)}}finally{if(s.current())busy.value=false}
}
async function recoverInformation(){
 const intent=informationIntent.value;if(!intent||busy.value||!allowed.value||unavailable.value)return
 const s=capture();busy.value=true
 try{const fresh=await readRuleContent(s.project,s.rule);if(!s.current())return;informationMatches(intent,fresh);data.value=fresh;informationIntent.value=undefined;unknown.value=false;info.value=false;error.value=''}catch(cause){if(s.current()){error.value=errorMessage(cause);denyAuthority(cause,true)}}finally{if(s.current())busy.value=false}
}
async function readTags(project:string,rule:string,expected:string,signal?:AbortSignal){
 const bytes=await api<Uint8Array>(`/api/v1/projects/${project}/message-rules/${rule}/tags`,{responseType:'bytes',query:{expectedDefinitionVersion:expected},signal})
 const value=readRawRuleJson(bytes)
 if(value.at(['ruleId']).string()!==rule||value.at(['version']).integerText()!==expected)throw new Error('规则标签与当前版本不匹配，请重新读取')
 const fields=value.at(['tags']);return Object.freeze(ruleTagsValue(fields.keys().map((key,index)=>({id:String(index),key,value:fields.at([key]).string()}))))
}
function sameTags(left:Readonly<Record<string,string>>,right:Readonly<Record<string,string>>){return Object.keys(left).length===Object.keys(right).length&&Object.keys(left).every(key=>Object.hasOwn(right,key)&&left[key]===right[key])}
function openTags(){if(!data.value||navigationBlocked.value)return;tagRows.value=Object.entries(tags.value).map(([key,value])=>({...newRuleTag(),key,value}));tagEditing.value=true}
function closeTags(){if(!blocked.value){tagEditing.value=false;tagRows.value=[]}}
function confirmTags(intent:NonNullable<typeof tagIntent.value>,fresh:RuleContentSnapshot,currentTags:Readonly<Record<string,string>>){
 const before=intent.before,expected=BigInt(before.definitionVersion)+(sameTags(intent.previous,intent.wanted)?0n:1n)
 const stable=(value:RuleContentSnapshot)=>exactContentIdentity({source:{kind:String(value.source.kind),members:deviceSourceMembers(value.source)},kind:value.kind,identifier:value.identifier,filter:parsePreprocessJson(value.filterJson),actions:value.actions.map(({nodeType,config})=>({nodeType,config}))})
 if(BigInt(fresh.definitionVersion)!==expected||fresh.id!==before.id||fresh.versionId!==before.versionId||fresh.versionNumber!==before.versionNumber||fresh.status!==before.status||fresh.name!==before.name||fresh.description!==before.description||stable(fresh)!==stable(before)||!sameTags(currentTags,intent.wanted))throw new Error('规则标签保存尚未完整核对，请勿重复保存')
}
async function saveTags(){
 const before=data.value;if(!before||blocked.value||!tagEditing.value||tagIntent.value)return
 let wanted:Record<string,string>;try{wanted=ruleTagsValue(tagRows.value)}catch(cause){error.value=errorMessage(cause);return}
 const s=capture(),intent={before,previous:tags.value,wanted,accepted:false,attemptId:crypto.randomUUID()};tagIntent.value=intent;busy.value=true;error.value=''
 try{
  const fields:Record<keyof Schema<'MessageRuleTagsWriteRequest'>,string>={expectedVersion:before.definitionVersion,tags:JSON.stringify(wanted)}
  await api(`/api/v1/projects/${s.project}/message-rules/${s.rule}/tags`,{method:'put',rawBody:'{'+Object.entries(fields).map(([key,value])=>JSON.stringify(key)+':'+value).join(',')+'}',headers:{'Content-Type':'application/json','Idempotency-Key':intent.attemptId}});intent.accepted=true
  if(!s.current())return
  const fresh=await readRuleContent(s.project,s.rule);if(!s.current())return;const currentTags=await readTags(s.project,s.rule,fresh.definitionVersion);if(!s.current())return;confirmTags(intent,fresh,currentTags);data.value=fresh;tags.value=currentTags;tagIntent.value=undefined;tagEditing.value=false;tagRows.value=[]
 }catch(cause){if(s.current()){error.value=errorMessage(cause);unknown.value=intent.accepted||!(cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[400,401,403,404,409,422].includes(cause.status));if(!unknown.value)tagIntent.value=undefined;markConflict(cause,unknown.value);denyAuthority(cause,unknown.value)}}finally{if(s.current())busy.value=false}
}
async function recoverTags(){
 const intent=tagIntent.value;if(!intent||busy.value||!allowed.value||unavailable.value)return
 const s=capture();busy.value=true
 try{const fresh=await readRuleContent(s.project,s.rule);if(!s.current())return;const currentTags=await readTags(s.project,s.rule,fresh.definitionVersion);if(!s.current())return;confirmTags(intent,fresh,currentTags);data.value=fresh;tags.value=currentTags;tagIntent.value=undefined;tagEditing.value=false;tagRows.value=[];unknown.value=false;error.value=''}catch(cause){if(s.current()){error.value=errorMessage(cause);denyAuthority(cause,true)}}finally{if(s.current())busy.value=false}
}
async function remove(){
 const before=data.value;if(!before||blocked.value||!removal.value)return;const s=capture()
 try{deletionIntent.value=ruleDeletionIntent(s.project,s.rule,session.user?.accountId??'',before.definitionVersion)}catch(cause){error.value=errorMessage(cause);return}
 busy.value=true;error.value='';let accepted=false
 try{await removeMessageRule(deletionIntent.value);accepted=true;if(!s.current())return;deletionIntent.value=undefined;confirmedExit.value=true;await router.replace(destination())}catch(cause){if(s.current()){error.value=errorMessage(cause);if(accepted){error.value='规则已移除，返回未完成。'+error.value;removal.value=false;confirmedExit.value=true}else{unknown.value=!(cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[400,401,403,404,409,422].includes(cause.status));if(!unknown.value)deletionIntent.value=undefined;markConflict(cause,unknown.value);denyAuthority(cause,unknown.value)}}}finally{if(s.current())busy.value=false}
}
async function recoverRemoval(){
 const intent=deletionIntent.value;if(!intent||busy.value||!allowed.value)return;const s=capture();if(s.project!==intent.project||s.rule!==intent.rule)return;busy.value=true
 try{await readMessageRuleDeletion(intent);if(!s.current())return;deletionIntent.value=undefined;unknown.value=false;removal.value=false;confirmedExit.value=true;await router.replace(destination())}catch(cause){if(s.current()){
  if(cause instanceof ApiError&&cause.status===404){reset();deletionIntent.value=intent;unknown.value=true;removal.value=true;unavailable.value=true;error.value='当前未查到原删除回执，结果仍未确认。请勿再次移除；可继续核对原回执或保留未确认结果并返回。'}
  else if(!denyAuthority(cause,true))error.value=errorMessage(cause)
 }}finally{if(s.current())busy.value=false}
}

async function refreshContext(){const s=capture(),fresh=await readRuleContent(s.project,s.rule);if(!s.current())throw new Error('当前规则身份已变化');const currentTags=await readTags(s.project,s.rule,fresh.definitionVersion);if(!s.current())throw new Error('当前规则身份已变化');data.value=fresh;tags.value=currentTags;return fresh.definitionVersion}
async function sourceChanged(source:RuleDeviceSourceContract){sourceNavigation.value=true;try{if(refreshSourceEntry)await refreshSourceEntry(source);else await refreshContext()}finally{sourceNavigation.value=false}}
function sourceDenied(cause:ApiError,uncertain:boolean){denyAuthority(cause,uncertain||unknown.value)}
function denied(cause?:ApiError,uncertain=false){if(!denyAuthority(cause,uncertain)){reset();unavailable.value=true;error.value='当前内容已不可读取'}}
onBeforeRouteLeave(()=>!navigationBlocked.value||confirmedExit.value);onBeforeRouteUpdate(to=>sourceNavigation.value||!navigationBlocked.value||to.fullPath===route.fullPath)
function beforeUnload(event:BeforeUnloadEvent){if(navigationBlocked.value){event.preventDefault();event.returnValue=''}}window.addEventListener('beforeunload',beforeUnload);onScopeDispose(()=>window.removeEventListener('beforeunload',beforeUnload))
</script>
<template><main class="tl-page action-rule-detail"><PageHeader title="规则详情" back :back-disabled="navigationBlocked" @back="back"/><el-alert v-if="notice" :title="notice" type="info" :closable="false"/><el-alert v-if="error" :title="unknown?'结果尚未完整核对，请勿重复提交。'+error:error" type="error" :closable="false"/><el-button v-if="unknown&&pending" :disabled="busy" @click="recover">读取原规则核对</el-button><el-button v-if="stateIntent&&!stateIntent.attempted&&!busy" type="primary" :disabled="busy||!allowed" @click="applyPendingState">继续完成生效</el-button><el-button v-if="unknown&&stateIntent" :disabled="busy||!allowed" @click="verifyState">读取原状态核对</el-button><el-button v-if="unknown&&informationIntent&&!info" :disabled="busy" @click="recoverInformation">读取原信息核对</el-button><el-button v-if="unknown&&tagIntent&&!tagEditing" :disabled="busy" @click="recoverTags">读取原标签核对</el-button><template v-if="conflicted&&!info&&!tagEditing&&!removal"><el-button :disabled="busy" @click="refreshConflict">读取最新规则</el-button><el-button :disabled="busy" @click="leaveUnresolved">取消操作并返回</el-button></template><AsyncState :forbidden="!allowed||unavailable" :loading="loading" :error="!data?error:undefined" @retry="load"><template v-if="data&&catalog"><header class="rule-heading"><div class="rule-name"><h1>{{data.name}}</h1><el-button size="small" :disabled="navigationBlocked" @click="openInfo">编辑</el-button></div><p>ID：{{data.id}}</p></header><el-tabs v-model="tab"><el-tab-pane v-for="item in [['rule','规则'],['devices','设备'],['statistics','统计'],['logs','日志'],['settings','设置']]" :key="item[0]" :name="item[0]" :label="item[1]" :disabled="navigationBlocked"/></el-tabs>
 <section v-show="tab==='rule'" class="rule-overview"><el-row class="rule-information-grid" :gutter="10"><el-col :xs="24" :sm="24" :md="16"><section class="rule-card basic-information rule-basics"><h3>基本信息</h3><dl><div><dt>规则类型</dt><dd>{{ruleKindLabels[data.kind].label}}</dd></div><div><dt>设备来源类型</dt><dd>{{data.source.kind==='DEVICE_TYPE'?'设备类型':'设备'}}</dd></div><div class="source-field"><dt>设备来源</dt><dd><RuleSourceInline :rule-id="id" :definition-version="data.definitionVersion" :inactive="sourceInactive" :refresh-context="sourceChanged" @busy="sourceBusy=$event" @locked="sourceLocked=$event" @denied="sourceDenied"/></dd></div><div v-if="data.identifier"><dt>{{data.kind==='EVENT_RPT'?'事件标识符':'数据流标识符'}}</dt><dd>{{data.identifier}}</dd></div><div v-if="data.kind==='ATTRS_RPT'" class="detail-filter-slot"><dt>过滤条件</dt><dd><RulePreprocessConditions v-if="filterEditing" v-model="filter" editing :project="projectId" :report-source="data.source" :disabled="blocked" :error="error" @save="save(true)" @cancel="cancelContent"/><RulePreprocessConditions v-else :model-value="savedFilter" :disabled="navigationBlocked" @edit="openFilter"/></dd></div><div><dt>创建时间</dt><dd>{{formatTime(data.createdAt)}}</dd></div><div><dt>修改时间</dt><dd>{{formatTime(data.updatedAt)}}</dd></div></dl></section></el-col><el-col :xs="24" :sm="24" :md="8"><section class="rule-card rule-status"><h3>规则状态</h3><div><span>启用规则</span><p><el-switch aria-label="启用规则" :model-value="stateIntent&&!unknown?stateIntent.intent.enabled:data.status==='ACTIVE'" :disabled="!allowed||navigationBlocked||loading" @change="changeState(Boolean($event))"/></p></div></section></el-col></el-row>
 <section class="rule-card rule-action-section"><h3 class="actions-heading">操作 <span v-if="sorting"><el-button link type="primary" :loading="busy" :disabled="blocked" @click="save()">保存排序</el-button><el-button link type="primary" :disabled="blocked" @click="cancelSort">取消</el-button></span><span v-else><el-button link type="primary" :disabled="navigationBlocked||!data.actions.length" @click="startSort">排序</el-button><el-button link type="primary" :disabled="navigationBlocked" @click="openCommand({kind:'ADD'})">添加操作</el-button></span></h3><RuleActionsEditor ref="editor" :model-value="editing||sorting?actions:data.actions" :catalog="catalog" :trigger-kind="data.kind" :device-source="data.source" :disabled="blocked" :sorting="sorting" detail presentation="cards" :command="actionCommand" :request-error="error" @update:model-value="actions=$event" @command="openCommand" @commit="save(true)" @cancel-command="cancelContent" @locked="actionLocked=$event" @authority-denied="denyAuthority($event,unknown)"/></section></section>
 <UsageStatisticsPanel v-if="tab==='statistics'" kind="rule" :id="id" @denied="denied"/>
 <section v-else-if="tab==='settings'" class="rule-settings"><article><h3>规则描述</h3><p class="rule-settings-description">{{data.description||'—'}}</p><el-button size="small" :disabled="navigationBlocked" @click="openInfo">编辑</el-button></article><article><h3>标签</h3><el-table :data="Object.entries(tags).map(([name,value])=>({name,value}))" empty-text="无标签"><el-table-column prop="name" label="标签名称"/><el-table-column prop="value" label="值"/></el-table><el-button size="small" aria-label="编辑标签" :disabled="navigationBlocked" @click="openTags">编辑</el-button></article><article><h3>移除规则</h3><p class="rule-settings-removal-tips">规则移除后将立即生效，应用该规则的设备将不会再触发该规则。</p><el-button size="small" type="danger" :disabled="navigationBlocked" @click="removal=true">移除规则</el-button></article></section>
 <RuleDeviceParticipationPanel v-if="devicesVisited" :scope="scope" :definition-version="data.definitionVersion" :inactive="tab!=='devices'||(editing&&!filterEditing)||sorting||busy||unknown||info||removal||tagEditing" :refresh-context="refreshContext" @busy="devicesBusy=$event" @locked="devicesLocked=$event" @denied="denied"/><RuleDebugLogPanel v-if="logsVisited" :rule-id="id" :transport="ruleDebugLogTransport" :inactive="tab!=='logs'||(editing&&!filterEditing)||sorting||busy||unknown||info||removal||tagEditing" @busy="logsBusy=$event" @locked="logsLocked=$event" @confirming="logsConfirming=$event" @denied="denied"/>
 </template></AsyncState>
 <el-dialog v-model="info" class="action-rule-information-dialog" title="修改规则信息" width="min(500px,94vw)" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!busy&&!unknown" :show-close="!busy&&!unknown"><el-alert v-if="conflicted" :title="error" type="warning" :closable="false"/><el-form label-position="top" :disabled="blocked"><el-form-item label="规则名称"><el-input v-model="name" aria-label="规则名称" maxlength="128"/></el-form-item><el-form-item label="规则描述"><el-input v-model="description" aria-label="规则描述" type="textarea" :rows="5" maxlength="512"/></el-form-item></el-form><template #footer><el-button v-if="conflicted" :disabled="busy" @click="refreshConflict">读取最新规则</el-button><el-button v-if="conflicted" :disabled="busy" @click="leaveUnresolved">取消操作并返回</el-button><el-button v-if="unknown&&informationIntent" :disabled="busy" @click="recoverInformation">读取原信息核对</el-button><el-button :disabled="blocked" @click="info=false">取消</el-button><el-button type="primary" :disabled="blocked" @click="saveInfo">保存</el-button></template></el-dialog>
 <el-dialog :model-value="tagEditing" title="修改标签" width="600px" :lock-scroll="false" :close-on-click-modal="false" :close-on-press-escape="!blocked" :show-close="!blocked" @update:model-value="closeTags"><el-alert v-if="conflicted" :title="error" type="warning" :closable="false"/><RuleTagsEditor v-model="tagRows" :disabled="blocked"/><template #footer><el-button v-if="conflicted" :disabled="busy" @click="refreshConflict">读取最新规则</el-button><el-button v-if="conflicted" :disabled="busy" @click="leaveUnresolved">取消操作并返回</el-button><el-button v-if="unknown&&tagIntent" :disabled="busy" @click="recoverTags">读取原标签核对</el-button><el-button :disabled="blocked" @click="closeTags">取消</el-button><el-button type="primary" :disabled="blocked" @click="saveTags">提交</el-button></template></el-dialog>
 <el-dialog v-model="removal" title="移除规则" width="420px" :close-on-click-modal="!busy&&!unknown" :close-on-press-escape="!busy&&!unknown" :show-close="!busy&&!unknown"><p>确认移除当前规则吗？</p><el-alert v-if="(unknown||conflicted)&&error" :title="unknown?'删除结果尚未确认。'+error:error" type="warning" :closable="false"/><template #footer><el-button v-if="unknown&&deletionIntent" :disabled="busy" @click="recoverRemoval">读取原删除回执</el-button><el-button v-if="unknown&&deletionIntent" :disabled="busy" @click="leaveUnresolved">保留未确认结果并返回</el-button><el-button v-if="conflicted" :disabled="busy" @click="refreshConflict">读取最新规则</el-button><el-button v-if="conflicted" :disabled="busy" @click="leaveUnresolved">取消操作并返回</el-button><el-button :disabled="blocked" @click="removal=false">取消</el-button><el-button type="danger" :disabled="blocked" @click="remove">移除</el-button></template></el-dialog>
</main></template>
<style scoped>.action-rule-detail{padding:20px 30px 50px;min-width:0}.rule-heading{padding:10px 0 0;margin:0}.rule-name{display:flex;align-items:center;gap:20px}.rule-name>.el-button{height:28px;padding:7px 15px;font-size:12px;line-height:1}.rule-heading h1{font-size:26px;font-weight:500;line-height:34px;color:#002822;margin:0;overflow-wrap:anywhere}.rule-heading p{margin:0;padding:10px 0 0;font-size:14px;line-height:20px;color:#999;overflow-wrap:anywhere}.action-rule-detail :deep(.el-tabs){margin-top:20px}.action-rule-detail :deep(.el-tabs__header){margin-bottom:15px}.action-rule-detail .rule-overview,.rule-information-grid .rule-card{max-width:none}.rule-information-grid{align-items:flex-start}.rule-card{border:1px solid #ebeef5;border-radius:4px;margin-top:10px;background:#fff;transition:box-shadow .3s}.rule-card:hover,.rule-card:focus{box-shadow:0 2px 12px 0 rgba(0,0,0,.1)}.basic-information dl{display:grid;grid-template-columns:1fr;column-gap:10px;margin:0;padding:20px}.basic-information dl>div{min-width:0;padding-bottom:20px}.basic-information dt,.rule-status>div>span{display:block;font-size:14px;line-height:18px;font-weight:600;color:#606266}.basic-information dd{margin:3px 0 0;font-size:15px;line-height:20px;color:#002822;overflow-wrap:anywhere}.detail-filter-slot{grid-column:1 / -1}.rule-status>div{padding:20px 20px 40px}.rule-status p{margin:7px 0 0;font-size:15px;line-height:20px;color:#002822}.action-rule-detail h3{font-size:18px;font-weight:400;margin:25px 0 15px}.action-rule-detail .rule-card>h3{font-size:15px;line-height:28px;font-weight:600;color:#2f354d;margin:0;padding:12px 20px;border-bottom:1px solid #ebeef5}.action-rule-detail h3 .el-button{margin-left:15px}.actions-heading{display:flex;align-items:center;justify-content:space-between}.actions-heading>span{display:flex;align-items:center}.actions-heading>span .el-button{font-size:14px;padding:3px 0}.action-rule-detail section{max-width:1000px}.action-rule-detail footer{margin-top:20px}.rule-settings article{padding:20px 0;border-bottom:1px solid #e4e7ed}.rule-settings>article>h3{margin:10px 0 0;font-size:16px;font-weight:700;line-height:22px;color:#002822}.rule-settings-description{margin:10px 0 10px;font-size:14px;line-height:20px;color:#606266}.rule-settings-removal-tips{margin:5px 0 10px;font-size:14px;line-height:20px;color:#909399}@media(min-width:992px){.basic-information dl{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:767px){.action-rule-detail{padding:20px 15px 40px}}
.action-rule-detail :deep(.tl-page-header) { min-height: 24px; }
.action-rule-detail :deep(.tl-back) { font-size: 14px; line-height: 24px; font-weight: 500; }
.action-rule-detail :deep(.tl-page-header h1.is-secondary) { color: #303133; }
.rule-status :deep(.el-switch) { height: 20px; }
.source-field :deep(.source-edit) { height: 28px; }
.basic-information .detail-filter-slot dd { margin-top: 10px; }
.action-rule-detail :deep(.preprocess-conditions) { max-width: none; }
.action-rule-detail :deep(.rule-related-devices) { max-width: none; }
.action-rule-detail .rule-settings { max-width: none; padding-top: 10px; }
.rule-settings article { padding: 0; border: 0; margin-bottom: 30px; }
.rule-settings > article > h3 { margin: 0; }
.rule-settings :deep(th.el-table__cell) { color: #303133; font-weight: 600; }
.rule-settings article > .el-table { margin-bottom: 10px; }
.rule-status :deep(.el-switch.is-disabled) { opacity: 1; }
.detail-filter-slot :deep(.preprocess-conditions > .el-button) { height: 28px; }
.detail-filter-slot :deep(.preprocess-conditions.is-empty > .el-button) { margin-top: 0; }
.action-rule-detail .rule-action-section { max-width: none; }
.rule-action-section :deep(.rule-actions-editor) { max-width: none; padding: 20px; }
:global(.action-rule-information-dialog .el-dialog__body) { padding: 36px 20px 33px; }
:global(.action-rule-information-dialog .el-form-item) { margin-bottom: 24px; }
:global(.action-rule-information-dialog .el-form-item__label) { color: #606266; font-weight: 500; }
</style>
