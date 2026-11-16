<script setup lang="ts">
import {copySucceeded,copyFailed} from '@/ui/copy-feedback'
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {can,projectId,session} from '@/core/session'
import {ApiError,errorMessage,IdentityChanged,onIdentityChange} from '@/core/http'
import {formatTime} from '@/core/time'
import {CircleCheck,CircleClose,QuestionFilled} from '@element-plus/icons-vue'
import {diagnosticMessageStatus} from './diagnostic-message-status'
import {isDeviceScopeCurrent,useDeviceGuard} from './use-device-guard'
import {readDeviceDiagnosticObservation,type DeviceDiagnosticObservationDetail,type DiagnosticObservationOrigin} from './device-diagnostic-observations-api'
const props=defineProps<{deviceId:string;logId:string;origin:DiagnosticObservationOrigin;generation:number}>()
const emit=defineEmits<{close:[];denied:[cause:ApiError]}>()
const record=shallowRef<DeviceDiagnosticObservationDetail>(),loading=ref(false),error=ref('')
const capture=useDeviceGuard(()=>props.deviceId)
const messageNames:Readonly<Record<string,string>>={PROPERTY_REPORT:'属性上报',PROPERTY_SET:'属性下发',EVENT:'事件上报',EVENT_REPORT:'事件上报',COMMAND:'命令下发',COMMAND_INVOKE:'命令下发',COMMAND_SEND:'命令下发',COMMAND_REPLY:'命令回复'}
const messageLabel=computed(()=>messageNames[record.value?.messageType??'']??(record.value?.direction==='UP'?'上行消息':'下行消息'))
const legacy=computed(()=>record.value?.origin==='LEGACY_SUMMARY')
const displayedContent=computed(()=>legacy.value?record.value?.summary:record.value?.content)
const formatLabel=computed(()=>record.value?.payloadFormat==='UNKNOWN'?undefined:({JSON:'JSON',PLAINTEXT:'Plaintext',BINARY:'Binary'} as const)[record.value?.payloadFormat as 'JSON'|'PLAINTEXT'|'BINARY'])
const messageStatus=computed(()=>record.value?diagnosticMessageStatus(record.value):{kind:'unknown',label:'未记录'})
function messageTime(value:string){const date=new Date(value),base=formatTime(value);return base==='—'?base:`${base}.${date.getUTCMilliseconds().toString().padStart(3,'0')}`}
let serial=0,disposed=false,reader:AbortController|undefined
function clear(){serial++;reader?.abort();record.value=undefined;loading.value=false;error.value=''}
async function load(){
 if(disposed||!can('device:read')){clear();return}
 const check=capture(),s=++serial,controller=new AbortController();reader?.abort();reader=controller;record.value=undefined;error.value='';loading.value=true
 try{const result=await readDeviceDiagnosticObservation(projectId.value,props.deviceId,props.logId,props.origin,controller.signal);if(!disposed&&s===serial&&isDeviceScopeCurrent(check)&&can('device:read'))record.value=result}
 catch(cause){if(disposed||s!==serial||controller.signal.aborted||cause instanceof IdentityChanged||!isDeviceScopeCurrent(check))return;if(cause instanceof ApiError&&[401,403].includes(cause.status)){clear();emit('denied',cause);return}error.value=cause instanceof ApiError&&cause.status===404?'该记录已清空、过期或不可见，请刷新消息日志核对。':errorMessage(cause)}
 finally{if(!disposed&&s===serial&&isDeviceScopeCurrent(check))loading.value=false}
}
async function copyContent(){
 const fragment=displayedContent.value;if(!can('device:read')||fragment===null||fragment===undefined)return
 const check=capture(),s=serial
 try{await navigator.clipboard.writeText(fragment);if(!disposed&&s===serial&&isDeviceScopeCurrent(check)&&can('device:read'))copySucceeded(legacy.value?'已复制片段':'已复制内容')}
 catch{if(!disposed&&s===serial&&isDeviceScopeCurrent(check))copyFailed('复制未完成，请重新选择内容后复制。')}
}
watch(()=>[props.deviceId,props.logId,props.origin,props.generation,projectId.value,session.user?.accountId,session.user?.projectRole,can('device:read')],()=>{clear();if(can('device:read'))void load()},{immediate:true,flush:'sync'})
const unsubscribe=onIdentityChange(()=>{clear();emit('close')})
onScopeDispose(()=>{disposed=true;clear();unsubscribe()})
</script>
<template><el-dialog :model-value="true" title="查看消息" width="min(660px,96vw)" destroy-on-close @close="emit('close')">
 <div v-loading="loading" class="diagnostic-details">
  <el-alert v-if="error" :title="error" type="error" :closable="false"/><el-button v-if="error&&can('device:read')" size="small" :loading="loading" @click="load">重新读取详情</el-button>
  <template v-if="record&&can('device:read')"><dl class="diagnostic-facts">
   <dt>消息 ID</dt><dd>{{record.messageId??'—'}}</dd><dt>消息类型</dt><dd>{{messageLabel}}</dd><dt>消息状态</dt><dd><span class="diagnostic-status" :class="`is-${messageStatus.kind}`"><el-icon aria-hidden="true"><CircleCheck v-if="messageStatus.kind==='success'"/><CircleClose v-else-if="messageStatus.kind==='error'"/><QuestionFilled v-else/></el-icon>{{messageStatus.label}}</span></dd><dt>消息时间</dt><dd>{{messageTime(record.receivedAt)}}</dd>
  </dl><div class="diagnostic-content-title"><span>消息内容 <el-tag v-if="formatLabel" size="small">{{formatLabel}}</el-tag></span><el-button v-if="displayedContent!==null&&displayedContent!==undefined" text size="small" :aria-label="legacy?'复制消息片段':'复制消息内容'" @click="copyContent">复制</el-button></div><p class="diagnostic-fragment-note">{{legacy?`历史脱敏片段${record.summaryTruncated?'，内容已截断':''}。`:record.contentState==='REDACTED'?'完整内容，已移除凭据字段。':record.content!==null?'完整内容。':'没有可安全展示的完整内容。'}}</p><p v-if="displayedContent===null" class="tl-muted">{{legacy?(record.summarySampled?'本条为采样记录，未保留内容片段。':'没有可安全展示的历史片段。'):'原件格式无法安全显示或内容未保留。'}}</p>
  <pre v-else class="diagnostic-fragment" :aria-label="legacy?'脱敏消息片段':'完整安全消息内容'">{{displayedContent}}</pre><p class="diagnostic-help"><a href="https://www.thingscloud.xyz/docs/guide/device-manage/device-messages.html" target="_blank" rel="noopener noreferrer">什么是设备消息？ ↗</a></p>
  <dl class="diagnostic-facts"><dt>请求方式</dt><dd>{{record.protocol==='COAP'?'CoAP':record.protocol}}</dd><template v-if="record.protocol==='MQTT'&&record.topic"><dt>MQTT 发布 Topic</dt><dd>{{record.topic}}</dd></template><template v-if="record.protocol==='HTTP'&&record.httpPath"><dt>HTTP API Path</dt><dd>{{record.httpPath}}</dd></template></dl><template v-if="record.errorCode||record.errorBody"><div class="diagnostic-error-title">错误信息</div><pre class="diagnostic-fragment">{{record.errorBody??`错误码：${record.errorCode}`}}</pre></template></template>
 </div>
</el-dialog></template>
<style scoped>.diagnostic-facts{margin:0}.diagnostic-facts dt,.diagnostic-content-title,.diagnostic-error-title{margin-top:18px;color:#999;font-size:12px;line-height:18px}.diagnostic-facts dt:first-child{margin-top:0}.diagnostic-facts dd{margin:4px 0 0;font-size:14px;line-height:20px;overflow-wrap:anywhere}.diagnostic-content-title{display:flex;align-items:center;justify-content:space-between}.diagnostic-content-title .el-button{padding:0;height:auto}.diagnostic-fragment-note{margin:4px 0;color:#888;font-size:12px;line-height:18px}.diagnostic-fragment{margin:4px 0 0;padding:10px;border-radius:4px;background:#282828;color:#e8edf5;font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere}.diagnostic-help{text-align:right;margin:4px 0 12px;font-size:12px}.diagnostic-status{display:inline-flex;align-items:center;gap:6px}.diagnostic-status.is-success{color:#48c78e}.diagnostic-status.is-error{color:#f14668}.diagnostic-status.is-unknown{color:#909399}.diagnostic-details>.tl-muted{font-size:13px;line-height:21px}</style>
