<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { can, projectId } from '@/core/session'
import { useResource } from '@/core/use-resource'
import { formatTime } from '@/core/time'
import { ApiError, identityEpoch } from '@/core/http'
import AsyncState from '@/ui/AsyncState.vue'
import UsageChart from './UsageChart.vue'
import { getRuleUsageStatistics, getTaskUsageStatistics, taskExecutions, type UsageDays } from './api'
import { usagePoints, taskUsageSummary } from './statistics'
const props = defineProps<{ kind: 'rule' | 'task'; id: string }>()
const emit = defineEmits<{ denied: [cause: ApiError] }>()
const days = ref<UsageDays>(1), allowed = computed(() => can(props.kind === 'rule' ? 'rule:manage' : 'task:read'))
const windows: readonly { value: UsageDays; label: string }[] = [{ value: 1, label: '24小时' }, { value: 3, label: '3天' }, { value: 7, label: '7天' }, { value: 15, label: '15天' }, { value: 30, label: '30天' }]
const labels = computed(() => props.kind === 'rule' ? ['规则调用次数', '操作执行次数'] : ['任务运行次数'])
const resource = useResource(async signal => {
  const project = projectId.value, id = props.id, kind = props.kind, window = days.value, epoch = identityEpoch()
  let denied = false
  const current = () => !signal.aborted && identityEpoch() === epoch && projectId.value === project && props.id === id && props.kind === kind && days.value === window && allowed.value
  // 两个任务读取各自观察失权；先发生的普通失败不能吞掉另一读取稍后的拒绝。
  async function read<T>(pending: Promise<T>): Promise<T> {
    try { return await pending } catch (cause) {
      if (!denied && current() && cause instanceof ApiError && [401, 403, 404].includes(cause.status)) { denied = true; emit('denied', cause) }
      throw cause
    }
  }
  if (kind === 'rule') return { points: usagePoints(await read(getRuleUsageStatistics(project,id,window,signal)),kind,window), summary: undefined }
  const [statistics, executions] = await Promise.all([read(getTaskUsageStatistics(project,id,window,signal)), read(taskExecutions(project,id,signal))])
  return { points: usagePoints(statistics,kind,window), summary: taskUsageSummary(executions,id) }
})
watch([projectId, allowed, () => props.id, () => props.kind, days], () => { resource.clear(); if (projectId.value && props.id && allowed.value) void resource.reload() }, { immediate: true })
</script>
<template><AsyncState :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" @retry="resource.reload">
  <section v-if="kind === 'rule'" class="rule-usage">
    <header class="rule-usage-heading"><h2>使用统计</h2><div class="usage-controls rule-usage-controls"><el-radio-group v-model="days" size="small" aria-label="统计窗口"><el-radio-button v-for="window in windows" :key="window.value" :value="window.value">{{ window.label }}</el-radio-button></el-radio-group><el-button size="small" plain :disabled="!allowed || resource.loading.value" @click="resource.reload">刷新</el-button></div></header>
    <div class="rule-usage-chart"><div class="rule-usage-chart-row"><UsageChart :total-height="300" v-if="resource.data.value" :horizontal-insets="{left:34,right:32}" :points="resource.data.value.points" :labels="labels" /></div></div>
  </section>
  <div v-else class="task-usage">
    <section v-if="resource.data.value?.summary" class="task-usage-summary">
      <h2>总体统计</h2>
      <table class="task-usage-summary-table"><tbody><tr><th scope="row">最后运行时间</th><td>{{ formatTime(resource.data.value.summary.latest) }}</td></tr><tr><th scope="row">总运行次数</th><td>{{ resource.data.value.summary.total }}</td></tr></tbody></table>
    </section>
    <section class="task-usage-history">
      <header class="task-usage-heading"><h2>使用统计</h2><div class="usage-controls task-usage-controls"><el-radio-group v-model="days" size="small" aria-label="统计窗口"><el-radio-button v-for="window in windows" :key="window.value" :value="window.value">{{ window.label }}</el-radio-button></el-radio-group><el-button size="small" plain :icon="Refresh" :disabled="!allowed || resource.loading.value" @click="resource.reload">刷新</el-button></div></header>
      <div class="task-usage-chart"><UsageChart :total-height="300" v-if="resource.data.value" :points="resource.data.value.points" :labels="labels" /></div>
    </section>
  </div>
</AsyncState></template>
<style scoped>
.usage-controls { display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap; }
.rule-usage-heading { display:flex;align-items:center;justify-content:space-between;margin:10px 0 0; }
.rule-usage-heading h2 { margin:0;font-size:22px;line-height:32px;font-weight:400;color:#002822; }
.rule-usage-controls { gap:10px; }
.rule-usage-controls :deep(.el-radio-button__inner) { padding:9px 15px;font-size:12px;line-height:12px; }
.rule-usage-controls :deep(.el-button) { height:32px;padding:9px 15px;font-size:12px;line-height:12px;border-radius:3px; }
.rule-usage-chart { margin:0; }
.rule-usage-chart-row { width:100%;height:300px; }
.task-usage { margin-top:10px; }
.task-usage h2 { margin:0;font-size:22px;line-height:32px;font-weight:400;color:#002822; }
.task-usage-summary-table { width:100%;border-collapse:collapse;margin-top:20px;font-size:12px;line-height:20px; }
.task-usage-summary-table th,.task-usage-summary-table td { border-bottom:1px solid #ebeef5;padding:8px 10px;text-align:left;font-weight:400; }
.task-usage-summary-table th { width:160px;color:#909399; }
.task-usage-summary-table td { color:#606266;overflow-wrap:anywhere; }
.task-usage-history { margin-top:40px; }
.task-usage-heading { display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap; }
.task-usage-controls { gap:10px; }
.task-usage-controls :deep(.el-radio-button__inner) { padding:9px 15px;font-size:12px;line-height:12px; }
.task-usage-controls :deep(.el-button) { height:32px;padding:9px 15px;font-size:12px;line-height:12px;border-radius:3px; }
.task-usage-chart { width:100%;height:300px; }
.task-usage-chart :deep(.stat-chart-tooltip) { width:max-content;white-space:nowrap; }
</style>
