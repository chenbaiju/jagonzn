<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import AsyncState from '@/ui/AsyncState.vue'
import DeviceRulePreprocessBuilder from '../rules/DeviceRulePreprocessBuilder.vue'
import {createTypePreprocessor,recoverTypePreprocessor,knownPreprocessRejection,PreprocessOutcomeUnknown,readTypePreprocessor,makeTypePreprocessActivationIntent,activateTypePreprocessIntent,confirmTypePreprocessActivation,type TypePreprocessActivationIntent} from '../rules/preprocess-control-api'
import type {PreprocessKind} from '../rules/rule-builder-draft'
import type {PreprocessCreationDraft} from '../rules/preprocess-version-editor'
import {definitionUuid} from '../rules/device-task-definition-port'
import {dataStreamTransport,type DataStreamItem} from './data-stream-publication-api'
import {typeProfileTransport,type TypeProfile} from './profile-api'
const props=defineProps<{typeId:string;initialName?:string;initialKind?:PreprocessKind|'DATA_RPT';initialFilterJson?:string;initialStreamIdentifier?:string;externalFirstStep?:boolean}>()
const emit=defineEmits<{created:[id:string];close:[];previous:[];busy:[value:boolean];locked:[value:boolean]}>()
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&currentProject.value?.id===projectId.value&&['ACTIVE','ARCHIVED'].includes(currentProject.value.status??'')&&['OWNER','ADMIN'].includes(session.user.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value.myRole||'')&&can('device:read')&&can('rule:manage')&&definitionUuid(props.typeId))
const allowed=computed(()=>readable.value&&currentProject.value?.status==='ACTIVE')
const profile=shallowRef<TypeProfile>(),loading=ref(false),busy=ref(false),builderLocked=ref(false),unknown=ref(false),denied=ref(false),error=ref(''),rejectedAttempt=ref<string>(),turn=ref(0)
const selectedKind=ref<string>()
const pending=shallowRef<{ruleId:string;draft:PreprocessCreationDraft;activation?:TypePreprocessActivationIntent;activationAttempted?:boolean;activationRejected?:boolean}>()
const dataStreams=shallowRef<readonly DataStreamItem[]>([]),dataStreamsError=ref('')
const scopeKey=computed(()=>`${identityEpoch()}:${turn.value}:${projectId.value}:DEVICE_TYPE:${props.typeId}`),origin=computed(()=>({kind:'DEVICE_TYPE' as const,referenceId:props.typeId,name:profile.value?.type.name??''}))
watch(busy,value=>emit('busy',value),{immediate:true});watch([loading,builderLocked,unknown,pending],()=>emit('locked',loading.value||builderLocked.value||unknown.value||!!pending.value),{immediate:true,flush:'sync'})
let alive=true,controller:AbortController|undefined
function reset(){turn.value++;controller?.abort();profile.value=undefined;selectedKind.value=undefined;pending.value=undefined;dataStreams.value=[];dataStreamsError.value='';loading.value=false;busy.value=false;builderLocked.value=false;unknown.value=false;denied.value=false;error.value='';rejectedAttempt.value=undefined}
function capture(){return{turn:turn.value,epoch:identityEpoch(),project:projectId.value,type:props.typeId}}
function current(s:ReturnType<typeof capture>){return alive&&s.turn===turn.value&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.type===props.typeId&&readable.value}
async function load(){
 if(!readable.value||busy.value||unknown.value||pending.value)return
 const s=capture();controller?.abort();controller=new AbortController();loading.value=true;error.value=''
 try{const value=await typeProfileTransport.read(s.project,s.type,controller.signal);if(!current(s))return;if(value.type.id!==s.type||value.type.projectId!==s.project)throw new Error('来源类型与当前项目不符');profile.value=value
  if(props.initialKind==='DATA_RPT'){try{const data=await dataStreamTransport.read(s.project,s.type,controller.signal);if(current(s))dataStreams.value=data.publication?.definition.streams.filter(stream=>!stream.disabled)??[]}catch(cause){if(current(s))dataStreamsError.value=errorMessage(cause)}}
  else{dataStreams.value=[];dataStreamsError.value=''}}
 catch(cause){if(current(s)){error.value=errorMessage(cause);if(cause instanceof ApiError&&[401,403,404].includes(cause.status))denied.value=true}}
 finally{if(current(s))loading.value=false}
}
async function submit(intent:{scopeKey:string;source:{kind:'DEVICE'|'DEVICE_TYPE';referenceId:string};attemptId:string;draft:PreprocessCreationDraft}){
 if(!allowed.value||!profile.value||busy.value||unknown.value||intent.scopeKey!==scopeKey.value||intent.source.kind!=='DEVICE_TYPE'||intent.source.referenceId!==props.typeId)return
 const s=capture();controller?.abort();controller=new AbortController();busy.value=true;error.value=''
 try{const result=await createTypePreprocessor({projectId:s.project,deviceTypeId:s.type,scopeKey:intent.scopeKey},intent.draft,intent.attemptId,()=>current(s),controller.signal);if(current(s)){if(result.facts.kind==='DATA_RPT'){pending.value={ruleId:result.id,draft:intent.draft,activation:makeTypePreprocessActivationIntent({scopeKey:scopeKey.value},result.facts,crypto.randomUUID()),activationAttempted:false};await activateCreated()}else emit('created',result.id)}}
 catch(cause){if(current(s)){error.value=errorMessage(cause);if(knownPreprocessRejection(cause)){builderLocked.value=false;rejectedAttempt.value=intent.attemptId;if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){denied.value=true;profile.value=undefined}}else{unknown.value=true;if(cause instanceof PreprocessOutcomeUnknown&&cause.ruleId)pending.value={ruleId:cause.ruleId,draft:intent.draft};const actual=cause instanceof PreprocessOutcomeUnknown?cause.cause:cause;error.value=errorMessage(actual)}}}
 finally{if(current(s))busy.value=false}
}
async function activateCreated(){
 const original=pending.value;if(!allowed.value||!original?.activation||original.activationAttempted)return
 const s=capture();pending.value={...original,activationAttempted:true};controller?.abort();controller=new AbortController();busy.value=true;error.value=''
 try{await activateTypePreprocessIntent({projectId:s.project,deviceTypeId:s.type,scopeKey:scopeKey.value},original.activation,()=>current(s),controller.signal);if(current(s))emit('created',original.ruleId)}
 catch(cause){if(current(s)){error.value=knownPreprocessRejection(cause)?'规则已创建，但启用未完成。'+errorMessage(cause):errorMessage(cause);if(knownPreprocessRejection(cause)){pending.value={...original,activationAttempted:true,activationRejected:true};unknown.value=false}else unknown.value=true}}finally{if(current(s))busy.value=false}
}
async function recover(){
 if(!readable.value||busy.value||!pending.value)return
 const s=capture(),original=pending.value;controller?.abort();controller=new AbortController();busy.value=true
 try{const scope={projectId:s.project,deviceTypeId:s.type,scopeKey:scopeKey.value};if(original.activation){const value=await readTypePreprocessor(scope,original.ruleId,()=>current(s),controller.signal);confirmTypePreprocessActivation(original.activation,value);if(current(s))emit('created',original.ruleId)}else{const value=await recoverTypePreprocessor(scope,original.ruleId,original.draft,()=>current(s),controller.signal);if(current(s)){if(value.kind==='DATA_RPT'){pending.value={...original,activation:makeTypePreprocessActivationIntent(scope,value,crypto.randomUUID()),activationAttempted:false};unknown.value=false;error.value='规则已创建，尚未尝试启用；可继续完成启用。'}else emit('created',original.ruleId)}}}catch(cause){if(current(s)){unknown.value=true;error.value=errorMessage(cause)}}finally{if(current(s))busy.value=false}
}
watch([()=>props.typeId,()=>projectId.value,()=>session.user?.accountId,readable],()=>{reset();if(readable.value)void load()},{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;reset();dispose()})
</script>
<template><section>
 <AsyncState :forbidden="!readable||denied" :loading="loading" :error="!profile?error:undefined" @retry="load"><template v-if="profile">
  <DeviceRulePreprocessBuilder @denied="denied=true;profile=undefined;error=errorMessage($event)" :scope-key="scopeKey" :initial-name="initialName" :initial-kind="initialKind" :external-first-step="externalFirstStep" :initial-filter-json="initialFilterJson" :initial-stream-identifier="initialStreamIdentifier" :project-id="projectId" :source="origin" :data-streams="dataStreams" :source-device-kind="profile.type.deviceKind" :source-payload-protocol="profile.type.payloadProtocol" :subdevice-address-allowed="profile?.type.deviceKind==='SUB_DEVICE'" :gateway-data-available="profile?.type.deviceKind==='GATEWAY'&&profile.type.payloadProtocol==='STANDARD_GATEWAY'" :data-streams-error="dataStreamsError" :disabled="!allowed||busy||unknown||!!pending" :rejected-attempt="rejectedAttempt" @select-kind="selectedKind=$event" @create-source="submit" @cancel="emit('close')" @previous="emit('previous')" @locked="builderLocked=$event"/>
 </template></AsyncState>
 <el-alert v-if="profile&&error" :title="unknown?'创建结果尚未完整核对，请勿重复创建。'+error:error" type="error" :closable="false"/>
<el-button v-if="unknown&&pending" :disabled="busy||!readable" @click="recover">读取原规则核对</el-button><el-button v-if="pending?.activation&&!pending.activationAttempted" :disabled="busy||!allowed" @click="activateCreated">继续完成启用</el-button><el-button v-if="pending?.activationRejected" :disabled="busy||!readable" @click="emit('created',pending.ruleId)">查看已创建规则</el-button><p v-if="unknown&&!pending">尚未取得规则ID，无法定位创建结果；保留原草稿，不自动重发创建请求。</p>
</section></template>
