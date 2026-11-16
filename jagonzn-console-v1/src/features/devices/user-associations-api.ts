import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {api,ApiError,IdentityChanged} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'

export type DeviceUserAssociation=Schema<'ConsoleDeviceUserAssociationResponse'>
export type DeviceUserCandidate=Schema<'ConsoleDeviceUserAssociationCandidateResponse'>
export type UserPage<T>=Omit<Required<Schema<'CursorPageConsoleDeviceUserAssociationCandidateResponse'>>,'items'>&{items:T[]}
export type AssociationAction=Schema<'ConsoleDeviceUserAssociationOperationResponse'>['action']
export type AssociationOperation=Schema<'ConsoleDeviceUserAssociationOperationResponse'>
export type PreparedAssociationOperation=Readonly<{project:string;device:string;operationId:string;action:AssociationAction;targetIds:readonly string[];key:string;rawBody:string}>
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
function fail():never{throw new Error('用户关联响应不符合当前合同，请重新读取。')}
function object(value:StrictJsonValue|undefined):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return fail();return value as StrictJsonObject}
function id(value:StrictJsonValue|undefined):string{if(typeof value!=='string'||!uuid.test(value))return fail();return value.toLowerCase()}
function name(value:StrictJsonValue|undefined):string|null{if(value===null)return null;if(typeof value!=='string'||Array.from(value).length>128)return fail();return value}
function account(value:StrictJsonValue|undefined):string{if(typeof value!=='string'||!value.trim()||Array.from(value).length>64)return fail();return value}
function time(value:StrictJsonValue|undefined):string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value.slice(0,10))return fail()
 return value
}
function ids(value:StrictJsonValue|undefined){if(!Array.isArray(value)||!value.length||value.length>200)return fail();const result=value.map(id);if(new Set(result).size!==result.length)return fail();return result}
function page<T>(bytes:Uint8Array,limit:number,decode:(row:StrictJsonObject)=>T,key:(row:T)=>string):UserPage<T>{
 const root=parseDashboardRuntimeResponse(bytes)
 if(!Number.isSafeInteger(limit)||limit<1||limit>50||!Array.isArray(root.items)||root.items.length>limit||typeof root.hasMore!=='boolean')fail()
 const cursor=root.nextCursor
 if(cursor!==null&&(typeof cursor!=='string'||!cursor||cursor.length>8192)||root.hasMore!==!!cursor||root.hasMore&&!root.items.length)fail()
 const items=root.items.map(value=>decode(object(value)))
 if(new Set(items.map(key)).size!==items.length)fail()
 return{items,nextCursor:cursor as string|null,hasMore:root.hasMore}
}
export function decodeUserAssociations(bytes:Uint8Array,limit:number):UserPage<DeviceUserAssociation>{
 const result=page(bytes,limit,row=>({bindingId:id(row.bindingId),appUserId:id(row.appUserId),displayName:name(row.displayName),username:account(row.username),lastVisitedAt:row.lastVisitedAt===null?null:time(row.lastVisitedAt)}),row=>row.bindingId)
 if(new Set(result.items.map(row=>row.appUserId)).size!==result.items.length)fail()
 return result
}
export function decodeUserCandidates(bytes:Uint8Array,limit:number):UserPage<DeviceUserCandidate>{return page(bytes,limit,row=>({appUserId:id(row.appUserId),displayName:name(row.displayName),username:account(row.username)}),row=>row.appUserId)}
export async function readUserAssociations(project:string,device:string,cursor:string|undefined,signal:AbortSignal){
 const bytes=await api<Uint8Array>(`${devicePath(project,device)}/user-associations`,{query:{limit:50,cursor},signal,responseType:'bytes',maxResponseBytes:1024*1024})
 return decodeUserAssociations(bytes,50)
}
export async function readUserCandidates(project:string,device:string,query:string,cursor:string|undefined,signal:AbortSignal){
 const bytes=await api<Uint8Array>(`${devicePath(project,device)}/user-association-candidates`,{query:{query,limit:50,cursor},signal,responseType:'bytes',maxResponseBytes:1024*1024})
 return decodeUserCandidates(bytes,50)
}
export function prepareAssociationOperation(project:string,device:string,action:AssociationAction,targets:string[]):PreparedAssociationOperation{
 if(action!=='ADD'&&action!=='REMOVE')throw new Error('用户关联动作无效')
 project=id(project);device=id(device)
 const canonical=targets.map(value=>id(value)).sort()
 if(!canonical.length||canonical.length>200||new Set(canonical).size!==canonical.length)throw new Error('请选择一至二百个不同目标；不会截断或自动拆批。')
 const operationId=crypto.randomUUID(),key=crypto.randomUUID()
 const body:Schema<'AddConsoleDeviceUserAssociationsRequest'>|Schema<'RemoveConsoleDeviceUserAssociationsRequest'>=action==='ADD'?{operationId,appUserIds:canonical}:{operationId,bindingIds:canonical}
 return Object.freeze({project,device,operationId,action,targetIds:Object.freeze(canonical),key,rawBody:JSON.stringify(body)})
}
export function decodeAssociationOperation(bytes:Uint8Array,expected:PreparedAssociationOperation):AssociationOperation{
 const root=parseDashboardRuntimeResponse(bytes),targets=ids(root.targetIds),bindings=ids(root.bindingIds)
 if(id(root.operationId)!==expected.operationId||id(root.deviceId)!==expected.device||root.action!==expected.action||JSON.stringify(targets)!==JSON.stringify(expected.targetIds)||bindings.length!==targets.length||expected.action==='REMOVE'&&JSON.stringify(bindings)!==JSON.stringify(targets))fail()
 return{operationId:expected.operationId,deviceId:expected.device,action:expected.action,targetIds:targets,bindingIds:bindings,completedAt:time(root.completedAt)}
}
export async function recoverAssociationOperation(operation:PreparedAssociationOperation,signal:AbortSignal){
 const bytes=await api<Uint8Array>(`${devicePath(operation.project,operation.device)}/user-association-operations/${operation.operationId}`,{signal,responseType:'bytes',maxResponseBytes:256*1024})
 return decodeAssociationOperation(bytes,operation)
}
export async function applyAssociationOperation(operation:PreparedAssociationOperation,signal:AbortSignal):Promise<AssociationOperation>{
 try{
  const bytes=await api<Uint8Array>(`${devicePath(operation.project,operation.device)}/${operation.action==='ADD'?'user-associations':'user-association-removals'}`,{method:'post',rawBody:operation.rawBody,headers:{'Content-Type':'application/json','Idempotency-Key':operation.key},signal,responseType:'bytes',maxResponseBytes:256*1024})
  try{return decodeAssociationOperation(bytes,operation)}catch(error){throw new ApiError(error instanceof Error?error.message:'关联操作回执无效',200,undefined,undefined,true)}
 }catch(error){
  if(signal.aborted||error instanceof IdentityChanged)throw error
  if(error instanceof ApiError&&(error.outcomeUnknown||error.code===10014)){
   try{return await recoverAssociationOperation(operation,signal)}catch(recovery){
    if(signal.aborted||recovery instanceof IdentityChanged)throw recovery
    throw new ApiError('结果未确认，请保留当前选择并重新读取核对；本次操作不会自动重发。',0,undefined,undefined,true)
   }
  }
  throw error
 }
}
