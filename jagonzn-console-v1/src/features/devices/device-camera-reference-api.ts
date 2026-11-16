import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {typeDeviceUuid} from '../device-types/type-devices-api'

export type CameraPolicy=Readonly<Schema<'DeviceTypeCameraPolicyResponse'>>
export type CameraReference=Readonly<Schema<'DeviceCameraReferenceResponse'>>
export type CameraPolicyIntent=Readonly<{project:string;typeId:string;key:string;body:Readonly<Schema<'ChangeDeviceTypeCameraPolicyRequest'>>}>
export type CameraReferenceIntent=Readonly<{project:string;deviceId:string;key:string;expectedVersion:string;body:Readonly<Schema<'ChangeDeviceCameraReferenceRequest'>>}>
export type CameraPolicyTransport={read:(project:string,type:string,signal:AbortSignal)=>Promise<CameraPolicy>;change:(intent:CameraPolicyIntent,signal:AbortSignal)=>Promise<CameraPolicy>}
export type CameraReferenceTransport={read:(project:string,device:string,signal:AbortSignal)=>Promise<CameraReference>;change:(intent:CameraReferenceIntent,signal:AbortSignal)=>Promise<CameraReference>}
const serialPattern=/^[A-Za-z0-9_-]{1,128}$/
function invalid():never{throw new Error('摄像头资料身份、通道或版本不符合合同')}
function scope(project:string,id:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(id))invalid()}
function revision(value:unknown):value is string{return typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n}
function pair(serial:unknown,channel:unknown){return serial===null&&channel===null||typeof serial==='string'&&serialPattern.test(serial)&&typeof channel==='number'&&Number.isInteger(channel)&&channel>=1&&channel<=65535}
export function decodeCameraPolicy(value:unknown,typeId:string):CameraPolicy{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid();const r=value as Record<string,unknown>
 if(Object.keys(r).length!==3||r.deviceTypeId!==typeId||typeof r.enabled!=='boolean'||!revision(r.revision))invalid()
 return Object.freeze({deviceTypeId:typeId,enabled:r.enabled,revision:r.revision})
}
export function decodeCameraReference(value:unknown,deviceId:string):CameraReference{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid();const r=value as Record<string,unknown>,keys=['deviceId','currentDeviceTypeId','provider','state','storedSerial','storedChannel','referenceVersion','effectiveSerial','effectiveChannel']
 if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k))||r.deviceId!==deviceId||r.provider!=='EZVIZ'||!['ENABLED','DISABLED','UNAVAILABLE'].includes(String(r.state))||!revision(r.referenceVersion))invalid()
 if(r.currentDeviceTypeId!==null&&(typeof r.currentDeviceTypeId!=='string'||!typeDeviceUuid.test(r.currentDeviceTypeId))||!pair(r.storedSerial,r.storedChannel)||!pair(r.effectiveSerial,r.effectiveChannel))invalid()
 if(r.state==='ENABLED'&&(r.currentDeviceTypeId===null||r.effectiveSerial!==r.storedSerial||r.effectiveChannel!==r.storedChannel)||r.state!=='ENABLED'&&(r.effectiveSerial!==null||r.effectiveChannel!==null))invalid()
 return Object.freeze({...r}) as CameraReference
}
export function prepareCameraPolicy(project:string,typeId:string,current:CameraPolicy,enabled:boolean):CameraPolicyIntent{scope(project,typeId);decodeCameraPolicy(current,typeId);return Object.freeze({project,typeId,key:crypto.randomUUID(),body:Object.freeze({enabled,revision:current.revision})})}
export function prepareCameraReference(project:string,deviceId:string,current:CameraReference,serial:string|null,channel:string|null):CameraReferenceIntent{
 scope(project,deviceId);decodeCameraReference(current,deviceId)
 if((serial===null)!==(channel===null))invalid()
 const selectedChannel=channel===null?null:/^[1-9][0-9]{0,4}$/.test(channel)?Number(channel):invalid()
 if(!pair(serial,selectedChannel))throw new Error('请填写1至128位序列号（字母、数字、下划线或横线）和1至65535的整数通道号')
 if(serial!==null&&current.state!=='ENABLED')throw new Error('当前类型未启用摄像头资料，请读取当前配置核对')
 const unchanged=serial===current.storedSerial&&selectedChannel===current.storedChannel
 return Object.freeze({project,deviceId,key:crypto.randomUUID(),expectedVersion:String(BigInt(current.referenceVersion)+(unchanged?0n:1n)),body:Object.freeze({serial,channel:selectedChannel,expectedDeviceTypeId:current.currentDeviceTypeId,version:current.referenceVersion})})
}
export function cameraReferenceMatches(value:CameraReference,intent:CameraReferenceIntent):boolean{return value.deviceId===intent.deviceId&&value.currentDeviceTypeId===intent.body.expectedDeviceTypeId&&value.referenceVersion===intent.expectedVersion&&value.storedSerial===intent.body.serial&&value.storedChannel===intent.body.channel}
const policyPath=(p:string,t:string)=>{scope(p,t);return`/api/v1/projects/${p}/device-types/${t}/camera-policy` as const},referencePath=(p:string,d:string)=>{scope(p,d);return`/api/v1/projects/${p}/devices/${d}/camera-reference` as const}
export const cameraPolicyTransport:CameraPolicyTransport={async read(p,t,signal){return decodeCameraPolicy(await api(policyPath(p,t),{signal,maxResponseBytes:4096}),t)},async change(i,signal){return decodeCameraPolicy(await api(policyPath(i.project,i.typeId),{method:'put',headers:{'Idempotency-Key':i.key},body:i.body,signal,maxResponseBytes:4096}),i.typeId)}}
export const cameraReferenceTransport:CameraReferenceTransport={async read(p,d,signal){return decodeCameraReference(await api(referencePath(p,d),{signal,maxResponseBytes:8192}),d)},async change(i,signal){return decodeCameraReference(await api(referencePath(i.project,i.deviceId),{method:'put',headers:{'Idempotency-Key':i.key},body:i.body,signal,maxResponseBytes:8192}),i.deviceId)}}
