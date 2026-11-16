import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export type PageAlarmObservation={states:Record<string,'ACTIVE'|'NORMAL'>;unavailable:number}
/** 当前页按20项分批；整批缺项/越界/无模型或拒读时保持未知，不能从缺席推断无告警。 */
export async function pageAlarmStatus(project:string,ids:string[],signal:AbortSignal):Promise<PageAlarmObservation>{
 if(ids.length>96||new Set(ids).size!==ids.length||ids.some(id=>!uuid.test(id)))throw new Error('当前页设备身份无效')
 const result:PageAlarmObservation={states:{},unavailable:0}
 for(let offset=0;offset<ids.length;offset+=20){
  const batch=ids.slice(offset,offset+20)
  try{
   const response=await api<Schema<'DeviceAlarmStatusResponse'>|undefined>(`/api/v1/projects/${project}/alarms/device-status`,{query:{deviceId:batch},signal})
   if(!response){result.unavailable+=batch.length;continue}
   const devices=response.devices
   if(!response.observedAt||!Number.isFinite(Date.parse(response.observedAt))||!Array.isArray(devices)||devices.length!==batch.length)throw new Error('设备告警摘要不完整')
   const seen=new Set<string>()
   for(const item of devices){if(!item.deviceId||!batch.includes(item.deviceId)||seen.has(item.deviceId)||!item.modelVersionId||!uuid.test(item.modelVersionId)||!['ACTIVE','NORMAL'].includes(item.state||''))throw new Error('设备告警摘要身份不匹配');seen.add(item.deviceId)}
   for(const item of devices)result.states[item.deviceId!]=item.state!
  }catch(error){
   if(signal.aborted||(error instanceof ApiError&&[401,403,404].includes(error.status)))throw error
   result.unavailable+=batch.length
  }
 }
 return result
}
export function alarmLabel(state:'ACTIVE'|'NORMAL'|undefined){return state==='NORMAL'?'无告警':state==='ACTIVE'?'告警中':'告警状态未知'}
