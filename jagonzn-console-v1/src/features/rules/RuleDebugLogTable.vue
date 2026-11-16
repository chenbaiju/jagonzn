<script setup lang="ts">
import { formatTime } from '@/core/time'
/** 纯展示行，只含已转换的标签和链接；不是手写服务端DTO，不自行查询或写入。 */
export type DebugLogDisplayRow={key:string;deviceLabel:string;deviceHref?:string;ruleLabel:string;ruleHref?:string;typeLabel:string;operationLabel:string;at?:string;resultLabel:string;failed:boolean;failureCode?:string}
defineProps<{rows:readonly DebugLogDisplayRow[];singleRule?:boolean;loading?:boolean}>()
</script>
<template><el-table :data="rows" class="rule-debug-log-table" v-loading="loading">
 <el-table-column label="设备名称" min-width="180"><template #default="{row}"><router-link v-if="row.deviceHref" :to="row.deviceHref">{{row.deviceLabel}}</router-link><span v-else>{{row.deviceLabel}}</span></template></el-table-column>
 <el-table-column v-if="!singleRule" label="规则名称" min-width="180"><template #default="{row}"><router-link v-if="row.ruleHref" :to="row.ruleHref">{{row.ruleLabel}}</router-link><span v-else>{{row.ruleLabel}}</span></template></el-table-column>
 <el-table-column v-if="!singleRule" prop="typeLabel" label="规则类型" min-width="180" />
 <el-table-column prop="operationLabel" label="操作类型" min-width="180" />
 <el-table-column label="执行时间" width="190"><template #default="{row}"><span class="rule-debug-log-time">{{formatTime(row.at)}}</span></template></el-table-column>
 <el-table-column label="执行结果" width="100" align="center"><template #default="{row}"><el-tooltip v-if="row.failed && row.failureCode" effect="dark" :content="singleRule ? row.failureCode : `错误码：${row.failureCode}`" placement="top-start"><el-tag class="rule-debug-log-result" type="danger" effect="dark" size="small">{{row.resultLabel}}</el-tag></el-tooltip><el-tag v-else-if="row.failed || row.resultLabel==='已提交' || row.resultLabel==='输出已就绪' || row.resultLabel==='已发送'" class="rule-debug-log-result" :type="row.failed ? 'danger' : 'success'" effect="dark" size="small">{{row.resultLabel}}</el-tag><span v-else>{{row.resultLabel}}</span></template></el-table-column>
 <template #empty>暂无日志</template>
</el-table></template>
<style scoped>.rule-debug-log-table :deep(th.el-table__cell){color:#303133;font-weight:600}.rule-debug-log-table a{color:var(--el-color-primary);text-decoration:none;overflow-wrap:anywhere}.rule-debug-log-time{white-space:nowrap}.rule-debug-log-failure{color:var(--el-color-danger)}.rule-debug-log-result{display:inline-block;height:20px;padding:0 5px;line-height:19px;font-size:12px;font-weight:400;border:1px solid;border-radius:4px;box-sizing:border-box;white-space:nowrap;color:#fff}.rule-debug-log-result.el-tag--success{background-color:#67c23a;border-color:#67c23a}.rule-debug-log-result.el-tag--danger{background-color:#f56c6c;border-color:#f56c6c}</style>
