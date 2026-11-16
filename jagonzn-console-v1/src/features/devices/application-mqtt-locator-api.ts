import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'

export type DeviceApplicationMqttLocator=Schema<'DeviceApplicationMqttLocatorResponse'>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const tokenShape=/^tlv1_[A-Za-z0-9_-]{22}$/
const invalid=()=>new Error('设备公开定位符不完整或身份不匹配')

/** 只核对服务器已返回的定位符，不在缺失或失败时构造替代值。 */
export function decodeApplicationMqttLocator(value:unknown,deviceId:string):DeviceApplicationMqttLocator {
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw invalid()
 const record=value as Record<string,unknown>
 if(Object.keys(record).length!==2||!Object.hasOwn(record,'deviceId')||!Object.hasOwn(record,'deviceViewToken')
  ||!uuid.test(deviceId)||record.deviceId!==deviceId||typeof record.deviceViewToken!=='string'||!tokenShape.test(record.deviceViewToken))throw invalid()
 const token=record.deviceViewToken
 try {
  const bytes=atob(token.slice(5).replace(/-/g,'+').replace(/_/g,'/')+'==')
  if(bytes.length!==16||btoa(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')!==token.slice(5))throw invalid()
  const hex=Array.from(bytes,char=>char.charCodeAt(0).toString(16).padStart(2,'0')).join('')
  if(hex!==deviceId.replace(/-/g,''))throw invalid()
 } catch { throw invalid() }
 return {deviceId,deviceViewToken:token}
}

export async function readApplicationMqttLocator(project:string,device:string,signal:AbortSignal) {
 const value=await api<unknown>(`${devicePath(project,device)}/application-mqtt-locator`,{signal,maxResponseBytes:16384})
 return decodeApplicationMqttLocator(value,device)
}
