<script setup lang="ts">
import NotificationCustomerChannels,{type CustomerNotificationChannel} from './NotificationCustomerChannels.vue'
/** 展示模型只含已整理的人类标签；不是手写HTTP DTO，不推断旧阈值规则的V2身份。 */
export interface AlarmRuleTableRow {
 identity:string;name:string;severityLabel:string;severityTone:'info'|'warning'|'danger';sourceLabel:string;enabledLabel:string;
 notificationGroupLabels:readonly string[]|null;customerChannels:readonly CustomerNotificationChannel[]|null
}
withDefaults(defineProps<{rows:readonly AlarmRuleTableRow[];canManage:boolean;historyAvailable?:boolean;bindingsAvailable?:boolean}>(),{historyAvailable:true,bindingsAvailable:false})
defineEmits<{edit:[identity:string];history:[identity:string];bindings:[identity:string]}>()
</script>
<template>
 <el-table :data="rows" class="source-rule-directory" empty-text="暂无数据">
  <el-table-column label="规则名称" prop="name" min-width="100" />
  <el-table-column label="严重级别" width="100" align="center"><template #default="{row}"><el-tag :type="row.severityTone" effect="plain" size="small">{{ row.severityLabel }}</el-tag></template></el-table-column>
  <el-table-column label="设备源类型" prop="sourceLabel" min-width="90" />
  <el-table-column label="规则可用" prop="enabledLabel" align="center" />
  <el-table-column label="通知组" min-width="80"><template #default="{row}"><span v-if="row.notificationGroupLabels===null" class="rule-unset">—</span><div v-else-if="row.notificationGroupLabels.length" class="rule-group-tags"><el-tag v-for="(name,index) in row.notificationGroupLabels" :key="index" size="small" type="info">{{ name }}</el-tag></div><span v-else class="rule-unset">未设置</span></template></el-table-column>
  <el-table-column label="用户通知" min-width="80" class-name="customer-notification-column"><template #default="{row}"><slot name="customer-notifications" :row="row"><NotificationCustomerChannels v-if="row.identity" :channels="row.customerChannels??null" /></slot></template></el-table-column>
  <el-table-column min-width="260" align="right"><template #default="{row}"><el-button size="small" :disabled="!canManage" @click="$emit('edit',row.identity)">编辑</el-button><el-button v-if="bindingsAvailable" size="small" :disabled="!canManage" @click="$emit('bindings',row.identity)">通知路由</el-button><el-button size="small" :disabled="!historyAvailable" @click="$emit('history',row.identity)">告警历史</el-button></template></el-table-column>
 </el-table>
</template>
<style scoped>
.source-rule-directory{width:100%}.rule-group-tags{display:flex;flex-wrap:wrap;gap:4px}.rule-unset{color:#c0c4cc}.rule-group-tags :deep(.el-tag){max-width:100%;height:auto;white-space:normal;overflow-wrap:anywhere}.source-rule-directory :deep(.customer-notification-column .cell){overflow:visible}
</style>
