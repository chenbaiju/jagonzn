<script setup lang="ts">
import {computed,onScopeDispose,ref,watch} from 'vue'
import {api,ApiError,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {can,projectId} from '@/core/session'
import type {Schema} from '@/core/contracts'
import JsonCodeEditor from '@/ui/JsonCodeEditor.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import RuleEventPreviewDevicePicker from './RuleEventPreviewDevicePicker.vue'
import {deviceSourceMembers} from './rule-source-api'
import {readRawRuleJson} from './raw-rule-json'
import {decodeDataDownlinkPreview,downlinkPreviewContent} from './data-downlink-function-api'
import {ExactDecimal,parsePreprocessJson,writePreprocessJson} from './preprocess-exact-json'

const reportedNodes=['current-device-properties-function','current-device-cloud-properties-function','current-device-command-function','current-device-report-data-function','device-report-properties-function','device-report-cloud-properties-function','device-report-command-function','device-report-data-function'] as const
type PreviewNode='attributes-report-preprocess-function'|'attributes-push-preprocess-function'|'current-device-data-function'|'report-gateway-properties-function'|'event-device-properties-function'|'event-device-command-function'|typeof reportedNodes[number]
const props=withDefaults(defineProps<{source:string;disabled?:boolean;nodeType?:PreviewNode;deviceSource?:Schema<'MessageRuleContentSource'>}>(),{nodeType:'report-gateway-properties-function'})
const eventTarget=computed(()=>props.nodeType==='event-device-properties-function'||props.nodeType==='event-device-command-function')
const preprocess=computed(()=>props.nodeType==='attributes-report-preprocess-function'||props.nodeType==='attributes-push-preprocess-function')
const reported=computed(()=>reportedNodes.some(node=>node===props.nodeType)),dataPurpose=computed(()=>['current-device-data-function','current-device-report-data-function','device-report-data-function'].includes(props.nodeType))
const inputLabel=computed(()=>(props.nodeType==='current-device-data-function'||props.nodeType==='attributes-push-preprocess-function')?'设备下发属性':'设备上报属性')
const outputLabel=computed(()=>preprocess.value?'预处理后的属性':dataPurpose.value?'生成的下发自定义数据':['current-device-cloud-properties-function','device-report-cloud-properties-function'].includes(props.nodeType)?'生成的更新属性':['current-device-properties-function','device-report-properties-function','event-device-properties-function'].includes(props.nodeType)?'生成的下发属性':['current-device-command-function','device-report-command-function','event-device-command-function'].includes(props.nodeType)?'生成的下发命令':'生成转发子设备的属性')
const emit=defineEmits<{busy:[value:boolean];denied:[cause:ApiError]}>()
const expanded=ref(false),input=ref('{}'),output=ref(''),noDownlink=ref(false),outputFormat=ref(''),failure=ref(''),running=ref(false),unavailable=ref(false)
const sampleDeviceId=ref(''),candidateLoading=ref(false)
const sourceKey=computed(()=>{if(!props.deviceSource)return '';try{return props.deviceSource.kind+':'+deviceSourceMembers(props.deviceSource).join(',')}catch{return 'invalid'}})
const allowed=computed(()=>!!projectId.value&&can('rule:manage')&&!unavailable.value)
let alive=true,generation=0,controller:AbortController|undefined
function invalidate(){generation++;controller?.abort();running.value=false;output.value='';noDownlink.value=false;outputFormat.value='';failure.value=''}
watch(()=>running.value||candidateLoading.value,value=>emit('busy',value),{immediate:true,flush:'sync'})
function selectSample(value:string){sampleDeviceId.value=value;invalidate()}
function denyPreview(cause:ApiError){invalidate();sampleDeviceId.value='';input.value='{}';unavailable.value=true;emit('denied',cause)}
watch([()=>props.source,input],invalidate)
watch(sourceKey,()=>{sampleDeviceId.value='';invalidate()})
watch(()=>props.nodeType,()=>{invalidate();sampleDeviceId.value='';input.value='{}';expanded.value=false})
watch(projectId,()=>{invalidate();sampleDeviceId.value='';input.value='{}';expanded.value=false})
const dispose=onIdentityChange(()=>{invalidate();sampleDeviceId.value='';input.value='{}';expanded.value=false;unavailable.value=true})
onScopeDispose(()=>{alive=false;controller?.abort();dispose();emit('busy',false)})
async function run(){
 if(props.disabled||running.value||candidateLoading.value||!allowed.value)return
 invalidate()
 let body:string
 try{
  const value=parsePreprocessJson(input.value)
  if(!value||typeof value!=='object'||Array.isArray(value)||value instanceof ExactDecimal)throw new Error('请填写'+inputLabel.value+'JSON对象')
  const fields:Partial<Record<keyof Schema<'PreviewMessageRuleEventFunctionRequest'>,string>>={nodeType:JSON.stringify(props.nodeType),function:JSON.stringify({format:'COMMON_JS',source:props.source}),input:writePreprocessJson(value)}
  if(eventTarget.value&&sampleDeviceId.value){
   const selected=props.deviceSource
   if(!selected||!['DEVICE','DEVICE_TYPE'].includes(selected.kind)||sourceKey.value==='invalid'||selected.kind==='DEVICE'&&!deviceSourceMembers(selected).includes(sampleDeviceId.value))throw new Error('请选择当前来源中的模拟设备')
   const context:Required<Pick<Schema<'PreviewMessageRuleEventFunctionRequest'>,'deviceSource'|'sampleDeviceId'>>={deviceSource:selected,sampleDeviceId:sampleDeviceId.value}
   fields.deviceSource=JSON.stringify(context.deviceSource);fields.sampleDeviceId=JSON.stringify(context.sampleDeviceId)
  }
  body='{'+Object.entries(fields).map(([key,value])=>JSON.stringify(key)+':'+value).join(',')+'}'
  if(new TextEncoder().encode(props.source).length>65536||new TextEncoder().encode(input.value).length>65536||new TextEncoder().encode(body).length>196608)throw new Error('函数或样例超过允许大小')
 }catch(cause){failure.value=errorMessage(cause);return}
 const turn=generation,epoch=identityEpoch(),project=projectId.value,source=props.source,sample=input.value,nodeType=props.nodeType,device=sampleDeviceId.value,deviceScope=sourceKey.value
 const current=()=>alive&&turn===generation&&epoch===identityEpoch()&&project===projectId.value&&source===props.source&&sample===input.value&&nodeType===props.nodeType&&device===sampleDeviceId.value&&deviceScope===sourceKey.value&&allowed.value
 controller=new AbortController();running.value=true
 try{
  const options={method:'post' as const,rawBody:body,headers:{'Content-Type':'application/json'},signal:controller.signal,maxResponseBytes:512*1024}
  const reply=nodeType==='attributes-report-preprocess-function'||nodeType==='attributes-push-preprocess-function'?{purpose:'JSON' as const,value:await api<Schema<'MessageRulePropertyPreprocessFunctionPreviewResponse'>>(`/api/v1/projects/${project}/message-rule-function-previews/property-preprocess`,options)}:reportedNodes.some(node=>node===nodeType)?{purpose:dataPurpose.value?'DATA' as const:'JSON' as const,value:await api<Schema<'MessageRuleReportedDeviceFunctionPreviewResponse'>>(`/api/v1/projects/${project}/message-rule-function-previews/reported-device`,options)}:nodeType==='current-device-data-function'?{purpose:'DATA' as const,value:await api<Schema<'MessageRuleAttributePushDataFunctionPreviewResponse'>>(`/api/v1/projects/${project}/message-rule-function-previews/attributes-push-data`,options)}:{purpose:'JSON' as const,value:await api<Schema<'MessageRuleGatewayPropertiesFunctionPreviewResponse'>|Schema<'MessageRuleEventFunctionPreviewResponse'>>(`/api/v1/projects/${project}/message-rule-function-previews/${nodeType==='report-gateway-properties-function'?'gateway-properties':'event-target'}`,options)}
  if(!current())return
  const result=reply.value
  if(!['VALIDATION','EXECUTION'].includes(result.phase??'')||!['SUCCESS','FAILURE','TIMEOUT','RESOURCE_EXHAUSTED','REJECTED'].includes(result.status??''))throw new Error('云函数测试结果不完整')
  if(result.status!=='SUCCESS'){failure.value=eventTarget.value?'测试调用失败 '+(result.errorCode??result.status):(result.phase==='VALIDATION'?'云函数解析失败':'云函数执行失败')+'：'+(result.errorCode??result.status);return}
  if(result.phase!=='EXECUTION'||typeof result.outputJson!=='string'||new TextEncoder().encode(result.outputJson).length>65536)throw new Error('云函数测试输出不完整')
  if(reply.purpose==='DATA'){
   const data=reply.value,bytes=new TextEncoder().encode(JSON.stringify({outputJson:data.outputJson,format:data.format??null,payloadBase64:data.payloadBase64??null,payloadBytes:data.payloadBytes})),decoded=decodeDataDownlinkPreview(readRawRuleJson(bytes))
   noDownlink.value=decoded.format===null;outputFormat.value=decoded.format??'';output.value=downlinkPreviewContent(decoded)
  }else output.value=writePreprocessJson(parsePreprocessJson(result.outputJson),true)
 }catch(cause){if(current()){
  output.value='';noDownlink.value=false;outputFormat.value='';failure.value=errorMessage(cause)
  if(cause instanceof ApiError&&[401,403,404].includes(cause.status))denyPreview(cause)
 }}finally{if(alive&&turn===generation)running.value=false}
}
</script>
<template>
 <section class="gateway-function-preview">
  <el-button text type="primary" :disabled="disabled||!allowed" :aria-expanded="expanded" @click="expanded=!expanded">测试云函数 <ReferenceIcon :glyph="expanded?'󰅃':'󰅀'"/></el-button>
  <div v-if="expanded&&allowed" class="gateway-preview-body">
   <RuleEventPreviewDevicePicker v-if="eventTarget&&deviceSource" :project-id="projectId" :device-source="deviceSource" :model-value="sampleDeviceId" :disabled="disabled||running" @update:model-value="selectSample" @busy="candidateLoading=$event" @denied="denyPreview"/>
   <div v-if="eventTarget" class="event-preview-columns"><div><label>模拟{{inputLabel}}</label><JsonCodeEditor v-model="input" :ariaLabel="inputLabel+'样例'" :height="350" :disabled="disabled||running"/></div><div><label>{{outputLabel}}</label><JsonCodeEditor :model-value="output" :ariaLabel="outputLabel" :height="350" readonly/></div></div>
   <template v-else><label>{{inputLabel}}</label><JsonCodeEditor v-model="input" :ariaLabel="inputLabel+'样例'" :height="160" :disabled="disabled||running"/></template>
   <el-button :type="eventTarget?undefined:'primary'" :size="eventTarget?undefined:'small'" :loading="running" :disabled="disabled||running||candidateLoading" @click="run">{{eventTarget||nodeType==='current-device-data-function'||reported||preprocess?'测试':'运行'}}</el-button>
   <el-alert v-if="failure" :title="failure" type="error" :show-icon="eventTarget" :closable="false"/>
   <el-alert v-if="(eventTarget||nodeType==='current-device-data-function'||reported||preprocess)&&(output||noDownlink)" title="测试调用成功" type="success" :show-icon="eventTarget" :closable="false"/><template v-if="!eventTarget&&(output||noDownlink)"><label>{{outputLabel}}<span v-if="outputFormat"> · {{outputFormat}}</span></label><p v-if="noDownlink" role="status">函数返回null，不生成下行数据。</p><JsonCodeEditor v-else :model-value="output" :ariaLabel="outputLabel" :height="160" readonly/></template>
  </div>
 </section>
</template>
<style scoped>
.gateway-function-preview{margin:5px 0 20px;font-size:14px}.gateway-function-preview>.el-button{padding:0;font-size:14px}.gateway-function-preview .reference-icon{margin-left:5px;font-size:14px}.gateway-preview-body{margin-top:20px}.gateway-preview-body>label{display:block;margin:15px 0 8px;color:#606266;font-size:14px}.gateway-preview-body>.el-button{margin:12px 0}.gateway-preview-body>.el-alert{margin:0 0 12px}
.event-preview-columns{display:flex;gap:24px}.event-preview-columns>div{flex:1;min-width:0}.event-preview-columns label{display:block;font-size:14px;font-weight:700;line-height:32px;color:#606266}
</style>
