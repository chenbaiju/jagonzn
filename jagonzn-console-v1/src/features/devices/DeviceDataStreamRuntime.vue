<script setup lang="ts">
import {computed,onScopeDispose,ref,shallowRef,watch} from 'vue'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,currentProject,projectId,session} from '@/core/session'
import {formatTime} from '@/core/time'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {dataTransport,dataBytes,dataApplicationBytes,dataHex,dataFromBase64,prepareDataDownlink,type DataTransport,type DataSession,type DataMessage,type DataDirection,type DataIntent} from './data-stream-runtime-api'
import DeviceMqttDataRuntime from './DeviceMqttDataRuntime.vue'
const props=withDefaults(defineProps<{deviceId:string;disabled?:boolean;transport?:DataTransport}>(),{disabled:false,transport:()=>dataTransport})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>(),roles=['OWNER','ADMIN','OPERATOR','VIEWER']
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&typeDeviceUuid.test(projectId.value)&&typeDeviceUuid.test(props.deviceId)&&can('device:read')&&currentProject.value?.id===projectId.value&&roles.includes(session.user.projectRole||'')&&roles.includes(currentProject.value.myRole||''))
const writable=computed(()=>readable.value&&currentProject.value?.status==='ACTIVE'&&can('device:update')&&can('device:control')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const currentPin=shallowRef<DataSession>(),rows=shallowRef<readonly DataMessage[]>(),receipt=shallowRef<DataMessage>(),intent=shallowRef<DataIntent>(),selected=shallowRef<DataMessage>()
const direction=ref<DataDirection>('UP'),loading=ref(false),busy=ref(false),shown=ref(false),unknown=ref(false),error=ref(''),pinNotice=ref(''),historyError=ref(''),notice=ref(''),mode=ref<'HEX'|'UTF8'>('HEX'),raw=ref(''),lifetime=ref(60)
const mqttLocked=ref(false),locked=computed(()=>shown.value||busy.value||unknown.value||mqttLocked.value)
const local=computed(()=>{try{const bytes=dataBytes(raw.value,mode.value);if(currentPin.value?.wireProfile==='TL_TCP_RAW_V1'&&bytes.length===0)throw new Error('TCP透传下行至少需要1字节');return{bytes,hex:dataHex(bytes),error:''}}catch(cause){return{bytes:undefined,hex:'',error:errorMessage(cause)}}})
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
let generation=0,alive=true,controller:AbortController|undefined
function capture(){return{generation,epoch:identityEpoch(),project:projectId.value,device:props.deviceId,actor:session.user?.accountId}}
function current(s:ReturnType<typeof capture>){return alive&&generation===s.generation&&identityEpoch()===s.epoch&&projectId.value===s.project&&props.deviceId===s.device&&session.user?.accountId===s.actor&&readable.value}
function clear(){generation++;controller?.abort();currentPin.value=undefined;rows.value=undefined;receipt.value=undefined;intent.value=undefined;selected.value=undefined;loading.value=false;busy.value=false;shown.value=false;unknown.value=false;raw.value='';mode.value='HEX';lifetime.value=60;error.value='';pinNotice.value='';historyError.value='';notice.value=''}
function clearDraft(){shown.value=false;unknown.value=false;intent.value=undefined;raw.value='';error.value=''}
async function load(){
 if(!readable.value||props.disabled||locked.value||loading.value)return
 const s=capture(),wanted=direction.value;controller=new AbortController();loading.value=true;error.value='';pinNotice.value='';historyError.value='';currentPin.value=undefined;rows.value=undefined
 const values=await Promise.allSettled([props.transport.current(s.project,s.device,controller.signal),props.transport.history(s.project,s.device,wanted,controller.signal)])
 if(!current(s))return
 const pin=values[0],history=values[1]
 if(pin.status==='fulfilled'){currentPin.value=pin.value;pinNotice.value=pin.value.available?'':'当前固定发布没有TCP目标流。重连后读取新发布。'}
 else if(pin.reason instanceof ApiError&&pin.reason.status===404)pinNotice.value='当前没有可读的明确协商DATA会话；入口配置和客户端协商需分别确认。'
 else error.value=errorMessage(pin.reason)
 if(history.status==='fulfilled'&&direction.value===wanted)rows.value=history.value
 else if(history.status==='rejected')historyError.value=errorMessage(history.reason)
 if(values.some(value=>value.status==='rejected'&&value.reason instanceof ApiError&&[401,403].includes(value.reason.status))){clear();error.value='DATA读取权限已失效';return}
 loading.value=false
}
function start(){if(!writable.value||props.disabled||locked.value||!currentPin.value?.available)return;clearDraft();notice.value='';shown.value=true}
function review(){if(!writable.value||props.disabled||busy.value||unknown.value||!shown.value||!currentPin.value||!local.value.bytes)return;try{intent.value=prepareDataDownlink(projectId.value,props.deviceId,currentPin.value,local.value.bytes,Number(lifetime.value));error.value=''}catch(cause){error.value=errorMessage(cause)}}
function close(){if(busy.value)return;if(unknown.value)shown.value=false;else clearDraft()}
function complete(value:DataMessage){if(receipt.value&&intent.value&&receipt.value.messageId!==value.messageId)throw new Error('原键读回了另一投递身份');receipt.value=value;unknown.value=false;shown.value=false;busy.value=false;notice.value=value.wireProfile==='TL_TCP_RAW_V1'?'原下行准备身份已确认；状态以原件为准，透传连接不提供逐包应答。':'原下行准备身份已确认；状态以原件为准，设备应答与物理执行分别判断。';emit('changed')}
async function submit(){
 const original=intent.value;if(!original||!writable.value||props.disabled||busy.value||unknown.value||!shown.value)return
 const s=capture();busy.value=true;unknown.value=true;receipt.value=undefined;error.value='';controller=new AbortController()
 try{const value=await props.transport.create(original,controller.signal);if(current(s)&&intent.value===original)complete(value)}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged)){error.value=errorMessage(cause);if(cause instanceof ApiError&&!cause.outcomeUnknown&&cause.code!==10014&&[400,401,403,404,413,422,429].includes(cause.status)){unknown.value=false;intent.value=undefined}}}
 finally{if(current(s))busy.value=false}
}
async function recover(){
 const original=intent.value;if(!original||!readable.value||busy.value)return
 const s=capture();controller=new AbortController();busy.value=true;error.value=''
 try{const value=await props.transport.original(original,controller.signal);if(current(s)&&intent.value===original)complete(value)}
 catch(cause){if(current(s)&&!(cause instanceof IdentityChanged))error.value=cause instanceof ApiError&&cause.status===404?'尚未找到同次原件，原结果仍未知，不会重发。':errorMessage(cause)}
 finally{if(current(s))busy.value=false}
}
function changeDirection(value:unknown){if(locked.value||props.disabled||loading.value||!['UP','DOWN'].includes(String(value)))return;direction.value=value as DataDirection;void load()}
function rawView(value:DataMessage){selected.value=value}
function originalHex(value:DataMessage){return value.payloadBase64===null?'':dataHex(dataFromBase64(value.payloadBase64))}
function originalText(value:DataMessage){if(value.payloadBase64===null)return'';try{return new TextDecoder('utf-8',{fatal:true}).decode(dataFromBase64(value.payloadBase64))}catch{return'原字节不是有效UTF8，请查看HEX。'}}
watch([raw,mode,lifetime],()=>{if(!unknown.value&&!busy.value)intent.value=undefined})
watch([()=>props.deviceId,()=>projectId.value,()=>session.user?.accountId,readable],()=>{clear();if(readable.value)void load()},{immediate:true,flush:'sync'})
watch(writable,value=>{if(!value&&!locked.value)clearDraft()})
const dispose=onIdentityChange(clear);onScopeDispose(()=>{alive=false;clear();dispose()})
</script>
<template><section v-if="readable" class="data-runtime">
 <h2>TCP 数据流</h2><p>展示当前连接固定发布的数据原件。上行、下行准备、网络写出和设备应答分别记录。</p>
 <el-alert v-if="error" :title="error" type="error" :closable="false"/><p v-if="notice" role="status">{{notice}}</p>
 <div class="data-actions"><el-button :loading="loading" :disabled="disabled||locked" @click="load">刷新DATA会话与记录</el-button><el-button v-if="writable" type="primary" :disabled="disabled||locked||!currentPin?.available" @click="start">准备原字节下行</el-button></div>
 <p v-if="pinNotice" role="status">{{pinNotice}}</p><dl v-if="currentPin"><dt>连接方式</dt><dd>{{currentPin.wireProfile==='TL_TCP_RAW_V1'?'注册包透传':'标准 TCP'}}</dd><dt>固定连接</dt><dd>{{currentPin.connectionId}} · 代次 {{currentPin.generation}}</dd><dt>固定发布</dt><dd>{{currentPin.publicationId||'无发布'}} · 发布代次 {{currentPin.publicationRevision}}</dd><dt>流与格式</dt><dd>{{currentPin.streamIdentifier||'无TCP目标'}} · {{currentPin.format||'—'}}</dd><dt>定义摘要</dt><dd>{{currentPin.definitionDigest||'—'}}</dd></dl>
 <p v-if="unknown" role="alert">原下行结果待核对，原键与字节已保留，不会再次POST。<el-button :loading="busy" :disabled="busy" @click="recover">按原键读取DATA结果</el-button></p>
 <section v-if="receipt" class="data-receipt"><h3>本次原件</h3><p>{{receipt.messageId}} · {{receipt.state}}</p><p>截止 {{receipt.expiresAt?formatTime(receipt.expiresAt):'—'}}；网络写出 {{receipt.sentAt?formatTime(receipt.sentAt):'未确认'}}；设备交接应答 {{receipt.wireProfile==='TL_TCP_RAW_V1'?'不提供逐包应答':receipt.acknowledgedAt?formatTime(receipt.acknowledgedAt):'未确认'}}。</p><el-button :disabled="busy" @click="recover">读取原投递状态</el-button><el-button @click="rawView(receipt)">查看本次原字节</el-button></section>
 <div class="data-actions"><el-select :model-value="direction" aria-label="DATA消息方向" :disabled="disabled||locked||loading" @update:model-value="changeDirection"><el-option label="上行原件" value="UP"/><el-option label="下行原件" value="DOWN"/></el-select><span>最多最近20条；{{rows?`本次读取${rows.length}条`:'尚未取得本次记录'}}。</span></div>
 <p v-if="historyError" role="alert">记录读取失败：{{historyError}}</p><el-table v-if="rows" :data="[...rows]" empty-text="当前方向没有近期DATA原件"><el-table-column prop="messageId" label="消息ID" min-width="220"/><el-table-column prop="streamIdentifier" label="流"/><el-table-column prop="format" label="格式"/><el-table-column prop="rawBytes" label="字节数"/><el-table-column prop="state" label="原件状态"/><el-table-column prop="decodeStatus" label="解码状态"/><el-table-column label="受理时间" min-width="160"><template #default="scope">{{formatTime(scope.row.acceptedAt)}}</template></el-table-column><el-table-column label="原字节"><template #default="scope"><el-button link @click="rawView(scope.row)">查看</el-button></template></el-table-column></el-table>
 <el-dialog :model-value="shown" title="确认原字节DATA下行" width="min(680px,94vw)" :close-on-click-modal="false" :close-on-press-escape="!busy" :before-close="(done:()=>void)=>{if(!busy){close();done()}}">
  <p>目标固定为当前连接与发布，后继重连不会改投。准备成功仅建立原件；发送和设备交接应答另行记录。</p><p v-if="currentPin">连接 {{currentPin.connectionId}}；发布 {{currentPin.publicationId}}；流 {{currentPin.streamIdentifier}} / {{currentPin.format}}。</p>
  <el-select v-model="mode" aria-label="DATA输入编码" :disabled="disabled||busy||unknown||!writable"><el-option label="HEX原字节" value="HEX"/><el-option label="UTF8文本原字节" value="UTF8"/></el-select>
  <el-input v-model="raw" type="textarea" :rows="6" aria-label="DATA下行原文" :disabled="disabled||busy||unknown||!writable"/><el-input-number v-model="lifetime" aria-label="DATA下行有效秒数" :min="1" :max="300" :step="1" :precision="0" :disabled="disabled||busy||unknown||!writable"/>
  <p v-if="local.error" role="alert">{{local.error}}</p><p v-else>原字节 {{local.bytes!.length}}；应用载荷 {{dataApplicationBytes(local.bytes!.length,currentPin?.wireProfile||'TL_TCP_DATA_V1')}} 字节{{currentPin?.wireProfile==='TL_TCP_RAW_V1'?'（原始透传字节）':'（含32字节身份前缀）'}}。实际计量沿项目合同。</p>
  <pre v-if="intent" aria-label="DATA原字节确认预览">{{local.hex||'空原字节'}}</pre><p v-if="intent">本次原键：<code>{{intent.key}}</code></p><el-alert v-if="error" :title="error" type="error" :closable="false"/>
  <template #footer><el-button :disabled="busy" @click="close">{{unknown?'关闭并保留原请求':'取消'}}</el-button><el-button v-if="!intent&&!unknown" :disabled="disabled||busy||!writable||!!local.error" @click="review">预览原字节下行</el-button><el-button v-if="intent&&!unknown" type="primary" :disabled="disabled||busy||!writable" :loading="busy" @click="submit">确认一次准备</el-button><el-button v-if="unknown" :loading="busy" :disabled="busy" @click="recover">按原键读取DATA结果</el-button></template>
 </el-dialog>
 <el-dialog :model-value="!!selected" title="DATA原件字节" width="min(760px,94vw)" @close="selected=undefined"><template v-if="selected"><p>{{selected.messageId}}；固定发布 {{selected.publicationId}}；{{selected.rawBytes}} 原字节 / {{selected.applicationBytes}} 应用字节。</p><p>原字节SHA256：<code>{{selected.rawDigest}}</code></p><p>应用载荷SHA256：<code>{{selected.wireDigest}}</code></p><p v-if="selected.payloadBase64===null">原字节已按保留策略到期；当前仅显示原件头。</p><template v-else><h3>HEX</h3><pre aria-label="DATA原件HEX">{{originalHex(selected)||'空原字节'}}</pre><h3>UTF8原文</h3><pre aria-label="DATA原件UTF8">{{originalText(selected)}}</pre></template></template></el-dialog>
</section><DeviceMqttDataRuntime :device-id="deviceId" :disabled="disabled||shown||busy||unknown" @locked="mqttLocked=$event" @changed="emit('changed')"/></template>
<style scoped>.data-runtime{margin-top:24px;padding-top:18px;border-top:1px solid var(--tl-border);font-size:13px;line-height:22px}.data-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:12px 0}.data-actions .el-select{width:150px}.data-runtime dl{display:grid;grid-template-columns:90px 1fr;gap:5px 12px}.data-runtime dd{margin:0;overflow-wrap:anywhere}.data-runtime pre{max-height:320px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;background:var(--tl-bg-base)}.data-runtime code{overflow-wrap:anywhere}.data-receipt{padding:12px;border:1px solid var(--tl-border)}</style>
