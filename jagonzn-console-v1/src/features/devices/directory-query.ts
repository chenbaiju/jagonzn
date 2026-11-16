import {activitySupported,type DirectoryActivity} from './directory-activity-capabilities'
import type { DirectoryQuery } from './api'
import type { CatalogFilterForm } from './DeviceCatalogToolbar.vue'
import {tagKeyError,tagValueError} from './tag-rules'
/** 表单只转换为唯一生成的目录query；未知筛选拒绝发送，不能静默忽略。 */
export function directoryQuery(keyword:string,typeId:string,filters:CatalogFilterForm,order:string,page:number,limit:number,extra:{groupId:string;tagKey:string;tagValue:string;ungrouped?:boolean},capability?:DirectoryActivity):DirectoryQuery {
  if (!['CREATED_ASC','CREATED_DESC','ACTIVE_DESC','NAME_ASC'].includes(order)) throw new Error('设备排序无效')
  const activity=filters.activity
  const activities=['SEEN_5_MINUTES','SEEN_1_HOUR','SEEN_1_DAY','NOT_SEEN_1_DAY','NOT_SEEN_3_DAYS','NOT_SEEN_7_DAYS','NEVER']
  if((activity==='ACTIVE'||activity==='INACTIVE')&&activitySupported(capability,activity))activities.push(activity)
  if (activity && !activities.includes(activity)) throw new Error('该活跃筛选的兼容合同正在补齐')
  if (filters.alarm && !['NORMAL','ACTIVE','MINOR','MAJOR','CRITICAL'].includes(filters.alarm)) throw new Error('告警筛选无效')
  if (filters.online && !['ONLINE','OFFLINE'].includes(filters.online)) throw new Error('在线状态无效')
  if (filters.kind && !['DIRECT','GATEWAY','SUB_DEVICE'].includes(filters.kind)) throw new Error('接入类型无效')
  if (filters.enabled && !['true','false'].includes(filters.enabled)) throw new Error('设备状态无效')
  if (extra.groupId && extra.ungrouped) throw new Error('指定设备组与未分组筛选不能同时使用')
  if (!!extra.tagKey !== !!extra.tagValue) throw new Error('标签名称和标签值需同时填写')
  if(extra.tagKey){const error=tagKeyError(extra.tagKey)||tagValueError(extra.tagValue);if(error)throw new Error(error)}
  if (!Number.isSafeInteger(page)||page<1||![24,48,72,96].includes(limit)) throw new Error('设备页码或每页数量无效')
  return {keyword:keyword.trim()||undefined,deviceTypeIds:typeId?[typeId]:undefined,
    alarm:filters.alarm?(filters.alarm as DirectoryQuery['alarm']):undefined,
    statuses:filters.online==='ONLINE'?['ONLINE']:filters.online==='OFFLINE'?['OFFLINE','INACTIVE']:undefined,
    activity:activity?(activity as DirectoryQuery['activity']):undefined,
    enabled:filters.enabled?filters.enabled==='true':undefined,
    deviceKinds:filters.kind?[filters.kind as 'DIRECT'|'GATEWAY'|'SUB_DEVICE']:undefined,
    groupId:extra.groupId||undefined,ungrouped:extra.ungrouped||undefined,tagKey:extra.tagKey||undefined,tagValue:extra.tagValue||undefined,
    page,limit,order:order as DirectoryQuery['order']}
}
