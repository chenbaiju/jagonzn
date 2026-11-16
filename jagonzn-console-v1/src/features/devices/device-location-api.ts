import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
export type DeviceLocationPoint=Schema<'DeviceLocationPointResponse'>
export type DeviceLocationScope=Readonly<{project:string;device:string}>
export type DeviceLocationIntent=DeviceLocationScope&Readonly<{longitude:number|null;latitude:number|null;version:string;key:string}>
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const maximum=9223372036854775807n
function check(scope:DeviceLocationScope){if(!uuid.test(scope.project)||!uuid.test(scope.device))throw new Error('设备坐标范围无效')}
function version(value:unknown):value is string{return typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=maximum}
function coordinate(longitude:unknown,latitude:unknown){return longitude===null&&latitude===null||typeof longitude==='number'&&typeof latitude==='number'&&Number.isFinite(longitude)&&Number.isFinite(latitude)&&longitude>=-180&&longitude<=180&&latitude>=-90&&latitude<=90}
export function decodeDeviceLocation(bytes:Uint8Array):DeviceLocationPoint{
 const value=parseDashboardRuntimeResponse(bytes)
 function number(input:StrictJsonValue|undefined){if(input===null)return null;if(input!==undefined&&isStrictJsonNumber(input))return Number(input.lexical);throw new Error('当前坐标必须是数值或明确为空')}
 const longitude=number(value.longitude),latitude=number(value.latitude)
 if(Object.keys(value).length!==3||!version(value.version)||!coordinate(longitude,latitude))throw new Error('当前坐标或版本回执不完整')
 return {longitude,latitude,version:value.version}
}
export function readDeviceLocation(scope:DeviceLocationScope,signal:AbortSignal){check(scope);return api<Uint8Array>(`${devicePath(scope.project,scope.device)}/location-point`,{signal,responseType:'bytes',maxResponseBytes:8192})}
export function prepareDeviceLocation(scope:DeviceLocationScope,point:DeviceLocationPoint,longitude:number|null,latitude:number|null):DeviceLocationIntent{
 check(scope);if(!version(point.version)||BigInt(point.version)>=maximum)throw new Error('当前坐标版本已无法继续更新，请重新核对')
 if(!coordinate(longitude,latitude))throw new Error('经纬度需要同时填写有效范围，或同时清除')
 return Object.freeze({...scope,longitude,latitude,version:point.version,key:crypto.randomUUID()})
}
export function writeDeviceLocation(intent:DeviceLocationIntent,signal:AbortSignal){
 check(intent)
 const body={longitude:intent.longitude,latitude:intent.latitude,version:intent.version} satisfies Schema<'UpdateDeviceLocationPointRequest'>
 return api<Uint8Array>(`${devicePath(intent.project,intent.device)}/location-point`,{method:'put',body,headers:{'Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:8192})
}
export function locationMatches(point:DeviceLocationPoint,expected:Pick<DeviceLocationPoint,'longitude'|'latitude'|'version'>){return point.longitude===expected.longitude&&point.latitude===expected.latitude&&point.version===expected.version}
