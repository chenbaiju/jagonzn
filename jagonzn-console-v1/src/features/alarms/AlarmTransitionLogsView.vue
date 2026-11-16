<script setup lang="ts">
import {copySucceeded,copyFailed} from '@/ui/copy-feedback'
import {alarmLogTriggerText} from './alarm-log-trigger-text'
import { ref,watch,onScopeDispose } from 'vue'
import { Refresh,InfoFilled,TopRight,Download } from '@element-plus/icons-vue'
import PageHeader from '../../ui/PageHeader.vue'
import AsyncState from '../../ui/AsyncState.vue'
import CursorPager from '../../ui/CursorPager.vue'
import { can,projectId } from '../../core/session'
import { formatTime } from '../../core/time'
import { useAlarmTransitionLogs } from './use-alarm-transition-logs'
import type { AlarmLog,AlarmLogQuery } from './alarm-transition-log-api'
import {identityEpoch,onIdentityChange} from '../../core/http'
import ManagedAlarmLogMaintenanceEditor from './ManagedAlarmLogMaintenanceEditor.vue'
import AlarmLogMaintenanceView from './AlarmLogMaintenanceView.vue'
import AlarmTransitionLogCard from './AlarmTransitionLogCard.vue'
import AlarmLogNotifications from './AlarmLogNotifications.vue'
import {alarmLogNotificationsDisplay} from './alarm-log-notification-display'
import ManagedAlarmLogExportDialog from './ManagedAlarmLogExportDialog.vue'
import type {AlarmLogExportFile} from './alarm-log-export-file'
const props=defineProps<{exportDownload?:(file:AlarmLogExportFile)=>Promise<void>|void;initialRuleId?:string}>()
const w=useAlarmTransitionLogs(),range=ref<[Date,Date]|null>(null)
watch([()=>props.initialRuleId,projectId],([ruleId])=>{
 if(!ruleId||!can('alarm:read')||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(ruleId))return
 if(w.filters.value.ruleId===ruleId)return
 void w.setFilters({...w.filters.value,ruleId})
},{immediate:true,flush:'post'})
const exporting=ref(false)
const editingLog=ref<AlarmLog>()
const states=[{value:'',label:'所有状态'},{value:'alerting',label:'告警'},{value:'alerting_1',label:'普通告警'},{value:'alerting_2',label:'重要告警'},{value:'alerting_3',label:'紧急告警'},{value:'pending',label:'待定'},{value:'ok',label:'正常'}] as const
watch([projectId,()=>can('alarm:read')],()=>{range.value=null;editingLog.value=undefined},{flush:'sync'})
watch(()=>can('alarm:maintain'),value=>{if(!value)editingLog.value=undefined},{flush:'sync'})
watch([w.page,w.filters],()=>{editingLog.value=undefined},{flush:'sync'})
const dispose=onIdentityChange(()=>{editingLog.value=undefined});onScopeDispose(dispose)
async function copyNotificationError(code:string){
 if(!can('alarm:read')||!w.selectedLogId.value||!w.detail.data.value)return
 const epoch=identityEpoch(),project=projectId.value,log=w.selectedLogId.value
 const current=()=>epoch===identityEpoch()&&project===projectId.value&&can('alarm:read')&&log===w.selectedLogId.value&&!!w.detail.data.value
 try{await navigator.clipboard.writeText(code);if(current())copySucceeded('已复制错误信息')}
 catch{if(current())copyFailed()}
}
function label(row:AlarmLog){return row.state==='ok'?'正常':row.state==='pending'?'待定':row.level===1?'普通告警':row.level===2?'重要告警':row.level===3?'紧急告警':'告警'}
function tone(row:AlarmLog){return row.state==='ok'?'ok':row.state==='alerting'&&row.level===3?'urgent':'warning'}
function color(row:AlarmLog){return tone(row)==='ok'?'#67c23a':tone(row)==='urgent'?'#f56c6c':'#e6a23c'}
function maintenance(row:AlarmLog){return row.maintenanceAlarmReason!==null&&row.maintenanceSolution!==null&&row.maintenanceRemark!==null?{alarmReason:row.maintenanceAlarmReason,solution:row.maintenanceSolution,remark:row.maintenanceRemark}:null}
async function setStatus(value:unknown){if(states.some(state=>state.value===value))await w.setFilters({...w.filters.value,status:value as AlarmLogQuery['status']})}
async function setRange(value:unknown){
 if(value===null){range.value=null;const {from:_from,before:_before,...filters}=w.filters.value;await w.setFilters(filters);return}
 if(!Array.isArray(value)||value.length!==2||value.some(item=>!(item instanceof Date)||!Number.isFinite(item.getTime())))return
 range.value=value as [Date,Date];await w.setFilters({...w.filters.value,from:range.value[0].toISOString(),before:range.value[1].toISOString()})
}
</script>
<template>
 <main class="tl-page transition-logs">
  <PageHeader title="告警历史"><el-button v-if="can('alarm:read')" size="small" :icon="Download" @click="exporting=true">导出</el-button><el-button size="small" :icon="Refresh" :loading="w.list.loading.value" @click="w.refresh">刷新</el-button></PageHeader>
  <div class="tl-learning-resource"><el-icon><InfoFilled /></el-icon><span>学习资源：<a href="https://www.thingscloud.xyz/docs/guide/alarm/alarm-message.html" target="_blank" rel="noopener noreferrer">什么是告警历史消息？<el-icon><TopRight /></el-icon></a></span></div>
  <div v-if="can('alarm:read')" class="history-filters"><el-select :empty-values="[null,undefined]" placeholder="所有状态" :model-value="w.filters.value.status||''" aria-label="告警状态" class="status-select" @update:model-value="setStatus"><el-option v-for="state in states" :key="state.value" :value="state.value" :label="state.label" /></el-select><el-date-picker :model-value="range" type="datetimerange" start-placeholder="开始时间" end-placeholder="结束时间" range-separator="至" aria-label="时间范围" @update:model-value="setRange" /></div>
  <AsyncState :forbidden="!can('alarm:read')" :loading="w.list.loading.value" :error="w.list.error.value" @retry="w.reload">
   <el-empty v-if="!w.list.data.value?.items.length" :image-size="100" :description="w.page.value===1?'暂无告警历史消息':'没有更多告警历史消息'" />
   <el-timeline v-else class="alarm-state-history"><el-timeline-item v-for="row in w.list.data.value?.items" :key="row.id" :timestamp="formatTime(row.createdAt)" placement="top" :color="color(row)" size="large">
    <AlarmTransitionLogCard :row="row" :maintenance="maintenance(row)" :can-read-device="can('device:read')" :can-maintain="can('alarm:maintain')" @open="w.openLog(row.id)" @maintain="editingLog=row" />
   </el-timeline-item></el-timeline>
  </AsyncState>
  <CursorPager v-if="can('alarm:read') && !w.list.error.value && (w.page.value > 1 || !!w.list.data.value?.items.length)" :show-sizes="false" :page="w.page.value" :limit="w.limit.value" :total="w.list.data.value?.total" :loading="w.list.loading.value" @update:page="w.selectPage" @update:limit="w.setLimit" />
  <el-dialog :model-value="!!w.selectedLogId.value" title="查看告警详情" width="min(600px,94vw)" @update:model-value="(value:boolean)=>{if(!value)w.closeLog()}"><AsyncState :loading="w.detail.loading.value" :error="w.detail.error.value" @retry="w.openLog(w.selectedLogId.value)"><dl v-if="w.detail.data.value" class="tl-key-values"><dt>状态</dt><dd>{{ label(w.detail.data.value) }}</dd><dt>发生时间</dt><dd>{{ formatTime(w.detail.data.value.createdAt) }}</dd><dt>规则名称</dt><dd>{{ w.detail.data.value.ruleName??'—' }}</dd><dt>设备名称</dt><dd>{{ w.detail.data.value.deviceName??'—' }}</dd><dt>触发值</dt><dd class="trigger-values">{{ w.detail.data.value.triggerValues===null?w.detail.data.value.value??'—':alarmLogTriggerText(w.detail.data.value,'—') }}</dd><dt>日志 ID</dt><dd>{{ w.detail.data.value.id }}</dd><dt>设备 ID</dt><dd>{{ w.detail.data.value.deviceId }}</dd></dl><AlarmLogMaintenanceView v-if="w.detail.data.value" :log-id="w.detail.data.value.id" detail :normal="w.detail.data.value.state==='ok'" /><AlarmLogNotifications v-if="w.detail.data.value" :items="alarmLogNotificationsDisplay(w.detail.data.value)" :truncated="w.detail.data.value.notificationLogsTruncated===true" @copy-error="copyNotificationError" /></AsyncState><template #footer><el-button @click="w.closeLog">关闭</el-button></template></el-dialog>
  <ManagedAlarmLogMaintenanceEditor v-if="editingLog&&can('alarm:maintain')" :log-id="editingLog.id" :normal="editingLog.state==='ok'" @close="editingLog=undefined" @saved="w.reload" />
  <ManagedAlarmLogExportDialog v-model="exporting" :filters="w.filters.value" :download="props.exportDownload" />
 </main>
</template>
<style scoped>
.history-filters{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap}.status-select{width:140px}.history-filters :deep(.el-date-editor){width:360px;flex-grow:0;max-width:100%}.alarm-state-history{padding-left:8px;margin-top:20px}.alarm-state-history :deep(.el-timeline-item){padding-bottom:5px}@media(max-width:600px){.history-filters :deep(.el-date-editor){min-width:0;width:100%}}
.trigger-values{white-space:pre-wrap;overflow-wrap:anywhere}
</style>
