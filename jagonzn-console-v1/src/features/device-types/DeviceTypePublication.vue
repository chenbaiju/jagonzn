<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {formatTime} from '@/core/time'
import {typeDeviceUuid} from './type-devices-api'
import {typePublicationTransport,prepareTypePublication,publicationMatchesPreview,sameInitialPublication,type InitialPublication,type TypePublicationIntent,type TypePublicationPreview,type TypePublicationTransport} from './type-publication-api'
const props=withDefaults(defineProps<{typeId:string;typeStatus:string;disabled?:boolean;transport?:TypePublicationTransport}>(),{disabled:false,transport:()=>typePublicationTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||'')),denied=ref(false),readable=computed(()=>member.value&&!denied.value)
const writable=computed(()=>readable.value&&props.typeStatus==='DRAFT'&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const open=ref(false),loading=ref(false),busy=ref(false),review=ref<'unknown'|'rejected'|'acknowledged'>(),error=ref(''),notice=ref(''),currentState=ref(''),ended=ref(false)
const preview=shallowRef<TypePublicationPreview>(),intent=shallowRef<TypePublicationIntent>(),receipt=shallowRef<InitialPublication>(),observed=shallowRef<InitialPublication>(),fact=shallowRef<InitialPublication>()
const locked=computed(()=>busy.value||!!review.value),ready=computed(()=>writable.value&&!props.disabled&&!loading.value&&!locked.value&&!ended.value&&!!preview.value)
let generation=0,alive=true,controller:AbortController|undefined
function clearEditor(){generation++;controller?.abort();open.value=false;loading.value=false;busy.value=false;review.value=undefined;preview.value=undefined;intent.value=undefined;receipt.value=undefined;observed.value=undefined;error.value='';currentState.value=''}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,account:session.user?.accountId,type:props.typeId}}
function current(value:ReturnType<typeof capture>){return alive&&value.generation===generation&&value.epoch===identityEpoch()&&value.project===projectId.value&&value.account===session.user?.accountId&&value.type===props.typeId&&readable.value}
function reset(){clearEditor();denied.value=false;notice.value='';fact.value=undefined;ended.value=false}
function deny(){clearEditor();denied.value=true;notice.value='';fact.value=undefined}
async function loadPreview(){
 if(!readable.value||props.disabled||locked.value||ended.value||props.typeStatus!=='DRAFT')return
 clearEditor();open.value=true;loading.value=true;notice.value='';const state=capture();controller=new AbortController()
 try{const actual=await props.transport.preview(state.project,state.type,controller.signal);if(current(state))preview.value=actual}
 catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status))deny();else error.value=errorMessage(cause)}}finally{if(current(state))loading.value=false}
}
async function loadInitial(){
 if(!readable.value||props.disabled||locked.value||loading.value)return
 generation++;controller?.abort();controller=new AbortController();const state=capture();loading.value=true;error.value='';fact.value=undefined
 try{const actual=await props.transport.initial(state.project,state.type,controller.signal);if(current(state))fact.value=actual}
 catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status))deny();else error.value=errorMessage(cause)}}finally{if(current(state))loading.value=false}
}
function close(){if(busy.value)return;if(review.value)open.value=false;else clearEditor()}
function beforeClose(done:()=>void){if(!busy.value){close();done()}}
function complete(actual:InitialPublication){clearEditor();fact.value=actual;ended.value=true;notice.value='首次发布已完成，发布回执与精确 1.0.0 冻结原件已核对。';emit('changed')}
async function publish(){
 if(!ready.value||!open.value||!preview.value)return
 const original=prepareTypePublication(projectId.value,props.typeId,preview.value);intent.value=original;review.value='unknown';busy.value=true;error.value='';observed.value=undefined;const state=capture();controller=new AbortController()
 try{const returned=await props.transport.publish(original,controller.signal);if(!current(state))return;receipt.value=returned;review.value='acknowledged'
  const actual=await props.transport.initial(original.project,original.typeId,controller.signal);if(!current(state))return;observed.value=actual
  if(!sameInitialPublication(returned,actual)||!publicationMatchesPreview(actual,original.preview))throw new Error('精确首版本原件与本次发布回执不同，请继续只读核对。')
  complete(actual)
 }catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){
  if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}
  error.value=errorMessage(cause);if(!receipt.value&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.status>=400&&cause.status<500)review.value='rejected'
 }}finally{if(current(state))busy.value=false}
}
async function readCurrent(){
 const original=intent.value;if(!original||!review.value||!readable.value||busy.value)return
 const state=capture();controller?.abort();controller=new AbortController();busy.value=true;error.value='';currentState.value='';observed.value=undefined
 try{const actual=await props.transport.initial(original.project,original.typeId,controller.signal);if(!current(state))return;observed.value=actual
  if(receipt.value&&sameInitialPublication(receipt.value,actual)&&publicationMatchesPreview(actual,original.preview))complete(actual)
  else currentState.value=`当前精确首版本与原预览${publicationMatchesPreview(actual,original.preview)?'一致':'不一致'}；这不能证明原请求成功、请求身份或原实际影响数量。`
 }catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status))deny();else if(cause instanceof ApiError&&cause.status===404)currentState.value='本次读取未见精确首版本或其不可见，仍不能判定原请求不会提交或已经失败。';else error.value=errorMessage(cause)}}finally{if(current(state))busy.value=false}
}
function finishCheck(){if(!review.value||busy.value)return;const kind=review.value,actual=observed.value;clearEditor();fact.value=actual;ended.value=kind!=='rejected';notice.value=kind==='rejected'?'本次发布已被拒绝，未自动重发；如需继续，请重新读取并核对预览。':'已结束本次核对；原发布尚未完成成功确认，不证明原请求身份或原影响数量，当前页面不再提交发布。'}
watch([()=>projectId.value,()=>props.typeId,()=>session.user?.accountId,()=>member.value,()=>props.transport],reset,{flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;clearEditor();dispose();emit('locked',false)})
</script>
<template><section class="type-publication">
 <header><h3>首次发布物模型</h3><el-button v-if="readable&&typeStatus==='DRAFT'" type="primary" size="small" :disabled="disabled||locked||ended||loading" @click="loadPreview">预览首次发布</el-button><el-button v-if="readable&&typeStatus==='PUBLISHED'" size="small" :disabled="disabled||locked||loading" :loading="loading" @click="loadInitial">读取首发布原件</el-button></header>
 <p class="publication-help">首次发布会冻结功能定义为 1.0.0，并为现有未绑定设备建立 INITIAL 模型绑定；这是发布操作，不是一般编辑保存。已发布模型保持不可变。</p>
 <p v-if="!readable" role="status">当前账号没有此内容的读取权限。</p><el-alert v-if="notice" :title="notice" type="info" :closable="false"/><el-alert v-if="error&&!open" :title="error" type="error" :closable="false"/>
 <el-alert v-if="review&&!open" title="存在尚未结束的首发布核对，请先核对原操作。" type="warning" :closable="false"><el-button @click="open=true">查看发布核对</el-button></el-alert>
 <div v-if="fact&&readable" class="initial-fact"><p>精确首版本：{{fact.version.versionNumber}} · {{fact.version.id}}</p><p>服务端模型摘要：{{fact.version.schemaDigest}}</p><p>发布时间：{{formatTime(fact.version.publishedAt)}}</p><p class="publication-help">此原件证明首版本存在；单独读取不能证明本人原请求成功或原影响数量。</p><details><summary>查看首版本冻结快照</summary><pre>{{fact.model.text}}</pre></details></div>
 <el-dialog :model-value="open&&readable" title="首次发布物模型" width="min(800px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" :before-close="beforeClose">
  <el-alert v-if="error" :title="error" type="error" :closable="false"/><p v-if="loading" role="status">正在读取草稿原件与真实设备影响…</p>
  <template v-if="preview"><el-alert title="确认后将首次冻结功能定义并初始化现有未绑定设备，不可作为一般保存；当前不提供模型回退。预览只提供原件与影响，发布时仍由服务端执行完整校验。" type="warning" :closable="false"/>
   <dl class="publication-facts"><dt>类型ID</dt><dd>{{preview.deviceTypeId}}</dd><dt>首版本</dt><dd>{{preview.versionNumber}}</dd><dt>{{review?'原预览设备数':'当前关联设备数'}}</dt><dd>{{preview.deviceCount}} 台{{review?'（不作为原实际初始化数量证明）':'，本次现有未绑定设备的 INITIAL 候选数量'}}</dd><dt>模型摘要</dt><dd>{{preview.schemaDigest}}</dd><dt>模型摘要算法</dt><dd>{{preview.digestAlgorithm}}</dd><dt>独立预览摘要</dt><dd>{{preview.previewDigest}}</dd><dt>预览摘要算法</dt><dd>{{preview.previewDigestAlgorithm}}</dd></dl>
   <p>属性 {{preview.model.counts.properties}} 项 · 事件 {{preview.model.counts.events}} 项 · 命令 {{preview.model.counts.commands}} 项</p><details><summary>查看待冻结模型快照</summary><pre aria-label="首次发布预览快照">{{preview.model.text}}</pre></details>
  </template>
  <template v-if="review"><el-alert :title="review==='unknown'?'原发布结果未知，不会再次提交；请只读精确首版本核对，当前同值不证明原请求成功。':review==='rejected'?'本次发布被拒绝，原预览与请求键已保留；不会自动重发。':'已收到与原预览一致的发布响应，仍需核对精确首版本原件。'" type="warning" :closable="false"/><p v-if="intent" class="publication-help">原发布请求键：{{intent.key}}</p><p v-if="observed">当前首版本ID：{{observed.version.id}}</p><p v-if="currentState">{{currentState}}</p><el-button :loading="busy" @click="readCurrent">读取精确首版本</el-button><el-button :disabled="busy" @click="finishCheck">结束本次核对</el-button></template>
  <el-button v-else-if="!loading&&error" :disabled="disabled" @click="loadPreview">重新读取预览</el-button>
  <p v-if="!writable&&!review&&preview" class="publication-help">当前角色或类型状态仅允许读取预览。</p>
  <template #footer><el-button :disabled="busy" @click="close">{{review?'关闭':'取消'}}</el-button><el-button v-if="!review&&writable" type="primary" :disabled="!ready" :loading="busy" @click="publish">确认首次发布</el-button></template>
 </el-dialog>
</section></template>
<style scoped>.type-publication{margin-top:26px}.type-publication>header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}.type-publication h3{font-size:18px;font-weight:500;margin:0}.publication-help{color:var(--tl-muted);font-size:12px;line-height:20px}.publication-facts{display:grid;grid-template-columns:130px minmax(0,1fr);gap:9px 14px;font-size:13px;line-height:20px}.publication-facts dt{color:var(--tl-muted)}.publication-facts dd{margin:0;overflow-wrap:anywhere}.initial-fact p{overflow-wrap:anywhere;font-size:13px}.type-publication summary{cursor:pointer;font-size:13px}.type-publication pre{max-height:400px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:14px;background:var(--tl-bg);font-size:12px;line-height:19px}.type-publication :deep(.el-alert){margin:12px 0}@media(max-width:600px){.publication-facts{grid-template-columns:100px minmax(0,1fr);gap:8px}}</style>
