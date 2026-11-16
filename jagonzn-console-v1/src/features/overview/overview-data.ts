import {ApiError} from '@/core/http'
import type {OverviewQuota,ResourceCount} from './overview-api'
import {countText,validCount} from './overview-model'
export const uncounted=(reason:string):ResourceCount=>({state:'UNCOUNTED',reason})
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** 只适用于正式合同声明的完整数组；层级页和游标页不能调用此计数。 */
export function completeResourceCount(value:unknown):ResourceCount{
  if(!Array.isArray(value)||value.some(row=>!row||typeof row!=='object'||typeof row.id!=='string'||!uuid.test(row.id))||new Set(value.map(row=>row.id)).size!==value.length)return uncounted('完整目录的身份资料不完整，无法确定资源总数')
  return {state:'AVAILABLE',total:String(value.length),reason:'当前项目完整目录的有效资源数'}
}
/** 只认明确的末页声明，不将缺失/畸形游标、首个非末页或items前缀冒成总量。 */
export function terminalResourceCount(value:unknown,withHasMore:boolean,limit:number,decode?:(value:unknown)=>unknown):ResourceCount{
  if(!value||typeof value!=='object'||Array.isArray(value))return uncounted('目录分页资料不完整')
  const row=value as Record<string,unknown>
  if(!Array.isArray(row.items)||row.items.length>limit||!Object.hasOwn(row,'nextCursor'))return uncounted('目录没有完整、明确的末页声明')
  if(row.nextCursor!==null)return uncounted(typeof row.nextCursor==='string'&&row.nextCursor.length>0?'目录还有后续页；当前读取不扫描游标，尚无全局总数':'目录游标格式不完整，不能确定资源总数')
  if(Object.hasOwn(row,'hasMore')&&row.hasMore!==false)return uncounted('目录末页声明相互冲突，不能确定资源总数')
  if(withHasMore&&row.hasMore!==false)return uncounted('目录分页状态不完整，不能确定资源总数')
  if(decode)decode(value)
  return completeResourceCount(row.items)
}
export function failedResourceCount(error:unknown):ResourceCount{return error instanceof ApiError&&[401,403].includes(error.status)?{state:'DENIED',reason:'当前账号没有读取该资源的权限'}:{state:'ERROR',reason:'资源目录读取失败，请刷新后重试'}}
export function resourceDisplay(value:ResourceCount|undefined,loading=false,error?:unknown):Readonly<{text:string;title:string}>{
  if(error)value=failedResourceCount(error)
  if(loading&&!value)return {text:'读取中',title:'正在读取当前资源统计'}
  if(value?.state==='DENIED')return {text:'无权限',title:value.reason||'当前账号没有读取该资源的权限'}
  if(value?.state==='ERROR')return {text:'读取失败',title:value.reason||'资源统计读取失败'}
  if(value?.state==='AVAILABLE'&&typeof value.total==='string'&&/^(0|[1-9][0-9]*)$/.test(value.total)&&BigInt(value.total).toString()===value.total)return {text:countText(value.total),title:value.reason||'当前项目已确认的资源总数'}
  return {text:'未统计',title:value?.reason||'当前读取面尚未提供该项资源总数'}
}
export type OverviewQuotaRow=Readonly<{label:string;text:string;title:string;progress?:number}>
/** 已用与上限逐项保留计量范围；项目目录数量不计算租户共享池占用率。 */
export function overviewQuotaRows(quota:OverviewQuota|undefined,error?:unknown,loading=false):readonly OverviewQuotaRow[]{
  const missing=resourceDisplay(undefined,loading,error),metric=quota?.tenantSharedPool?.deviceCount
  const name=quota?.planSummary?.effectivePlan?.name||quota?.planSummary?.subscribedPlan?.name
  const used=validCount(metric?.used)?countText(metric.used):missing.text
  const limit=metric?.limit===null?'不限':validCount(metric?.limit)?countText(metric.limit):missing.text
  function capacity(label:string,code:string):OverviewQuotaRow{
    if(error)return {label,...missing}
    const dimension=quota?.planSummary?.effectiveQuotaDimensions?.find(row=>row.code===code&&row.unit==='COUNT')
    const maximum=validCount(dimension?.value)?countText(dimension.value):undefined
    return {label,text:maximum?'未统计 / '+maximum:missing.text,title:maximum?'租户共享上限为'+maximum+'，共享池已用未提供；当前项目目录数量仅在“我的资源”展示，不冒充共享池占用':'本次响应未提供该项共享池已用与运行时上限'}
  }
  return [
    {label:'版本',text:error?missing.text:name||missing.text,title:error?missing.title:name?'本次额度响应提供的套餐名称':'本次额度响应未提供套餐摘要'},
    {label:'设备数',text:error?missing.text:used===missing.text&&limit===missing.text?missing.text:used+' / '+limit,title:error?missing.title:'所属租户共享池的已用设备数与上限，非本项目独享额度',...(!error&&validCount(metric?.used)&&validCount(metric?.limit)&&metric.limit>0?{progress:Math.min(100,metric.used/metric.limit*100)}:{})},
    {label:'日消息量',text:missing.text,title:error?missing.title:'现有上行、下行消息分别计量，没有单一合并的消息池统计'},
    capacity('看板数','DASHBOARDS_MAX'),capacity('用户数','END_USERS_MAX'),
    ...['告警邮件余额','告警短信余额','告警电话余额'].map(label=>({label,text:missing.text,title:error?missing.title:'当前读取面未提供此通知渠道的可用余额；投递次数不是余额'}))
  ]
}
