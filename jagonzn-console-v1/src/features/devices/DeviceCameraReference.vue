<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {cameraReferenceTransport,prepareCameraReference,cameraReferenceMatches,type CameraReference,type CameraReferenceIntent,type CameraReferenceTransport} from './device-camera-reference-api'
const props=withDefaults(defineProps<{deviceId:string;disabled?:boolean;reference?:boolean;transport?:CameraReferenceTransport}>(),{disabled:false,transport:()=>cameraReferenceTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const denied=ref(false),readable=computed(()=>!denied.value&&session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.deviceId)&&can('device:read')&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const writable=computed(()=>readable.value&&can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const value=shallowRef<CameraReference>(),snapshot=shallowRef<CameraReference>(),intent=shallowRef<CameraReferenceIntent>(),observed=shallowRef<CameraReference>(),review=ref<'unknown'|'rejected'>(),shown=ref(false),busy=ref(false),serial=ref(''),channel=ref(''),error=ref(''),notice=ref('')
const canAssign=computed(()=>!!snapshot.value?.currentDeviceTypeId&&snapshot.value.state==='ENABLED'),locked=computed(()=>shown.value||busy.value||!!review.value)
let generation=0,alive=true,controller:AbortController|undefined
function clear(){generation++;controller?.abort();value.value=undefined;snapshot.value=undefined;intent.value=undefined;observed.value=undefined;review.value=undefined;shown.value=false;busy.value=false;serial.value='';channel.value='';error.value='';notice.value=''}
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,device:props.deviceId,account:session.user?.accountId}}
function current(s:ReturnType<typeof capture>){return alive&&readable.value&&s.generation===generation&&s.epoch===identityEpoch()&&s.project===projectId.value&&s.device===props.deviceId&&s.account===session.user?.accountId}
async function load(recover=false){
 if(!readable.value||busy.value||review.value&&!recover)return
 const s=capture();busy.value=true;error.value='';controller=new AbortController()
 try{const actual=await props.transport.read(s.project,s.device,controller.signal);if(!current(s))return;if(recover)observed.value=actual;else value.value=actual}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403].includes(cause.status)||!recover&&cause instanceof ApiError&&cause.status===404){clear();denied.value=true}else error.value=errorMessage(cause)}}
 finally{if(current(s))busy.value=false}
}
function edit(){if(!writable.value||props.disabled||busy.value||review.value||!value.value)return;snapshot.value=value.value;serial.value=value.value.storedSerial??'';channel.value=value.value.storedChannel===null?'':String(value.value.storedChannel);error.value='';notice.value='';shown.value=true}
function cancel(){if(!busy.value){shown.value=false;snapshot.value=undefined;serial.value='';channel.value=''}}
async function save(remove=false){
 if(!writable.value||props.disabled||busy.value||review.value||!snapshot.value)return
 let chosen:CameraReferenceIntent
 try{chosen=prepareCameraReference(projectId.value,props.deviceId,snapshot.value,remove?null:serial.value,remove?null:channel.value)}catch(cause){error.value=errorMessage(cause);return}
 intent.value=chosen;review.value='unknown';observed.value=undefined;shown.value=false;snapshot.value=undefined;busy.value=true;error.value='';const s=capture();controller=new AbortController();let accepted=false
 try{const returned=await props.transport.change(chosen,controller.signal);accepted=true;if(!current(s))return;if(!cameraReferenceMatches(returned,chosen))throw new Error('摄像头资料保存回执与原选择不符，请只读核对');const actual=await props.transport.read(chosen.project,chosen.deviceId,controller.signal);if(!current(s))return;if(!cameraReferenceMatches(actual,chosen))throw new Error('当前资料或类型已变化，请只读核对');value.value=actual;intent.value=undefined;review.value=undefined;notice.value=remove?'摄像头关联已清除。':'摄像头资料已保存并回读。';emit('changed')}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&(cause.status===401||accepted&&cause.status===403)){clear();denied.value=true;return}const rejected=!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,403,404,409,413,422,429].includes(cause.status)&&cause.code!==10014;review.value=rejected?'rejected':'unknown';error.value=rejected?'本次保存被拒绝；读取当前事实后可重新编辑。':'原保存结果尚未核对；只读取当前事实，不会再次提交。'}}
 finally{if(current(s))busy.value=false}
}
function finish(){if(!review.value||busy.value||!observed.value)return;const unknown=review.value==='unknown';value.value=observed.value;observed.value=undefined;review.value=undefined;intent.value=undefined;error.value='';notice.value=unknown?'已采用当前资料；原保存结果仍未确认，未重新提交。':'已读取当前资料；被拒绝的保存未重试。'}
function reset(){clear();denied.value=false;if(readable.value)void load()}
watch([()=>projectId.value,()=>props.deviceId,()=>session.user?.accountId,()=>session.ready,()=>session.transitioning,()=>can('device:read'),()=>roles.includes(session.user?.projectRole||''),()=>roles.includes(currentProject.value?.myRole||'')],reset,{immediate:true,flush:'sync'})
watch(writable,allowed=>{if(!allowed&&!review.value)cancel()},{flush:'sync'});watch(locked,lock=>emit('locked',lock),{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;clear();dispose();emit('locked',false)})
</script>
<template><section v-if="!reference||!readable||error||notice||review||shown||value&&(value.state!=='DISABLED'||value.storedSerial!==null)" class="camera-reference" :class="{'information-standard':reference}"><header><h3>摄像头</h3><el-button v-if="!reference&&writable" size="small" :disabled="disabled||locked||!value" @click="edit">编辑摄像头关联</el-button></header>
 <p>每台设备关联一个萤石摄像头，填写序列号与通道号。这里只维护资料，不显示视频或外部在线状态。</p>
 <p v-if="!readable" role="status">当前账号没有读取权限。</p><template v-else><template v-if="value"><p class="information-value" :class="{'is-unset':reference&&value.effectiveSerial===null}"><template v-if="reference&&value.effectiveSerial===null">未设置</template><template v-else>{{reference?'序列号':'有效序列号'}} {{value.effectiveSerial??'—'}} · 通道 {{value.effectiveChannel??'—'}}</template></p><p v-if="value.state==='DISABLED'" role="status">{{value.storedSerial===null?'当前类型已关闭摄像头资料，尚未保存关联。':'当前类型已关闭摄像头资料；原关联仍保留，可显式清除。'}}</p><p v-else-if="value.state==='UNAVAILABLE'" role="status">当前设备类型不可用，原关联暂不生效。</p><p v-if="value.storedSerial!==null" class="tl-muted">保留序列号 {{value.storedSerial}} · 通道 {{value.storedChannel}}</p></template>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <template v-if="review"><p>{{review==='unknown'?'原保存结果尚未确认':'本次保存已被拒绝'}}。原请求键：{{intent?.key}}。当前事实不能证明原请求。</p><p v-if="observed">当前保留序列号 {{observed.storedSerial??'—'}} · 通道 {{observed.storedChannel??'—'}}</p><el-button :loading="busy" @click="load(true)">读取当前摄像头资料核对</el-button><el-button :disabled="busy||!observed" @click="finish">采用当前资料并结束核对</el-button></template>
 <template v-else><div class="information-standard-actions"><el-button v-if="reference&&writable" size="small" :disabled="disabled||locked||!value" @click="edit">编辑</el-button><el-button v-if="!reference" size="small" :loading="busy" :disabled="busy||shown" @click="load()">刷新摄像头资料</el-button></div></template></template>
 <el-dialog :model-value="shown&&readable&&writable" title="编辑摄像头关联" width="min(580px,94vw)" :close-on-click-modal="false" @close="cancel"><el-alert v-if="error" :title="error" type="error" :closable="false"/><el-form label-position="top"><el-form-item label="摄像头序列号"><el-input v-model="serial" aria-label="摄像头序列号" :disabled="busy||!canAssign" maxlength="128"/></el-form-item><el-form-item label="通道号"><el-input v-model="channel" aria-label="摄像头通道号" :disabled="busy||!canAssign" maxlength="5" inputmode="numeric"/></el-form-item></el-form><p v-if="!canAssign">当前类型未启用摄像头资料；可清除原关联。</p><template #footer><el-button @click="cancel">取消</el-button><el-button :disabled="disabled||!writable||busy||!snapshot||snapshot.storedSerial===null" @click="save(true)">清除摄像头关联</el-button><el-button type="primary" :disabled="disabled||!writable||busy||!canAssign" @click="save()">保存摄像头关联</el-button></template></el-dialog>
</section></template>
<style scoped>.information-standard-actions{display:flex;gap:10px;margin-top:8px}.information-standard-actions .el-button+.el-button{margin-left:0}.camera-reference header{display:flex;align-items:center;justify-content:space-between;gap:12px}.camera-reference p{font-size:13px;line-height:1.7;overflow-wrap:anywhere}</style>
