<script setup lang="ts">
import { computed } from 'vue'
import { Refresh, VideoPlay } from '@element-plus/icons-vue'
import AsyncState from '@/ui/AsyncState.vue'
import { formatTime } from '@/core/time'
import CursorPager from '@/ui/CursorPager.vue'
/** 受权展示投影；不定义网络DTO，不从命令受理时间猜最后运行。 */
export type TaskRelatedDeviceDisplayRow = { key: string; label: string; href?: string; scheduled: boolean; lastRunAt?: string | null;timerStatus?:'PENDING'|'SCHEDULED'|'DISABLED'|'UNAVAILABLE';nextRunAt?:string|null }
const props = withDefaults(defineProps<{
  rows: readonly TaskRelatedDeviceDisplayRow[]
  selectedKeys?: readonly string[]
  canRun?: boolean
  canManage?: boolean
  forbidden?: boolean
  loading?: boolean
  error?: unknown
  busy?: boolean
  locked?: boolean
  writeError?: string
  page?: number
  hasNext?: boolean
}>(), { selectedKeys: () => [], page: 1 })
const emit = defineEmits<{
  selection: [keys: string[]]
  run: [keys: string[]]
  changeSchedule: [key: string, allowed: boolean]
  refresh: []
  reread: []
  next: []
  previous: []
}>()
const unavailable = computed(() => props.forbidden || props.loading || props.busy || props.locked || !!props.error)
const selected = computed(() => new Set(props.selectedKeys))
const checked = computed(() => props.rows.length > 0 && props.rows.every(row => selected.value.has(row.key)))
const partial = computed(() => !checked.value && props.rows.some(row => selected.value.has(row.key)))
function selectOne(key: string, value: boolean) {
  if (!props.canRun || unavailable.value) return
  const keys = new Set(props.selectedKeys)
  if (value) keys.add(key)
  else keys.delete(key)
  emit('selection', [...keys])
}
function selectPage(value: boolean) {
  if (!props.canRun || unavailable.value) return
  const keys = new Set(props.selectedKeys)
  for (const row of props.rows) { if (value) keys.add(row.key); else keys.delete(row.key) }
  emit('selection', [...keys])
}
</script>
<template>
  <section class="task-related-devices">
    <h3>相关设备</h3>
    <p class="task-related-help">如果任务对应多个相关设备，可以单独对其中指定的设备运行任务。当禁用指定的设备后，该设备将不会执行定时任务。</p>
    <el-alert v-if="writeError" :title="writeError" type="error" :closable="false"><el-button v-if="locked" :disabled="busy" @click="$emit('reread')">重新读取核对</el-button></el-alert>
    <div class="task-related-toolbar">
      <el-button type="primary" size="small" :icon="VideoPlay" :disabled="!canRun || unavailable || !selectedKeys.length" @click="$emit('run', [...selectedKeys])">运行选中设备（{{ selectedKeys.length }}）</el-button>
      <el-button size="small" :icon="Refresh" :disabled="forbidden || loading || busy" @click="$emit('refresh')">刷新</el-button>
    </div>
    <AsyncState :forbidden="forbidden" :loading="loading" :error="error" @retry="$emit('refresh')">
      <el-table :data="rows" class="task-related-table">
        <el-table-column width="44">
          <template #header><el-checkbox :model-value="checked" :indeterminate="partial" aria-label="选择当前页全部设备" :disabled="!canRun || unavailable || !rows.length" @change="(value: string | number | boolean) => selectPage(value === true)" /></template>
          <template #default="{ row }"><el-checkbox :model-value="selected.has(row.key)" :aria-label="`选择 ${row.label}`" :disabled="!canRun || unavailable" @change="(value: string | number | boolean) => selectOne(row.key, value === true)" /></template>
        </el-table-column>
        <el-table-column label="设备名称" min-width="240"><template #default="{ row }"><router-link v-if="row.href" :to="row.href">{{ row.label }}</router-link><span v-else>{{ row.label }}</span></template></el-table-column>
        <el-table-column label="任务最后运行时间" min-width="220"><template #default="{ row }"><span v-if="row.lastRunAt">{{ formatTime(row.lastRunAt) }}</span><span v-else aria-label="最后运行时间未知" /></template></el-table-column>
        <el-table-column label="手动执行任务" width="180" align="center"><template #default="{ row }"><el-button link type="primary" :icon="VideoPlay" :aria-label="`运行 ${row.label}`" :disabled="!canRun || unavailable" @click="$emit('run', [row.key])" /></template></el-table-column>
        <el-table-column label="允许定时运行" width="180" align="center"><template #default="{ row }"><el-switch :model-value="row.scheduled" :aria-label="`允许 ${row.label} 定时运行`" :disabled="!canManage || unavailable" @change="(value: string | number | boolean) => $emit('changeSchedule', row.key, value === true)" /></template></el-table-column>
        <template #empty>暂无数据</template>
      </el-table>
      <CursorPager v-if="page > 1 || hasNext" :page="page" :has-next="hasNext" :limit="24" :show-sizes="false" :show-pages="false" :loading="busy" @next="$emit('next')" @previous="$emit('previous')" />
    </AsyncState>
  </section>
</template>
<style scoped>
.task-related-devices h3{margin:0;font-size:18px;font-weight:400;line-height:1.5;color:var(--tl-title)}
.task-related-help{margin:12px 0 10px;color:var(--tl-muted);font-size:12px;line-height:1.6}
.task-related-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.task-related-table a{color:var(--el-color-primary);text-decoration:none;overflow-wrap:anywhere}
.task-related-devices>.el-alert{margin:12px 0}
</style>
