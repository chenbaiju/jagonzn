import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'
import {decodeOtaFirmware,otaReadTransport,type OtaFirmware} from './ota-read-api'
import {decodeOtaCreationReceipt,decodeOtaManagementMetadata,type OtaCreationReceipt} from './ota-management-metadata-api'
import {modelVersionTransport,type ModelVersion,type ModelSnapshot} from '../device-types/model-version-api'
import {taskChoices,type TaskChoicePage} from '../rules/task-choices'
import {productCredentialTransport} from '../device-types/product-credentials-api'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {otaMainAppTransport,type OtaMainAppRequest,type OtaMainAppCreation} from './ota-main-app-api'
import {otaTargetedMainTransport,otaTargetDeviceChoices,type OtaTargetedMainRequest,type OtaTargetedMainCreation,type OtaTargetDeviceLoader} from './ota-target-conditions-api'

export type OtaDraftRequest=Schema<'OtaFirmwareCreateRequest'>
export type OtaManagedDraftRequest=Schema<'OtaFirmwareMetadataCreateRequest'>
export type OtaCreateTransport={
 devices:OtaTargetDeviceLoader
 createTargeted:(project:string,body:OtaTargetedMainRequest,key:string,signal:AbortSignal)=>Promise<OtaFirmware>
 recoverTargeted:(project:string,key:string,signal:AbortSignal)=>Promise<OtaTargetedMainCreation>
 types:(project:string,cursor:string|undefined,signal:AbortSignal)=>Promise<TaskChoicePage>
 model:(project:string,type:string,signal:AbortSignal)=>Promise<ModelVersion>
 snapshot:(project:string,type:string,version:ModelVersion,signal:AbortSignal)=>Promise<ModelSnapshot>
 createMain:(project:string,body:OtaMainAppRequest,key:string,signal:AbortSignal)=>Promise<OtaFirmware>
 recoverMain:(project:string,key:string,signal:AbortSignal)=>Promise<OtaMainAppCreation>
 create:(project:string,body:OtaDraftRequest,key:string,signal:AbortSignal)=>Promise<OtaFirmware>
 read:(project:string,id:string,signal:AbortSignal)=>Promise<OtaFirmware>
 createManaged:(project:string,body:OtaManagedDraftRequest,key:string,signal:AbortSignal)=>Promise<OtaFirmware>
 recover:(project:string,key:string,signal:AbortSignal)=>Promise<OtaCreationReceipt>
}
// 沿既有OTA读取和Java isBlank的空白闭集，按码点计数并保留合法原文。
export function validFirmwareVersion(value:string){return !/^[\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]*$/u.test(value)&&Array.from(value).length<=128&&!/[\u0000-\u001f\u007f-\u009f]|\p{Surrogate}/u.test(value)}
export const otaCreateTransport:OtaCreateTransport={
 devices:otaTargetDeviceChoices,
 createTargeted:otaTargetedMainTransport.create,
 recoverTargeted:otaTargetedMainTransport.recover,
 types:(project,cursor,signal)=>taskChoices(project,'device-types',cursor,signal),
 async model(project,type,signal){
  const [version,fact]=await Promise.all([modelVersionTransport.latest(project,type,signal),productCredentialTransport.read(project,type,signal)])
  if(!fact.productKey)throw new Error('该类型尚无产品标识，请先在设备类型的接入设置中完成产品凭据配置。')
  return version
 },
 snapshot:(project,type,version,signal)=>modelVersionTransport.snapshot(project,type,version.id,signal,version),
 createMain:otaMainAppTransport.create,
 recoverMain:otaMainAppTransport.recover,
 read:otaReadTransport.firmware,
 async createManaged(project,body,key,signal){
  if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(body.deviceTypeId)||!typeDeviceUuid.test(body.thingModelVersionId)||!typeDeviceUuid.test(key)||!validFirmwareVersion(body.firmwareVersion))throw new Error('请选择设备类型并填写有效的版本资料')
  decodeOtaManagementMetadata(body.metadata)
  const bytes=await api<Uint8Array>(`/api/v1/projects/${project}/ota/firmwares/metadata`,{method:'post',body,headers:{'Idempotency-Key':key},signal,responseType:'bytes',maxResponseBytes:64*1024})
  try{return decodeOtaFirmware(parseDashboardRuntimeResponse(bytes),project)}catch{throw new ApiError('创建结果暂不能核对，请读取原创建结果',201,undefined,undefined,true)}
 },
 async recover(project,key,signal){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(key))throw new Error('原创建请求无效');return decodeOtaCreationReceipt(parseDashboardRuntimeResponse(await api<Uint8Array>(`/api/v1/projects/${project}/ota/firmwares/by-key`,{headers:{'Original-Request-Key':key},signal,responseType:'bytes',maxResponseBytes:64*1024})),project)},
 async create(project,body,key,signal){
  if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(body.deviceTypeId)||!typeDeviceUuid.test(body.thingModelVersionId)||!typeDeviceUuid.test(key)||!validFirmwareVersion(body.firmwareVersion))throw new Error('请选择已发布模型并填写有效的固件版本')
  const bytes=await api<Uint8Array>(`/api/v1/projects/${project}/ota/firmwares`,{method:'post',body,headers:{'Idempotency-Key':key},signal,responseType:'bytes',maxResponseBytes:64*1024})
  try{return decodeOtaFirmware(parseDashboardRuntimeResponse(bytes),project)}catch{throw new ApiError('创建响应无法核对，请保留本次意图并读取列表确认',201,undefined,undefined,true)}
 }
}
