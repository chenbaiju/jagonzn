import {api,assertIdentity,identityEpoch} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {businessKey} from './reference-profile'

export type DeviceOnboardingCode=Readonly<Schema<'DeviceOnboardingCodeResponse'>>
const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
const fields=['deviceId','deviceTypeId','codeMode','code','allowUserAdd','previouslyConnected']
function invalid():never{throw new Error('设备码资料不完整，请重新读取')}
/** 保留数字码的前导零；只有当前查找字段可以进入二维码，不能混入凭据或定位载荷。 */
export function parseDeviceOnboardingCode(value:unknown,device:string):DeviceOnboardingCode{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid()
 const v=value as Record<string,unknown>
 if(Object.keys(v).length!==fields.length||fields.some(k=>!Object.hasOwn(v,k))||v.deviceId!==device||!uuid.test(device)
  ||v.deviceTypeId!==null&&(typeof v.deviceTypeId!=='string'||!uuid.test(v.deviceTypeId))
  ||v.codeMode!=='AUTO'&&v.codeMode!=='BUSINESS_KEY'||typeof v.allowUserAdd!=='boolean'||typeof v.previouslyConnected!=='boolean')invalid()
 if(v.codeMode==='AUTO'&&(typeof v.code!=='string'||!/^\d{8}$/.test(v.code)))invalid()
 if(v.codeMode==='BUSINESS_KEY'&&v.code!==null){
  if(typeof v.code!=='string')invalid()
  try{if(businessKey(v.code)!==v.code)invalid()}catch{invalid()}
 }
 return Object.freeze(v as DeviceOnboardingCode)
}
/** 只读取当前码；无签发、轮换、认领或类型策略写入。 */
export async function readDeviceOnboardingCode(project:string,device:string,signal:AbortSignal){
 if(!uuid.test(project)||!uuid.test(device))invalid()
 const epoch=identityEpoch()
 const value=await api<unknown>(`/api/v1/projects/${project}/devices/${device}/onboarding-code`,{signal,maxResponseBytes:8192})
 assertIdentity(epoch)
 return parseDeviceOnboardingCode(value,device)
}
