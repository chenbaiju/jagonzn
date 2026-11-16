<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {formatTime} from '@/core/time'
import {useResource} from '@/core/use-resource'
import AsyncState from '@/ui/AsyncState.vue'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {otaDeletionTransport,prepareOtaDeletion,decodeOtaDeletionResult,type OtaDeletionTransport,type OtaDeletionIntent,type OtaDeletionResult} from './ota-deletion-api'
const props=withDefaults(defineProps<{firmwareId:string;disabled?:boolean;portal?:boolean;target?:HTMLElement|null;transport?:OtaDeletionTransport}>(),{transport:()=>otaDeletionTransport})
const emit=defineEmits<{locked:[value:boolean];deleted:[]}>()
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.firmwareId)&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||'')&&can('ota:read'))
const allowed=computed(()=>readable.value&&currentProject.value?.status==='ACTIVE'&&can('ota:deploy')),writable=computed(()=>allowed.value&&!props.disabled)
const shown=ref(false),busy=ref(false),unknown=ref(false),error=ref(''),result=shallowRef<OtaDeletionResult>(),frozen=computed(()=>busy.value||unknown.value)
const head=useResource(signal=>props.transport.enablement(projectId.value,props.firmwareId,signal))
let generation=0,alive=true,intent:OtaDeletionIntent|undefined,controller:AbortController|undefined
watch(frozen,value=>emit('locked',value),{immediate:true,flush:'sync'})
function sameIntent(){return !!intent&&intent.project===projectId.value&&intent.firmware===props.firmwareId&&intent.actor===session.user?.accountId&&intent.identity===identityEpoch()}
function current(g:number){return alive&&g===generation&&readable.value&&sameIntent()}
function reset(){generation++;controller?.abort();head.clear();shown.value=false;busy.value=false;unknown.value=false;error.value='';result.value=undefined;intent=undefined}
function readHead(){if(!readable.value||frozen.value)return;head.clear();intent=undefined;error.value='';void head.reload()}
function open(){if(!writable.value||frozen.value)return;generation++;shown.value=true;result.value=undefined;readHead()}
function close(){if(frozen.value)return;generation++;head.clear();shown.value=false;error.value='';intent=undefined}
function updateShown(value:boolean){if(!value)close()}
function beforeClose(done:()=>void){if(!frozen.value){close();done()}}
function complete(receipt:OtaDeletionResult,g:number){if(!current(g)||!intent)return;result.value=decodeOtaDeletionResult(receipt,intent);unknown.value=false;busy.value=false;shown.value=false;intent=undefined;error.value='';emit('deleted')}
async function submit(){if(!writable.value||frozen.value||head.loading.value||head.data.value?.enabled!==false)return;intent=prepareOtaDeletion(projectId.value,props.firmwareId,head.data.value,session.user!.accountId!);const g=generation;controller=new AbortController();busy.value=true;unknown.value=true;error.value='';try{complete(await props.transport.remove(intent,controller.signal),g)}catch(cause){if(!current(g))return;unknown.value=!(cause instanceof ApiError)||cause.outcomeUnknown||cause.code===10010||cause.code===10014;error.value=unknown.value?'删除结果尚未确认，请读取原删除结果；不会重复提交。':errorMessage(cause);if(!unknown.value)head.clear()}finally{if(alive&&g===generation)busy.value=false}}
async function recover(){if(!readable.value||busy.value||!unknown.value||!intent||!sameIntent())return;const g=generation;controller=new AbortController();busy.value=true;error.value='';try{complete(await props.transport.recover(intent,controller.signal),g)}catch(cause){if(current(g))error.value=cause instanceof ApiError&&cause.status===404?'原删除结果尚未可读，请稍后继续核对。':errorMessage(cause)}finally{if(alive&&g===generation)busy.value=false}}
watch([()=>projectId.value,()=>props.firmwareId,()=>session.user?.accountId,()=>props.transport],reset,{flush:'sync'})
watch(readable,value=>{if(!value){generation++;controller?.abort();head.clear();busy.value=false;if(!unknown.value)close()}},{flush:'sync'})
const dispose=onIdentityChange(reset)
onScopeDispose(()=>{alive=false;reset();dispose();emit('locked',false)})
</script>
<template><Teleport :to="target||'body'" :disabled="!target"><section v-if="allowed&&(!portal||target)" class="ota-deletion"><h3>删除版本</h3><p>删除后无法恢复。既有升级仍按原安全流程收束。</p><el-button type="danger" plain :disabled="disabled||frozen" @click="open">删除版本</el-button></section></Teleport><p v-if="unknown&&!readable" role="alert">删除结果仍待核对，恢复OTA读取权限后可继续读取原删除结果；不会重复提交。</p><p v-if="result&&readable" role="status">版本已删除，确认时间：{{formatTime(result.deletedAt)}}。既有升级仍按原安全流程收束。</p><el-dialog v-if="readable" :model-value="shown" title="删除版本" width="min(500px,95vw)" :close-on-click-modal="false" :close-on-press-escape="!frozen" :show-close="!frozen" :before-close="beforeClose" @update:model-value="updateShown"><p>删除后无法恢复，此版本将不再显示。既有升级仍按原安全流程收束。</p><AsyncState v-if="!unknown" :loading="head.loading.value" :error="head.error.value" @retry="readHead"><template v-if="head.data.value"><p v-if="head.data.value.enabled" role="status">该版本当前已启用，请先停用后再删除。</p><p v-else>已读取当前停用状态。确定删除此版本？</p></template></AsyncState><p v-if="error" role="alert">{{error}}</p><p v-if="unknown" class="help">原删除请求：{{intent?.key}}</p><template #footer><el-button :disabled="frozen" @click="close">取消</el-button><el-button v-if="unknown" :loading="busy" @click="recover">读取原删除结果</el-button><template v-else><el-button :disabled="head.loading.value||frozen" @click="readHead">重新读取启停状态</el-button><el-button v-if="head.data.value?.enabled===false" type="danger" :disabled="!writable||frozen||head.loading.value" :loading="busy" @click="submit">确认删除</el-button></template></template></el-dialog></template>
<style scoped>.ota-deletion{border-top:1px solid var(--tl-border);margin-top:26px;padding-top:16px}.ota-deletion h3{font-size:17px;font-weight:500}.ota-deletion p,.help{font-size:12px;line-height:20px;color:var(--tl-muted)}[role=alert]{color:var(--el-color-danger);font-size:13px;line-height:20px;overflow-wrap:anywhere}</style>
