<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {ApiError,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {checkArtifactSize,formatBytes,uploadStatusLabel} from '../../../../../things-link-console/src/features/ota/firmware-model'
import {otaUploadTransport,type OtaUploadTransport,type OtaUploadBody} from './ota-upload-api'
import type {OtaFirmware,OtaUpload} from './ota-read-api'
const props=withDefaults(defineProps<{disabled?:boolean;firmware?:OtaFirmware;firmwareId?:string;status?:string;portal?:boolean;target?:HTMLElement;transport?:OtaUploadTransport}>(),{transport:()=>otaUploadTransport})
const emit=defineEmits<{locked:[boolean];changed:[]}>()
const firmwareId=computed(()=>props.firmware?.id??props.firmwareId??''),firmwareStatus=computed(()=>props.firmware?.status??props.status)
const readDenied=ref(false),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const member=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&!!firmwareId.value&&(!props.firmware||props.firmware.projectId===projectId.value)&&roles.includes(session.user?.projectRole||'')&&roles.includes(currentProject.value?.myRole||''))
const readable=computed(()=>member.value&&!readDenied.value)
const allowed=computed(()=>readable.value&&firmwareStatus.value==='DRAFT'&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||'')&&can('ota:deploy'))
const file=ref<File>(),busy=ref(false),started=ref(false),error=ref(''),row=ref<OtaUpload>(),verified=ref(false),confirmed=ref(false),cancelAttempted=ref(false)
let generation=0,alive=true,controller:AbortController|undefined,intent:Readonly<{project:string;firmware:string;key:string;body:OtaUploadBody}>|undefined
const terminal=computed(()=>confirmed.value&&!!row.value&&['VERIFIED','CLEANED'].includes(row.value.status)),locked=computed(()=>busy.value||started.value&&!terminal.value)
function reset(){generation++;controller?.abort();file.value=undefined;busy.value=false;started.value=false;error.value='';row.value=undefined;verified.value=false;confirmed.value=false;intent=undefined;cancelAttempted.value=false;readDenied.value=false}
function scopeCurrent(g:number){return alive&&g===generation&&member.value}
function current(g:number){return scopeCurrent(g)&&readable.value}
function choose(event:Event){if(props.disabled||!allowed.value||started.value||busy.value)return;file.value=(event.target as HTMLInputElement).files?.[0];error.value='';if(file.value){const check=checkArtifactSize(file.value.size);if(!check.ok){error.value=check.reason||'固件文件无效';file.value=undefined}}}
function check(value:OtaUpload){if(!intent||value.projectId!==intent.project||value.firmwareId!==intent.firmware||value.expectedLength!==intent.body.expectedLength||value.expectedSha256!==intent.body.expectedSha256||row.value&&value.id!==row.value.id)throw new Error('上传会话与原文件身份不一致');return value}
function accept(value:OtaUpload){row.value=check(value);confirmed.value=true;verified.value=value.status==='VERIFIED';readDenied.value=false;if(terminal.value)emit('changed')}
async function readCurrent(g:number){if(!intent)return;try{const value=row.value?await props.transport.read(intent.project,intent.firmware,row.value.id,controller!.signal):await props.transport.original(intent.project,intent.firmware,intent.key,controller!.signal);if(scopeCurrent(g))accept(value)}catch(cause){if(scopeCurrent(g))readFailure(cause)}}
function readFailure(cause:unknown){if(cause instanceof ApiError&&[401,403].includes(cause.status)){if(terminal.value)reset();else{generation++;controller?.abort();busy.value=false;file.value=undefined;error.value=''}readDenied.value=true;return}error.value=cause instanceof ApiError&&cause.status===404?'尚未找到本人原请求键对应的上传会话；原结果仍未知，不会再次创建或上传。':cause instanceof Error?cause.message:'读取原上传会话失败'}
async function upload(){if(props.disabled||!allowed.value||!file.value||busy.value||started.value)return;const g=generation,original=file.value;busy.value=true;error.value='';controller=new AbortController();try{
 const bytes=await original.arrayBuffer();if(!current(g)||!allowed.value)return;if(bytes.byteLength!==original.size||!checkArtifactSize(bytes.byteLength).ok)throw new Error('文件读取长度不一致')
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');if(!current(g)||!allowed.value)return
 intent=Object.freeze({project:projectId.value,firmware:firmwareId.value,key:crypto.randomUUID(),body:Object.freeze({expectedLength:bytes.byteLength,expectedSha256:sha})});started.value=true
 const created=await props.transport.create(intent.project,intent.firmware,intent.body,intent.key,controller.signal);if(!current(g))return;row.value=check(created);confirmed.value=false
 // 仅本次明确创建的WAITING可初次PUT；任何恢复GET都不会补传或重传。
 if(created.status==='WAITING'&&allowed.value){const sent=await props.transport.content(intent.project,intent.firmware,created.id,bytes,controller.signal);if(!current(g))return;row.value=check(sent);confirmed.value=false}
 await readCurrent(g)
 }catch(cause){if(!current(g))return;error.value=started.value?'上传尚未核实，请读取原会话或按原请求键核对；不会自动重传或新建会话。':cause instanceof Error?cause.message:'文件读取失败'}finally{if(current(g))busy.value=false}}
async function reread(){if(props.disabled||!member.value||busy.value||!intent||!started.value)return;const g=generation;controller=new AbortController();busy.value=true;error.value='';try{await readCurrent(g)}catch(cause){if(scopeCurrent(g))readFailure(cause)}finally{if(scopeCurrent(g))busy.value=false}}
async function cancel(){if(props.disabled||!allowed.value||busy.value||!row.value||!intent||terminal.value||cancelAttempted.value||row.value.cancelRequestedAt)return;const g=generation,original=row.value,key=crypto.randomUUID();controller=new AbortController();busy.value=true;cancelAttempted.value=true;error.value='';try{
 const value=await props.transport.cancel(intent.project,intent.firmware,original.id,original.revision,key,controller.signal);if(!current(g))return;row.value=check(value);confirmed.value=false;await readCurrent(g)
 }catch(cause){if(current(g))error.value='取消结果尚未核实；只读取原上传会话，不会再次发送取消。'}finally{if(current(g))busy.value=false}}
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
let previous:readonly [string,string|undefined,string,OtaUploadTransport]|undefined
function changedScope(){const same=previous?.[0]===projectId.value&&previous?.[1]===session.user?.accountId&&previous?.[2]===firmwareId.value&&previous?.[3]===props.transport;previous=[projectId.value,session.user?.accountId,firmwareId.value,props.transport];if(same){if((!readable.value||!allowed.value)&&(busy.value||locked.value)){generation++;controller?.abort();busy.value=false}return}reset()}
watch([()=>projectId.value,()=>session.user?.accountId,firmwareId,member,allowed,()=>props.transport],changedScope,{immediate:true,flush:'sync'})
const dispose=onIdentityChange(reset);onScopeDispose(()=>{alive=false;reset();dispose();emit('locked',false)})
</script>
<template><Teleport v-if="!portal||target" :to="target||'body'" :disabled="!portal"><p v-if="readDenied" role="alert">当前上传会话读取权限已不可用。<template v-if="started">原上传结果仍待核对；恢复读取后只核对原会话。<el-button :disabled="disabled||busy||!member" :loading="busy" @click="reread">{{row?'读取原上传会话':'按原请求键读取上传会话'}}</el-button></template></p><section v-if="readable&&(allowed||started)" class="firmware-upload"><h3>上传固件文件</h3><p>支持 1 字节至 64 MiB 的原始文件。上传完成仍需受控签名发布，不会自动升级设备。</p><input v-if="allowed" type="file" aria-label="OTA固件文件" :disabled="disabled||busy||started" @change="choose"/><p v-if="file">{{file.name}} · {{formatBytes(file.size)}}</p><el-button v-if="allowed&&!started" type="primary" :disabled="disabled||!file||busy" :loading="busy" @click="upload">上传固件</el-button><template v-if="row"><p role="status">上传会话：{{row.id}} · {{uploadStatusLabel(row.status)}}</p></template><template v-if="started"><p>原请求键：{{intent?.key}}</p><el-button :disabled="disabled||busy||!readable" :loading="busy" @click="reread">{{row?'读取原上传会话':'按原请求键读取上传会话'}}</el-button><el-button v-if="row&&allowed&&!terminal&&!cancelAttempted&&!row.cancelRequestedAt" :disabled="disabled||busy" @click="cancel">取消原上传</el-button></template><p v-if="verified" role="status">服务端已复验文件长度与摘要；固件尚未发布。</p><p v-if="row?.cancelRequestedAt" role="status">已登记取消，等待服务端收束；不表示对象已清理。</p><p v-if="started&&!terminal">原上传意图已保留；只读取原记录，不会再次创建或补传。尚未收束时保持当前详情。</p><p v-if="error" role="alert">{{error}}</p></section></Teleport></template>
<style scoped>.firmware-upload{margin-top:24px}.firmware-upload p{line-height:1.6;overflow-wrap:anywhere}.firmware-upload [role=alert]{color:var(--el-color-danger)}.firmware-upload input{max-width:100%;margin:8px 0}</style>
