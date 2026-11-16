import {assertHistoryPageLocation} from './history-page-budget'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'

export const commandStatuses={ACCEPTED:'已受理',DISPATCHED:'已派发',ACKNOWLEDGED:'设备已确认收到',SUCCEEDED:'执行成功',FAILED:'失败',TIMED_OUT:'已超时'} as const
type Status=keyof typeof commandStatuses
export type CommandRow=Omit<Schema<'DeviceCommandHistoryResponse'>,'commandKey'|'completedAt'|'status'|'dispatchedAt'|'repliedAt'>&{commandKey:string|null;completedAt:string|null;status:Status;dispatchedAt:string|null;repliedAt:string|null}
export type CommandPage={items:CommandRow[];nextCursor:string|null;hasMore:boolean}
export type CommandDetail=Omit<Required<Schema<'DeviceCommandResponse'>>,'input'|'output'|'attempts'|'status'|'commandKey'|'timeoutSeconds'|'failureCode'|'failureMessage'|'dispatchedAt'|'acknowledgedAt'|'completedAt'|'repliedAt'>&{
  commandKey:string|null;status:Status;inputText:string;outputText:string|null;timeoutSeconds:number|null;
  failureCode:string|null;failureMessage:string|null;dispatchedAt:string|null;acknowledgedAt:string|null;completedAt:string|null;repliedAt:string|null;
  attempts:Array<{id:string;attemptNo:number;status:string;topic:string|null;deadlineAt:string|null;createdAt:string}>
}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
function fail():never{throw new Error('命令记录响应不符合读取合同，请重新读取。')}
function object(value:StrictJsonValue|undefined):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return fail();return value as StrictJsonObject}
function text(value:StrictJsonValue|undefined):string{if(typeof value!=='string'||!value)return fail();return value}
function identifier(value:StrictJsonValue|undefined):string{const result=text(value);if(!uuid.test(result))fail();return result}
function nullableText(value:StrictJsonValue|undefined):string|null{if(value===null||value===undefined)return null;if(typeof value!=='string')return fail();return value}
function currentDefinitionName(value:StrictJsonValue|undefined):string|null{if(value===null)return null;if(typeof value!=='string'||!value.trim()||value.length>128)return fail();return value}
function integer(value:StrictJsonValue|undefined):number{if(value===undefined||!isStrictJsonNumber(value)||!/^\d+$/.test(value.lexical))return fail();const n=Number(value.lexical);if(!Number.isSafeInteger(n))return fail();return n}
function time(value:StrictJsonValue|undefined):string{
 const result=text(value)
 if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(result)||!Number.isFinite(Date.parse(result))||new Date(result).toISOString().slice(0,10)!==result.slice(0,10))fail()
 return result
}
function nullableTime(value:StrictJsonValue|undefined){return value===null||value===undefined?null:time(value)}
/** 新阶段字段必须显式null或UTC原文；缺字段不降级为已读到未知值。 */
function phaseTime(value:StrictJsonObject,key:string){if(!Object.hasOwn(value,key))fail();return value[key]===null?null:time(value[key])}
function status(value:StrictJsonValue|undefined):Status{const result=text(value);if(!Object.hasOwn(commandStatuses,result))return fail();return result as Status}
function counts(value:StrictJsonObject){const attemptCount=integer(value.attemptCount),maxAttempts=integer(value.maxAttempts);if(maxAttempts<1||attemptCount>maxAttempts)fail();return{attemptCount,maxAttempts}}
/** 只展示HTTP响应中实际存在的数字词法，不把输入/回复转成JS浮点数。 */
function render(value:StrictJsonValue,depth=0,indent=2):string{
 if(isStrictJsonNumber(value))return value.lexical
 if(value===null||typeof value!=='object')return JSON.stringify(value)
 const pad=' '.repeat(indent*depth),inner=pad+' '.repeat(indent)
 if(Array.isArray(value))return value.length?`[\n${value.map(item=>inner+render(item,depth+1,indent)).join(',\n')}\n${pad}]`:'[]'
 const entries=Object.entries(value)
 return entries.length?`{\n${entries.map(([key,item])=>`${inner}${JSON.stringify(key)}: ${render(item,depth+1,indent)}`).join(',\n')}\n${pad}}`:'{}'
}
export function formatCommandJson(value:StrictJsonValue){return render(value,0,4)}
export function decodeCommandPage(bytes:Uint8Array,deviceId:string,limit:number):CommandPage{
 const root=parseDashboardRuntimeResponse(bytes)
 if(!Array.isArray(root.items)||root.items.length>limit||typeof root.hasMore!=='boolean')fail()
 const nextCursor=nullableText(root.nextCursor)
 if(root.hasMore!==!!nextCursor||nextCursor&&nextCursor.length>8192||root.hasMore&&!root.items.length)fail()
 const items=commandItems(root.items,deviceId,limit)
 return{items,nextCursor,hasMore:root.hasMore}
}
function commandItems(values:StrictJsonValue,deviceId:string,limit:number):CommandRow[]{
 if(!Array.isArray(values)||values.length>limit)fail()
 const ids=new Set<string>()
 return values.map(value=>{
  const item=object(value),id=identifier(item.id),commandKey=nullableText(item.commandKey),operationType=text(item.operationType),name=currentDefinitionName(item.currentDefinitionName)
  if(item.deviceId!==deviceId||ids.has(id)||!['COMMAND','PROPERTY_SET'].includes(operationType)||operationType==='COMMAND'&&!commandKey||operationType==='PROPERTY_SET'&&(commandKey!==null||name!==null))fail()
  ids.add(id)
  return{id,deviceId,operationType,commandKey,status:status(item.status),...counts(item),acceptedAt:time(item.acceptedAt),completedAt:nullableTime(item.completedAt),currentDefinitionName:name,dispatchedAt:phaseTime(item,'dispatchedAt'),repliedAt:phaseTime(item,'repliedAt')}
 })
}
export type CommandNumberPage=Omit<Schema<'ConsoleDeviceCommandPageResponse'>,'items'>&{items:CommandRow[]}
export function decodeCommandNumberPage(bytes:Uint8Array,deviceId:string,page:number,limit:number):CommandNumberPage{
 const root=parseDashboardRuntimeResponse(bytes)
 if(Object.keys(root).length!==3||integer(root.page)!==page||integer(root.limit)!==limit||!Object.hasOwn(root,'items'))fail()
 return{items:commandItems(root.items!,deviceId,limit),page,limit}
}
export async function readCommandNumberPage(project:string,device:string,page:number,limit:number,signal:AbortSignal){
 assertHistoryPageLocation(page,limit,50)
 const bytes=await api<Uint8Array>(`${devicePath(project,device)}/command-pages`,{query:{page,limit},signal,responseType:'bytes',maxResponseBytes:4*1024*1024})
 return decodeCommandNumberPage(bytes,device,page,limit)
}
export function decodeCommandDetail(bytes:Uint8Array,row:Pick<CommandRow,'id'|'deviceId'|'commandKey'>):CommandDetail{
 const root=parseDashboardRuntimeResponse(bytes)
 if(root.id!==row.id||root.deviceId!==row.deviceId||nullableText(root.commandKey)!==row.commandKey||!Array.isArray(root.attempts))fail()
 const name=currentDefinitionName(root.currentDefinitionName);if(row.commandKey===null&&name!==null)fail()
 const input=object(root.input),output=root.output===null||root.output===undefined?null:render(root.output)
 const count=counts(root),ids=new Set<string>(),numbers=new Set<number>()
 if(root.attempts.length>count.maxAttempts)fail()
 const attempts=root.attempts.map(value=>{
  const item=object(value),id=identifier(item.id),attemptNo=integer(item.attemptNo),state=text(item.status)
  if(ids.has(id)||numbers.has(attemptNo)||attemptNo<1||attemptNo>count.attemptCount||!['PENDING','PUBLISHED','ACKNOWLEDGED','SUCCEEDED','FAILED','TIMED_OUT'].includes(state))fail()
  ids.add(id);numbers.add(attemptNo)
  return{id,attemptNo,status:state,topic:nullableText(item.topic),deadlineAt:nullableTime(item.deadlineAt),createdAt:time(item.createdAt)}
 })
 const timeoutSeconds=root.timeoutSeconds===null||root.timeoutSeconds===undefined?null:integer(root.timeoutSeconds)
 return{id:row.id,deviceId:row.deviceId,connectionDeviceId:identifier(root.connectionDeviceId),commandKey:row.commandKey,status:status(root.status),...count,timeoutSeconds,
  inputText:render(input),outputText:output,failureCode:nullableText(root.failureCode),failureMessage:nullableText(root.failureMessage),acceptedAt:time(root.acceptedAt),
  dispatchedAt:nullableTime(root.dispatchedAt),acknowledgedAt:nullableTime(root.acknowledgedAt),completedAt:nullableTime(root.completedAt),attempts,currentDefinitionName:name,repliedAt:phaseTime(root,'repliedAt')}
}
export async function readCommandPage(project:string,device:string,cursor:string|undefined,limit:number,signal:AbortSignal){
 const bytes=await api<Uint8Array>(`${devicePath(project,device)}/commands`,{query:{cursor,limit},signal,responseType:'bytes',maxResponseBytes:4*1024*1024})
 return decodeCommandPage(bytes,device,limit)
}
export async function readCommandDetail(project:string,row:CommandRow,signal:AbortSignal){
 const bytes=await api<Uint8Array>(`${devicePath(project,row.deviceId)}/commands/${row.id}`,{signal,responseType:'bytes',maxResponseBytes:4*1024*1024})
 return decodeCommandDetail(bytes,row)
}
