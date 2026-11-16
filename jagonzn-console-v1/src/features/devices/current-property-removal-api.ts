import {api} from '@/core/http'
import type {Schema,paths} from '@/core/contracts'
import {devicePath} from './api'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {decodePlatformCurrent} from './platform-properties-json'
import {platformCurrent} from './platform-properties-api'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type RemovalObservation=Required<Schema<'ConsoleCurrentPropertyRemovalObservation'>>
export type RemovalReceipt=Required<Schema<'ConsoleCurrentPropertyRemovalResponse'>>&{observations:RemovalObservation[]}
function object(value:StrictJsonValue|undefined):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))throw new Error('移除回执不是完整对象');return value as StrictJsonObject}
function closed(value:StrictJsonObject,fields:readonly string[]){if(Object.keys(value).length!==fields.length||fields.some(f=>!Object.hasOwn(value,f)))throw new Error('移除回执字段不完整')}
function revision(value:StrictJsonValue|undefined):value is string|null{return value===null||typeof value==='string'&&/^[1-9][0-9]{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n}
export function prepareRemoval(model:string,keys:readonly string[]){
 if(!uuid.test(model)||!keys.length||keys.length>200||new Set(keys).size!==keys.length||keys.some(k=>!/^[_A-Za-z0-9-]{1,64}$/.test(k)))throw new Error('请选择完整有效的属性集合')
 const body=JSON.stringify({expectedModelVersionId:model,keys:[...keys]} satisfies Schema<'ConsoleCurrentPropertyRemovalRequest'>);if(new TextEncoder().encode(body).byteLength>32768)throw new Error('属性移除请求超过完整处理范围')
 return {body,keys:[...keys]}
}
/** 新HTTP路径及请求/回执结构直接绑定主控唯一生成的正式合同。 */
export function submitRemoval(project:string,device:string,body:string,key:string){
 return api<Uint8Array>(`${devicePath(project,device)}/current-properties/remove`,{method:'post',rawBody:body,responseType:'bytes',maxResponseBytes:262144,headers:{'Content-Type':'application/json','Idempotency-Key':key}})
}
/** 569正式只读原请求合同；原有序选择与原模型只用于核验真实回执，不重放删除。 */
export async function readRemovalSubmission(project:string,device:string,model:string,keys:readonly string[],key:string,bodyHash:string,signal?:AbortSignal){
 const headers:paths['/api/v1/projects/{projectId}/devices/{deviceId}/current-properties/removals/current']['get']['parameters']['header']={'Original-Request-Key':key,'X-Request-Body-SHA256':bodyHash}
 const bytes=await api<Uint8Array>(`${devicePath(project,device)}/current-properties/removals/current`,{headers,signal,responseType:'bytes',maxResponseBytes:262144})
 return decodeRemoval(bytes,project,device,model,keys)
}
/** 原字节闭合回执，任何坏成功都不能转成可重发失败。 */
export function decodeRemoval(bytes:Uint8Array,project:string,device:string,model:string,keys:readonly string[]):RemovalReceipt{
 const root=parseDashboardRuntimeResponse(bytes);closed(root,['operationId','projectId','deviceId','modelVersionId','removedAt','observations'])
 if(root.projectId!==project||root.deviceId!==device||root.modelVersionId!==model||typeof root.operationId!=='string'||!uuid.test(root.operationId)
  ||typeof root.removedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(root.removedAt)||!Number.isFinite(Date.parse(root.removedAt))||new Date(root.removedAt).toISOString().slice(0,10)!==root.removedAt.slice(0,10)
  ||!Array.isArray(root.observations)||root.observations.length!==keys.length)throw new Error('移除回执身份不完整，请刷新核对')
 const observations=root.observations.map((raw,index)=>{
  const row=object(raw);closed(row,['propertyKey','reportedRevision','removedPlatformOperationId','reportedValueRemoved'])
  if(row.propertyKey!==keys[index]||!revision(row.reportedRevision)||!(row.removedPlatformOperationId===null||typeof row.removedPlatformOperationId==='string'&&uuid.test(row.removedPlatformOperationId))||typeof row.reportedValueRemoved!=='boolean')throw new Error('移除回执原锚点不完整')
  return {propertyKey:keys[index]!,reportedRevision:row.reportedRevision,removedPlatformOperationId:row.removedPlatformOperationId,reportedValueRemoved:row.reportedValueRemoved}
 })
 return {operationId:root.operationId,projectId:project,deviceId:device,modelVersionId:model,removedAt:root.removedAt,observations}
}
/** 同源原当前值严格读取；允许移除后新接受事实自然出现，绝不因此重发删除。 */
export function confirmRemovalSlice(bytes:Uint8Array,receipt:RemovalReceipt,observations:readonly RemovalObservation[]){
 const keys=observations.map(o=>o.propertyKey),current=decodePlatformCurrent(bytes,receipt.projectId,receipt.deviceId,receipt.modelVersionId,keys),raw=parseDashboardRuntimeResponse(bytes)
 let newValue=false
 for(let i=0;i<keys.length;i++){
  const key=keys[i]!,anchor=observations[i]!
  if(!Object.hasOwn(current.values,key))continue
  const row=object((raw.values as StrictJsonValue[])[i])
  if(current.sources[key]==='DEVICE_REPORT'){
   if(typeof row.reportedRevision!=='string'||anchor.reportedRevision!==null&&BigInt(row.reportedRevision)<=BigInt(anchor.reportedRevision))throw new Error('已移除，但当前值仍是未确认的原上报事实')
  }else if(!current.operations[key]||current.operations[key]!.toLowerCase()===anchor.removedPlatformOperationId?.toLowerCase())throw new Error('已移除，但当前值仍是未确认的原平台事实')
  newValue=true
 }
 return newValue
}
export async function readRemovalCurrent(receipt:RemovalReceipt,signal?:AbortSignal){
 let received=0,newValue=false
 for(let offset=0;offset<receipt.observations.length;offset+=50){
  const observations=receipt.observations.slice(offset,offset+50),bytes=await platformCurrent(receipt.projectId,receipt.deviceId,receipt.modelVersionId,observations.map(o=>o.propertyKey),signal,4194304-received)
  received+=bytes.byteLength;if(received>4194304)throw new Error('当前属性响应超过完整核对范围')
  newValue=confirmRemovalSlice(bytes,receipt,observations)||newValue
 }
 return newValue
}
