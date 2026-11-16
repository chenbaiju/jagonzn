import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'

type DeviceType=Schema<'DeviceTypeDirectoryItemResponse'>
/** 页面使用字段经运行时校验收窄；公开字段只派生正式业务合同。 */
export type DeviceTypeDirectoryItem=Readonly<DeviceType&Required<Pick<DeviceType,'id'|'projectId'|'name'|'deviceKind'|'deviceCount'>>>
export type DeviceTypeDirectoryQuery=Readonly<{page:number;limit:number}>
/** 正式目录响应的已校验只读视图，不复制服务端DTO。 */
export type DeviceTypeDirectoryPage=Readonly<Required<Omit<Schema<'DeviceTypeDirectoryResponse'>,'items'>>&{items:readonly DeviceTypeDirectoryItem[]}>
export type DeviceTypeDirectoryTransport=(project:string,query:DeviceTypeDirectoryQuery,signal:AbortSignal)=>Promise<DeviceTypeDirectoryPage>
const uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
const kinds=['DIRECT','GATEWAY','SUB_DEVICE']
function invalid():never{throw new Error('设备类型目录资料不完整，请重新读取')}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid();return value as Record<string,unknown>}
function count(value:unknown):value is string{return typeof value==='string'&&/^(0|[1-9]\d{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n}
/** 页数和真实总量必须来自同一次读取；坏范围不降级为空目录。 */
export function decodeDeviceTypeDirectory(value:unknown,project:string,query:DeviceTypeDirectoryQuery):DeviceTypeDirectoryPage{
 const result=object(value)
 if(!uuid.test(project)||!Number.isInteger(query.page)||query.page<1||query.page>10000||![24,48,72,96].includes(query.limit)
  ||Object.keys(result).length!==4||!['items','total','page','limit'].every(key=>Object.hasOwn(result,key))||result.page!==query.page||result.limit!==query.limit
  ||!count(result.total)||!Array.isArray(result.items))invalid()
 const offset=BigInt(query.page-1)*BigInt(query.limit),remaining=BigInt(result.total)-offset
 const expected=remaining<=0n?0:Number(remaining>BigInt(query.limit)?BigInt(query.limit):remaining)
 if(result.items.length!==expected)invalid()
 const items=result.items.map(raw=>{
  const item=object(raw)
  if(typeof item.id!=='string'||!uuid.test(item.id)||item.projectId!==project||typeof item.name!=='string'||!item.name.trim()||item.name.length>128
   ||!kinds.includes(String(item.deviceKind))||!count(item.deviceCount)
   ||item.enabledProductIdentifier!=null&&(typeof item.enabledProductIdentifier!=='string'||!item.enabledProductIdentifier.trim()||item.enabledProductIdentifier.length>128)
   ||item.publishedToProductLibrary!==undefined&&typeof item.publishedToProductLibrary!=='boolean')invalid()
  return Object.freeze({...item}) as DeviceTypeDirectoryItem
 })
 if(new Set(items.map(item=>item.id)).size!==items.length)invalid()
 return Object.freeze({items:Object.freeze(items),total:result.total,page:query.page,limit:query.limit})
}
export const readDeviceTypeDirectory:DeviceTypeDirectoryTransport=async(project,query,signal)=>{
 const result=await api<unknown>(`/api/v1/projects/${encodeURIComponent(project)}/device-types/directory`,{query,signal})
 return decodeDeviceTypeDirectory(result,project,query)
}
export const deviceKindLabel:Record<NonNullable<DeviceType['deviceKind']>,string>={DIRECT:'直连设备',SUB_DEVICE:'网关子设备',GATEWAY:'网关'}
