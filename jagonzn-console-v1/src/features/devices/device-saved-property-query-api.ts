import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {decodePropertyQueryResult,type PropertyQueryIntent,type PropertyQueryResult} from './device-property-query-api'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
export type SavedPropertyQuery=Readonly<Required<Schema<'DeviceSavedPropertyQueryResponse'>>>
export type SavedQueryIntent=Readonly<{project:string;key:string;kind:'CREATE'|'CHANGE'|'DELETE';id?:string;expectedRevision?:string;name?:string;expression?:string;expressionDigest?:string}>
export interface SavedPropertyQueryTransport {
 list(project:string,signal:AbortSignal):Promise<readonly SavedPropertyQuery[]>
 versions(project:string,id:string,signal:AbortSignal):Promise<readonly SavedPropertyQuery[]>
 write(intent:SavedQueryIntent,signal:AbortSignal):Promise<SavedPropertyQuery|undefined>
 recover(intent:SavedQueryIntent,signal:AbortSignal):Promise<SavedPropertyQuery>
 execute(saved:SavedPropertyQuery,intent:PropertyQueryIntent,signal:AbortSignal):Promise<PropertyQueryResult>
}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,fields=['id','projectId','revision','currentRevision','name','grammarVersion','expression','expressionDigest','createdAt','versionCreatedAt','deleted']
function object(value:StrictJsonValue|undefined):value is StrictJsonObject{return value!==undefined&&value!==null&&typeof value==='object'&&!Array.isArray(value)&&!isStrictJsonNumber(value)}
async function hash(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('')}
function revision(value:StrictJsonValue|undefined){if(typeof value!=='string'||!/^([1-9]|[1-4][0-9]|50)$/.test(value))throw new Error('保存查询版本无效');return value}
function timestamp(value:StrictJsonValue|undefined){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error('保存查询时刻无效');return value}
export async function decodeSavedPropertyQuery(value:StrictJsonValue|undefined,project:string,id?:string):Promise<SavedPropertyQuery>{
 if(!object(value)||Object.keys(value).length!==fields.length||Object.keys(value).some(field=>!fields.includes(field))||typeof value.id!=='string'||!uuid.test(value.id)||id!==undefined&&value.id!==id||value.projectId!==project||value.grammarVersion!=='DEVICE_PROPERTY_QUERY_V1'||typeof value.deleted!=='boolean')throw new Error('保存查询身份或结构不一致')
 const v=revision(value.revision),currentRevision=revision(value.currentRevision)
 if(Number(v)>Number(currentRevision)||typeof value.name!=='string'||!value.name.trim()||value.name.length>128||typeof value.expression!=='string'||new TextEncoder().encode(value.expression).byteLength>8192||!value.expression.trim()||(/[\uD800-\uDFFF]/u.test(value.name)||/[\uD800-\uDFFF]/u.test(value.expression))||typeof value.expressionDigest!=='string'||!/^[0-9a-f]{64}$/.test(value.expressionDigest)||await hash(value.expression)!==value.expressionDigest)throw new Error('保存查询原文或版本摘要无效')
 return{id:value.id,projectId:project,revision:v,currentRevision,name:value.name,grammarVersion:'DEVICE_PROPERTY_QUERY_V1',expression:value.expression,expressionDigest:value.expressionDigest,createdAt:timestamp(value.createdAt),versionCreatedAt:timestamp(value.versionCreatedAt),deleted:value.deleted}
}
export async function prepareSavedQuery(project:string,kind:SavedQueryIntent['kind'],name:string,expression:string,base?:SavedPropertyQuery):Promise<SavedQueryIntent>{
 if(!uuid.test(project)||kind!=='CREATE'&&(!base||base.projectId!==project||base.deleted))throw new Error('保存查询范围无效')
 if(kind!=='DELETE'&&(/[\uD800-\uDFFF]/u.test(name)||/[\uD800-\uDFFF]/u.test(expression)||!name.trim()||name.trim().length>128||/[\u0000-\u001f\u007f]/.test(name)||!expression.trim()||new TextEncoder().encode(expression).byteLength>8192))throw new Error('请填写有效查询名称和条件')
 if(kind==='CHANGE'&&base?.currentRevision==='50')throw new Error('已达到50个版本，请另存为新查询')
 return Object.freeze({project,kind,key:crypto.randomUUID(),...(kind==='CREATE'?{}:{id:base!.id,expectedRevision:base!.currentRevision}),...(kind==='DELETE'?{}:{name:name.trim(),expression,expressionDigest:await hash(expression)})})
}
export function savedQueryMatches(row:SavedPropertyQuery,intent:SavedQueryIntent){
 if(row.projectId!==intent.project||intent.id&&row.id!==intent.id)return false
 if(intent.kind==='DELETE')return row.deleted&&row.currentRevision===intent.expectedRevision
 return row.name===intent.name&&row.expression===intent.expression&&row.expressionDigest===intent.expressionDigest&&row.revision===(intent.kind==='CREATE'?'1':String(Number(intent.expectedRevision)+1))
}
const base=(project:string)=>`/api/v1/projects/${project}/device-property-queries` as const
export const savedPropertyQueryTransport:SavedPropertyQueryTransport={
 async list(project,signal){const root=parseDashboardRuntimeResponse(await api<Uint8Array>(base(project),{signal,responseType:'bytes',maxResponseBytes:4*1024*1024}));if(!object(root)||Object.keys(root).length!==5||!Array.isArray(root.items)||root.items.length>100||root.total!==String(root.items.length)||!isStrictJsonNumber(root.maximumActiveDefinitions)||root.maximumActiveDefinitions.lexical!=='100'||!isStrictJsonNumber(root.maximumRetainedDefinitions)||root.maximumRetainedDefinitions.lexical!=='500'||!isStrictJsonNumber(root.maximumVersions)||root.maximumVersions.lexical!=='50')throw new Error('保存查询完整目录无效');const items=await Promise.all(root.items.map(row=>decodeSavedPropertyQuery(row,project)));if(items.some(row=>row.deleted||row.revision!==row.currentRevision)||new Set(items.map(row=>row.id)).size!==items.length)throw new Error('保存查询目录重复或版本不一致');return items},
 async versions(project,id,signal){
  const bytes=await api<Uint8Array>(`${base(project)}/${id}/versions`,{signal,responseType:'bytes',maxResponseBytes:4*1024*1024})
  // 版本端点返回根数组，沿既有定义列表的信封方式复用精确JSON读取，保留字段与数字校验。
  const prefix=new TextEncoder().encode('{"items":'),wrapped=new Uint8Array(prefix.length+bytes.length+1);wrapped.set(prefix);wrapped.set(bytes,prefix.length);wrapped[wrapped.length-1]=125
  const root=parseDashboardRuntimeResponse(wrapped).items
  if(!Array.isArray(root)||!root.length||root.length>50)throw new Error('保存查询版本目录无效')
  const rows=await Promise.all(root.map(row=>decodeSavedPropertyQuery(row,project,id)))
  if(rows.some(row=>row.deleted)||new Set(rows.map(row=>row.revision)).size!==rows.length||rows.some((row,i)=>Number(row.revision)!==rows.length-i||row.currentRevision!==String(rows.length)))throw new Error('保存查询版本集合不完整')
  return rows
 },
 async write(intent,signal){
  const headers={'Idempotency-Key':intent.key}
  if(intent.kind==='DELETE'){
   if(!intent.id||!intent.expectedRevision)throw new Error('删除原意图不完整')
   await api(`${base(intent.project)}/${intent.id}`,{method:'delete',headers,body:{expectedRevision:intent.expectedRevision},signal});return
  }
  if(intent.name===undefined||intent.expression===undefined)throw new Error('保存原意图不完整')
  const options={headers,signal,responseType:'bytes' as const,maxResponseBytes:4*1024*1024}
  let bytes:Uint8Array
  if(intent.kind==='CREATE'){
   const body:Schema<'CreateDeviceSavedPropertyQueryRequest'>={name:intent.name,expression:intent.expression}
   bytes=await api<Uint8Array>(base(intent.project),{...options,method:'post',body})
  }else{
   if(!intent.id||!intent.expectedRevision)throw new Error('保存原版本不完整')
   const body:Schema<'ChangeDeviceSavedPropertyQueryRequest'>={name:intent.name,expression:intent.expression,expectedRevision:intent.expectedRevision}
   bytes=await api<Uint8Array>(`${base(intent.project)}/${intent.id}`,{...options,method:'put',body})
  }
  return decodeSavedPropertyQuery(parseDashboardRuntimeResponse(bytes),intent.project,intent.id)
 },
 async recover(intent,signal){const path=intent.kind==='CREATE'?`/api/v1/projects/${intent.project}/device-property-query-creations/by-key` as const:`${base(intent.project)}/${intent.id!}/requests/by-key` as const;return decodeSavedPropertyQuery(parseDashboardRuntimeResponse(await api<Uint8Array>(path,{signal,headers:{'Original-Request-Key':intent.key},query:intent.kind==='CREATE'?undefined:{operation:intent.kind},responseType:'bytes',maxResponseBytes:4*1024*1024})),intent.project,intent.id)},
 async execute(saved,intent,signal){
  if(saved.projectId!==intent.project||!uuid.test(saved.id)||saved.deleted||revision(saved.revision)!==saved.revision||saved.expression!==intent.body.expression||saved.expressionDigest!==intent.digest)throw new Error('保存查询原版本与当前条件不一致')
  const body:Schema<'ExecuteDeviceSavedPropertyQueryRequest'>={...(intent.body.deviceTypeId?{deviceTypeId:intent.body.deviceTypeId}:{}),...(intent.body.deviceIds?{deviceIds:[...intent.body.deviceIds]}:{})}
  const root=parseDashboardRuntimeResponse(await api<Uint8Array>(`${base(intent.project)}/${saved.id}/versions/${saved.revision}/execute`,{method:'post',body,signal,responseType:'bytes',maxResponseBytes:4*1024*1024}))
  if(!object(root)||Object.keys(root).length!==2||!Object.hasOwn(root,'savedQuery')||!Object.hasOwn(root,'result'))throw new Error('保存查询执行响应不完整')
  const actual=await decodeSavedPropertyQuery(root.savedQuery,intent.project,saved.id)
  if(actual.deleted||actual.revision!==saved.revision||actual.expression!==saved.expression||actual.expressionDigest!==saved.expressionDigest)throw new Error('执行响应与保存查询原版本不一致')
  // 先对完整响应严格读取并拒绝重复键；结果闭集全部为字符串/数组/空值，复用原完整结果校验。
  return decodePropertyQueryResult(new TextEncoder().encode(JSON.stringify(root.result)),intent)
 }
}
