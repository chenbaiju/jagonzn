import type {ComputedRef,InjectionKey} from 'vue'
import {devicesApi} from '@/features/devices/api'
import {typeProfileTransport,type TypeProfile} from '../device-types/profile-api'
import {dataStreamTransport,type DataStreamItem} from '../device-types/data-stream-publication-api'
import {deviceSourceMembers,sameDeviceSource,type RuleDeviceSourceContract} from './rule-source-api'
import {definitionUuid} from './device-task-definition-port'
export type DeviceDataSourceMember={deviceId:string;name:string;deviceTypeId:string;profile:TypeProfile;streams:readonly DataStreamItem[]}
export type DeviceDataSourceContext={deviceSource:RuleDeviceSourceContract;members:readonly DeviceDataSourceMember[]}
/** DEVICE previews consume only an explicitly chosen real member. TYPE keeps its existing preview path. */
export const deviceDataSourceContextKey:InjectionKey<ComputedRef<DeviceDataSourceContext|undefined>>=Symbol('device-data-source-context')
export async function readDeviceDataSourceContext(projectId:string,deviceSource:RuleDeviceSourceContract,signal?:AbortSignal):Promise<DeviceDataSourceContext>{
 if(deviceSource.kind!=='DEVICE'||!definitionUuid(projectId))throw new Error('请选择完整设备来源')
 const activeSignal=signal??new AbortController().signal,ids=deviceSourceMembers(deviceSource),rows=new Map<string,DeviceDataSourceMember>(),types=new Map<string,Promise<{profile:TypeProfile;streams:readonly DataStreamItem[]}>>();let cursor=0
 await Promise.all(Array.from({length:Math.min(ids.length,4)},async()=>{while(cursor<ids.length){activeSignal.throwIfAborted();const deviceId=ids[cursor++]!,device=await devicesApi.read(projectId,deviceId,activeSignal);if(device.id?.toLowerCase()!==deviceId||!device.name?.trim()||!definitionUuid(device.deviceTypeId)||'projectId'in device&&device.projectId!==projectId)throw new Error('来源设备或真实类型读取不完整');const deviceTypeId=device.deviceTypeId.toLowerCase();let type=types.get(deviceTypeId);if(!type){type=(async()=>{const profile=await typeProfileTransport.read(projectId,deviceTypeId,activeSignal),publication=await dataStreamTransport.read(projectId,deviceTypeId,activeSignal);if(profile.type.id!==deviceTypeId||profile.type.projectId!==projectId)throw new Error('来源实际类型与当前项目不符');return{profile,streams:publication.publication?.definition.streams.filter(stream=>!stream.disabled)??[]}})();types.set(deviceTypeId,type)}rows.set(deviceId,{deviceId,name:device.name,deviceTypeId,...await type})}}))
 return{deviceSource,members:ids.map(id=>rows.get(id)!)}
}
/** Suggestions/format agreement only; ownership and templates remain in every member's real publication. */
export function commonDeviceDataStreams(context:DeviceDataSourceContext):readonly DataStreamItem[]{
 const streams=context.members[0]?.streams??[]
 return streams.filter(stream=>context.members.every(member=>member.streams.some(row=>row.identifier===stream.identifier&&row.format===stream.format)))
}
export function deviceDataSourceProfile(context:DeviceDataSourceContext){
 const kinds=new Set(context.members.map(row=>row.profile.type.deviceKind)),protocols=new Set(context.members.map(row=>row.profile.type.payloadProtocol))
 return{deviceKind:kinds.size===1?[...kinds][0]!:'MIXED',payloadProtocol:protocols.size===1?[...protocols][0]!:'MIXED'}
}

/** 为输入约定核对每个明确来源的真实发布流，不从共同建议列表取第一项推定模板。 */
export function deviceDataInputStreams(context:DeviceDataSourceContext|undefined,expected:RuleDeviceSourceContract,identifier:string):readonly DataStreamItem[]{
 const ids=deviceSourceMembers(expected)
 if(!context||!sameDeviceSource(context.deviceSource,expected)||context.members.length!==ids.length||context.members.some((member,index)=>member.deviceId!==ids[index]))throw new Error('请重新读取完整设备来源与实际输入流')
 const streams=context.members.map(member=>member.streams.find(stream=>stream.identifier===identifier))
 if(streams.some(stream=>!stream)||streams.some(stream=>stream!.format!==streams[0]!.format))throw new Error('来源设备没有共同发布相同格式的输入流')
 return streams as readonly DataStreamItem[]
}
