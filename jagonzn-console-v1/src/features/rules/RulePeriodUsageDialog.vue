<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {can,projectId,session} from '@/core/session'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import type {RuleSourceInput} from './rule-source-selection'
import {deviceSourceMembers,type RuleDeviceSourceContract} from './rule-source-api'
import {coordinateRuleSource} from './coordinate-transform-draft'
import {periodUsageDraft,readRulePeriodUsageProperties,type PeriodUsageDraft} from './period-usage-draft'
const props=withDefaults(defineProps<{projectId:string;source:RuleSourceInput|RuleDeviceSourceContract;draft?:PeriodUsageDraft;disabled?:boolean;validationError?:string;top?:string;recoveryPending?:boolean;recovering?:boolean}>(),{disabled:false})
const emit=defineEmits<{save:[draft:PeriodUsageDraft];cancel:[];busy:[value:boolean];recover:[];denied:[error:ApiError]}>()
const totalInput=ref(''),usageDay=ref(false),usageMonth=ref(false),choices=ref<readonly string[]>([]),loading=ref(false),candidateReady=ref(false),sealed=ref(false),error=ref(''),candidateError=ref('')
const permitted=computed(()=>!!props.projectId&&props.projectId===projectId.value&&!session.transitioning&&can('rule:manage')),locked=computed(()=>props.disabled||!permitted.value||sealed.value)
let turn=0,active=true,controller:AbortController|undefined,previousScope:string|undefined
function sourceKey(){try{const source=coordinateRuleSource(props.source);return source.kind+':'+deviceSourceMembers(source).join(',')}catch{return ''}}
function clearDraft(){totalInput.value='';usageDay.value=false;usageMonth.value=false}
function stop(){turn++;controller?.abort();choices.value=[];candidateReady.value=false;loading.value=false;emit('busy',false)}
async function reset(){
 stop();error.value='';candidateError.value=''
 const scope=props.projectId+':'+String(session.user?.accountId)+':'+sourceKey(),sameScope=previousScope===undefined||previousScope===scope;previousScope=scope;clearDraft()
 if(sameScope&&props.draft&&!sealed.value){totalInput.value=props.draft.totalInput;usageDay.value=props.draft.usageDay;usageMonth.value=props.draft.usageMonth}
 if(!permitted.value||sealed.value)return
 const generation=turn,epoch=identityEpoch(),actor=session.user?.accountId,project=props.projectId,source=sourceKey();controller=new AbortController();const signal=controller.signal
 const current=()=>active&&generation===turn&&epoch===identityEpoch()&&actor===session.user?.accountId&&project===props.projectId&&source===sourceKey()&&permitted.value&&!signal.aborted
 loading.value=true;emit('busy',true)
 try{const value=await readRulePeriodUsageProperties(project,props.source,signal);if(current()){choices.value=value;candidateReady.value=true}}
 catch(cause){if(current()){if(cause instanceof ApiError&&[401,403].includes(cause.status)){sealed.value=true;clearDraft();error.value=errorMessage(cause);emit('denied',cause)}else candidateError.value=errorMessage(cause)+'；可手动填写属性。'}}
 finally{if(current()){loading.value=false;emit('busy',false)}}
}
watch([()=>props.draft,sourceKey,()=>props.projectId,()=>session.user?.accountId,permitted],()=>{void reset()},{immediate:true,deep:true})
const dispose=onIdentityChange(()=>{stop();sealed.value=true;clearDraft();candidateError.value='';error.value='当前身份已变化，请关闭后重新配置。'})
function suggest(values:readonly string[],query:string,done:(items:{value:string}[])=>void){done(values.filter(key=>key.toLowerCase().includes(query.toLowerCase())).map(value=>({value})))}
const suggestions=(query:string,done:(items:{value:string}[])=>void)=>suggest(choices.value,query,done)
function save(){if(locked.value||loading.value)return;try{coordinateRuleSource(props.source);const draft=periodUsageDraft({totalInput:totalInput.value,usageDay:usageDay.value,usageMonth:usageMonth.value});if(candidateReady.value){if(!choices.value.includes(draft.totalInput))throw new Error('请选择当前设备来源共有的数值属性');for(const key of [draft.usageDay?draft.totalInput+'_day':null,draft.usageMonth?draft.totalInput+'_month':null])if(key&&!choices.value.includes(key))throw new Error('当前设备来源需声明数值属性 '+key)}error.value='';emit('save',draft)}catch(cause){error.value=errorMessage(cause)}}
function cancel(){if(props.disabled)return;stop();clearDraft();emit('cancel')}
onScopeDispose(()=>{active=false;stop();dispose()})
</script>
<template><el-dialog :model-value="true" title="配置操作" :top="top??'15vh'" :lock-scroll="false" width="min(1000px,94vw)" class="rule-period-usage-dialog" :close-on-click-modal="false" :close-on-press-escape="!disabled" :show-close="!disabled" :before-close="cancel" append-to-body>
 <el-form label-position="top" :disabled="locked" @submit.prevent="save">
  <el-form-item label="总累计值属性"><el-autocomplete v-model="totalInput" :fetch-suggestions="suggestions" aria-label="总累计值属性" placeholder="填写属性标识符" :maxlength="64" :loading="loading"/></el-form-item>
  <el-form-item label="生成日累计值"><el-switch v-model="usageDay" aria-label="生成日累计值"/></el-form-item>
  <el-form-item label="生成月累计值"><el-switch v-model="usageMonth" aria-label="生成月累计值"/></el-form-item>
 </el-form>
 <el-alert v-if="candidateError" :title="candidateError" type="warning" :closable="false"/><el-alert v-if="error||validationError" :title="error||validationError" type="warning" :closable="false"/>
 <template #footer><el-form :disabled="false"><el-button v-if="recoveryPending" :disabled="recovering" @click="emit('recover')">读取核对</el-button><el-button :disabled="disabled" @click="cancel">取消</el-button><el-button type="primary" :disabled="locked||loading" @click="save">保存</el-button></el-form></template>
</el-dialog></template>
<style scoped>
.rule-period-usage-dialog .el-form-item{margin-bottom:22px}.rule-period-usage-dialog :deep(.el-form-item__label){font-size:14px;font-weight:400;color:#606266;line-height:40px;padding-bottom:10px}.rule-period-usage-dialog :deep(.el-autocomplete){width:100%}.rule-period-usage-dialog :deep(.el-input__wrapper){height:40px;min-height:40px;padding:0 15px}.rule-period-usage-dialog :deep(.el-input__inner){font-size:14px;color:#606266}.rule-period-usage-dialog :deep(.el-switch){--el-switch-on-color:#1e88e5;--el-switch-off-color:#cccccc}
</style>
