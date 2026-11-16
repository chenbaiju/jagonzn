import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {typeDeviceUuid} from '../device-types/type-devices-api'
// 坐标身份与状态直接派生正式合同；数字视图保留原JSON词法。
export type PlanarPolicy=Readonly<Schema<'DeviceTypePlanarPolicyResponse'>>
type PlanarCoordinates='storedX'|'storedY'|'effectiveX'|'effectiveY'
export type PlanarPoint=Readonly<Omit<Schema<'DevicePlanarPositionResponse'>,PlanarCoordinates>&Record<PlanarCoordinates,string|null>>
export type PlanarPolicyIntent=Readonly<{project:string;typeId:string;key:string;body:Readonly<Schema<'ChangeDeviceTypePlanarPolicyRequest'>>}>
export type PlanarPointIntent=Readonly<Omit<Schema<'ChangeDevicePlanarPositionRequest'>,'x'|'y'>&{project:string;deviceId:string;key:string;x:string|null;y:string|null;rawBody:string}>
export type PlanarPolicyTransport={read:(project:string,type:string,signal:AbortSignal)=>Promise<PlanarPolicy>;change:(intent:PlanarPolicyIntent,signal:AbortSignal)=>Promise<PlanarPolicy>}
export type PlanarPointTransport={read:(project:string,device:string,signal:AbortSignal)=>Promise<PlanarPoint>;change:(intent:PlanarPointIntent,signal:AbortSignal)=>Promise<PlanarPoint>}
function invalid():never{throw new Error('平面坐标身份、数值或版本不符合合同')}
function scope(project:string,id:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(id))invalid()}
function revision(value:unknown):value is string{return typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n}
/** 只以十进制位和整数比较验证，坐标不会经过JavaScript Number。 */
export function planarCoordinate(input:string):string{
 const match=/^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(input)
 if(!match||input.length>128)invalid()
 let digits=(match[2]!+(match[3]||'')).replace(/^0+/,'');if(!digits)return '0'
 const trailing=digits.length-digits.replace(/0+$/,'').length;digits=digits.slice(0,digits.length-trailing)
 const exponent=BigInt(match[4]||'0')-BigInt((match[3]||'').length)+BigInt(trailing),magnitude=BigInt(digits.length)+exponent
 if(exponent< -9n||magnitude>10n||magnitude===10n&&(digits!=='1'||exponent!==9n))invalid()
 const point=Number(BigInt(digits.length)+exponent)
 return(match[1]||'')+(point<=0?'0.'+'0'.repeat(-point)+digits:point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point))
}
function number(value:StrictJsonValue|undefined):string|null{if(value===null)return null;if(value!==undefined&&isStrictJsonNumber(value))return planarCoordinate(value.lexical);return invalid()}
export function decodePlanarPolicy(value:unknown,typeId:string):PlanarPolicy{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid();const row=value as Record<string,unknown>
 if(Object.keys(row).length!==3||row.deviceTypeId!==typeId||typeof row.enabled!=='boolean'||!revision(row.revision))invalid()
 return Object.freeze({deviceTypeId:typeId,enabled:row.enabled,revision:row.revision})
}
export function decodePlanarPoint(bytes:Uint8Array,deviceId:string):PlanarPoint{
 const r=parseDashboardRuntimeResponse(bytes),keys=['deviceId','currentDeviceTypeId','state','coordinateSystem','unit','storedFrameDeviceTypeId','storedX','storedY','positionVersion','effectiveX','effectiveY']
 if(Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k))||r.deviceId!==deviceId||r.coordinateSystem!=='TYPE_LOCAL_CARTESIAN'||r.unit!=='UNSPECIFIED'||!['MANUAL','DISABLED','UNAVAILABLE'].includes(String(r.state))||!revision(r.positionVersion))invalid()
 if(r.currentDeviceTypeId!==null&&(typeof r.currentDeviceTypeId!=='string'||!typeDeviceUuid.test(r.currentDeviceTypeId))||r.storedFrameDeviceTypeId!==null&&(typeof r.storedFrameDeviceTypeId!=='string'||!typeDeviceUuid.test(r.storedFrameDeviceTypeId)))invalid()
 const x=number(r.storedX),y=number(r.storedY),ex=number(r.effectiveX),ey=number(r.effectiveY)
 if((x===null)!==(y===null)||(x===null)!==(r.storedFrameDeviceTypeId===null)||(ex===null)!==(ey===null)||r.state!=='MANUAL'&&(ex!==null||ey!==null)||r.state==='MANUAL'&&(ex!==x||ey!==y||x!==null&&r.currentDeviceTypeId!==r.storedFrameDeviceTypeId))invalid()
 return Object.freeze({deviceId,currentDeviceTypeId:r.currentDeviceTypeId as string|null,state:r.state as PlanarPoint['state'],coordinateSystem:'TYPE_LOCAL_CARTESIAN',unit:'UNSPECIFIED',storedFrameDeviceTypeId:r.storedFrameDeviceTypeId as string|null,storedX:x,storedY:y,positionVersion:r.positionVersion,effectiveX:ex,effectiveY:ey})
}
export function preparePlanarPolicy(project:string,typeId:string,current:PlanarPolicy,enabled:boolean):PlanarPolicyIntent{scope(project,typeId);decodePlanarPolicy(current,typeId);return Object.freeze({project,typeId,key:crypto.randomUUID(),body:Object.freeze({enabled,revision:current.revision})})}
export function preparePlanarPoint(project:string,deviceId:string,current:PlanarPoint,x:string|null,y:string|null):PlanarPointIntent{
 scope(project,deviceId);if(current.deviceId!==deviceId||!revision(current.positionVersion)||(x===null)!==(y===null))invalid()
 const px=x===null?null:planarCoordinate(x),py=y===null?null:planarCoordinate(y)
 if(px!==null&&(!current.currentDeviceTypeId||current.state==='DISABLED'||current.state==='UNAVAILABLE'&&current.storedFrameDeviceTypeId===current.currentDeviceTypeId))throw new Error('当前类型尚未启用平面坐标，或保留点属于其它空间；请先核对当前类型策略')
 // 旧空间点允许显式重新赋到当前类型；后端仍在类型锁内核对真实启用状态。
 const expectedDeviceTypeId=current.currentDeviceTypeId,version=current.positionVersion
 const rawBody=`{"x":${px??'null'},"y":${py??'null'},"expectedDeviceTypeId":${JSON.stringify(expectedDeviceTypeId)},"version":${JSON.stringify(version)}}`
 return Object.freeze({project,deviceId,key:crypto.randomUUID(),expectedDeviceTypeId,version,x:px,y:py,rawBody})
}
export function planarPointMatches(point:PlanarPoint,intent:PlanarPointIntent):boolean{return point.deviceId===intent.deviceId&&point.currentDeviceTypeId===intent.expectedDeviceTypeId&&point.positionVersion===String(BigInt(intent.version)+1n)&&point.storedX===intent.x&&point.storedY===intent.y&&point.storedFrameDeviceTypeId===(intent.x===null?null:intent.expectedDeviceTypeId)}
const policyPath=(p:string,t:string)=>{scope(p,t);return`/api/v1/projects/${p}/device-types/${t}/planar-policy` as const},pointPath=(p:string,d:string)=>{scope(p,d);return`/api/v1/projects/${p}/devices/${d}/planar-position` as const}
export const planarPolicyTransport:PlanarPolicyTransport={async read(p,t,signal){return decodePlanarPolicy(await api(policyPath(p,t),{signal,maxResponseBytes:4096}),t)},async change(i,signal){return decodePlanarPolicy(await api(policyPath(i.project,i.typeId),{method:'put',headers:{'Idempotency-Key':i.key},body:i.body,signal,maxResponseBytes:4096}),i.typeId)}}
export const planarPointTransport:PlanarPointTransport={async read(p,d,signal){return decodePlanarPoint(await api<Uint8Array>(pointPath(p,d),{signal,responseType:'bytes',maxResponseBytes:8192}),d)},async change(i,signal){return decodePlanarPoint(await api<Uint8Array>(pointPath(i.project,i.deviceId),{method:'put',headers:{'Idempotency-Key':i.key,'Content-Type':'application/json'},rawBody:i.rawBody,signal,responseType:'bytes',maxResponseBytes:8192}),i.deviceId)}}
