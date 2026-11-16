import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {dataBase64,dataFromBase64} from './data-stream-runtime-api'
import {resolveDataStreamTopic,normalizeDataStreamMqttTopics,normalizeDataStreamParams,normalizeDataStreamParameterValues} from '../device-types/data-stream-publication-api'
import {decodeMqttDataSession,type MqttDataSession} from './mqtt-data-runtime-api'

export type MqttDownlink=Readonly<Required<Omit<Schema<'DeviceMqttDataDownlinkResponse'>,'params'>>&Pick<Schema<'DeviceMqttDataDownlinkResponse'>,'params'>>
export type MqttDownlinkIntent=Readonly<{project:string;device:string;key:string;format:string;digest:string;expectedTopicSuffix:string;body:Readonly<Schema<'CreateDeviceMqttDataDownlinkRequest'>>}>
export type MqttDownlinkTransport={create:(intent:MqttDownlinkIntent,signal:AbortSignal)=>Promise<MqttDownlink>;original:(intent:MqttDownlinkIntent,signal:AbortSignal)=>Promise<MqttDownlink>}
const states=['PREPARED','SENDING','BROKER_ACCEPTED','REJECTED','EXPIRED','UNKNOWN'],hash=/^[0-9a-f]{64}$/,stream=/^[A-Za-z0-9_-]{1,64}$/
function invalid():never{throw new Error('MQTT下发原件与本次固定会话、原流或原字节不一致，请保留原请求继续核对')}
function time(value:unknown):value is string{return typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)&&Number.isFinite(Date.parse(value))}
async function digest(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('')}
export async function prepareMqttDownlink(project:string,device:string,pin:MqttDataSession,identifier:string,bytes:Uint8Array,lifetime:number,params?:unknown):Promise<MqttDownlinkIntent>{
 decodeMqttDataSession(pin)
 const selected=pin.streams.find(value=>value.identifier===identifier)
 if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(device)||!pin.available||!pin.connectionId||!pin.publicationId||!selected||!stream.test(identifier)||bytes.length<1||bytes.length>65504||!Number.isInteger(lifetime)||lifetime<1||lifetime>60)invalid()
 if(Object.hasOwn(selected,'mqttTopics'))normalizeDataStreamMqttTopics(selected.mqttTopics)
 const safeParams=normalizeDataStreamParams(selected,params),expectedTopicSuffix=resolveDataStreamTopic(selected,'subscribe',safeParams)
 return Object.freeze({project,device,key:crypto.randomUUID(),format:selected.format,digest:await digest(bytes),expectedTopicSuffix,body:Object.freeze({connectionId:pin.connectionId,publicationId:pin.publicationId,streamIdentifier:identifier,payloadBase64:dataBase64(bytes),expiresInSeconds:lifetime,...(safeParams?{params:safeParams}:{})})})
}
export async function decodeMqttDownlink(value:unknown,intent:MqttDownlinkIntent):Promise<MqttDownlink>{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid()
 const row=value as Record<string,unknown>,keys=['messageId','connectionId','publicationId','streamIdentifier','format','topic','payloadBytes','rawDigest','state','acceptedAt','expiresAt','sendingAt','completedAt','payloadBase64',...(intent.body.params!==undefined?['params']:[])]
 if(Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key)))invalid()
 if(!/^data(?:\/[A-Za-z0-9_-]{1,64}){1,7}$/.test(intent.expectedTopicSuffix)||intent.expectedTopicSuffix.length>256)invalid()
 const params=intent.body.params!==undefined?normalizeDataStreamParameterValues(row.params):undefined
 if(intent.body.params!==undefined&&JSON.stringify(params)!==JSON.stringify(intent.body.params))invalid()
 const count=isStrictJsonNumber(row.payloadBytes as never)?Number((row.payloadBytes as {lexical:string}).lexical):row.payloadBytes
 if(typeof row.messageId!=='string'||!typeDeviceUuid.test(row.messageId)||row.connectionId!==intent.body.connectionId||row.publicationId!==intent.body.publicationId||row.streamIdentifier!==intent.body.streamIdentifier||typeof row.streamIdentifier!=='string'||!stream.test(row.streamIdentifier)||row.format!==intent.format||typeof row.topic!=='string'||!new RegExp('^tc/v1/[A-Za-z0-9][A-Za-z0-9_-]{0,63}/[A-Za-z0-9][A-Za-z0-9_-]{0,63}/down/'+intent.expectedTopicSuffix+'$').test(row.topic)||typeof count!=='number'||!Number.isSafeInteger(count)||count<1||count>65504||count!==dataFromBase64(intent.body.payloadBase64!).length||typeof row.rawDigest!=='string'||!hash.test(row.rawDigest)||row.rawDigest!==intent.digest||typeof row.state!=='string'||!states.includes(row.state)||!time(row.acceptedAt)||!time(row.expiresAt)||row.sendingAt!==null&&!time(row.sendingAt)||row.completedAt!==null&&!time(row.completedAt))invalid()
 if(row.state==='PREPARED'&&(row.sendingAt!==null||row.completedAt!==null)||row.state==='SENDING'&&(row.sendingAt===null||row.completedAt!==null)||row.state==='BROKER_ACCEPTED'&&(row.sendingAt===null||row.completedAt===null))invalid()
 if(row.payloadBase64!==null){if(typeof row.payloadBase64!=='string'||row.payloadBase64!==intent.body.payloadBase64||await digest(dataFromBase64(row.payloadBase64))!==intent.digest)invalid()}
 return Object.freeze({...row,payloadBytes:count,...(params?{params}:{})}) as MqttDownlink
}
function path(intent:MqttDownlinkIntent){if(!typeDeviceUuid.test(intent.project)||!typeDeviceUuid.test(intent.device))invalid();return `/api/v1/projects/${intent.project}/devices/${intent.device}/mqtt-data-stream-downlinks` as const}
export const mqttDownlinkTransport:MqttDownlinkTransport={
 async create(intent,signal){return decodeMqttDownlink(parseDashboardRuntimeResponse(await api<Uint8Array>(path(intent),{method:'post',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:128*1024})),intent)},
 async original(intent,signal){return decodeMqttDownlink(parseDashboardRuntimeResponse(await api<Uint8Array>(`${path(intent)}/by-key`,{headers:{'Original-Request-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:128*1024})),intent)}
}
