import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {parseDashboardRuntimeResponse,isStrictJsonNumber,type StrictJsonValue,type StrictJsonObject} from '@things-link/client-contracts/dashboard/v1'
import {typeProfileId} from './profile-api'
import {prepareTslMaterial,standardMaterialFormat,scalarStandardMaterialFormat,decodeMaterialProperties} from './tsl-material-import-api'
import {sourceStyleStandardMaterialFormat,styledPropertyStandardMaterialFormat,functionStandardMaterialFormat,styledFunctionStandardMaterialFormat,sourceLibraryStandardMaterialFormat,decodeMaterialEvents,decodeMaterialCommands} from './function-material-values'
import {materialExtraFields,scalarMaterialFields,scalarAccessTypes,scalarDataTypes} from './scalar-material-values'
type EntryContract=Schema<'DeviceStandardFunctionCatalogEntry'>
/** 目录正式合同的字符串已由读入口逐项校验，展示模型只保留已接受的四流向与四标量。 */
export type StandardFunctionEntry=Readonly<Omit<EntryContract,'accessType'|'dataType'|'minimumValue'|'maximumValue'|'defaultValue'|'numericStep'>&{accessType:typeof scalarAccessTypes[number];dataType:typeof scalarDataTypes[number];minimumValue:string|null;maximumValue:string|null;defaultValue?:string;numericStep?:string}>
export type StandardFunctionCatalog=Readonly<Omit<Schema<'DeviceStandardFunctionCatalogResponse'>,'entries'>&{entries:readonly StandardFunctionEntry[]}>
function invalid():never{throw new Error('标准功能目录资料或版本不完整，请重新读取')}
function object(value:StrictJsonValue|undefined,keys:readonly string[]):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))invalid();return value as StrictJsonObject}
function text(value:StrictJsonValue|undefined,max:number):value is string{return typeof value==='string'&&!!value.trim()&&value.length<=max&&!value.includes('\0')}
/** 精确数值只转显示词法，目录摘要由服务端定义；浏览器不自造标准属性。 */
export function decodeStandardFunctionCatalog(bytes:Uint8Array):StandardFunctionCatalog{
 const root=object(parseDashboardRuntimeResponse(bytes),['sourceFormat','catalogDigest','entries'])
 if(![standardMaterialFormat,scalarStandardMaterialFormat].includes(String(root.sourceFormat))||typeof root.catalogDigest!=='string'||!/^[0-9a-f]{64}$/.test(root.catalogDigest)||!Array.isArray(root.entries)||!root.entries.length||root.entries.length>100)invalid()
 const ids=new Set<string>(),keys=new Set<string>(),entries=root.entries.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))invalid()
  const base=['id','category','propertyKey','name','accessType','dataType','unit','decimalPlaces','minimumValue','maximumValue','description'],row=object(value,[...base,...(root.sourceFormat===scalarStandardMaterialFormat?materialExtraFields.filter(key=>!base.includes(key)&&Object.hasOwn(value,key)):[])])
  if(root.sourceFormat===scalarStandardMaterialFormat){
   if(!text(row.id,128)||!text(row.category,64)||!text(row.propertyKey,64)||!/^[A-Za-z0-9_-]{1,64}$/.test(row.propertyKey)||!text(row.name,128)||typeof row.description!=='string'||row.description.length>512||ids.has(row.id)||keys.has(row.propertyKey))invalid()
   ids.add(row.id);keys.add(row.propertyKey);return Object.freeze({...row,...scalarMaterialFields(row,true)}) as StandardFunctionEntry
  }
  if(!text(row.id,128)||!text(row.category,64)||!text(row.propertyKey,64)||!/^[A-Za-z0-9_-]{1,64}$/.test(row.propertyKey)||!text(row.name,128)||!text(row.unit,32)||!text(row.description,512)||row.accessType!=='REPORT'||row.dataType!=='NUMBER'||!isStrictJsonNumber(row.decimalPlaces!)||!/^([0-9]|10)$/.test(row.decimalPlaces.lexical)||ids.has(row.id)||keys.has(row.propertyKey))invalid()
  const numeric=(v:StrictJsonValue|undefined)=>{if(v===null)return null;if(v===undefined||!isStrictJsonNumber(v))invalid();return v.lexical}
  ids.add(row.id);keys.add(row.propertyKey)
  return Object.freeze({...row,decimalPlaces:Number(row.decimalPlaces.lexical),minimumValue:numeric(row.minimumValue),maximumValue:numeric(row.maximumValue)}) as StandardFunctionEntry
 })
 return Object.freeze({sourceFormat:root.sourceFormat,catalogDigest:root.catalogDigest,entries:Object.freeze(entries)}) as StandardFunctionCatalog
}
export async function readStandardFunctionCatalog(project:string,signal:AbortSignal){if(!typeProfileId(project))invalid();return decodeStandardFunctionCatalog(await api<Uint8Array>(`/api/v1/projects/${project}/device-standard-functions`,{signal,responseType:'bytes',maxResponseBytes:256*1024}))}
export function prepareStandardFunctionSelection(project:string,target:string,catalog:StandardFunctionCatalog,ids:readonly string[]){
 if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!catalog.entries.some(entry=>entry.id===id)))invalid()
 return prepareTslMaterial(project,target,JSON.stringify({catalogDigest:catalog.catalogDigest,entries:ids}),catalog.sourceFormat)
}

/** 三域目录独立读面；旧九项标量目录保持原合同。 */
export type StandardFunctionDefinitionEntry=Readonly<Omit<Schema<'DeviceStandardFunctionDefinitionCatalogEntry'>,'property'|'event'|'command'>&{property?:import('./tsl-material-import-api').MaterialProperty;event?:import('./function-material-values').MaterialEvent;command?:import('./function-material-values').MaterialCommand}>
export type StandardFunctionDefinitionsCatalog=Readonly<Omit<Schema<'DeviceStandardFunctionDefinitionsCatalogResponse'>,'entries'>&{entries:readonly StandardFunctionDefinitionEntry[]}>
export function decodeStandardFunctionDefinitionsCatalog(bytes:Uint8Array):StandardFunctionDefinitionsCatalog{
 const root=object(parseDashboardRuntimeResponse(bytes),['sourceFormat','catalogDigest','entries'])
 if(![functionStandardMaterialFormat,styledFunctionStandardMaterialFormat,styledPropertyStandardMaterialFormat,sourceStyleStandardMaterialFormat,sourceLibraryStandardMaterialFormat].includes(String(root.sourceFormat))||typeof root.catalogDigest!=='string'||!/^[0-9a-f]{64}$/.test(root.catalogDigest)||!Array.isArray(root.entries)||!root.entries.length||root.entries.length>(String(root.sourceFormat)===sourceLibraryStandardMaterialFormat?2000:300))invalid()
 const ids=new Set<string>(),entries=root.entries.map(value=>{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))invalid();const kind=value.kind,branch=kind==='PROPERTY'?'property':kind==='EVENT'?'event':kind==='COMMAND'?'command':undefined;if(!branch)invalid();const row=object(value,['id','category','kind',branch]);if(!text(row.id,128)||!text(row.category,64)||ids.has(row.id))invalid();ids.add(row.id);const property=kind==='PROPERTY'?decodeMaterialProperties([row.property!],String(root.sourceFormat))[0]:undefined,event=kind==='EVENT'?decodeMaterialEvents([row.event!],String(root.sourceFormat))[0]:undefined,command=kind==='COMMAND'?decodeMaterialCommands([row.command!],String(root.sourceFormat))[0]:undefined,identifier=property?.propertyKey||event?.eventKey||command?.commandKey;if(!identifier)invalid();return Object.freeze({id:row.id,category:row.category,kind,...(property?{property}:{}),...(event?{event}:{}),...(command?{command}:{})}) as StandardFunctionDefinitionEntry})
 return Object.freeze({sourceFormat:root.sourceFormat,catalogDigest:root.catalogDigest,entries:Object.freeze(entries)}) as StandardFunctionDefinitionsCatalog
}
export async function readStandardFunctionDefinitionsCatalog(project:string,signal:AbortSignal){if(!typeProfileId(project))invalid();return decodeStandardFunctionDefinitionsCatalog(await api<Uint8Array>(`/api/v1/projects/${project}/device-standard-functions/definitions`,{signal,responseType:'bytes',maxResponseBytes:1024*1024}))}
/** 原站标准功能全库V10独立读面；只接受V10身份和固定2000条预算。 */
export function decodeStandardLibraryCatalog(bytes:Uint8Array):StandardFunctionDefinitionsCatalog{
 const root=object(parseDashboardRuntimeResponse(bytes),['sourceFormat','catalogDigest','entries'])
 if(root.sourceFormat!==sourceLibraryStandardMaterialFormat||typeof root.catalogDigest!=='string'||!/^[0-9a-f]{64}$/.test(root.catalogDigest)||!Array.isArray(root.entries)||!root.entries.length||root.entries.length>2000)invalid()
 const ids=new Set<string>(),entries=root.entries.map(value=>{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))invalid();const kind=value.kind,branch=kind==='PROPERTY'?'property':kind==='EVENT'?'event':kind==='COMMAND'?'command':undefined;if(!branch)invalid();const row=object(value,['id','category','kind',branch]);if(!text(row.id,128)||!text(row.category,64)||ids.has(row.id))invalid();ids.add(row.id);const property=kind==='PROPERTY'?decodeMaterialProperties([row.property!],sourceLibraryStandardMaterialFormat)[0]:undefined,event=kind==='EVENT'?decodeMaterialEvents([row.event!],sourceLibraryStandardMaterialFormat)[0]:undefined,command=kind==='COMMAND'?decodeMaterialCommands([row.command!],sourceLibraryStandardMaterialFormat)[0]:undefined,identifier=property?.propertyKey||event?.eventKey||command?.commandKey;if(!identifier)invalid();return Object.freeze({id:row.id,category:row.category,kind,...(property?{property}:{}),...(event?{event}:{}),...(command?{command}:{})}) as StandardFunctionDefinitionEntry})
 return Object.freeze({sourceFormat:root.sourceFormat,catalogDigest:root.catalogDigest,entries:Object.freeze(entries)}) as StandardFunctionDefinitionsCatalog
}
export async function readStandardLibraryCatalog(project:string,signal:AbortSignal){if(!typeProfileId(project))invalid();return decodeStandardLibraryCatalog(await api<Uint8Array>(`/api/v1/projects/${project}/device-standard-functions/library`,{signal,responseType:'bytes',maxResponseBytes:4*1024*1024}))}
/** 全库选择沿用同标识唯一规则，并绑定V10摘要后提交。 */
export function prepareStandardLibrarySelection(project:string,target:string,catalog:StandardFunctionDefinitionsCatalog,ids:readonly string[]){
 if(!catalog.sourceFormat||catalog.sourceFormat!==sourceLibraryStandardMaterialFormat)invalid()
 if(!ids.length||new Set(ids).size!==ids.length)invalid()
 const keys=new Set<string>()
 for(const id of ids){const entry=catalog.entries.find(row=>row.id===id);if(!entry)invalid();const key=entry.kind+':'+(entry.property?.propertyKey||entry.event?.eventKey||entry.command?.commandKey);if(keys.has(key))throw new Error('同一标识只能选择一个标准功能');keys.add(key)}
 return prepareTslMaterial(project,target,JSON.stringify({catalogDigest:catalog.catalogDigest,entries:ids}),catalog.sourceFormat)
}
export function prepareStandardFunctionDefinitionSelection(project:string,target:string,catalog:StandardFunctionDefinitionsCatalog,ids:readonly string[]){
 if(!ids.length||new Set(ids).size!==ids.length)invalid()
 const keys=new Set<string>()
 for(const id of ids){const entry=catalog.entries.find(row=>row.id===id);if(!entry)invalid();const key=entry.kind+':'+(entry.property?.propertyKey||entry.event?.eventKey||entry.command?.commandKey);if(keys.has(key))throw new Error('同一标识只能选择一个标准功能');keys.add(key)}
 return prepareTslMaterial(project,target,JSON.stringify({catalogDigest:catalog.catalogDigest,entries:ids}),catalog.sourceFormat)
}
