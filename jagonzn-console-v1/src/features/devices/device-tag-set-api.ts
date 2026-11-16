import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonValue,type StrictJsonObject} from '@things-link/client-contracts/dashboard/v1'
import {tagKeyError,tagValueError,validateTagRows,type DeviceTagRow} from './tag-rules'

export type DeviceTagSet=Schema<'DeviceTagSetResponse'>
export type DeviceTagSetIntent=Readonly<{project:string;device:string;expectedRevision:string;tags:readonly Readonly<DeviceTagRow>[];previousTags:readonly Readonly<DeviceTagRow>[]}>
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const revision=(value:unknown):value is string=>typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n
const fail=():never=>{throw new Error('设备标签完整集合或版本资料无效，请重新读取核对')}
function object(value:StrictJsonValue,keys:string[]):StrictJsonObject {
 if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))return fail()
 return value as StrictJsonObject
}
/** 只接受当前设备的完整有界快照，旧单键数组或被截断资料不能作为全集保存前提。 */
export function decodeDeviceTagSet(bytes:Uint8Array,device:string):DeviceTagSet {
 if(bytes.byteLength>262144||!uuid.test(device))fail()
 const value=object(parseDashboardRuntimeResponse(bytes),['deviceId','revision','tags'])
 if(value.deviceId!==device||!revision(value.revision)||!Array.isArray(value.tags)||value.tags.length>200)fail()
 const keys=new Set<string>()
 const tags=(value.tags as StrictJsonValue[]).map(raw=>{
  const row=object(raw,['key','value'])
  if(typeof row.key!=='string'||typeof row.value!=='string'||tagKeyError(row.key)||tagValueError(row.value)||keys.has(row.key))fail()
  keys.add(row.key as string);return {key:row.key as string,value:row.value as string}
 })
 return {deviceId:device,revision:value.revision as string,tags}
}
export function readDeviceTagSet(project:string,device:string,signal:AbortSignal) {
 if(!uuid.test(project)||!uuid.test(device))fail()
 return api<Uint8Array>(`${devicePath(project,device)}/tag-set`,{signal,responseType:'bytes',maxResponseBytes:262144})
}
function sameRows(left:readonly DeviceTagRow[],right:readonly DeviceTagRow[]) {
 const values=new Map(left.map(row=>[row.key,row.value]));return left.length===right.length&&right.every(row=>values.has(row.key)&&values.get(row.key)===row.value)
}
/** 完整复制原始文本和读取时版本；占位空行不成为标签，重复键不能静默覆盖。 */
export function prepareDeviceTagSet(project:string,device:string,snapshot:DeviceTagSet,rows:readonly DeviceTagRow[]):DeviceTagSetIntent {
 if(!uuid.test(project)||!uuid.test(device)||snapshot.deviceId!==device||!revision(snapshot.revision))fail()
 const tags=validateTagRows(rows),body={expectedRevision:snapshot.revision,tags} satisfies Schema<'ReplaceDeviceTagSetRequest'>
 if(new TextEncoder().encode(JSON.stringify(body)).byteLength>32768)throw new Error('标签完整内容超过本次保存范围')
 return Object.freeze({project,device,expectedRevision:snapshot.revision,tags:Object.freeze(tags.map(row=>Object.freeze({...row}))),previousTags:Object.freeze(snapshot.tags.map(row=>Object.freeze({...row})))})
}
export function submitDeviceTagSet(intent:DeviceTagSetIntent,signal:AbortSignal) {
 const body={expectedRevision:intent.expectedRevision,tags:intent.tags.map(row=>({...row}))} satisfies Schema<'ReplaceDeviceTagSetRequest'>
 return api<Uint8Array>(`${devicePath(intent.project,intent.device)}/tag-set`,{method:'put',body,signal,responseType:'bytes',maxResponseBytes:262144})
}
/** 校验同事务回执的完整内容；坏2xx属于待核对结果，不能隐式重传。 */
export function verifyDeviceTagSetWrite(bytes:Uint8Array,intent:DeviceTagSetIntent):DeviceTagSet {
 const value=decodeDeviceTagSet(bytes,intent.device),before=BigInt(intent.expectedRevision),after=BigInt(value.revision)
 if(!sameRows(value.tags,intent.tags)||after<before||(!sameRows(intent.previousTags,intent.tags)&&after===before))fail()
 return value
}
