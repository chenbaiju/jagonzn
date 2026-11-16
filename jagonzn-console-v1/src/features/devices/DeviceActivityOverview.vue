<script setup lang="ts">
import {computed} from 'vue'
import {QuestionFilled} from '@element-plus/icons-vue'
import {RefreshRight as Refresh} from '@element-plus/icons-vue'
import {formatTime} from '@/core/time'
import {deviceOverviewApi} from './device-overview-api'
import {useDeviceOverview} from './use-device-overview'
const props=defineProps<{deviceId:string}>()
const resource=useDeviceOverview(()=>props.deviceId,deviceOverviewApi.activity)
const labels=['属性上报','属性获取','属性下发','事件上报','命令下发','命令回复','自定义上报','自定义下发','MQTT 连接','MQTT 断开','TCP 连接','TCP 断开']
const tips=['设备最近一次上报属性的时间。','设备最近一次获取属性的时间。','平台最近一次向设备下发属性的时间。','设备最近一次上报事件的时间。','平台最近一次向设备下发命令的时间。','设备最近一次回复命令的时间。','设备最近一次上报自定义数据的时间。','平台最近一次向设备下发自定义数据的时间。','设备最近一次建立 MQTT 连接的时间。','设备最近一次断开 MQTT 连接的时间。','设备最近一次建立 TCP 连接的时间。','设备最近一次断开 TCP 连接的时间。']
const rows=computed(()=>labels.map((label,index)=>({label,tip:tips[index],at:resource.data.value?.items[index]?.at})))
const hasActivity=computed(()=>rows.value.some(row=>row.at!=null))
</script>
<template><section class="device-activity" :class="{'is-empty':!hasActivity}" aria-label="活跃时间"><header><h2>活跃时间</h2><span class="activity-controls"><el-button size="small" :icon="Refresh" :loading="resource.loading.value" @click="resource.reload">刷新</el-button></span></header><el-alert v-if="resource.error.value" title="活跃时间读取失败，请刷新重试" type="error" :closable="false"/><p v-if="resource.loading.value&&!resource.data.value" role="status">正在读取活跃时间…</p><div v-if="!resource.loading.value&&!resource.error.value" class="activity-columns"><template v-if="hasActivity"><dl v-for="(items,n) in [rows.slice(0,8),rows.slice(8)]" :key="n"><div v-for="row in items" :key="row.label" class="activity-row"><dt>{{row.label}} <el-tooltip :content="row.tip" placement="top" :trigger="['hover','focus']"><el-icon class="activity-help" tabindex="0" role="img" :aria-label="row.tip"><QuestionFilled/></el-icon></el-tooltip></dt><dd>{{row.at?formatTime(row.at):'-'}}</dd></div></dl></template><template v-else><div v-for="column in 2" :key="column" class="activity-empty" role="status">暂无数据</div></template></div></section></template>
<style scoped>
.activity-empty{display:flex;align-items:center;justify-content:center;min-height:60px;border-bottom:1px solid var(--tl-border);font-size:12px;line-height:60px;color:#909399}
.device-activity{margin-top:40px}.device-activity.is-empty{margin-top:50px}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;font-size:22px;line-height:32px}.activity-controls .el-button{height:28px;padding:7px 15px;font-size:12px;line-height:1}h2{font-size:22px;line-height:32px;font-weight:400;margin:0;color:#002822}.activity-columns{display:grid;grid-template-columns:1fr 1fr;gap:40px}dl{margin:0;min-width:0}.activity-row{display:flex;justify-content:space-between;gap:16px;align-items:center;border-bottom:1px solid var(--tl-border);min-height:40px;padding:5px 10px;box-sizing:border-box;font-size:12px;line-height:20px;color:var(--tl-text-secondary)}dt{white-space:nowrap}.activity-help{color:#c0c4cc;font-size:11px;cursor:help;vertical-align:-1px}.activity-help:focus-visible{outline:2px solid var(--tl-primary);outline-offset:2px;border-radius:50%}dd{margin:0;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}@media(max-width:760px){.activity-columns{grid-template-columns:1fr;gap:20px}.activity-row{padding-inline:0}}
</style>
