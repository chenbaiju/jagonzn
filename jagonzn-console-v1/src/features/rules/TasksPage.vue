<script setup lang="ts">
import { THINGSLINK_EXTRAS_VISIBLE } from '@/core/replica-scope'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { InfoFilled, Plus, Refresh, VideoPlay } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import { can, currentProject, projectId, session } from '@/core/session'
import { useResource } from '@/core/use-resource'
import { ApiError, IdentityChanged, errorMessage, identityEpoch, onIdentityChange } from '@/core/http'
import { formatTime } from '@/core/time'
import type { Task, TaskWrite, TaskActionType } from './models'
import { taskEditor, objectJson, cas, taskActionType, taskActionLabel } from './models'
import { listTasks, saveTask, saveTaskInformation, deleteTask, enableTask, disableTask, runTask, runTaskOnDevices, taskExecutions } from './api'
import TaskRunnerDialog from './TaskRunnerDialog.vue'
import { taskRunnerChoices } from './task-choices'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {showOperationFeedback} from '@/ui/operation-feedback'
import {isTaskFunction} from './task-property-function'
import {taskTargetsCreationSource} from './task-creation-source'
const router = useRouter(), route = useRoute()
const props = defineProps<{ internal?: boolean; groupId?: string }>()
const emit = defineEmits<{ locked: [value: boolean] }>()
const internal = Boolean(THINGSLINK_EXTRAS_VISIBLE) && props.internal === true
const groupScoped = computed(() => props.groupId !== undefined)
const allowed = computed(() => can('task:read')), manage = computed(() => can('task:manage')), runnable = computed(() => can('task:run'))
const runner = ref<Task>(), runKey = ref('')
const runnerSelections = new Map<string, string[]>()
function runnerSelectionKey(row:Task) { return 'thingslink.runner.selection.'+JSON.stringify([session.user?.accountId, projectId.value, row.id, row.version]) }
function savedRunnerSelection(row:Task):string[]|undefined {
  const key=runnerSelectionKey(row), cached=runnerSelections.get(key)
  if(cached)return cached
  if(!session.user?.accountId)return
  try { const value:unknown=JSON.parse(window.localStorage.getItem(key)||'null'); if(Array.isArray(value)&&value.length>0&&value.length<=10000&&value.every(id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))return value } catch { /* 本地偏好不可用时不影响运行。 */ }
}
function saveRunnerSelection(key:string,ids?:string[]) {
  if(ids)runnerSelections.set(key,[...ids]);else runnerSelections.delete(key)
  if(!session.user?.accountId)return
  try { if(ids)window.localStorage.setItem(key,JSON.stringify(ids));else window.localStorage.removeItem(key) } catch { /* 本地偏好不可用时保留本页选择。 */ }
}
const targetHints: Record<string, string> = { ALL_DEVICES: '已保存的所有设备目标', DEVICE_GROUP: '已保存设备组', DEVICE_TYPE: '已保存的设备类型目标', EXPLICIT_DEVICES: '已保存的指定设备', DEVICE_GROUPS: '已保存的多个设备组' }
const runnerTarget = computed(() => runner.value?.targetType === 'DEVICE_GROUP' && runner.value.targetGroupId ? `已保存设备组：${runner.value.targetGroupId}` : targetHints[runner.value?.targetType || ''] || '—')
const page = ref(1), limit = ref(24)
const filterEmptyValues = [null, undefined]
type TargetFilter = '' | 'devices' | 'device-types' | 'device-groups'
type StatusFilter = '' | 'ACTIVE' | 'PAUSED'
// 此值是原站目录URL筛选；真实已实现动作精确映射，边缘任务仍仅空筛选。
const taskTypeValues = ['attrs_push', 'attrs_update', 'cmd_send', 'data_set', 'edge'] as const
type TaskTypeFilter = '' | typeof taskTypeValues[number]
const taskTypeFilter = ref<TaskTypeFilter>(''), taskTypeRouteError = ref<Error>()
const filterActions: Partial<Record<Exclude<TaskTypeFilter, ''>, readonly TaskActionType[]>> = { attrs_push: ['PROPERTY_SET','PROPERTY_SET_FUNCTION'], attrs_update:['CLOUD_UPDATE','CLOUD_UPDATE_FUNCTION'], cmd_send: ['COMMAND','COMMAND_FUNCTION','OTA_UPGRADE'], data_set:['DATA_DOWNLINK','DATA_DOWNLINK_FUNCTION'] }
function readTaskTypeRoute() {
  if (internal || groupScoped.value) { taskTypeFilter.value = ''; taskTypeRouteError.value = undefined; return }
  const value = route.query.task_type
  if (value === undefined) { taskTypeFilter.value = ''; taskTypeRouteError.value = undefined }
  else if (typeof value === 'string' && taskTypeValues.includes(value as typeof taskTypeValues[number])) { taskTypeFilter.value = value as TaskTypeFilter; taskTypeRouteError.value = undefined }
  else { taskTypeFilter.value = ''; taskTypeRouteError.value = new Error('任务类型筛选无效，请清除筛选后重试。') }
  page.value = 1
}
function taskTypeChanged(value: unknown) {
  if (typeof value !== 'string' || value !== '' && !taskTypeValues.includes(value as typeof taskTypeValues[number])) { taskTypeRouteError.value = new Error('任务类型筛选无效，请清除筛选后重试。'); return }
  if (groupScoped.value) { taskTypeFilter.value = value as TaskTypeFilter; return }
  const query = { ...route.query }
  if (value === '') delete query.task_type
  else query.task_type = value
  void router.push({ query })
}
const targetFilter = ref<TargetFilter>(''), statusFilter = ref<StatusFilter>('')
const targetKinds: Record<Exclude<TargetFilter, ''>, readonly string[]> = { devices: ['EXPLICIT_DEVICES'], 'device-types': ['DEVICE_TYPE'], 'device-groups': ['DEVICE_GROUP', 'DEVICE_GROUPS'] }
const filter = ref(''), editor = ref(false), editingId = ref(''), draft = ref<TaskWrite>(), input = ref(''), selected = ref<Task>(), busy = ref(false), message = ref(''), uncertain = ref(false)
const backgroundRefresh = ref(false)
const switching = ref<{id:string;enabled:boolean}>()
let refreshOrder: string[] | undefined
watch([busy, uncertain], ([writing, needsReview]) => emit('locked', writing || needsReview), {flush:'sync'})
const resource = useResource(async signal => {
  const groupId = props.groupId, order = refreshOrder
  const values = await listTasks(projectId.value, signal)
  const scoped = groupId ? values.filter(row => taskTargetsCreationSource(row, {kind:'DEVICE_GROUP', id:groupId})) : values
  const result = scoped.map(row => ({ ...row, actionType: taskActionType(row) }))
  if (!order) return result
  const positions = new Map(order.map((id,index)=>[id,index]))
  return result.map((row,index)=>({row,index})).sort((a,b)=>(positions.get(a.row.id || '') ?? positions.size+a.index)-(positions.get(b.row.id || '') ?? positions.size+b.index)).map(item=>item.row)
})
const executions = useResource(signal => { if (!selected.value?.id) throw new Error('请选择任务'); return taskExecutions(projectId.value, selected.value.id, signal) })
const filtered = computed(() => resource.data.value?.filter(row => (!filter.value || row.name?.includes(filter.value)) && (!taskTypeFilter.value || !!filterActions[taskTypeFilter.value]?.includes(row.actionType)) && (!targetFilter.value || targetKinds[targetFilter.value]?.includes(row.targetType || '')) && (!statusFilter.value || row.status === statusFilter.value)) || [])
const formalTitle = computed(() => resource.data.value && (!resource.loading.value || backgroundRefresh.value) && !resource.error.value && !taskTypeRouteError.value ? `任务 (${filtered.value.length})` : '任务')
const emptyText = computed(() => targetFilter.value || statusFilter.value || taskTypeFilter.value || filter.value ? '没有匹配的任务' : '让设备批量或定时执行任务')
const groupOnboarding = computed(() => groupScoped.value && !taskTypeFilter.value && !statusFilter.value && !rows.value.length)
function targetChanged(value: unknown) { targetFilter.value = value === 'devices' || value === 'device-types' || value === 'device-groups' ? value : '' }
function statusChanged(value: unknown) { statusFilter.value = value === 'ACTIVE' || value === 'PAUSED' ? value : '' }
function knownStatus(row: Task) { return row.status === 'ACTIVE' || row.status === 'PAUSED' }
function switchValue(row:Task) { const pending=switching.value; return pending && pending.id===row.id ? pending.enabled : row.status==='ACTIVE' }
async function switchEnabled(row: Task) {
  if (busy.value || uncertain.value || !manage.value) return
  if (!knownStatus(row) || !row.id) { message.value = '任务状态无法识别，请重新读取'; return }
  const pending = {id:row.id,enabled:row.status !== 'ACTIVE'}
  switching.value = pending
  try { await write('task:manage', () => pending.enabled ? enableTask(projectId.value, pending.id) : disableTask(projectId.value, pending.id), false, undefined, true) }
  finally { if (switching.value?.id === pending.id) switching.value = undefined }
}
function statusLabel(value: string | undefined) { return value === 'ACTIVE' ? '启用' : value === 'PAUSED' ? '停用' : '—' }
const targetLabels: Record<string, string> = { EXPLICIT_DEVICES: '设备', DEVICE_TYPE: '设备类型', DEVICE_GROUP: '设备组', DEVICE_GROUPS: '设备组', ALL_DEVICES: '所有设备' }
const scheduleLabels: Record<string, string> = { MANUAL: '关闭定时', ONCE: '只运行一次', DAILY: '每日定时', INTERVAL: '间隔时间重复', SOLAR: '日出日落', CRON: 'CRON' }
function taskTargetLabel(row: Task) { return targetLabels[row.targetType || ''] || '—' }
function taskScheduleLabel(row: Task) { return scheduleLabels[row.scheduleType || ''] || '—' }
function taskContentLabel(row: Task) { return taskActionLabel(row) }
const taskActionFamily: Record<TaskActionType, string> = {
  COMMAND:'command', COMMAND_FUNCTION:'command', OTA_UPGRADE:'command',
  PROPERTY_SET:'property', PROPERTY_SET_FUNCTION:'property',
  CLOUD_UPDATE:'update', CLOUD_UPDATE_FUNCTION:'update',
  DATA_DOWNLINK:'data', DATA_DOWNLINK_FUNCTION:'data',
}
function taskActionGlyph(action:TaskActionType) {
  if (isTaskFunction(action)) return '󰡱'
  if (action === 'CLOUD_UPDATE' || action === 'OTA_UPGRADE') return '󱋖'
  return '󰭽'
}
function clearFilters() {
  filter.value = ''; targetFilter.value = ''; statusFilter.value = ''; taskTypeFilter.value = ''; taskTypeRouteError.value = undefined
  if (!internal && !groupScoped.value && route.query.task_type !== undefined) { const query = { ...route.query }; delete query.task_type; void router.replace({ query }) }
}
const rows = computed(() => filtered.value.slice((page.value - 1) * limit.value, page.value * limit.value))
watch([filter, targetFilter, statusFilter, taskTypeFilter, limit, projectId], () => { page.value = 1 })
watch(() => filtered.value.length, count => { page.value = Math.min(page.value, Math.max(1, Math.ceil(count / limit.value))) })
function changePage(value: number) { if (Number.isSafeInteger(value) && value >= 1 && value <= Math.max(1, Math.ceil(filtered.value.length / limit.value))) page.value = value }
function clear() { runner.value = undefined; runKey.value = ''; lifecycle++; refreshOrder = undefined; backgroundRefresh.value = false; switching.value = undefined; editor.value = false; editingId.value = ''; draft.value = undefined; input.value = ''; selected.value = undefined; executions.clear(); busy.value = false; message.value = ''; uncertain.value = false }
let active = true, lifecycle = 0
watch(() => groupScoped.value ? undefined : route.query.task_type, readTaskTypeRoute, { immediate: true })
watch(projectId, clearFilters)
const dispose = onIdentityChange(() => { clear(); clearFilters() }); onScopeDispose(() => { active = false; dispose(); emit('locked', false) })
watch(() => props.groupId, clearFilters)
watch([projectId, allowed, manage, runnable, () => props.groupId], () => { clear(); resource.clear(); if (!allowed.value) clearFilters(); if (allowed.value && projectId.value) void resource.reload() }, { immediate: true })
watch(resource.error, cause => { if (cause instanceof ApiError && [401,403,404].includes(cause.status)) { resource.data.value = undefined; const locked = uncertain.value; clear(); clearFilters(); uncertain.value = locked } })
function closeRunner(value: boolean) { if (!value && !busy.value) { runner.value = undefined; runKey.value = '' } }
function openRunner(row: Task) { if (!allowed.value || !runnable.value || busy.value || uncertain.value || editor.value || !row.id || resource.error.value) return; try { if(!internal)cas(row.version); runner.value = row; runKey.value = ''; message.value='' } catch(cause){ message.value=errorMessage(cause) } }
function submitRun(ids?:string[]) { const row = runner.value; if (!row?.id || !allowed.value || !runnable.value) return; if (!internal && row.status !== 'ACTIVE') { message.value = '任务停用后无法运行'; return }; if (runKey.value.length > 128) { message.value = '幂等键最多128字符'; return }; const key=runnerSelectionKey(row); void write('task:run', () => !internal && ids !== undefined ? runTaskOnDevices(projectId.value,row.id!,cas(row.version),ids) : runTask(projectId.value, row.id!, internal ? runKey.value || undefined : undefined, !internal), true,()=>saveRunnerSelection(key,ids)) }
const loadRunnerCandidates=(cursor:string|undefined,signal:AbortSignal)=>{const row=runner.value;if(!row?.id)throw new Error('请重新选择任务');return taskRunnerChoices(projectId.value,row.id,cas(row.version),cursor,signal)}
function runnerDenied(cause:ApiError){if(!runner.value)return;resource.clear();resource.error.value=cause}
function runnerConflict(cause:ApiError){if(!runner.value)return;uncertain.value=true;message.value=errorMessage(cause);runner.value=undefined}
function openCreate() {
  if (!manage.value || uncertain.value || busy.value) return
  if (props.groupId) {
    if (allowed.value) void router.push({path:'/tasks/jobs/create', query:{source:'device-group', deviceGroupId:props.groupId}})
    return
  }
  if (!internal) { if (allowed.value) void router.push('/tasks/jobs/create'); return }
  const timezone = currentProject.value?.timezone
  if (!timezone) { message.value = '项目时区不可用，请重新读取项目'; return }
  editingId.value = ''; draft.value = { name: '', description: '', scheduleType: 'ONCE', timezone, targetType: 'ALL_DEVICES', commandKey: '', input: {}, enabled: false }; input.value = '{}'; message.value = ''; editor.value = true
}
function edit(row: Task) { if (!manage.value || busy.value || uncertain.value || runner.value) return; try { draft.value = taskEditor(row); editingId.value = row.id || ''; if (!editingId.value) throw new Error('任务标识不完整'); input.value = JSON.stringify(row.input, null, 2); editor.value = true } catch (e) { message.value = errorMessage(e) } }
async function write(permission: string, action: () => Promise<unknown>, accepted = false, onAccepted?:()=>void, keepOrder = false) {
  if (!can(permission) || busy.value || uncertain.value) return
  const epoch = identityEpoch(), generation = lifecycle, project = projectId.value, current = () => active && generation === lifecycle && identityEpoch() === epoch && projectId.value === project && can(permission)
  busy.value = true; message.value = ''
  try {
    await action()
    if (!current()) return
    editor.value = false; draft.value = undefined; input.value = ''
    if (accepted) {
      onAccepted?.()
      runner.value = undefined; runKey.value = ''
      showOperationFeedback(internal ? '执行已受理，请在执行记录核对后续状态' : '执行已受理')
    } else {
      showOperationFeedback('操作已保存')
    }
    if (keepOrder) { refreshOrder = resource.data.value?.flatMap(row=>row.id?[row.id]:[]); backgroundRefresh.value = true }
    try { await resource.reload() } finally { if(current()){ refreshOrder = undefined; backgroundRefresh.value = false } }
  }
  catch (e) { if (current() && !(e instanceof IdentityChanged)) {
    message.value = errorMessage(e); uncertain.value = e instanceof ApiError && (e.outcomeUnknown || e.status === 409)
    if (e instanceof ApiError && [401,403,404].includes(e.status)) { resource.clear(); resource.error.value = e }
  } }
  finally { if (current()) busy.value = false }
}
function save() { if (!draft.value) return; try { const body = { ...draft.value, input: objectJson(input.value) }; void write('task:manage', () => internal ? saveTask(projectId.value, editingId.value, body) : saveTaskInformation(projectId.value, editingId.value, body)) } catch (e) { message.value = errorMessage(e) } }
function logs(row: Task) { selected.value = row; void executions.reload() }
function closeLogs(value: boolean) { if (!value) { selected.value = undefined; executions.clear() } }
async function reread() { const locked = uncertain.value; clear(); uncertain.value = locked; await resource.reload(); if (!resource.error.value && resource.data.value) uncertain.value = false }
function openTask(row:Task){
  if(!row.id || (groupScoped.value && (busy.value || uncertain.value)))return
  const path=`/tasks/jobs/${row.id}`
  void router.push(props.groupId?{path,query:{deviceGroupId:props.groupId}}:path)
}
</script>
<template><component :is="groupScoped?'section':'main'" :class="groupScoped?'group-task-directory':'tl-page'">
  <PageHeader v-if="!groupScoped" :class="{'task-header-switching':switching}" :title="internal ? '所有任务' : formalTitle"><el-button v-if="manage" :size="internal?undefined:'small'" :icon="internal?undefined:Plus" type="primary" :disabled="busy || uncertain" @click="openCreate">创建任务</el-button><el-button :size="internal?undefined:'small'" :disabled="!allowed || busy" @click="reread">刷新</el-button></PageHeader>
  <div class="task-directory-help tl-learning-resource" v-if="allowed && !internal && !groupScoped"><el-icon aria-hidden="true"><InfoFilled /></el-icon><span>学习资源：<a href="https://www.thingscloud.xyz/docs/guide/tasks/overview.html" target="_blank" rel="noopener noreferrer">什么是任务？</a></span></div>
  <div class="tl-toolbar task-directory-filters" :class="{'reference-task-filters':!internal}" v-if="allowed">
    <el-input v-if="internal" v-model="filter" aria-label="任务名称" placeholder="搜索任务" clearable class="task-directory-search" />
    <el-select v-if="!groupScoped" :model-value="targetFilter" :size="internal?undefined:'small'" :empty-values="internal?undefined:filterEmptyValues" aria-label="任务目标类型" placeholder="不限任务目标类型" :disabled="resource.loading.value && !backgroundRefresh" @update:model-value="targetChanged"><el-option label="不限任务目标类型" value="" /><el-option label="设备" value="devices" /><el-option label="设备类型" value="device-types" /><el-option label="设备组" value="device-groups" /></el-select>
    <el-select v-if="!internal" :model-value="taskTypeFilter" size="small" :empty-values="filterEmptyValues" aria-label="任务类型" placeholder="不限任务类型" :disabled="(resource.loading.value && !backgroundRefresh) || (groupScoped && (busy || uncertain))" @update:model-value="taskTypeChanged"><el-option label="不限任务类型" value="" /><el-option label="属性下发" value="attrs_push" /><el-option label="属性更新" value="attrs_update" /><el-option label="命令下发" value="cmd_send" /><el-option label="自定义数据下发" value="data_set" /><el-option label="边缘任务" value="edge" /></el-select>
    <el-select :model-value="statusFilter" :size="internal?undefined:'small'" :empty-values="internal?undefined:filterEmptyValues" aria-label="任务状态" placeholder="不限任务状态" :disabled="(resource.loading.value && !backgroundRefresh) || (groupScoped && (busy || uncertain))" @update:model-value="statusChanged"><el-option label="不限任务状态" value="" /><el-option :label="internal?'启用':'正常'" value="ACTIVE" /><el-option :label="internal?'停用':'已停用'" value="PAUSED" /></el-select>
    <div v-if="groupScoped" class="group-task-actions">
      <el-button size="small" :icon="Refresh" :disabled="busy" :loading="resource.loading.value" @click="reread">刷新</el-button>
      <el-button v-if="manage" size="small" type="primary" :icon="Plus" :disabled="busy || uncertain" @click="openCreate">创建任务</el-button>
    </div>
  </div>
  <el-alert v-if="message" :title="message" :type="uncertain ? 'warning' : 'info'" :closable="false"><el-button v-if="uncertain" @click="reread">重新读取核对</el-button></el-alert>
  <el-alert v-if="taskTypeRouteError && allowed" :title="taskTypeRouteError.message" type="error" :closable="false"><el-button @click="taskTypeChanged('')">清除任务类型筛选</el-button></el-alert>
  <AsyncState v-if="!taskTypeRouteError" :forbidden="!allowed" :loading="resource.loading.value && !backgroundRefresh" :error="resource.error.value" :empty="!groupScoped && !rows.length" :empty-text="emptyText" @retry="reread">
    <template v-if="!internal && !targetFilter && !statusFilter && !taskTypeFilter && !filter" #empty><p class="task-directory-empty-copy">通过任务，您可以从云端下发消息或控制指令到设备，触发设备完成各类操作。</p><el-button v-if="manage" link type="primary" :disabled="busy || uncertain" @click="openCreate">创建任务</el-button></template>
    <div v-if="groupOnboarding" class="group-task-empty">
      <img src="/reference/empty-content.png" alt="" />
      <h2>让设备批量或定时执行任务</h2>
      <p>通过任务，您可以从云端下发消息或控制指令到设备，触发设备完成各类操作。</p>
      <el-button v-if="manage" type="primary" :disabled="busy || uncertain" @click="openCreate">创建任务</el-button>
    </div>
    <div v-else-if="!internal && rows.length" class="task-directory-cards" :class="{'is-switching':switching}">
      <article v-for="row in rows" :key="row.id" class="task-card" :data-row="row.id">
        <header class="task-card-heading">
          <button class="task-card-name" :title="row.name" @click="openTask(row)">{{ row.name }}</button>
          <div class="task-card-status">
            <span v-if="!knownStatus(row)" aria-label="任务状态无法识别">—</span>
            <span v-else-if="groupScoped" :class="{'task-status-active':row.status==='ACTIVE'}">{{ row.status==='ACTIVE' ? '已启用' : '已停用' }}</span>
            <el-switch v-else :model-value="switchValue(row)" size="default" :aria-label="`启用任务：${row.name}`" :disabled="!manage || busy || uncertain" @change="switchEnabled(row)" />
          </div>
        </header>
        <div class="task-card-description">
          <span class="task-card-badge" :class="`task-card-badge--${taskActionFamily[row.actionType]}`" aria-hidden="true"><ReferenceIcon :glyph="taskActionGlyph(row.actionType)" /></span>
          <span>{{ taskContentLabel(row) }} - {{ taskTargetLabel(row) }}</span>
        </div>
        <div class="task-card-bottom">
          <el-button v-if="runnable" class="task-card-run" plain size="small" :disabled="busy || uncertain" @click="openRunner(row)"><el-icon aria-hidden="true"><VideoPlay /></el-icon><span>运行任务</span></el-button>
          <span class="task-card-schedule">{{ taskScheduleLabel(row) }}</span>
        </div>
      </article>
    </div>
    <el-table v-else-if="internal" class="task-directory-table" :data="rows"><el-table-column prop="name" label="名称" min-width="220"><template #default="{ row }"><el-button class="task-directory-name" link type="primary" @click="router.push(`/tasks/jobs/${row.id}`)">{{ row.name }}</el-button></template></el-table-column><el-table-column prop="status" label="状态" width="80"><template #default="{ row }">{{ internal ? row.status : statusLabel(row.status) }}</template></el-table-column><el-table-column v-if="internal" prop="commandKey" label="命令" /><el-table-column label="下次运行" min-width="180"><template #default="{ row }"><span class="task-directory-time">{{ formatTime(row.nextRunAt) }}</span></template></el-table-column><el-table-column label="操作" :width="internal ? 340 : 240"><template #default="{ row }">
      <el-button v-if="manage" link type="primary" :disabled="busy || uncertain" @click="edit(row)">编辑</el-button><el-button v-if="internal" link type="primary" @click="logs(row)">执行记录</el-button>
      <el-button v-if="runnable" link type="primary" :disabled="busy || uncertain" @click="openRunner(row)">运行</el-button>
      <el-popconfirm v-if="manage" :title="row.status === 'ACTIVE' ? '确认停用任务？' : '确认启用任务？'" @confirm="switchEnabled(row)"><template #reference><el-button link :disabled="busy || uncertain || !knownStatus(row)">{{ row.status === 'ACTIVE' ? '停用' : row.status === 'PAUSED' ? '启用' : '—' }}</el-button></template></el-popconfirm>
      <el-popconfirm v-if="manage" title="确认移除任务？既有执行记录将保留。" @confirm="write('task:manage', () => deleteTask(projectId, row.id, row.version))"><template #reference><el-button link type="danger" :disabled="busy || uncertain">移除</el-button></template></el-popconfirm>
    </template></el-table-column></el-table><CursorPager v-if="!groupScoped || filtered.length>limit || page>1" :page="page" :limit="limit" :total="String(filtered.length)" :loading="resource.loading.value" @update:page="changePage" @update:limit="limit = $event" />
  </AsyncState>
  <TaskRunnerDialog v-if="!internal && runner" :model-value="true" :task="runner" :initial-device-ids="savedRunnerSelection(runner)" :busy="busy" :locked="uncertain || !runnable || !allowed" :error="message" :load-candidates="loadRunnerCandidates" @update:model-value="closeRunner" @run="submitRun" @denied="runnerDenied" @conflict="runnerConflict" />
  <el-dialog v-if="internal" :model-value="!!runner" title="运行任务" width="560px" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" @update:model-value="closeRunner">
    <dl v-if="runner" class="tl-key-values"><dt>任务名称</dt><dd>{{ runner.name }}</dd><dt>任务类型</dt><dd>{{taskActionLabel(runner)}}</dd><template v-if="internal"><dt>命令</dt><dd>{{ runner.commandKey }}</dd></template><dt>目标</dt><dd>{{ runnerTarget }}</dd></dl>
    <p v-if="internal && runner?.status === 'PAUSED'" class="tl-muted">当前任务定时已停用，仍可手动运行已保存的目标和命令。</p>
    <el-form v-if="internal" label-position="top"><el-form-item label="幂等键（可选）"><el-input v-model="runKey" maxlength="128" :disabled="busy || uncertain" /></el-form-item></el-form>
    <el-alert v-if="message" :title="message" type="warning" :closable="false" />
    <template #footer><el-button :disabled="busy" @click="closeRunner(false)">取消</el-button><el-button type="primary" :loading="busy" :disabled="!runnable || uncertain" @click="submitRun">确定运行</el-button></template>
  </el-dialog>
  <el-dialog v-model="editor" :title="editingId ? '编辑任务' : '创建任务'" width="640px" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy">
    <el-form v-if="draft" label-position="top" class="tl-form"><el-form-item label="名称"><el-input v-model="draft.name" maxlength="128" /></el-form-item><el-form-item label="说明"><el-input v-model="draft.description" type="textarea" maxlength="512" /></el-form-item><template v-if="internal"><el-form-item label="调度"><el-select v-model="draft.scheduleType"><el-option label="一次性" value="ONCE" /><el-option label="CRON" value="CRON" /></el-select></el-form-item><el-form-item v-if="draft.scheduleType === 'ONCE'" label="执行时间（含时区）"><el-input v-model="draft.runAt" /></el-form-item><el-form-item v-else label="CRON"><el-input v-model="draft.cronExpression" /></el-form-item><el-form-item label="项目时区"><el-input :model-value="draft.timezone" disabled /></el-form-item><el-form-item label="目标"><el-select v-model="draft.targetType"><el-option label="所有设备" value="ALL_DEVICES" /><el-option label="设备组" value="DEVICE_GROUP" /></el-select></el-form-item><el-form-item v-if="draft.targetType === 'DEVICE_GROUP'" label="设备组标识"><el-input v-model="draft.targetGroupId" /></el-form-item><el-form-item label="命令标识"><el-input v-model="draft.commandKey" maxlength="64" /></el-form-item><el-form-item label="命令参数（JSON）"><el-input v-model="input" type="textarea" :rows="5" /></el-form-item><el-form-item label="启用"><el-switch v-model="draft.enabled" /></el-form-item></template></el-form>
    <el-alert v-if="message" :title="message" type="warning" :closable="false" />
    <template #footer><el-button :disabled="busy" @click="editor = false">取消</el-button><el-button type="primary" :disabled="!manage || uncertain" :loading="busy" @click="save">保存</el-button></template>
  </el-dialog>
  <el-dialog v-if="internal" :model-value="!!selected" title="任务执行记录" width="780px" @update:model-value="closeLogs"><AsyncState :loading="executions.loading.value" :error="executions.error.value" :empty="!executions.data.value?.length" @retry="executions.reload"><el-table :data="executions.data.value || []"><el-table-column prop="id" label="执行标识" /><el-table-column prop="status" label="状态" width="80"><template #default="{ row }">{{ internal ? row.status : statusLabel(row.status) }}</template></el-table-column><el-table-column prop="totalTargets" label="目标数" /><el-table-column prop="acceptedTargets" label="受理数" /><el-table-column prop="succeededTargets" label="成功数" /><el-table-column prop="failedTargets" label="失败数" /><el-table-column prop="failureSummary" label="失败说明" show-overflow-tooltip /><el-table-column label="开始时间"><template #default="{ row }">{{ formatTime(row.startedAt) }}</template></el-table-column></el-table></AsyncState></el-dialog>
</component></template>

<style scoped>.task-directory-name{height:auto;min-height:24px;max-width:100%;white-space:normal;text-align:left;overflow-wrap:anywhere;}.task-directory-time{white-space:nowrap;}.task-directory-empty-copy{max-width:680px;margin:0 auto;color:var(--tl-muted);font-size:14px;line-height:1.7;text-align:center}.task-directory-filters{display:flex;flex-wrap:wrap;gap:8px;}.task-directory-filters .el-select{width:150px;max-width:100%;}.task-directory-search{max-width:280px;}@media(max-width:600px){.task-directory-filters .el-select,.task-directory-search{width:100%;max-width:100%;}}
.task-header-switching :deep(.el-button.is-disabled:not(.el-button--primary)){--el-button-disabled-text-color:var(--el-button-text-color);--el-button-disabled-bg-color:var(--el-button-bg-color);--el-button-disabled-border-color:var(--el-button-border-color)}
.task-header-switching :deep(.el-button--primary.is-disabled){--el-button-disabled-text-color:var(--el-color-white);--el-button-disabled-bg-color:var(--el-color-primary);--el-button-disabled-border-color:var(--el-color-primary)}
.group-task-directory .task-directory-filters{gap:10px;margin-bottom:0}
.reference-task-filters :deep(.el-select__wrapper){min-height:33px;padding-inline:15px;font-size:13px}
.reference-task-filters :deep(.el-select__wrapper:not(.is-disabled) .el-select__selected-item){color:#606266}
.group-task-actions{display:flex;gap:10px;margin-left:auto}
.group-task-actions .el-button{height:32px;margin-left:0}
.group-task-empty{padding:60px 0;text-align:center}
.group-task-empty img{display:block;width:160px;margin:auto}
.group-task-empty h2{margin:20px 0 10px;color:#082a2a;font-size:26px;line-height:36px;font-weight:400}
.group-task-empty p{max-width:460px;margin:0 auto 20px;color:#909399;font-size:14px;line-height:22px}
.group-task-empty .el-button{height:40px;padding-inline:20px}
.task-directory-cards{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin-top:20px}
.task-card{min-width:0;padding:20px;border:1px solid #ebeef5;border-radius:4px;background:#fff;color:#303133;transition:box-shadow .3s}
.task-card:hover{box-shadow:0 2px 12px 0 rgba(0,0,0,.1)}
.task-card-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:22px}
.task-card-name{min-width:0;margin:0;padding:0;overflow:hidden;border:0;background:none;color:#303133;font-family:inherit;font-size:16px;font-weight:600;line-height:22px;text-align:left;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
.task-card-name:hover,.task-card-name:focus-visible{color:var(--tl-primary)}
.task-card-status{flex:none;color:#909399;font-size:12px;line-height:20px}
.task-card-status .task-status-active{color:#67c23a}
.task-card-status :deep(.el-switch){height:20px}
.is-switching .task-card-status :deep(.el-switch.is-disabled){opacity:1}
.is-switching .task-card-run.is-disabled{--el-button-disabled-text-color:#606266;--el-button-disabled-bg-color:#fff;--el-button-disabled-border-color:#dcdfe6}
.task-card-description{display:flex;align-items:center;gap:6px;min-height:24px;margin-top:9px;color:#888;font-size:14px;line-height:22px}
.task-card-badge{display:inline-flex;align-items:center;justify-content:center;flex:none;width:24px;height:24px;border-radius:4px;background:#458685;color:#fff}
.task-card-badge--command{background:#34c995}
.task-card-badge--property{background:#f9bd26}
.task-card-badge--data{background:#609ff4}
.task-card-badge .reference-icon{font-size:14px}
.task-card-bottom{display:flex;align-items:center;gap:8px;min-height:28px;margin-top:16px;color:#888;font-size:13px;line-height:20px}
.task-card-schedule{margin-left:auto;text-align:right}
.task-card-run{height:28px;margin:0;padding:0 15px;border:1px solid #dcdfe6;color:#606266;font-size:12px;font-weight:400;line-height:12px}
.task-card-run :deep(.el-icon){margin-right:5px;font-size:11px}
.task-card-run :deep(span + span){margin-left:0}
@media(min-width:768px){.task-directory-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(min-width:992px){.task-directory-cards{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(min-width:1920px){.task-directory-cards{grid-template-columns:repeat(4,minmax(0,1fr))}}
</style>
