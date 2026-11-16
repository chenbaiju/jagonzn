<script setup lang="ts">
import {ref} from 'vue'
import {RefreshRight as Refresh} from '@element-plus/icons-vue'
import {deviceOverviewApi,type OverviewRange} from './device-overview-api'
import {useDeviceOverview} from './use-device-overview'
import {usageCharts} from './device-usage-chart'
import DeviceUsageChart from './DeviceUsageChart.vue'
const props=defineProps<{deviceId:string}>(),range=ref<OverviewRange>('24h')
const resource=useDeviceOverview(()=>props.deviceId,(project,id,signal)=>deviceOverviewApi.usage(project,id,range.value,signal),()=>range.value)
const ranges=[['24h','24小时'],['3d','3天'],['7d','7天'],['15d','15天'],['30d','30天']] as const
</script>
<template><section class="device-usage" aria-label="使用统计"><header class="usage-heading"><h2>使用统计</h2><span class="usage-controls"><el-radio-group v-model="range" size="small" aria-label="统计范围"><el-radio-button v-for="[key,label] in ranges" :key="key" :value="key">{{label}}</el-radio-button></el-radio-group><el-button size="small" :icon="Refresh" :loading="resource.loading.value" @click="resource.reload">刷新</el-button></span></header><el-alert v-if="resource.error.value" title="使用统计读取失败，请刷新重试" type="error" :closable="false"/><DeviceUsageChart v-for="chart in usageCharts" :key="chart.key" :chart-key="chart.key" :title="chart.title" :keys="chart.keys" :data="resource.data.value" :loading="resource.loading.value" @refresh="resource.reload"/></section></template>
<style scoped>
.device-usage{margin-top:30px}.usage-heading{display:flex;justify-content:space-between;align-items:center;gap:16px}h2{margin:0;font-size:22px;line-height:32px;font-weight:400;color:#002822}.usage-controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end}@media(max-width:640px){.usage-heading{align-items:flex-start;flex-direction:column}.usage-controls{justify-content:flex-start;gap:8px}}
.usage-controls :deep(.el-radio-button__inner){height:28px;padding:7px 15px;font-size:12px;line-height:12px}.usage-controls>.el-button{height:28px;padding:7px 15px;font-size:12px;line-height:1}
</style>
