<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {typeDeviceUuid} from './type-devices-api'
import {prepareOnlinePolicy,onlinePolicyTransport,type OnlinePolicy,type OnlinePolicyIntent,type OnlinePolicyTransport} from './online-policy-api'
const props=withDefaults(defineProps<{typeId:string;disabled?:boolean;compact?:boolean;transport?:OnlinePolicyTransport}>(),{disabled:false,compact:false,transport:()=>onlinePolicyTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const denied=ref(false),readable=computed(()=>!denied.value&&session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const writable=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const value=shallowRef<OnlinePolicy>(),intent=shallowRef<OnlinePolicyIntent>(),observed=shallowRef<OnlinePolicy>(),shown=ref(false),busy=ref(false),unknown=ref(false),draft=ref(false),minutes=ref<number>(),error=ref(''),notice=ref('')
let generation=0,alive=true,controller:AbortController|undefined
const locked=computed(()=>shown.value||busy.value||unknown.value)
function clear(){generation++;controller?.abort();value.value=undefined;intent.value=undefined;observed.value=undefined;shown.value=false;busy.value=false;unknown.value=false;error.value='';notice.value=''}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,type:props.typeId,account:session.user?.accountId}}
function current(s:ReturnType<typeof capture>){return alive&&readable.value&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.type===props.typeId&&s.account===session.user?.accountId}
async function load(review=false){
 if(!readable.value||busy.value||unknown.value&&!review)return
 const s=capture();busy.value=true;error.value='';controller=new AbortController()
 try{const actual=await props.transport.read(s.project,s.type,controller.signal);if(!current(s))return;if(review)observed.value=actual;else value.value=actual}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){clear();denied.value=true}else error.value=errorMessage(cause)}}
 finally{if(current(s))busy.value=false}
}
function open(){if(!writable.value||props.disabled||busy.value||unknown.value||!value.value)return;draft.value=value.value.onlineTimeoutMinutes!==null;minutes.value=value.value.onlineTimeoutMinutes??undefined;error.value='';notice.value='';shown.value=true}
function cancel(){if(!busy.value)shown.value=false}
async function save(){
 if((!shown.value&&!props.compact)||!writable.value||props.disabled||busy.value||unknown.value||!value.value)return
 let chosen:OnlinePolicyIntent;try{chosen=prepareOnlinePolicy(projectId.value,props.typeId,value.value,draft.value,minutes.value)}catch(cause){error.value=errorMessage(cause);return}intent.value=chosen;unknown.value=true;shown.value=false;busy.value=true;error.value='';observed.value=undefined
 const s=capture();controller=new AbortController();let accepted=false
 try{
  const returned=await props.transport.change(chosen,controller.signal);accepted=true;if(!current(s))return
  const expected=BigInt(chosen.body.revision)+(value.value.onlineTimeoutMinutes===chosen.body.onlineTimeoutMinutes?0n:1n)
  if(returned.deviceTypeId!==chosen.typeId||returned.revision!==String(expected)||returned.onlineTimeoutMinutes!==chosen.body.onlineTimeoutMinutes)throw new Error('保存回执与原策略不符，请读取当前配置核对')
  const actual=await props.transport.read(chosen.project,chosen.typeId,controller.signal);if(!current(s))return
  if(actual.revision!==returned.revision||actual.onlineTimeoutMinutes!==returned.onlineTimeoutMinutes)throw new Error('策略已变化，请读取当前配置核对')
  value.value=actual;unknown.value=false;intent.value=undefined;notice.value='在线超时已保存；接入连接与活跃阈值保持。'
 }catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){
  if(!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,413,422,429].includes(cause.status)&&cause.code!==10014){unknown.value=false;intent.value=undefined;value.value=undefined;error.value='本次保存被拒绝，请重新读取策略后编辑。'}
  else error.value='原保存结果尚未核对；只读取当前事实，不会再次提交。'
 }}finally{if(current(s)){busy.value=false;if(notice.value)emit('changed')}}
}
function finish(){if(!unknown.value||busy.value||!observed.value)return;value.value=observed.value;observed.value=undefined;unknown.value=false;intent.value=undefined;error.value='';notice.value='已采用当前配置；原保存结果仍未确认，未重新提交。'}
watch(value,current=>{if(props.compact&&current){draft.value=current.onlineTimeoutMinutes!==null;minutes.value=current.onlineTimeoutMinutes??undefined}},{flush:'sync'})
function reset(){clear();denied.value=false;if(readable.value)void load()}
watch([()=>projectId.value,()=>props.typeId,()=>session.user?.accountId,()=>session.ready,()=>session.transitioning,()=>can('device:read'),()=>roles.includes(session.user?.projectRole||''),()=>roles.includes(currentProject.value?.myRole||'')],reset,{immediate:true,flush:'sync'})
watch(writable,allowed=>{if(!allowed)shown.value=false},{flush:'sync'})
watch(locked,lock=>emit('locked',lock),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;clear();dispose();emit('locked',false)})
</script>
<template><section class="online-policy"><header v-if="!compact"><h3>在线超时</h3><el-button v-if="writable" size="small" :disabled="disabled||locked||!value" @click="open">设置在线超时</el-button></header><div v-if="compact&&value"><el-form label-position="top"><el-form-item label="在线超时时间（分钟）"><el-switch v-model="draft" aria-label="按上报或心跳超时判断" :disabled="disabled||!writable||locked"/><el-input-number v-if="draft" v-model="minutes" aria-label="在线超时分钟" :min="1" :max="5000" :precision="0" :disabled="disabled||!writable||locked"/></el-form-item></el-form><el-button v-if="writable" size="small" type="primary" :disabled="disabled||locked" @click="save">保存在线超时</el-button></div>
 <p v-if="!compact">按设备合格上报或心跳判断逻辑在线。观察不足显示“未知”，不直接当离线；接入连接状态与活跃阈值独立，不会因此断开连接。</p>
 <p v-if="!readable" role="status">当前账号没有读取权限。</p><template v-else><p v-if="value&&!compact">当前配置：{{value.onlineTimeoutMinutes===null?'沿用原接入状态':value.onlineTimeoutMinutes+' 分钟'}}<span v-if="!compact" class="tl-muted"> · 版本 {{value.revision}}</span></p>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <template v-if="unknown"><p>原请求键：{{intent?.key}}。当前配置不能证明原请求结果。</p><p v-if="observed">当前读取：{{observed.onlineTimeoutMinutes===null?'沿用原接入状态':observed.onlineTimeoutMinutes+' 分钟'}}，版本 {{observed.revision}}</p><el-button :loading="busy" @click="load(true)">读取当前在线超时核对</el-button><el-button :disabled="busy||!observed" @click="finish">采用当前配置并结束核对</el-button></template>
 <el-button v-else-if="!compact||error" size="small" :loading="busy" :disabled="busy||shown" @click="load()">刷新在线超时</el-button></template>
 <el-dialog :model-value="shown&&readable&&writable" title="配置在线超时" width="min(580px,94vw)" :close-on-click-modal="false" @close="cancel"><el-form label-position="top"><el-form-item label="按上报或心跳超时判断"><el-switch v-model="draft" aria-label="按上报或心跳超时判断"/></el-form-item><el-form-item v-if="draft" label="超时分钟"><el-input-number v-model="minutes" aria-label="在线超时分钟" :min="1" :max="5000" :precision="0" :step="1"/></el-form-item></el-form><p>关闭后沿用原接入状态。1至5000分钟是当前平台上限；现有活连接无法取得完整静默观察时，逻辑状态保持未知。</p><template #footer><el-button @click="cancel">取消</el-button><el-button type="primary" :disabled="disabled||!writable||busy" @click="save">保存在线超时</el-button></template></el-dialog>
 </section></template>
<style scoped>.online-policy header{display:flex;align-items:center;justify-content:space-between;gap:12px}.online-policy p{font-size:13px;line-height:1.7;overflow-wrap:anywhere}</style>
