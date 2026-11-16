import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const integer=(value:unknown)=>typeof value==='string'&&/^(0|[1-9][0-9]{0,18})$/.test(value)&&BigInt(value)<=9223372036854775807n
export type Association=Schema<'DeviceTypeAssociationResponse'>
export type DetachIntent=Readonly<{project:string;device:string;key:string;before:Readonly<Association>;body:Readonly<Schema<'ChangeDeviceTypeAssociationRequest'>>}>
function path(project:string,device:string){if(!uuid.test(project)||!uuid.test(device))throw new Error('请选择有效设备');return `${devicePath(project,device)}/type-association` as const}
export function decodeAssociation(bytes:Uint8Array,device:string):Association {
 const value=parseDashboardRuntimeResponse(bytes)
 const fields=['deviceId','deviceTypeId','modelVersionId','retainedDeviceTypeId','retainedModelVersionId','revision','bindingEpoch','state']
 if(Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key))||value.deviceId!==device||!integer(value.revision)||!integer(value.bindingEpoch))throw new Error('设备关联回执不完整')
 for(const key of ['deviceTypeId','modelVersionId','retainedDeviceTypeId','retainedModelVersionId'])if(value[key]!==null&&(typeof value[key]!=='string'||!uuid.test(value[key] as string)))throw new Error('设备关联身份无效')
 if(value.modelVersionId!==null&&value.deviceTypeId===null||value.retainedModelVersionId!==null&&value.retainedDeviceTypeId===null||value.state!==(value.deviceTypeId!==null?'ASSOCIATED':value.revision==='0'?'UNASSOCIATED':'DETACHED'))throw new Error('设备关联状态无效')
 return value as Association
}
export async function readAssociation(project:string,device:string,signal:AbortSignal){return decodeAssociation(await api<Uint8Array>(path(project,device),{signal,responseType:'bytes',maxResponseBytes:4096}),device)}
export function prepareDetach(project:string,device:string,type:string,before:Association):DetachIntent {
 path(project,device)
 if(!uuid.test(type)||before.deviceId!==device||before.deviceTypeId!==type||BigInt(before.revision)>=9223372036854775807n)throw new Error('设备类型已经变化，请刷新后核对')
 const key=crypto.randomUUID()
 const body={operationKey:key,revision:before.revision,expectedDeviceTypeId:before.deviceTypeId,expectedModelVersionId:before.modelVersionId,deviceTypeId:null,modelVersionId:null} satisfies Schema<'ChangeDeviceTypeAssociationRequest'>
 return Object.freeze({project,device,key,before:Object.freeze({...before}),body:Object.freeze(body)})
}
export function decodeDetach(bytes:Uint8Array,intent:DetachIntent):Association {
 const value=decodeAssociation(bytes,intent.device)
 if(value.state!=='DETACHED'||value.deviceTypeId!==null||value.modelVersionId!==null||value.revision!==(BigInt(intent.before.revision)+1n).toString()||value.bindingEpoch!==intent.before.bindingEpoch||value.retainedDeviceTypeId!==intent.before.deviceTypeId||value.retainedModelVersionId!==intent.before.modelVersionId)throw new Error('移除回执与原请求不符')
 return value
}
/** 固定原件只提交一次；网络未知时读取持久原操作，不创建新键。 */
export async function submitDetach(intent:DetachIntent,signal:AbortSignal){return decodeDetach(await api<Uint8Array>(path(intent.project,intent.device),{method:'put',body:intent.body,signal,responseType:'bytes',maxResponseBytes:4096,headers:{'Idempotency-Key':intent.key}}),intent)}
export async function readDetachOperation(intent:DetachIntent,signal:AbortSignal){return decodeDetach(await api<Uint8Array>(`${path(intent.project,intent.device)}/operations/${intent.key}`,{signal,responseType:'bytes',maxResponseBytes:4096}),intent)}
export type AttachIntent=Readonly<{project:string;device:string;key:string;before:Readonly<Association>;body:Readonly<Schema<'ChangeDeviceTypeAssociationRequest'>>}>
/** 再关联明确冻结目标模型UUID；不查询最新版或复用已结束的当前模型。 */
export function prepareAttach(project:string,device:string,type:string,model:string,before:Association,allowOtherRetained=false):AttachIntent {
 path(project,device)
 if(!uuid.test(type)||!uuid.test(model)||before.deviceId!==device||before.state!=='DETACHED'||before.deviceTypeId!==null||before.modelVersionId!==null||(!allowOtherRetained&&before.retainedDeviceTypeId!==type)||(before.retainedDeviceTypeId===type&&before.retainedModelVersionId===model)||BigInt(before.revision)>=9223372036854775807n||BigInt(before.bindingEpoch)>=9223372036854775807n)throw new Error('重新添加需要目标类型及未在旧关联使用过的已发布模型版本')
 const key=crypto.randomUUID()
 const body={operationKey:key,revision:before.revision,expectedDeviceTypeId:null,expectedModelVersionId:null,deviceTypeId:type,modelVersionId:model} satisfies Schema<'ChangeDeviceTypeAssociationRequest'>
 return Object.freeze({project,device,key,before:Object.freeze({...before}),body:Object.freeze(body)})
}
export function decodeAttach(bytes:Uint8Array,intent:AttachIntent):Association {
 const value=decodeAssociation(bytes,intent.device)
 if(value.state!=='ASSOCIATED'||value.deviceTypeId!==intent.body.deviceTypeId||value.modelVersionId!==intent.body.modelVersionId||value.revision!==(BigInt(intent.before.revision)+1n).toString()||value.bindingEpoch!==(BigInt(intent.before.bindingEpoch)+1n).toString()||value.retainedDeviceTypeId!==intent.before.retainedDeviceTypeId||value.retainedModelVersionId!==intent.before.retainedModelVersionId)throw new Error('重新添加回执与原请求不符')
 return value
}
export async function submitAttach(intent:AttachIntent,signal:AbortSignal){return decodeAttach(await api<Uint8Array>(path(intent.project,intent.device),{method:'put',body:intent.body,signal,responseType:'bytes',maxResponseBytes:4096,headers:{'Idempotency-Key':intent.key}}),intent)}
export async function readAttachOperation(intent:AttachIntent,signal:AbortSignal){return decodeAttach(await api<Uint8Array>(`${path(intent.project,intent.device)}/operations/${intent.key}`,{signal,responseType:'bytes',maxResponseBytes:4096}),intent)}

export type CrossIntent=Readonly<{project:string;device:string;key:string;before:Readonly<Association>;body:Readonly<Schema<'ChangeDeviceTypeAssociationRequest'>>}>
/** ADR0633已关联设备单次直接跨类型；目标类型/模型显式冻结，旧归属在服务端同事务入历史。 */
export function prepareCrossTypeChange(project:string,device:string,type:string,model:string,before:Association):CrossIntent {
 path(project,device)
 if(!uuid.test(type)||!uuid.test(model)||before.deviceId!==device||before.state!=='ASSOCIATED'||before.deviceTypeId===null||before.modelVersionId===null||before.deviceTypeId===type||BigInt(before.revision)>=9223372036854775807n||BigInt(before.bindingEpoch)>=9223372036854775807n)throw new Error('跨类型换绑需要当前已关联设备及目标类型已发布模型')
 const key=crypto.randomUUID()
 const body={operationKey:key,revision:before.revision,expectedDeviceTypeId:before.deviceTypeId,expectedModelVersionId:before.modelVersionId,deviceTypeId:type,modelVersionId:model} satisfies Schema<'ChangeDeviceTypeAssociationRequest'>
 return Object.freeze({project,device,key,before:Object.freeze({...before}),body:Object.freeze(body)})
}
export function decodeCrossTypeChange(bytes:Uint8Array,intent:CrossIntent):Association {
 const value=decodeAssociation(bytes,intent.device)
 if(value.state!=='ASSOCIATED'||value.deviceTypeId!==intent.body.deviceTypeId||value.modelVersionId!==intent.body.modelVersionId||value.revision!==(BigInt(intent.before.revision)+1n).toString()||value.bindingEpoch!==(BigInt(intent.before.bindingEpoch)+1n).toString()||value.retainedDeviceTypeId!==intent.before.deviceTypeId||value.retainedModelVersionId!==intent.before.modelVersionId)throw new Error('跨类型换绑回执与原请求不符')
 return value
}
export async function submitCrossTypeChange(intent:CrossIntent,signal:AbortSignal){return decodeCrossTypeChange(await api<Uint8Array>(path(intent.project,intent.device),{method:'put',body:intent.body,signal,responseType:'bytes',maxResponseBytes:4096,headers:{'Idempotency-Key':intent.key}}),intent)}
export async function readCrossTypeOperation(intent:CrossIntent,signal:AbortSignal){return decodeCrossTypeChange(await api<Uint8Array>(`${path(intent.project,intent.device)}/operations/${intent.key}`,{signal,responseType:'bytes',maxResponseBytes:4096}),intent)}

export type Adaptation=Schema<'DeviceTypeAssociationAdaptationResponse'>
const adaptationStatuses=['NOT_ASSOCIATED','WAITING_MODEL','WAITING','READY'] as const
const adaptationReasons=['MODEL_REQUIRED','GATEWAY_REQUIRED','ADDRESS_REQUIRED','FIRMWARE_REQUIRED','PROTOCOL_MISMATCH'] as const
const adaptationFields=['deviceId','deviceTypeId','modelVersionId','bindingEpoch','status','reason','attempts','lastAttemptAt','updatedAt']
const timestamp=/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/
function adaptationValue(value:StrictJsonObject, expected?:string):Adaptation {
 if(Object.keys(value).length!==adaptationFields.length||adaptationFields.some(key=>!Object.hasOwn(value,key)))throw new Error('关联适配回执不完整')
 const deviceId=value.deviceId
 if(typeof deviceId!=='string'||!uuid.test(deviceId)||expected!==undefined&&deviceId!==expected)throw new Error('关联适配回执设备无效')
 for(const key of ['deviceTypeId','modelVersionId'])if(value[key]!==null&&(typeof value[key]!=='string'||!uuid.test(value[key] as string)))throw new Error('关联适配回执类型或模型无效')
 if(typeof value.bindingEpoch!=='string'||!integer(value.bindingEpoch)||!adaptationStatuses.includes(value.status as typeof adaptationStatuses[number]))throw new Error('关联适配回执状态无效')
 const reason=value.reason
 if(reason!==null&&(typeof reason!=='string'||!adaptationReasons.includes(reason as typeof adaptationReasons[number])))throw new Error('关联适配回执原因无效')
 const attempts=value.attempts
 if(!isStrictJsonNumber(attempts)||!/^\d+$/.test(attempts.lexical)||!Number.isSafeInteger(Number(attempts.lexical)))throw new Error('关联适配回执轮次无效')
 for(const key of ['lastAttemptAt','updatedAt'])if(value[key]!==null&&(typeof value[key]!=='string'||!timestamp.test(value[key] as string)))throw new Error('关联适配回执时间无效')
 if(value.updatedAt===null)throw new Error('关联适配回执缺少更新时间')
 if(value.status==='READY'&&reason!==null||value.status==='NOT_ASSOCIATED'&&(value.deviceTypeId!==null||value.modelVersionId!==null))throw new Error('关联适配回执状态形状无效')
 return {...value,attempts:Number(attempts.lexical)} as unknown as Adaptation
}
/** 读取单台设备当前关联代次的适配状态；不触发后台worker。 */
export async function readAdaptation(project:string,device:string,signal:AbortSignal){
 if(!uuid.test(project)||!uuid.test(device))throw new Error('请选择有效设备')
 return adaptationValue(parseDashboardRuntimeResponse(await api<Uint8Array>(`${path(project,device)}/adaptation`,{signal,responseType:'bytes',maxResponseBytes:4096})),device)
}
/** 按当前页设备批量读取适配状态；缺失行不伪造为已就绪。 */
export async function readAdaptationBatch(project:string,deviceIds:readonly string[],signal:AbortSignal){
 const unique=[...new Set(deviceIds)]
 if(!uuid.test(project)||!unique.length||unique.length>100||unique.some(device=>!uuid.test(device)))throw new Error('关联适配读取范围无效')
 const query=new URLSearchParams({deviceIds:unique.join(',')})
 const root=parseDashboardRuntimeResponse(await api<Uint8Array>(`/api/v1/projects/${encodeURIComponent(project)}/devices/type-association-adaptations?${query}`,{signal,responseType:'bytes',maxResponseBytes:65536}))
 if(Object.keys(root).length!==1||!Object.hasOwn(root,'items')||!Array.isArray(root.items)||root.items.length>unique.length)throw new Error('关联适配批量回执不完整')
 const expected=new Set(unique),found=new Map<string,Adaptation>()
 for(const item of root.items as StrictJsonValue[]){
  if(item===null||typeof item!=='object'||Array.isArray(item)||isStrictJsonNumber(item))throw new Error('关联适配批量条目无效')
  const value=adaptationValue(item as StrictJsonObject)
  if(!expected.has(value.deviceId)||found.has(value.deviceId))throw new Error('关联适配批量条目重复或越界')
  found.set(value.deviceId,value)
 }
 return found
}
/** 将适配状态转为页面短标签；未知原因不猜成已就绪。 */
export function adaptationStateLabel(value:Pick<Adaptation,'status'|'reason'>|undefined){
 if(!value)return '未登记'
 if(value.status==='READY')return '已就绪'
 if(value.status==='NOT_ASSOCIATED')return '未关联'
 if(value.status==='WAITING_MODEL')return '等待物模型'
 if(value.reason==='GATEWAY_REQUIRED')return '等待网关'
 if(value.reason==='ADDRESS_REQUIRED')return '等待地址'
 if(value.reason==='FIRMWARE_REQUIRED')return '等待固件'
 if(value.reason==='PROTOCOL_MISMATCH')return '协议不匹配'
 return '等待适配'
}
