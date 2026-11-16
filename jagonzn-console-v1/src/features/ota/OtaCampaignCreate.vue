<script setup lang="ts">
import {computed,onScopeDispose,reactive,ref,shallowRef,watch} from 'vue'
import {projectId,session,currentProject,can} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange} from '@/core/http'
import {defaultCampaignPolicy,toNotBeforeUtc} from '../../../../../things-link-console/src/features/ota/campaign-model'
import {otaCampaignTransport,prepareOtaCampaign,campaignCreateMatches,type OtaCampaignTransport,type OtaCampaignCreateIntent,type OtaCampaign,type OtaCampaignSummary} from './ota-campaign-api'
import type {OtaFirmware} from './ota-read-api'
const props=withDefaults(defineProps<{transport?:OtaCampaignTransport}>(),{transport:()=>otaCampaignTransport})
const emit=defineEmits<{locked:[boolean];saved:[string];close:[]}>()
const allowed=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&!!projectId.value&&can('ota:deploy')&&['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const permissionDenied=ref(false),writable=computed(()=>allowed.value&&!permissionDenied.value&&currentProject.value?.status==='ACTIVE')
const firmwareId=ref(''),deviceText=ref(''),batchSize=ref(1),notBefore=ref(toNotBeforeUtc(new Date())),policy=reactive(defaultCampaignPolicy())
const firmwares=shallowRef<readonly OtaFirmware[]>([]),cursor=ref<string|null>(null),loading=ref(false),busy=ref(false),unknown=ref(false),error=ref(''),notice=ref(''),attempted=ref(false)
const intent=shallowRef<OtaCampaignCreateIntent>(),ack=shallowRef<OtaCampaign>(),observed=shallowRef<readonly OtaCampaignSummary[]>([])
const locked=computed(()=>busy.value||unknown.value)
const policyFields=[['maxConcurrentDownloads','最大同时下载数',1,1000],['maxDownloadBytesPerSecond','每秒下载字节',1,1073741824],['downloadRetryLimit','额外下载重试',0,10],['retryBackoffSeconds','重试间隔秒',1,3600],['healthWindowSeconds','健康窗口秒',1,86400],['pauseMinEvaluated','暂停最小样本数',1,1000],['pauseFailureCount','暂停失败数',1,1000],['pauseFailureRateBps','暂停失败率（基点）',1,10000],['batchMinSuccessRateBps','批次成功率（基点）',1,10000]] as const
const stages=Object.keys(policy.stageTimeoutSeconds) as (keyof typeof policy.stageTimeoutSeconds)[]
let generation=0,alive=true,controller:AbortController|undefined,optionsController:AbortController|undefined
function snapshot(){return{generation,project:projectId.value,account:session.user?.accountId,epoch:identityEpoch()}}
function current(s:ReturnType<typeof snapshot>){return alive&&allowed.value&&s.generation===generation&&s.project===projectId.value&&s.account===session.user?.accountId&&s.epoch===identityEpoch()}
function reset(){permissionDenied.value=false;generation++;controller?.abort();optionsController?.abort();firmwareId.value='';deviceText.value='';batchSize.value=1;notBefore.value=toNotBeforeUtc(new Date());Object.assign(policy,defaultCampaignPolicy());firmwares.value=[];cursor.value=null;loading.value=false;busy.value=false;unknown.value=false;intent.value=undefined;ack.value=undefined;observed.value=[];error.value='';notice.value='';attempted.value=false}
async function loadMore(append=false){if(!allowed.value||loading.value||locked.value||append&&!cursor.value)return;const s=snapshot();optionsController?.abort();optionsController=new AbortController();const signal=optionsController.signal;loading.value=true;error.value='';try{const page=await props.transport.firmwares(s.project,append?cursor.value||undefined:undefined,signal);if(current(s)&&!signal.aborted){const values=append?[...firmwares.value,...page.items]:page.items;if(new Set(values.map(v=>v.id)).size!==values.length)throw new Error('固件游标返回重复身份');firmwares.value=values;cursor.value=page.hasMore?page.nextCursor:null}}catch(cause){if(current(s)&&!signal.aborted){if(cause instanceof ApiError&&[401,403].includes(cause.status)){reset();permissionDenied.value=true;error.value='活动管理权限已不可用'}else error.value=errorMessage(cause)}}finally{if(current(s))loading.value=false}}
async function submit(){
 if(!writable.value||locked.value||loading.value)return
 const s=snapshot();busy.value=true;error.value='';controller=new AbortController();const signal=controller.signal;let sent=false,accepted=false
 try{const selected=firmwares.value.find(value=>value.id===firmwareId.value);if(!selected||selected.status!=='READY')throw new Error('请选择已就绪的已发布固件，未就绪固件不能创建活动')
  const actual=await props.transport.firmware(s.project,selected.id,signal);if(!current(s)||signal.aborted||!writable.value)return
  const devices=deviceText.value.split(/[\s,]+/).filter(Boolean),prepared=await prepareOtaCampaign(s.project,actual,devices,batchSize.value,notBefore.value,policy)
  if(!current(s)||signal.aborted||!writable.value)return
  intent.value=prepared;unknown.value=true;sent=true
  const result=await props.transport.create(prepared,signal);accepted=true
  if(!current(s)||signal.aborted)return
  if(!campaignCreateMatches(result,prepared)||result.status!=='DRAFT'||result.stateVersion!=='0')throw new Error('草稿回执不符合原计划，请只读核对')
  ack.value=result
  const reread=await props.transport.read(s.project,result.id,signal);if(!current(s)||signal.aborted)return
  if(reread.id!==result.id||!campaignCreateMatches(reread,prepared))throw new Error('原活动回读与计划不同，请核对')
  unknown.value=false;intent.value=undefined;notice.value='活动草稿已创建；尚未排程或派发';emit('saved',result.id)
 }catch(cause){if(current(s)&&!signal.aborted&&!(cause instanceof IdentityChanged)){
  if(!sent||!accepted&&cause instanceof ApiError&&!cause.outcomeUnknown&&[400,403,404,413,422,429].includes(cause.status)){unknown.value=false;intent.value=undefined}
  if(cause instanceof ApiError&&[401,403].includes(cause.status)){reset();permissionDenied.value=true;error.value='活动管理权限已变化，原创建结果未确认'}else error.value=errorMessage(cause)
 }}finally{if(current(s))busy.value=false}
}
async function observe(){const original=intent.value;if(!original||!unknown.value||busy.value||!allowed.value)return;const s=snapshot();busy.value=true;attempted.value=true;error.value='';controller=new AbortController();const signal=controller.signal;try{if(ack.value){const read=await props.transport.read(original.project,ack.value.id,signal);if(!current(s)||signal.aborted)return;if(!campaignCreateMatches(read,original))throw new Error('原活动当前计划不符');unknown.value=false;intent.value=undefined;emit('saved',read.id)}else{const page=await props.transport.list(original.project,undefined,signal);if(current(s)&&!signal.aborted){observed.value=page.items;notice.value='这里只观察当前一页活动；相同固件或计划不能证明原请求键的结果。'}}}catch(cause){if(current(s)&&!signal.aborted){if(cause instanceof ApiError&&[401,403].includes(cause.status)){reset();permissionDenied.value=true;error.value='活动管理权限已不可用，原创建结果未确认'}else error.value=errorMessage(cause)}}finally{if(current(s))busy.value=false}}
function finish(){if(unknown.value&&attempted.value&&!busy.value){reset();notice.value='已结束核对；原创建结果仍未确认';emit('close')}}
watch([()=>projectId.value,()=>session.user?.accountId,()=>allowed.value],()=>{reset();if(allowed.value)void loadMore()},{immediate:true,flush:'sync'})
watch(locked,value=>emit('locked',value),{flush:'sync'})
const stop=onIdentityChange(reset)
onScopeDispose(()=>{alive=false;reset();stop();emit('locked',false)})
</script>
<template><section class="campaign-create"><p class="help">草稿只保存固定计划。排程会冻结目标并占位，启动才会准入设备作业。只支持已就绪发布固件。</p><el-alert v-if="error" :title="error" type="error" :closable="false"/><el-alert v-if="notice" :title="notice" type="info" :closable="false"/>
 <el-form label-position="top" :disabled="locked||!writable"><el-form-item label="发布固件"><el-select v-model="firmwareId" aria-label="活动发布固件" filterable :loading="loading" style="width:100%"><el-option v-for="row in firmwares" :key="row.id" :value="row.id" :label="`${row.firmwareVersion} · ${row.status}`" :disabled="row.status!=='READY'"/><template v-if="cursor" #footer><el-button :disabled="loading||locked" @click="loadMore(true)">加载更多固件</el-button></template></el-select><p v-if="!loading&&!firmwares.some(v=>v.status==='READY')" class="help">当前已读固件中没有已就绪版本，请先完成固件发布。</p></el-form-item>
 <el-form-item label="明确目标设备（每行一个设备ID）"><el-input v-model="deviceText" aria-label="活动目标设备ID" type="textarea" :rows="4" placeholder="最多1000个唯一设备ID"/><p class="help">草稿保留明确ID；排程时平台原子核对项目归属、设备类型与占用资格。</p></el-form-item><el-form-item label="每批设备数"><el-input-number v-model="batchSize" aria-label="活动每批设备数" :min="1" :max="1000" :precision="0"/></el-form-item><el-form-item label="最早启动时间（UTC）"><el-input v-model="notBefore" aria-label="活动最早启动时间" placeholder="2026-10-29T12:00:00Z"/><p class="help">秒级UTC，最多提前30天。过去时间表示排程后允许立即手动启动。</p></el-form-item>
 <el-collapse><el-collapse-item title="执行策略" name="policy"><el-form-item v-for="field in policyFields" :key="field[0]" :label="field[1]"><el-input-number v-model="policy[field[0]]" :aria-label="field[1]" :min="field[2]" :max="field[3]" :precision="0"/></el-form-item><el-form-item label="每批需人工放行"><el-switch v-model="policy.requireManualBatchApproval" aria-label="每批需人工放行"/></el-form-item><el-form-item v-for="stage in stages" :key="stage" :label="`${stage} 超时秒数`"><el-input-number v-model="policy.stageTimeoutSeconds[stage]" :aria-label="`${stage} 超时秒数`" :min="1" :max="86400" :precision="0"/></el-form-item></el-collapse-item></el-collapse>
 </el-form><el-alert v-if="unknown" type="warning" title="原创建结果尚未确认，已保留原键和计划，不会重新POST。" :closable="false"><el-button size="small" :disabled="busy" @click="observe">{{ack?'读取原活动':'观察当前活动目录'}}</el-button><el-button size="small" :disabled="busy||!attempted" @click="finish">已核对，结束本次操作</el-button><ul v-if="observed.length"><li v-for="row in observed" :key="row.id">{{row.id}} · {{row.status}} · 固件 {{row.firmwareId}}</li></ul></el-alert><footer><el-button :disabled="locked" @click="emit('close')">取消</el-button><el-button type="primary" :disabled="locked||!writable||loading||!firmwareId" :loading="busy" @click="submit">创建活动草稿</el-button></footer></section></template>
<style scoped>.help{font-size:12px;line-height:1.7;color:var(--tl-muted)}.campaign-create footer{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.campaign-create .el-alert{margin-bottom:14px}.campaign-create .el-form-item{margin-bottom:16px}</style>
