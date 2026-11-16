<script setup lang="ts">
import { formatTime } from '@/core/time'
/** 纯展示投影；设备数量、类型和方式只接受适配器已确认的标签，不在组件中推断。 */
export type TaskDebugLogDisplayRow = { key: string; taskLabel: string; taskHref?: string; typeLabel: string; sourceLabel: string; at?: string; countLabel: string; deliveryLabel: string; deviceCount?: number }
defineEmits<{ devices: [key: string] }>()
defineProps<{ rows: readonly TaskDebugLogDisplayRow[]; singleTask?: boolean }>()
</script>
<template><el-table :data="rows" class="task-debug-log-table">
  <el-table-column v-if="!singleTask" label="任务名称" min-width="180"><template #default="{ row }"><router-link v-if="row.taskHref" :to="row.taskHref">{{ row.taskLabel }}</router-link><span v-else>{{ row.taskLabel }}</span></template></el-table-column>
  <el-table-column v-if="!singleTask" prop="typeLabel" label="任务类型" min-width="160" />
  <el-table-column prop="sourceLabel" label="来源" min-width="100" />
  <el-table-column :label="singleTask ? '运行时间' : '执行时间'" min-width="190"><template #default="{ row }"><span class="task-debug-log-time">{{ formatTime(row.at) }}</span></template></el-table-column>
  <el-table-column :label="singleTask ? '运行设备数' : '下发设备数'" min-width="140"><template #default="{ row }"><el-link v-if="row.deviceCount > 0" :underline="false" :aria-label="`查看 ${row.taskLabel} 的运行设备`" title="历史参与目标，不代表设备收到或执行成功" @click="$emit('devices', row.key)">{{ row.deviceCount }}</el-link><span v-else>{{ row.deviceCount === 0 ? '0' : row.countLabel }}</span></template></el-table-column>
  <el-table-column v-if="!singleTask" prop="deliveryLabel" label="下发方式" min-width="160" />
  <template #empty>暂无日志</template>
</el-table></template>
<style scoped>.task-debug-log-table a{color:var(--el-color-primary);text-decoration:none;overflow-wrap:anywhere}.task-debug-log-time{white-space:nowrap}</style>
