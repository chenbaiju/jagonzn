import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'
export type DeviceConnectionAccess=Schema<'DeviceConnectionAccessResponse'>
export type DeviceConnectionEndpoints=Schema<'DeviceConnectionEndpointsResponse'>
const keys=['deviceId','accessToken','projectKey','mqtt','mqttTls','http','https','tcp'] as const
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const projectKey=/^tlp1\.[A-Za-z0-9][A-Za-z0-9_-]{0,63}\.[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/
const schemes={mqtt:'mqtt:',mqttTls:'mqtts:',http:'http:',https:'https:',tcp:'tcp:'} as const
/** 接入点只能来自部署合同，不能以页面域名或原站域名代替。 */
export function connectionEndpoint(value:unknown,kind:keyof typeof schemes):URL|null{
 if(value===null)return null
 if(typeof value!=='string'||value.length>2048)throw new Error('设备接入点回执无效')
 try{const url=new URL(value);if(url.protocol!==schemes[kind]||!url.hostname||url.username||url.password||url.search||url.hash||(!['http','https'].includes(kind)&&!['','/'].includes(url.pathname)))throw new Error();return url}
 catch{throw new Error('设备接入点回执无效')}
}
/** 核对完整身份与全部字段后才允许复制，错误信息绝不携带秘密原文。 */
export function decodeConnectionAccess(value:unknown,deviceId:string):DeviceConnectionAccess{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('设备连接参数不完整')
 const record=value as Record<string,unknown>
 if(Object.keys(record).length!==keys.length||keys.some(key=>!Object.hasOwn(record,key))||record.deviceId!==deviceId||!uuid.test(deviceId)
  ||typeof record.accessToken!=='string'||!/^[0-9a-f]{64}$/.test(record.accessToken)||typeof record.projectKey!=='string'||!projectKey.test(record.projectKey))throw new Error('设备连接参数不完整或身份不匹配')
 for(const kind of Object.keys(schemes) as (keyof typeof schemes)[])connectionEndpoint(record[kind],kind)
 return record as DeviceConnectionAccess
}
export async function readConnectionAccess(project:string,device:string,signal:AbortSignal){
 const value=await api<unknown>(`${devicePath(project,device)}/connection-access`,{signal,maxResponseBytes:16384})
 return decodeConnectionAccess(value,device)
}

/** 接入点独立于秘密读取，精确核对当前设备与配置；不能接受混入的秘密字段。 */
export function decodeConnectionEndpoints(value:unknown,deviceId:string):DeviceConnectionEndpoints{
 const endpointKeys=['deviceId',...Object.keys(schemes)]
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('设备接入点参数不完整')
 const record=value as Record<string,unknown>
 if(Object.keys(record).length!==endpointKeys.length||endpointKeys.some(key=>!Object.hasOwn(record,key))||record.deviceId!==deviceId||!uuid.test(deviceId))throw new Error('设备接入点参数不完整或身份不匹配')
 for(const kind of Object.keys(schemes) as (keyof typeof schemes)[])connectionEndpoint(record[kind],kind)
 return record as DeviceConnectionEndpoints
}
export async function readConnectionEndpoints(project:string,device:string,signal:AbortSignal){
 const value=await api<unknown>(`${devicePath(project,device)}/connection-endpoints`,{signal,maxResponseBytes:16384})
 return decodeConnectionEndpoints(value,device)
}
