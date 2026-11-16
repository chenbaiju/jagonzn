<script setup lang="ts">
import { computed, toRef, watch } from 'vue'
import { ApiError } from '@/core/http'
import { can } from '@/core/session'
import RuleDebugLogView from './RuleDebugLogView.vue'
import { useRuleDebugLogState, type DebugLogTransport } from './rule-debug-state'
/** 生成合同适配器转换后再传入展示投影；父页暂不可用时隐藏内容，保留本对象未核对意图。 */
const props = defineProps<{ ruleId?: string; transport: DebugLogTransport; inactive?: boolean }>()
const emit = defineEmits<{ denied: [cause: ApiError]; busy: [value: boolean]; locked: [value: boolean]; confirming: [value: boolean] }>()
const state = useRuleDebugLogState(toRef(props, 'ruleId'), props.transport, computed(() => !props.inactive))
// 只传播当前对象的写入意图；父页保护自身写入口，不把日志版本当定义版本。
watch(state.busy, value => emit('busy', value), { immediate: true })
watch(state.locked, value => emit('locked', value), { immediate: true })
watch(() => !!state.intent.value, value => emit('confirming', value), { immediate: true })
const rows = computed(() => (state.page.data.value?.rows || []).map(row => ({ ...row, deviceHref: can('device:read') ? row.deviceHref : undefined, ruleHref: can('rule:manage') ? row.ruleHref : undefined })))
watch([state.page.error, state.control.error], causes => {
  const denied = causes.find(cause => cause instanceof ApiError && [401,403,404].includes(cause.status))
  if (denied instanceof ApiError) emit('denied', denied)
})
</script>
<template>
  <RuleDebugLogView v-show="!inactive" :rows="rows" :single-rule="!!ruleId" :forbidden="!state.allowed.value"
    :loading="state.page.loading.value" :error="state.page.error.value"
    :control-loading="state.control.loading.value" :control-error="state.control.error.value" :enabled="state.control.data.value?.checked"
    :busy="state.busy.value" :locked="state.locked.value" :write-error="state.writeError.value" :can-clear="state.ready.value"
    :page="state.displayPage.value" :has-next="state.hasNext.value" :confirming="!!state.intent.value"
    @refresh="state.reload()" @retry-control="state.retryControl" @toggle="state.toggle"
    @open-clear="state.openClear" @cancel-clear="state.cancelClear" @confirm-clear="state.confirmClear"
    @reread="state.reload()" @next="state.next" @previous="state.previous" />
</template>
