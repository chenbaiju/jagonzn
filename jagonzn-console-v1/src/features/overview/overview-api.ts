import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {readDeviceTypeDirectory} from '../device-types/api'
import {decodeTypeDevices} from '../device-types/type-devices-api'
import {devicesApi,type DirectoryQuery} from '../devices/api'
import {alarmRuleDirectoryApi} from '../alarms/alarm-rule-directory-api'
import {alarmApi} from '../alarms/api'
import {otaReadTransport} from '../ota/ota-read-api'
import {listTasks,listRules,listAutomations,listScenes} from '../rules/api'
import {decodeUserApplicationPage} from '../user-applications/user-application-api'
import {completeResourceCount,terminalResourceCount,uncounted,failedResourceCount} from './overview-data'

export type Overview = Schema<'OverviewResponse'>
export type OverviewTrends = Schema<'OverviewTrendsResponse'>
export type OverviewChart = Schema<'OverviewTrendChart'>
export type OverviewQuota = Schema<'ProjectQuotaOverviewResponse'>
export type RecentActivity=Extract<NonNullable<DirectoryQuery['activity']>,'SEEN_5_MINUTES'|'SEEN_1_HOUR'|'SEEN_6_HOURS'|'SEEN_1_DAY'>
export type TrendDays = 1|3|7|15|30
export type ResourceKey = 'deviceTypes'|'dataStreams'|'deviceGroups'|'dashboards'|'screens'|'messageRules'|'tasks'|'alarmRules'|'automations'|'scenes'|'notificationGroups'|'applications'|'userApplications'|'users'|'firmwares'
export type ResourceAccess = Readonly<Partial<Record<ResourceKey,boolean>>>
export type ResourceCount = Readonly<{total?:string;state:'AVAILABLE'|'DENIED'|'ERROR'|'UNCOUNTED';reason?:string}>
export type ResourceCounts = Readonly<Partial<Record<ResourceKey,ResourceCount>>>
export type RecentDevices = Pick<ReturnType<typeof decodeTypeDevices>,'items'|'display'|'alarms'>
export type OverviewTransport = {
  summary:(project:string,signal:AbortSignal)=>Promise<Overview>
  trends:(project:string,days:TrendDays,signal:AbortSignal)=>Promise<OverviewTrends>
  quota:(project:string,signal:AbortSignal)=>Promise<OverviewQuota>
  recent:(project:string,signal:AbortSignal,activity?:RecentActivity)=>Promise<RecentDevices>
  resources:(project:string,access:ResourceAccess,signal:AbortSignal)=>Promise<ResourceCounts>
}
function base(project:string){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(project))throw new Error('请选择当前项目');return '/api/v1/projects/'+project}
function total(value:unknown):string{if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(value)||BigInt(value).toString()!==value||BigInt(value)>9223372036854775807n)throw new Error('资源总数缺失');return value}
/** 只读固定窗口；缺桶保留null，模拟来源不转成真实用量。 */
export function decodeOverviewTrends(value:OverviewTrends,project:string,days:TrendDays):OverviewTrends{
  const from=Date.parse(value.from||''),to=Date.parse(value.to||''),step=value.stepHours
  if(value.projectId!==project||!['OBSERVED','SIMULATED','NONE'].includes(value.source||'')||!Number.isFinite(from)||!Number.isFinite(to)||to-from!==days*86400000||!step||!Number.isSafeInteger(step)||step<1||!Array.isArray(value.charts)||value.charts.length!==12)throw new Error('使用统计窗口或项目不符')
  const length=(to-from)/(step*3600000),keys=new Set<string>()
  if(!Number.isSafeInteger(length)||length<1||length>720)throw new Error('使用统计分桶不完整')
  for(const chart of value.charts){
    if(!chart.key||keys.has(chart.key)||!chart.title||!['COUNT','DEVICES','BYTES'].includes(chart.unit||'')||!['SUM','LAST'].includes(chart.aggregation||'')||!Array.isArray(chart.series))throw new Error('使用统计图表不完整')
    keys.add(chart.key)
    const seriesKeys=new Set<string>()
    for(const series of chart.series){
      if(!series.key||seriesKeys.has(series.key)||!series.label||!Array.isArray(series.values)||series.values.length!==length||series.values.some(item=>item!==null&&(!Number.isSafeInteger(item)||item<0))||value.source==='NONE'&&series.values.some(item=>item!==null))throw new Error('使用统计序列不完整')
      seriesKeys.add(series.key)
    }
  }
  return value
}
export const overviewTransport:OverviewTransport={
  summary:(project,signal)=>{base(project);return api<Overview>(`/api/v1/projects/${project}/overview`,{signal})},
  async trends(project,days,signal){
    base(project);if(![1,3,7,15,30].includes(days))throw new Error('统计时间范围无效')
    return decodeOverviewTrends(await api<OverviewTrends>(`/api/v1/projects/${project}/overview/trends`,{query:{days},signal}),project,days)
  },
  async quota(project,signal){base(project);const value=await api<OverviewQuota>(`/api/v1/projects/${project}/quota`,{signal});if(value.projectId!==project)throw new Error('额度所属项目不符');return value},
  async recent(project,signal,activity='SEEN_1_DAY'){base(project);if(!['SEEN_5_MINUTES','SEEN_1_HOUR','SEEN_6_HOURS','SEEN_1_DAY'].includes(activity))throw new Error('活跃时间范围无效');return decodeTypeDevices(await devicesApi.directory(project,{page:1,limit:24,order:'ACTIVE_DESC',activity},signal),{page:1,limit:24})},
  async resources(project,access,signal){
    base(project)
    // 有total直接用；完整数组或明确的完整首末页才可计数，不续游标。
    const readers={
      deviceTypes:async()=>({state:'AVAILABLE',total:total((await readDeviceTypeDirectory(project,{page:1,limit:24},signal)).total)} as const),
      alarmRules:async()=>({state:'AVAILABLE',total:total((await alarmRuleDirectoryApi.page(project,{page:'1',limit:'1'},signal)).total)} as const),
      notificationGroups:async()=>({state:'AVAILABLE',total:total((await alarmApi.groupDirectory(project,1,24,signal)).total)} as const),
      firmwares:async()=>({state:'AVAILABLE',total:total((await otaReadTransport.directory(project,{order:'DESC',limit:1},signal)).total)} as const),
      deviceGroups:async()=>completeResourceCount(await devicesApi.groups(project,signal)),
      tasks:async()=>completeResourceCount(await listTasks(project,signal)),
      messageRules:async()=>terminalResourceCount(await listRules(project,{limit:20},signal),false,20),
      automations:async()=>terminalResourceCount(await listAutomations(project,{limit:20},signal),false,20),
      scenes:async()=>terminalResourceCount(await listScenes(project,{limit:20},signal),false,20),
      dashboards:async()=>terminalResourceCount(await api<Schema<'CursorPageDashboardCatalogResponse'>>(`/api/v1/projects/${project}/dashboards`,{query:{limit:20},signal}),true,20),
      applications:async()=>terminalResourceCount(await api<Schema<'CursorPageApplicationCatalogResponse'>>(`/api/v1/projects/${project}/applications`,{query:{limit:20},signal}),true,20),
      userApplications:async()=>terminalResourceCount(await api<Schema<'CursorPageUserApplicationResponse'>>(`/api/v1/projects/${project}/user-applications`,{query:{limit:24},signal}),true,24,decodeUserApplicationPage),
      users:async()=>terminalResourceCount(await api<Schema<'CursorPageEndUserResponse'>>(`/api/v1/projects/${project}/end-users`,{query:{limit:20},signal}),true,20)
    }
    const keys=Object.keys(readers) as (keyof typeof readers)[]
    const rows=await Promise.all(keys.map(async key=>{
      if(!access[key])return [key,{state:'DENIED',reason:'当前账号没有读取该资源的权限'}] as const
      try{return [key,await readers[key]()] as const}
      catch(cause){return [key,failedResourceCount(cause)] as const}
    }))
    return {...Object.fromEntries(rows),dataStreams:uncounted('当前只有设备类型内的数据流定义，没有项目级汇总'),screens:uncounted('当前未提供大屏目录统计接口')} as ResourceCounts
  }
}
