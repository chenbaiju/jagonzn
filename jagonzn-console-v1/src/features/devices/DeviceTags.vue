<script setup lang="ts">
import {ref,shallowRef,watch,computed,onScopeDispose} from 'vue'
import {ApiError,errorMessage,IdentityChanged,onIdentityChange} from '@/core/http'
import {projectId,can,currentProject,session} from '@/core/session'
import {useDeviceGuard,isDeviceScopeCurrent} from './use-device-guard'
import {decodeDeviceTagSet,readDeviceTagSet,prepareDeviceTagSet,submitDeviceTagSet,verifyDeviceTagSetWrite,type DeviceTagSet,type DeviceTagSetIntent} from './device-tag-set-api'
import {MAX_DEVICE_TAGS,type DeviceTagRow} from './tag-rules'
import AsyncState from '@/ui/AsyncState.vue'
const props=defineProps<{deviceId:string}>(),capture=useDeviceGuard(()=>props.deviceId)
const point=shallowRef<DeviceTagSet>(),snapshot=shallowRef<DeviceTagSet>(),intent=shallowRef<DeviceTagSetIntent>(),current=shallowRef<DeviceTagSet>()
const rows=ref<DeviceTagRow[]>([]),open=ref(false),loading=ref(false),busy=ref(false),error=ref(''),readError=ref(''),denied=ref(false),writeDenied=ref(false),review=ref<'unknown'|'rejected'>()
const readable=computed(()=>can('device:read')&&!denied.value),writable=computed(()=>readable.value&&can('device:update')&&!writeDenied.value&&currentProject.value?.status==='ACTIVE')
let generation=0,sequence=0,uiSequence=0,disposed=false,readController:AbortController|undefined,writeController:AbortController|undefined
function still(check:()=>void,g:number){return !disposed&&generation===g&&isDeviceScopeCurrent(check)}
function close(){uiSequence++;sequence++;readController?.abort();loading.value=false;open.value=false;rows.value=[];snapshot.value=undefined;current.value=undefined;error.value=''}
function reset(){generation++;sequence++;readController?.abort();writeController?.abort();close();point.value=undefined;intent.value=undefined;review.value=undefined;readError.value='';loading.value=false;busy.value=false;denied.value=false;writeDenied.value=false}
function denyRead(cause:unknown){reset();denied.value=true;readError.value=errorMessage(cause)}
async function read(){
 if(!readable.value||!projectId.value||!props.deviceId)return
 const g=generation,seq=++sequence,check=capture(),project=projectId.value,device=props.deviceId
 readController?.abort();const active=new AbortController();readController=active;loading.value=true;readError.value=''
 try{const value=decodeDeviceTagSet(await readDeviceTagSet(project,device,active.signal),device);if(still(check,g)&&seq===sequence&&readable.value){point.value=value;return value}}
 catch(cause){if(still(check,g)&&seq===sequence&&!active.signal.aborted&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403,404].includes(cause.status))denyRead(cause);else readError.value=errorMessage(cause)}}
 finally{if(g===generation&&seq===sequence)loading.value=false}
}
function useSnapshot(value:DeviceTagSet){snapshot.value=value;rows.value=value.tags.length?value.tags.map(row=>({...row})):[{key:'',value:''}]}
async function edit(){
 if(!writable.value||busy.value||loading.value)return
 close();open.value=true;const u=uiSequence
 if(review.value){await refreshCurrent();return}
 const value=await read();if(u===uiSequence&&open.value&&writable.value&&value)useSnapshot(value)
}
async function refreshCurrent(){
 const original=intent.value;if(!original||busy.value||!readable.value||!open.value)return
 const g=generation,u=uiSequence,check=capture();readController?.abort();const active=new AbortController();readController=active;loading.value=true;current.value=undefined;error.value=''
 try{const value=decodeDeviceTagSet(await readDeviceTagSet(original.project,original.device,active.signal),original.device);if(still(check,g)&&u===uiSequence&&open.value&&readable.value){current.value=value;point.value=value}}
 catch(cause){if(still(check,g)&&u===uiSequence&&!active.signal.aborted&&!(cause instanceof IdentityChanged)){if(cause instanceof ApiError&&[401,403,404].includes(cause.status))denyRead(cause);else error.value=errorMessage(cause)}}
 finally{if(g===generation&&u===uiSequence)loading.value=false}
}
function continueEditing(){if(!current.value||!writable.value||busy.value||loading.value)return;useSnapshot(current.value);review.value=undefined;intent.value=undefined;current.value=undefined;error.value=''}
function addRow(){if(writable.value&&!busy.value&&!review.value&&rows.value.length<MAX_DEVICE_TAGS)rows.value.push({key:'',value:''})}
function removeRow(index:number){if(writable.value&&!busy.value&&!review.value)rows.value.splice(index,1)}
async function save(){
 if(!writable.value||busy.value||loading.value||review.value||!snapshot.value)return
 let chosen:DeviceTagSetIntent
 try{chosen=prepareDeviceTagSet(projectId.value,props.deviceId,snapshot.value,rows.value)}catch(cause){error.value=errorMessage(cause);return}
 const g=generation,u=uiSequence,check=capture();intent.value=chosen;review.value='unknown';busy.value=true;error.value='';writeController=new AbortController();let accepted=false
 try{const bytes=await submitDeviceTagSet(chosen,writeController.signal);accepted=true;if(!still(check,g)||u!==uiSequence||!writable.value)return;const value=verifyDeviceTagSetWrite(bytes,chosen);point.value=value;review.value=undefined;intent.value=undefined;close()}
 catch(cause){if(still(check,g)&&u===uiSequence&&!(cause instanceof IdentityChanged)){
  if(cause instanceof ApiError&&[401,404].includes(cause.status)){denyRead(cause);return}
  if(cause instanceof ApiError&&cause.status===403){close();review.value=undefined;intent.value=undefined;writeDenied.value=true;point.value=undefined;error.value=errorMessage(cause);void read();return}
  const rejected=!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,409,413,422,429].includes(cause.status)
  review.value=rejected?'rejected':'unknown';snapshot.value=undefined;rows.value=[];current.value=undefined;error.value=errorMessage(cause)
 }}finally{if(g===generation)busy.value=false}
}
function scopeChanged(){reset();if(readable.value)void read()}
watch(()=>[projectId.value,props.deviceId,session.user?.accountId,can('device:read'),can('device:update'),currentProject.value?.status],scopeChanged,{immediate:true,flush:'sync'})
const dispose=onIdentityChange(scopeChanged);onScopeDispose(()=>{disposed=true;reset();dispose()})
</script>
<template><el-alert v-if="error&&!open" :title="error" type="error" :closable="false"/><el-alert v-if="review&&!open&&readable" title="标签保存结果待核对，请打开编辑标签读取当前状态。" type="warning" :closable="false"/>
<AsyncState :forbidden="!readable" :loading="loading&&!open" :error="readError" @retry="read"><el-table v-if="point" :data="point.tags" empty-text="无标签"><el-table-column prop="key" label="标签名称"/><el-table-column prop="value" label="值"/></el-table><p v-else>尚未读取当前标签</p></AsyncState><div v-if="writable" class="device-tags-actions"><el-button size="small" aria-label="编辑标签" :disabled="busy||loading" @click="edit">编辑</el-button></div>
<el-dialog :model-value="open&&writable" title="编辑标签" width="800px" class="source-device-tags-dialog" :close-on-click-modal="false" destroy-on-close @close="close">
<el-alert v-if="error" :title="error" type="error" :closable="false"/>
<template v-if="review"><el-alert :title="review==='unknown'?'保存结果尚未确认，请读取当前标签核对，不会自动重新提交。':'本次保存已被拒绝，请读取当前标签后再决定是否编辑。'" type="warning" :closable="false"/><el-table v-if="current" :data="current.tags" empty-text="暂无标签"><el-table-column prop="key" label="当前标签名称"/><el-table-column prop="value" label="当前标签值"/></el-table></template>
<el-form v-else-if="snapshot" label-position="top"><el-form-item label="标签"><div class="tag-set-rows"><div v-for="(row,index) in rows" :key="index" class="tag-set-row"><el-input v-model="row.key" size="small" :aria-label="`标签名称${index+1}`" placeholder="标签名称，比如：服务商" :disabled="busy"/><el-input v-model="row.value" size="small" :aria-label="`标签值${index+1}`" placeholder="标签值，比如：ThingsLink" maxlength="128" :disabled="busy"/><el-button size="small" type="danger" :aria-label="`移除标签${index+1}`" :disabled="busy" @click="removeRow(index)">移除</el-button></div><div><el-button size="small" :disabled="busy||rows.length>=MAX_DEVICE_TAGS" @click="addRow">添加标签</el-button></div></div></el-form-item></el-form>
<template v-else><el-alert v-if="readError" :title="readError" type="error" :closable="false"/><p v-else>正在读取当前标签…</p><el-button v-if="readError" :disabled="loading" @click="edit">重新读取标签</el-button></template>
<template #footer><el-button @click="close">{{review?'关闭':'取消'}}</el-button><template v-if="review"><el-button :loading="loading" :disabled="busy" @click="refreshCurrent">读取当前标签</el-button><el-button v-if="current" type="primary" :disabled="busy||loading||!writable" @click="continueEditing">使用当前标签继续编辑</el-button></template><el-button v-else type="primary" :loading="busy" :disabled="busy||loading||!snapshot||!writable" @click="save">提交</el-button></template>
</el-dialog></template>
<style>.device-tags-actions{margin-top:12px}.source-device-tags-dialog{max-width:calc(100vw - 32px)}.source-device-tags-dialog .el-dialog__header{padding:20px 20px 10px}.source-device-tags-dialog .el-dialog__body{padding:40px 20px 30px;max-height:calc(85dvh - 130px);overflow:auto}.source-device-tags-dialog .el-dialog__footer{padding:10px 20px 20px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}.source-device-tags-dialog .el-dialog__footer .el-button+.el-button{margin-left:0}.source-device-tags-dialog .el-alert{margin-bottom:12px}.source-device-tags-dialog .el-form-item__label{height:32px;line-height:32px;padding:0;font-weight:700}.tag-set-rows{display:flex;flex-direction:column;gap:8px;width:100%}.tag-set-row{display:flex;gap:8px;align-items:flex-start}.tag-set-row .el-input{flex:1;min-width:0}@media(max-width:520px){.tag-set-row{flex-wrap:wrap}.tag-set-row .el-input{flex-basis:calc(50% - 4px)}}</style>
