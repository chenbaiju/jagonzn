<script setup lang="ts">
import { Delete, Refresh, WarningFilled } from '@element-plus/icons-vue'
import PageHeader from '@/ui/PageHeader.vue'
import AsyncState from '@/ui/AsyncState.vue'
import CursorPager from '@/ui/CursorPager.vue'
import RuleDebugLogTable, { type DebugLogDisplayRow } from './RuleDebugLogTable.vue'
/** 页面只呈现当前读取和已捕获的确认状态，所有权限、CAS与请求生命周期由父组件负责。 */
defineProps<{
  rows: readonly DebugLogDisplayRow[]
  singleRule?: boolean
  forbidden?: boolean
  loading?: boolean
  error?: unknown
  controlLoading?: boolean
  controlError?: unknown
  enabled?: boolean
  busy?: boolean
  locked?: boolean
  writeError?: string
  canClear?: boolean
  page: number
  hasNext?: boolean
  confirming?: boolean
}>()
defineEmits<{
  refresh: []
  retryControl: []
  toggle: [enabled: boolean]
  openClear: []
  cancelClear: []
  confirmClear: []
  reread: []
  next: []
  previous: []
}>()
</script>
<template>
  <div class="rule-debug-log-view" :class="{'is-single-rule':singleRule}">
    <template v-if="singleRule && !forbidden">
      <section class="rule-debug-state">
        <h3>调试状态</h3>
        <p>开启调试状态后，将记录规则运行日志，包括规则运行错误信息，便于调试规则条件和操作。</p>
        <AsyncState :loading="controlLoading" :error="controlError" @retry="$emit('retryControl')">
          <el-switch v-if="enabled !== undefined" :model-value="enabled" aria-label="调试状态" :loading="busy" :disabled="busy || locked || loading || !!error || confirming" @change="(value: string | number | boolean) => $emit('toggle', value === true)" />
        </AsyncState>
      </section>
    </template>
    <el-alert v-if="writeError" :title="writeError" type="error" :closable="false"><el-button v-if="locked" :disabled="busy" @click="$emit('reread')">重新读取核对</el-button></el-alert>
    <component :is="singleRule ? 'header' : PageHeader" :title="singleRule ? undefined : '规则日志'" class="rule-debug-log-heading">
      <h3 v-if="singleRule">规则日志</h3>
      <div class="rule-debug-log-actions">
        <el-button size="small" :icon="Refresh" :disabled="forbidden || loading || busy || confirming" @click="$emit('refresh')">刷新</el-button>
        <el-button size="small" type="danger" :icon="Delete" :disabled="forbidden || loading || busy || locked || !canClear || !!error || confirming" @click="$emit('openClear')">清空</el-button>
      </div>
    </component>
    <AsyncState :forbidden="forbidden" :loading="loading" :error="error" @retry="$emit('refresh')">
      <RuleDebugLogTable :rows="rows" :single-rule="singleRule" />
      <CursorPager :page="page" :has-next="hasNext" :limit="24" :show-sizes="false" :show-pages="false" :loading="loading || busy || confirming" @previous="$emit('previous')" @next="$emit('next')" />
    </AsyncState>
    <el-dialog :model-value="confirming" title="提示" width="420px" align-center :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" @update:model-value="(value: boolean) => { if (!value && !busy) $emit('cancelClear') }">
      <div class="rule-debug-clear-prompt"><el-icon><WarningFilled /></el-icon><span>{{ singleRule ? '确认清空该规则的日志吗？' : '确认清空项目中的规则日志吗？' }}</span></div>
      <template #footer><el-button :disabled="busy" @click="$emit('cancelClear')">取消</el-button><el-button type="primary" :loading="busy" :disabled="forbidden || locked || !canClear" @click="$emit('confirmClear')">确定</el-button></template>
    </el-dialog>
  </div>
</template>
<style scoped>
.rule-debug-log-view.is-single-rule{padding-top:10px}
.rule-debug-state{margin:0 0 32px}.rule-debug-state h3,.rule-debug-log-heading h3{margin:0;font-size:22px;font-weight:400;line-height:32px;color:#002822}
.rule-debug-state p{margin:12px 0 18px;color:#888;font-size:15px;line-height:22px}
.rule-debug-log-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap}.rule-debug-log-actions{display:flex;align-items:center;gap:8px}.rule-debug-log-actions .el-button+.el-button{margin-left:0}
.rule-debug-clear-prompt{display:flex;align-items:center;gap:12px;min-height:36px;overflow-wrap:anywhere}.rule-debug-clear-prompt .el-icon{color:var(--el-color-warning);font-size:20px;flex-shrink:0}
.rule-debug-log-view>.el-alert{margin-bottom:16px}
</style>
