import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {referenceVersion} from '../devices/reference-profile'
import {typeDeviceUuid} from './type-devices-api'
import {productTransport} from './public-product-api'
export type TypeDeleteState=Readonly<{id:string;projectId:string;name:string;status:'DRAFT'|'PUBLISHED'}>
export type TypeDeleteSnapshot=Readonly<{type:TypeDeleteState;deviceCount:string;productLibraryPublished:boolean}>
export type TypeDeleteIntent=Readonly<{project:string;type:string;key:string}>
function path(project:string,type:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(type))throw new Error('设备类型范围无效');return `/api/v1/projects/${project}/device-types/${type}` as const}
/** 类型读取只表示当前状态；缺失不能反推此前移除请求的结果。 */
export async function readTypeDeleteState(project:string,type:string,signal:AbortSignal):Promise<TypeDeleteState>{
 const value=await api<Schema<'DeviceTypeResponse'>>(path(project,type),{signal})
 if(!value||value.id!==type||value.projectId!==project||typeof value.name!=='string'||!value.name.trim()||value.name.length>128||!['DRAFT','PUBLISHED'].includes(value.status||''))throw new Error('设备类型状态不完整，请重新读取')
 return Object.freeze({id:type,projectId:project,name:value.name,status:value.status as TypeDeleteState['status']})
}
/** 绑定数量与产品库状态是确认前的提示；最终限制仍须由服务端在类型锁内复核。 */
export async function readTypeDeleteSnapshot(project:string,type:string,signal:AbortSignal):Promise<TypeDeleteSnapshot>{
 const current=await readTypeDeleteState(project,type,signal)
 const page=await api<Schema<'ConsoleDeviceCatalogResponse'>>(`/api/v1/projects/${project}/devices/directory`,{query:{deviceTypeIds:[type],page:1,limit:1,order:'CREATED_ASC'},signal})
 if(!page||!referenceVersion(page.total)||page.page!==1||page.limit!==1||!Array.isArray(page.items)||page.items.length!==(page.total==='0'?0:1)||page.items.some(item=>!item.id||!typeDeviceUuid.test(item.id)||item.deviceTypeId!==type))throw new Error('类型关联设备数量尚未核实')
 const products=await productTransport.owned(project,signal)
 const productLibraryPublished=products.items.some(item=>item.sourceDeviceTypeId===type&&item.product.state==='PUBLISHED')
 return Object.freeze({type:current,deviceCount:page.total,productLibraryPublished})
}
export function prepareTypeDelete(project:string,type:string):TypeDeleteIntent{path(project,type);return Object.freeze({project,type,key:crypto.randomUUID()})}
/** 原意图只发送一次；没有原操作恢复合同，未知结果不得重新发送或用404确认成功。 */
export async function submitTypeDelete(intent:TypeDeleteIntent,signal:AbortSignal):Promise<void>{
 const value=await api<unknown>(path(intent.project,intent.type),{method:'delete',headers:{'Idempotency-Key':intent.key},signal})
 if(value!==undefined)throw new ApiError('移除回执不完整，结果尚未确认',0,undefined,undefined,true)
}
