<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import type {OtaFirmware} from './ota-read-api'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {firmwareStatusLabel} from '../../../../../things-link-console/src/features/ota/firmware-model'
import {otaEnablementTransport,prepareOtaEnablement,decodeOtaEnablementResult,type OtaEnablementTransport,type OtaEnablementIntent,type OtaEnablementResult} from './ota-enablement-api'
const props=withDefaults(defineProps<{firmware?:OtaFirmware;firmwareId?:string;status?:string;target?:HTMLElement|null;portal?:boolean;disabled?:boolean;transport?:OtaEnablementTransport}>(),{transport:()=>otaEnablementTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>()
const id=computed(()=>props.firmwareId||props.firmware?.id||'')
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(id.value)&&(!props.firmware||props.firmware.projectId===projectId.value)&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||'')&&can('ota:read'))
const writable=computed(()=>readable.value&&currentProject.value?.status==='ACTIVE'&&can('ota:deploy')&&!props.disabled)
const resource=useResource(signal=>props.transport.read(projectId.value,id.value,signal))
const busy=ref(false),unknown=ref(false),conflict=ref(false),error=ref(''),result=shallowRef<OtaEnablementResult>()
let generation=0,alive=true,intent:OtaEnablementIntent|undefined,write:AbortController|undefined
const frozen=computed(()=>busy.value||unknown.value)
watch(frozen,value=>emit('locked',value),{immediate:true,flush:'sync'})
function current(g:number){return alive&&g===generation&&readable.value}
function reset(){generation++;write?.abort();resource.clear();busy.value=false;unknown.value=false;conflict.value=false;error.value='';result.value=undefined;intent=undefined;if(readable.value)void resource.reload()}
async function refresh(){if(!readable.value||frozen.value||resource.loading.value)return;resource.clear();await resource.reload();if(resource.data.value){conflict.value=false;error.value=''}}
async function complete(original:OtaEnablementResult,g:number){if(!current(g)||!intent)return;result.value=decodeOtaEnablementResult(original,intent);unknown.value=false;conflict.value=false;intent=undefined;resource.clear();await resource.reload();if(current(g))emit('changed')}
async function change(){if(!writable.value||frozen.value||conflict.value||!resource.data.value||resource.loading.value)return;const g=generation;intent=prepareOtaEnablement(projectId.value,id.value,resource.data.value,!resource.data.value.enabled);write=new AbortController();busy.value=true;unknown.value=true;error.value='';result.value=undefined;try{await complete(await props.transport.change(intent,write.signal),g)}catch(cause){if(!current(g))return;unknown.value=!(cause instanceof ApiError)||cause.outcomeUnknown;conflict.value=cause instanceof ApiError&&cause.status===409&&!cause.outcomeUnknown;error.value=unknown.value?'操作结果尚未核实，请读取原操作结果；不会重复提交。':conflict.value?'版本状态已更新，请刷新当前状态后再操作。':cause instanceof Error?cause.message:'操作失败'}finally{if(current(g))busy.value=false}}
async function recover(){if(!readable.value||busy.value||!unknown.value||!intent)return;const g=generation;write=new AbortController();busy.value=true;error.value='';try{await complete(await props.transport.recover(intent,write.signal),g)}catch(cause){if(current(g))error.value=cause instanceof ApiError&&cause.status===404?'原操作结果尚未可读，请稍后继续核对。':cause instanceof Error?cause.message:'读取失败'}finally{if(current(g))busy.value=false}}
watch([()=>projectId.value,id,()=>session.user?.accountId,()=>props.transport],reset,{immediate:true,flush:'sync'})
watch(readable,value=>{resource.clear();if(!value){generation++;write?.abort();busy.value=false;return}if(!unknown.value)void resource.reload()},{flush:'sync'})
const dispose=onIdentityChange(reset)
onScopeDispose(()=>{alive=false;generation++;write?.abort();dispose();emit('locked',false)})
</script>
<template><Teleport :to="target||'body'" :disabled="!target"><section v-if="readable&&(!portal||target)||unknown" class="ota-enablement"><template v-if="readable"><header><h3>版本状态</h3><el-button size="small" :disabled="frozen||resource.loading.value" @click="refresh">刷新当前状态</el-button></header><AsyncState :loading="resource.loading.value" :error="resource.error.value" @retry="refresh"><template v-if="resource.data.value"><p class="current-state">当前版本状态：<strong>{{resource.data.value.enabled?'已启用':'未启用'}}</strong></p><p v-if="status||firmware?.status">固件状态：{{firmwareStatusLabel(status||firmware?.status)}}</p><el-button v-if="writable" :type="resource.data.value.enabled?'':'primary'" :disabled="frozen||conflict" :loading="busy" @click="change">{{resource.data.value.enabled?'停用版本':'启用版本'}}</el-button></template></AsyncState><p class="help">启用后，已发布且符合条件的固件才可用于升级。停用不取消已经开始的升级流程。</p><p v-if="error" role="alert">{{error}}</p><p v-if="unknown">原操作请求：{{intent?.key}} <el-button :loading="busy" @click="recover">读取原操作结果</el-button></p><p v-if="result" role="status">本次操作已确认：{{result.enablement.enabled?'已启用':'未启用'}}。请以当前版本状态为准。</p></template><p v-else role="alert">操作结果仍待核对，恢复版本状态读取权限后可继续读取原结果。</p></section></Teleport></template>
<style scoped>.ota-enablement{margin-bottom:22px}.ota-enablement header{display:flex;align-items:center;justify-content:space-between;gap:12px}.ota-enablement h3{font-size:17px;font-weight:500}.ota-enablement p{font-size:13px;line-height:1.7;overflow-wrap:anywhere}.ota-enablement .help{font-size:12px;color:var(--tl-muted)}.ota-enablement [role=alert]{color:var(--el-color-danger)}</style>
