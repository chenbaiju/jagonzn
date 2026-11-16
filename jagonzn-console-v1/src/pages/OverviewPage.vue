<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {can,currentProject,projectId,session} from '@/core/session'
import {formatTime} from '@/core/time'
import {overviewDocuments,overviewTutorials} from '@/features/overview/overview-reference-links'
import {useResource} from '@/core/use-resource'
import {errorMessage} from '@/core/http'
import {overviewQuotaRows,resourceDisplay} from '@/features/overview/overview-data'
import AsyncState from '@/ui/AsyncState.vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import OverviewRingChart from '@/features/overview/OverviewRingChart.vue'
import OverviewTrendChart from '@/features/overview/OverviewTrendChart.vue'
import {overviewTransport,type OverviewTransport,type ResourceKey,type TrendDays,type OverviewChart,type RecentActivity} from '@/features/overview/overview-api'
import {alarmDeviceCount,countText,overviewRings,overviewChartCsv} from '@/features/overview/overview-model'
const props=withDefaults(defineProps<{transport?:OverviewTransport}>(),{transport:()=>overviewTransport})
const readable=computed(()=>session.ready&&!session.transitioning&&!!session.user?.accountId&&!!projectId.value&&currentProject.value?.id===projectId.value&&['OWNER','ADMIN','OPERATOR','VIEWER'].includes(currentProject.value?.myRole||''))
const deviceRead=computed(()=>readable.value&&can('device:read'))
const manager=computed(()=>['OWNER','ADMIN'].includes(session.user?.projectRole||'')&&['OWNER','ADMIN'].includes(currentProject.value?.myRole||''))
const access=computed(()=>({deviceTypes:deviceRead.value,deviceGroups:deviceRead.value,tasks:readable.value&&can('task:read'),dashboards:readable.value&&can('dashboard_definition:read'),messageRules:readable.value&&manager.value&&can('rule:manage'),automations:readable.value&&manager.value&&can('rule:manage'),scenes:readable.value&&manager.value&&can('rule:manage'),applications:readable.value&&can('application:read'),userApplications:readable.value&&can('application:read'),users:readable.value&&can('enduser:read'),alarmRules:readable.value&&can('alarm:read'),notificationGroups:readable.value&&can('alarm:read'),firmwares:readable.value&&can('ota:read')&&manager.value}))
const exportError=ref(''),pendingTitle=ref(''),recentRange=ref<RecentActivity>('SEEN_1_DAY')
const recentRanges=[{value:'SEEN_5_MINUTES',label:'最近5分钟'},{value:'SEEN_1_HOUR',label:'最近1小时'},{value:'SEEN_6_HOURS',label:'最近6小时'},{value:'SEEN_1_DAY',label:'最近24小时'}]
const days=ref<TrendDays>(1),ranges=[{days:1,label:'24小时'},{days:3,label:'3天'},{days:7,label:'7天'},{days:15,label:'15天'},{days:30,label:'30天'}] as const
const summary=useResource(signal=>props.transport.summary(projectId.value,signal))
const quota=useResource(signal=>props.transport.quota(projectId.value,signal))
const trends=useResource(signal=>props.transport.trends(projectId.value,days.value,signal))
const recent=useResource(signal=>props.transport.recent(projectId.value,signal,recentRange.value))
const resources=useResource(signal=>props.transport.resources(projectId.value,access.value,signal))
const rings=computed(()=>overviewRings(summary.data.value))
const metrics=computed(()=>[
  {label:'所有设备',value:summary.data.value?.devices?.total,tone:'all',glyph:String.fromCodePoint(0xf0fb0)},
  {label:'在线设备',value:summary.data.value?.devices?.online,tone:'online',glyph:String.fromCodePoint(0xf0118)},
  {label:'活跃设备',value:summary.data.value?.devices?.active24h,tone:'active',glyph:String.fromCodePoint(0xf043c)},
  {label:'告警设备',value:alarmDeviceCount(summary.data.value),tone:'alarm',glyph:String.fromCodePoint(0xf0bea)}
])
const catalog:readonly Readonly<{label:string;glyph:string;key?:ResourceKey;path?:string}>[]=[
  {label:'设备类型',glyph:String.fromCodePoint(0xf01a7),key:'deviceTypes',path:'/device-types'},
  {label:'自定义数据流',glyph:String.fromCodePoint(0xf1394),key:'dataStreams',path:'/custom-data-streams'},
  {label:'设备组',glyph:String.fromCodePoint(0xf13d2),key:'deviceGroups',path:'/device-groups'},
  {label:'看板',glyph:String.fromCodePoint(0xf0a1d),key:'dashboards',path:'/dashboards'},
  {label:'大屏',glyph:String.fromCodePoint(0xf0379),key:'screens',path:'/screens'},
  {label:'消息规则',glyph:String.fromCodePoint(0xf018d),key:'messageRules',path:'/rules/messages'},
  {label:'任务',glyph:String.fromCodePoint(0xf13c1),key:'tasks',path:'/tasks/jobs'},
  {label:'告警规则',glyph:String.fromCodePoint(0xf05d6),key:'alarmRules',path:'/alarm-rules'},
  {label:'自动化',glyph:String.fromCodePoint(0xf167a),key:'automations',path:'/rules/automations'},
  {label:'场景',glyph:String.fromCodePoint(0xf040b),key:'scenes',path:'/rules/scenes'},
  {label:'告警通知组',glyph:String.fromCodePoint(0xf009f),key:'notificationGroups',path:'/notification-groups'},
  {label:'项目应用',glyph:String.fromCodePoint(0xf08c6),key:'applications',path:'/applications'},
  {label:'用户应用',glyph:String.fromCodePoint(0xf011c),key:'userApplications',path:'/user-applications'},
  {label:'用户',glyph:String.fromCodePoint(0xf000e),key:'users',path:'/end-users'},
  {label:'OTA版本',glyph:String.fromCodePoint(0xf0997),key:'firmwares',path:'/ota-versions'}
]
const scopedResources=computed(()=>({...resources.data.value,...Object.fromEntries(Object.entries(access.value).filter(([,allowed])=>!allowed).map(([key])=>[key,{state:'DENIED' as const,reason:'当前账号没有读取该资源的权限'}]))}))
const quotaRows=computed(()=>overviewQuotaRows(quota.data.value,quota.error.value,quota.loading.value))
function resourceInfo(key?:ResourceKey){return resourceDisplay(key?scopedResources.value[key]:undefined,resources.loading.value,key==='dataStreams'||key==='screens'?undefined:resources.error.value)}
function refresh(){
  exportError.value='';for(const resource of [summary,quota,trends,recent,resources])resource.clear()
  if(!readable.value)return
  void summary.reload();void quota.reload();void trends.reload();void resources.reload()
  if(deviceRead.value)void recent.reload()
}
function refreshTrends(){if(readable.value){trends.clear();exportError.value='';void trends.reload()}}
function exportChart(chart:OverviewChart){if(!trends.data.value||trends.loading.value)return;exportError.value='';try{const text=overviewChartCsv(trends.data.value,chart),url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=(chart.title||'使用统计')+'-'+trends.data.value.source+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),0)}catch(cause){exportError.value=errorMessage(cause)}}
function reloadRecent(){if(deviceRead.value){recent.clear();void recent.reload()}}
function changeRecent(value:string){if(['SEEN_5_MINUTES','SEEN_1_HOUR','SEEN_6_HOURS','SEEN_1_DAY'].includes(value))recentRange.value=value as RecentActivity}
function changeDays(value:TrendDays){if(days.value===value)return;days.value=value}
watch([()=>projectId.value,()=>session.user?.accountId,readable,()=>Object.values(access.value).join('|'),()=>props.transport],refresh,{immediate:true,flush:'sync'})
watch(recentRange,reloadRecent,{flush:'sync'})
watch(days,()=>{trends.clear();if(readable.value)void trends.reload()},{flush:'sync'})
</script>
<template>
  <main class="project-overview" aria-label="项目概要">
    <AsyncState v-if="!readable" forbidden/>
    <template v-else>
      <div class="overview-main">
        <section class="device-metrics" aria-label="设备数量">
          <router-link v-for="item in metrics" :key="item.tone" to="/devices" class="overview-panel device-metric" :class="['metric-'+item.tone,{'metric-alarm-empty':item.tone==='alarm'&&item.value===0}]"><div><p>{{item.label}}</p><strong :title="countText(item.value)">{{summary.loading.value?'—':countText(item.value)}}</strong></div><ReferenceIcon :glyph="item.glyph"/></router-link>
        </section>
        <div v-if="summary.error.value" class="inline-error" role="alert">{{errorMessage(summary.error.value)}}<button type="button" @click="summary.clear();summary.reload()">重新读取概要</button></div>
        <section class="distribution-grid" aria-label="设备分布"><OverviewRingChart v-for="ring in rings" :key="ring.key" :ring="ring"/></section>
        <section class="overview-panel recent-devices"><header><h2>最近活跃设备</h2><div class="recent-controls"><el-select :model-value="recentRange" aria-label="最近活跃设备时间范围" :disabled="!deviceRead" size="small" @update:model-value="changeRecent"><el-option v-for="range in recentRanges" :key="range.value" :value="range.value" :label="range.label"/></el-select><el-button size="small" :loading="recent.loading.value" :disabled="!deviceRead" @click="reloadRecent"><ReferenceIcon :glyph="String.fromCodePoint(0xf0450)"/>刷新</el-button></div></header><AsyncState :forbidden="!deviceRead" :loading="recent.loading.value" :error="recent.error.value"  @retry="reloadRecent"><div v-if="recent.data.value && !recent.data.value.items.length" class="recent-empty">暂无活跃设备</div><el-table v-else-if="recent.data.value" :data="recent.data.value.items.slice(0,5)" :show-header="true"><el-table-column label="设备名称" min-width="180"><template #default="{row}"><router-link :to="'/devices/'+row.id" class="device-name">{{row.name}}</router-link></template></el-table-column><el-table-column label="设备类型" min-width="140"><template #default="{row}">{{recent.data.value?.display?.[row.id]?.deviceTypeName||'—'}}</template></el-table-column><el-table-column label="在线状态" width="100" align="center"><template #default="{row}"><span :class="{'device-is-online':row.status==='ONLINE'}">{{row.status==='ONLINE'?'在线':row.status==='OFFLINE'?'离线':row.status==='INACTIVE'?'未激活':'—'}}</span></template></el-table-column><el-table-column label="活跃时间" min-width="160" align="center"><template #default="{row}">{{formatTime(recent.data.value?.display?.[row.id]?.lastDataReportAt)}}</template></el-table-column><el-table-column label="告警状态" width="100" align="center"><template #default="{row}"><span :class="{'device-is-alarming':recent.data.value?.alarms.states[row.id]==='ACTIVE'}">{{recent.data.value?.alarms.states[row.id]==='NORMAL'?'无告警':recent.data.value?.alarms.states[row.id]==='ACTIVE'?'告警中':'—'}}</span></template></el-table-column></el-table></AsyncState></section>
        <section class="usage-statistics"><header class="usage-header"><h2>使用统计</h2><div class="usage-controls"><span v-if="trends.data.value?.source==='SIMULATED'" class="source-badge">模拟统计</span><button v-for="range in ranges" :key="range.days" type="button" :class="{selected:days===range.days}" :aria-pressed="days===range.days" @click="changeDays(range.days)">{{range.label}}</button><button type="button" aria-label="刷新使用统计" :disabled="trends.loading.value" @click="refreshTrends"><ReferenceIcon :glyph="String.fromCodePoint(0xf0450)"/>刷新</button></div></header><p v-if="exportError" class="inline-error" role="alert">{{exportError}}</p><AsyncState :loading="trends.loading.value" :error="trends.error.value" @retry="refreshTrends"><div class="usage-charts"><OverviewTrendChart v-for="chart in trends.data.value?.charts" :key="chart.key" :chart="chart" :from="trends.data.value?.from" :step-hours="trends.data.value?.stepHours" :loading="trends.loading.value" @refresh="refreshTrends" @export="exportChart(chart)"/></div></AsyncState></section>
      </div>
      <aside class="overview-sidebar">
        <section class="quota-card"><header><h2 :title="currentProject?.name">{{currentProject?.name||'项目额度'}}</h2><router-link to="/project-settings" aria-label="项目额度设置"><ReferenceIcon :glyph="String.fromCodePoint(0xf0142)"/></router-link></header><dl><div v-for="row in quotaRows" :key="row.label"><dt>{{row.label}}</dt><dd :title="row.title">{{row.text}}<span v-if="['设备数','日消息量','看板数','用户数'].includes(row.label)" class="quota-progress" aria-hidden="true"><i v-if="row.progress!==undefined" :style="{width:row.progress+'%'}"/></span></dd></div></dl><div v-if="quota.error.value" class="quota-error"><button type="button" @click="quota.clear();quota.reload()">重新读取额度</button></div><div class="quota-upgrade"><h3>接入更多设备？</h3><p>开通付费版项目，获得更多资源用量和高级功能。</p><button type="button" @click="pendingTitle='项目升级'">了解详情</button></div></section>
        <section class="overview-panel resources-card"><header><h2>我的资源</h2><button type="button" aria-label="刷新项目资源" :disabled="resources.loading.value" @click="resources.clear();resources.reload()"><ReferenceIcon :glyph="String.fromCodePoint(0xf0450)"/></button></header><ul><li v-for="resource in catalog" :key="resource.label"><router-link class="resource-entry" :to="resource.path||'/custom-data-streams'"><ReferenceIcon :glyph="resource.glyph"/><span>{{resource.label}}</span><strong :title="resourceInfo(resource.key).title">{{resourceInfo(resource.key).text}}</strong></router-link></li></ul></section>
        <section class="overview-panel support-card app-card"><h2>ThingsLink App</h2><router-link to="/mobile-app/ios" class="app-download ios"><ReferenceIcon :glyph="String.fromCodePoint(0xf0035)"/><span>iOS App</span></router-link><router-link to="/mobile-app/android" class="app-download android"><ReferenceIcon :glyph="String.fromCodePoint(0xf0032)"/><span>Android App</span></router-link></section>
        <section class="overview-panel support-card"><header><h2>文档</h2><a href="https://www.thingscloud.xyz/docs/" target="_blank" rel="noopener">更多</a></header><ul><li v-for="item in overviewDocuments" :key="item.url"><a :href="item.url" target="_blank" rel="noopener">{{item.title}}</a></li></ul></section>
        <section class="overview-panel support-card"><header><h2>教程</h2><a href="https://www.thingscloud.xyz/docs/tutorials/" target="_blank" rel="noopener">更多</a></header><ul><li v-for="item in overviewTutorials" :key="item.url"><a :href="item.url" target="_blank" rel="noopener">{{item.title}}</a></li></ul></section>
      </aside>
    </template>
    <el-dialog :model-value="!!pendingTitle" :title="pendingTitle" width="min(460px,94vw)" @update:model-value="!$event&&(pendingTitle='')"><p>本模块尚未接入，实施状态请查看对应执行文档</p><template #footer><el-button @click="pendingTitle=''">关闭</el-button></template></el-dialog>
  </main>
</template>
<style scoped>
.project-overview{display:grid;grid-template-columns:calc(75% - 2.5px) minmax(0,1fr);align-items:start;gap:26px;padding:20px 30px 50px;font-size:14px;background:#fff;min-width:0}
.overview-main,.overview-sidebar{min-width:0}.overview-panel{background:#fff;border:1px solid rgba(229,231,235,.6);border-radius:4px}
.device-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px}.device-metric{height:90px;position:relative;overflow:hidden;padding:20px;border-color:#ebeef5;transition:box-shadow .3s}.device-metric:hover{box-shadow:0 2px 12px 0 rgba(0,0,0,.1)}.device-metric>div{min-width:0}
.device-metric p{font-size:14px;line-height:20px;height:20px;margin:0 0 0 65px;color:#606266;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
.device-metric strong{display:block;margin:2px 0 0 65px;font-size:24px;line-height:28px;font-weight:600;color:#1e88e5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.device-metric>.reference-icon{position:absolute;left:20px;top:20px;width:48px;height:48px;border-radius:8px;background:#3b82f6;color:#fff;font-size:25px;line-height:48px}
.metric-online>.reference-icon{background:#10b981}.metric-active>.reference-icon{background:#8b5cf6}.metric-alarm>.reference-icon{background:#f59e0b}.metric-online strong{color:#10b981}.metric-active strong{color:#8b5cf6}.metric-alarm strong{color:#f59e0b}.metric-alarm-empty strong{color:#909399}
.distribution-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 20px;margin-top:18px}
.inline-error{display:flex;gap:8px;font-size:13px;color:#f56c6c;margin:10px 0}.inline-error button{border:0;color:#1e88e5;background:none;cursor:pointer}
.recent-devices{margin-top:16px;padding:16px;overflow:hidden}.recent-devices>header,.resources-card>header{display:flex;align-items:center;justify-content:space-between}.recent-devices>header{margin-bottom:16px}
.recent-devices h2,.usage-header h2,.overview-sidebar h2{font-size:16px;line-height:24px;font-weight:600;color:#303133;margin:0}.recent-devices header a{font-size:12px;display:flex;align-items:center;gap:3px;color:#1e88e5}.recent-devices header .reference-icon{font-size:15px}
.recent-empty{height:96px;display:flex;align-items:center;justify-content:center;color:#909399;font-size:14px}.recent-devices :deep(.el-table){font-size:14px;--el-table-header-bg-color:#fff;--el-table-border-color:#ebeef5}.recent-devices :deep(.el-table__cell){padding:12px 0}.recent-devices :deep(.el-table .cell){padding-inline:10px}.recent-devices :deep(th.el-table__cell){font-weight:bold;color:#363636}
.device-name{color:#1e88e5;display:inline-flex;align-items:center;gap:8px}.device-name i{width:6px;height:6px;border-radius:50%;background:#b7bdc5;flex:none}.device-name i.online{background:#10b981}
.usage-statistics{margin-top:20px;border:1px solid rgba(229,231,235,.6);border-radius:4px;padding:16px}.usage-header{display:flex;align-items:center;justify-content:space-between;gap:15px}.usage-controls{display:flex;align-items:center;gap:0}
.usage-controls>button{font-size:12px;height:28px;min-width:39px;padding:0 8px;border:1px solid #dcdfe6;border-right:0;background:#fff;color:#606266;cursor:pointer}
.usage-controls>button:last-child{margin-left:10px;min-width:28px;border:1px solid #dcdfe6;border-radius:3px;padding:0 6px}.usage-controls>button:nth-last-child(2){border-right:1px solid #dcdfe6}.usage-controls>button.selected{color:#fff;background:#1e88e5;border-color:#1e88e5}.usage-controls .reference-icon{font-size:15px;vertical-align:middle;margin-right:4px}.usage-controls>button:disabled{opacity:.5;cursor:default}
.source-badge{font-size:11px;color:#909399;margin-right:10px;border:1px solid #e6e9ef;padding:3px 6px;border-radius:3px}.statistics-note{font-size:12px;color:#909399;margin:12px 0 0;line-height:1.7}.usage-charts{display:grid;grid-template-columns:minmax(0,1fr);align-items:start;min-width:0}.usage-charts>:deep(.overview-trend){grid-column:1;min-width:0}
.overview-sidebar{display:flex;flex-direction:column;gap:16px}.quota-card{border-radius:4px;padding:16px;background:#eaf6fc;color:#606266;min-height:436px}.quota-card header{display:flex;align-items:center;justify-content:space-between;gap:12px}.quota-card h2{font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.quota-card header a{color:#9ca3af}.shared-pool{font-size:12px;color:#909399;margin:8px 0 10px}
.quota-card dl{margin:12px 0 0}.quota-card dl>div{display:flex;align-items:center;justify-content:space-between;gap:8px;height:30px;font-size:14px;line-height:22px}.quota-card dd{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0;font-size:14px;line-height:22px;overflow-wrap:anywhere;text-align:right;max-width:62%}.quota-card dd.plan-name{font-weight:600}
.quota-progress{display:block;width:100px;height:5px;background:#ddd;border-radius:3px;margin-left:auto;overflow:hidden}.quota-progress i{display:block;height:100%;background:#1e88e5;border-radius:3px}.quota-note{font-size:12px;color:#909399;line-height:1.6;margin:14px 0 0}.quota-error{font-size:12px;line-height:1.7}.quota-error button{color:#1e88e5;background:none;border:1px solid #bedcf2;border-radius:3px;padding:4px 8px;cursor:pointer}
.resources-card{padding:16px}.resources-card header{margin-bottom:20px}.resources-card header button{background:none;border:0;color:#a6adb7;cursor:pointer;padding:0}.resources-card header .reference-icon{font-size:16px}.resources-card ul{list-style:none;margin:0;padding:0}
.resources-card li{position:relative;min-height:38px;margin-bottom:22px;font-size:14px;line-height:20px;color:#606266}.resources-card li:last-child{margin-bottom:0}.resources-card .resource-entry>.reference-icon{position:absolute;top:0;left:0;display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:6px;background:#f5f5f5;font-size:20px;line-height:36px;color:#909399}
.resources-card .resource-entry>span:not(.reference-icon){display:block;margin-left:48px;line-height:20px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.resources-card .resource-entry{display:block;margin:0;color:inherit}.resources-card .resource-entry:hover,.resources-card .resource-entry:hover>.reference-icon{color:#1e88e5}.resources-card li strong{display:block;margin:4px 0 0 48px;font-size:14px;line-height:14px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.device-is-online{color:#10b981}.device-is-alarming{color:#f59e0b}.support-card{padding:16px}.support-card header{display:flex;align-items:center;justify-content:space-between;gap:12px}.support-card header>a{font-size:14px;color:#1e88e5}.support-card ul{list-style:none;margin:12px 0 0;padding:0}.support-card li{padding:4px 0;font-size:14px;line-height:20px}.support-card li a{color:#1e88e5}.app-download{display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px;padding:8px 24px;border-radius:4px;color:#fff;background:#000;font-size:14px;line-height:24px}.app-download .reference-icon{font-size:24px}.app-download.android{background:#a3bb4d}.app-card h2{margin-bottom:16px}.app-download:hover{opacity:.8;color:#fff}
.recent-controls{display:flex;gap:10px;align-items:center}.recent-controls .el-select{width:130px}.recent-controls :deep(.el-select__wrapper){min-height:28px;height:28px;font-size:12px}.recent-controls .el-button{min-height:28px;height:28px;font-size:12px;padding:7px 10px}.recent-controls .reference-icon{font-size:14px;margin-right:4px}.quota-upgrade{text-align:center;margin-top:12px}.quota-upgrade h3{font-size:18px;line-height:28px;font-weight:700;padding:8px;margin:0;color:#000}.quota-upgrade p{font-size:14px;line-height:20px;color:#4b5563;margin:0;padding:0 12px}.quota-upgrade button{display:block;width:calc(100% - 40px);margin:12px 20px 0;padding:8px 24px;border:0;border-radius:12px;background:#3b82f6;font-size:16px;line-height:24px;color:#fff;cursor:pointer}.quota-upgrade button:hover{background:#2563eb}
@media(max-width:1199px){.device-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:991px){.project-overview{grid-template-columns:minmax(0,1fr);gap:16px}}@media(max-width:767px){.project-overview{padding:25px 15px}.usage-header{align-items:flex-start;flex-wrap:wrap;gap:12px}.usage-controls{flex-wrap:wrap;row-gap:7px}}@media(max-width:767px){.device-metrics{grid-template-columns:minmax(0,1fr)}.distribution-grid{grid-template-columns:minmax(0,1fr);gap:16px}}
</style>
