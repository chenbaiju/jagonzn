<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import type {ApiError} from '@/core/http'
import RuleTriggerSelector from './RuleTriggerSelector.vue'
import RuleConditionGroupEditor from './RuleConditionGroupEditor.vue'
import RulePreprocessFunctionsEditor from './RulePreprocessFunctionsEditor.vue'
import RulePreprocessConditions from './RulePreprocessConditions.vue'
import {loadPreprocessVersion,makeRevisionIntent,confirmRevision,seedMatchesScope,revisionDraftChanged,type PreprocessVersionSeed,type LoadedPreprocessVersion,type PreprocessEditDraft,type PreprocessRevisionIntent} from './preprocess-version-editor'
import type {PropertyOperationCommand} from './property-operations-draft'
import type {PreprocessKind,RuleKind} from './rule-builder-draft'
type Resolution={type:'known-rejected';attemptId:string}|{type:'confirmed';attemptId:string;seed:PreprocessVersionSeed}
/** scopeKey必须含当前身份/项目读取代次。此组件只消费领域种子及回执，不调用HTTP。 */
const props=defineProps<{scopeKey:string;projectId?:string;deviceId:string;deviceName:string;ruleId:string;canRead:boolean;canRevise:boolean;hideActions?:boolean;seed?:PreprocessVersionSeed;resolution?:Resolution;detail?:boolean;filterOnly?:boolean;command?:PropertyOperationCommand;requestError?:string;recoveryPending?:boolean;recovering?:boolean}>()
const emit=defineEmits<{submit:[intent:PreprocessRevisionIntent];cancel:[];recover:[];denied:[cause:ApiError];locked:[value:boolean];saved:[seed:Readonly<PreprocessVersionSeed>];dirty:[value:boolean]}>()
const kinds:readonly PreprocessKind[]=['ATTRS_RPT_PREPROC','ATTRS_PUSH_PREPROC']
const loaded=ref<LoadedPreprocessVersion>(),form=ref<PreprocessEditDraft>(),pendingSeed=ref<PreprocessVersionSeed>(),pendingIntent=ref<PreprocessRevisionIntent>()
const attempt=ref<string>(),error=ref(''),invalidSeed=ref(false),notice=ref(''),sourceEditing=ref(false),functionsOpen=ref(true)
const scope=()=>({scopeKey:props.scopeKey,deviceId:props.deviceId,ruleId:props.ruleId})
const editorDisabled=computed(()=>!props.canRead||!props.canRevise||!props.deviceName.trim()||!!attempt.value||!loaded.value||invalidSeed.value||!!pendingSeed.value)
const blocked=computed(()=>editorDisabled.value||sourceEditing.value)
const dirty=computed(()=>{
 if(!loaded.value||!form.value)return false
 try{return revisionDraftChanged(loaded.value,form.value)}catch{return true}
})
const source=computed(()=>loaded.value?.seed.deviceSourceIds?{kind:'DEVICE' as const,referenceId:null,referenceIds:[...loaded.value.seed.deviceSourceIds]}:{kind:'DEVICE' as const,referenceId:loaded.value?.seed.deviceSourceId??''})
const counterExhausted=computed(()=>!!loaded.value&&(loaded.value.seed.definitionVersion==='9223372036854775807'||loaded.value.seed.versionNumber==='9223372036854775807'))
watch([attempt,sourceEditing],()=>emit('locked',!!attempt.value||sourceEditing.value),{immediate:true,flush:'sync'})
watch(dirty,value=>emit('dirty',value),{immediate:true})
function clearPrivate(){functionsOpen.value=false;sourceEditing.value=false;loaded.value=undefined;form.value=undefined;pendingSeed.value=undefined;pendingIntent.value=undefined;error.value='';notice.value='';invalidSeed.value=false}
function install(value:LoadedPreprocessVersion){functionsOpen.value=true;sourceEditing.value=false;loaded.value=value;form.value=value.draft;pendingSeed.value=undefined;invalidSeed.value=false;error.value='';notice.value=''}
function receive(seed:PreprocessVersionSeed|undefined){
 if(!props.canRead||!seed||!seedMatchesScope(seed,scope()))return
 try{
  const incoming=loadPreprocessVersion(seed,scope()),current=loaded.value
  if(!current){if(!attempt.value)install(incoming);return}
  if(BigInt(incoming.seed.definitionVersion)<BigInt(current.seed.definitionVersion)||BigInt(incoming.seed.versionNumber)<BigInt(current.seed.versionNumber))return
  if(incoming.seed.definitionVersion===current.seed.definitionVersion&&(incoming.seed.versionId!==current.seed.versionId||incoming.seed.versionNumber!==current.seed.versionNumber)||incoming.seed.versionNumber===current.seed.versionNumber&&incoming.seed.versionId!==current.seed.versionId)throw new Error('定义与脚本版本基线不一致，请重新读取')
  if(incoming.seed.versionId===current.seed.versionId&&incoming.seed.definitionVersion===current.seed.definitionVersion){
   if(incoming.signature!==current.signature||incoming.seed.status!==current.seed.status||incoming.seed.activeVersionId!==current.seed.activeVersionId)throw new Error('同一版本基线内容发生变化，请重新读取')
   if(invalidSeed.value){invalidSeed.value=false;error.value=''}
   return
  }
  pendingSeed.value=seed;notice.value='已读取更新的定义或版本，请载入后再保存。'
 }catch(cause){invalidSeed.value=true;error.value=cause instanceof Error?cause.message:'完整版本无法读取'}
}
watch([()=>props.scopeKey,()=>props.deviceId,()=>props.ruleId],()=>{clearPrivate();attempt.value=undefined;receive(props.seed)})
watch(()=>props.canRead,value=>{if(!value)clearPrivate();else receive(props.seed)})
watch(()=>props.seed,value=>receive(value),{immediate:true,deep:true})
watch(()=>props.resolution,value=>{
 if(!value||value.attemptId!==attempt.value)return
 if(value.type==='known-rejected'){attempt.value=undefined;error.value='本次修订已被拒绝，草稿已保留。';return}
 if(!props.canRead||!loaded.value||!pendingIntent.value)return
 try{const verified=confirmRevision(loaded.value,pendingIntent.value,value.seed);install(verified);pendingIntent.value=undefined;attempt.value=undefined;emit('saved',verified.seed)}
 catch(cause){error.value=cause instanceof Error?cause.message:'修订结果尚未完整核对'}
},{deep:true})
function reload(){if(!props.canRead||sourceEditing.value||attempt.value||!pendingSeed.value)return;try{install(loadPreprocessVersion(pendingSeed.value,scope()))}catch(cause){invalidSeed.value=true;error.value=cause instanceof Error?cause.message:'无法载入最新版本'}}
function cancel(){if(!attempt.value){functionsOpen.value=false;sourceEditing.value=false;emit('cancel')}}
function kind(value:RuleKind){if(!blocked.value&&form.value&&(value==='ATTRS_RPT_PREPROC'||value==='ATTRS_PUSH_PREPROC')){if(form.value.propertyOperations&&value!=='ATTRS_RPT_PREPROC'){error.value='这些操作仅适用于属性上报预处理';return}form.value.kind=value}}
function submit(fromOperation=false){
 if((fromOperation?editorDisabled.value:blocked.value)||!loaded.value||!form.value||counterExhausted.value)return
 try{
  if(fromOperation&&!dirty.value){cancel();return}
  const value=makeRevisionIntent(loaded.value,form.value,crypto.randomUUID())
  pendingIntent.value=value;attempt.value=value.attemptId;error.value='';emit('submit',value)
 }catch(cause){error.value=cause instanceof Error?cause.message:'请核对完整版本内容'}
}
</script>
<template><section class="rule-preprocess-version-editor" :class="{'detail-mode':detail}" :aria-busy="!!attempt">
 <el-empty v-if="!canRead" description="当前无权读取规则版本"/>
 <template v-else-if="form&&loaded">
  <RulePreprocessConditions v-if="filterOnly" v-model="form.filter" editing :disabled="editorDisabled" :error="requestError||error" :recovery-pending="recoveryPending" :recovering="recovering" @save="submit(true)" @cancel="cancel" @recover="emit('recover')"/>
  <template v-else><p v-if="!detail" class="version-meta">版本 {{loaded.seed.versionNumber}}<span>{{deviceName}}</span></p>
  <el-form label-position="top" :disabled="editorDisabled" @submit.prevent="submit()">
   <template v-if="!detail"><el-form-item label="规则名称"><el-input v-model="form.name" :disabled="blocked" aria-label="规则名称" maxlength="128"/></el-form-item>
   <h3>规则类型</h3><RuleTriggerSelector :model-value="form.kind" :kinds="kinds" :disabled="blocked" @update:model-value="kind"/>
   <el-form-item label="来源设备"><el-input :model-value="deviceName" aria-label="来源设备" readonly/></el-form-item>
   <RuleConditionGroupEditor v-if="form.kind==='ATTRS_RPT_PREPROC'" v-model="form.filter" :disabled="blocked" :number-text-limit="1024"/>
   <h3>预处理操作</h3></template><RulePreprocessFunctionsEditor v-if="functionsOpen" v-model="form.functions" v-model:property-operations="form.propertyOperations" :source="source" :kind="form.kind" :scope-key="scopeKey" :project-id="projectId" :disabled="editorDisabled" :detail="detail" :command="command" :request-error="requestError||error" :recovery-pending="recoveryPending" :recovering="recovering" @recover="emit('recover')" @commit="submit(true)" @cancel-command="cancel" @busy="sourceEditing=$event" @denied="clearPrivate();emit('denied',$event)"/>
   <el-form-item v-if="!detail" label="规则描述（选填）" class="description"><el-input v-model="form.description" :disabled="blocked" aria-label="规则描述" type="textarea" maxlength="512" :rows="3"/></el-form-item>
  </el-form>
  <p v-if="!detail" class="edit-help">保存为新版本，规则启用状态保持不变。</p></template>
 </template>
 <el-empty v-else description="尚未读取完整版本"/>
 <el-alert v-if="notice" :title="notice" type="warning" :closable="false"/>
 <el-button v-if="pendingSeed" :disabled="!!attempt||!canRead||sourceEditing" @click="reload">{{dirty?'放弃修改并载入最新版本':'载入最新版本'}}</el-button>
 <el-alert v-if="error" :title="error" type="warning" :closable="false"/>
 <p v-if="counterExhausted" class="edit-help" role="status">版本号已达上限，当前版本仅供读取。</p>
 <p v-if="attempt" class="edit-help" role="status">修订结果待核对，请勿重复保存。</p>
 <footer v-if="!hideActions&&!detail&&!filterOnly"><el-button :disabled="!!attempt" @click="cancel">取消</el-button><el-button type="primary" :disabled="blocked||!dirty||counterExhausted" @click="submit()">保存新版本</el-button></footer>
</section></template>
<style scoped>
.rule-preprocess-version-editor{min-width:0}.version-meta{font-size:13px;color:var(--el-text-color-secondary);display:flex;gap:20px}.rule-preprocess-version-editor h3{font-size:16px;font-weight:500;margin:28px 0 14px}.rule-preprocess-version-editor :deep(.el-form>.el-form-item){max-width:350px}.rule-preprocess-version-editor :deep(.rule-trigger-selector){margin-bottom:24px}.description{margin-top:24px}.edit-help{font-size:12px;color:var(--el-text-color-secondary);line-height:1.6}.rule-preprocess-version-editor>.el-alert{margin:12px 0}footer{display:flex;gap:10px;margin-top:22px}footer .el-button+.el-button{margin-left:0}
</style>
