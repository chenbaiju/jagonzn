<script setup lang="ts">
import {showOperationFeedback} from '@/ui/operation-feedback'
import {computed,onScopeDispose,ref,watch} from 'vue'
import {ElMessage} from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import {can,currentProject,projectId,session} from '@/core/session'
import {ApiError,IdentityChanged,errorMessage,onIdentityChange} from '@/core/http'
import {formatTime} from '@/core/time'
import HistoryRemovalDateTimeInput from './HistoryRemovalDateTimeInput.vue'
import {useDeviceGuard} from './use-device-guard'
import {clearPendingHistory,decodeHistoryRemoval,pendingHistoryKey,pendingHistoryOperation,prepareHistoryRemoval,readHistoryRemoval,savePendingHistory,submitHistoryRemoval,type HistoryRemovalIdentity,type HistoryRemovalIntent,type HistoryRemovalMode,type HistoryRemovalReceipt} from './property-history-removal-api'
const props=defineProps<{deviceId:string}>(),emit=defineEmits<{changed:[];unavailable:[unknown]}>()
const open=ref(false),confirm=ref(false),mode=ref<HistoryRemovalMode>('ALL'),from=ref<string>(),to=ref<string>(),error=ref(''),busy=ref(false),denied=ref(false)
const outcome=ref<'idle'|'sending'|'unknown'|'known'>('idle'),receipt=ref<HistoryRemovalReceipt>(),operation=ref<HistoryRemovalIdentity>()
const active=computed(()=>currentProject.value?.status==='ACTIVE'),manager=computed(()=>can('device:delete')&&!denied.value),capture=useDeviceGuard(()=>props.deviceId)
const terminal=computed(()=>receipt.value?.state==='COMPLETED'||receipt.value?.state==='FAILED')
let generation=0,intent:HistoryRemovalIntent|undefined,storageKey:string|undefined,controller:AbortController|undefined
function clear(){generation++;controller?.abort();controller=undefined;open.value=false;confirm.value=false;busy.value=false;outcome.value='idle';receipt.value=undefined;operation.value=undefined;intent=undefined;error.value='';mode.value='ALL';from.value=undefined;to.value=undefined}
function scopeChanged(){clear();denied.value=false;storageKey=pendingHistoryKey(session.user?.accountId,projectId.value,props.deviceId);const id=manager.value?pendingHistoryOperation(storageKey):undefined;if(id){operation.value={project:projectId.value,device:props.deviceId,operationId:id};outcome.value='unknown'}}
const dispose=onIdentityChange(()=>{clearPendingHistory(storageKey);scopeChanged()})
watch([()=>projectId.value,()=>props.deviceId,()=>session.user?.accountId,()=>can('device:delete')],scopeChanged,{immediate:true})
onScopeDispose(()=>{clear();dispose()})
function start(){if(!manager.value||busy.value||!active.value&&!operation.value)return;error.value='';open.value=true}
function close(){if(busy.value)return;confirm.value=false;open.value=false;if(outcome.value==='idle')intent=undefined}
function preview(){
 if(!manager.value||!active.value||busy.value||outcome.value!=='idle')return
 try{intent=prepareHistoryRemoval(projectId.value,props.deviceId,mode.value,from.value,to.value);error.value='';confirm.value=true}catch(cause){error.value=errorMessage(cause)}
}
function unavailable(cause:unknown){clearPendingHistory(storageKey);clear();denied.value=true;emit('unavailable',cause);ElMessage.error('设备或操作权限已失效，请刷新页面')}
function checkScope(check:()=>void,current:number){check();if(current!==generation||!manager.value)throw new IdentityChanged()}
function apply(bytes:Uint8Array,identity:HistoryRemovalIdentity){receipt.value=decodeHistoryRemoval(bytes,identity,intent?.operationId===identity.operationId?intent:undefined);outcome.value='known';if(terminal.value)emit('changed')}
async function submit(){
 if(!intent||!confirm.value||!manager.value||!active.value||outcome.value!=='idle'||busy.value)return
 const selected=intent,current=generation,check=capture();controller=new AbortController();confirm.value=false;error.value=''
 try{savePendingHistory(storageKey,selected.operationId)}catch(cause){error.value='无法保存待核对操作编号，尚未提交。'+errorMessage(cause);return}
 operation.value={project:selected.project,device:selected.device,operationId:selected.operationId};outcome.value='sending';busy.value=true
 try{const bytes=await submitHistoryRemoval(selected,controller.signal);checkScope(check,current);apply(bytes,operation.value);showOperationFeedback(receipt.value?.state==='COMPLETED'?'历史移除已完成':'已提交删除请求，系统正在处理')}
 catch(cause){if(current!==generation||cause instanceof IdentityChanged)return
  if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){unavailable(cause);return}
  const rejected=cause instanceof ApiError&&!cause.outcomeUnknown&&([400,413,422,429].includes(cause.status)||cause.status===409&&cause.code===10009)
  if(rejected){clearPendingHistory(storageKey);operation.value=undefined;intent=undefined;outcome.value='idle'}else outcome.value='unknown'
  error.value=errorMessage(cause)
 }finally{if(current===generation)busy.value=false}
}
async function refresh(){
 if(!operation.value||!manager.value||busy.value)return
 const identity={...operation.value},current=generation,check=capture();controller=new AbortController();busy.value=true;error.value=''
 try{const bytes=await readHistoryRemoval(identity,controller.signal);checkScope(check,current);apply(bytes,identity)}
 catch(cause){if(current!==generation||cause instanceof IdentityChanged)return
  if(cause instanceof ApiError&&[401,403].includes(cause.status)){unavailable(cause);return}
  error.value=cause instanceof ApiError&&cause.status===404?'暂未读到原操作，请稍后继续核对；不会重新提交删除。':errorMessage(cause)
 }finally{if(current===generation)busy.value=false}
}
function newOperation(){if(!terminal.value||busy.value)return;clearPendingHistory(storageKey);clear();open.value=true}
const stateLabels:Record<string,string>={QUEUED:'已提交，等待处理',RUNNING:'正在处理',COMPLETED:'历史移除已完成',FAILED:'处理已停止，可能已移除部分历史'}
const stateLabel=computed(()=>stateLabels[receipt.value?.state||'']||'')
const failureLabels:Record<string,string>={PROCESSING_BUDGET_EXHAUSTED:'处理已达到本次时限或规模上限',AUTHORIZATION_UNAVAILABLE:'权限或项目状态已改变',DEVICE_UNAVAILABLE:'设备已不可用',STORE_LAYOUT_UNSUPPORTED:'存储版本或结构暂不支持处理',MAINTENANCE_BUSY:'数据维护持续繁忙',SQL_BUDGET_EXCEEDED:'数据处理持续超过时限',WORKER_FAILURE:'后台处理未能完成'}
const modeLabels={ALL:'全部历史数据',FROM:'指定时间以后',TO:'指定时间以前',RANGE:'指定时间范围'}
</script>
<template>
 <el-config-provider :locale="zhCn">
 <el-button v-if="manager" type="danger" :disabled="busy||!active&&!operation" @click="start">删除属性历史数据</el-button>
 <el-dialog v-if="manager" :model-value="open" title="删除历史数据" width="600px" class="history-removal-dialog" :close-on-click-modal="false" :show-close="!busy" :close-on-press-escape="!busy" @close="close">
  <template v-if="outcome==='idle'">
   <el-form label-position="top"><el-form-item label="数据时间范围"><el-radio-group v-model="mode" :disabled="confirm"><el-radio value="ALL">全部历史数据</el-radio><el-radio value="FROM">指定时间以后</el-radio><el-radio value="TO">指定时间以前</el-radio><el-radio value="RANGE">指定时间范围</el-radio></el-radio-group></el-form-item>
    <el-form-item v-if="mode==='FROM'||mode==='RANGE'" label="起始时间（包含）"><HistoryRemovalDateTimeInput v-model="from" placeholder="选择起始时间" :disabled="confirm"/></el-form-item>
    <el-form-item v-if="mode==='TO'||mode==='RANGE'" label="结束时间（不包含）"><HistoryRemovalDateTimeInput v-model="to" placeholder="选择结束时间" :disabled="confirm"/></el-form-item>
   </el-form>
   <p class="tl-muted">时间输入、确认与任务显示均为东八区（UTC+08:00）。移除设备全部属性、全部历史模型及来源的数据，保留当前属性值、命令和审计。</p>
   <el-alert title="相交统计桶会整体失效：原始数据仍在时稍后重建；原始数据已过期的边界统计可能无法恢复。平台原件保留，仅移出历史显示。" type="warning" :closable="false"/>
  </template>
  <template v-else>
   <el-alert v-if="outcome==='unknown'||outcome==='sending'" :title="outcome==='sending'?'正在提交，请勿重复操作':'操作结果尚未确认，只会查询原操作，不会重新提交删除。'" type="warning" :closable="false"/>
   <el-alert v-if="receipt" :title="stateLabel" :type="receipt.state==='FAILED'?'warning':receipt.state==='COMPLETED'?'success':'info'" :closable="false"/>
   <p class="operation-id">操作编号：{{operation?.operationId}}</p>
   <template v-if="receipt"><p>{{modeLabels[receipt.mode]}}<template v-if="receipt.from"> · 从 {{formatTime(receipt.from)}}（含）</template><template v-if="receipt.to"> · 至 {{formatTime(receipt.to)}}（不含）</template></p><dl class="history-removal-counts"><div><dt>原始历史行</dt><dd>{{receipt.rawRows}}</dd></div><div><dt>失效统计行</dt><dd>{{receipt.aggregateRows}}</dd></div><div><dt>平台历史操作</dt><dd>{{receipt.platformOperations}}</dd></div></dl><p class="tl-muted">当前属性与后续新数据保留。统计可能暂缺；原始数据已过期的范围边界统计无法保证恢复。<template v-if="receipt.rebuildWindows">已请求重新计算可恢复的统计，稍后刷新查看。</template></p><p v-if="receipt.state==='FAILED'" class="tl-muted">{{failureLabels[receipt.failureCode||'']||'处理已停止'}}。已处理部分不会恢复；新操作需要重新确认。</p></template>
  </template>
  <el-alert v-if="error" :title="error" type="error" :closable="false" class="history-removal-error"/>
  <template #footer><el-button :disabled="busy" @click="close">{{outcome==='idle'?'取消':'关闭'}}</el-button><el-button v-if="outcome==='idle'" type="primary" :disabled="!active" @click="preview">提交</el-button><el-button v-else :loading="busy" @click="refresh">查询原操作</el-button><el-button v-if="terminal" type="danger" plain :disabled="busy||!active" @click="newOperation">发起新操作</el-button></template>
 </el-dialog>
 <el-dialog v-if="manager" :model-value="confirm" title="确认删除历史数据" width="420px" class="history-removal-confirm" :close-on-click-modal="false" @close="confirm=false"><p>确认移除{{intent?modeLabels[intent.mode]:''}}吗？此操作不能撤销。</p><p v-if="intent?.from||intent?.to" class="tl-muted">以下时间按东八区显示。</p><p v-if="intent?.from">起始时间：{{formatTime(intent.from)}}（包含）</p><p v-if="intent?.to">结束时间：{{formatTime(intent.to)}}（不包含）</p><p>只处理本次受理之前的历史。相交统计桶的范围外余量可能无法恢复。</p><template #footer><el-button @click="confirm=false">返回修改</el-button><el-button type="danger" @click="submit">确认删除</el-button></template></el-dialog>
 </el-config-provider>
</template>
<style scoped>
.operation-id{overflow-wrap:anywhere;font-size:12px;color:var(--tl-muted)}.history-removal-counts{display:flex;flex-wrap:wrap;gap:24px}.history-removal-counts div{min-width:110px}.history-removal-counts dt{font-size:12px;color:var(--tl-muted)}.history-removal-counts dd{margin:8px 0;font-size:20px;color:var(--tl-title)}.history-removal-error{margin-top:16px}:deep(.el-radio-group){display:flex;flex-wrap:wrap;gap:0 12px}:deep(.el-radio){margin-right:0}:deep(.el-date-editor){width:100%;max-width:280px}
</style>
<style>.history-removal-dialog,.history-removal-confirm{max-width:calc(100vw - 32px)}@media(max-width:480px){.history-removal-dialog .el-dialog__footer{display:flex;flex-wrap:wrap;gap:8px}.history-removal-dialog .el-dialog__footer .el-button{margin-left:0}}</style>
