<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import JsonCodeEditor from '@/ui/JsonCodeEditor.vue'
import DeviceTypeModelGeneration from './DeviceTypeModelGeneration.vue'
import type {ModelGenerationTransport} from './model-generation-api'
import {typeDeviceUuid} from './type-devices-api'
import type {ModelSnapshot} from './model-version-api'
import {modelCandidateTransport,prepareModelCandidate,prepareModelCandidatePublication,candidatePublicationMatches,sameModelCandidateFact,type ModelCandidate,type ModelCandidateIntent,type ModelCandidatePreview,type ModelCandidateTransport} from './model-candidate-api'

const props=withDefaults(defineProps<{typeId:string;typeStatus:string;disabled?:boolean;transport?:ModelCandidateTransport;generationTransport?:ModelGenerationTransport}>(),{disabled:false,transport:()=>modelCandidateTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER'],sectionLabels:Record<string,string>={properties:'属性',events:'事件',commands:'命令'}
const denied=ref(false),member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const readable=computed(()=>member.value&&!denied.value),writable=computed(()=>readable.value&&props.typeStatus==='PUBLISHED'&&currentProject.value?.status==='ACTIVE'&&can('device:update')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const busy=ref(false),review=ref<'unknown'|'rejected'|'acknowledged'>(),error=ref(''),notice=ref(''),observation=ref(''),ended=ref(false),baseConflict=ref(false)
const base=shallowRef<ModelSnapshot>(),candidate=shallowRef<ModelCandidate>(),preview=shallowRef<ModelCandidatePreview>(),intent=shallowRef<ModelCandidateIntent>(),receipt=shallowRef<ModelSnapshot>(),observed=shallowRef<ModelSnapshot>(),fact=shallowRef<ModelSnapshot>()
const generationLocked=ref(false),generationRetained=ref(false),ownLocked=computed(()=>busy.value||!!review.value)
const text=ref(''),versionNumber=ref(''),changeLevel=ref('MAJOR'),locked=computed(()=>ownLocked.value||generationLocked.value),editable=computed(()=>writable.value&&!props.disabled&&!locked.value&&!ended.value),canPreview=computed(()=>editable.value&&!!candidate.value),canPublish=computed(()=>editable.value&&!!candidate.value&&!!preview.value)
let generation=0,alive=true,controller:AbortController|undefined
function clear(){generationRetained.value=false;generationLocked.value=false;generation++;controller?.abort();busy.value=false;review.value=undefined;error.value='';notice.value='';observation.value='';ended.value=false;baseConflict.value=false;base.value=undefined;candidate.value=undefined;preview.value=undefined;intent.value=undefined;receipt.value=undefined;observed.value=undefined;fact.value=undefined;text.value='';versionNumber.value='';changeLevel.value='MAJOR'}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,account:session.user?.accountId,type:props.typeId}}
function current(value:ReturnType<typeof capture>){return alive&&value.generation===generation&&value.epoch===identityEpoch()&&value.project===projectId.value&&value.account===session.user?.accountId&&value.type===props.typeId&&readable.value}
function deny(){clear();denied.value=true}
function invalidate(){candidate.value=undefined;preview.value=undefined;error.value='';notice.value=''}
function editText(value:string){if(editable.value){text.value=value;invalidate()}}
function editVersion(value:string){if(editable.value){versionNumber.value=value;invalidate()}}
function editLevel(value:string){if(editable.value){changeLevel.value=value;invalidate()}}
async function loadBase(){
 if(!readable.value||props.disabled||locked.value||props.typeStatus!=='PUBLISHED')return
 clear();busy.value=true;const state=capture();controller=new AbortController()
 try{const result=await props.transport.latest(state.project,state.type,controller.signal);if(!current(state))return
  base.value=result;text.value=result.text;const major=BigInt(result.version.versionNumber.split('.')[0]!);versionNumber.value=major<2147483647n?`${major+1n}.0.0`:'';changeLevel.value='MAJOR'
 }catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status))deny();else error.value=errorMessage(cause)}}finally{if(current(state))busy.value=false}
}
function applyLocal(){
 if(!editable.value)return
 if(baseConflict.value){error.value='基版已变化，请先读取最新基版；当前本地内容仍保留供核对';return}
 try{candidate.value=prepareModelCandidate(projectId.value,props.typeId,base.value,versionNumber.value,changeLevel.value,text.value);preview.value=undefined;error.value='';notice.value='本地候选已应用，尚未写入功能定义或发布版本。'}catch(cause){candidate.value=undefined;preview.value=undefined;error.value=errorMessage(cause)}
}
/** 只有用户显式采纳才替换本地候选；原服务预览仍绑定当前固定基版，发布另行确认。 */
function acceptGeneration(value:ModelCandidate,approved:ModelCandidatePreview){
 if(!editable.value||!base.value||baseConflict.value)return
 try{
  if(value.project!==projectId.value||value.typeId!==props.typeId||!sameModelCandidateFact(value.base,base.value))throw new Error('生成候选的固定基版已变化，请重新读取')
  const local=prepareModelCandidate(projectId.value,props.typeId,base.value,value.body.versionNumber,value.body.changeLevel,value.text)
  // 复用现有候选与预览身份检查；这里不创建或发送发布请求。
  if(approved.baseVersion.id!==base.value.version.id||approved.baseVersion.schemaDigest!==base.value.version.schemaDigest||approved.versionNumber!==local.body.versionNumber||approved.changeLevel!==local.body.changeLevel||approved.text!==value.text)throw new Error('生成候选与原预览不一致，请重新读取')
  text.value=value.text;versionNumber.value=value.body.versionNumber;changeLevel.value=value.body.changeLevel;candidate.value=local;preview.value=approved;error.value='';notice.value='生成候选已载入编辑器，尚未发布。可以继续编辑，发布仍须明确确认。'
 }catch(cause){error.value=errorMessage(cause)}
}
async function readPreview(){
 if(!canPreview.value||!candidate.value)return
 const original=candidate.value;preview.value=undefined;error.value='';notice.value='';busy.value=true;const state=capture();controller=new AbortController()
 try{const result=await props.transport.preview(original,controller.signal);if(current(state)&&candidate.value===original)preview.value=result}
 catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status))deny();else{if(cause instanceof ApiError&&cause.status===409&&cause.code===10009){baseConflict.value=true;candidate.value=undefined}error.value=errorMessage(cause)}}}finally{if(current(state))busy.value=false}
}
function complete(actual:ModelSnapshot){generation++;busy.value=false;review.value=undefined;fact.value=actual;preview.value=undefined;candidate.value=undefined;ended.value=true;error.value='';notice.value='目标版本与发布响应及固定版本原件已核对。现有设备未自动升级；该事实不证明版本最初由本人或此请求键创建。';emit('changed')}
async function publish(){
 if(!canPublish.value||!candidate.value||!preview.value)return
 let original:ModelCandidateIntent
 try{original=prepareModelCandidatePublication(candidate.value,preview.value)}catch(cause){error.value=errorMessage(cause);return}
 intent.value=original;review.value='unknown';busy.value=true;error.value='';notice.value='';observed.value=undefined;receipt.value=undefined;const state=capture();controller=new AbortController()
 try{const returned=await props.transport.publish(original,controller.signal);if(!current(state))return;receipt.value=returned;review.value='acknowledged'
  if(!candidatePublicationMatches(returned,original))throw new Error('发布响应与原候选不同，请只读核对目标版本')
  const actual=await props.transport.snapshot(original.project,original.typeId,returned.version.id,controller.signal,returned.version);if(!current(state))return
  if(!sameModelCandidateFact(returned,actual)||!candidatePublicationMatches(actual,original))throw new Error('固定版本原件与发布响应不同，请继续只读核对')
  complete(actual)
 }catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){
  if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}
  error.value=errorMessage(cause);if(!receipt.value&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.status>=400&&cause.status<500){review.value='rejected';if(cause.status===409&&cause.code===10009)baseConflict.value=true}
 }}finally{if(current(state))busy.value=false}
}
async function readCurrent(){
 const original=intent.value;if(!original||!review.value||!readable.value||busy.value)return
 busy.value=true;error.value='';observation.value='';observed.value=undefined;const state=capture();controller?.abort();controller=new AbortController()
 try{const byNumber=await props.transport.byNumber(original.project,original.typeId,original.candidate.body.versionNumber,controller.signal);if(!current(state))return
  const actual=await props.transport.snapshot(original.project,original.typeId,byNumber.version.id,controller.signal,byNumber.version);if(!current(state))return
  if(!sameModelCandidateFact(byNumber,actual))throw new Error('版本号查询与固定版本原件不一致，原请求仍待核对')
  observed.value=actual;const matches=candidatePublicationMatches(actual,original)
  if(receipt.value&&sameModelCandidateFact(receipt.value,actual)&&matches){complete(actual);return}
  observation.value=`当前目标版本与原候选${matches?'一致':'不一致'}；这只证明当前固定版本事实，不能证明原请求键、操作者或原请求成功。`
 }catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status))deny();else if(cause instanceof ApiError&&cause.status===404)observation.value='本次未见目标版本或其不可见，仍不能判定原请求失败或不会提交；不会重新发布。';else error.value=errorMessage(cause)}}finally{if(current(state))busy.value=false}
}
function finish(){if(!review.value||busy.value)return;const rejected=review.value==='rejected',actual=observed.value;generation++;controller?.abort();review.value=undefined;intent.value=undefined;receipt.value=undefined;preview.value=undefined;candidate.value=undefined;fact.value=actual;ended.value=!rejected;error.value='';notice.value=rejected?'本次发布已被拒绝；未重发原请求。如需继续，请重新读取最新基版并重新预览。':'已结束本次核对；原请求结果仍未确认，未重发。当前目标版本事实另列。'}
function reset(){clear();denied.value=false;if(member.value&&props.typeStatus==='PUBLISHED'&&!props.disabled)void loadBase()}
watch([()=>projectId.value,()=>props.typeId,()=>props.typeStatus,()=>session.user?.accountId,()=>member.value,()=>props.transport],reset,{immediate:true,flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(()=>{clear();denied.value=false});onScopeDispose(()=>{alive=false;clear();dispose();emit('locked',false)})
</script>
<template><section class="type-model-candidate">
 <header><h3>物模型版本候选</h3><el-button size="small" :disabled="!readable||disabled||locked||typeStatus!=='PUBLISHED'" :loading="busy&&!review" @click="loadBase">读取最新基版</el-button></header>
 <p class="candidate-help">可编辑属性、事件和命令，完整候选由服务端严格校验。新增命令须明确超时秒数。应用候选不会修改已发布功能定义；发布新版本不会自动升级现有设备，设备绑定升级另行明确执行。</p>
 <p v-if="!readable" role="status">当前账号没有此内容的读取权限。</p><p v-else-if="typeStatus!=='PUBLISHED'" role="status">请先完成类型首次发布，再读取最新冻结基版创建后续版本候选。</p>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <template v-if="base&&readable"><dl class="candidate-facts"><dt>固定类型ID</dt><dd>{{base.version.deviceTypeId}}</dd><dt>基版</dt><dd>{{base.version.versionNumber}} · {{base.version.id}}</dd><dt>基版摘要</dt><dd>{{base.version.schemaDigest}}</dd></dl>
  <p class="candidate-help">重新读取最新基版会替换当前本地候选内容。基版冲突时，请先保存需要保留的编辑文本，再读取新基版。</p>
  <details v-if="typeStatus==='PUBLISHED'&&(writable||generationRetained)" class="candidate-generation"><summary>使用 AI 生成后继候选</summary><p class="candidate-help">生成只提出建议；采纳会替换下方编辑器的本地候选，仍需明确确认发布。</p><DeviceTypeModelGeneration :type-id="typeId" :base="base" :transport="generationTransport" :disabled="disabled||ownLocked||ended||baseConflict" @locked="generationLocked=$event" @retained="generationRetained=$event" @accepted="acceptGeneration"/></details>
  <el-form label-position="top" @submit.prevent="applyLocal"><div class="candidate-inputs"><el-form-item label="目标版本号"><el-input :model-value="versionNumber" aria-label="候选目标版本号" maxlength="32" :disabled="!editable" @update:model-value="editVersion"/></el-form-item><el-form-item label="所选变化级别"><el-select :model-value="changeLevel" aria-label="候选变化级别" :disabled="!editable" @update:model-value="editLevel"><el-option value="PATCH" label="PATCH"/><el-option value="MINOR" label="MINOR"/><el-option value="MAJOR" label="MAJOR"/></el-select></el-form-item></div>
   <el-form-item label="完整本地候选 JSON"><JsonCodeEditor :model-value="text" ariaLabel="物模型本地候选JSON" :height="340" :disabled="!editable" @update:model-value="editText"/></el-form-item>
   <div class="candidate-actions"><el-button :disabled="!editable" @click="applyLocal">应用本地候选</el-button><el-button :disabled="!canPreview" :loading="busy&&!review" @click="readPreview">读取权威预览</el-button></div>
  </el-form>
 </template>
 <section v-if="preview&&readable" class="candidate-preview"><h4>权威预览</h4><dl class="candidate-facts"><dt>基版ID</dt><dd>{{preview.baseVersion.id}}</dd><dt>目标版本</dt><dd>{{preview.versionNumber}}</dd><dt>所选级别</dt><dd>{{preview.changeLevel}}</dd><dt>最低变化级别</dt><dd>{{preview.requiredChangeLevel}}</dd><dt>候选模型摘要</dt><dd>{{preview.schemaDigest}}</dd><dt>预览摘要</dt><dd>{{preview.previewDigest}}</dd></dl>
  <p class="candidate-help">现有设备自动升级数量：0。确认仅创建或读取目标版本事实，不直接更改存量设备绑定。</p>
  <div v-for="(section,key) in preview.changes" :key="key" class="candidate-diff"><strong>{{sectionLabels[key]||key}}</strong><p>新增：{{section.added?.join('、')||'无'}}；删除：{{section.removed?.join('、')||'无'}}；修改：{{section.changed?.join('、')||'无'}}</p></div>
  <details><summary>查看服务端规范候选</summary><pre>{{preview.text}}</pre></details><el-button v-if="!review&&writable" type="primary" :disabled="!canPublish" @click="publish">确认发布新版本</el-button>
 </section>
 <section v-if="review&&readable" class="candidate-review"><el-alert :title="review==='rejected'?'本次发布已被拒绝；原候选、预览与请求键保持，不会重发。':'原发布结果尚未完成核对；只按原目标版本号与固定ID读取，不会重发。'" type="warning" :closable="false"/><p>原请求键：{{intent?.key}}</p><p>原目标版本：{{intent?.candidate.body.versionNumber}}</p><p v-if="observation">{{observation}}</p><p v-if="observed">当前固定版本ID：{{observed.version.id}}</p><el-button :loading="busy" @click="readCurrent">读取目标版本事实</el-button><el-button :disabled="busy" @click="finish">结束本次核对</el-button></section>
 <section v-if="fact&&readable" class="candidate-fact"><h4>已读取的固定版本事实</h4><p>{{fact.version.versionNumber}} · {{fact.version.id}}</p><p>服务端摘要：{{fact.version.schemaDigest}}</p></section>
</section></template>
<style scoped>.type-model-candidate{margin-top:26px}.type-model-candidate>header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}.type-model-candidate h3{font-size:18px;font-weight:500;margin:0}.candidate-help{color:var(--tl-muted);font-size:12px;line-height:20px}.candidate-facts{display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px 16px;font-size:13px;line-height:20px}.candidate-facts dt{color:var(--tl-muted)}.candidate-facts dd{margin:0;overflow-wrap:anywhere}.candidate-inputs{display:grid;grid-template-columns:1fr 1fr;gap:18px;max-width:650px}.candidate-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}.candidate-actions :deep(.el-button+.el-button){margin-left:0}.candidate-inputs :deep(.el-select){width:100%}.candidate-preview,.candidate-review,.candidate-fact{padding-top:12px;border-top:1px solid var(--tl-border);margin-top:18px}.type-model-candidate h4{font-size:15px;font-weight:500;margin:0 0 14px}.candidate-diff{font-size:13px;overflow-wrap:anywhere}.candidate-review p,.candidate-fact p{overflow-wrap:anywhere;font-size:13px}.type-model-candidate summary{cursor:pointer;font-size:13px}.type-model-candidate pre{max-height:360px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:14px;background:var(--tl-bg);font-size:12px;line-height:19px}.type-model-candidate :deep(.el-alert){margin:12px 0}@media(max-width:600px){.candidate-inputs{grid-template-columns:minmax(0,1fr);gap:0}.candidate-facts{grid-template-columns:100px minmax(0,1fr);gap:8px}}</style>
