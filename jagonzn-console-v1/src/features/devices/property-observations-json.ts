import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {valueText} from './strict-values'
import type {Schema} from '@/core/contracts'
export type ObservationSource=NonNullable<Schema<'ConsolePropertyObservationHistoryItem'>['sourceKind']>
export type ObservationQuery={project:string;device:string;model:string;from:string;to:string;limit:number;property?:string;source?:ObservationSource;includeActor:boolean}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function fail():never{throw new Error('属性历史响应的来源、范围或分页合同不完整')}
function object(value:StrictJsonValue|undefined):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return fail();return value as StrictJsonObject}
function closed(value:StrictJsonObject,fields:readonly string[]){if(Object.keys(value).length!==fields.length||fields.some(field=>!Object.hasOwn(value,field)))fail()}
function id(value:StrictJsonValue|undefined):value is string{return typeof value==='string'&&uuid.test(value)}
/** 在纳秒上核对边界；Date仅解释整秒和时区，不把不同纳秒压成相同毫秒。 */
function instant(value:StrictJsonValue|undefined):bigint{
 if(typeof value!=='string')return fail()
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value)
 if(!match)return fail()
 const base=`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${match[8]}`,milliseconds=Date.parse(base)
 if(!Number.isFinite(milliseconds))return fail()
 const offset=match[8]==='Z'?0:(match[9]==='-'?-1:1)*(Number(match[10])*60+Number(match[11]))
 const local=new Date(milliseconds+offset*60000),parts=[local.getUTCFullYear(),local.getUTCMonth()+1,local.getUTCDate(),local.getUTCHours(),local.getUTCMinutes(),local.getUTCSeconds()]
 if(parts.some((part,index)=>part!==Number(match[index+1])))return fail()
 return BigInt(milliseconds)*1000000n+BigInt((match[7]||'').padEnd(9,'0'))
}
/** 按已核公开交付脚本，用浏览器本地整日初始化今日前29天至明日；不以固定毫秒数替代日历天。 */
export function defaultObservationWindow(now=new Date()){
 return {from:new Date(now.getFullYear(),now.getMonth(),now.getDate()-29).toISOString(),to:new Date(now.getFullYear(),now.getMonth(),now.getDate()+1).toISOString()}
}
/** 输入与响应共用严格纳秒窗口，避免先按毫秒或本机缺省时区解释请求。 */
export function observationWindow(start:string,end:string){const from=instant(start),to=instant(end);if(from>=to)fail();return {from,to}}
/** 只解释有来源证明的实际历史；保留服务端两流顺序和所有数值原文，不在前端重排。 */
export function decodePropertyObservations(bytes:Uint8Array,query:ObservationQuery){
 if(bytes.byteLength>4194304)return fail()
 const response=parseDashboardRuntimeResponse(bytes)
 closed(response,['projectId','deviceId','modelVersionId','requestedFrom','requestedTo','reportedFrom','reportedTo','platformFrom','platformTo','items','nextCursor','hasMore'])
 const {from,to}=observationWindow(query.from,query.to)
 if(response.projectId!==query.project||response.deviceId!==query.device||response.modelVersionId!==query.model||instant(response.requestedFrom)!==from||instant(response.requestedTo)!==to||from>=to
  ||!Number.isInteger(query.limit)||query.limit<1||query.limit>50||!Array.isArray(response.items)||response.items.length>query.limit
  ||typeof response.hasMore!=='boolean'||!(response.nextCursor===null||typeof response.nextCursor==='string'&&response.nextCursor.length>0&&response.nextCursor.length<=4096)
  ||response.hasMore!==(response.nextCursor!==null)||response.hasMore&&response.items.length===0)fail()
 const reportedFrom=instant(response.reportedFrom),reportedTo=instant(response.reportedTo),platformFrom=instant(response.platformFrom),platformTo=instant(response.platformTo)
 if(reportedFrom<from||platformFrom<from||reportedTo>to||platformTo>to)fail()
 let previous:bigint|undefined;let previousPlatform=false;const seen=new Set<string>()
 const items=response.items.map(raw=>{
  const item=object(raw);closed(item,['sourceKind','sourceId','propertyKey','state','value','precision','sourceModelVersionId','at','timeKind','commandId','actorId','actorDisplayName'])
  const source=item.sourceKind
  if(!['DEVICE_REPORT','PLATFORM_DOWNLINK','PLATFORM_CLOUD_UPDATE'].includes(String(source))||query.source&&query.source!==source||!id(item.sourceId)
   ||typeof item.propertyKey!=='string'||!item.propertyKey||query.property&&query.property!==item.propertyKey||!(item.sourceModelVersionId===null||id(item.sourceModelVersionId)))fail()
  const platform=source!=='DEVICE_REPORT',at=instant(item.at),identity=`${source==='DEVICE_REPORT'?'report':'platform'}:${item.sourceId}:${item.propertyKey}`
  if(seen.has(identity)||at<from||at>=to||at<(platform?platformFrom:reportedFrom)||at>=(platform?platformTo:reportedTo)||previous!==undefined&&(at>previous||at===previous&&previousPlatform&&!platform))fail()
  seen.add(identity);previous=at;previousPlatform=platform
  if(platform){
   if(item.state!=='VALUE'||item.value===null||item.precision!=='EXACT_PLATFORM_JSON'||!id(item.sourceModelVersionId)||item.timeKind!=='PLATFORM_ACCEPTED'
    ||(source==='PLATFORM_DOWNLINK'?item.commandId!==item.sourceId:item.commandId!==null)
    ||!(item.actorId===null||id(item.actorId))||!(item.actorDisplayName===null||typeof item.actorDisplayName==='string')
    ||item.actorId===null&&item.actorDisplayName!==null||!query.includeActor&&(item.actorId!==null||item.actorDisplayName!==null))fail()
  }else{
   if(item.timeKind!=='DEVICE_OCCURRED'||item.commandId!==null||item.actorId!==null||item.actorDisplayName!==null)fail()
   if(item.state==='VALUE'){
    if(!id(item.sourceModelVersionId)||item.value===null||!['STORED_DOUBLE','STORED_JSON','STORED_SCALAR'].includes(String(item.precision)))fail()
    if(item.precision==='STORED_DOUBLE'&&!isStrictJsonNumber(item.value!)||item.precision==='STORED_JSON'&&(!item.value||typeof item.value!=='object'||isStrictJsonNumber(item.value))
     ||item.precision==='STORED_SCALAR'&&typeof item.value!=='string'&&typeof item.value!=='boolean')fail()
   }else if(!['SOURCE_VERSION_UNKNOWN','CONTRACT_MISMATCH'].includes(String(item.state))||item.value!==null||item.precision!=='UNAVAILABLE'
    ||(item.state==='SOURCE_VERSION_UNKNOWN'?item.sourceModelVersionId!==null:!id(item.sourceModelVersionId)))fail()
  }
  return {sourceKind:source as ObservationSource,sourceId:item.sourceId as string,propertyKey:item.propertyKey as string,state:item.state as string,
   value:item.value!,valueText:item.state==='VALUE'?valueText(item.value!):item.state==='SOURCE_VERSION_UNKNOWN'?'来源版本未知':'数据不匹配',precision:item.precision as string,
   sourceModelVersionId:item.sourceModelVersionId as string|null,at:item.at as string,timeKind:item.timeKind as string,commandId:item.commandId as string|null,
   actorId:item.actorId as string|null,actorDisplayName:item.actorDisplayName as string|null}
 })
 return {items,nextCursor:response.nextCursor as string|null,hasMore:response.hasMore as boolean,reportedFrom:response.reportedFrom as string,reportedTo:response.reportedTo as string,
  platformFrom:response.platformFrom as string,platformTo:response.platformTo as string}
}
