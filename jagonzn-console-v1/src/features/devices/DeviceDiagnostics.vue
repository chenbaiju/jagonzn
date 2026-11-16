<script setup lang="ts">
import {computed,onScopeDispose,ref,watch,toRaw} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {onIdentityChange} from '@/core/http'
import {formatTime} from '@/core/time'
import {RefreshRight,Delete,ArrowLeft,ArrowRight,View,CircleCheck,CircleClose,QuestionFilled} from '@element-plus/icons-vue'
import {useDeviceDiagnostics} from './use-device-diagnostics'
import DeviceDiagnosticDetails from './DeviceDiagnosticDetails.vue'
import DeviceMessageDownlink from './DeviceMessageDownlink.vue'
import {diagnosticMessageStatus} from './diagnostic-message-status'
import type {DeviceDiagnosticObservation,DiagnosticObservationOrigin} from './device-diagnostic-observations-api'
const props=withDefaults(defineProps<{deviceId:string;visible?:boolean}>(),{visible:true})
const emit=defineEmits<{busy:[value:boolean]}>()
const autoRefresh=ref(false)
const selected=ref<Readonly<{id:string;origin:DiagnosticObservationOrigin}>>()
const captureHelp='开启调试状态后，系统将监视并记录设备和云平台之间的所有上下行消息日志详情，包括错误提示信息。消息日志仅用于调试，最多保存 7 天。'
const manager=computed(()=>can('device:update')&&currentProject.value?.status==='ACTIVE'&&['OWNER','ADMIN'].includes(session.user?.projectRole||''))
const diagnostics=useDeviceDiagnostics({device:()=>props.deviceId,visible:()=>props.visible,readable:()=>can('device:read'),writable:()=>manager.value})
const {state,data,review,confirmation,loading,sending,reviewLoading,denied,writeDenied,error,page,readable,writable}=diagnostics
const messageNames:Readonly<Record<string,string>>={PROPERTY_REPORT:'属性上报',PROPERTY_SET:'属性下发',EVENT:'事件上报',EVENT_REPORT:'事件上报',COMMAND:'命令下发',COMMAND_INVOKE:'命令下发',COMMAND_SEND:'命令下发',COMMAND_REPLY:'命令回复'}
function hasDetails(row:DeviceDiagnosticObservation){return ['COMPLETE','REDACTED','LEGACY_SUMMARY'].includes(row.contentState)||row.errorCode!==null}
function messageNote(row:DeviceDiagnosticObservation){return row.origin==='LEGACY_SUMMARY'?(row.contentState==='LEGACY_SUMMARY'?'历史摘要':'摘要不可用'):['COMPLETE','REDACTED'].includes(row.contentState)?'完整消息':'内容不可用'}
function rowKey(row:DeviceDiagnosticObservation){return `${row.origin}:${row.id}`}
function showDetails(row:DeviceDiagnosticObservation){if(readable.value&&!loading.value&&state.value&&hasDetails(row)&&data.value?.items.some(item=>toRaw(item)===toRaw(row)))selected.value=Object.freeze({id:row.id,origin:row.origin})}
function denyDetails(){selected.value=undefined;diagnostics.reset();denied.value=true;autoRefresh.value=false}
watch(()=>state.value?.clearGeneration,()=>{selected.value=undefined})
watch([()=>props.deviceId,()=>projectId.value,()=>props.visible,()=>session.user?.accountId,()=>session.user?.projectRole,()=>can('device:read'),()=>can('device:update'),()=>currentProject.value?.status],()=>{selected.value=undefined;diagnostics.reset();autoRefresh.value=false;if(props.visible)void diagnostics.load()},{immediate:true,flush:'sync'})
const unsubscribe=onIdentityChange(()=>{selected.value=undefined;diagnostics.reset();autoRefresh.value=false})
const timer=setInterval(()=>{if(autoRefresh.value&&page.value===1&&!loading.value&&document.visibilityState==='visible')void diagnostics.load()},5000)
onScopeDispose(()=>{unsubscribe();clearInterval(timer)})
</script>
<template>
 <section class="device-diagnostics" aria-label="设备诊断">
  <p v-if="denied||!can('device:read')" role="alert">没有设备诊断的读取权限</p>
  <template v-else>
   <DeviceMessageDownlink :device-id="deviceId" @busy="emit('busy',$event)" @saved="diagnostics.refresh"/>
   <div class="diagnostic-toolbar">
    <h2>消息日志</h2>
    <div class="diagnostic-actions">
     <el-button size="small" :icon="RefreshRight" aria-label="刷新诊断记录" :loading="loading" :disabled="!readable||sending||!!review||!!confirmation" @click="diagnostics.refresh">刷新</el-button>
     <el-button size="small" :icon="RefreshRight" :type="autoRefresh?'primary':undefined" :aria-pressed="autoRefresh" :disabled="!readable||!!review||!!confirmation||sending||page!==1" @click="autoRefresh=!autoRefresh">自动刷新</el-button>
     <el-button size="small" type="danger" :icon="Delete" aria-label="清空记录" :disabled="!writable" @click="diagnostics.requestClear">清空</el-button>
    </div>
   </div>
   <p id="diagnostic-capture-help" class="diagnostic-tips">{{captureHelp}}</p>
   <div class="capture-control"><el-switch :model-value="state?.enabled??false" :disabled="!writable" :loading="sending" aria-label="记录设备诊断日志" aria-describedby="diagnostic-capture-help" style="--el-switch-on-color:#1e88e5;--el-switch-off-color:#cccccc" @change="diagnostics.toggle"/></div>
   <p v-if="writeDenied" class="tl-muted" role="status">诊断写入权限已被拒绝，可继续读取当前记录。</p>
   <p v-if="error" role="alert">{{error}}</p>
   <div v-if="review" class="diagnostic-review" role="alert">
    <p>{{review.stage==='unknown'?'操作结果尚未确认。':'操作未完成。'}}{{review.error}}</p>
    <el-button :loading="reviewLoading" :disabled="sending||reviewLoading||!readable" @click="diagnostics.readCurrent">读取当前状态</el-button>
    <template v-if="review.current"><span>当前记录日志：{{review.current.enabled?'开启':'关闭'}}，版本 {{review.current.version}}</span><el-button :disabled="reviewLoading||!readable" @click="diagnostics.continueWithCurrent">继续使用当前状态</el-button></template>
   </div>
   <el-table v-if="!error" v-loading="loading" class="diagnostic-table tl-device-detail-table" :data="data?.items??[]" :row-key="rowKey" empty-text="暂无日志" aria-label="设备诊断消息记录" @row-click="showDetails">
    <el-table-column label="消息类型" width="160"><template #default="{row}"><span class="diagnostic-type-cell"><el-icon class="diagnostic-message-status" :class="`is-${diagnosticMessageStatus(row).kind}`" role="img" :aria-label="`消息状态：${diagnosticMessageStatus(row).label}`" :title="diagnosticMessageStatus(row).label"><CircleCheck v-if="diagnosticMessageStatus(row).kind==='success'"/><CircleClose v-else-if="diagnosticMessageStatus(row).kind==='error'"/><QuestionFilled v-else/></el-icon><span>{{messageNames[row.messageType]??row.messageType??(row.direction==='UP'?'上行消息':'下行消息')}}</span></span></template></el-table-column>
    <el-table-column label="消息" min-width="320"><template #default="{row}"><div class="diagnostic-message-cell"><pre>{{row.preview??messageNote(row)}}</pre><el-button v-if="hasDetails(row)" class="diagnostic-message-trigger" text size="small" aria-label="查看消息详情" @click.stop="showDetails(row)"><el-icon><View/></el-icon>详情</el-button></div><span v-if="row.previewTruncated" class="tl-muted">{{row.origin==='LEGACY_SUMMARY'?'摘要已截断':'预览已截断'}}</span></template></el-table-column>
    <el-table-column label="时间" width="210"><template #default="{row}">{{formatTime(row.receivedAt)}}</template></el-table-column>
   </el-table>
   <nav v-if="!error" class="diagnostic-pager" aria-label="诊断记录分页"><el-button size="small" :icon="ArrowLeft" aria-label="上一页" :disabled="page<=1||loading||sending||!!review||!!confirmation" @click="diagnostics.previous"/><span class="diagnostic-page-number" aria-live="polite">第 {{page}} 页</span><el-button size="small" :icon="ArrowRight" aria-label="下一页" :disabled="!data?.hasMore||loading||sending||!!review||!!confirmation" @click="diagnostics.next"/></nav>
   <el-dialog :model-value="!!confirmation" title="清空诊断记录" width="min(440px,94vw)" destroy-on-close @close="diagnostics.cancelClear"><p>清空当前设备已采集的诊断记录。</p><template #footer><el-button @click="diagnostics.cancelClear">取消</el-button><el-button type="primary" :disabled="!manager||!readable" @click="diagnostics.confirmClear">确定清空</el-button></template></el-dialog>
   <DeviceDiagnosticDetails v-if="selected&&readable" :key="`${selected.origin}:${selected.id}`" :device-id="deviceId" :log-id="selected.id" :origin="selected.origin" :generation="state?.clearGeneration??0" @close="selected=undefined" @denied="denyDetails"/>
  </template>
 </section>
</template>
<style scoped>
.device-diagnostics{margin-top:10px}.diagnostic-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}.diagnostic-toolbar h2{font-size:22px;line-height:32px;font-weight:400;color:#002822;margin:0}.diagnostic-actions{display:flex;align-items:center;gap:8px;margin-left:auto}.diagnostic-actions .el-button+.el-button{margin-left:0}.diagnostic-tips{margin:8px 0 0;font-size:15px;line-height:22px;color:#888}.capture-control{margin-top:8px}.diagnostic-table{margin-top:16px;font-size:12px;color:#606266}.diagnostic-table :deep(td.el-table__cell){font-size:12px;color:#606266}.diagnostic-review{padding:14px;margin:16px 0;border:1px solid var(--el-border-color);border-radius:4px}.diagnostic-review p{margin-top:0}.diagnostic-review span{margin:0 12px}pre{white-space:pre-wrap;overflow-wrap:anywhere;margin:0;font-size:12px;line-height:1.6}.diagnostic-pager{display:flex;justify-content:center;align-items:center;gap:6px;margin-top:20px}.diagnostic-pager .el-button{width:28px;height:28px;padding:0;background:#f4f4f5;border:0;color:#606266}.diagnostic-pager .el-button.is-disabled{color:#c0c4cc}.diagnostic-page-number{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}@media(max-width:640px){.diagnostic-toolbar h2{width:100%}.diagnostic-actions{margin-left:0;flex-wrap:wrap}}
.diagnostic-message-cell{display:flex;align-items:center;gap:8px}.diagnostic-message-cell>pre{min-width:0}.diagnostic-message-trigger{padding:0;height:auto;flex:none;color:#999}.diagnostic-message-trigger .el-icon{margin-right:3px}.diagnostic-message-trigger:focus-visible{outline:2px solid var(--el-color-primary);outline-offset:4px}
.diagnostic-type-cell{display:flex;align-items:center;gap:8px}.diagnostic-message-status{flex:none;font-size:14px}.diagnostic-message-status.is-success{color:#48c78e}.diagnostic-message-status.is-error{color:#f14668}.diagnostic-message-status.is-unknown{color:#909399}.diagnostic-table :deep(th:first-child .cell){padding-left:40px}
</style>
