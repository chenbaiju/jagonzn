<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {typeDeviceUuid} from './type-devices-api'
import {modelGenerationTransport,prepareModelGeneration,type ModelGenerationAvailability,type ModelGenerationIntent,type ModelGenerationResult,type ModelGenerationTransport} from './model-generation-api'
import type {ModelSnapshot} from './model-version-api'
import type {ModelCandidate,ModelCandidatePreview} from './model-candidate-api'
const props=withDefaults(defineProps<{typeId:string;base:ModelSnapshot;disabled?:boolean;transport?:ModelGenerationTransport}>(),{disabled:false,transport:()=>modelGenerationTransport})
const emit=defineEmits<{locked:[value:boolean];retained:[value:boolean];accepted:[candidate:ModelCandidate,preview:ModelCandidatePreview]}>()
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&can('device:read')&&['OWNER','ADMIN','OPERATOR','VIEWER'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN','OPERATOR','VIEWER'].includes(currentProject.value?.myRole||''))
const manager=computed(()=>readable.value&&can('device:update')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||'')&&currentProject.value?.status==='ACTIVE')
const instruction=ref(''),version=ref(''),level=ref('MAJOR'),busy=ref(false),unknown=ref(false),ended=ref(false),error=ref(''),notice=ref('')
const availability=shallowRef<ModelGenerationAvailability>(),intent=shallowRef<ModelGenerationIntent>(),result=shallowRef<ModelGenerationResult>()
const locked=computed(()=>busy.value||unknown.value),editable=computed(()=>manager.value&&!props.disabled&&!locked.value&&!ended.value)
let generation=0,alive=true,controller:AbortController|undefined
function clear(){generation++;controller?.abort();busy.value=false;unknown.value=false;ended.value=false;availability.value=undefined;intent.value=undefined;result.value=undefined;instruction.value='';error.value='';notice.value='';version.value='';level.value='MAJOR'}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,actor:session.user?.accountId,type:props.typeId,base:props.base.version.id}}
function current(s:ReturnType<typeof capture>){return alive&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.actor===session.user?.accountId&&s.type===props.typeId&&s.base===props.base.version.id&&readable.value}
async function load(){if(!manager.value||props.disabled)return;const s=capture();controller=new AbortController();busy.value=true;try{const status=await props.transport.status(s.project,s.type,controller.signal);if(current(s)){availability.value=status;const major=BigInt(props.base.version.versionNumber.split('.')[0]!);version.value=major<2147483647n?`${major+1n}.0.0`:''}}catch(cause){if(current(s))error.value=errorMessage(cause)}finally{if(current(s))busy.value=false}}
async function generate(){if(!editable.value||!availability.value?.available)return;let original:ModelGenerationIntent;try{original=prepareModelGeneration(projectId.value,props.typeId,props.base,version.value,level.value,instruction.value)}catch(cause){error.value=errorMessage(cause);return}
 intent.value=original;unknown.value=true;busy.value=true;error.value='';notice.value='';result.value=undefined;const s=capture();controller=new AbortController()
 try{const response=await props.transport.generate(original,controller.signal);if(current(s)){if(!manager.value||props.disabled){restrictToRecovery();return}result.value=response;unknown.value=response.status==='IN_FLIGHT';ended.value=!response.candidate;notice.value=response.candidate?'候选已通过严格预览，尚未发布。':response.status==='REJECTED'?'候选未通过严格校验；本次调用不会重试。':'本次没有可恢复的候选正文。成功状态也不能恢复丢失的结果，不会自动重调。'}}catch(cause){if(current(s)){if(cause instanceof ApiError&&cause.status===401)clear();else error.value=errorMessage(cause)}}finally{if(current(s))busy.value=false}}
async function read(){if(!readable.value||!intent.value||busy.value)return;const original=intent.value,s=capture();controller=new AbortController();busy.value=true;try{const response=await props.transport.read(original,controller.signal);if(current(s)){result.value=response;unknown.value=response.status==='IN_FLIGHT';ended.value=response.status!=='IN_FLIGHT';notice.value='只读了原调用状态；结果正文未保留，不会恢复或再次调用提供者。'}}catch(cause){if(current(s)){if(cause instanceof ApiError&&[401,403].includes(cause.status))clear();else error.value=errorMessage(cause)}}finally{if(current(s))busy.value=false}}
function accept(){if(!editable.value||!result.value?.candidate||!result.value.preview)return;emit('accepted',result.value.candidate,result.value.preview);ended.value=true;notice.value='候选已交给编辑器，仍需明确确认发布。现有设备不会自动升级。'}
function cancelWait(){if(!busy.value||!intent.value)return;generation++;controller?.abort();busy.value=false;unknown.value=true;notice.value='已停止页面等待，提供者可能仍在处理或已消费。只按原键读取状态，不会自动重调。'}
function finish(){if(busy.value)return;unknown.value=false;ended.value=true;notice.value='已结束本次页面操作；这不证明原调用失败或未消费。'}
function restrictToRecovery(){
 generation++;controller?.abort();busy.value=false;availability.value=undefined
 if(!intent.value)return
 const prior=result.value;result.value=prior?Object.freeze({callId:prior.callId,status:prior.status,reason:'RESULT_NOT_RETAINED'}):undefined
 unknown.value=!prior||prior.status==='IN_FLIGHT';ended.value=true;notice.value='写权限已变化或项目不再活动；只保留原键读取状态，不能再次生成、采纳或发布。'
}
function reset(){clear();if(manager.value&&!props.disabled)void load()}
watch([()=>projectId.value,()=>props.typeId,()=>props.base.version.id,()=>props.base.version.schemaDigest,()=>session.user?.accountId,()=>readable.value],reset,{immediate:true,flush:'sync'})
watch(manager,allowed=>{if(!readable.value)return;if(!allowed)restrictToRecovery();else if(!intent.value&&!props.disabled&&!busy.value)void load()},{flush:'sync'})
watch(()=>props.disabled,blocked=>{if(blocked){if(intent.value)restrictToRecovery();else{generation++;controller?.abort();busy.value=false;availability.value=undefined}}else if(manager.value&&!intent.value&&!busy.value)void load()},{flush:'sync'})
watch(()=>!!intent.value,value=>emit('retained',value),{immediate:true,flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'});const dispose=onIdentityChange(clear);onScopeDispose(()=>{alive=false;clear();dispose();emit('locked',false)})
</script>
<template><section class="model-generation"><h3>AI 生成物模型候选</h3><p v-if="readable">基于已发布版本 {{base.version.versionNumber}} 生成后继候选。只发送模型定义和本次说明，请勿填写凭据、个人信息或设备私有数据。使用项目配置的提供者账户，可能产生费用。</p>
 <p v-if="!readable" role="status">当前账号没有读取权限。</p><p v-else-if="!manager" role="status">当前仅可读取本人的原调用状态；生成需要活动项目的所有者或管理员权限。</p><el-alert v-else-if="availability&&!availability.available" title="模型生成服务尚未开启或提供者尚未准入；当前不会发起真实模型调用。" type="info" :closable="false"/>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <el-form v-if="readable" label-position="top" @submit.prevent="generate"><div class="targets"><el-form-item label="目标版本"><el-input v-model="version" aria-label="生成目标版本" :disabled="!editable" maxlength="32"/></el-form-item><el-form-item label="变化级别"><el-select v-model="level" aria-label="生成变化级别" :disabled="!editable"><el-option v-for="value in ['PATCH','MINOR','MAJOR']" :key="value" :value="value" :label="value"/></el-select></el-form-item></div><el-form-item label="生成说明"><el-input v-model="instruction" type="textarea" :rows="5" maxlength="4000" show-word-limit aria-label="模型生成说明" :disabled="!editable"/></el-form-item><el-button type="primary" :disabled="!editable||!availability?.available" :loading="busy&&!!intent" @click="generate">生成一次候选</el-button><el-button v-if="busy&&intent" @click="cancelWait">停止页面等待</el-button></el-form>
 <section v-if="intent&&readable"><p>原操作键：{{intent.key}}</p><p v-if="result">调用状态：{{result.status}}</p><p v-if="unknown">本次结果未确认；不重发原请求。</p><el-button :disabled="busy" @click="read">读取原调用状态</el-button><el-button :disabled="busy" @click="finish">结束本次操作</el-button></section>
 <section v-if="manager&&result?.candidate&&result.preview"><h4>已校验的生成候选</h4><p>最低变化级别：{{result.preview.requiredChangeLevel}}；候选摘要：{{result.preview.schemaDigest}}</p><details><summary>查看完整候选</summary><pre>{{result.preview.text}}</pre></details><el-button :disabled="!editable" @click="accept">将候选载入编辑器</el-button><el-button :disabled="busy" @click="finish">取消采纳</el-button></section>
</section></template>
<style scoped>.model-generation{margin-top:24px}.model-generation h3{font-size:18px;font-weight:500}.model-generation p{font-size:12px;line-height:20px;color:var(--tl-muted);overflow-wrap:anywhere}.targets{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:640px}.targets :deep(.el-select){width:100%}.model-generation :deep(.el-alert){margin:12px 0}.model-generation pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:360px;overflow:auto;font-size:12px}@media(max-width:600px){.targets{grid-template-columns:1fr}}</style>
