import type {DirectoryMapContext} from './directory-amap-context-api'
import type {DirectoryMapRow,DirectoryBaseMap} from './directory-map'
export const frameChannel='thingslink-directory-map/1' as const
export const uuidV4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export type FrameConfiguration=Readonly<Required<Pick<DirectoryMapContext,'contextId'|'serviceHost'|'publicKey'|'jsApiVersion'|'expiresAt'>>>
/** SDK 要求绝对地址且一级路径为 _AMapService；网关去掉此前缀后仍走原项目能力路径。 */
export function directoryAmapSdkServiceHost(configuration:FrameConfiguration,origin:string){return `${origin}/_AMapService${configuration.serviceHost}`}
export type PickerPoint=Readonly<{longitude:number;latitude:number}>
export type PickerQuery={kind:'name';name:string}|{kind:'coordinates';point:PickerPoint}
export function validPickerPoint(value:unknown):value is PickerPoint{return record(value)&&exact(value,['longitude','latitude'])&&typeof value.longitude==='number'&&Number.isFinite(value.longitude)&&Math.abs(value.longitude)<=180&&typeof value.latitude==='number'&&Number.isFinite(value.latitude)&&Math.abs(value.latitude)<=90}
function pickerName(value:unknown):value is string{return typeof value==='string'&&[...value].length<=256&&!/[\p{Cc}\p{Cs}]/u.test(value)}
const request=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0
function pickerQuery(value:unknown):value is PickerQuery{return record(value)&&(value.kind==='name'?exact(value,['kind','name'])&&pickerName(value.name)&&value.name.length>0:value.kind==='coordinates'&&exact(value,['kind','point'])&&validPickerPoint(value.point))}
type Envelope={channel:typeof frameChannel;nonce:string;generation:number;serial:number}
export type ParentMessage=Envelope&(
 |{kind:'init';configuration:FrameConfiguration;projectId:string;rows:readonly DirectoryMapRow[];selected:string;baseMap:DirectoryBaseMap}
 |{kind:'picker-init';configuration:FrameConfiguration;projectId:string;point:PickerPoint|null;request:number;zoom?:number;readOnly?:boolean;appearance?:'device-location'}
 |{kind:'picker-query';request:number;query:PickerQuery}|{kind:'picker-cancel';request:number}
 |{kind:'rows';rows:readonly DirectoryMapRow[];selected:string}
 |{kind:'select';deviceId:string}|{kind:'fit';deviceIds?:readonly string[]}|{kind:'zoom';direction:'in'|'out'}
 |{kind:'basemap';baseMap:DirectoryBaseMap}|{kind:'renew';configuration:FrameConfiguration}|{kind:'dispose'})
export type ChildMessage=Envelope&({kind:'picker-result';request:number;point:PickerPoint;name:string}|{kind:'picker-failed';request:number}|{kind:'picker-busy';request:number}|{kind:'hello'}|{kind:'ready'}|{kind:'rendered'}|{kind:'select'|'navigate';deviceId:string}|{kind:'error';reason:'SDK'|'CONVERSION'|'EXPIRED'|'PROTOCOL'|'BASEMAP'})
const record=(x:unknown):x is Record<string,unknown>=>typeof x==='object'&&x!==null&&!Array.isArray(x)
function exact(x:Record<string,unknown>,keys:readonly string[]){return Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k))}
function bounded(x:unknown,n:number):x is string{return typeof x==='string'&&x.length<=n&&!/[\u0000-\u001f\u007f]/.test(x)}
function base(x:Record<string,unknown>,nonce:string){return x.channel===frameChannel&&x.nonce===nonce&&uuidV4.test(nonce)&&Number.isSafeInteger(x.generation)&&Number(x.generation)>=0&&Number.isSafeInteger(x.serial)&&Number(x.serial)>0}
const common=['channel','nonce','generation','serial','kind']
export function frameExpiryMillis(value:unknown):number{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(value))return NaN
 const millis=Date.parse(value)
 return Number.isFinite(millis)&&new Date(millis).toISOString().slice(0,19)===value.slice(0,19)?millis:NaN
}
export function validFrameConfiguration(x:unknown,project:string,now=Date.now()):x is FrameConfiguration{
 if(!record(x)||!exact(x,['contextId','serviceHost','publicKey','jsApiVersion','expiresAt']))return false
 if(!bounded(x.contextId,43)||!/^[A-Za-z0-9_-]{43}$/.test(x.contextId)||!bounded(x.publicKey,256)||!x.publicKey||x.jsApiVersion!=='2.0'||typeof x.expiresAt!=='string')return false
 const expiry=frameExpiryMillis(x.expiresAt)
 return x.serviceHost===`/api/v1/projects/${project}/directory-map-contexts/${x.contextId}/_AMapService`&&Number.isFinite(expiry)&&expiry>now+2000&&expiry<=now+65000
}
export function validFrameRows(x:unknown):x is readonly DirectoryMapRow[]{
 if(!Array.isArray(x)||x.length>96)return false
 const ids=new Set<string>()
 return x.every(v=>{
  if(!record(v)||!exact(v,['deviceId','name','longitude','latitude','online','version',...(Object.hasOwn(v,'locationSource')?['locationSource']:[]),...(Object.hasOwn(v,'details')?['details']:[])])||!bounded(v.deviceId,128)||!v.deviceId||ids.has(v.deviceId)||!bounded(v.name,512)||typeof v.online!=='boolean')return false
  if(Object.hasOwn(v,'details')&&(!record(v.details)||!exact(v.details,['deviceTypeName','lastDataReportAt'])||!(v.details.deviceTypeName===null||bounded(v.details.deviceTypeName,512))||!(v.details.lastDataReportAt===null||bounded(v.details.lastDataReportAt,64)&&/^\d{4}-\d{2}-\d{2}T/.test(v.details.lastDataReportAt)&&Number.isFinite(Date.parse(v.details.lastDataReportAt)))))return false
  const empty=v.longitude===null&&v.latitude===null,point=typeof v.longitude==='number'&&Number.isFinite(v.longitude)&&Math.abs(v.longitude)<=180&&typeof v.latitude==='number'&&Number.isFinite(v.latitude)&&Math.abs(v.latitude)<=90
  if(Object.hasOwn(v,'locationSource')){
   if(v.locationSource==='REPORTED_PROPERTY'){if(!point||v.version!==null)return false}
   else if(v.locationSource==='DISABLED'||v.locationSource==='UNAVAILABLE'){if(!empty||v.version!==null)return false}
   else if(v.locationSource==='MANUAL'||v.locationSource==='LEGACY_MANUAL'){if(!bounded(v.version,512))return false}
   else return false
  }else if(!bounded(v.version,512))return false
  ids.add(v.deviceId)
  return empty||point
 })
}
export function decodeParentMessage(value:unknown,nonce:string,project?:string):ParentMessage|null{
 if(!record(value)||!base(value,nonce))return null
 const v=value,kind=v.kind
 if(kind==='picker-init')return exact(v,[...common,'configuration','projectId','point','request',...(Object.hasOwn(v,'zoom')?['zoom']:[]),...(Object.hasOwn(v,'readOnly')?['readOnly']:[]),...(Object.hasOwn(v,'appearance')?['appearance']:[])])&&(!Object.hasOwn(v,'appearance')||v.appearance==='device-location')&&(!Object.hasOwn(v,'readOnly')||typeof v.readOnly==='boolean')&&(!Object.hasOwn(v,'zoom')||typeof v.zoom==='number'&&Number.isInteger(v.zoom)&&v.zoom>=2&&v.zoom<=18)&&request(v.request)&&typeof v.projectId==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(v.projectId)&&validFrameConfiguration(v.configuration,v.projectId)&&(v.point===null||validPickerPoint(v.point))?v as ParentMessage:null
 if(kind==='picker-query')return exact(v,[...common,'request','query'])&&request(v.request)&&pickerQuery(v.query)?v as ParentMessage:null
 if(kind==='picker-cancel')return exact(v,[...common,'request'])&&request(v.request)?v as ParentMessage:null
 if(kind==='init')return exact(v,[...common,'configuration','projectId','rows','selected','baseMap'])&&typeof v.projectId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v.projectId)&&validFrameConfiguration(v.configuration,v.projectId)&&validFrameRows(v.rows)&&typeof v.selected==='string'&&(v.selected===''||v.rows.some(r=>r.deviceId===v.selected))&&(v.baseMap==='vector'||v.baseMap==='satellite')?v as ParentMessage:null
 if(kind==='rows')return exact(v,[...common,'rows','selected'])&&validFrameRows(v.rows)&&typeof v.selected==='string'&&(v.selected===''||v.rows.some(r=>r.deviceId===v.selected))?v as ParentMessage:null
 if(kind==='select')return exact(v,[...common,'deviceId'])&&bounded(v.deviceId,128)?v as ParentMessage:null
 if(kind==='fit')return (exact(v,common)||exact(v,[...common,'deviceIds'])&&Array.isArray(v.deviceIds)&&v.deviceIds.length>0&&v.deviceIds.length<=96&&new Set(v.deviceIds).size===v.deviceIds.length&&v.deviceIds.every(id=>bounded(id,128)&&id.length>0))?v as ParentMessage:null
 if(kind==='dispose')return exact(v,common)?v as ParentMessage:null
 if(kind==='zoom')return exact(v,[...common,'direction'])&&(v.direction==='in'||v.direction==='out')?v as ParentMessage:null
 if(kind==='basemap')return exact(v,[...common,'baseMap'])&&(v.baseMap==='vector'||v.baseMap==='satellite')?v as ParentMessage:null
 if(kind==='renew')return exact(v,[...common,'configuration'])&&!!project&&validFrameConfiguration(v.configuration,project)?v as ParentMessage:null
 return null
}
export function decodeChildMessage(value:unknown,nonce:string,ids:ReadonlySet<string>):ChildMessage|null{
 if(!record(value)||!base(value,nonce))return null
 if(value.kind==='picker-result')return exact(value,[...common,'request','point','name'])&&request(value.request)&&validPickerPoint(value.point)&&pickerName(value.name)?value as ChildMessage:null
 if(value.kind==='picker-busy')return exact(value,[...common,'request'])&&request(value.request)?value as ChildMessage:null
 if(value.kind==='picker-failed')return exact(value,[...common,'request'])&&request(value.request)?value as ChildMessage:null
 if(['hello','ready','rendered'].includes(String(value.kind)))return exact(value,common)?value as ChildMessage:null
 if(value.kind==='select'||value.kind==='navigate')return exact(value,[...common,'deviceId'])&&typeof value.deviceId==='string'&&ids.has(value.deviceId)?value as ChildMessage:null
 if(value.kind==='error')return exact(value,[...common,'reason'])&&['SDK','CONVERSION','EXPIRED','PROTOCOL','BASEMAP'].includes(String(value.reason))?value as ChildMessage:null
 return null
}
/** 双向都先核窗口身份，再解消息；随机数只隔离实例，不是授权凭据。 */
export function ownedFrameEvent(event:Pick<MessageEvent,'origin'|'source'>,origin:string,peer:Window|null){return !!peer&&event.origin===origin&&event.source===peer}
export function nextFrameGeneration(previous:number){if(!Number.isSafeInteger(previous)||previous<0||previous>=Number.MAX_SAFE_INTEGER)throw new Error('地图查询代次无效。');return previous+1}
