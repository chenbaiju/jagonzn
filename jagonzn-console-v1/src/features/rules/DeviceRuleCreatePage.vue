<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate,useRoute,useRouter} from 'vue-router'
import {can,projectId} from '@/core/session'
import {useResource} from '@/core/use-resource'
import {onIdentityChange,errorMessage,type ApiError} from '@/core/http'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {devicesApi} from '@/features/devices/api'
import {definitionUuid} from './device-task-definition-port'
import DevicePreprocessCreateFlow from './DevicePreprocessCreateFlow.vue'
import DeviceDataCreateFlow from './DeviceDataCreateFlow.vue'
import TypePreprocessCreate from '../device-types/TypePreprocessCreate.vue'
import RuleDataStreamIdentifier from './RuleDataStreamIdentifier.vue'
import SourcePreprocessCreateFlow from './SourcePreprocessCreateFlow.vue'
import {sourceSelectionInput,sourceSelectionKey,sourceIds,singleSource,type RuleSourceInput} from './rule-source-selection'
import RuleTriggerSelector from './RuleTriggerSelector.vue'
import RuleSourcePicker from './RuleSourcePicker.vue'
import RuleConditionGroupEditor from './RuleConditionGroupEditor.vue'
import {preprocessConditionJson} from './preprocess-version-editor'
import MessageRuleActionCreateFlow from './MessageRuleActionCreateFlow.vue'
import {newConditionGroup,ruleKinds,type RuleKind,type PreprocessKind} from './rule-builder-draft'
type Source=RuleSourceInput
type OperationsSeed={source:Source;kind:RuleKind;name:string;filterJson:string;streamIdentifier:string;eventIdentifier:string}
const route=useRoute(),router=useRouter(),busy=ref(false),locked=ref(false)
const confirmedReturn=ref<string>()
const device=computed(()=>route.query.source==='device'&&route.query.deviceTypeId===undefined&&typeof route.query.deviceId==='string'&&definitionUuid(route.query.deviceId)?route.query.deviceId:'')
const deviceType=computed(()=>route.query.source==='device-type'&&route.query.deviceId===undefined&&typeof route.query.deviceTypeId==='string'&&definitionUuid(route.query.deviceTypeId)?route.query.deviceTypeId:'')
const globalEntry=computed(()=>route.query.source===undefined&&route.query.deviceId===undefined&&route.query.deviceTypeId===undefined)
const validEntry=computed(()=>globalEntry.value||!!device.value||!!deviceType.value)
const firstStep=ref(true),ruleName=ref(''),ruleKind=ref<RuleKind>(),firstError=ref(''),sourceDenied=ref(false)
const selectedSource=shallowRef<Source>(),operations=shallowRef<OperationsSeed>(),firstFilter=ref(newConditionGroup()),firstStreamIdentifier=ref(''),firstEventIdentifier=ref('')
const selectedSet=computed(()=>selectedSource.value?sourceSelectionInput(selectedSource.value):undefined)
const selectedKey=computed(()=>selectedSet.value?sourceSelectionKey(selectedSet.value):'')
const withConditions=computed(()=>ruleKind.value==='ATTRS_RPT'||ruleKind.value==='ATTRS_RPT_PREPROC')
watch([selectedKey,ruleKind],()=>{firstFilter.value=newConditionGroup();firstStreamIdentifier.value='';firstEventIdentifier.value=''})
const operationsKey=computed(()=>operations.value?`${sourceSelectionKey(sourceSelectionInput(operations.value.source))}:${operations.value.kind}${operations.value.kind==='DATA_RPT'?':'+operations.value.streamIdentifier:operations.value.kind==='EVENT_RPT'?':'+operations.value.eventIdentifier:''}`:'')
const preprocessKind=computed(()=>operations.value?.kind==='ATTRS_RPT_PREPROC'||operations.value?.kind==='ATTRS_PUSH_PREPROC'?operations.value.kind:undefined)
const typeBuilderKind=computed<PreprocessKind|'DATA_RPT'|undefined>(()=>preprocessKind.value??(operations.value?.kind==='DATA_RPT'?'DATA_RPT':undefined))
const actionKind=computed(()=>(operations.value?.kind==='ATTRS_RPT'||operations.value?.kind==='ATTRS_PUSH'||operations.value?.kind==='EVENT_RPT'||operations.value?.kind==='DATA_RPT')?operations.value.kind:undefined)
const allowed=computed(()=>!!projectId.value&&can('rule:manage'))
const returnPath=computed(()=>globalEntry.value?'/rules/messages':deviceType.value?`/device-types/${deviceType.value}?tab=rules`:device.value?`/devices/${device.value}?tab=rules`:'/rules/messages')
const resource=useResource(async signal=>{
 const project=projectId.value,id=device.value||deviceType.value,kind=device.value?'DEVICE' as const:'DEVICE_TYPE' as const
 const value=await(kind==='DEVICE'?devicesApi.read(project,id,signal):devicesApi.type(project,id,signal))
 // 来源所属项目由带项目路径的读取端口核定；仅在正式响应确有projectId字段时做额外一致性检查。
 if(!value||value.id!==id||('projectId' in value&&value.projectId!==project)||typeof value.name!=='string'||!value.name.trim())throw new Error('来源读取不匹配，请从设备或类型详情重新进入')
 return {kind,referenceId:id,name:value.name} satisfies Source
})
watch(resource.data,value=>{if(value)selectedSource.value=value})
function reset(){resource.clear();firstStreamIdentifier.value='';firstEventIdentifier.value='';busy.value=false;locked.value=false;firstStep.value=true;ruleName.value='';ruleKind.value=undefined;selectedSource.value=undefined;operations.value=undefined;firstError.value='';sourceDenied.value=false;firstFilter.value=newConditionGroup()}
watch([projectId,device,deviceType,globalEntry,allowed],()=>{reset();if((device.value||deviceType.value)&&allowed.value)void resource.reload()},{immediate:true})
const dispose=onIdentityChange(reset);onScopeDispose(dispose)
function denied(cause:ApiError,uncertain:boolean){sourceDenied.value=true;selectedSource.value=undefined;ruleName.value='';ruleKind.value=undefined;operations.value=undefined;firstStep.value=true;firstStreamIdentifier.value='';firstEventIdentifier.value='';resource.clear();resource.error.value=cause;busy.value=false;locked.value=uncertain}
function retry(){if(!busy.value&&!locked.value&&(device.value||deviceType.value))void resource.reload()}
function back(){if(!busy.value&&!locked.value)void router.push(returnPath.value)}
/** 子流程只有完整权威回读后才允许一次返回；修改来源时进入实际新规则，避免返回不包含该规则的旧关联列表。 */
async function created(id:string){
 const source=operations.value?.source
 if(!allowed.value||!definitionUuid(id)||!source)return
 const members=sourceIds(sourceSelectionInput(source)),sameOrigin=device.value&&source.kind==='DEVICE'&&members.includes(device.value)||deviceType.value&&source.kind==='DEVICE_TYPE'&&members.includes(deviceType.value)
 const destination=globalEntry.value||sameOrigin?returnPath.value:router.resolve({path:`/rules/messages/${id}`,query:{origin:'directory',...(source.kind==='DEVICE_TYPE'?{source:'device-type',deviceTypeId:singleSource(sourceSelectionInput(source)).referenceId}:{})}}).fullPath
 confirmedReturn.value=destination
 try{await router.replace(destination)}finally{confirmedReturn.value=undefined}
}
function next(){
 if(!allowed.value||busy.value||locked.value)return
 firstError.value=''
 if(!ruleName.value.trim()||ruleName.value.trim().length>128){firstError.value='请输入规则名称（最多128字）';return}
 if(!ruleKind.value||!ruleKinds.includes(ruleKind.value)){firstError.value='请选择规则类型';return}
 if(!selectedSource.value){firstError.value='请选择设备来源';return}
 try{sourceIds(sourceSelectionInput(selectedSource.value))}catch(cause){firstError.value=cause instanceof Error?cause.message:'请选择设备来源';return}
 if(ruleKind.value==='EVENT_RPT'&&(!firstEventIdentifier.value.trim()||firstEventIdentifier.value.trim().length>128||/[\u0000-\u001f\u007f-\u009f]/.test(firstEventIdentifier.value))){firstError.value='请输入事件标识符（1至128字）';return}
 if(ruleKind.value==='DATA_RPT'&&!/^[A-Za-z0-9_-]{1,64}$/.test(firstStreamIdentifier.value)){firstError.value='请输入自定义数据流标识符（1至64位字母、数字、下划线或横线）';return}
 // 名称变化只更新当前草稿，来源或触发变化才通过稳定key重建对应编辑器。
 try{const filterJson=preprocessConditionJson(withConditions.value?firstFilter.value:newConditionGroup());operations.value={source:{...selectedSource.value},kind:ruleKind.value,name:ruleName.value.trim(),filterJson,streamIdentifier:ruleKind.value==='DATA_RPT'?firstStreamIdentifier.value:'',eventIdentifier:ruleKind.value==='EVENT_RPT'?firstEventIdentifier.value.trim():''};firstStep.value=false}catch(cause){firstError.value=cause instanceof Error?cause.message:'请修正属性条件设置'}
}
function previous(){if(!busy.value&&!locked.value){firstStep.value=true;firstError.value=''}}
function allowNavigation(destination:string){return !busy.value&&!locked.value||confirmedReturn.value===destination}
onBeforeRouteLeave(to=>allowNavigation(to.fullPath))
onBeforeRouteUpdate(to=>allowNavigation(to.fullPath))
function beforeUnload(event:BeforeUnloadEvent){if(busy.value||locked.value){event.preventDefault();event.returnValue=''}}
window.addEventListener('beforeunload',beforeUnload)
onScopeDispose(()=>window.removeEventListener('beforeunload',beforeUnload))
</script>
<template><main class="tl-page device-rule-create-page">
 <PageHeader title="创建规则" back :back-disabled="busy||locked" @back="back"/>
 <el-alert v-if="!validEntry" title="创建入口参数无效，请从设备或类型详情进入。" type="error" :closable="false"/>
 <AsyncState v-else :forbidden="!allowed||sourceDenied" :loading="resource.loading.value" :error="resource.error.value" @retry="retry">
  <el-form v-show="firstStep" class="global-rule-first-step" label-position="top" :disabled="busy||locked" @submit.prevent="next">
   <el-form-item label="规则名称" class="rule-name"><el-input v-model="ruleName" aria-label="规则名称" maxlength="128"/></el-form-item>
   <h2>设置规则类型</h2><p class="section-help">消息规则是一种由设备消息触发自动化操作的智能机制，您可以选择不同类型的规则，从而实现从数据自动处理到设备联动控制的各种自动化需求。 <a href="https://www.thingscloud.xyz/docs/guide/rules/overview.html" target="_blank" rel="noopener noreferrer">了解详情 <ReferenceIcon glyph="󰏌" /></a></p>
   <el-form-item label="规则类型" class="rule-kind"><RuleTriggerSelector v-model="ruleKind" :disabled="busy||locked"/></el-form-item>
   <h2>设置设备来源</h2><p class="section-help">设置将规则应用在哪些设备上。可以指定单个或多个设备，也可以指定设备类型，后者将对该类型下的所有设备生效。</p>
   <template v-if="device||deviceType"><el-form-item :label="deviceType?'来源设备类型':'来源设备'"><el-input :model-value="(selectedSet?.members.map(m=>m.name).join('、')||'')" :aria-label="deviceType?'来源设备类型':'来源设备'" readonly/></el-form-item></template>
   <RuleSourcePicker v-else v-model="selectedSource" :disabled="busy||locked" @busy="busy=$event" @denied="denied($event,false)"/>
   <el-form-item v-if="ruleKind==='DATA_RPT'" label="自定义数据流标识符" class="data-identifier"><RuleDataStreamIdentifier v-model="firstStreamIdentifier" :source="selectedSet" :disabled="busy||locked"/></el-form-item>
   <el-form-item v-if="ruleKind==='EVENT_RPT'" label="事件标识符" class="data-identifier"><el-input v-model="firstEventIdentifier" aria-label="事件标识符" maxlength="128" :disabled="busy||locked"/></el-form-item>
   <section v-if="withConditions" class="first-step-conditions"><h2>属性条件设置</h2><RuleConditionGroupEditor v-model="firstFilter" :disabled="busy||locked" :number-text-limit="1024"/></section>
   <el-alert v-if="firstError" :title="firstError" type="warning" :closable="false"/>
   <footer class="first-step-actions"><el-button type="primary" :disabled="busy||locked" @click="next">下一步</el-button></footer>
  </el-form>
  <section v-if="operations" v-show="!firstStep" class="global-rule-operations" :class="{ 'message-action-operations': actionKind&&actionKind!=='DATA_RPT' }">
   <DeviceDataCreateFlow v-if="operations.kind==='DATA_RPT'&&operations.source.kind==='DEVICE'" :key="operationsKey" :source="sourceSelectionInput(operations.source)" :initial-name="operations.name" :initial-stream-identifier="operations.streamIdentifier" @close="back" @previous="previous" @created="created" @busy="busy=$event" @locked="locked=$event" @denied="denied"/>
   <MessageRuleActionCreateFlow v-else-if="actionKind&&actionKind!=='DATA_RPT'" :key="operationsKey" :source="operations.source" :name="operations.name" :kind="actionKind" :filter-json="operations.filterJson" :initial-stream-identifier="actionKind==='DATA_RPT'?operations.streamIdentifier:undefined" :initial-event-identifier="actionKind==='EVENT_RPT'?operations.eventIdentifier:undefined" @previous="previous" @created="created" @busy="busy=$event" @locked="locked=$event"/>
   <TypePreprocessCreate v-else-if="operations.source.kind==='DEVICE_TYPE'&&typeBuilderKind" :key="operationsKey" :type-id="singleSource(sourceSelectionInput(operations.source)).referenceId" :initial-name="operations.name" :initial-kind="typeBuilderKind" :initial-filter-json="operations.filterJson" :initial-stream-identifier="typeBuilderKind==='DATA_RPT'?operations.streamIdentifier:undefined" external-first-step @close="back" @previous="previous" @created="created" @busy="busy=$event" @locked="locked=$event"/>
   <SourcePreprocessCreateFlow v-else-if="preprocessKind&&sourceIds(sourceSelectionInput(operations.source)).length>1" :key="operationsKey" :source="sourceSelectionInput(operations.source)" :initial-name="operations.name" :initial-kind="preprocessKind" :initial-filter-json="operations.filterJson" @close="back" @previous="previous" @created="created" @busy="busy=$event" @locked="locked=$event" @denied="denied"/>
   <DevicePreprocessCreateFlow v-else-if="preprocessKind" :key="operationsKey" :device-id="singleSource(sourceSelectionInput(operations.source)).referenceId" :device-name="singleSource(sourceSelectionInput(operations.source)).name" :initial-name="operations.name" :initial-kind="preprocessKind" :initial-filter-json="operations.filterJson" external-first-step @close="back" @previous="previous" @created="created" @busy="busy=$event" @locked="locked=$event" @denied="denied"/>
  </section>
 </AsyncState>
</main></template>
<style scoped>
.create-panel,.global-rule-operations { max-width: 760px; }
.message-action-operations { max-width: none; }
.device-rule-create-page { min-width: 0; padding: 20px 30px 50px; }
.device-rule-create-page :deep(.tl-page-header) { min-height: 24px; margin-bottom: 24px; }
.device-rule-create-page :deep(.tl-page-header h1.is-secondary) { color: var(--tl-title); }
.device-rule-create-page :deep(.tl-back) { font-weight: 500; }
.global-rule-first-step .rule-name { width: 350px; max-width: 100%; margin-bottom: 42px; }
.global-rule-first-step h2 { margin: 0 0 10px; padding: 10px 0 0; font-size: 20px; line-height: 22px; color: #002822; font-weight: 400; }
.section-help { margin: 0 0 26px; font-size: 14px; line-height: 20px; color: #666; }
.section-help a { display: inline-flex; align-items: center; gap: 4px; color: #1e88e5; font-weight: 500; }
.section-help a:hover { color: #51bbff; }
.section-help .reference-icon { font-size: 14px; }
.rule-kind { margin-bottom: 52px; }
.rule-kind :deep(.el-form-item__content) { display: block; }
.global-rule-first-step :deep(.rule-trigger-grid) { grid-template-columns: repeat(6,minmax(0,1fr)); gap: 10px; }
.global-rule-first-step :deep(.rule-trigger-grid button) { height: 120px; min-height: 120px; padding: 20px; gap: 0; border-radius: 4px; background: #fff; }
.global-rule-first-step :deep(.rule-trigger-grid button.selected) { background: #fff; border-color: #1e88e5; }
.global-rule-first-step :deep(.rule-trigger-grid button:hover) { box-shadow: 0 2px 12px 0 rgb(0 0 0 / 10%); }
.global-rule-first-step :deep(.rule-trigger-grid strong) { font-size: 16px; line-height: 30px; font-weight: 500; }
.global-rule-first-step :deep(.rule-trigger-grid span) { font-size: 14px; line-height: 22px; font-weight: 400; color: #999; }
.data-identifier { width: 350px; max-width: 100%; }
.data-identifier :deep(.el-select) { width: 100%; }
.data-identifier p { font-size: 13px; color: #888; line-height: 18px; margin: 8px 0 0; }
.first-step-conditions { margin-top: 30px; max-width: 900px; }
.first-step-actions { margin-top: 30px; }
.global-rule-first-step :deep(.el-form-item--label-top .el-form-item__label) { font-weight: 600; font-size: 14px; color: var(--tl-text); line-height: 22px; margin-bottom: 6px; }
.global-rule-first-step :deep(.el-radio__label) { font-size: 14px; font-weight: 500; }
.global-rule-first-step :deep(.el-input__wrapper) { min-height: 40px; }
.global-rule-first-step .el-alert { margin-top: 16px; }
@media(max-width:1919px){.global-rule-first-step :deep(.rule-trigger-grid){grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:1199px){.global-rule-first-step :deep(.rule-trigger-grid){grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:991px){.global-rule-first-step :deep(.rule-trigger-grid){grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:767px){.device-rule-create-page{padding:25px 15px}.global-rule-first-step :deep(.rule-trigger-grid){grid-template-columns:1fr}}
</style>
