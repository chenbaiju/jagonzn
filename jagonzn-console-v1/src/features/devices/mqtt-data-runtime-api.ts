import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {normalizeDataStreamMqttTopics,normalizeDataStreamDefinition,normalizeDataStreamParameterValues,dataStreamDefinitionProfile,dataStreamPublishTopic,dataStreamSubscribeTopic} from '../device-types/data-stream-publication-api'
import {dataFromBase64,dataHex} from './data-stream-runtime-api'
export type MqttDataSession=Readonly<Required<Omit<Schema<'DeviceMqttDataSessionResponse'>,'definitionProfile'>>&Pick<Schema<'DeviceMqttDataSessionResponse'>,'definitionProfile'>>
export type MqttDataMessage=Readonly<Required<Omit<Schema<'DeviceMqttDataMessageResponse'>,'definitionProfile'|'topic'|'params'>>&Pick<Schema<'DeviceMqttDataMessageResponse'>,'definitionProfile'|'topic'|'params'>>
export type MqttDataTransport={current:(project:string,device:string,signal:AbortSignal)=>Promise<MqttDataSession>;history:(project:string,device:string,signal:AbortSignal)=>Promise<readonly MqttDataMessage[]>}
const v8=/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,identifier=/^[A-Za-z0-9_-]{1,64}$/,hash=/^[0-9a-f]{64}$/
const statuses=['NO_CONNECTION','RECONNECT_REQUIRED','STALE','PUBLISHED','NO_TYPE','UNSUPPORTED_TYPE','NO_PUBLICATION','PUBLICATION_BUSY','CAPACITY']
function invalid():never{throw new Error('MQTT DATA固定会话、原件身份或原字节不符合合同')}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value as never))invalid();const row=value as Record<string,unknown>;if(Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key)))invalid();return row}
const uuid=(value:unknown,pattern=typeDeviceUuid):value is string=>typeof value==='string'&&pattern.test(value)
const time=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)&&Number.isFinite(Date.parse(value))
const revision=(value:unknown):value is string=>typeof value==='string'&&/^[1-9]\d{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n
function bytesCount(value:unknown){const raw=isStrictJsonNumber(value as never)?(value as {lexical:string}).lexical:null;if(raw!==null&&!/^[1-9]\d{0,4}$/.test(raw))invalid();const result=raw===null?value:Number(raw);if(typeof result!=='number'||!Number.isSafeInteger(result)||result<1||result>65504)invalid();return result}
export function decodeMqttDataSession(value:unknown):MqttDataSession{
 const hasProfile=!!value&&typeof value==='object'&&Object.hasOwn(value,'definitionProfile')
 const row=object(value,['available','status','connectionId','deviceTypeId','publicationId','publicationRevision','definitionDigest','publicationPublishedAt','streams',...(hasProfile?['definitionProfile']:[])])
 if(typeof row.available!=='boolean'||typeof row.status!=='string'||!statuses.includes(row.status)||!Array.isArray(row.streams)||row.streams.length>64)invalid()
 const keys=new Set<string>(),publishes=new Set<string>(),subscribes=new Set<string>(),streams=row.streams.map(value=>{const hasTopics=!!value&&typeof value==='object'&&Object.hasOwn(value,'mqttTopics'),stream=object(value,['identifier','name','format',...(hasTopics?['mqttTopics']:[])]);if(typeof stream.identifier!=='string'||!identifier.test(stream.identifier)||keys.has(stream.identifier)||typeof stream.name!=='string'||!stream.name.trim()||Array.from(stream.name).length>128||/[\u0000-\u001f\u007f-\u009f]|\p{Surrogate}/u.test(stream.name)||typeof stream.format!=='string'||!['HEX','TEXT','JSON'].includes(stream.format))invalid();const mqttTopics=hasTopics?normalizeDataStreamMqttTopics(stream.mqttTopics):undefined,item={identifier:stream.identifier,name:stream.name,format:stream.format,...(mqttTopics?{mqttTopics}:{})},publish=dataStreamPublishTopic(item),subscribe=dataStreamSubscribeTopic(item);if(publishes.has(publish)||subscribes.has(subscribe))invalid();publishes.add(publish);subscribes.add(subscribe);keys.add(stream.identifier);return Object.freeze(item)})
 const definition=normalizeDataStreamDefinition({streams,tcpStreamIdentifier:null});if(hasProfile?row.definitionProfile!=='TL_DATA_STREAM_DEFINITION_V2':dataStreamDefinitionProfile(definition)!=='TL_DATA_STREAM_DEFINITION_V1')invalid()
 if(row.connectionId===null){if(!['NO_CONNECTION','RECONNECT_REQUIRED'].includes(row.status)||row.available||row.deviceTypeId!==null||row.publicationId!==null||row.publicationRevision!==null||row.definitionDigest!==null||row.publicationPublishedAt!==null||streams.length)invalid()}
 else{
  if(!uuid(row.connectionId)||['NO_CONNECTION','RECONNECT_REQUIRED'].includes(row.status)||row.deviceTypeId!==null&&!uuid(row.deviceTypeId,typeDeviceUuid))invalid()
  if(row.publicationId===null){if(row.publicationRevision!==null||row.definitionDigest!==null||row.publicationPublishedAt!==null||streams.length||row.available||row.status==='PUBLISHED')invalid()}
  else if(!uuid(row.publicationId)||!uuid(row.deviceTypeId,typeDeviceUuid)||!revision(row.publicationRevision)||typeof row.definitionDigest!=='string'||!hash.test(row.definitionDigest)||!time(row.publicationPublishedAt)||!['PUBLISHED','STALE'].includes(row.status))invalid()
  if(row.available!==(row.status==='PUBLISHED'&&streams.length>0))invalid()
 }
 return Object.freeze({...row,streams:Object.freeze(streams)}) as MqttDataSession
}
function utf8(bytes:Uint8Array){try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)}catch{return undefined}}
export async function decodeMqttDataMessage(value:unknown):Promise<MqttDataMessage>{
 const hasProfile=!!value&&typeof value==='object'&&Object.hasOwn(value,'definitionProfile')
 const row=object(value,['messageId','connectionId','publicationId','streamIdentifier','format','payloadBytes','rawDigest','originalQos','decodeStatus','receivedAt','acceptedAt','payloadBase64',...(hasProfile?['definitionProfile','params','topic']:[])]),payloadBytes=bytesCount(row.payloadBytes),originalQos=isStrictJsonNumber(row.originalQos as never)?(row.originalQos as {lexical:string}).lexical==='0'?0:(row.originalQos as {lexical:string}).lexical==='1'?1:undefined:row.originalQos
 if(originalQos!==0&&originalQos!==1)invalid()
 const params=hasProfile?normalizeDataStreamParameterValues(row.params):undefined
 if(hasProfile&&(row.definitionProfile!=='TL_DATA_STREAM_DEFINITION_V2'||typeof row.topic!=='string'||!/^tc\/v1\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}\/up\/data(?:\/[A-Za-z0-9_-]{1,64}){1,7}$/.test(row.topic)||row.topic.split('/').slice(5).join('/').length>256))invalid()
 if(!uuid(row.messageId,v8)||!uuid(row.connectionId)||!uuid(row.publicationId)||typeof row.streamIdentifier!=='string'||!identifier.test(row.streamIdentifier)||typeof row.format!=='string'||!['HEX','TEXT','JSON'].includes(row.format)||typeof row.rawDigest!=='string'||!hash.test(row.rawDigest)||typeof row.decodeStatus!=='string'||!['DECODED','INVALID_UTF8','INVALID_JSON'].includes(row.decodeStatus)||!time(row.receivedAt)||!time(row.acceptedAt))invalid()
 if(row.format==='HEX'&&row.decodeStatus!=='DECODED'||row.format==='TEXT'&&row.decodeStatus==='INVALID_JSON')invalid()
 if(row.payloadBase64!==null){if(typeof row.payloadBase64!=='string')invalid();const bytes=dataFromBase64(row.payloadBase64),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');if(bytes.length!==payloadBytes||digest!==row.rawDigest)invalid();if(row.format!=='HEX'&&(utf8(bytes)===undefined)!==(row.decodeStatus==='INVALID_UTF8'))invalid()}
 return Object.freeze({...row,payloadBytes,originalQos,...(params?{params}:{})}) as MqttDataMessage
}
export function mqttOriginalHex(value:MqttDataMessage){return value.payloadBase64===null?null:dataHex(dataFromBase64(value.payloadBase64))}
export function mqttOriginalText(value:MqttDataMessage){return value.payloadBase64===null?null:utf8(dataFromBase64(value.payloadBase64))}
function path(project:string,device:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(device))invalid();return `/api/v1/projects/${project}/devices/${device}` as const}
export const mqttDataTransport:MqttDataTransport={
 async current(project,device,signal){return decodeMqttDataSession(parseDashboardRuntimeResponse(await api<Uint8Array>(`${path(project,device)}/mqtt-data-stream-runtime`,{signal,responseType:'bytes',maxResponseBytes:128*1024})))},
 async history(project,device,signal){const source=await api<Uint8Array>(`${path(project,device)}/mqtt-data-stream-messages`,{signal,query:{limit:20},responseType:'bytes',maxResponseBytes:2*1024*1024}),prefix=new TextEncoder().encode('{\"items\":'),wrapped=new Uint8Array(prefix.length+source.length+1);wrapped.set(prefix);wrapped.set(source,prefix.length);wrapped[wrapped.length-1]=125;const values=object(parseDashboardRuntimeResponse(wrapped),['items']).items;if(!Array.isArray(values)||values.length>20)invalid();const rows=await Promise.all(values.map(decodeMqttDataMessage));if(new Set(rows.map(row=>row.messageId)).size!==rows.length)invalid();return Object.freeze(rows)}
}
