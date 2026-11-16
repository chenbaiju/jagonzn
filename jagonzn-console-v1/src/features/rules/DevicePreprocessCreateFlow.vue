<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {can,projectId} from '@/core/session'
import {identityEpoch,onIdentityChange,errorMessage,ApiError} from '@/core/http'
import DeviceRulePreprocessBuilder from './DeviceRulePreprocessBuilder.vue'
import {createPreprocessor,knownPreprocessRejection,PreprocessOutcomeUnknown} from './preprocess-control-api'
import type {PreprocessKind} from './rule-builder-draft'
import type {PreprocessCreationDraft} from './preprocess-version-editor'
const props=defineProps<{deviceId:string;deviceName:string;initialName?:string;initialKind?:PreprocessKind;initialFilterJson?:string;externalFirstStep?:boolean}>()
const emit=defineEmits<{created:[id:string];close:[];previous:[];busy:[value:boolean];locked:[value:boolean];denied:[cause:ApiError,unknown:boolean]}>()
const turn=ref(0),busy=ref(false),locked=ref(false),unknown=ref(false),error=ref(''),rejectedAttempt=ref<string>()
const allowed=computed(()=>!!projectId.value&&can('rule:manage')),scopeKey=computed(()=>`${identityEpoch()}:${turn.value}:${projectId.value}:${props.deviceId}`)
let active=true,controller:AbortController|undefined
function reset(){turn.value++;controller?.abort();busy.value=false;locked.value=false;unknown.value=false;error.value='';rejectedAttempt.value=undefined}
const dispose=onIdentityChange(reset)
onScopeDispose(()=>{active=false;controller?.abort();dispose()})
watch([projectId,()=>props.deviceId,allowed],reset)
watch(busy,value=>emit('busy',value),{immediate:true});watch([locked,unknown],()=>emit('locked',locked.value||unknown.value),{immediate:true})
async function submit(intent:{scopeKey:string;deviceId:string;attemptId:string;draft:PreprocessCreationDraft}){
 if(!allowed.value||busy.value||unknown.value||intent.scopeKey!==scopeKey.value||intent.deviceId!==props.deviceId)return
 const generation=turn.value,epoch=identityEpoch(),project=projectId.value,device=props.deviceId,key=scopeKey.value
 const current=()=>active&&generation===turn.value&&epoch===identityEpoch()&&project===projectId.value&&device===props.deviceId&&allowed.value
 controller?.abort();controller=new AbortController();busy.value=true;error.value=''
 try{const result=await createPreprocessor({projectId:project,deviceId:device,scopeKey:key},intent.draft,intent.attemptId,current,controller.signal);if(current())emit('created',result.seed.ruleId)}
 catch(cause){if(current()){error.value=errorMessage(cause);const authority=cause instanceof PreprocessOutcomeUnknown?cause.cause:cause;if(authority instanceof ApiError&&[401,403,404].includes(authority.status)){unknown.value=!knownPreprocessRejection(cause);emit('denied',authority,unknown.value)}else if(knownPreprocessRejection(cause))rejectedAttempt.value=intent.attemptId;else unknown.value=true}}
 finally{if(current())busy.value=false}
}
</script>
<template><section>
 <DeviceRulePreprocessBuilder :scope-key="scopeKey" :project-id="projectId" @denied="emit('denied',$event,false)" :initial-name="initialName" :initial-kind="initialKind" :external-first-step="externalFirstStep" :initial-filter-json="initialFilterJson" :device-id="deviceId" :device-name="deviceName" :disabled="!allowed||busy||unknown" :rejected-attempt="rejectedAttempt" @submit="submit" @cancel="emit('close')" @previous="emit('previous')" @locked="locked=$event"/>
 <el-alert v-if="error" :title="unknown?'创建结果尚未完整核对，请勿重复创建。'+error:error" type="error" :closable="false"/>
</section></template>
