<script setup lang="ts">
import {copySucceeded,copyFailed} from '@/ui/copy-feedback'
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {typeDeviceUuid} from './type-devices-api'
import {productCredentialTransport,prepareProductCredential,type ProductCredential,type ProductCredentialFact,type ProductCredentialIntent,type ProductCredentialTransport} from './product-credentials-api'
const props=withDefaults(defineProps<{typeId:string;typeStatus:string;deviceKind:string;productKey?:string|null;disabled?:boolean;transport?:ProductCredentialTransport}>(),{disabled:false,transport:()=>productCredentialTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const readDenied=ref(false),writeDenied=ref(false),member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const readable=computed(()=>member.value&&!readDenied.value),writable=computed(()=>readable.value&&!writeDenied.value&&can('device:update')&&props.typeStatus==='PUBLISHED'&&['DIRECT','GATEWAY'].includes(props.deviceKind)&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const confirmation=ref(false),busy=ref(false),unknown=ref(false),ended=ref(false),error=ref(''),notice=ref('')
const credential=shallowRef<ProductCredential>(),intent=shallowRef<ProductCredentialIntent>(),fact=shallowRef<ProductCredentialFact>()
const locked=computed(()=>confirmation.value||busy.value||unknown.value||!!credential.value),canOpen=computed(()=>writable.value&&!props.disabled&&!locked.value&&!ended.value),knownKey=computed(()=>credential.value?.productKey??fact.value?.productKey??props.productKey??null)
let generation=0,alive=true,controller:AbortController|undefined,changedPending=false
function clear(){generation++;controller?.abort();credential.value=undefined;intent.value=undefined;fact.value=undefined;confirmation.value=false;busy.value=false;unknown.value=false;ended.value=false;error.value='';notice.value='';changedPending=false}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,account:session.user?.accountId,type:props.typeId}}
function current(value:ReturnType<typeof capture>){return alive&&value.generation===generation&&value.epoch===identityEpoch()&&value.project===projectId.value&&value.account===session.user?.accountId&&value.type===props.typeId&&readable.value}
function open(){if(!canOpen.value)return;error.value='';notice.value='';confirmation.value=true}
function cancel(){if(busy.value)return;confirmation.value=false;error.value=''}
function closeSecret(){generation++;credential.value=undefined;notice.value='本次明文已清除，关闭后不能再次查看。';if(changedPending){changedPending=false;emit('changed')}}
async function generate(){
 if(!confirmation.value||!writable.value||props.disabled||busy.value||unknown.value||credential.value||ended.value)return
 let original:ProductCredentialIntent
 try{original=prepareProductCredential(projectId.value,props.typeId,knownKey.value)}catch(cause){error.value=errorMessage(cause);return}
 intent.value=original;unknown.value=true;confirmation.value=false;busy.value=true;error.value='';notice.value='';fact.value=undefined;const state=capture();controller=new AbortController()
 try{const result=await props.transport.generate(original,controller.signal);if(!current(state))return
  if(!writable.value){notice.value='接口已返回，但当前写权限不允许展示明文。请只读核对公开事实；明文不能找回。';return}
  credential.value=result;fact.value=Object.freeze({id:state.type,projectId:state.project,productKey:result.productKey});unknown.value=false;intent.value=undefined;changedPending=true
 }catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){
  if(cause instanceof ApiError&&[401,403].includes(cause.status)&&!cause.outcomeUnknown){writeDenied.value=true;unknown.value=false;intent.value=undefined}
  error.value=cause instanceof ApiError&&cause.code===10014?'原操作已有不可回放结果，秘密不会重新返回；请只读核对公开事实。':'产品凭据生成或轮换未完成结果核对；不会重新提交，请只读核对公开事实。'
 }}finally{if(current(state))busy.value=false}
}
async function readPublicFact(){
 if(!readable.value||busy.value||credential.value||confirmation.value)return
 busy.value=true;error.value='';const state=capture();controller?.abort();controller=new AbortController()
 try{const actual=await props.transport.read(state.project,state.type,controller.signal);if(current(state)){fact.value=actual;notice.value='已读取公开产品标识；同值、变化或未提供标识都不能证明原轮换结果，也不能恢复秘密。'}}
 catch(cause){if(current(state)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status)){clear();readDenied.value=true}else error.value='公开产品资料暂不可读，原操作结果仍未确认。'}}finally{if(current(state))busy.value=false}
}
function finish(){if(!unknown.value||busy.value)return;unknown.value=false;intent.value=undefined;ended.value=true;error.value='';notice.value='已结束本次核对；原结果仍未确认，未重发，明文无法找回。新的轮换需刷新页面后另行确认。'}
async function copy(){
 if(!credential.value||!writable.value||!readable.value)return
 const state=capture()
 try{await navigator.clipboard.writeText(credential.value.productSecret);if(current(state)&&credential.value&&writable.value)copySucceeded('已复制本次密钥，请妥善保存。')}catch{if(current(state)&&credential.value&&writable.value)copyFailed('复制未完成，请在关闭前手动保存本次明文。')}
}
function reset(){clear();readDenied.value=false;writeDenied.value=false}
watch([()=>projectId.value,()=>props.typeId,()=>session.user?.accountId,()=>member.value,()=>props.transport],reset,{immediate:true,flush:'sync'})
watch(writable,value=>{if(!value){if(credential.value)closeSecret();confirmation.value=false}}, {flush:'sync'})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;clear();dispose();emit('locked',false)})
</script>
<template><section class="type-product-credentials">
 <h3>产品凭据</h3>
 <p v-if="!readable" role="status">当前账号没有此内容的读取权限。</p>
 <template v-else><p class="credential-help">一型一密用于已发布直连设备或网关类型的 HTTPS 动态注册。产品标识公开，产品密钥只在生成或轮换响应中展示一次；轮换不作废已签发的设备凭据。</p><p>公开产品标识：<span>{{knownKey||'当前资料未提供'}}</span></p>
  <p v-if="deviceKind==='SUB_DEVICE'" class="credential-help">子设备不能生成独立产品凭据。</p><p v-else-if="typeStatus!=='PUBLISHED'" class="credential-help">类型首次发布后才可生成产品凭据。</p><p v-else-if="!writable" class="credential-help">当前角色或项目状态仅允许读取公开资料。</p>
  <el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
  <section v-if="unknown" class="credential-review"><el-alert title="原生成或轮换结果未知，不能再次提交。读取公开标识不代表轮换成功，旧秘密也无法回显。" type="warning" :closable="false"/><p>原请求键：{{intent?.key}}</p><el-button :loading="busy" @click="readPublicFact">读取公开产品事实</el-button><el-button :disabled="busy" @click="finish">结束本次核对</el-button></section>
  <div class="credential-actions">
   <el-button v-if="!unknown&&!credential&&!confirmation" size="small" :disabled="disabled||busy" :loading="busy" @click="readPublicFact">刷新公开产品标识</el-button>
   <el-button v-if="writable" size="small" :disabled="!canOpen" @click="open">{{knownKey?'轮换产品密钥':'生成产品凭据'}}</el-button>
  </div>
 </template>
 <el-dialog :model-value="confirmation&&readable&&writable" title="确认生成或轮换产品密钥" width="min(580px,94vw)" :close-on-click-modal="false" @close="cancel"><p>此请求会生成或轮换本类型产品密钥；如已有产品密钥，原密钥将失效，后继设备注册须使用新密钥。已签发设备凭据及当前连接保持。</p><p>明文只在本次响应中展示，关闭后无法找回；结果未知时不会自动再次生成。</p><template #footer><el-button @click="cancel">取消</el-button><el-button type="primary" :disabled="disabled||!writable||busy" @click="generate">确认生成或轮换</el-button></template></el-dialog>
 <el-dialog v-if="credential&&readable&&writable" :model-value="true" title="本次产品密钥（仅显示一次）" width="min(640px,94vw)" :close-on-click-modal="false" :before-close="(done:()=>void)=>{closeSecret();done()}" destroy-on-close><el-alert title="请在关闭前妥善保存。关闭、切换范围或失去写权限后立即清除明文，不能再次查看旧密钥。" type="warning" :closable="false"/><p>产品标识：{{credential.productKey}}</p><el-input :model-value="credential.productSecret" aria-label="本次产品密钥" type="password" show-password readonly autocomplete="new-password"/><template #footer><el-button @click="copy">复制本次密钥</el-button><el-button type="primary" @click="closeSecret">关闭并清除明文</el-button></template></el-dialog>
</section></template>
<style scoped>
.type-product-credentials { margin-bottom: 26px; }
.type-product-credentials h3 { margin: 0 0 5px; color: var(--tl-text); font-size: 14px; font-weight: 600; line-height: 20px; }
.type-product-credentials p { margin: 0 0 10px; overflow-wrap: anywhere; line-height: 18px; }
.credential-help { color: var(--tl-muted); }
.credential-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.credential-actions .el-button { margin: 0; }
.type-product-credentials :deep(.el-alert) { margin: 12px 0; }
.credential-review { margin-top: 16px; }
.credential-review .el-button { margin-top: 8px; }
</style>
