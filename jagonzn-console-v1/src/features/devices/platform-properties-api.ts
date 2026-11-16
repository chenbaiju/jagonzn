import {api} from '@/core/http'
import type {Schema,paths} from '@/core/contracts'
import {devicePath} from './api'
export type PlatformPropertyKind=NonNullable<Schema<'ConsolePlatformPropertyResponse'>['kind']>
export type PlatformPropertyReceipt=Schema<'ConsolePlatformPropertyResponse'>
export async function platformCurrent(project:string,device:string,model:string,keys:readonly string[],signal?:AbortSignal,maximum=4194304){
 const query:NonNullable<paths['/api/v1/projects/{projectId}/devices/{deviceId}/platform-properties/current']['get']['parameters']['query']>={expectedModelVersionId:model,propertyKeys:[...keys]}
 return api<Uint8Array>(`${devicePath(project,device)}/platform-properties/current`,{query,responseType:'bytes',maxResponseBytes:maximum,signal})
}
/** 原始请求始终使用正式路径及显式JSON头，不经JS数字序列化。 */
export function submitPlatformProperties(project:string,device:string,kind:PlatformPropertyKind,body:string,key:string){
 const options={rawBody:body,headers:{'Content-Type':'application/json','Idempotency-Key':key}}
 return kind==='DOWNLINK'
  ?api<PlatformPropertyReceipt>(`${devicePath(project,device)}/platform-properties/downlink`,{...options,method:'post'})
  :api<PlatformPropertyReceipt>(`${devicePath(project,device)}/platform-properties/cloud`,{...options,method:'put'})
}
/** 仅核对原键与原正文摘要，不重放写入；404仍由界面保留未知结果。 */
export async function readPlatformPropertySubmission(project:string,device:string,model:string,kind:PlatformPropertyKind,key:string,bodyHash:string,signal?:AbortSignal){
 const value=await api<PlatformPropertyReceipt>(`${devicePath(project,device)}/platform-properties/submissions/${kind}`,{headers:{'Original-Request-Key':key,'X-Request-Body-SHA256':bodyHash},signal})
 assertPlatformReceipt(value,project,device,model,kind)
 return value
}
/** 已成功响应仍须核对完整真实身份，不能将坏回执当可重发失败。 */
export function assertPlatformReceipt(value:PlatformPropertyReceipt|undefined,project:string,device:string,model:string,kind:PlatformPropertyKind):asserts value is Required<Omit<PlatformPropertyReceipt,'deliveryMode'>>&Pick<PlatformPropertyReceipt,'deliveryMode'>{
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
 const logical=value?.deliveryMode==='TCP_LOGICAL'
 if(!value||Object.keys(value).length!==(logical?8:7)||Object.hasOwn(value,'deliveryMode')&&!logical||logical&&kind!=='DOWNLINK'||value.projectId!==project||value.deviceId!==device||value.modelVersionId!==model||value.kind!==kind
  ||typeof value.operationId!=='string'||!uuid.test(value.operationId)||typeof value.acceptedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value.acceptedAt)||!Number.isFinite(Date.parse(value.acceptedAt))
  ||(kind==='DOWNLINK'&&!logical?value.commandId!==value.operationId:value.commandId!==null))throw new Error('属性操作回执身份不完整，请重新读取核对')
}
