<script setup lang="ts">
import {ref,computed,watch,onScopeDispose} from 'vue'
import {can,projectId,currentProject} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,onIdentityChange} from '@/core/http'
import {devicesApi,type DeviceType} from './api'
import {assertProfile,type ValidDeviceProfile} from './reference-profile'
import {prepareTypeAssignment,submitTypeAssignment,decodeTypeAssignment} from './device-type-assignment-api'
import {useDeviceGuard,isDeviceScopeCurrent} from './use-device-guard'
const props=defineProps<{deviceId:string}>()
const emit=defineEmits<{changed:[]}>()
const allowed=computed(()=>can('device:update')&&currentProject.value?.status==='ACTIVE')
const capture=useDeviceGuard(()=>props.deviceId)
const open=ref(false),loading=ref(false),paging=ref(false),busy=ref(false),error=ref(''),unknown=ref(false),reconciled=ref(false),denied=ref(false)
const selected=ref(''),profile=ref<Readonly<ValidDeviceProfile>>(),options=ref<DeviceType[]>([]),currentOption=ref<DeviceType>(),nextCursor=ref<string>()
const choices=computed(()=>currentOption.value&&!options.value.some(t=>t.id===currentOption.value!.id)?[currentOption.value,...options.value]:options.value)
let generation=0,controller:AbortController|undefined
function close(){generation++;controller?.abort();open.value=false;loading.value=false;paging.value=false;profile.value=undefined;currentOption.value=undefined;options.value=[];nextCursor.value=undefined;selected.value='';error.value='';reconciled.value=false}
function reset(){close();unknown.value=false;denied.value=false}
const dispose=onIdentityChange(reset)
onScopeDispose(()=>{reset();dispose()})
watch(()=>[props.deviceId,projectId.value,allowed.value],reset,{flush:'sync'})
function unavailable(cause:unknown){if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){close();unknown.value=false;denied.value=true;return true}return false}
async function readCurrent(){
 if(!allowed.value||!open.value||busy.value||loading.value)return
 const check=capture(),current=generation,project=projectId.value,device=props.deviceId
 controller?.abort();controller=new AbortController();loading.value=true;error.value='';profile.value=undefined;currentOption.value=undefined;reconciled.value=false
 try{const value=await devicesApi.profile(project,device,controller.signal);check();if(current!==generation)return;assertProfile(value,device);profile.value=Object.freeze({...value});selected.value=value.deviceTypeId||'';reconciled.value=unknown.value
  if(value.deviceTypeId){const item=await devicesApi.type(project,value.deviceTypeId,controller.signal);check();if(current!==generation)return;if(item.id!==value.deviceTypeId||typeof item.name!=='string'||!item.name.trim()||item.name.length>128)throw new Error('当前设备类型名称不完整');currentOption.value=item}
 }
 catch(cause){if(current===generation&&isDeviceScopeCurrent(check)&&!(cause instanceof IdentityChanged)&&!unavailable(cause))error.value=errorMessage(cause)}
 finally{if(current===generation)loading.value=false}
}
async function loadTypes(cursor?:string){
 if(!allowed.value||!open.value||paging.value)return
 const check=capture(),current=generation,project=projectId.value;const signal=controller?.signal
 paging.value=true;error.value=''
 try{
  const page=await devicesApi.types(project,cursor,signal);check();if(current!==generation)return
  const rows=page.items,seen=new Set(options.value.map(t=>t.id))
  if(!Array.isArray(rows)||rows.length>50||typeof page.hasMore!=='boolean'||page.hasMore&&(!page.nextCursor||page.nextCursor===cursor||page.nextCursor.length>4096)||!page.hasMore&&page.nextCursor)throw new Error('设备类型目录分页不完整')
  for(const row of rows){if(!row.id||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(row.id)||seen.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>128)throw new Error('设备类型目录身份或名称不完整');seen.add(row.id)}
  if(options.value.length+rows.length>500)throw new Error('可选类型超过本次读取范围，请缩小设备类型目录后重试')
  options.value=[...options.value,...rows];nextCursor.value=page.hasMore?page.nextCursor||undefined:undefined
 }catch(cause){if(current===generation&&isDeviceScopeCurrent(check)&&!(cause instanceof IdentityChanged)&&!unavailable(cause))error.value=errorMessage(cause)}
 finally{if(current===generation)paging.value=false}
}
async function reload(){await readCurrent();if(open.value&&profile.value&&!unknown.value&&!options.value.length)await loadTypes()}
async function start(){if(!allowed.value||denied.value||busy.value)return;close();open.value=true;await readCurrent();if(open.value&&profile.value)await loadTypes()}
function continueEditing(){if(!unknown.value||!reconciled.value||!profile.value)return;unknown.value=false;reconciled.value=false;error.value='';if(!options.value.length)void loadTypes()}
async function save(){
 if(!allowed.value||denied.value||busy.value||loading.value||paging.value||unknown.value||!profile.value||!choices.value.some(t=>t.id===selected.value))return
 const check=capture(),current=generation,intent=prepareTypeAssignment(projectId.value,props.deviceId,profile.value.deviceTypeId,selected.value)
 controller?.abort();controller=new AbortController();busy.value=true;unknown.value=true;reconciled.value=false;error.value='';let accepted=false
 try{
  const bytes=await submitTypeAssignment(intent,controller.signal);accepted=true;check();if(current!==generation)return;decodeTypeAssignment(bytes,intent)
  const actual=await devicesApi.profile(intent.project,intent.device,controller.signal);check();if(current!==generation)return;assertProfile(actual,intent.device)
  if(actual.deviceTypeId!==intent.next)throw new Error('当前设备类型与保存回执不同，请重新读取核对')
  unknown.value=false;emit('changed');close()
 }catch(cause){if(current===generation&&isDeviceScopeCurrent(check)&&!(cause instanceof IdentityChanged)&&!unavailable(cause)){error.value=errorMessage(cause);unknown.value=accepted||cause instanceof ApiError&&cause.outcomeUnknown;reconciled.value=false;if(cause instanceof ApiError&&cause.status===409){profile.value=undefined;currentOption.value=undefined;selected.value=''}}}
 finally{busy.value=false}
}
</script>
<template>
<el-button v-if="allowed&&!denied" size="small" @click="start">修改设备类型</el-button>
<el-dialog :model-value="open" title="修改设备类型" width="500px" class="source-device-type-dialog" :close-on-click-modal="false" destroy-on-close @close="close">
<el-alert v-if="error" :title="error" type="error" :closable="false"/>
<el-alert v-if="unknown&&!busy" title="保存结果尚未确认，请重新读取当前设备类型核对。" type="warning" :closable="false"/>
<el-form label-position="top"><el-form-item label="设备类型"><el-select v-model="selected" aria-label="设备类型" filterable placeholder="请选择" :loading="loading||paging" :disabled="busy||unknown||!profile"><el-option v-if="profile?.deviceTypeId&&!choices.some(t=>t.id===profile!.deviceTypeId)" :value="profile.deviceTypeId" label="当前类型（目录中未读取）" disabled/><el-option v-for="item in choices" :key="item.id" :value="item.id!" :label="item.name"/></el-select><el-button v-if="nextCursor&&!unknown" text :loading="paging" :disabled="busy" @click="loadTypes(nextCursor)">加载更多类型</el-button></el-form-item></el-form>
<template #footer><el-button @click="close">{{unknown?'关闭':'取消'}}</el-button><template v-if="unknown"><el-button :loading="loading" @click="readCurrent">重新读取当前类型</el-button><el-button v-if="reconciled" type="primary" @click="continueEditing">继续修改</el-button></template><template v-else><el-button v-if="!profile||error" :disabled="busy" :loading="loading||paging" @click="!profile?reload():loadTypes(nextCursor)">重新读取</el-button><el-button type="primary" :loading="busy" :disabled="!allowed||unknown||loading||paging||!profile||!choices.some(t=>t.id===selected)" @click="save">确 定</el-button></template></template>
</el-dialog>
</template>
<style>
.source-device-type-dialog{max-width:calc(100vw - 32px);}.source-device-type-dialog .el-dialog__header{padding:20px 20px 10px;}.source-device-type-dialog .el-dialog__body{padding:30px 20px;max-height:calc(85dvh - 125px);overflow:auto;}.source-device-type-dialog .el-dialog__footer{padding:10px 20px 20px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;}.source-device-type-dialog .el-dialog__footer .el-button+.el-button{margin-left:0;}.source-device-type-dialog .el-form-item__label{font-weight:700;color:#606266;height:32px;line-height:32px;padding:0;}.source-device-type-dialog .el-select{width:220px;max-width:100%;}.source-device-type-dialog .el-alert{margin-bottom:16px;}
</style>
