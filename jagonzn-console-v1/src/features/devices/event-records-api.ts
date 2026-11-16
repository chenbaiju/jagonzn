import {assertHistoryPageLocation} from './history-page-budget'
import {api} from '@/core/http'
import {devicePath} from './api'
import {decodeEvent,decodeEventPage,decodeEventNumberPage,type DeviceEventItem} from './event-decoder'
import type {Schema} from '@/core/contracts'
export type EventFilters=Readonly<{eventKey:string;from?:string;to?:string;level?:string}>
/** 选择器只读取当前设备绑定版本的标识；不会用这些定义补写历史名称。 */
export async function readEventChoices(project:string,device:string,signal:AbortSignal):Promise<string[]>{
 const binding=await api<Schema<'DeviceThingModelBindingResponse'>|undefined>(`${devicePath(project,device)}/thing-model-binding`,{signal})
 if(!binding)throw new Error('设备尚未关联物模型')
 if(binding.deviceId!==device)throw new Error('设备模型绑定身份不匹配')
 if(!binding.deviceTypeId||!binding.version?.id)return []
 if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(binding.deviceTypeId)||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(binding.version.id))throw new Error('设备模型标识无效')
 const snapshot=await api<Schema<'ThingModelSnapshotResponse'>>(`/api/v1/projects/${project}/device-types/${binding.deviceTypeId}/thing-model-versions/${binding.version.id}`,{signal})
 if(snapshot.version?.id!==binding.version.id||snapshot.version.deviceTypeId!==binding.deviceTypeId)throw new Error('设备模型版本不匹配')
 const model=snapshot.modelSnapshot as Record<string,unknown>|undefined,events=model?.events
 if(!events||typeof events!=='object'||Array.isArray(events))throw new Error('设备事件定义不可用')
 const keys=Object.keys(events)
 if(keys.some(key=>!/^[A-Za-z0-9_-]{1,64}$/.test(key)))throw new Error('设备事件定义不可用')
 return keys
}
export async function readEventPage(project:string,device:string,filters:EventFilters,cursor:string|undefined,limit:number,signal:AbortSignal){
 const bytes=await api<Uint8Array>(`${devicePath(project,device)}/events`,{query:{...filters,cursor,limit},signal,responseType:'bytes',maxResponseBytes:8*1024*1024})
 const page=decodeEventPage(bytes,device)
 if(page.items.length>limit)throw new Error('事件页超过请求条数，请重新读取。')
 return page
}
export async function readEventDetail(project:string,device:string,row:DeviceEventItem,signal:AbortSignal){
 const bytes=await api<Uint8Array>(`${devicePath(project,device)}/events/${row.messageId}`,{signal,responseType:'bytes',maxResponseBytes:4*1024*1024})
 return decodeEvent(bytes,device,row.messageId)
}

export async function readEventNumberPage(project:string,device:string,filters:EventFilters,page:number,limit:number,signal:AbortSignal){
 assertHistoryPageLocation(page,limit,100)
 const bytes=await api<Uint8Array>(`${devicePath(project,device)}/event-pages`,{query:{...filters,page,limit},signal,responseType:'bytes',maxResponseBytes:8*1024*1024})
 return decodeEventNumberPage(bytes,device,page,limit)
}
