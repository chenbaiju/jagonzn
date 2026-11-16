<script setup lang="ts">
import {showOperationFeedback} from '@/ui/operation-feedback'
import {ref,computed,watch,onScopeDispose} from 'vue'
import {ElMessage} from 'element-plus'
import {Download,MagicStick} from '@element-plus/icons-vue'
import {can,projectId,currentProject} from '@/core/session'
import {ApiError,IdentityChanged,onIdentityChange,errorMessage} from '@/core/http'
import JsonCodeEditor from '@/ui/JsonCodeEditor.vue'
import {useDeviceGuard} from './use-device-guard'
import {prepareDownlink,sendDownlink,recoverDownlink,formatDownlinkJson,type DownlinkIntent,type DownlinkKind} from './device-downlink-api'
const props=defineProps<{deviceId:string}>()
const emit=defineEmits<{saved:[];busy:[value:boolean]}>()
const shown=ref(false),kind=ref<DownlinkKind>('PROPERTY'),input=ref(''),phase=ref<'idle'|'preparing'|'sending'|'unknown'|'checking'>('idle'),error=ref(''),editorSession=ref(0)
const writable=computed(()=>can('device:control')&&currentProject.value?.status==='ACTIVE')
const working=computed(()=>['preparing','sending','checking'].includes(phase.value)),blocked=computed(()=>working.value||phase.value==='unknown')
const capture=useDeviceGuard(()=>props.deviceId)
let serial=0,controller:AbortController|undefined,intent:DownlinkIntent|undefined
watch(blocked,value=>emit('busy',value),{immediate:true,flush:'sync'})
function reset(){serial++;controller?.abort();controller=undefined;intent=undefined;shown.value=false;kind.value='PROPERTY';input.value='';phase.value='idle';error.value='';editorSession.value++}
function start(){if(!can('device:control')||working.value)return;if(phase.value==='unknown'){shown.value=true;return}if(writable.value){error.value='';shown.value=true}}
function close(done?:()=>void){if(working.value)return;shown.value=false;if(phase.value!=='unknown')error.value='';done?.()}
function format(){if(phase.value!=='idle')return;try{input.value=formatDownlinkJson(input.value);error.value=''}catch(cause){error.value=errorMessage(cause)}}
function deny(){reset();ElMessage.error('操作权限已失效，请刷新权限后重试')}
function accepted(recovered:boolean){intent=undefined;phase.value='idle';shown.value=false;error.value='';emit('saved');showOperationFeedback(recovered?'已核对原请求受理记录':'消息已受理')}
async function send(){
 if(phase.value!=='idle'||!writable.value)return
 const current=++serial,check=capture(),project=projectId.value,device=props.deviceId,selectedKind=kind.value,body=input.value
 controller=new AbortController();const signal=controller.signal;error.value='';phase.value='preparing'
 try{
  const next=await prepareDownlink(project,device,selectedKind,body,signal);check();if(current!==serial||signal.aborted)return
  // 读取模型与计算摘要期间项目可能归档；首次发送前复核，不清除已发送的未知意图。
  if(!writable.value)throw new Error('项目当前不可修改，本次消息尚未发送。')
  intent=next;phase.value='sending';await sendDownlink(next,signal);check();if(current!==serial||signal.aborted)return;accepted(false)
 }catch(cause){
  if(current!==serial||signal.aborted||cause instanceof IdentityChanged)return
  if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}
  const beforeWrite=phase.value==='preparing',definite=cause instanceof ApiError&&!cause.outcomeUnknown&&[400,404,409,413,415,422,429].includes(cause.status)&&![10010,10014].includes(cause.code||0)
  phase.value=beforeWrite||definite?'idle':'unknown';if(phase.value==='idle')intent=undefined;error.value=errorMessage(cause)
 }
}
async function recover(){
 if(phase.value!=='unknown'||!intent||!can('device:control'))return
 const current=++serial,check=capture(),original=intent;controller=new AbortController();const signal=controller.signal;phase.value='checking';error.value=''
 try{await recoverDownlink(original,signal);check();if(current!==serial||signal.aborted)return;accepted(true)}
 catch(cause){if(current!==serial||signal.aborted||cause instanceof IdentityChanged)return;if(cause instanceof ApiError&&[401,403].includes(cause.status)){deny();return}phase.value='unknown';error.value=cause instanceof ApiError&&cause.status===404?'暂未定位原请求回执，请稍后核对；本次操作不会再次发送。':errorMessage(cause)}
}
watch(kind,()=>{if(phase.value==='idle')error.value=''})
watch([()=>projectId.value,()=>props.deviceId,()=>can('device:control')],reset)
const dispose=onIdentityChange(reset)
onScopeDispose(()=>{reset();dispose();emit('busy',false)})
</script>
<template><section class="device-message-downlink"><h2>向设备下发消息</h2><p>从云平台向设备下发消息，支持属性下发、命令下发、自定义数据流下发等。 <a href="https://www.thingscloud.xyz/docs/guide/connect-device/test-msg.html#向设备下发消息" target="_blank" rel="noopener noreferrer">如何向设备下发消息？ ↗</a></p><el-button v-if="can('device:control')" size="small" plain :icon="Download" :disabled="!writable&&phase!=='unknown'||working" @click="start">下发消息</el-button>
<el-dialog :model-value="shown" title="下发消息到设备" width="min(660px,96vw)" class="source-downlink-dialog" :close-on-click-modal="false" :show-close="!working" :close-on-press-escape="!working" :before-close="close" destroy-on-close>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/>
 <el-alert v-if="phase==='unknown'||phase==='checking'" title="结果未知，请核对原请求；本次操作不会再次发送。" type="warning" :closable="false"/>
 <div class="downlink-editor-toolbar"><el-select v-model="kind" size="small" aria-label="下发消息类型" :disabled="phase!=='idle'"><el-option-group label="标准协议下发"><el-option label="属性下发" value="PROPERTY"/><el-option label="命令下发" value="COMMAND"/></el-option-group></el-select><span><el-button text size="small" :icon="MagicStick" :disabled="phase!=='idle'" @click="format">整理</el-button><el-tag size="small">JSON</el-tag></span></div>
 <JsonCodeEditor :key="`${projectId}:${deviceId}:${editorSession}`" v-model="input" ariaLabel="下发消息 JSON" :height="300" :disabled="phase!=='idle'"/>
 <template #footer><el-button :disabled="working" @click="close()">取消</el-button><el-button v-if="phase==='unknown'||phase==='checking'" type="primary" :loading="phase==='checking'" @click="recover">核对原请求</el-button><el-button v-else type="primary" :loading="working" :disabled="!writable||phase!=='idle'" @click="send">发送</el-button></template>
</el-dialog></section></template>
<style scoped>.device-message-downlink{margin-bottom:40px}.device-message-downlink h2{font-size:22px;line-height:32px;font-weight:400;color:#002822;margin:0}.device-message-downlink p{margin:8px 0 12px;font-size:15px;line-height:22px;color:#888}.device-message-downlink a{font-size:13px}.downlink-editor-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px}.downlink-editor-toolbar>.el-select{width:200px}.downlink-editor-toolbar :deep(.el-select__wrapper){min-height:32px;height:32px}.downlink-editor-toolbar>span{display:flex;align-items:center;gap:8px}</style>
<style>.source-downlink-dialog .el-dialog__header{padding:20px 20px 10px;margin:0}.source-downlink-dialog .el-dialog__body{padding:40px 20px 30px;max-height:calc(85dvh - 124px);overflow-y:auto}.source-downlink-dialog .el-dialog__footer{padding:10px 20px 20px}.source-downlink-dialog .el-alert{margin-bottom:12px}</style>
