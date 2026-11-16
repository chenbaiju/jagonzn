<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {can,projectId} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import RuleActionsEditor,{type ActionDraft} from './RuleActionsEditor.vue'
import RuleTagsEditor from './RuleTagsEditor.vue'
import {ruleTagsValue,type RuleTagDraft} from './rule-tag-draft'
import RuleConditionGroupEditor from './RuleConditionGroupEditor.vue'
import {sourceSelectionKey,sourceSelectionInput} from './rule-source-selection'
import {newConditionGroup} from './rule-builder-draft'
import {preprocessConditionJson} from './preprocess-version-editor'
import {contentBody,confirmRuleContent,readRuleContentTags,confirmRuleContentTags,readMessageActionCatalog,readRuleContent,writeRuleContent,type ActionKind,type ActionSource,type RuleContentDraft,type RuleContentSnapshot} from './message-rule-content-api'
const props=defineProps<{source:ActionSource;name:string;kind:ActionKind;filterJson?:string;initialStreamIdentifier?:string;initialEventIdentifier?:string}>()
const emit=defineEmits<{created:[id:string];previous:[];busy:[value:boolean];locked:[value:boolean]}>()
const allowed=computed(()=>!!projectId.value&&can('rule:manage')),actions=ref<ActionDraft[]>([]),identifier=ref(''),description=ref(''),filter=ref(newConditionGroup()),editor=ref<InstanceType<typeof RuleActionsEditor>>()
const tagRows=ref<RuleTagDraft[]>([]),operationLocked=ref(false)
const saving=ref(false),unknown=ref(false),unavailable=ref(false),error=ref(''),pending=shallowRef<{draft:RuleContentDraft;result?:RuleContentSnapshot}>()
const resource=useResource(signal=>readMessageActionCatalog(projectId.value,props.kind,signal))
let alive=true,generation=0
function reset(){generation++;tagRows.value=[];actions.value=[];identifier.value=props.kind==='DATA_RPT'?props.initialStreamIdentifier??'':props.kind==='EVENT_RPT'?props.initialEventIdentifier??'':'';description.value='';filter.value=newConditionGroup();saving.value=false;operationLocked.value=false;unknown.value=false;unavailable.value=false;error.value='';pending.value=undefined;resource.clear()}
/** 真实失权后清除私有草稿并封闭本次创建，不把回读404解释成写入失败。 */
function denyAuthority(cause:unknown,uncertain=false){
 if(!(cause instanceof ApiError)||![401,403,404].includes(cause.status))return false
 generation++;tagRows.value=[];actions.value=[];identifier.value='';description.value='';filter.value=newConditionGroup();saving.value=false;operationLocked.value=false;unknown.value=false;pending.value=undefined;resource.clear();unavailable.value=true;error.value=(uncertain?'原写未确认，请勿重复创建。':'')+errorMessage(cause);return true
}
watch(resource.error,cause=>{denyAuthority(cause)})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;dispose()})
watch([projectId,()=>sourceSelectionKey(sourceSelectionInput(props.source)),()=>props.kind,allowed],()=>{reset();if(allowed.value)void resource.reload()},{immediate:true})
watch(saving,value=>emit('busy',value),{immediate:true,flush:'sync'});watch([saving,unknown,operationLocked],()=>emit('locked',saving.value||unknown.value||operationLocked.value),{immediate:true,flush:'sync'})
async function submit(){
 if(!allowed.value||unavailable.value||saving.value||unknown.value||!resource.data.value)return
 try{if(!editor.value?.valid())throw new Error('请修正操作中的数值');const draft:RuleContentDraft={name:props.name,description:description.value,source:{...props.source},kind:props.kind,identifier:identifier.value,filterJson:props.filterJson??preprocessConditionJson(filter.value),actions:actions.value,tags:ruleTagsValue(tagRows.value)},body=contentBody(draft);const project=projectId.value,turn=generation,epoch=identityEpoch(),current=()=>alive&&turn===generation&&epoch===identityEpoch()&&project===projectId.value&&allowed.value;pending.value={draft};saving.value=true;error.value=''
  try{const result=await writeRuleContent(project,body,undefined,current);if(!current())return;pending.value={draft,result};confirmRuleContent(draft,result);const fresh=await readRuleContent(project,result.id);if(!current())return;confirmRuleContent(draft,fresh);const savedTags=await readRuleContentTags(project,fresh.id,fresh.definitionVersion);if(!current())return;confirmRuleContentTags(draft.tags??{},savedTags);if(fresh.versionId!==result.versionId||fresh.definitionVersion!==result.definitionVersion)throw new Error('规则创建后的版本已变化，请先核对');pending.value=undefined;emit('created',fresh.id)}catch(cause){if(current()){error.value=errorMessage(cause);unknown.value=!!pending.value?.result||!(cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[400,401,403,404,409,422].includes(cause.status));if(!unknown.value)pending.value=undefined;denyAuthority(cause,unknown.value)}}finally{if(current())saving.value=false}
 }catch(cause){error.value=errorMessage(cause)}
}
/** 仅真正返回第一步时清空操作，保留同一来源/类型的描述和标签。 */
function previous(){if(!allowed.value||unavailable.value||saving.value||unknown.value||operationLocked.value)return;actions.value=[];error.value='';emit('previous')}
async function recover(){const original=pending.value;if(!original?.result||saving.value||!allowed.value||unavailable.value)return;const project=projectId.value,turn=generation,epoch=identityEpoch();saving.value=true
 try{const fresh=await readRuleContent(project,original.result.id);if(!alive||turn!==generation||epoch!==identityEpoch()||project!==projectId.value)return;confirmRuleContent(original.draft,fresh);const savedTags=await readRuleContentTags(project,fresh.id,fresh.definitionVersion);if(!alive||turn!==generation||epoch!==identityEpoch()||project!==projectId.value)return;confirmRuleContentTags(original.draft.tags??{},savedTags);if(fresh.versionId!==original.result.versionId||fresh.definitionVersion!==original.result.definitionVersion)throw new Error('当前规则未确认原创建版本');unknown.value=false;emit('created',fresh.id)}catch(cause){if(alive&&turn===generation){error.value=errorMessage(cause);denyAuthority(cause,true)}}finally{if(alive&&turn===generation)saving.value=false}}
</script>
<template><section class="message-action-create"><el-alert v-if="unavailable&&error" :title="error" type="error" :closable="false"/><AsyncState :forbidden="!allowed||unavailable" :loading="resource.loading.value" :error="resource.error.value" @retry="resource.reload"><template v-if="resource.data.value">
 <el-form label-position="top" :disabled="saving||unknown"><el-form-item v-if="kind==='EVENT_RPT'&&initialEventIdentifier===undefined||kind==='DATA_RPT'&&initialStreamIdentifier===undefined" :label="kind==='EVENT_RPT'?'事件标识符':'数据流标识符'"><el-input v-model="identifier" :aria-label="kind==='EVENT_RPT'?'事件标识符':'数据流标识符'" maxlength="128"/></el-form-item><RuleConditionGroupEditor v-if="kind==='ATTRS_RPT'&&filterJson===undefined" v-model="filter" :disabled="saving||unknown"/><h3>操作</h3><p class="operation-help">操作是当规则条件触发后执行的活动，一个规则可以设置多种操作。 <a href="https://www.thingscloud.xyz/docs/guide/tasks/attrs-push.html" target="_blank" rel="noopener noreferrer">了解详情 <ReferenceIcon glyph="󰏌"/></a></p><RuleActionsEditor ref="editor" v-model="actions" :catalog="resource.data.value" :trigger-kind="kind" :device-source="source" :disabled="saving||unknown" @locked="operationLocked=$event" @authority-denied="denyAuthority($event,unknown)"/><h3 class="other-settings">其它设置</h3><el-form-item label="规则描述" class="description"><el-input v-model="description" type="textarea" :rows="5" maxlength="512" aria-label="规则描述"/></el-form-item><RuleTagsEditor v-model="tagRows" :disabled="saving||unknown"/></el-form>
 <el-alert v-if="error" :title="unknown?'创建结果尚未完整核对，请勿重复创建。'+error:error" type="error" :closable="false"/><el-button v-if="unknown&&pending?.result" :disabled="saving" @click="recover">读取原规则核对</el-button><p v-if="unknown&&!pending?.result" role="status">未取得可核对的规则标识，保留原草稿，不自动重发。</p>
 <footer><el-button :disabled="saving||unknown||operationLocked" @click="previous">上一步</el-button><el-button type="primary" :loading="saving" :disabled="!allowed||unknown" @click="submit">创建</el-button></footer>
 </template></AsyncState></section></template>
<style scoped>
.message-action-create { min-width: 0; }
.message-action-create h3 { margin: 0 0 10px; font-size: 20px; line-height: 24px; font-weight: 400; color: #002822; }
.message-action-create h3.other-settings { margin-top: 48px; }
.operation-help { margin: 0 0 22px; font-size: 14px; line-height: 20px; color: #666; }
.operation-help a { margin-left: 6px; color: #1e88e5; }
.operation-help .reference-icon { font-size: 14px; }
.description { width: 350px; max-width: 100%; }
.message-action-create footer { display: flex; gap: 10px; margin-top: 50px; }
.message-action-create footer .el-button+.el-button { margin-left: 0; }
</style>
