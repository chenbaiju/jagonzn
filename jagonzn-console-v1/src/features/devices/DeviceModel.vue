<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import AsyncState from '@/ui/AsyncState.vue'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {modelUpgradeTransport,modelVersionForward,modelUpgradeTargetObserved,prepareModelUpgrade,type ModelUpgradeIntent,type ModelUpgradeObservation,type ModelUpgradeReceipt,type ModelUpgradeTransport} from './model-upgrade-api'
const props=withDefaults(defineProps<{deviceId:string;disabled?:boolean;transport?:ModelUpgradeTransport}>(),{disabled:false,transport:()=>modelUpgradeTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.deviceId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||'')),denied=ref(false)
const readable=computed(()=>member.value&&!denied.value),writable=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const resource=useResource(signal=>props.transport.preview(projectId.value,props.deviceId,signal)),open=ref(false),busy=ref(false),review=ref<'unknown'|'rejected'|'acknowledged'>(),error=ref(''),notice=ref(''),ended=ref(false)
const intent=shallowRef<ModelUpgradeIntent>(),receipt=shallowRef<ModelUpgradeReceipt>(),observed=shallowRef<ModelUpgradeObservation>()
const locked=computed(()=>busy.value||!!review.value),canUpgrade=computed(()=>!!resource.data.value&&modelVersionForward(resource.data.value.current.version,resource.data.value.target.version))
let generation=0,alive=true,controller:AbortController|undefined
function clearEditor(){generation++;controller?.abort();open.value=false;busy.value=false;review.value=undefined;error.value='';intent.value=undefined;receipt.value=undefined;observed.value=undefined}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,account:session.user?.accountId,device:props.deviceId}}
function current(value:ReturnType<typeof capture>){return alive&&value.generation===generation&&value.epoch===identityEpoch()&&value.project===projectId.value&&value.account===session.user?.accountId&&value.device===props.deviceId&&readable.value}
function reset(){clearEditor();resource.clear();denied.value=false;notice.value='';ended.value=false;if(member.value)void resource.reload()}
function deny(){clearEditor();resource.clear();denied.value=true;notice.value=''}
function reload(){if(!readable.value||props.disabled||locked.value)return;resource.clear();void resource.reload()}
function start(){if(!writable.value||props.disabled||locked.value||ended.value||resource.loading.value||resource.error.value||!resource.data.value||!canUpgrade.value)return;clearEditor();intent.value=prepareModelUpgrade(projectId.value,props.deviceId,resource.data.value);open.value=true;notice.value=''}
function close(){if(busy.value)return;if(review.value)open.value=false;else clearEditor()}
function beforeClose(done:()=>void){if(!busy.value){close();done()}}
function complete(){clearEditor();resource.clear();notice.value='物模型绑定已升级，原转换回执与目标版本均已核对。';emit('changed');if(readable.value)void resource.reload()}
async function upgrade(){
 const original=intent.value;if(!original||!open.value||!writable.value||props.disabled||locked.value||ended.value)return
 const state=capture();controller=new AbortController();busy.value=true;review.value='unknown';error.value='';observed.value=undefined
 try{const returned=await props.transport.upgrade(original,controller.signal);if(!current(state))return;receipt.value=returned;review.value='acknowledged'
  const actual=await props.transport.observe(original,controller.signal);if(!current(state))return;observed.value=actual
  if(!modelUpgradeTargetObserved(actual,original))throw new Error('已取得原升级转换回执，但当前绑定已不是原目标；请核对当前版本。')
  complete()
 }catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){
  if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}
  error.value=errorMessage(cause);if(!receipt.value&&cause instanceof ApiError&&!cause.outcomeUnknown&&cause.status>=400&&cause.status<500)review.value='rejected'
 }}finally{if(current(state))busy.value=false}
}
async function readCurrent(){
 const original=intent.value;if(!original||!review.value||!readable.value||busy.value)return
 const state=capture();controller?.abort();controller=new AbortController();busy.value=true;error.value='';observed.value=undefined
 try{const actual=await props.transport.observe(original,controller.signal);if(!current(state))return;observed.value=actual;if(receipt.value&&modelUpgradeTargetObserved(actual,original))complete()}
 catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status))deny();else error.value=errorMessage(cause)}}finally{if(current(state))busy.value=false}
}
function finishCheck(){if(busy.value||!review.value)return;const kind=review.value,confirmed=!!receipt.value;clearEditor();ended.value=kind==='unknown';resource.clear();notice.value=confirmed?'已核对原转换回执；当前绑定请以重新读取结果为准。':kind==='rejected'?'本次升级已被拒绝，未自动重发；重新读取后可重新预览。':'已结束本次核对；原升级结果仍未确认，未标记成功，当前页面不再提交升级。';if(confirmed)emit('changed');if(readable.value)void resource.reload()}
watch([()=>projectId.value,()=>props.deviceId,()=>session.user?.accountId,()=>member.value,()=>props.transport],reset,{immediate:true,flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(()=>{clearEditor();resource.clear();notice.value='';ended.value=false});onScopeDispose(()=>{alive=false;clearEditor();dispose();emit('locked',false)})
</script>
<template><section class="device-model">
 <p class="model-note">物模型版本用于解释设备数据。显式升级只改变本设备的绑定；当前仅支持同类型向前升级，不提供回退，也不执行固件升级。</p>
 <el-alert v-if="notice" :title="notice" type="info" :closable="false"/><el-alert v-if="review&&!open" title="存在尚未结束的模型升级核对，请先核对原操作。" type="warning" :closable="false"><el-button @click="open=true">查看升级核对</el-button></el-alert>
 <AsyncState :forbidden="!readable||resource.error.value instanceof ApiError&&[401,403].includes(resource.error.value.status)" :loading="resource.loading.value" :error="resource.error.value" @retry="reload"><template v-if="resource.data.value">
  <div class="model-versions"><section><h3>当前绑定版本</h3><dl><dt>版本号</dt><dd>{{resource.data.value.current.version.versionNumber}}</dd><dt>版本ID</dt><dd>{{resource.data.value.current.version.id}}</dd><dt>快照摘要</dt><dd>{{resource.data.value.current.version.schemaDigest}}</dd><dt>发布时间</dt><dd>{{formatTime(resource.data.value.current.version.publishedAt)}}</dd></dl><details><summary>查看当前冻结快照</summary><pre>{{resource.data.value.current.text}}</pre></details></section>
  <section><h3>本次读取的最新版本</h3><dl><dt>版本号</dt><dd>{{resource.data.value.target.version.versionNumber}}</dd><dt>版本ID</dt><dd>{{resource.data.value.target.version.id}}</dd><dt>快照摘要</dt><dd>{{resource.data.value.target.version.schemaDigest}}</dd><dt>发布时间</dt><dd>{{formatTime(resource.data.value.target.version.publishedAt)}}</dd></dl><details><summary>查看目标冻结快照</summary><pre>{{resource.data.value.target.text}}</pre></details></section></div>
  <p v-if="!canUpgrade">当前绑定已是本次读取的最新版本。</p><div class="tl-form-actions"><el-button :disabled="disabled||locked" :loading="resource.loading.value" @click="reload">刷新版本</el-button><el-button v-if="writable" type="primary" :disabled="disabled||locked||ended||!canUpgrade" @click="start">显式升级绑定</el-button></div>
 </template></AsyncState>
 <el-dialog :model-value="open&&readable" title="升级物模型绑定" width="min(740px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" :before-close="beforeClose">
  <el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <template v-if="intent"><el-alert title="此操作只升级当前设备的模型绑定。请核对精确版本与目标快照；当前不提供回退，不代表已完成设备兼容性评估。" type="warning" :closable="false"/>
   <dl class="upgrade-facts"><dt>设备ID</dt><dd>{{intent.device}}</dd><dt>设备类型ID</dt><dd>{{intent.typeId}}</dd><dt>预期当前版本</dt><dd>{{intent.current.versionNumber}} · {{intent.body.expectedCurrentVersionId}}</dd><dt>当前摘要</dt><dd>{{intent.current.schemaDigest}}</dd><dt>目标版本</dt><dd>{{intent.target.versionNumber}} · {{intent.body.targetVersionId}}</dd><dt>目标摘要</dt><dd>{{intent.target.schemaDigest}}</dd><dt>本次转换键</dt><dd>{{intent.body.transitionKey}}</dd></dl>
   <template v-if="review"><el-alert :title="review==='unknown'?'原升级结果未知，不会再次提交。读取当前绑定只能核对现状，不能证明原请求成功。':review==='rejected'?'本次升级被拒绝，预期版本、目标和原转换键已保留；不会自动重发。':'已取得与原转换键匹配的有效升级回执，正在核对当前绑定。'" type="warning" :closable="false"/><p v-if="receipt">原转换回执：{{receipt.id}}；生效时间 {{formatTime(receipt.effectiveAt)}}</p><p v-if="observed">当前读取：类型 {{observed.binding.deviceTypeId}}，版本 {{observed.binding.version.versionNumber}}（{{observed.binding.version.id}}）。{{!receipt?'这不能证明原升级请求的历史结果。':''}}</p><el-button :loading="busy" @click="readCurrent">读取当前绑定</el-button><el-button :disabled="busy" @click="finishCheck">结束本次核对</el-button></template>
  </template>
  <template #footer><el-button :disabled="busy" @click="close">{{review?'关闭':'取消'}}</el-button><el-button v-if="!review" type="primary" :disabled="!writable||disabled" :loading="busy" @click="upgrade">确认升级</el-button></template>
 </el-dialog>
</section></template>
<style scoped>.model-note{color:var(--tl-muted);font-size:13px;line-height:21px}.model-versions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.model-versions h3{font-size:16px;font-weight:500}.model-versions dl,.upgrade-facts{display:grid;grid-template-columns:110px minmax(0,1fr);gap:9px 12px;font-size:13px;line-height:20px}.model-versions dt,.upgrade-facts dt{color:var(--tl-muted)}.model-versions dd,.upgrade-facts dd{margin:0;overflow-wrap:anywhere}.model-versions summary{cursor:pointer;font-size:13px}.model-versions pre{max-height:340px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;background:var(--tl-bg);font-size:12px;line-height:19px}@media(max-width:720px){.model-versions{grid-template-columns:minmax(0,1fr);gap:12px}.upgrade-facts{grid-template-columns:95px minmax(0,1fr)}}</style>
