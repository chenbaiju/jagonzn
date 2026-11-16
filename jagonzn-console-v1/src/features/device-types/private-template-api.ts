import {api,ApiError} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {typeDeviceUuid} from './type-devices-api'

export type PrivateTemplate=Readonly<Required<Schema<'DeviceTypeTemplateDirectoryItem'>>>
export type PrivateTemplateDirectory=Readonly<Omit<Required<Schema<'DeviceTypeTemplateDirectoryResponse'>>,'items'>&{items:readonly PrivateTemplate[]}>
export type PrivateTemplateVersionSummary=Readonly<Required<Schema<'DeviceTypeTemplateVersionSummary'>>>
export type PrivateTemplateVersions=Readonly<Omit<Required<Schema<'DeviceTypeTemplateVersionsResponse'>>,'items'>&{items:readonly PrivateTemplateVersionSummary[]}>
export type PrivateTemplateVersion=Readonly<Required<Schema<'DeviceTypeTemplateVersionResponse'>>>
export type PrivateTemplatePreview=Readonly<Required<Schema<'DeviceTypeTemplatePreviewResponse'>>>
export type PrivateTemplateImportReceipt=Readonly<Required<Schema<'DeviceTypeTemplateImportReceiptResponse'>>>
export type SavePrivateTemplateIntent=Readonly<{kind:'save';project:string;key:string;template:PrivateTemplate|null;preview:PrivateTemplatePreview;body:Readonly<Schema<'SaveDeviceTypeTemplateRequest'>>}>
export type ImportPrivateTemplateIntent=Readonly<{kind:'import';project:string;key:string;version:PrivateTemplateVersion;body:Readonly<Required<Schema<'CreateDeviceTypeFromTemplateRequest'>>>}>
export type PrivateTemplateIntent=SavePrivateTemplateIntent|ImportPrivateTemplateIntent
export type PrivateTemplateTransport={
 directory:(project:string,signal:AbortSignal)=>Promise<PrivateTemplateDirectory>
 versions:(project:string,templateId:string,signal:AbortSignal)=>Promise<PrivateTemplateVersions>
 version:(project:string,versionId:string,signal:AbortSignal)=>Promise<PrivateTemplateVersion>
 preview:(project:string,typeId:string,signal:AbortSignal)=>Promise<PrivateTemplatePreview>
 save:(intent:SavePrivateTemplateIntent,signal:AbortSignal)=>Promise<PrivateTemplateVersion>
 saved:(intent:SavePrivateTemplateIntent,signal:AbortSignal)=>Promise<PrivateTemplateVersion>
 create:(intent:ImportPrivateTemplateIntent,signal:AbortSignal)=>Promise<PrivateTemplateImportReceipt>
 imported:(intent:ImportPrivateTemplateIntent,signal:AbortSignal)=>Promise<PrivateTemplateImportReceipt>
}
const digest=/^[a-f0-9]{64}$/
function invalid():never{throw new Error('私有模板资料或范围不符合合同，请重新读取')}
function uuid(value:unknown):value is string{return typeof value==='string'&&typeDeviceUuid.test(value)}
function text(value:unknown,maximum:number){return typeof value==='string'&&!!value.trim()&&value.length<=maximum&&!/[\u0000-\u001f\u007f]/.test(value)}
function time(value:unknown){return typeof value==='string'&&Number.isFinite(Date.parse(value))}
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();const raw=value as Record<string,unknown>;if(Object.keys(raw).length!==keys.length||keys.some(key=>!Object.hasOwn(raw,key)))invalid();return raw}
function integer(value:unknown,minimum:number,maximum:number){return typeof value==='number'&&Number.isInteger(value)&&value>=minimum&&value<=maximum}
/** 固定包已由服务端校验；只作有界原文展示，不用浏览器重解码或重建数字/Schema。 */
export function checkTemplatePackage(value:unknown):string{
 if(typeof value!=='string'||!value.trim()||new TextEncoder().encode(value).byteLength>1024*1024)invalid()
 return value
}

export function decodePrivateTemplateDirectory(value:unknown):PrivateTemplateDirectory{
 const raw=object(value,['items','total']);if(!Array.isArray(raw.items)||raw.items.length>20||raw.total!==String(raw.items.length))invalid()
 const ids=new Set<string>();for(const row of raw.items){const v=object(row,['id','name','headVersionId','headSequence','createdAt']);if(!uuid(v.id)||ids.has(v.id)||!uuid(v.headVersionId)||!integer(v.headSequence,1,10)||!text(v.name,128)||!time(v.createdAt))invalid();ids.add(v.id)}
 return value as PrivateTemplateDirectory
}
export function decodePrivateTemplateVersions(value:unknown,templateId:string):PrivateTemplateVersions{
 const raw=object(value,['templateId','items']);if(!uuid(templateId)||raw.templateId!==templateId||!Array.isArray(raw.items)||raw.items.length>10)invalid()
 const ids=new Set<string>();let last=11;for(const row of raw.items){const v=object(row,['versionId','sequence','packageDigest','sourceDeviceTypeId','createdAt']);if(!uuid(v.versionId)||ids.has(v.versionId)||!uuid(v.sourceDeviceTypeId)||!integer(v.sequence,1,last-1)||typeof v.packageDigest!=='string'||!digest.test(v.packageDigest)||!time(v.createdAt))invalid();ids.add(v.versionId);last=v.sequence as number}
 return value as PrivateTemplateVersions
}
export function decodePrivateTemplateVersion(value:unknown,versionId?:string):PrivateTemplateVersion{
 const raw=object(value,['templateId','templateName','versionId','sequence','sourceDeviceTypeId','sourceMode','packageJson','packageDigest','sourceSchemaDigest','createdAt'])
 if(!uuid(raw.templateId)||!uuid(raw.versionId)||versionId!==undefined&&raw.versionId!==versionId||!uuid(raw.sourceDeviceTypeId)||!text(raw.templateName,128)||!integer(raw.sequence,1,10)||raw.sourceMode!=='DRAFT_CAPTURE'||typeof raw.packageDigest!=='string'||!digest.test(raw.packageDigest)||typeof raw.sourceSchemaDigest!=='string'||!digest.test(raw.sourceSchemaDigest)||!time(raw.createdAt))invalid()
 checkTemplatePackage(raw.packageJson);return value as PrivateTemplateVersion
}
export function decodePrivateTemplatePreview(value:unknown,typeId:string):PrivateTemplatePreview{
 const raw=object(value,['sourceDeviceTypeId','packageJson','packageDigest','sourceSchemaDigest','propertyCount','eventCount','commandCount'])
 if(!uuid(typeId)||raw.sourceDeviceTypeId!==typeId||typeof raw.packageDigest!=='string'||!digest.test(raw.packageDigest)||typeof raw.sourceSchemaDigest!=='string'||!digest.test(raw.sourceSchemaDigest)||!['propertyCount','eventCount','commandCount'].every(key=>integer(raw[key],0,1000)))invalid()
 checkTemplatePackage(raw.packageJson);return value as PrivateTemplatePreview
}
export function decodePrivateTemplateImport(value:unknown):PrivateTemplateImportReceipt{
 const raw=object(value,['deviceTypeId','templateId','templateVersionId','packageDigest','requestedName','createdAt','deleted'])
 if(!uuid(raw.deviceTypeId)||!uuid(raw.templateId)||!uuid(raw.templateVersionId)||typeof raw.packageDigest!=='string'||!digest.test(raw.packageDigest)||!text(raw.requestedName,128)||!time(raw.createdAt)||typeof raw.deleted!=='boolean')invalid()
 return value as PrivateTemplateImportReceipt
}
function base(project:string){if(!uuid(project))invalid();return `/api/v1/projects/${project}/device-type-templates` as const}
function title(value:string){const chosen=value.trim();if(!text(chosen,128))throw new Error('名称须为1至128个字符');return chosen}
export function prepareSavePrivateTemplate(project:string,preview:PrivateTemplatePreview,template:PrivateTemplate|null,name:string):SavePrivateTemplateIntent{
 base(project);decodePrivateTemplatePreview(preview,preview.sourceDeviceTypeId)
 if(template){decodePrivateTemplateDirectory({items:[template],total:'1'});if(template.headSequence>=10)throw new Error('该模板已达到10个版本上限')}
 return Object.freeze({kind:'save',project,key:crypto.randomUUID(),template,preview,body:Object.freeze({sourceDeviceTypeId:preview.sourceDeviceTypeId,name:template?null:title(name),expectedHeadVersionId:template?.headVersionId??null,expectedPackageDigest:preview.packageDigest})})
}
export function prepareImportPrivateTemplate(project:string,version:PrivateTemplateVersion,name:string):ImportPrivateTemplateIntent{
 base(project);decodePrivateTemplateVersion(version,version.versionId)
 return Object.freeze({kind:'import',project,key:crypto.randomUUID(),version,body:Object.freeze({templateVersionId:version.versionId,expectedPackageDigest:version.packageDigest,name:title(name)})})
}
export function savedTemplateMatches(value:PrivateTemplateVersion,intent:SavePrivateTemplateIntent){return value.sourceDeviceTypeId===intent.body.sourceDeviceTypeId&&value.packageDigest===intent.preview.packageDigest&&value.sourceSchemaDigest===intent.preview.sourceSchemaDigest&&(intent.template?value.templateId===intent.template.id&&value.templateName===intent.template.name&&value.sequence===intent.template.headSequence+1:value.templateName===intent.body.name&&value.sequence===1)}
export function importedTemplateMatches(value:PrivateTemplateImportReceipt,intent:ImportPrivateTemplateIntent){return value.templateId===intent.version.templateId&&value.templateVersionId===intent.body.templateVersionId&&value.packageDigest===intent.body.expectedPackageDigest&&value.requestedName===intent.body.name}
function unknown():never{throw new ApiError('回执与原模板意图不符，请按原键核对',200,undefined,undefined,true)}
export const privateTemplateTransport:PrivateTemplateTransport={
 async directory(project,signal){return decodePrivateTemplateDirectory(await api<Schema<'DeviceTypeTemplateDirectoryResponse'>>(base(project),{signal,maxResponseBytes:32768}))},
 async versions(project,id,signal){if(!uuid(id))invalid();return decodePrivateTemplateVersions(await api<Schema<'DeviceTypeTemplateVersionsResponse'>>(`${base(project)}/${id}/versions`,{signal,maxResponseBytes:32768}),id)},
 async version(project,id,signal){if(!uuid(id))invalid();return decodePrivateTemplateVersion(await api<Schema<'DeviceTypeTemplateVersionResponse'>>(`${base(project)}/versions/${id}`,{signal,maxResponseBytes:4*1024*1024}),id)},
 async preview(project,id,signal){base(project);if(!uuid(id))invalid();return decodePrivateTemplatePreview(await api<Schema<'DeviceTypeTemplatePreviewResponse'>>(`/api/v1/projects/${project}/device-types/${id}/template-preview`,{signal,maxResponseBytes:4*1024*1024}),id)},
 async save(intent,signal){const path=intent.template?`${base(intent.project)}/${intent.template.id}/versions` as const:base(intent.project);const value=decodePrivateTemplateVersion(await api<Schema<'DeviceTypeTemplateVersionResponse'>>(path,{method:'post',headers:{'Idempotency-Key':intent.key},body:intent.body,signal,maxResponseBytes:4*1024*1024}));if(!savedTemplateMatches(value,intent))unknown();return value},
 async saved(intent,signal){const value=decodePrivateTemplateVersion(await api<Schema<'DeviceTypeTemplateVersionResponse'>>(`${base(intent.project)}/requests/by-key`,{headers:{'Original-Request-Key':intent.key},signal,maxResponseBytes:4*1024*1024}));if(!savedTemplateMatches(value,intent))unknown();return value},
 async create(intent,signal){const value=decodePrivateTemplateImport(await api<Schema<'DeviceTypeTemplateImportReceiptResponse'>>(`${base(intent.project)}/imports`,{method:'post',headers:{'Idempotency-Key':intent.key},body:intent.body,signal,maxResponseBytes:8192}));if(!importedTemplateMatches(value,intent))unknown();return value},
 async imported(intent,signal){const value=decodePrivateTemplateImport(await api<Schema<'DeviceTypeTemplateImportReceiptResponse'>>(`${base(intent.project)}/imports/by-key`,{headers:{'Original-Request-Key':intent.key},signal,maxResponseBytes:8192}));if(!importedTemplateMatches(value,intent))unknown();return value}
}
