<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {typeDeviceUuid} from './type-devices-api'
import {prepareRegistrationPolicy,registrationPolicyTransport,type RegistrationPolicy,type RegistrationPolicyIntent,type RegistrationPolicyTransport} from './registration-policy-api'
const props=withDefaults(defineProps<{typeId:string;deviceKind:string;disabled?:boolean;compact?:boolean;transport?:RegistrationPolicyTransport}>(),{disabled:false,compact:false,transport:()=>registrationPolicyTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const denied=ref(false),readable=computed(()=>!denied.value&&session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const writable=computed(()=>readable.value&&can('device:update')&&props.deviceKind!=='SUB_DEVICE'&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const value=shallowRef<RegistrationPolicy>(),intent=shallowRef<RegistrationPolicyIntent>(),observed=shallowRef<RegistrationPolicy>(),shown=ref(false),busy=ref(false),unknown=ref(false),draft=ref(false),error=ref(''),notice=ref('')
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
function open(){if(!writable.value||props.disabled||busy.value||unknown.value||!value.value)return;draft.value=value.value.automaticCreationEnabled;error.value='';notice.value='';shown.value=true}
function cancel(){if(!busy.value)shown.value=false}
async function save(){
 if((!shown.value&&!props.compact)||!writable.value||props.disabled||busy.value||unknown.value||!value.value)return
 const chosen=prepareRegistrationPolicy(projectId.value,props.typeId,value.value,draft.value);intent.value=chosen;unknown.value=true;shown.value=false;busy.value=true;error.value='';observed.value=undefined
 const s=capture();controller=new AbortController();let accepted=false
 try{
  const returned=await props.transport.change(chosen,controller.signal);accepted=true;if(!current(s))return
  const expected=BigInt(chosen.body.revision)+(value.value.automaticCreationEnabled===chosen.body.automaticCreationEnabled?0n:1n)
  if(returned.deviceTypeId!==chosen.typeId||returned.revision!==String(expected)||returned.automaticCreationEnabled!==chosen.body.automaticCreationEnabled)throw new Error('保存回执与原策略不符，请读取当前策略核对')
  const actual=await props.transport.read(chosen.project,chosen.typeId,controller.signal);if(!current(s))return
  if(actual.revision!==returned.revision||actual.automaticCreationEnabled!==returned.automaticCreationEnabled)throw new Error('策略已变化，请读取当前策略核对')
  value.value=actual;unknown.value=false;intent.value=undefined;notice.value='自动创建策略已保存，现有设备凭据与连接保持。'
 }catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){
  if(!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,413,422,429].includes(cause.status)&&cause.code!==10014){unknown.value=false;intent.value=undefined;value.value=undefined;error.value='本次保存被拒绝，请重新读取策略后编辑。'}
  else error.value='原保存结果尚未核对；只读取当前事实，不会再次提交。'
 }}finally{if(current(s)){busy.value=false;if(notice.value)emit('changed')}}
}
function finish(){if(!unknown.value||busy.value||!observed.value)return;value.value=observed.value;observed.value=undefined;unknown.value=false;intent.value=undefined;error.value='';notice.value='已采用当前策略；原保存结果仍未确认，未重新提交。'}
watch(value,current=>{if(props.compact&&current){draft.value=current.automaticCreationEnabled}},{flush:'sync'})
function reset(){clear();denied.value=false;if(readable.value)void load()}
watch([()=>projectId.value,()=>props.typeId,()=>session.user?.accountId,()=>session.ready,()=>session.transitioning,()=>can('device:read'),()=>roles.includes(session.user?.projectRole||''),()=>roles.includes(currentProject.value?.myRole||'')],reset,{immediate:true,flush:'sync'})
watch(writable,allowed=>{if(!allowed)shown.value=false},{flush:'sync'})
watch(locked,lock=>emit('locked',lock),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;clear();dispose();emit('locked',false)})
</script>
<template><section class="registration-policy"><header v-if="!compact"><h3>自动创建设备</h3><el-button v-if="writable" size="small" :disabled="disabled||locked||!value" @click="open">设置自动创建</el-button></header><div v-if="compact&&value"><el-form label-position="top"><el-form-item label="允许设备自动创建"><el-switch v-model="draft" aria-label="允许设备自动创建" :disabled="disabled||!writable||locked"/></el-form-item></el-form><el-button v-if="writable" size="small" type="primary" :disabled="disabled||locked" @click="save">保存自动创建设置</el-button></div>
 <p v-if="!compact">设备通过 HTTPS 一型一密动态注册时，允许自动建立新的设备。关闭只影响后续注册，已有设备凭据与连接不变；已有设备标识重复注册仍返回冲突。</p>
 <p v-if="!readable" role="status">当前账号没有读取权限。</p><template v-else><p v-if="value&&!compact">当前策略：{{value.automaticCreationEnabled?'允许自动创建':'不允许自动创建'}}<span v-if="!compact" class="tl-muted"> · 版本 {{value.revision}}</span></p><p v-if="deviceKind==='SUB_DEVICE'">子设备没有独立动态注册入口。</p>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <template v-if="unknown"><p>原请求键：{{intent?.key}}。当前策略不能证明原请求结果。</p><p v-if="observed">当前读取：{{observed.automaticCreationEnabled?'允许':'不允许'}}自动创建，版本 {{observed.revision}}</p><el-button :loading="busy" @click="load(true)">读取当前策略核对</el-button><el-button :disabled="busy||!observed" @click="finish">采用当前策略并结束核对</el-button></template>
 <el-button v-else-if="!compact||error" size="small" :loading="busy" :disabled="busy||shown" @click="load()">刷新自动创建策略</el-button></template>
 <el-dialog :model-value="shown&&readable&&writable" title="配置自动创建设备" width="min(580px,94vw)" :close-on-click-modal="false" @close="cancel"><el-form label-position="top"><el-form-item label="允许设备自动创建"><el-switch v-model="draft" aria-label="允许设备自动创建"/></el-form-item></el-form><p>已取得类型许可的注册会先完成；保存关闭后，新的注册将被拒绝。此设置不生成或轮换产品密钥。</p><template #footer><el-button @click="cancel">取消</el-button><el-button type="primary" :disabled="disabled||!writable||busy" @click="save">保存自动创建策略</el-button></template></el-dialog>
</section></template>
<style scoped>.registration-policy>header{display:flex;justify-content:space-between;align-items:center;gap:16px}.registration-policy h3{font-size:18px;font-weight:500;margin:18px 0 12px}.registration-policy p{font-size:13px;line-height:21px;overflow-wrap:anywhere}.registration-policy :deep(.el-alert){margin:12px 0}</style>
