import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject} from '@things-link/client-contracts/dashboard/v1'

export type DeviceAlarmAllowance=Schema<'ConsoleDeviceAlarmAllowanceResponse'>
export type DeviceAlarmAllowanceIntent=Readonly<{project:string;device:string;rule:string;version:number;previousAllowed:boolean;allowed:boolean}>
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
export const MAX_ALLOWANCE_VERSION=2147483647
const fail=():never=>{throw new Error('设备规则允许状态或版本资料无效，请重新读取核对')}
function validState(allowed:unknown,version:unknown){return typeof allowed==='boolean'&&typeof version==='number'&&Number.isInteger(version)&&version>=0&&version<=MAX_ALLOWANCE_VERSION&&(version!==0||allowed)}
function path(project:string,device:string,rule:string){if(!uuid.test(project)||!uuid.test(device)||!uuid.test(rule))fail();return `/api/v1/projects/${project}/console/devices/${device}/alarm-rules/${rule}/allowance` as const}
/** 独立允许状态只接受当前设备/规则的四字段事实，缺字段不能补成允许。 */
export function decodeDeviceAlarmAllowance(bytes:Uint8Array,device:string,rule:string):DeviceAlarmAllowance{
 if(bytes.byteLength>4096||!uuid.test(device)||!uuid.test(rule))fail()
 const parsed=parseDashboardRuntimeResponse(bytes)
 const fields=['deviceId','ruleId','allowed','version']
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||isStrictJsonNumber(parsed)||Object.keys(parsed).length!==4||fields.some(key=>!Object.hasOwn(parsed,key)))fail()
 const row=parsed as StrictJsonObject
 if(row.deviceId!==device||row.ruleId!==rule)return fail()
 const rawVersion=row.version
 if(!isStrictJsonNumber(rawVersion)||!/^(0|[1-9][0-9]*)$/.test(rawVersion.lexical))return fail()
 const version=Number(rawVersion.lexical)
 if(!validState(row.allowed,version))fail()
 return {deviceId:device,ruleId:rule,allowed:row.allowed as boolean,version}
}
export async function readDeviceAlarmAllowance(project:string,device:string,rule:string,signal:AbortSignal){
 const bytes=await api<Uint8Array>(path(project,device,rule),{signal,responseType:'bytes',maxResponseBytes:4096})
 return decodeDeviceAlarmAllowance(bytes,device,rule)
}
/** 保留用户看到的独立版本；不能用重新读取的新版本静默替换原CAS前提。 */
export function prepareDeviceAlarmAllowance(project:string,snapshot:DeviceAlarmAllowance,allowed:boolean):DeviceAlarmAllowanceIntent{
 path(project,snapshot.deviceId,snapshot.ruleId)
 if(!validState(snapshot.allowed,snapshot.version)||snapshot.version===MAX_ALLOWANCE_VERSION||typeof allowed!=='boolean')fail()
 return Object.freeze({project,device:snapshot.deviceId,rule:snapshot.ruleId,version:snapshot.version,previousAllowed:snapshot.allowed,allowed})
}
/** 同值不升版，真实变化恰升一版；坏2xx保留未知，不自动重传。 */
export function verifyDeviceAlarmAllowanceWrite(bytes:Uint8Array,intent:DeviceAlarmAllowanceIntent){
 const state=decodeDeviceAlarmAllowance(bytes,intent.device,intent.rule)
 if(state.allowed!==intent.allowed||state.version!==intent.version+(intent.allowed===intent.previousAllowed?0:1))fail()
 return state
}
export async function submitDeviceAlarmAllowance(intent:DeviceAlarmAllowanceIntent,signal:AbortSignal){
 const url=path(intent.project,intent.device,intent.rule)
 if(!validState(intent.previousAllowed,intent.version)||intent.version===MAX_ALLOWANCE_VERSION||typeof intent.allowed!=='boolean')fail()
 const body={version:intent.version,allowed:intent.allowed} satisfies Schema<'ConsoleDeviceAlarmAllowanceRequest'>
 const bytes=await api<Uint8Array>(url,{method:'put',body,signal,responseType:'bytes',maxResponseBytes:4096})
 return verifyDeviceAlarmAllowanceWrite(bytes,intent)
}
