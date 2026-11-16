import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {typeDeviceUuid} from '../device-types/type-devices-api'

export type DataSession=Readonly<Schema<'DeviceTcpDataSessionResponse'>>
export type DataMessage=Readonly<Schema<'DeviceDataStreamMessageResponse'>>
export type DataDirection='UP'|'DOWN'
export type DataIntent=Readonly<{project:string;device:string;key:string;session:DataSession;body:Readonly<Schema<'CreateDeviceDataStreamDownlinkRequest'>>}>
export type DataTransport={current:(project:string,device:string,signal:AbortSignal)=>Promise<DataSession>;history:(project:string,device:string,direction:DataDirection,signal:AbortSignal)=>Promise<readonly DataMessage[]>;create:(intent:DataIntent,signal:AbortSignal)=>Promise<DataMessage>;original:(intent:DataIntent,signal:AbortSignal)=>Promise<DataMessage>}
const contract='TL_TCP_DATA_V1',rawContract='TL_TCP_RAW_V1',maximum=65504,formats=['HEX','TEXT','JSON'],v7=/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,hex=/^[0-9a-f]{64}$/,stream=/^[A-Za-z0-9_-]{1,64}$/
function invalid():never{throw new Error('DATA原件身份、固定发布或字节与合同不符，请继续核对原请求')}
function object(value:unknown,keys:readonly string[]){if(!value||typeof value!=='object'||Array.isArray(value))invalid();const row=value as Record<string,unknown>;if(Object.keys(row).length!==keys.length||keys.some(k=>!Object.hasOwn(row,k)))invalid();return row}
function profiled(value:unknown,keys:readonly string[]):Record<string,unknown>&{wireProfile:'TL_TCP_DATA_V1'|'TL_TCP_RAW_V1'}{
 const legacy=!!value&&typeof value==='object'&&!Object.hasOwn(value,'wireProfile'),row=object(value,legacy?keys:[...keys,'wireProfile']),wireProfile=legacy?contract:row.wireProfile
 if(wireProfile!==contract&&wireProfile!==rawContract)invalid()
 return {...row,wireProfile}
}
export function dataApplicationBytes(rawBytes:number,wireProfile:'TL_TCP_DATA_V1'|'TL_TCP_RAW_V1'){return rawBytes+(wireProfile===rawContract?0:32)}
const date=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)&&Number.isFinite(Date.parse(value))
const revision=(value:unknown,positive=false):value is string=>typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n&&(!positive||BigInt(value)>0n)
export function decodeDataSession(value:unknown):DataSession{
 const r=profiled(value,['contract','connectionId','deviceTypeId','generation','configVersion','available','publicationId','publicationRevision','publicationPublishedAt','definitionDigest','streamIdentifier','format','maximumRawBytes'])
 if(r.contract!==contract||typeof r.connectionId!=='string'||!typeDeviceUuid.test(r.connectionId)||typeof r.deviceTypeId!=='string'||!typeDeviceUuid.test(r.deviceTypeId)||!revision(r.generation,true)||!revision(r.configVersion)||typeof r.available!=='boolean'||r.maximumRawBytes!==maximum)invalid()
 if(r.publicationId===null){if(r.publicationRevision!=='0'||r.publicationPublishedAt!==null||r.definitionDigest!==null||r.streamIdentifier!==null||r.format!==null||r.available)invalid()}
 else if(typeof r.publicationId!=='string'||!v7.test(r.publicationId)||!revision(r.publicationRevision,true)||!date(r.publicationPublishedAt)||typeof r.definitionDigest!=='string'||!hex.test(r.definitionDigest))invalid()
 if(r.streamIdentifier===null){if(r.format!==null||r.available)invalid()}else if(typeof r.streamIdentifier!=='string'||!stream.test(r.streamIdentifier)||typeof r.format!=='string'||!formats.includes(r.format)||!r.available)invalid()
 return Object.freeze({...r}) as DataSession
}
export function dataBytes(text:string,mode:'HEX'|'UTF8'):Uint8Array{
 let bytes:Uint8Array
 if(mode==='HEX'){const compact=text.replace(/[ \t\r\n]/g,'');if(!/^(?:[0-9a-fA-F]{2})*$/.test(compact))throw new Error('HEX需为完整双位字节，可用空格或换行分隔');bytes=Uint8Array.from(compact.match(/../g)||[],pair=>parseInt(pair,16))}
 else{bytes=new TextEncoder().encode(text);if(new TextDecoder('utf-8',{fatal:true}).decode(bytes)!==text)throw new Error('原文含无效Unicode，不能静默替换字节')}
 if(bytes.length>maximum)throw new Error('DATA原字节最多65504字节');return bytes
}
export function dataHex(bytes:Uint8Array){return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join(' ')}
export function dataBase64(bytes:Uint8Array){let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw)}
export function dataFromBase64(value:string){if(value.length>87340)invalid();try{const raw=atob(value),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(dataBase64(bytes)!==value||bytes.length>maximum)invalid();return bytes}catch{invalid()}}
const sha=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('')
const uuidBytes=(id:string)=>Uint8Array.from(id.replaceAll('-','').match(/../g)!,pair=>parseInt(pair,16))
export async function dataWireDigest(message:string,publication:string,raw:Uint8Array,wireProfile:'TL_TCP_DATA_V1'|'TL_TCP_RAW_V1'=contract){if(!v7.test(message)||!v7.test(publication))invalid();if(wireProfile===rawContract)return sha(raw);if(wireProfile!==contract)invalid();const bytes=new Uint8Array(32+raw.length);bytes.set(uuidBytes(message));bytes.set(uuidBytes(publication),16);bytes.set(raw,32);return sha(bytes)}
export async function decodeDataMessage(value:unknown,direction:DataDirection):Promise<DataMessage>{
 const r=profiled(value,['messageId','direction','connectionId','publicationId','streamIdentifier','format','wireDigest','rawDigest','rawBytes','applicationBytes','decodeStatus','receivedAt','acceptedAt','state','sentAt','acknowledgedAt','expiresAt','payloadBase64'])
 for(const k of ['messageId','publicationId'])if(typeof r[k]!=='string'||!v7.test(r[k] as string))invalid()
 if(typeof r.connectionId!=='string'||!typeDeviceUuid.test(r.connectionId))invalid()
 if(r.direction!==direction||typeof r.streamIdentifier!=='string'||!stream.test(r.streamIdentifier)||typeof r.format!=='string'||!formats.includes(r.format)||typeof r.wireDigest!=='string'||!hex.test(r.wireDigest)||typeof r.rawDigest!=='string'||!hex.test(r.rawDigest)||typeof r.rawBytes!=='number'||!Number.isInteger(r.rawBytes)||r.rawBytes<0||r.rawBytes>maximum||r.wireProfile===rawContract&&r.rawBytes===0||r.applicationBytes!==dataApplicationBytes(r.rawBytes,r.wireProfile)||!date(r.receivedAt)||!date(r.acceptedAt)||typeof r.decodeStatus!=='string'||!['DECODED','INVALID_UTF8','INVALID_JSON'].includes(r.decodeStatus))invalid()
 if(r.wireProfile===rawContract&&(r.wireDigest!==r.rawDigest||r.state==='ACKED'||r.acknowledgedAt!==null))invalid()
 if(r.format==='HEX'&&r.decodeStatus!=='DECODED'||r.format==='TEXT'&&r.decodeStatus==='INVALID_JSON')invalid()
 for(const k of ['sentAt','acknowledgedAt','expiresAt'])if(r[k]!==null&&!date(r[k]))invalid()
 if(direction==='UP'){if(r.state!=='ACCEPTED'||r.sentAt!==null||r.acknowledgedAt!==null||r.expiresAt!==null)invalid()}
 else if(typeof r.state!=='string'||!['PENDING','SENDING','SENT','UNKNOWN','ACKED'].includes(r.state)||r.expiresAt===null||(r.state==='ACKED')!==(r.acknowledgedAt!==null)||r.state==='SENT'&&r.sentAt===null)invalid()
 if(r.payloadBase64!==null){if(typeof r.payloadBase64!=='string')invalid();const bytes=dataFromBase64(r.payloadBase64);if(bytes.length!==r.rawBytes||await sha(bytes)!==r.rawDigest||await dataWireDigest(r.messageId as string,r.publicationId as string,bytes,r.wireProfile)!==r.wireDigest)invalid()}
 return Object.freeze({...r}) as DataMessage
}
function path(project:string,device:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(device))invalid();return `/api/v1/projects/${project}/devices/${device}` as const}
export function prepareDataDownlink(project:string,device:string,session:DataSession,bytes:Uint8Array,lifetime:number):DataIntent{
 path(project,device);const current=decodeDataSession(session);if(current.wireProfile===rawContract&&bytes.length===0)throw new Error('TCP透传下行至少需要1字节');if(!current.available||!current.publicationId||bytes.length>maximum||!Number.isInteger(lifetime)||lifetime<1||lifetime>300)throw new Error('下行需当前固定DATA发布、合法原字节与1至300秒期限')
 return Object.freeze({project,device,key:crypto.randomUUID(),session:current,body:Object.freeze({connectionId:current.connectionId,publicationId:current.publicationId,payloadBase64:dataBase64(bytes),expiresInSeconds:lifetime})})
}
export async function matchDataOriginal(value:DataMessage,intent:DataIntent):Promise<DataMessage>{
 if(value.direction!=='DOWN'||value.wireProfile!==intent.session.wireProfile||value.connectionId!==intent.body.connectionId||value.publicationId!==intent.body.publicationId||value.streamIdentifier!==intent.session.streamIdentifier||value.format!==intent.session.format||value.payloadBase64!==null&&value.payloadBase64!==intent.body.payloadBase64||value.expiresAt===null||Date.parse(value.expiresAt)-Date.parse(value.receivedAt)!==intent.body.expiresInSeconds*1000)invalid();const raw=dataFromBase64(intent.body.payloadBase64);if(value.rawBytes!==raw.length||value.applicationBytes!==dataApplicationBytes(raw.length,intent.session.wireProfile)||value.rawDigest!==await sha(raw)||value.wireDigest!==await dataWireDigest(value.messageId,intent.body.publicationId,raw,intent.session.wireProfile))invalid();return value
}
export const dataTransport:DataTransport={
 async current(project,device,signal){return decodeDataSession(await api<unknown>(`${path(project,device)}/data-stream-runtime`,{signal,maxResponseBytes:16384}))},
 async history(project,device,direction,signal){const values=await api<unknown>(`${path(project,device)}/data-stream-messages`,{signal,query:{direction,limit:20},maxResponseBytes:2*1024*1024});if(!Array.isArray(values)||values.length>20)invalid();const rows=await Promise.all(values.map(value=>decodeDataMessage(value,direction)));if(new Set(rows.map(x=>x.messageId)).size!==rows.length)invalid();return Object.freeze(rows)},
 async create(intent,signal){return matchDataOriginal(await decodeDataMessage(await api<unknown>(`${path(intent.project,intent.device)}/data-stream-downlinks`,{method:'post',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,maxResponseBytes:128*1024}),'DOWN'),intent)},
 async original(intent,signal){return matchDataOriginal(await decodeDataMessage(await api<unknown>(`${path(intent.project,intent.device)}/data-stream-downlinks/by-key`,{headers:{'Original-Request-Key':intent.key},signal,maxResponseBytes:128*1024}),'DOWN'),intent)},
}
