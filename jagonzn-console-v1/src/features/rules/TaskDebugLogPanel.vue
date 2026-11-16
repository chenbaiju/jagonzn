<script setup lang="ts">
import { computed, toRef, watch } from 'vue'
import { ApiError } from '@/core/http'
import { can } from '@/core/session'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import { formatTime } from '@/core/time'
import TaskDebugLogView from './TaskDebugLogView.vue'
import { useTaskDebugLogState, type TaskDebugLogTransport } from './task-debug-state'
/** 暂离页签时只隐藏；父对象范围不变则保留尚未人工核对的写入锁。 */
const props = defineProps<{ jobId?: string; transport: TaskDebugLogTransport; inactive?: boolean }>()
const emit = defineEmits<{ denied: [cause: ApiError]; busy: [value: boolean]; locked: [value: boolean]; confirming: [value: boolean] }>()
const state = useTaskDebugLogState(toRef(props, 'jobId'), props.transport, computed(() => !props.inactive))
// 只传播当前对象的写入意图；父页保护自身写入口，不把日志版本当定义版本。
watch(state.busy, value => emit('busy', value), { immediate: true })
watch(state.locked, value => emit('locked', value), { immediate: true })
watch(() => !!state.intent.value, value => emit('confirming', value), { immediate: true })
const deviceRows = computed(() => (state.devices.data.value?.rows || []).map(row => ({ ...row, href: row.readable && can('device:read') ? `/devices/${row.key}` : undefined })))
watch(state.devices.error, cause => { if (cause instanceof ApiError && [401,403].includes(cause.status)) emit('denied', cause) })
const rows = computed(() => (state.page.data.value?.rows || []).map(row => ({ ...row, taskHref: can('task:read') ? row.taskHref : undefined })))
watch([state.page.error, state.control.error], causes => {
  const denied = causes.find(cause => cause instanceof ApiError && [401,403,404].includes(cause.status))
  if (denied instanceof ApiError) emit('denied', denied)
})
</script>
<template>
  <TaskDebugLogView v-show="!inactive" :rows="rows" :single-task="!!jobId" :forbidden="!state.allowed.value"
    :loading="state.page.loading.value" :error="state.page.error.value"
    :control-loading="state.control.loading.value" :control-error="state.control.error.value" :enabled="state.control.data.value?.checked"
    :busy="state.busy.value" :locked="state.locked.value" :write-error="state.writeError.value" :can-clear="state.ready.value" :can-manage="state.manage.value"
    :page="state.browsePage.value" :has-next="state.hasNext.value" :confirming="!!state.intent.value"
    @devices="state.openDevices" @refresh="state.reload()" @retry-control="state.retryControl" @toggle="state.toggle"
    @open-clear="state.openClear" @cancel-clear="state.cancelClear" @confirm-clear="state.confirmClear"
    @reread="state.reload()" @next="state.next" @previous="state.previous" />
  <el-dialog :model-value="!!state.deviceLog.value" title="任务运行日志" width="500px" @update:model-value="(value: boolean) => { if (!value) state.closeDevices() }">
    <AsyncState :loading="state.devices.loading.value" :error="state.devices.error.value" @retry="state.devices.reload()">
      <el-table :data="deviceRows" class="task-log-devices-table">
        <el-table-column label="设备名称" min-width="210"><template #default="{ row }"><router-link v-if="row.href" :to="row.href" @click="state.closeDevices()">{{ row.label }}</router-link><span v-else>{{ row.label }}</span><p v-if="row.otaLabel" class="tl-muted">{{ row.otaLabel }}<br v-if="row.otaVersion"/>{{ row.otaVersion }}</p></template></el-table-column>
        <el-table-column label="任务运行时间" min-width="190"><template #default>{{ formatTime(state.devices.data.value?.at) }}</template></el-table-column>
        <template #empty>暂无设备</template>
      </el-table>
      <CursorPager v-if="state.deviceCursors.value.length > 1 || state.devices.data.value?.continuation" :page="state.deviceCursors.value.length" :has-next="!!state.devices.data.value?.continuation" :limit="20" :show-sizes="false" :show-pages="false" :loading="state.devices.loading.value" @previous="state.previousDevices" @next="state.nextDevices" />
    </AsyncState>
    <template #footer><el-button type="primary" @click="state.closeDevices()">关闭</el-button></template>
  </el-dialog>
</template>
<style scoped>.task-log-devices-table a{color:var(--el-color-primary);text-decoration:none;overflow-wrap:anywhere}</style>
