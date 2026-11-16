<script setup lang="ts">
import { THINGSLINK_EXTRAS_VISIBLE } from '@/core/replica-scope'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { can, projectId } from '@/core/session'
import { useResource } from '@/core/use-resource'
import { ApiError } from '@/core/http'
import { timeRange } from './models'
import { formatTime } from '@/core/time'
import type { Schema } from '@/core/contracts'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import { ruleExecutions, ruleAttempts } from './api'
import RuleDebugLogPanel from './RuleDebugLogPanel.vue'
import { ruleDebugLogTransport } from './rule-debug-transport'
const props = defineProps<{ internal?: boolean }>()
const internal = Boolean(THINGSLINK_EXTRAS_VISIBLE) && props.internal === true
const route = useRoute(), allowed = computed(() => can('rule:read')), status = ref(''), cursors = ref<(string | undefined)[]>([undefined]), limit = ref(24)
const from = ref(''), to = ref('')
const selected = ref<Schema<'RuleExecutionSummaryResponse'>>()
const resource = useResource(signal => ruleExecutions(projectId.value, { ruleId: typeof route.query.ruleId === 'string' ? route.query.ruleId : undefined, status: status.value, ...timeRange(from.value, to.value), cursor: cursors.value.at(-1), limit: limit.value }, signal))
const attempts = useResource(signal => {
  const row = selected.value
  if (!row?.messageId || !row.ruleId || !row.ruleVersionId) throw new Error('执行标识不完整')
  return ruleAttempts(projectId.value, { messageId: row.messageId, ruleId: row.ruleId, ruleVersionId: row.ruleVersionId }, signal)
})
watch(resource.error, cause => { if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) { resource.data.value = undefined; selected.value = undefined; attempts.clear() } })
function close(value: boolean) { if (!value) { selected.value = undefined; attempts.clear() } }
watch(attempts.error, cause => { if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) attempts.data.value = undefined })
function reset() { cursors.value = [undefined]; selected.value = undefined; attempts.clear(); void resource.reload() }
function next() { const cursor = resource.data.value?.nextCursor; if (cursor) { cursors.value.push(cursor); void resource.reload() } }
function previous() { if (cursors.value.length > 1) { cursors.value.pop(); void resource.reload() } }
function open(row: Schema<'RuleExecutionSummaryResponse'>) { selected.value = row; void attempts.reload() }
watch([projectId, allowed, () => route.query.ruleId], () => { resource.clear(); attempts.clear(); selected.value = undefined; cursors.value = [undefined]; if (internal && projectId.value && allowed.value) void resource.reload() }, { immediate: true })
</script>
<template><main v-if="!internal" class="tl-page"><RuleDebugLogPanel :transport="ruleDebugLogTransport" /></main><main v-else class="tl-page">
  <PageHeader :title="internal ? '规则执行记录' : '规则日志'"><el-button :disabled="!allowed" @click="reset">刷新</el-button></PageHeader>
  <div v-if="internal && allowed" class="tl-toolbar"><el-input v-model="status" placeholder="状态" clearable style="max-width:240px" @keyup.enter="reset" /><el-input v-model="from" placeholder="开始时间（含时区）" aria-label="开始时间（RFC3339）" clearable style="max-width:260px" /><el-input v-model="to" placeholder="结束时间（含时区）" aria-label="结束时间（RFC3339）" clearable style="max-width:260px" /><el-button @click="reset">查询</el-button></div>
  <AsyncState :forbidden="!allowed" :loading="resource.loading.value" :error="resource.error.value" :empty="!resource.data.value?.items?.length" @retry="resource.reload">
    <el-table :data="resource.data.value?.items || []"><el-table-column label="规则" prop="ruleName" /><el-table-column label="状态" prop="status" /><el-table-column v-if="internal" label="结果码" prop="resultCode" /><el-table-column v-if="internal" label="尝试次数" prop="attemptCount" /><el-table-column label="最后执行"><template #default="{ row }">{{ formatTime(row.lastAttemptAt) }}</template></el-table-column><el-table-column v-if="internal" label="操作"><template #default="{ row }"><el-button link type="primary" @click="open(row)">尝试明细</el-button></template></el-table-column></el-table>
    <CursorPager :page="cursors.length" :has-next="!!resource.data.value?.nextCursor" :limit="limit" :loading="resource.loading.value" @next="next" @previous="previous" @update:limit="value => { limit = value; reset() }" />
  </AsyncState>
  <el-dialog v-if="internal" :model-value="!!selected" title="执行尝试" width="760px" @update:model-value="close">
    <AsyncState :loading="attempts.loading.value" :error="attempts.error.value" :empty="!attempts.data.value?.length" @retry="attempts.reload"><el-table :data="attempts.data.value || []"><el-table-column prop="attempt" label="尝试" /><el-table-column prop="status" label="状态" /><el-table-column prop="resultCode" label="结果码" /><el-table-column prop="durationMillis" label="耗时(ms)" /><el-table-column label="完成时间"><template #default="{ row }">{{ formatTime(row.completedAt) }}</template></el-table-column></el-table></AsyncState>
  </el-dialog>
</main></template>
