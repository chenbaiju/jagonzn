<script setup lang="ts">
import {onScopeDispose,ref,watch} from 'vue'
import {can,projectId} from '../../core/session'
import {ApiError,assertIdentity,identityEpoch,IdentityChanged,onIdentityChange} from '../../core/http'
import {useResource} from '../../core/use-resource'
import AlarmRuleEditor from './AlarmRuleEditor.vue'
import {alarmRuleManagementApi,sameConfiguredAlarmRule,type AlarmRuleConfiguration,type CreateConfiguredAlarmRule} from './alarm-rule-management-api'
import type {AlarmRuleChoiceCategory,AlarmRulePagedEditorChoices} from './alarm-rule-choice-reader'
import type {AlarmRuleEditContext,AlarmRuleEditorChoices} from './alarm-rule-editor-draft'
/** 模型/来源资料必须由宿主当前项目公开读端口提供；本组件不虚构ds_metrics路径或wire DTO。 */
const props=defineProps<{ruleId?:string;deviceTypeId?:string;initialSource?:AlarmRuleConfiguration['source'];initialPropertyKey?:string;loadChoices:(project:string,source:AlarmRuleConfiguration['source'],query:string,signal:AbortSignal)=>Promise<AlarmRuleEditorChoices>;moveChoicePage?:(category:AlarmRuleChoiceCategory,direction:'previous'|'next')=>boolean}>()
const emit=defineEmits<{close:[];saved:[ruleId:string];verified:[ruleId:string,source:AlarmRuleConfiguration['source']];removed:[ruleId:string];state:[value:{busy:boolean;review:boolean}]}>()
const resource=useResource(async signal=>{
 const type=props.deviceTypeId
 const value=await alarmRuleManagementApi.get(projectId.value,props.ruleId!,signal)
 const source=value.configuration.source
 if(type&&(source.kind!=='DEVICE_TYPE'||!source.ids.includes(type)))throw new Error('此规则已不属于当前设备类型，请刷新列表。')
 return value
})
let alive=true,savedSource:AlarmRuleConfiguration['source']|undefined
const choices=ref<AlarmRuleEditorChoices&Partial<Pick<AlarmRulePagedEditorChoices,'pages'>>>(),choicesError=ref<unknown>(),choicesLoading=ref(false)
let choiceSerial=0,choiceController:AbortController|undefined,source:AlarmRuleConfiguration['source']={kind:'DEVICE',ids:[]},query='',savedId=''
function clearChoices(){choiceSerial++;choiceController?.abort();choiceController=undefined;choices.value=undefined;choicesError.value=undefined;choicesLoading.value=false;savedId='';savedSource=undefined}
async function read(){resource.clear();clearChoices();if(projectId.value&&props.ruleId&&can('alarm:manage'))await resource.reload()}
async function load(next=source,search=query){
 clearChoices();source={kind:next.kind,ids:[...next.ids]};query=search
 if(!projectId.value||!can('alarm:manage'))return
 const controller=new AbortController();choiceController=controller;const serial=++choiceSerial,project=projectId.value,epoch=identityEpoch(),requested={kind:source.kind,ids:[...source.ids]};choicesLoading.value=true
 try{const value=await props.loadChoices(project,requested,query,controller.signal);assertIdentity(epoch);if(serial!==choiceSerial||controller.signal.aborted||project!==projectId.value||!can('alarm:manage'))return;if(value.projectId!==project||value.source.kind!==requested.kind||value.source.ids.join(',')!==requested.ids.join(','))throw new Error('设备源资料身份已改变');choices.value=value}
 catch(cause){if(serial!==choiceSerial||controller.signal.aborted||cause instanceof IdentityChanged)return;choicesError.value=cause;if(cause instanceof ApiError&&[401,403,404].includes(cause.status))emit('close')}
 finally{if(serial===choiceSerial)choicesLoading.value=false}
}
watch([projectId,()=>props.ruleId,()=>can('alarm:manage')],(value,previous)=>{resource.clear();clearChoices();if(previous?.length&&(value[0]!==previous[0]||value[1]!==previous[1]||!value[2]))return;if(value[2])void read()},{immediate:true})
watch(resource.error,value=>{if(value){resource.data.value=undefined;if(value instanceof ApiError&&[401,403,404].includes(value.status))emit('close')}})
const dispose=onIdentityChange(clearChoices);onScopeDispose(()=>{alive=false;resource.clear();clearChoices();dispose()})
function allowed(c:AlarmRuleEditContext){assertIdentity(c.identityEpoch);if(!alive||!can('alarm:manage')||c.projectId!==projectId.value||c.ruleId!==props.ruleId)throw new IdentityChanged();if(c.ruleId&&(!resource.data.value||c.version!==resource.data.value.version))throw new ApiError('规则已变更',409)}
async function save(c:AlarmRuleEditContext,value:CreateConfiguredAlarmRule){
 allowed(c)
 if(c.ruleId&&resource.data.value?.configuration.source.kind!==value.configuration.source.kind)throw new ApiError('设备源类型不支持修改',400)
 const saved=c.ruleId?await alarmRuleManagementApi.update(c.projectId,c.ruleId,{...value,version:c.version!}):await alarmRuleManagementApi.create(c.projectId,value)
 allowed(c)
 try{const fresh=await alarmRuleManagementApi.get(c.projectId,saved.id);allowed(c);if(!sameConfiguredAlarmRule(saved,fresh))throw new ApiError('规则已再次变更',409);savedId=fresh.id;savedSource={kind:fresh.configuration.source.kind,ids:[...fresh.configuration.source.ids]}}
 catch(cause){if(cause instanceof IdentityChanged||cause instanceof ApiError&&[401,403,404,409].includes(cause.status))throw cause;throw new ApiError('规则保存后读取失败，请核对结果',0,undefined,undefined,true)}
}
async function remove(c:AlarmRuleEditContext){
 allowed(c);if(!c.ruleId)throw new ApiError('规则身份不完整',400)
 await alarmRuleManagementApi.remove(c.projectId,c.ruleId,{version:c.version!});allowed(c)
 try{await alarmRuleManagementApi.get(c.projectId,c.ruleId);throw new ApiError('移除后规则仍可读取，请核对结果',0,undefined,undefined,true)}
 catch(cause){allowed(c);if(cause instanceof ApiError&&cause.status===404)return;throw cause}
}
function saved(){if(savedId&&savedSource){emit('verified',savedId,savedSource);emit('saved',savedId)}}
function pageChoices(category:AlarmRuleChoiceCategory,direction:'previous'|'next'){if(!choicesLoading.value&&props.moveChoicePage?.(category,direction))void load()}
function retry(configuration:boolean){if(!configuration&&choicesError.value&&!resource.error.value)void load();else void read()}
</script>
<template><AlarmRuleEditor :project-id="projectId" :rule-id="ruleId" :initial-source="initialSource" :initial-property-key="initialPropertyKey" :can-manage="can('alarm:manage')" :initial="resource.data.value" :loading="resource.loading.value" :error="resource.error.value" :choices="choices" :choice-pages="choices?.pages" :choices-loading="choicesLoading" :choices-error="choicesError" :save="save" :remove="ruleId?remove:undefined" @source-changed="load($event,'')" @search-sources="load(source,$event)" @page-choices="pageChoices" @retry="retry" @close="emit('close')" @saved="saved" @state="emit('state',$event)" @removed="ruleId&&emit('removed',ruleId)" /></template>
