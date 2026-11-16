<script setup lang="ts">
import {copySucceeded,copyFailed} from '@/ui/copy-feedback'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { Download, Refresh, SuccessFilled, WarningFilled } from '@element-plus/icons-vue'
import { can, currentProject, projectId } from '../../core/session'
import { identityEpoch, onIdentityChange } from '../../core/http'
import { formatTime } from '../../core/time'
import AsyncState from '../../ui/AsyncState.vue'
import CursorPager from '../../ui/CursorPager.vue'
import AlarmTransitionLogCard from './AlarmTransitionLogCard.vue'
import AlarmLogMaintenanceView from './AlarmLogMaintenanceView.vue'
import ManagedAlarmLogMaintenanceEditor from './ManagedAlarmLogMaintenanceEditor.vue'
import AlarmLogNotifications from './AlarmLogNotifications.vue'
import ManagedAlarmLogExportDialog from './ManagedAlarmLogExportDialog.vue'
import { alarmLogNotificationsDisplay } from './alarm-log-notification-display'
import { useDeviceAlarmHistory } from './use-device-alarm-history'
import type { AlarmLog, AlarmLogQuery } from './alarm-transition-log-api'
import type { AlarmLogExportFile } from './alarm-log-export-file'

import AlarmEventEvaluationView from './AlarmEventEvaluationView.vue'

const props = withDefaults(defineProps<{ deviceId?: string; ruleId?: string; visible?: boolean;
  exportDownload?: (file: AlarmLogExportFile) => Promise<void> | void }>(), { visible: true })
const w = useDeviceAlarmHistory(() => props.deviceId, () => props.ruleId, () => props.visible)
const range = ref<[Date, Date] | null>(null), exporting = ref(false), editingLog = ref<AlarmLog>()
const maintenanceRevision = ref(0)
const canMaintain = computed(() => w.readable.value && can('alarm:maintain') && currentProject.value?.status === 'ACTIVE')
const states = [{ value: '', label: '所有状态' }, { value: 'alerting', label: '告警' },
  { value: 'alerting_1', label: '普通告警' }, { value: 'alerting_2', label: '重要告警' },
  { value: 'alerting_3', label: '紧急告警' }, { value: 'pending', label: '待定' }, { value: 'ok', label: '正常' }] as const
function label(row: AlarmLog) { return row.state === 'ok' ? '正常' : row.state === 'pending' ? '待定'
  : row.level === 1 ? '普通告警' : row.level === 2 ? '重要告警' : row.level === 3 ? '紧急告警' : '告警' }
function color(row: AlarmLog) { return row.state === 'ok' ? '#67c23a' : row.state === 'alerting' && row.level === 3 ? '#f56c6c' : '#e6a23c' }
function maintenance(row: AlarmLog) { return row.maintenanceAlarmReason !== null && row.maintenanceSolution !== null && row.maintenanceRemark !== null
  ? { alarmReason: row.maintenanceAlarmReason, solution: row.maintenanceSolution, remark: row.maintenanceRemark } : null }
async function setStatus(value: unknown) {
  if (states.some(state => state.value === value)) await w.setFilters({ ...w.filters.value, status: value as AlarmLogQuery['status'] })
}
async function setRange(value: unknown) {
  if (value === null) { range.value = null; await w.setFilters({ status: w.filters.value.status }); return }
  if (!Array.isArray(value) || value.length !== 2 || value.some(item => !(item instanceof Date) || !Number.isFinite(item.getTime()))) return
  range.value = value as [Date, Date]
  await w.setFilters({ ...w.filters.value, from: range.value[0].toISOString(), before: range.value[1].toISOString() })
}
async function copyNotificationError(code: string) {
  if (!w.readable.value || !props.visible || !w.detail.data.value) return
  const epoch = identityEpoch()
  try { await navigator.clipboard.writeText(code); if (epoch === identityEpoch() && w.readable.value && props.visible) copySucceeded('已复制错误信息') }
  catch { if (epoch === identityEpoch() && w.readable.value && props.visible) copyFailed() }
}
function clearSelection() { editingLog.value = undefined; exporting.value = false }
function maintenanceSaved() {
  const event = editingLog.value?.id
  if (!event) return
  // 详情保持在原事件；维护正文独立重新读取，不重播不可变事件或求值原件。
  if (w.selectedLogId.value === event) maintenanceRevision.value++
  void w.refreshMaintenance()
}
watch(() => [projectId.value, props.deviceId, props.ruleId, props.visible, w.readable.value], () => {
  clearSelection(); if (!w.readable.value) range.value = null
}, { flush: 'sync' })
watch(canMaintain, value => { if (!value) editingLog.value = undefined }, { flush: 'sync' })
watch(w.page, () => { editingLog.value = undefined }, { flush: 'sync' })
watch(w.filters, value => {
  editingLog.value = undefined
  range.value = value.from && value.before ? [new Date(value.from), new Date(value.before)] : null
}, { flush: 'sync' })
const stopIdentity = onIdentityChange(() => { range.value = null; clearSelection() })
onScopeDispose(stopIdentity)
</script>

<template>
 <section v-show="visible" class="device-alarm-history" :class="{'rule-only-history': deviceId === undefined}" :aria-label="deviceId === undefined ? '规则告警历史' : '设备告警历史'">
  <div class="device-history-toolbar" :class="{ 'rule-history': !!ruleId }">
   <div class="history-leading"><slot name="leading" /></div>
   <div v-if="w.readable.value" class="history-controls">
    <el-date-picker v-model="range" type="datetimerange" size="small" start-placeholder="开始时间" end-placeholder="结束时间" range-separator="至" aria-label="告警时间范围" popper-class="device-alarm-date-range" @change="setRange" />
    <el-select :empty-values="[null, undefined]" :model-value="w.filters.value.status || ''" size="small" aria-label="告警状态" class="history-status" @update:model-value="setStatus"><el-option v-for="state in states" :key="state.value" :value="state.value" :label="state.value === 'alerting' && ruleId ? '全部告警' : state.label" /></el-select>
    <el-button :icon="Refresh" size="small" plain :loading="w.list.loading.value" @click="w.refresh">刷新</el-button>
    <el-button v-if="!ruleId" :icon="Download" size="small" @click="exporting = true">导出</el-button>
   </div>
  </div>
  <AsyncState :forbidden="!w.readable.value" :loading="w.list.loading.value" :error="w.error.value" @retry="w.reload">
   <el-empty v-if="!w.list.data.value?.items.length" :image-size="100" :description="w.page.value === 1 ? '暂无告警历史消息' : '没有更多告警历史消息'" />
   <el-timeline v-else class="alarm-state-history"><el-timeline-item v-for="row in w.list.data.value.items" :key="row.id" :timestamp="formatTime(row.createdAt)" placement="top" :color="color(row)" size="large">
    <AlarmTransitionLogCard :row="row" :maintenance="maintenance(row)" :can-read-device="can('device:read')" :can-maintain="canMaintain" @open="w.openLog(row.id)" @maintain="editingLog = row" />
   </el-timeline-item></el-timeline>
  </AsyncState>
  <CursorPager v-if="w.readable.value && !w.error.value && (w.page.value > 1 || !!w.list.data.value?.items.length)" :show-sizes="false" :page="w.page.value" :limit="w.limit" :total="w.list.data.value?.total" :loading="w.list.loading.value" @update:page="w.selectPage" />
  <el-dialog :model-value="!!w.selectedLogId.value && visible && w.readable.value" title="查看告警详情" width="min(600px,94vw)" :append-to-body="deviceId === undefined" destroy-on-close @update:model-value="(shown: boolean) => { if (!shown) w.closeLog() }">
   <AsyncState :loading="w.detail.loading.value || w.evaluation.loading.value || (!!w.detail.data.value && !w.evaluation.data.value && !w.evaluation.error.value)" :error="w.detail.error.value ?? w.evaluation.error.value" @retry="w.openLog(w.selectedLogId.value)">
    <div v-if="w.detail.data.value" class="device-alarm-detail">
     <div class="detail-title">设备</div><div class="detail-content" title="当前可见设备名称">{{ w.detail.data.value.deviceName ?? '—' }}</div>
     <div class="detail-title">告警规则</div><div class="detail-content" :title="w.evaluation.data.value?.display ? '告警时规则名称' : '当前可见规则名称'">{{ w.evaluation.data.value?.display?.ruleName ?? w.detail.data.value.ruleName ?? '—' }}</div>
     <div class="detail-title">告警时间</div><div class="detail-content">{{ formatTime(w.detail.data.value.createdAt) }}</div>
     <div class="detail-title">告警状态</div><div class="detail-content detail-state" :style="{color:color(w.detail.data.value)}"><el-icon><SuccessFilled v-if="w.detail.data.value.state==='ok'"/><WarningFilled v-else/></el-icon><span>{{ label(w.detail.data.value) }}</span></div>
     <div class="detail-title">告警信息</div><div class="detail-content">
      <p v-if="w.detail.data.value.clearReason === 'MANUAL'" class="manual-clear-message">告警已人工解除</p>
      <AlarmEventEvaluationView v-if="w.evaluation.data.value?.display" :display="w.evaluation.data.value.display" />
      <template v-else-if="w.evaluation.data.value?.response.kind==='LEGACY_SCALAR'">
       <div v-if="w.detail.data.value.clearReason!=='MANUAL'">触发值：{{ w.detail.data.value.value ?? '—' }}</div>
       <div class="legacy-evaluation">此记录未保存完整属性快照</div>
      </template>
     </div>
    </div>
    <AlarmLogMaintenanceView v-if="w.detail.data.value" :key="w.detail.data.value.id + ':' + maintenanceRevision" :log-id="w.detail.data.value.id" detail :normal="w.detail.data.value.state==='ok'" :can-edit="canMaintain" @edit="editingLog=w.detail.data.value" />
    <AlarmLogNotifications v-if="w.detail.data.value" :items="alarmLogNotificationsDisplay(w.detail.data.value)" :truncated="w.detail.data.value.notificationLogsTruncated === true" @copy-error="copyNotificationError" />
   </AsyncState>
   <template #footer><el-button @click="w.closeLog">关闭</el-button></template>
  </el-dialog>
  <ManagedAlarmLogMaintenanceEditor v-if="editingLog && visible && canMaintain" :key="editingLog.id" :log-id="editingLog.id" :normal="editingLog.state === 'ok'" @close="editingLog = undefined" @saved="maintenanceSaved" />
  <ManagedAlarmLogExportDialog v-model="exporting" :filters="w.query.value" :download="exportDownload" />
 </section>
</template>

<style scoped>
.device-history-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.history-leading:empty{display:none}.history-controls{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-left:auto;max-width:100%}.history-controls :deep(.el-date-editor){width:360px;max-width:100%;flex-grow:0}.history-status{width:130px}.history-controls .el-button+.el-button{margin-left:0}.rule-history .history-status{order:-1}.alarm-state-history{padding-left:8px;margin-top:20px}.alarm-state-history :deep(.el-timeline-item){padding-bottom:5px}.detail-title{margin-top:20px;font-size:14px;font-weight:600;color:#303133}.detail-title:first-child{margin-top:0}.detail-content{margin-top:8px;line-height:22px;white-space:pre-wrap;overflow-wrap:anywhere}.manual-clear-message{margin:0 0 8px}.legacy-evaluation{font-size:12px;color:#909399}.detail-state{display:flex;align-items:center;gap:10px;font-weight:600;line-height:30px}.detail-state .el-icon{font-size:24px}@media(max-width:600px){.history-controls{width:100%;margin-left:0;justify-content:flex-start}.history-controls :deep(.el-date-editor){width:100%;min-width:0}.history-status{flex:1;min-width:130px}}
@media(max-width:600px){
 :global(.device-alarm-date-range .el-date-range-picker){width:calc(100vw - 32px);max-height:calc(50vh - 24px);display:flex;flex-direction:column;overflow:hidden}
 :global(.device-alarm-date-range .el-picker-panel__body-wrapper){min-height:0;overflow-y:auto}
 :global(.device-alarm-date-range .el-picker-panel__body){min-width:0;width:100%}
 :global(.device-alarm-date-range .el-date-range-picker__content){display:block;float:none;width:100%;box-sizing:border-box}
 :global(.device-alarm-date-range .el-date-range-picker__content.is-left){border-right:0;border-bottom:1px solid var(--el-border-color-lighter)}
 :global(.device-alarm-date-range .el-date-range-picker__header){position:sticky;top:0;z-index:1;background:var(--el-bg-color-overlay)}
 :global(.device-alarm-date-range .el-date-range-picker__time-header){display:grid;grid-template-columns:1fr;gap:8px}
 :global(.device-alarm-date-range .el-date-range-picker__time-header>.el-date-range-picker__editors-wrap){width:100%;display:flex;gap:6px}
 :global(.device-alarm-date-range .el-date-range-picker__time-header>span:not(.el-date-range-picker__editors-wrap)){display:none}
 :global(.device-alarm-date-range .el-date-range-picker__time-picker-wrap){display:block;min-width:0;flex:1;padding:0}
 :global(.device-alarm-date-range .el-picker-panel__footer){flex-shrink:0}
}
</style>

<style scoped>
.rule-only-history .history-controls { justify-content: flex-start; width: 100%; margin-left: 0; }
.rule-only-history .history-controls > .el-button { margin-left: auto; }
.rule-only-history .history-status :deep(.el-select__wrapper) { min-height: 33px; padding-inline: 15px 10px; }
.rule-only-history :deep(.el-empty) { padding: 61px 0 50px; }
</style>
