import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {parseDashboardRuntimeResponse} from '@things-link/client-contracts/dashboard/v1'
import {parseStrictPublicJson} from '../../../../../things-link-console/src/features/ota/strict-public-json'
import {OTA_MANIFEST_REQUIRED_FIELDS} from '../../../../../things-link-console/src/features/ota/firmware-model'
import {decodePublication,type OtaFirmware,type OtaUpload,type OtaPublication} from './ota-read-api'
import {typeDeviceUuid} from '../device-types/type-devices-api'
import {decodeOtaExecutionBinding} from './ota-main-app-api'
type PublicationHeader=Pick<Schema<'OtaPublicationCreateRequest'>,'expectedRevision'|'uploadSessionId'>
export type OtaPublicationIntent=Readonly<{project:string;firmware:string;key:string;header:PublicationHeader;raw:string}>
export type OtaPublicationTransport={original:(intent:OtaPublicationIntent,signal:AbortSignal)=>Promise<OtaPublication>;create:(intent:OtaPublicationIntent,signal:AbortSignal)=>Promise<OtaPublication>;read:(project:string,firmware:string,id:string,signal:AbortSignal)=>Promise<OtaPublication>}
export function prepareOtaPublication(firmware:OtaFirmware,upload:OtaUpload,text:string):OtaPublicationIntent{
 const manifest=parseStrictPublicJson(new TextEncoder().encode(text)) as Record<string,unknown>
 const fields=manifest.contractVersion==='tc-ota-manifest/v1'?OTA_MANIFEST_REQUIRED_FIELDS:manifest.contractVersion==='tc-ota-manifest/v2'?[...OTA_MANIFEST_REQUIRED_FIELDS,'executionBinding']:undefined
 if(!fields||Object.keys(manifest).length!==fields.length||fields.some(key=>!Object.hasOwn(manifest,key)))throw new Error('请提供完整的发布清单，不能省略或添加顶层字段')
 if(manifest.contractVersion==='tc-ota-manifest/v2')decodeOtaExecutionBinding(manifest.executionBinding)
 if(firmware.status!=='DRAFT'||upload.status!=='VERIFIED'||upload.projectId!==firmware.projectId||upload.firmwareId!==firmware.id||manifest.firmwareId!==firmware.id||manifest.deviceTypeId!==firmware.deviceTypeId||manifest.productKey!==firmware.productKey||manifest.firmwareVersion!==firmware.firmwareVersion||manifest.thingModelVersionId!==firmware.thingModelVersionId||manifest.thingModelSchemaDigestAlgorithm!==firmware.schemaDigestAlgorithm||manifest.thingModelSchemaDigest!==firmware.schemaDigest||manifest.artifactSize!==upload.expectedLength||manifest.artifactSha256!==upload.expectedSha256)throw new Error('发布清单与固件、固定物模型或已复验文件不一致')
 const header={expectedRevision:firmware.revision,uploadSessionId:upload.id}
 const raw=`{"expectedRevision":${JSON.stringify(header.expectedRevision)},"uploadSessionId":${JSON.stringify(header.uploadSessionId)},"manifest":${text}}`
 if(new TextEncoder().encode(raw).length>65536)throw new Error('完整发布请求超过64KiB')
 return Object.freeze({project:firmware.projectId,firmware:firmware.id,key:crypto.randomUUID(),header:Object.freeze(header),raw})
}
function base(project:string,firmware:string){if(!typeDeviceUuid.test(project)||!typeDeviceUuid.test(firmware))throw new Error('固件资源范围无效');return `/api/v1/projects/${project}/ota/firmwares/${firmware}/publications` as const}
export const otaPublicationTransport:OtaPublicationTransport={
 async original(intent,signal){if(!typeDeviceUuid.test(intent.key))throw new Error('原发布请求键无效');return decodePublication(parseDashboardRuntimeResponse(await api<Uint8Array>(`${base(intent.project,intent.firmware)}/by-key`,{headers:{'Original-Request-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:65536})),intent.firmware)},
 async create(intent,signal){const bytes=await api<Uint8Array>(base(intent.project,intent.firmware),{method:'post',rawBody:intent.raw,headers:{'Content-Type':'application/json','Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:65536});try{return decodePublication(parseDashboardRuntimeResponse(bytes),intent.firmware)}catch{throw new ApiError('发布尝试响应无法核对，请读取原记录',201,undefined,undefined,true)}},
 async read(project,firmware,id,signal){if(!typeDeviceUuid.test(id))throw new Error('发布记录标识无效');const value=decodePublication(parseDashboardRuntimeResponse(await api<Uint8Array>(`${base(project,firmware)}/${id}`,{signal,responseType:'bytes',maxResponseBytes:65536})),firmware);if(value.id!==id)throw new Error('发布记录身份不一致');return value}
}
