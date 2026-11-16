import type {DeviceDataPreviewSelection} from './use-device-data-preview-sample'
import {deviceSourceMembers} from './rule-source-api'
import {api,IdentityChanged} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {definitionUuid} from './device-task-definition-port'
import {readRawRuleJson,type RawRuleJsonValue} from './raw-rule-json'
import {normalizeGatewayDataParser} from './gateway-data-parser-api'
import {normalizeDataStreamParams,dataStreamTemplate,dataStreamTransport,type DataStreamItem} from '../device-types/data-stream-publication-api'
import {typeProfileTransport} from '../device-types/profile-api'
import {devicesApi} from '../devices/api'
import {referenceVersion} from '../devices/reference-profile'
import {dataBase64} from '../devices/data-stream-runtime-api'

export type DataPropertyFunction=Readonly<Required<NonNullable<Schema<'DataRuleOperation'>['function']>>>
export type DataPropertyInputContract=NonNullable<Schema<'PreviewDeviceTypeDataPropertyRequest'>['inputContract']>
export type DataPropertyInputProfile=Schema<'PreviewDeviceTypeDataPropertyRequest'>['inputProfile']
export type DataPropertyPreview=Readonly<Required<Pick<Schema<'DeviceTypeDataPropertyPreviewResponse'>,'attributesJson'>>&Pick<Schema<'DeviceTypeDataPropertyPreviewResponse'>,'previewTargetContext'>>
export type DataRulePreviewTarget=Readonly<Required<Schema<'DataRulePreviewTargetContext'>>>
/** 当前管理资料仅供样例选择，不是原连接pin或运行授权。 */
export type SubdeviceDataPreviewSource=Readonly<{subDeviceId:string;gatewayDeviceId:string;gatewayTypeId:string;stream:DataStreamItem;streams:readonly DataStreamItem[];publicationId:string;publicationRevision:string}>
const bad=()=>new Error('属性函数或当前样例目标不完整，请重新读取核对')
function closed(value:RawRuleJsonValue,keys:readonly string[]){if(value.kind!=='object'||value.keys().length!==keys.length||keys.some(key=>!value.optional([key])))throw bad()}
export function normalizeDataPropertyFunction(value:unknown):DataPropertyFunction{const row=readRawRuleJson(new TextEncoder().encode(JSON.stringify(value)));closed(row,['format','source']);if(row.at(['format']).string()!=='COMMON_JS')throw bad();const checked=normalizeGatewayDataParser({source:row.at(['source']).string()});return Object.freeze({format:'COMMON_JS',source:checked.source})}
export function decodeDataRulePreviewTarget(value:RawRuleJsonValue,expected?:SubdeviceDataPreviewSource):DataRulePreviewTarget{
 const keys=['gatewayDeviceId','gatewayTypeId','subDeviceId','bindingId','subDeviceAddress','addressRevision'];closed(value,keys)
 const row=Object.fromEntries(keys.map(key=>[key,value.at([key]).string()]))
 if(['gatewayDeviceId','gatewayTypeId','subDeviceId','bindingId'].some(key=>!definitionUuid(row[key]!))||row.subDeviceId===row.gatewayDeviceId||!/^[A-Za-z0-9._:-]{1,64}$/.test(row.subDeviceAddress!)||!referenceVersion(row.addressRevision)||expected&&(row.subDeviceId!==expected.subDeviceId||row.gatewayDeviceId!==expected.gatewayDeviceId||row.gatewayTypeId!==expected.gatewayTypeId))throw bad()
 return Object.freeze(row) as DataRulePreviewTarget
}
export async function readSubdeviceDataPreviewSource(projectId:string,typeId:string,subDeviceId:string,streamIdentifier:string,current:()=>boolean,signal:AbortSignal):Promise<SubdeviceDataPreviewSource>{
 if(!definitionUuid(projectId)||!definitionUuid(typeId)||!definitionUuid(subDeviceId)||!/^[A-Za-z0-9_-]{1,64}$/.test(streamIdentifier))throw bad()
 const check=()=>{if(!current())throw new IdentityChanged()};check()
 const child=await devicesApi.read(projectId,subDeviceId,signal);check()
 if(child.id!==subDeviceId||child.deviceTypeId!==typeId||!child.gatewayId||!definitionUuid(child.gatewayId)||child.gatewayId===subDeviceId)throw new Error('当前子设备未关联有效网关，请重新选择样例设备')
 const gateway=await devicesApi.read(projectId,child.gatewayId,signal);check()
 if(gateway.id!==child.gatewayId||!gateway.deviceTypeId||!definitionUuid(gateway.deviceTypeId))throw bad()
 const type=await typeProfileTransport.read(projectId,gateway.deviceTypeId,signal);check()
 if(type.type.id!==gateway.deviceTypeId||type.type.projectId!==projectId||type.type.deviceKind!=='GATEWAY'||type.type.payloadProtocol!=='STANDARD_GATEWAY')throw new Error('样例子设备须关联标准网关')
 const publication=await dataStreamTransport.read(projectId,gateway.deviceTypeId,signal);check()
 const stream=publication.publication?.definition.streams.find(row=>!row.disabled&&row.identifier===streamIdentifier)
 if(!publication.publication||!stream||stream.format!=='HEX')throw new Error('样例网关当前发布中须有同标识HEX输入流')
 return Object.freeze({subDeviceId,gatewayDeviceId:gateway.id,gatewayTypeId:gateway.deviceTypeId,stream,streams:publication.publication.definition.streams.filter(row=>!row.disabled),publicationId:publication.publication.publicationId,publicationRevision:publication.revision})
}
export async function previewDataPropertyFunction(scope:{projectId:string;deviceTypeId:string;scopeKey:string},inputProfile:DataPropertyInputProfile,stream:DataStreamItem,source:string,bytes:Uint8Array,params:unknown,current:()=>boolean,signal?:AbortSignal,sample?:SubdeviceDataPreviewSource,selection?:DeviceDataPreviewSelection,inputContract?:DataPropertyInputContract):Promise<DataPropertyPreview>{
 if(!scope.scopeKey||!definitionUuid(scope.projectId)||!definitionUuid(scope.deviceTypeId)||!['LEGACY_SINGLE','DATA_OPERATIONS_V1'].includes(inputProfile)||bytes.length<1||bytes.length>65504)throw bad()
 if(inputContract!==undefined&&(inputContract!=='LEGACY_TEXT_V1'||inputProfile!=='DATA_OPERATIONS_V1'||stream.format!=='TEXT'||dataStreamTemplate(stream)||params!==undefined))throw new Error('当前输入流不支持已保存函数的文本输入方式')
 const fn=normalizeDataPropertyFunction({format:'COMMON_JS',source}),safeParams=normalizeDataStreamParams(stream,params)
 const body:Schema<'PreviewDeviceTypeDataPropertyRequest'>={inputProfile,...(inputContract?{inputContract}:{}),streamIdentifier:stream.identifier,source:fn.source,payloadBase64:dataBase64(bytes),...(safeParams?{params:safeParams}:{}),...(sample?{subDeviceId:sample.subDeviceId}:{})}
 if(selection&&(selection.context.deviceSource.kind!=='DEVICE'||selection.member.deviceTypeId!==scope.deviceTypeId||!deviceSourceMembers(selection.context.deviceSource).includes(selection.member.deviceId)||sample&&sample.subDeviceId!==selection.member.deviceId))throw bad()
 if(!current())throw new IdentityChanged()
 const returned=selection?await api<Uint8Array>(`/api/v1/projects/${scope.projectId}/message-rules/data-parser-previews/property`,{method:'post',body:{deviceSource:selection.context.deviceSource,sampleDeviceId:selection.member.deviceId,content:body} satisfies Schema<'MessageRuleDataPropertyPreviewRequest'>,signal,responseType:'bytes',maxResponseBytes:512*1024}):await api<Uint8Array>(`/api/v1/projects/${scope.projectId}/device-types/${scope.deviceTypeId}/data-parser-previews/property`,{method:'post',body,signal,responseType:'bytes',maxResponseBytes:512*1024})
 if(!current())throw new IdentityChanged()
 const value=readRawRuleJson(returned),target=value.optional(['previewTargetContext']);closed(value,['attributesJson',...(target?['previewTargetContext']:[])])
 const attributesJson=value.at(['attributesJson']).string(),attributes=readRawRuleJson(new TextEncoder().encode(attributesJson));if(attributes.kind!=='object'||new TextEncoder().encode(attributesJson).length>65536||!!sample!==!!target)throw bad()
 return Object.freeze({attributesJson,...(target?{previewTargetContext:decodeDataRulePreviewTarget(target,sample)}:{})})
}
