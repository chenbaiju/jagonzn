import {decodeCommandPresentation} from './command-definition-api'
import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {propertyValueText} from '../devices/property-decoder'
import {readDeviceTypeDirectory,type DeviceTypeDirectoryTransport} from './api'
import {typeDeviceUuid} from './type-devices-api'

export const importSections=[['properties','属性'],['events','事件'],['commands','命令']] as const
export type ImportSection=typeof importSections[number][0]
type SelectionContract=Schema<'DeviceTypeDefinitionImportSelectionRequest'>
export type ImportSelection=Readonly<Required<SelectionContract>>
type SourceContract=Schema<'DeviceTypeDefinitionImportSourceResponse'>
type PreviewContract=Schema<'DeviceTypeDefinitionImportPreviewResponse'>
type ReceiptContract=Schema<'DeviceTypeDefinitionImportReceiptResponse'>
type TypeIdentity=Readonly<Required<Pick<Schema<'DeviceTypeResponse'>,'id'|'projectId'|'name'|'status'>>>
export type ImportChoice=Readonly<Required<Pick<Schema<'DevicePropertyDefinitionResponse'>,'id'|'name'>>&{key:string}>
export type ImportDefinitions=Readonly<{raw:StrictJsonObject;text:string;choices:Readonly<Record<ImportSection,readonly ImportChoice[]>>}>
export type ImportSource=Readonly<Omit<Required<SourceContract>,'source'|'target'|'definitions'>&{source:TypeIdentity;target:TypeIdentity;definitions:ImportDefinitions}>
export type ImportCandidate=Readonly<{project:string;target:string;source:ImportSource;selection:ImportSelection;body:Readonly<Schema<'PreviewDeviceTypeDefinitionImportRequest'>>}>
export type ImportPreview=Readonly<Omit<Required<PreviewContract>,'selection'|'definitions'|'issues'>&{selection:ImportSelection;definitions:ImportDefinitions;issues:readonly Required<Schema<'DeviceTypeDefinitionImportIssue'>>[]}>
export type ImportIntent=Readonly<{project:string;target:string;sourceId:string;key:string;candidate:ImportCandidate;preview:ImportPreview;body:Readonly<Schema<'ConfirmDeviceTypeDefinitionImportRequest'>>}>
export type ImportReceipt=Readonly<Omit<Required<ReceiptContract>,'items'>&{items:readonly Required<Schema<'DeviceTypeDefinitionImportCreatedItem'>>[]}>
export type DefinitionImportTransport={directory:DeviceTypeDirectoryTransport;source:(project:string,target:string,source:string,signal:AbortSignal)=>Promise<ImportSource>;preview:(candidate:ImportCandidate,signal:AbortSignal)=>Promise<ImportPreview>;confirm:(intent:ImportIntent,signal:AbortSignal)=>Promise<ImportReceipt>;original:(intent:ImportIntent,signal:AbortSignal)=>Promise<ImportReceipt>}
const digest=/^[a-f0-9]{64}$/
export function importableTypeStatus(value:unknown):value is 'DRAFT'|'PUBLISHED'{return value==='DRAFT'||value==='PUBLISHED'}
function invalid():never{throw new Error('导入资料、预览或原请求回执不符合当前范围，请重新读取')}
function object(value:StrictJsonValue|undefined):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))invalid();return value as StrictJsonObject}
function closed(value:StrictJsonObject,fields:readonly string[]){if(Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key)))invalid()}
function id(value:unknown):value is string{return typeof value==='string'&&typeDeviceUuid.test(value)}
function hash(value:unknown):value is string{return typeof value==='string'&&digest.test(value)}
function typeIdentity(value:StrictJsonValue|undefined,project:string,type:string):TypeIdentity{const raw=object(value);if(raw.id!==type||raw.projectId!==project||!importableTypeStatus(raw.status)||typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>128)invalid();return Object.freeze({id:type,projectId:project,status:raw.status,name:raw.name})}
function definitions(value:StrictJsonValue|undefined,source:string):ImportDefinitions{
 const raw=object(value);closed(raw,['properties','events','commands']);const choices={} as Record<ImportSection,readonly ImportChoice[]>
 for(const [section] of importSections){const rows=raw[section];if(!Array.isArray(rows)||rows.length>1000)invalid()
  const field=section==='properties'?'propertyKey':section==='events'?'eventKey':'commandKey'
  choices[section]=Object.freeze(rows.map(value=>{const row=object(value);if(section==='commands')decodeCommandPresentation(row.presentation);if(section==='properties'&&row.compositeProfile!=null&&(row.dataType!=='LIST'||row.compositeProfile!=='BASIC_MIXED_LIST_V1'))invalid();if(section==='properties'&&row.switchEncoding!=null&&(row.dataType!=='SWITCH'||!['BOOLEAN','NUMBER','TEXT'].includes(String(row.switchEncoding))))invalid();if(!id(row.id)||row.deviceTypeId!==source||typeof row.name!=='string'||!row.name.trim()||row.name.length>128||typeof row[field]!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(row[field] as string))invalid();return Object.freeze({id:row.id,name:row.name,key:row[field] as string})}))
  if(new Set(choices[section].map(row=>row.id)).size!==rows.length||new Set(choices[section].map(row=>row.key)).size!==rows.length)invalid()
 }
 return Object.freeze({raw,text:propertyValueText(raw),choices:Object.freeze(choices)})
}
function selection(value:unknown):ImportSelection{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid();const raw=value as Record<string,unknown>
 if(Object.keys(raw).some(key=>!importSections.some(([section])=>key===section)))invalid()
 const result={} as Record<ImportSection,string[]>
 for(const [section] of importSections){const values=raw[section]??[];if(!Array.isArray(values)||values.length>100||values.some(value=>!id(value))||new Set(values).size!==values.length)invalid();result[section]=Object.freeze([...values].sort()) as unknown as string[]}
 if(!result.properties.length&&!result.events.length&&!result.commands.length)throw new Error('请至少选择一项功能，每类最多100项')
 return Object.freeze(result)
}
function sameSelection(a:ImportSelection,b:ImportSelection){return importSections.every(([section])=>JSON.stringify(a[section])===JSON.stringify(b[section]))}
export function decodeImportSource(bytes:Uint8Array,project:string,target:string,source:string):ImportSource{
 if(!id(project)||!id(target)||!id(source)||target===source)invalid();const root=parseDashboardRuntimeResponse(bytes);closed(root,['source','target','definitions'])
 return Object.freeze({source:typeIdentity(root.source,project,source),target:typeIdentity(root.target,project,target),definitions:definitions(root.definitions,source)})
}
export function prepareDefinitionImport(project:string,target:string,source:ImportSource,input:unknown):ImportCandidate{
 if(!id(project)||!id(target)||source.target.id!==target||source.target.projectId!==project||source.source.projectId!==project||source.source.id===target||!importableTypeStatus(source.source.status)||!importableTypeStatus(source.target.status))invalid()
 const selected=selection(input)
 for(const [section] of importSections)if(selected[section].some(id=>!source.definitions.choices[section].some(row=>row.id===id)))invalid()
 return Object.freeze({project,target,source,selection:selected,body:Object.freeze({sourceDeviceTypeId:source.source.id,selection:selected})})
}
export function decodeImportPreview(bytes:Uint8Array,candidate:ImportCandidate):ImportPreview{
 const root=parseDashboardRuntimeResponse(bytes);closed(root,['sourceDeviceTypeId','targetDeviceTypeId','selection','definitions','sourceDigest','targetDigest','previewDigest','digestAlgorithm','issues'])
 if(root.sourceDeviceTypeId!==candidate.source.source.id||root.targetDeviceTypeId!==candidate.target||!hash(root.sourceDigest)||!hash(root.targetDigest)||!hash(root.previewDigest)||root.digestAlgorithm!=='DEVICE_TYPE_DEFINITION_IMPORT_V1_SHA256'||!Array.isArray(root.issues)||root.issues.length>301)invalid()
 const selected=selection(root.selection);if(!sameSelection(selected,candidate.selection))invalid();const data=definitions(root.definitions,candidate.source.source.id)
 const issues=root.issues.map(value=>{const row=object(value);closed(row,['path','code']);if(typeof row.path!=='string'||row.path.length>128||!/^\$(?:\.(?:properties|events|commands)\[[0-9a-f-]{36}\])?$/.test(row.path)||!['IDENTIFIER_CONFLICT','SOURCE_DEFINITION_CHANGED','SOURCE_DEFINITION_INVALID','SOURCE_DEFINITION_NOT_FOUND','COMBINED_MODEL_INVALID'].includes(String(row.code)))invalid();return Object.freeze({path:row.path,code:row.code as string})})
 for(const [section] of importSections){if(data.choices[section].some(row=>!selected[section].includes(row.id))||!issues.length&&data.choices[section].length!==selected[section].length)invalid()}
 return Object.freeze({sourceDeviceTypeId:root.sourceDeviceTypeId,targetDeviceTypeId:root.targetDeviceTypeId,sourceDigest:root.sourceDigest,targetDigest:root.targetDigest,previewDigest:root.previewDigest,digestAlgorithm:root.digestAlgorithm,selection:selected,definitions:data,issues:Object.freeze(issues)}) as ImportPreview
}
export function prepareDefinitionImportConfirmation(candidate:ImportCandidate,preview:ImportPreview):ImportIntent{
 if(preview.issues.length||!sameSelection(candidate.selection,preview.selection)||preview.sourceDeviceTypeId!==candidate.source.source.id||preview.targetDeviceTypeId!==candidate.target||!hash(preview.previewDigest))throw new Error('请先取得无冲突且与原选择一致的导入预览')
 return Object.freeze({project:candidate.project,target:candidate.target,sourceId:candidate.source.source.id,key:crypto.randomUUID(),candidate,preview,body:Object.freeze({...candidate.body,expectedPreviewDigest:preview.previewDigest})})
}
export function decodeImportReceipt(bytes:Uint8Array,intent:ImportIntent):ImportReceipt{
 const root=parseDashboardRuntimeResponse(bytes);closed(root,['sourceDeviceTypeId','targetDeviceTypeId','requestDigest','previewDigest','sourceDigest','targetDigest','items','createdAt'])
 if(root.sourceDeviceTypeId!==intent.sourceId||root.targetDeviceTypeId!==intent.target||!hash(root.requestDigest)||root.previewDigest!==intent.preview.previewDigest||root.sourceDigest!==intent.preview.sourceDigest||root.targetDigest!==intent.preview.targetDigest||!Array.isArray(root.items)||typeof root.createdAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(root.createdAt)||!Number.isFinite(Date.parse(root.createdAt)))invalid()
 const expected=importSections.flatMap(([section])=>intent.preview.definitions.choices[section].map(row=>({kind:section==='properties'?'PROPERTY':section==='events'?'EVENT':'COMMAND',...row})))
 if(root.items.length!==expected.length||!root.items.length||root.items.length>300)invalid()
 const items=root.items.map(value=>{const row=object(value);closed(row,['kind','sourceId','targetId','key']);if(!id(row.sourceId)||!id(row.targetId)||row.sourceId===row.targetId||!expected.some(item=>item.kind===row.kind&&item.id===row.sourceId&&item.key===row.key))invalid();return Object.freeze({...row})})
 if(new Set(items.map(row=>row.kind+':'+row.sourceId)).size!==items.length||new Set(items.map(row=>row.targetId)).size!==items.length)invalid()
 return Object.freeze({...root,items:Object.freeze(items)}) as unknown as ImportReceipt
}
export function sameImportReceipt(a:ImportReceipt,b:ImportReceipt){return ['sourceDeviceTypeId','targetDeviceTypeId','requestDigest','previewDigest','sourceDigest','targetDigest','createdAt'].every(key=>a[key as keyof ImportReceipt]===b[key as keyof ImportReceipt])&&JSON.stringify(a.items)===JSON.stringify(b.items)}
function base(project:string,target:string){if(!id(project)||!id(target))invalid();return `/api/v1/projects/${project}/device-types/${target}` as const}
export const definitionImportTransport:DefinitionImportTransport={
 directory:readDeviceTypeDirectory,
 async source(project,target,source,signal){if(!id(source))invalid();return decodeImportSource(await api<Uint8Array>(`${base(project,target)}/definition-import-sources/${source}`,{signal,responseType:'bytes',maxResponseBytes:4*1024*1024}),project,target,source)},
 async preview(candidate,signal){return decodeImportPreview(await api<Uint8Array>(`${base(candidate.project,candidate.target)}/definition-import-previews`,{method:'post',body:candidate.body,signal,responseType:'bytes',maxResponseBytes:4*1024*1024}),candidate)},
 async confirm(intent,signal){const bytes=await api<Uint8Array>(`${base(intent.project,intent.target)}/definition-imports`,{method:'post',body:intent.body,headers:{'Idempotency-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:128*1024});try{return decodeImportReceipt(bytes,intent)}catch{throw new ApiError('导入回执与原选择不符，原操作结果尚未确认',200,undefined,undefined,true)}},
 async original(intent,signal){return decodeImportReceipt(await api<Uint8Array>(`${base(intent.project,intent.target)}/definition-imports/by-key`,{headers:{'Original-Request-Key':intent.key},signal,responseType:'bytes',maxResponseBytes:128*1024}),intent)}
}
