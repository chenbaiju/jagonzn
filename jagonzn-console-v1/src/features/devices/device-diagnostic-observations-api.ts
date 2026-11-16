import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'

export type DeviceDiagnosticObservation=Required<Schema<'DeviceDiagnosticObservationResponse'>>
export type DeviceDiagnosticObservationDetail=Required<Schema<'DeviceDiagnosticObservationDetailResponse'>>
type ObservationIdentity=Omit<DeviceDiagnosticObservation,'preview'|'previewTruncated'>
export type DiagnosticObservationOrigin=DeviceDiagnosticObservation['origin']
export type DeviceDiagnosticObservationPage={items:DeviceDiagnosticObservation[];nextCursor:string|null;hasMore:boolean}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const origins=['PROTOCOL_OBSERVATION','LEGACY_SUMMARY'] as const
const commonFields=['id','origin','deviceId','messageId','protocol','direction','messageType','receivedAt','payloadFormat','contentCodec','contentState','originalBytes','processingStage','processingStatus','completedAt','errorCode']
const pageFields=[...commonFields,'preview','previewTruncated']
const detailFields=[...commonFields,'topic','httpPath','content','errorBody','errorBodyState','summary','summaryTruncated','summarySampled']
const fail=():never=>{throw new Error('诊断观察响应不符合读取合同，请重新读取核对')}
function object(value:StrictJsonValue|undefined):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return fail();return value as StrictJsonObject}
function closed(value:StrictJsonObject,fields:readonly string[]){if(Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key)))fail()}
function text(value:StrictJsonValue|undefined,maximum:number){if(value===null)return null;if(typeof value!=='string'||value.length>maximum)return fail();return value}
function bytesText(value:StrictJsonValue|undefined,maximum:number){const result=text(value,maximum);if(result!==null&&new TextEncoder().encode(result).byteLength>maximum)fail();return result}
function time(value:StrictJsonValue|undefined):string{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value.slice(0,10))return fail();return value}
function integer(value:StrictJsonValue|undefined){if(value===undefined||!isStrictJsonNumber(value)||!/^(0|[1-9][0-9]*)$/.test(value.lexical))return fail();const result=Number(value.lexical);if(result>65536)return fail();return result}
function origin(value:unknown):DiagnosticObservationOrigin{if(!origins.includes(value as typeof origins[number]))return fail();return value as DiagnosticObservationOrigin}
function path(project:string,device:string){if(!uuid.test(project)||!uuid.test(device))fail();return `/api/v1/projects/${project}/devices/${device}/diagnostic-observations` as const}
function scope(row:StrictJsonObject,device:string){
 if(typeof row.id!=='string'||!uuid.test(row.id)||row.deviceId!==device||row.messageId!==null&&(typeof row.messageId!=='string'||!uuid.test(row.messageId)))fail()
 if(!['MQTT','HTTP','COAP','TCP'].includes(String(row.protocol))||!['UP','DOWN'].includes(String(row.direction)))fail()
 const source=origin(row.origin),format=String(row.payloadFormat),state=String(row.contentState),status=String(row.processingStatus)
 if(!['JSON','PLAINTEXT','BINARY','UNKNOWN'].includes(format)||!['COMPLETE','REDACTED','UNSUPPORTED','INVALID','OVERSIZE','LEGACY_SUMMARY'].includes(state)||!['RECEIVED','SUCCEEDED','REJECTED','FAILED','UNKNOWN'].includes(status))fail()
 const stage=text(row.processingStage,32),completedAt=row.completedAt===null?null:time(row.completedAt),errorCode=text(row.errorCode,64),codec=text(row.contentCodec,64)
 if(codec!==null&&!/^[A-Z][A-Z0-9_]{0,63}$/.test(codec)||stage!==null&&!['INGRESS','PREPROCESSING','PERSISTENCE','DELIVERY','DEVICE_REPLY'].includes(stage))fail()
 if(source==='LEGACY_SUMMARY'){
  if(format!=='UNKNOWN'||codec!==null||!['LEGACY_SUMMARY','UNSUPPORTED'].includes(state)||row.originalBytes!==null||stage!==null||status!=='UNKNOWN'||completedAt!==null)fail()
 }else{
  integer(row.originalBytes)
  if(state==='LEGACY_SUMMARY'||['COMPLETE','REDACTED'].includes(state)&&(format==='UNKNOWN'||codec===null||format==='JSON'&&codec!=='JSON'))fail()
  if(status==='RECEIVED'?(stage!==null||completedAt!==null||errorCode!==null):(stage===null||completedAt===null))fail()
  if(status==='SUCCEEDED'&&errorCode!==null||['REJECTED','FAILED'].includes(status)&&!errorCode)fail()
 }
 return {id:row.id,origin:source,deviceId:device,messageId:row.messageId,protocol:row.protocol,direction:row.direction,messageType:text(row.messageType,32),receivedAt:time(row.receivedAt),payloadFormat:format,contentCodec:codec,contentState:state,originalBytes:row.originalBytes===null?null:integer(row.originalBytes),processingStage:stage,processingStatus:status,completedAt,errorCode} as ObservationIdentity
}
function timeKey(value:string){return `${value.slice(0,19)}.${(value.match(/\.(\d+)Z$/)?.[1]??'').padEnd(9,'0')}`}
export function decodeDeviceDiagnosticObservationPage(bytes:Uint8Array,device:string,limit:number):DeviceDiagnosticObservationPage{
 if(bytes.byteLength>1048576||!uuid.test(device)||!Number.isInteger(limit)||limit<1||limit>200)fail()
 const page=object(parseDashboardRuntimeResponse(bytes));closed(page,['items','nextCursor','hasMore'])
 if(!Array.isArray(page.items)||page.items.length>limit||typeof page.hasMore!=='boolean')return fail()
 const cursor=text(page.nextCursor,512)
 if(page.hasMore?(!cursor||page.items.length!==limit):cursor!==null)fail()
 const seen=new Set<string>();let previous:DeviceDiagnosticObservation|undefined
 const items=page.items.map(value=>{
  const row=object(value);closed(row,pageFields);const base=scope(row,device),preview=text(row.preview,1024)
  if(typeof row.previewTruncated!=='boolean'||preview===null&&row.previewTruncated||preview!==null&&Array.from(preview).length>256)fail()
  if(['COMPLETE','REDACTED','LEGACY_SUMMARY'].includes(base.contentState)!==(preview!==null))fail()
  if(base.origin==='PROTOCOL_OBSERVATION'&&row.previewTruncated&&preview!==null&&Array.from(preview).length!==256)fail()
  const result={...base,preview,previewTruncated:row.previewTruncated} as DeviceDiagnosticObservation,key=`${result.origin}:${result.id}`
  if(seen.has(key))fail();seen.add(key)
  if(previous){const before=timeKey(previous.receivedAt),now=timeKey(result.receivedAt);if(before<now||before===now&&(previous.id<result.id||previous.id===result.id&&previous.origin==='LEGACY_SUMMARY'&&result.origin==='PROTOCOL_OBSERVATION'))fail()}
  previous=result;return result
 })
 return {items,nextCursor:cursor,hasMore:page.hasMore}
}
export function decodeDeviceDiagnosticObservationDetail(bytes:Uint8Array,device:string,id:string,source:DiagnosticObservationOrigin):DeviceDiagnosticObservationDetail{
 if(bytes.byteLength>524288||!uuid.test(device)||!uuid.test(id))fail();origin(source)
 const row=object(parseDashboardRuntimeResponse(bytes));closed(row,detailFields);const base=scope(row,device)
 if(base.id!==id||base.origin!==source)fail()
 const topic=text(row.topic,512),httpPath=text(row.httpPath,2048),content=bytesText(row.content,65536),errorBody=bytesText(row.errorBody,16384),errorState=text(row.errorBodyState,16),summary=text(row.summary,1024)
 if(topic!==null&&base.protocol!=='MQTT'||httpPath!==null&&(base.protocol!=='HTTP'||!httpPath.startsWith('/')||/[?#]/.test(httpPath)))fail()
 if(errorState!==null&&!['COMPLETE','REDACTED','UNSUPPORTED','INVALID','OVERSIZE'].includes(errorState))fail()
 if(source==='LEGACY_SUMMARY'){
  if(topic!==null||httpPath!==null||content!==null||errorBody!==null||errorState!==null||typeof row.summaryTruncated!=='boolean'||typeof row.summarySampled!=='boolean')fail()
  if(row.summarySampled&&summary!==null)fail()
  if(base.contentState==='LEGACY_SUMMARY'?(summary===null||summary===''):summary!==null)fail()
 }else{
  if(row.summary!==null||row.summaryTruncated!==null||row.summarySampled!==null)fail()
  if(['COMPLETE','REDACTED'].includes(base.contentState)!==(content!==null))fail()
  if(errorState===null?errorBody!==null:['COMPLETE','REDACTED'].includes(errorState)!==(errorBody!==null))fail()
  if(['RECEIVED','SUCCEEDED'].includes(base.processingStatus)&&(errorBody!==null||errorState!==null))fail()
 }
 return {...base,topic,httpPath,content,errorBody,errorBodyState:errorState,summary,summaryTruncated:row.summaryTruncated,summarySampled:row.summarySampled} as DeviceDiagnosticObservationDetail
}
export async function readDeviceDiagnosticObservations(project:string,device:string,cursor:string|undefined,signal:AbortSignal){
 if(cursor!==undefined&&(typeof cursor!=='string'||!cursor||cursor.length>512))fail()
 const result=decodeDeviceDiagnosticObservationPage(await api<Uint8Array>(path(project,device),{query:{cursor,limit:50},signal,responseType:'bytes',maxResponseBytes:1048576}),device,50)
 if(cursor!==undefined&&result.nextCursor===cursor)fail();return result
}
export async function readDeviceDiagnosticObservation(project:string,device:string,id:string,source:DiagnosticObservationOrigin,signal:AbortSignal){
 if(!uuid.test(id))fail();origin(source)
 return decodeDeviceDiagnosticObservationDetail(await api<Uint8Array>(`${path(project,device)}/${id}`,{query:{origin:source},signal,responseType:'bytes',maxResponseBytes:524288}),device,id,source)
}
