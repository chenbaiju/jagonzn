<script setup lang="ts">
import {Refresh,InfoFilled} from '@element-plus/icons-vue'
import {can} from '../../core/session'
import PageHeader from '../../ui/PageHeader.vue'
import AsyncState from '../../ui/AsyncState.vue'
import CursorPager from '../../ui/CursorPager.vue'
import AlarmRuleDirectoryTable from './AlarmRuleDirectoryTable.vue'
import {useAlarmRuleDirectory} from './use-alarm-rule-directory'
/** 只读目录；编辑和历史动作仅由已接通能力的宿主开放。 */
withDefaults(defineProps<{manageAvailable?:boolean;historyAvailable?:boolean;bindingsAvailable?:boolean}>(),{manageAvailable:false,historyAvailable:true,bindingsAvailable:false})
defineEmits<{edit:[identity:string];history:[identity:string];bindings:[identity:string]}>()
const w=useAlarmRuleDirectory()
</script>
<template>
 <main class="tl-page">
  <PageHeader title="告警规则" :count="w.list.data.value?.total"><el-button size="small" plain :icon="Refresh" :loading="w.list.loading.value" :disabled="!can('alarm:read')" @click="w.refresh">刷新</el-button><slot name="actions" /></PageHeader>
  <div class="tl-learning-resource"><el-icon aria-hidden="true"><InfoFilled/></el-icon><span>学习资源：<a href="https://www.thingscloud.xyz/docs/guide/alarm/alarm-rule.html" target="_blank" rel="noopener noreferrer">什么是告警规则？ ↗</a></span></div>
  <AsyncState :forbidden="!can('alarm:read')" :loading="w.list.loading.value" :error="w.list.error.value" @retry="w.reload">
   <AlarmRuleDirectoryTable :rows="w.rows.value" :can-manage="manageAvailable&&can('alarm:manage')" :history-available="historyAvailable" :bindings-available="bindingsAvailable" @edit="$emit('edit',$event)" @history="$emit('history',$event)" @bindings="$emit('bindings',$event)" />
  </AsyncState>
  <CursorPager v-if="can('alarm:read')&&!w.list.error.value&&(w.page.value>1||!!w.rows.value.length)" :page="w.page.value" :limit="w.limit.value" :total="w.list.data.value?.total" :loading="w.list.loading.value" @update:page="w.selectPage" @update:limit="w.setLimit" />
 </main>
</template>
