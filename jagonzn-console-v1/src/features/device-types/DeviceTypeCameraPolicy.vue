<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {typeDeviceUuid} from './type-devices-api'
import {prepareCameraPolicy,cameraPolicyTransport,type CameraPolicy,type CameraPolicyIntent,type CameraPolicyTransport} from '../devices/device-camera-reference-api'
const props=withDefaults(defineProps<{typeId:string;disabled?:boolean;compact?:boolean;transport?:CameraPolicyTransport}>(),{disabled:false,compact:false,transport:()=>cameraPolicyTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const denied=ref(false),readable=computed(()=>!denied.value&&session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.typeId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const writable=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const value=shallowRef<CameraPolicy>(),intent=shallowRef<CameraPolicyIntent>(),observed=shallowRef<CameraPolicy>(),shown=ref(false),busy=ref(false),unknown=ref(false),draft=ref(false),error=ref(''),notice=ref('')
let generation=0,alive=true,controller:AbortController|undefined
const locked=computed(()=>shown.value||busy.value||unknown.value)
function clear(){generation++;controller?.abort();value.value=undefined;intent.value=undefined;observed.value=undefined;shown.value=false;busy.value=false;unknown.value=false;error.value='';notice.value=''}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,type:props.typeId,account:session.user?.accountId}}
function current(s:ReturnType<typeof capture>){return alive&&readable.value&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.type===props.typeId&&s.account===session.user?.accountId}
async function load(review=false){
 if(!readable.value||busy.value||unknown.value&&!review)return
 const s=capture();busy.value=true;error.value='';controller=new AbortController()
 try{const actual=await props.transport.read(s.project,s.type,controller.signal);if(!current(s))return;if(review)observed.value=actual;else value.value=actual}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&([401,403].includes(cause.status)||!review&&cause.status===404)){clear();denied.value=true}else error.value=errorMessage(cause)}}
 finally{if(current(s))busy.value=false}
}
function open(){if(!writable.value||props.disabled||busy.value||unknown.value||!value.value)return;draft.value=value.value.enabled;error.value='';notice.value='';shown.value=true}
function cancel(){if(!busy.value)shown.value=false}
async function save(){
 if(!shown.value||!writable.value||props.disabled||busy.value||unknown.value||!value.value)return
 const chosen=prepareCameraPolicy(projectId.value,props.typeId,value.value,draft.value);intent.value=chosen;unknown.value=true;shown.value=false;busy.value=true;error.value='';observed.value=undefined
 const s=capture();controller=new AbortController();let accepted=false
 try{
  const returned=await props.transport.change(chosen,controller.signal);accepted=true;if(!current(s))return
  const expected=BigInt(chosen.body.revision)+(value.value.enabled===chosen.body.enabled?0n:1n)
  if(returned.deviceTypeId!==chosen.typeId||returned.revision!==String(expected)||returned.enabled!==chosen.body.enabled)throw new Error('保存回执与原策略不符，请读取当前配置核对')
  const actual=await props.transport.read(chosen.project,chosen.typeId,controller.signal);if(!current(s))return
  if(actual.revision!==returned.revision||actual.enabled!==returned.enabled)throw new Error('策略已变化，请读取当前配置核对')
  value.value=actual;unknown.value=false;intent.value=undefined;notice.value='摄像头资料策略已保存，原关联仍保留。'
 }catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){
  if(!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,401,403,404,409,413,422,429].includes(cause.status)&&cause.code!==10014){unknown.value=false;intent.value=undefined;value.value=undefined;error.value='本次保存被拒绝，请重新读取策略后编辑。'}
  else error.value='原保存结果尚未核对；只读取当前事实，不会再次提交。'
 }}finally{if(current(s)){busy.value=false;if(notice.value)emit('changed')}}
}
function finish(){if(!unknown.value||busy.value||!observed.value)return;value.value=observed.value;observed.value=undefined;unknown.value=false;intent.value=undefined;error.value='';notice.value='已采用当前配置；原保存结果仍未确认，未重新提交。'}
function toggleCompact(next:unknown){if(typeof next!=='boolean'||!writable.value||props.disabled||locked.value||!value.value)return;draft.value=next;shown.value=true;void save()}
function reset(){clear();denied.value=false;if(readable.value)void load()}
watch([()=>projectId.value,()=>props.typeId,()=>session.user?.accountId,()=>session.ready,()=>session.transitioning,()=>can('device:read'),()=>roles.includes(session.user?.projectRole||''),()=>roles.includes(currentProject.value?.myRole||'')],reset,{immediate:true,flush:'sync'})
watch(writable,allowed=>{if(!allowed)shown.value=false},{flush:'sync'})
watch(locked,lock=>emit('locked',lock),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;clear();dispose();emit('locked',false)})
</script>
<template><div v-if="compact" class="extension-policy-control">
 <el-switch :model-value="value?.enabled === true" aria-label="启用萤石摄像头" :loading="busy" :disabled="disabled||!writable||locked||!value" @change="toggleCompact"/>
 <span v-if="!readable" role="status">无读取权限</span><span v-if="notice" role="status" class="tl-muted">{{notice}}</span>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/>
 <template v-if="unknown"><el-button size="small" :loading="busy" @click="load(true)">读取当前配置</el-button><el-button size="small" :disabled="busy||!observed" @click="finish">采用当前配置</el-button></template>
 <el-button v-else-if="error" size="small" :disabled="busy" @click="load()">重新读取</el-button>
 </div><section v-else class="camera-policy"><header><h3>摄像头资料</h3><el-button v-if="writable" size="small" :disabled="disabled||locked||!value" @click="open">设置摄像头资料扩展</el-button></header>
 <p>每台设备可关联一组萤石摄像头序列号和通道号。关闭后隐藏有效资料，保留的关联仍可显式清除。</p>
 <p v-if="!readable" role="status">当前账号没有读取权限。</p><template v-else><p v-if="value">当前配置：{{value.enabled?'已启用':'已关闭'}}<span class="tl-muted"> · 版本 {{value.revision}}</span></p>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <template v-if="unknown"><p>原请求键：{{intent?.key}}。当前配置不能证明原请求结果。</p><p v-if="observed">当前读取：{{observed.enabled?'启用':'关闭'}}，版本 {{observed.revision}}</p><el-button :loading="busy" @click="load(true)">读取当前摄像头资料策略核对</el-button><el-button :disabled="busy||!observed" @click="finish">采用当前配置并结束核对</el-button></template>
 <el-button v-else size="small" :loading="busy" :disabled="busy||shown" @click="load()">刷新摄像头资料策略</el-button></template>
 <el-dialog :model-value="shown&&readable&&writable" title="配置摄像头资料扩展" width="min(580px,94vw)" :close-on-click-modal="false" @close="cancel"><el-form label-position="top"><el-form-item label="启用摄像头资料"><el-switch v-model="draft" aria-label="启用摄像头资料"/></el-form-item></el-form><p>开关控制当前类型设备的资料展示。设备换型后保留原关联，新类型启用后可以继续使用。</p><template #footer><el-button @click="cancel">取消</el-button><el-button type="primary" :disabled="disabled||!writable||busy" @click="save">保存摄像头资料策略</el-button></template></el-dialog>
 <p class="tl-muted">这里只维护关联资料；视频播放需另行配置萤石服务。</p></section></template>
<style scoped>.camera-policy header{display:flex;align-items:center;justify-content:space-between;gap:12px}.camera-policy p{font-size:13px;line-height:1.7;overflow-wrap:anywhere}</style>
