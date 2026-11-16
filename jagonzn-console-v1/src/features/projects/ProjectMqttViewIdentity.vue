<script setup lang="ts">
import {copySucceeded,copyFailed} from '@/ui/copy-feedback'
import {computed,nextTick,onBeforeUnmount,onMounted,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {onBeforeRouteLeave,onBeforeRouteUpdate} from 'vue-router'
import {DocumentCopy} from '@element-plus/icons-vue'
import {currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,identityEpoch,onIdentityChange} from '@/core/http'
import {projectMqttViewError,readProjectMqttViewCredentials,readProjectMqttViewIdentity,prepareProjectMqttViewRotation,rotateProjectMqttView,readProjectMqttViewRotation,projectMqttViewRotationError,type ProjectMqttViewIdentity,type ProjectMqttViewCredentials,type ProjectMqttViewRotationIntent,type ProjectMqttViewOperation} from './project-mqtt-view-api'
const permitted=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&!!projectId.value&&currentProject.value?.status==='ACTIVE'
 &&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const unconfirmed=ref(false),denied=ref(false),allowed=computed(()=>permitted.value&&!denied.value)
const metadata=shallowRef<ProjectMqttViewIdentity>(),material=shallowRef<ProjectMqttViewCredentials>()
const busy=ref(false),copying=ref(false),error=ref(''),notice=ref('')
const shown=ref(false),rotation=ref<'idle'|'confirm'|'preparing'|'writing'|'unknown'|'checking'|'rejected'|'confirmed'>('idle'),rotationError=ref('')
const expected=shallowRef<ProjectMqttViewIdentity>(),intent=shallowRef<ProjectMqttViewRotationIntent>(),receipt=shallowRef<ProjectMqttViewOperation>()
const working=computed(()=>['preparing','writing','checking'].includes(rotation.value))
const blocked=computed(()=>allowed.value&&(working.value||rotation.value==='unknown'))
const readingAllowed=computed(()=>allowed.value&&!working.value&&!['confirm','unknown','rejected'].includes(rotation.value))
let generation=0,rotationGeneration=0,disposed=false,sent=false,controller:AbortController|undefined,rotationController:AbortController|undefined
function clear(all=true){generation++;controller?.abort();material.value=undefined;busy.value=false;copying.value=false;error.value='';notice.value='';if(all)metadata.value=undefined}
function resetRotation(){rotationGeneration++;rotationController?.abort();shown.value=false;rotation.value='idle';expected.value=undefined;intent.value=undefined;receipt.value=undefined;rotationError.value='';sent=false}
function reset(){clear();resetRotation();denied.value=false;unconfirmed.value=false}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,account:session.user?.accountId}}
function current(s:ReturnType<typeof capture>){return !disposed&&allowed.value&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.account===session.user?.accountId}
function rotationCapture(){return{generation:rotationGeneration,epoch:identityEpoch(),project:projectId.value,account:session.user?.accountId}}
function rotationCurrent(s:ReturnType<typeof rotationCapture>){return !disposed&&allowed.value&&s.generation===rotationGeneration&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.account===session.user?.accountId}
function deny(){const unknown=sent&&rotation.value!=='confirmed';clear();resetRotation();denied.value=true;if(unknown)unconfirmed.value=true}
async function reload(){
 if(!readingAllowed.value)return
 clear();const s=capture();controller=new AbortController();busy.value=true
 try{const value=await readProjectMqttViewIdentity(s.project,controller.signal);if(current(s))metadata.value=value}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status))deny();error.value=projectMqttViewError(cause)}}finally{if(current(s))busy.value=false}
}
async function readMaterial(){
 if(!readingAllowed.value||busy.value||copying.value||metadata.value?.status!=='ACTIVE')return
 const value=metadata.value;clear(false);const s=capture();controller=new AbortController();busy.value=true
 try{const result=await readProjectMqttViewCredentials(value,controller.signal);if(current(s)&&metadata.value===value)material.value=result}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){material.value=undefined;metadata.value=undefined;if(cause instanceof ApiError&&[401,403].includes(cause.status))deny();error.value=projectMqttViewError(cause)}}finally{if(current(s))busy.value=false}
}
async function copy(kind:'projectViewKey'|'projectViewSecret'){
 if(!readingAllowed.value||busy.value||copying.value||error.value||!material.value||!metadata.value)return
 const value=material.value,s=capture();copying.value=true;notice.value=''
 try{await navigator.clipboard.writeText(value[kind]);if(current(s)&&material.value===value)copySucceeded(kind==='projectViewKey'?'已复制 ProjectViewKey':'已复制 ProjectViewSecret')}
 catch{if(current(s)&&material.value===value)copyFailed('复制失败，请检查浏览器剪贴板权限后重试')}finally{if(current(s))copying.value=false}
}
function openRotation(){
 if(!allowed.value||busy.value||copying.value||working.value)return
 if(rotation.value==='unknown'){shown.value=true;return}
 if(rotation.value!=='idle'||metadata.value?.status!=='ACTIVE'||BigInt(metadata.value.revision)===9223372036854775807n)return
 const value={...metadata.value};clear(false);resetRotation();expected.value=value;rotation.value='confirm';shown.value=true
}
function closeRotation(){if(working.value)return;if(rotation.value==='unknown')shown.value=false;else resetRotation()}
function confirmed(value:ProjectMqttViewOperation){receipt.value=value;unconfirmed.value=false;rotation.value='confirmed';rotationError.value='';clear();notice.value='本次重置已确认，请重新读取当前身份后获取凭据'}
async function submitRotation(){
 if(!allowed.value||rotation.value!=='confirm'||!shown.value||!expected.value)return
 rotation.value='preparing';rotationError.value='';const s=rotationCapture()
 try{
  const value=await prepareProjectMqttViewRotation(expected.value)
  if(!rotationCurrent(s)||rotation.value!=='preparing')return
  intent.value=value;rotationController=new AbortController();rotation.value='writing';sent=true
  const result=await rotateProjectMqttView(value,rotationController.signal)
  if(rotationCurrent(s))confirmed(result)
 }catch(cause){if(rotationCurrent(s)&&!(cause instanceof IdentityChanged)){
  if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}
  rotation.value=!sent||cause instanceof ApiError&&!cause.outcomeUnknown&&[400,409,413,422,429].includes(cause.status)?'rejected':'unknown'
  rotationError.value=rotation.value==='rejected'?'本次重置未被接受，请重新读取身份后确认':projectMqttViewRotationError(cause)
 }}
}
async function recoverRotation(){
 if(!allowed.value||rotation.value!=='unknown'||!intent.value)return
 const original=intent.value,s=rotationCapture();rotation.value='checking';rotationError.value='';rotationController=new AbortController()
 try{const value=await readProjectMqttViewRotation(original,rotationController.signal);if(rotationCurrent(s))confirmed(value)}
 catch(cause){if(rotationCurrent(s)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}rotation.value='unknown';rotationError.value=projectMqttViewRotationError(cause)}}
}
function finishUnknown(){if(rotation.value!=='unknown'||!allowed.value)return;resetRotation();clear();unconfirmed.value=true}
async function rereadRejected(){if(rotation.value!=='rejected'||!allowed.value)return;resetRotation();await reload()}
const dispose=onIdentityChange(reset)
onScopeDispose(()=>{disposed=true;reset();dispose()})
function scheduleRead(){const next=generation;if(allowed.value)void nextTick(()=>{if(!disposed&&next===generation&&readingAllowed.value)void reload()})}
watch([()=>projectId.value,()=>session.user?.accountId],()=>{reset();scheduleRead()},{immediate:true,flush:'sync'})
/** 同范围且仍是管理者时，秘密读取失效与已发出的重置原件分别处理。 */
watch([()=>session.user?.projectRole,()=>currentProject.value?.myRole,()=>currentProject.value?.status,()=>permitted.value],()=>{
 const unresolved=sent&&rotation.value!=='confirmed'
 clear()
 if(!permitted.value){resetRotation();denied.value=false;if(unresolved)unconfirmed.value=true;return}
 if(rotation.value!=='idle')return
 denied.value=false;scheduleRead()
},{flush:'sync'})
onBeforeRouteLeave(()=>!blocked.value);onBeforeRouteUpdate(()=>!blocked.value)
function beforeUnload(event:BeforeUnloadEvent){if(blocked.value){event.preventDefault();event.returnValue=''}}
onMounted(()=>window.addEventListener('beforeunload',beforeUnload));onBeforeUnmount(()=>window.removeEventListener('beforeunload',beforeUnload))
</script>
<template><section class="mqtt-view-identity" aria-label="应用端 MQTT 订阅身份">
 <h2>应用端 MQTT 订阅身份</h2>
 <p class="tips">读取已有项目订阅凭据；需要更换密码时，可明确确认重置。身份管理不代表协议已启用或已连接。</p>
 <p v-if="!allowed" role="status">当前账号没有订阅身份的读取权限</p>
 <p v-if="unconfirmed" role="status">原重置结果尚未确认；不会重新提交。</p><p v-if="notice" role="status">{{notice}}</p><p v-if="error" role="alert">{{error}}</p>
 <template v-if="allowed">
  <p v-if="busy" role="status">正在读取订阅身份…</p>
  <template v-if="metadata"><p role="status">{{metadata.status==='ACTIVE'?'订阅身份可用':'订阅身份已撤销'}}；修订 {{metadata.revision}}</p>
   <el-button v-if="metadata.status==='ACTIVE'" size="small" :disabled="busy||copying||!readingAllowed" @click="readMaterial">读取现有凭据</el-button>
   <el-button v-if="metadata.status==='ACTIVE'&&metadata.revision!=='9223372036854775807'&&rotation==='idle'" size="small" :disabled="busy||copying" @click="openRotation">重置 ProjectViewSecret</el-button>
  </template>
  <div v-if="material&&!busy&&!error&&readingAllowed" class="credential-actions">
   <el-button size="small" :icon="DocumentCopy" :disabled="copying" @click="copy('projectViewKey')">复制 ProjectViewKey</el-button>
   <el-button size="small" :icon="DocumentCopy" :disabled="copying" @click="copy('projectViewSecret')">复制 ProjectViewSecret</el-button>
   <el-button size="small" @click="clear(false)">清除已读取凭据</el-button>
  </div>
  <el-button v-if="rotation==='unknown'&&!shown" size="small" @click="openRotation">核对本次重置结果</el-button>
  <el-button class="refresh" size="small" :disabled="busy||!readingAllowed" @click="reload">重新读取身份</el-button>
 </template>
 <el-dialog :model-value="shown" title="重置项目订阅密码" width="min(520px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!working" :before-close="(done:()=>void)=>{if(!working){closeRotation();done()}}" destroy-on-close>
  <p>重置后现有密码将失效，使用该密码的应用需要更新连接配置。ProjectViewKey 保持不变。</p>
  <p v-if="rotationError" role="alert">{{rotationError}}</p>
  <p v-if="rotation==='unknown'||rotation==='checking'" role="status">重置结果尚未确认。只读取本次操作原件，不会重新提交。</p>
  <p v-if="rotation==='rejected'" role="status">请重新读取当前身份，再决定是否发起新的重置。</p>
  <p v-if="receipt" role="status">本次重置已确认；原结果修订 {{receipt.revision}}。当前凭据请另行读取。</p>
  <template #footer>
   <el-button :disabled="working" @click="closeRotation">{{rotation==='confirm'?'取消':'关闭'}}</el-button>
   <el-button v-if="rotation==='confirm'||rotation==='preparing'||rotation==='writing'" type="primary" :loading="working" :disabled="working||!allowed" @click="submitRotation">确认重置</el-button>
   <template v-if="rotation==='unknown'||rotation==='checking'"><el-button :loading="working" :disabled="working||!allowed" @click="recoverRotation">读取本次操作原件</el-button><el-button :disabled="working||!allowed" @click="finishUnknown">结束核对（结果未确认）</el-button></template>
   <el-button v-if="rotation==='rejected'" :disabled="!allowed" @click="rereadRejected">读取当前身份</el-button>
  </template>
 </el-dialog>
</section></template>
<style scoped>
.mqtt-view-identity{margin-top:32px}.mqtt-view-identity h2{margin:10px 0 0;font-size:22px;line-height:32px;font-weight:400;color:#002822}.tips{margin:8px 0 0;font-size:15px;line-height:22px;color:#888}.credential-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:12px}.credential-actions .el-button+.el-button{margin-left:0}.refresh{margin-top:12px}.mqtt-view-identity [role=status],.mqtt-view-identity [role=alert]{font-size:14px;line-height:24px;color:#909399}
</style>
