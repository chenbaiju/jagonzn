import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'

export type DeviceDiagnosticControl=Schema<'DeviceDiagnosticControlResponse'>
type DiagnosticClocks={acceptedAt:string|null;parsedAt:string|null;processedAt:string|null;deliveredAt:string|null;repliedAt:string|null}
type DiagnosticNullableText={topic:string|null;payloadSummary:string|null;errorCode:string|null;traceId:string|null;messageType:string|null}
/** 旧通用DTO把字段写成可选；本诊断入口逐项验证完整20字段及明确null后才给消费者。 */
export type DeviceDiagnosticMessage=Omit<Required<Schema<'MessageLogResponse'>>,keyof DiagnosticClocks|keyof DiagnosticNullableText>&DiagnosticClocks&DiagnosticNullableText
type DetailPresentation={payloadHex:null;format:'JSON';normalizedResult:string|null}
/** 独立详情DTO：JSON仅表示摘要的返回方式，不代表设备原始报文格式。 */
export type DeviceDiagnosticDetail=Omit<Required<Schema<'MessageLogDetailResponse'>>,keyof DiagnosticClocks|keyof DiagnosticNullableText|keyof DetailPresentation>&DiagnosticClocks&DiagnosticNullableText&DetailPresentation
export type DeviceDiagnosticPage={items:DeviceDiagnosticMessage[];nextCursor:string|null;hasMore:boolean}
export type DeviceDiagnosticIntent=Readonly<{project:string;device:string;version:number;clearGeneration:number;previousEnabled:boolean;enabled:boolean;kind:'toggle'|'clear'}>
export const MAX_DIAGNOSTIC_VERSION=2147483647
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const fail=():never=>{throw new Error('设备诊断响应不符合读取合同，请重新读取核对')}
function object(value:StrictJsonValue|undefined):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return fail();return value as StrictJsonObject}
function closed(value:StrictJsonObject,fields:string[]){if(Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key)))fail()}
function integer(value:StrictJsonValue|undefined){if(value===undefined||!isStrictJsonNumber(value)||!/^(0|[1-9][0-9]*)$/.test(value.lexical))return fail();const n=Number(value.lexical);if(!Number.isInteger(n)||n>MAX_DIAGNOSTIC_VERSION)fail();return n}
function nullableText(value:StrictJsonValue|undefined,max:number){if(value===null)return null;if(typeof value!=='string'||value.length>max)return fail();return value}
function time(value:StrictJsonValue|undefined):string{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value.slice(0,10))return fail();return value}
function path(project:string,device:string){if(!uuid.test(project)||!uuid.test(device))fail();return `/api/v1/projects/${project}/devices/${device}` as const}
function validState(state:DeviceDiagnosticControl){if(!uuid.test(state.deviceId)||typeof state.enabled!=='boolean'||!Number.isInteger(state.version)||state.version<0||state.version>MAX_DIAGNOSTIC_VERSION||!Number.isInteger(state.clearGeneration)||state.clearGeneration<0||state.clearGeneration>state.version||(state.version===0&&state.enabled))fail()}
export function decodeDeviceDiagnosticControl(bytes:Uint8Array,device:string):DeviceDiagnosticControl{
 if(bytes.byteLength>4096||!uuid.test(device))fail()
 const row=object(parseDashboardRuntimeResponse(bytes));closed(row,['deviceId','enabled','version','clearGeneration'])
 if(row.deviceId!==device||typeof row.enabled!=='boolean')return fail()
 const result={deviceId:device,enabled:row.enabled,version:integer(row.version),clearGeneration:integer(row.clearGeneration)}
 validState(result);return result
}
export async function readDeviceDiagnosticControl(project:string,device:string,signal:AbortSignal){return decodeDeviceDiagnosticControl(await api<Uint8Array>(`${path(project,device)}/diagnostic-control`,{signal,responseType:'bytes',maxResponseBytes:4096}),device)}
export function prepareDeviceDiagnosticIntent(project:string,state:DeviceDiagnosticControl,kind:'toggle'|'clear',enabled=state.enabled):DeviceDiagnosticIntent{
 path(project,state.deviceId);validState(state)
 if(state.version===MAX_DIAGNOSTIC_VERSION||typeof enabled!=='boolean'||!['toggle','clear'].includes(kind))fail()
 return Object.freeze({project,device:state.deviceId,version:state.version,clearGeneration:state.clearGeneration,previousEnabled:state.enabled,enabled:kind==='clear'?state.enabled:enabled,kind})
}
export function verifyDeviceDiagnosticWrite(bytes:Uint8Array,intent:DeviceDiagnosticIntent){
 const result=decodeDeviceDiagnosticControl(bytes,intent.device)
 const change=intent.kind==='clear'||intent.enabled!==intent.previousEnabled
 if(result.enabled!==intent.enabled||result.version!==intent.version+(change?1:0)||result.clearGeneration!==intent.clearGeneration+(intent.kind==='clear'?1:0))fail()
 return result
}
export async function submitDeviceDiagnosticIntent(intent:DeviceDiagnosticIntent,signal:AbortSignal){
 const base=path(intent.project,intent.device)
 validState({deviceId:intent.device,enabled:intent.previousEnabled,version:intent.version,clearGeneration:intent.clearGeneration})
 if(intent.version===MAX_DIAGNOSTIC_VERSION||typeof intent.enabled!=='boolean'||!['toggle','clear'].includes(intent.kind)||(intent.kind==='clear'&&intent.enabled!==intent.previousEnabled))fail()
 const clearBody={version:intent.version} satisfies Schema<'ClearDeviceDiagnosticMessagesRequest'>
 const toggleBody={version:intent.version,enabled:intent.enabled} satisfies Schema<'ChangeDeviceDiagnosticControlRequest'>
 const bytes=intent.kind==='clear'
  ?await api<Uint8Array>(`${base}/diagnostic-messages`,{method:'delete',body:clearBody,signal,responseType:'bytes',maxResponseBytes:4096})
  :await api<Uint8Array>(`${base}/diagnostic-control`,{method:'put',body:toggleBody,signal,responseType:'bytes',maxResponseBytes:4096})
 return verifyDeviceDiagnosticWrite(bytes,intent)
}
export function decodeDeviceDiagnosticPage(bytes:Uint8Array,device:string,limit:number):DeviceDiagnosticPage{
 if(bytes.byteLength>1048576||!uuid.test(device)||!Number.isInteger(limit)||limit<1||limit>200)fail()
 const page=object(parseDashboardRuntimeResponse(bytes));closed(page,['items','nextCursor','hasMore'])
 if(!Array.isArray(page.items)||page.items.length>limit||typeof page.hasMore!=='boolean')return fail()
 const cursor=nullableText(page.nextCursor,512)
 if(page.hasMore?(!cursor||page.items.length!==limit):cursor!==null)fail()
 const seen=new Set<string>()
 const items=page.items.map(value=>{
  const result=diagnosticMessage(value,device)
  if(seen.has(result.id))fail()
  seen.add(result.id)
  return result
 })
 return {items,nextCursor:cursor,hasMore:page.hasMore}
}
function diagnosticMessage(value:StrictJsonValue|undefined,device:string):DeviceDiagnosticMessage{
  const row=object(value)
  closed(row,['id','deviceId','messageId','protocol','direction','topic','payloadSummary','rawBytes','errorCode','ts','receivedAt','traceId','messageType','acceptedAt','parsedAt','processedAt','deliveredAt','repliedAt','truncated','sampled'])
  if(typeof row.id!=='string'||!uuid.test(row.id)||row.deviceId!==device||typeof row.messageId!=='string'||!uuid.test(row.messageId)||!['MQTT','HTTP','COAP','TCP'].includes(String(row.protocol))||!['UP','DOWN'].includes(String(row.direction))||typeof row.sampled!=='boolean'||typeof row.truncated!=='boolean')fail()
  const result={id:row.id,deviceId:device,messageId:row.messageId,protocol:row.protocol,direction:row.direction,topic:nullableText(row.topic,512),payloadSummary:nullableText(row.payloadSummary,1024),rawBytes:integer(row.rawBytes),errorCode:nullableText(row.errorCode,128),ts:time(row.ts),receivedAt:time(row.receivedAt),traceId:nullableText(row.traceId,64),messageType:nullableText(row.messageType,32),truncated:row.truncated,sampled:row.sampled} as DeviceDiagnosticMessage
  for(const key of ['acceptedAt','parsedAt','processedAt','deliveredAt','repliedAt'] as const)result[key]=row[key]===null?null:time(row[key])
  if(result.sampled&&result.payloadSummary!==null)fail()
  return result
}
export function decodeDeviceDiagnosticMessage(bytes:Uint8Array,device:string,logId:string):DeviceDiagnosticDetail{
 if(bytes.byteLength>16384||!uuid.test(device)||!uuid.test(logId))fail()
 const row=object(parseDashboardRuntimeResponse(bytes))
 closed(row,['id','deviceId','messageId','protocol','direction','topic','messageType','payloadSummary','payloadHex','format','normalizedResult','rawBytes','errorCode','truncated','sampled','ts','receivedAt','acceptedAt','parsedAt','processedAt','deliveredAt','repliedAt','traceId'])
 if(row.id!==logId||row.deviceId!==device||typeof row.messageId!=='string'||!uuid.test(row.messageId)||!['MQTT','HTTP','COAP','TCP'].includes(String(row.protocol))||!['UP','DOWN'].includes(String(row.direction))||typeof row.truncated!=='boolean'||typeof row.sampled!=='boolean'||row.format!=='JSON'||row.payloadHex!==null)fail()
 const messageType=nullableText(row.messageType,32),normalizedResult=nullableText(row.normalizedResult,128)
 if(normalizedResult!==(messageType===null?null:`${messageType}/${row.protocol}/${row.direction}`))fail()
 const result={id:logId,deviceId:device,messageId:row.messageId,protocol:row.protocol,direction:row.direction,topic:nullableText(row.topic,512),messageType,payloadSummary:nullableText(row.payloadSummary,1024),payloadHex:null,format:'JSON',normalizedResult,rawBytes:integer(row.rawBytes),errorCode:nullableText(row.errorCode,128),truncated:row.truncated,sampled:row.sampled,ts:time(row.ts),receivedAt:time(row.receivedAt),traceId:nullableText(row.traceId,64)} as DeviceDiagnosticDetail
 for(const key of ['acceptedAt','parsedAt','processedAt','deliveredAt','repliedAt'] as const)result[key]=row[key]===null?null:time(row[key])
 if(result.sampled&&result.payloadSummary!==null)fail()
 return result
}
export async function readDeviceDiagnosticMessage(project:string,device:string,logId:string,signal:AbortSignal){
 if(!uuid.test(logId))fail()
 return decodeDeviceDiagnosticMessage(await api<Uint8Array>(`${path(project,device)}/diagnostic-messages/${logId}`,{query:{format:'JSON'},signal,responseType:'bytes',maxResponseBytes:16384}),device,logId)
}
export async function readDeviceDiagnosticMessages(project:string,device:string,cursor:string|undefined,signal:AbortSignal){return decodeDeviceDiagnosticPage(await api<Uint8Array>(`${path(project,device)}/diagnostic-messages`,{query:{cursor,limit:50},signal,responseType:'bytes',maxResponseBytes:1048576}),device,50)}
