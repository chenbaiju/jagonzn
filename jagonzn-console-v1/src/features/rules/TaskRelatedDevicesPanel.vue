<script setup lang="ts">
import { computed, toRef, watch } from 'vue'
import { ApiError } from '@/core/http'
import { can } from '@/core/session'
import {showOperationFeedback} from '@/ui/operation-feedback'
import TaskRelatedDevicesView from './TaskRelatedDevicesView.vue'
import { useTaskRelatedDevicesState, type RelatedDevicesTransport } from './task-related-devices-state'
/** 由正式父页提供当前定义及人工回读；端口只接已转换展示投影。 */
const props = defineProps<{
  jobId: string
  definitionVersion?: number
  enabled: boolean
  inactive?: boolean
  transport: RelatedDevicesTransport
  refreshContext: () => Promise<void>
}>()
const emit = defineEmits<{ denied: [cause: ApiError]; busy: [value: boolean]; locked: [value: boolean] }>()
const state = useTaskRelatedDevicesState(toRef(props,'jobId'),toRef(props,'definitionVersion'),toRef(props,'enabled'),props.transport,props.refreshContext,computed(()=>!props.inactive))
const rows = computed(()=>(state.page.data.value?.rows || []).map(row=>({...row,href:can('device:read')?row.href:undefined})))
// 同步告知父页，不能在下一次渲染前从另一个入口重复运行。
watch(state.busy,value=>emit('busy',value),{immediate:true,flush:'sync'})
watch(state.locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
watch(state.page.error,cause=>{if(cause instanceof ApiError && [401,403,404].includes(cause.status))emit('denied',cause)})
watch(state.notice,value=>{if(value)showOperationFeedback(value)})
defineExpose({ reread: () => state.reload() })
</script>
<template>
  <div v-show="!inactive">
    <TaskRelatedDevicesView :rows="rows" :selected-keys="state.selected.value" :can-run="state.canRun.value" :can-manage="state.canManage.value"
      :forbidden="!state.allowed.value" :loading="state.page.loading.value" :error="state.page.error.value"
      :busy="state.busy.value" :locked="state.locked.value" :write-error="state.writeError.value" :page="state.cursors.value.length" :has-next="!!state.page.data.value?.continuation"
      @selection="state.select" @run="state.run" @change-schedule="state.toggle" @refresh="state.reload()" @reread="state.reload()" @next="state.next" @previous="state.previous" />
  </div>
</template>
