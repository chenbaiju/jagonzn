import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'
export type LogicalPresence=Readonly<Required<Schema<'DeviceLogicalPresenceObservationResponse'>>>
export function decodeLogicalPresence(value:unknown,deviceId:string):LogicalPresence{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('逻辑在线观察不完整');const raw=value as Record<string,unknown>,fields=['deviceId','mode','state','transportStatus','onlineTimeoutMinutes','observedAt','lastQualifiedCommunicationAt'];
 if(Object.keys(raw).length!==7||fields.some(k=>!Object.hasOwn(raw,k))||raw.deviceId!==deviceId||!['INACTIVE','ONLINE','OFFLINE'].includes(String(raw.transportStatus))||!['INACTIVE','ONLINE','OFFLINE','UNKNOWN'].includes(String(raw.state)))throw new Error('逻辑在线观察身份或状态不符')
 const qualified=raw.mode==='QUALIFIED_COMMUNICATION',legacy=raw.mode==='LEGACY_TRANSPORT',unavailable=raw.mode==='UNAVAILABLE',validTime=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v))
 if(!qualified&&!legacy&&!unavailable||qualified&&(!(typeof raw.onlineTimeoutMinutes==='number'&&Number.isInteger(raw.onlineTimeoutMinutes)&&raw.onlineTimeoutMinutes>=1&&raw.onlineTimeoutMinutes<=5000)||raw.state==='INACTIVE')||!qualified&&raw.onlineTimeoutMinutes!==null||legacy&&raw.state!==raw.transportStatus||unavailable&&raw.state!=='UNKNOWN'||!validTime(raw.observedAt)||raw.lastQualifiedCommunicationAt!==null&&(!validTime(raw.lastQualifiedCommunicationAt)||Date.parse(raw.lastQualifiedCommunicationAt as string)>Date.parse(raw.observedAt as string)))throw new Error('逻辑在线来源或时刻不符')
 return Object.freeze({deviceId,mode:raw.mode as LogicalPresence['mode'],state:raw.state as LogicalPresence['state'],transportStatus:raw.transportStatus as LogicalPresence['transportStatus'],onlineTimeoutMinutes:raw.onlineTimeoutMinutes as number|null,observedAt:raw.observedAt as string,lastQualifiedCommunicationAt:raw.lastQualifiedCommunicationAt as string|null})
}
export async function readLogicalPresence(project:string,device:string,signal:AbortSignal){return decodeLogicalPresence(await api<Schema<'DeviceLogicalPresenceObservationResponse'>>(`${devicePath(project,device)}/logical-presence`,{signal,maxResponseBytes:8192}),device)}
