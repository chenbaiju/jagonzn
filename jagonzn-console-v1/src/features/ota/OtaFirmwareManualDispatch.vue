<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {formatTime} from '@/core/time'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {otaManualDispatchTransport,prepareOtaManualDispatch,decodeOtaManualDispatchResult,type OtaManualDispatchTransport,type OtaManualDispatchMode,type OtaManualDispatchIntent,type OtaManualDispatchResult} from './ota-manual-dispatch-api'
const props=withDefaults(defineProps<{firmwareId:string;disabled?:boolean;transport?:OtaManualDispatchTransport}>(),{transport:()=>otaManualDispatchTransport})
const emit=defineEmits<{locked:[value:boolean];accepted:[]}>()
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.firmwareId)&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||'')&&can('ota:read'))
const writable=computed(()=>readable.value&&currentProject.value?.status==='ACTIVE'&&can('ota:deploy')&&!props.disabled)
const selection=shallowRef<Readonly<{device:string;mode:OtaManualDispatchMode;name:string}>>(),shown=ref(false),busy=ref(false),unknown=ref(false),error=ref(''),result=shallowRef<OtaManualDispatchResult>()
const frozen=computed(()=>busy.value||unknown.value)
let generation=0,alive=true,intent:OtaManualDispatchIntent|undefined,controller:AbortController|undefined
watch(frozen,value=>emit('locked',value),{immediate:true,flush:'sync'})
function sameIntent(){return !!intent&&intent.project===projectId.value&&intent.firmware===props.firmwareId&&intent.actor===session.user?.accountId&&intent.identity===identityEpoch()}
function current(g:number){return alive&&g===generation&&readable.value&&sameIntent()}
function reset(){generation++;controller?.abort();selection.value=undefined;shown.value=false;busy.value=false;unknown.value=false;error.value='';result.value=undefined;intent=undefined}
function open(device:string,mode:OtaManualDispatchMode,name?:string){if(!writable.value||frozen.value||device.length!==36||!typeDeviceUuid.test(device)||!['INITIAL','REDISPATCH'].includes(mode))return;selection.value=Object.freeze({device,mode,name:name||device});shown.value=true;error.value='';result.value=undefined;intent=undefined}
function close(){if(frozen.value)return;shown.value=false;selection.value=undefined;error.value='';intent=undefined}
function updateShown(value:boolean){if(!value)close()}
function beforeClose(done:()=>void){if(!frozen.value){close();done()}}
function complete(receipt:OtaManualDispatchResult,g:number){if(!current(g)||!intent)return;result.value=decodeOtaManualDispatchResult(receipt,intent);unknown.value=false;shown.value=false;selection.value=undefined;intent=undefined;error.value='';emit('accepted')}
async function submit(){if(!writable.value||frozen.value||!selection.value)return;intent=prepareOtaManualDispatch(projectId.value,props.firmwareId,selection.value.device,selection.value.mode,session.user!.accountId!);const g=generation;controller=new AbortController();busy.value=true;unknown.value=true;error.value='';try{complete(await props.transport.send(intent,controller.signal),g)}catch(cause){if(!current(g))return;unknown.value=!(cause instanceof ApiError)||cause.outcomeUnknown||cause.code===10010||cause.code===10014;error.value=unknown.value?'升级请求结果尚未确认，请读取原受理结果；不会重复下发。':errorMessage(cause)}finally{if(alive&&g===generation)busy.value=false}}
async function recover(){if(!readable.value||busy.value||!unknown.value||!sameIntent()||!intent)return;const g=generation;controller=new AbortController();busy.value=true;error.value='';try{complete(await props.transport.recover(intent,controller.signal),g)}catch(cause){if(current(g))error.value=cause instanceof ApiError&&cause.status===404?'原受理结果尚未可读，请稍后继续核对。':errorMessage(cause)}finally{if(alive&&g===generation)busy.value=false}}
watch([()=>projectId.value,()=>props.firmwareId,()=>session.user?.accountId,()=>props.transport],reset,{flush:'sync'})
watch(readable,value=>{if(!value){generation++;controller?.abort();busy.value=false;if(!unknown.value)close()}},{flush:'sync'})
const dispose=onIdentityChange(reset)
onScopeDispose(()=>{alive=false;reset();dispose();emit('locked',false)})
defineExpose({open})
</script>
<template><section class="ota-manual-dispatch"><p v-if="result&&readable" role="status">升级请求已受理，等待平台后续处理，不代表已下发或已安装。受理时间：{{formatTime(result.acceptedAt)}}</p><p v-if="unknown&&!readable" role="alert">升级请求结果仍待核对，恢复OTA读取权限后可继续读取原受理结果；不会重复下发。</p><el-dialog v-if="readable" :model-value="shown" :title="selection?.mode==='REDISPATCH'?'重新下发升级':'下发升级'" width="min(500px,95vw)" :close-on-click-modal="false" :close-on-press-escape="!frozen" :show-close="!frozen" :before-close="beforeClose" @update:model-value="updateShown"><template v-if="selection"><p>设备：{{selection.name}}</p><p>确定{{selection.mode==='REDISPATCH'?'重新提交':'提交'}}此设备的升级请求？平台会重新检查当前升级资格和已有作业占位。</p><p class="help">受理后由平台执行原升级流程；受理不表示设备已收到消息或完成安装。</p></template><p v-if="error" role="alert">{{error}}</p><p v-if="unknown" class="help">原请求：{{intent?.key}}</p><template #footer><el-button :disabled="frozen" @click="close">取消</el-button><el-button v-if="unknown" :loading="busy" :disabled="!readable" @click="recover">读取原受理结果</el-button><el-button v-else type="primary" :loading="busy" :disabled="!writable||!selection" @click="submit">确认下发</el-button></template></el-dialog></section></template>
<style scoped>.ota-manual-dispatch p{font-size:13px;line-height:1.7;overflow-wrap:anywhere}.help{color:var(--tl-muted);font-size:12px!important}.ota-manual-dispatch [role=alert]{color:var(--el-color-danger)}</style>
