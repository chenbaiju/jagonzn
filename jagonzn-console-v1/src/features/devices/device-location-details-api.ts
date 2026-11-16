import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'
import {parseDashboardRuntimeResponse,isStrictJsonNumber} from '@things-link/client-contracts/dashboard/v1'
import {decodeDeviceLocation,prepareDeviceLocation,type DeviceLocationScope,type DeviceLocationPoint} from './device-location-api'
export type LocationDetails=Schema<'DeviceLocationDetailsResponse'>
export const addressFields=['address','province','city','district','street','building','unit','floor','room'] as const
export type AddressField=typeof addressFields[number]
export type LocationAddress=Pick<LocationDetails,AddressField>
export type LocationSnapshot=DeviceLocationPoint&Partial<LocationAddress>&{addressToken?:string}
export type LocationDetailsIntent=DeviceLocationScope&Readonly<{longitude:number|null;latitude:number|null;version:string;key:string;address:LocationAddress;expectedAddressToken:string}>
export function hasLocationDetails(value:LocationSnapshot):value is LocationDetails{return typeof value.addressToken==='string'&&/^[0-9a-f]{64}$/.test(value.addressToken)&&addressFields.every(name=>value[name]===null||typeof value[name]==='string')}
export function emptyLocationAddress():LocationAddress{return Object.fromEntries(addressFields.map(name=>[name,null])) as LocationAddress}
export function locationAddress(value:LocationSnapshot):LocationAddress{return Object.fromEntries(addressFields.map(name=>[name,value[name]??null])) as LocationAddress}
export function decodeLocationDetails(bytes:Uint8Array):LocationDetails{
 const row=parseDashboardRuntimeResponse(bytes),keys=['longitude','latitude','version',...addressFields,'addressToken']
 if(Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key))||typeof row.addressToken!=='string'||! /^[0-9a-f]{64}$/.test(row.addressToken))throw new Error('位置资料回执不完整，请重新读取核对')
 // 坐标继续使用原严格解码器，不把带精度包装的数值经JSON字符串化。
 const coordinate=(key:'longitude'|'latitude')=>{const value=row[key];if(value===null)return 'null';if(value!==undefined&&isStrictJsonNumber(value))return value.lexical;throw new Error('位置坐标回执无效')}
 const pointBytes=new TextEncoder().encode('{"longitude":'+coordinate('longitude')+',"latitude":'+coordinate('latitude')+',"version":'+JSON.stringify(row.version)+'}')
 const point=decodeDeviceLocation(pointBytes),address={} as LocationAddress
 for(const name of addressFields){const value=row[name];if(value!==null&&(typeof value!=='string'||[...value].length>(name==='address'?256:128)||/[\p{Cc}\p{Cs}]/u.test(value)))throw new Error('地址分项回执无效');address[name]=value as string|null}
 return {...point,...address,addressToken:row.addressToken}
}
export async function readLocationDetails(scope:DeviceLocationScope,signal:AbortSignal){return decodeLocationDetails(await api<Uint8Array>(`${devicePath(scope.project,scope.device)}/location-details`,{signal,responseType:'bytes',maxResponseBytes:16384}))}
export function prepareLocationDetails(scope:DeviceLocationScope,before:LocationDetails,longitude:number|null,latitude:number|null,address:LocationAddress):LocationDetailsIntent{
 const point=prepareDeviceLocation(scope,before,longitude,latitude)
 const checked=locationAddress({...before,...address})
 for(const name of addressFields){const value=checked[name];if(value!==null&&([...value].length>(name==='address'?256:128)||/[\p{Cc}\p{Cs}]/u.test(value)))throw new Error('请检查地址分项长度和内容')}
 return Object.freeze({...point,address:Object.freeze(checked),expectedAddressToken:before.addressToken})
}
export async function writeLocationDetails(intent:LocationDetailsIntent,signal:AbortSignal){
 const body={longitude:intent.longitude,latitude:intent.latitude,version:intent.version,...intent.address,expectedAddressToken:intent.expectedAddressToken} satisfies Schema<'UpdateDeviceLocationDetailsRequest'>
 return decodeLocationDetails(await api<Uint8Array>(`${devicePath(intent.project,intent.device)}/location-details`,{method:'put',body,headers:{'Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:16384}))
}
export function sameLocationAddress(a:LocationSnapshot,b:LocationSnapshot){return a.addressToken===b.addressToken&&addressFields.every(name=>a[name]===b[name])}
