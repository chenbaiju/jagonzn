import type {Schema} from '@/core/contracts'
import type {PageAlarmObservation} from './page-alarm-status'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
/** 只消费本次目录同快照摘要；缺项、越界、错误模型/状态或混合时刻使整次目录失败。 */
export function directoryAlarmStatus(items:Schema<'DeviceResponse'>[]|undefined,observations:Schema<'DeviceAlarmObservation'>[]|undefined):PageAlarmObservation {
 if(!Array.isArray(items)||items.length>96||!Array.isArray(observations)||items.length!==observations.length)throw new Error('目录告警摘要不完整')
 const expected=new Set(items.map(item=>item.id))
 if(expected.size!==items.length||items.some(item=>!item.id||!uuid.test(item.id)))throw new Error('目录设备身份无效')
 const result:PageAlarmObservation={states:{},unavailable:0},seen=new Set<string>()
 let observedAt:string|undefined
 for(const item of observations){
  if(!item||!item.deviceId||!expected.has(item.deviceId)||seen.has(item.deviceId)||typeof item.observedAt!=='string'||!item.observedAt||!Number.isFinite(Date.parse(item.observedAt))
   ||(observedAt!==undefined&&observedAt!==item.observedAt)||!['NORMAL','ACTIVE','UNKNOWN'].includes(item.state||''))throw new Error('目录告警摘要身份或快照无效')
  observedAt=item.observedAt;seen.add(item.deviceId)
  if(item.modelVersionId!=null&&!uuid.test(item.modelVersionId))throw new Error('目录告警模型身份无效')
  if(item.state==='UNKNOWN'){
   if(item.highestSeverity!=null)throw new Error('未知告警不能声明最高等级')
   result.unavailable++;continue
  }
  if(!item.modelVersionId)throw new Error('目录告警缺少有效模型')
  if(item.state==='ACTIVE'){
   if(!['INFO','WARNING','MINOR','MAJOR','CRITICAL'].includes(item.highestSeverity||''))throw new Error('活动告警缺少最高等级')
   result.states[item.deviceId]='ACTIVE'
  }else{
   if(item.highestSeverity!=null)throw new Error('正常设备不能声明告警等级')
   result.states[item.deviceId]='NORMAL'
  }
 }
 return result
}
