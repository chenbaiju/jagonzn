<script setup lang="ts">
import { computed,toRef,watch } from 'vue'
import { EditPen } from '@element-plus/icons-vue'
import { ApiError } from '@/core/http'
import AsyncState from '@/ui/AsyncState.vue'
import type {TaskSelectionWrite} from './models'
import TaskScheduleDialog from './TaskScheduleDialog.vue'
import { useTaskScheduleState,type TaskScheduleTransport } from './task-schedule-state'
const props=defineProps<{jobId:string;selection?:TaskSelectionWrite;projectZone?:string;intervalSupported?:boolean;solarSupported?:boolean;inactive?:boolean;transport:TaskScheduleTransport;refreshContext:()=>Promise<void>}>()
const emit=defineEmits<{denied:[cause:ApiError];busy:[value:boolean];locked:[value:boolean];editing:[value:boolean]}>()
const state=useTaskScheduleState(toRef(props,'jobId'),toRef(props,'projectZone'),props.transport,props.refreshContext,computed(()=>!props.inactive))
const labels:Record<string,string>={MANUAL:'关闭定时',ONCE:'只运行一次',DAILY:'每日定时',INTERVAL:'间隔时间重复',SOLAR:'日出日落'}
watch(state.busy,value=>emit('busy',value),{immediate:true,flush:'sync'});watch(state.locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
watch(state.editing,value=>emit('editing',value),{immediate:true,flush:'sync'})
watch(state.page.error,cause=>{if(cause instanceof ApiError&&[401,403,404].includes(cause.status))emit('denied',cause)})
defineExpose({reread:()=>state.reload()})
</script>
<template>
  <section v-show="!inactive" class="task-schedule-panel">
    <h3>任务定时设置</h3><p class="task-schedule-help">任务支持多种定时方式，修改设置后立即生效。</p>
    <el-alert v-if="state.notice.value" :title="state.notice.value" type="info" :closable="false" />
    <el-alert v-if="state.page.data.value?.requiresReconfigure" title="该一次计划已过期或来源任务已执行，请重新设置运行时间后启用。" type="warning" :closable="false" />
    <el-alert v-if="state.writeError.value&&!state.editing.value" :title="state.writeError.value" type="error" :closable="false"><el-button v-if="state.locked.value" :disabled="state.busy.value" @click="state.reload()">重新读取核对</el-button></el-alert>
    <AsyncState :forbidden="!state.allowed.value" :loading="state.page.loading.value" :error="state.page.error.value" @retry="state.reload()"><dl><dt>定时方式</dt><dd>{{labels[state.page.data.value?.kind||'']||'—'}}</dd><template v-if="state.page.data.value?.kind==='SOLAR'&&state.page.data.value?.waitingForEvent"><dt>计划状态</dt><dd>等待后续太阳事件</dd></template></dl><el-button v-if="state.manage.value" size="small" :icon="EditPen" :disabled="!state.canManage.value" aria-label="编辑定时设置" @click="state.open" /></AsyncState>
    <TaskScheduleDialog v-if="state.editing.value" :model-value="true" :seed="state.seed.value" :selection="selection" :project-zone="projectZone" :interval-supported="intervalSupported" :solar-supported="solarSupported" :busy="state.busy.value" :locked="state.locked.value" :error="state.writeError.value" @update:model-value="state.close" @save="state.save" @reread="state.reload()" />
  </section>
</template>
<style scoped>.task-schedule-panel h3{font-size:18px;line-height:1.5;font-weight:400;margin:0;color:var(--tl-title)}.task-schedule-help{font-size:12px;line-height:1.6;margin:12px 0 28px;color:var(--tl-muted)}.task-schedule-panel dl{margin:0 0 22px}.task-schedule-panel dt{font-size:12px;color:var(--tl-muted);margin-bottom:8px}.task-schedule-panel dd{font-size:14px;margin:0}.task-schedule-panel>.el-alert{margin:12px 0}</style>
