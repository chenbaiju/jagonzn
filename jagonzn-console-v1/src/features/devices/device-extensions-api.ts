import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'

export type ExtensionField=Schema<'DeviceExtensionFieldResponse'>
export type ExtensionSchema=Schema<'DeviceExtensionSchemaResponse'>
export type ExtensionValues=Schema<'DeviceExtensionValuesResponse'>
export type ExtensionScope=Readonly<{project:string;device:string}>
export type ExtensionDefinitionScope=Readonly<{project:string;type:string}>
export type ExtensionValueInput=Readonly<{fieldId:string;value:string}>
export type ExtensionValuesIntent=ExtensionScope&Readonly<{before:ExtensionValues;values:readonly ExtensionValueInput[]}>
export type ExtensionDefinitionsIntent=ExtensionDefinitionScope&Readonly<{before:ExtensionSchema;fields:readonly ExtensionField[]}>
export const MAX_EXTENSION_REVISION=2147483647
const maximumBytes=262144,uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const kinds=['TEXT','NUMBER','SWITCH','SELECT','DATE','TIME','PHONE','URL'] as const
const fail=():never=>{throw new Error('扩展信息回执不符合当前设备和字段合同，请重新读取核对')}
function object(value:StrictJsonValue|undefined):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return fail();return value as StrictJsonObject}
function closed(value:StrictJsonObject,keys:string[]){if(Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail()}
function text(value:StrictJsonValue|undefined,max:number):string{if(typeof value!=='string'||[...value].length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(value)||[...value].some(char=>{const point=char.codePointAt(0)!;return point>=0xD800&&point<=0xDFFF}))return fail();return value}
function nullableText(value:StrictJsonValue|undefined,max:number){return value===null?null:text(value,max)}
function id(value:StrictJsonValue|undefined):string{if(typeof value!=='string'||!uuid.test(value))return fail();return value}
function revision(value:StrictJsonValue|undefined):number{if(value===undefined||!isStrictJsonNumber(value)||!/^(0|[1-9][0-9]*)$/.test(value.lexical))return fail();const number=Number(value.lexical);if(!Number.isInteger(number)||number>MAX_EXTENSION_REVISION)fail();return number}
function validRevision(value:number){return Number.isInteger(value)&&value>=0&&value<=MAX_EXTENSION_REVISION}
function label(value:string){return value.length>0&&value===value.trim()&&!/[\t\r\n]/u.test(value)}
export function validExtensionScalar(field:Pick<ExtensionField,'kind'|'options'>,value:string):boolean{
 try{
  text(value,2048)
  switch(field.kind){
   case 'TEXT':return true
   case 'NUMBER':{if(value.length>128||! /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value))return false;const digits=value.replace(/[-.]/g,'').replace(/^0+/,'');return Math.max(1,digits.length)<=100}
   case 'SWITCH':return value==='true'||value==='false'
   case 'SELECT':return field.options.includes(value)
   case 'DATE':{if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(`${value}T00:00:00Z`);return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value}
   case 'TIME':return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)
   case 'PHONE':return [...value].length<=64&&!/[\t\r\n]/u.test(value)
   case 'URL':{if(!/^https?:\/\//i.test(value)||value!==value.trim()||/\s/.test(value))return false;const link=new URL(value);return ['http:','https:'].includes(link.protocol)&&!!link.hostname&&!link.username&&!link.password}
   default:return false
  }
 }catch{return false}
}
function field(value:StrictJsonValue|undefined):ExtensionField{
 const row=object(value),hasAppAccess=Object.hasOwn(row,'showInUserApp')||Object.hasOwn(row,'userAppEditable')
 const keys=['id','name','description','kind','enabled','options','defaultValue','onLabel','offLabel']
 if(hasAppAccess)keys.push('showInUserApp','userAppEditable')
 closed(row,keys)
 if(hasAppAccess&&(typeof row.showInUserApp!=='boolean'||typeof row.userAppEditable!=='boolean'||row.userAppEditable&&!row.showInUserApp))fail()
 const name=text(row.name,64),description=text(row.description,500),kind=row.kind
 if(!label(name)||typeof kind!=='string'||!kinds.includes(kind as typeof kinds[number])||typeof row.enabled!=='boolean'||!Array.isArray(row.options)||row.options.length>20)fail()
 const options=(row.options as StrictJsonValue[]).map(value=>text(value,64))
 if(options.some(value=>!label(value))||new Set(options).size!==options.length||(kind==='SELECT'?options.length===0:options.length!==0))fail()
 const onLabel=nullableText(row.onLabel,64),offLabel=nullableText(row.offLabel,64)
 if(kind==='SWITCH'?(!onLabel||!offLabel||!label(onLabel)||!label(offLabel)):onLabel!==null||offLabel!==null)fail()
 const result:ExtensionField={id:id(row.id),name,description,kind:kind as ExtensionField['kind'],enabled:row.enabled as boolean,options,defaultValue:nullableText(row.defaultValue,2048),onLabel,offLabel,
  ...(hasAppAccess?{showInUserApp:row.showInUserApp===true,userAppEditable:row.userAppEditable===true}:{})}
 if(result.defaultValue!==null&&!validExtensionScalar(result,result.defaultValue))fail()
 return result
}
function input(bytes:Uint8Array){if(bytes.byteLength>maximumBytes)fail();return object(parseDashboardRuntimeResponse(bytes))}
function fields(value:StrictJsonValue|undefined){if(!Array.isArray(value)||value.length>20)return fail();const result=value.map(field);if(new Set(result.map(row=>row.id)).size!==result.length)fail();return result}
export function decodeExtensionSchema(bytes:Uint8Array,type:string):ExtensionSchema{
 if(!uuid.test(type))fail();const row=input(bytes);closed(row,['deviceTypeId','revision','fields']);if(row.deviceTypeId!==type)fail()
 const result={deviceTypeId:type,revision:revision(row.revision),fields:fields(row.fields)};if(result.revision===0&&result.fields.length)fail();return result
}
export function decodeExtensionValues(bytes:Uint8Array,device:string):ExtensionValues{
 if(!uuid.test(device))fail();const row=input(bytes);closed(row,['deviceId','deviceTypeId','definitionRevision','valueRevision','fields']);if(row.deviceId!==device)fail()
 const type=row.deviceTypeId===null?null:id(row.deviceTypeId),definitionRevision=revision(row.definitionRevision),valueRevision=revision(row.valueRevision)
 if(!Array.isArray(row.fields)||row.fields.length>20)return fail()
 const entries=row.fields.map(value=>{
  const entry=object(value);closed(entry,['definition','value','effectiveValue']);const definition=field(entry.definition),actual=nullableText(entry.value,2048),effective=nullableText(entry.effectiveValue,2048)
  if(!definition.enabled||(actual!==null&&!validExtensionScalar(definition,actual))||effective!==(actual??definition.defaultValue)||(valueRevision===0&&actual!==null))fail()
  return {definition,value:actual,effectiveValue:effective}
 })
 if(new Set(entries.map(entry=>entry.definition.id)).size!==entries.length||(definitionRevision===0&&entries.length)||(type===null&&(definitionRevision!==0||valueRevision!==0||entries.length)))fail()
 return {deviceId:device,deviceTypeId:type,definitionRevision,valueRevision,fields:entries}
}
function devicePath(scope:ExtensionScope){if(!uuid.test(scope.project)||!uuid.test(scope.device))fail();return `/api/v1/projects/${scope.project}/devices/${scope.device}/extension-values` as const}
function typePath(scope:ExtensionDefinitionScope){if(!uuid.test(scope.project)||!uuid.test(scope.type))fail();return `/api/v1/projects/${scope.project}/device-types/${scope.type}/extension-definitions` as const}
function sameFields(before:readonly ExtensionField[],after:readonly ExtensionField[]){return before.length===after.length&&before.every((value,index)=>{const next=after[index]!;return ['id','name','description','kind','enabled','defaultValue','onLabel','offLabel'].every(key=>value[key as keyof ExtensionField]===next[key as keyof ExtensionField])
 &&(value.showInUserApp??false)===(next.showInUserApp??false)&&(value.userAppEditable??false)===(next.userAppEditable??false)
 &&value.options.length===next.options.length&&value.options.every((option,i)=>option===next.options[i])})}
function freezeField(value:ExtensionField):ExtensionField{return Object.freeze({...value,options:Object.freeze([...value.options]) as unknown as ExtensionField['options']})}
export async function readExtensionValues(scope:ExtensionScope,signal:AbortSignal){return decodeExtensionValues(await api<Uint8Array>(devicePath(scope),{signal,responseType:'bytes',maxResponseBytes:maximumBytes}),scope.device)}
export async function readExtensionDefinitions(scope:ExtensionDefinitionScope,signal:AbortSignal){return decodeExtensionSchema(await api<Uint8Array>(typePath(scope),{signal,responseType:'bytes',maxResponseBytes:maximumBytes}),scope.type)}
export function prepareExtensionValues(scope:ExtensionScope,before:ExtensionValues,values:readonly ExtensionValueInput[]):ExtensionValuesIntent{
 devicePath(scope);if(before.deviceId!==scope.device||!before.deviceTypeId||!uuid.test(before.deviceTypeId)||!validRevision(before.definitionRevision)||!validRevision(before.valueRevision)||values.length>20)fail()
 const current=new Map(before.fields.map(entry=>[entry.definition.id,entry.definition])),seen=new Set<string>()
 for(const entry of values){const definition=current.get(entry.fieldId);if(!definition||seen.has(entry.fieldId)||!validExtensionScalar(definition,entry.value))fail();seen.add(entry.fieldId)}
 const changed=before.fields.some(entry=>(values.find(value=>value.fieldId===entry.definition.id)?.value??null)!==entry.value)
 if(changed&&before.valueRevision===MAX_EXTENSION_REVISION)fail()
 const snapshot=Object.freeze({...before,fields:Object.freeze(before.fields.map(entry=>Object.freeze({...entry,definition:freezeField(entry.definition)}))) as unknown as ExtensionValues['fields']})
 return Object.freeze({...scope,before:snapshot,values:Object.freeze(values.map(value=>Object.freeze({...value})))})
}
export async function submitExtensionValues(intent:ExtensionValuesIntent,signal:AbortSignal){
 const check=prepareExtensionValues(intent,intent.before,intent.values)
 const body={expectedDeviceTypeId:check.before.deviceTypeId!,expectedDefinitionRevision:check.before.definitionRevision,expectedValueRevision:check.before.valueRevision,values:check.values.map(entry=>({...entry}))} satisfies Schema<'ReplaceDeviceExtensionValuesRequest'>
 const result=decodeExtensionValues(await api<Uint8Array>(devicePath(check),{method:'put',body,signal,responseType:'bytes',maxResponseBytes:maximumBytes}),check.device)
 const changed=check.before.fields.some(entry=>(check.values.find(value=>value.fieldId===entry.definition.id)?.value??null)!==entry.value)
 if(result.deviceTypeId!==check.before.deviceTypeId||result.definitionRevision!==check.before.definitionRevision||result.valueRevision!==check.before.valueRevision+(changed?1:0)||!sameFields(result.fields.map(entry=>entry.definition),check.before.fields.map(entry=>entry.definition))||result.fields.some(entry=>entry.value!==(check.values.find(value=>value.fieldId===entry.definition.id)?.value??null)))fail()
 return result
}
export function prepareExtensionDefinitions(scope:ExtensionDefinitionScope,before:ExtensionSchema,next:readonly ExtensionField[]):ExtensionDefinitionsIntent{
 typePath(scope);if(before.deviceTypeId!==scope.type||!validRevision(before.revision))fail()
 const normalized=decodeExtensionSchema(new TextEncoder().encode(JSON.stringify({deviceTypeId:scope.type,revision:before.revision||1,fields:next})),scope.type).fields
 const byId=new Map(before.fields.map(value=>[value.id,value]))
 for(const value of normalized){const old=byId.get(value.id);if(old&&(old.kind!==value.kind||value.options.length<old.options.length||old.options.some((option,index)=>option!==value.options[index])))fail()}
 if(!sameFields(before.fields,normalized)&&before.revision===MAX_EXTENSION_REVISION)fail()
 return Object.freeze({...scope,before:Object.freeze({...before,fields:Object.freeze(before.fields.map(freezeField)) as unknown as ExtensionSchema['fields']}),fields:Object.freeze(normalized.map(freezeField))})
}
export async function submitExtensionDefinitions(intent:ExtensionDefinitionsIntent,signal:AbortSignal){
 const check=prepareExtensionDefinitions(intent,intent.before,intent.fields)
 const body={expectedRevision:check.before.revision,fields:check.fields.map(value=>({...value,options:[...value.options]}))} satisfies Schema<'ReplaceDeviceExtensionDefinitionsRequest'>
 const result=decodeExtensionSchema(await api<Uint8Array>(typePath(check),{method:'put',body,signal,responseType:'bytes',maxResponseBytes:maximumBytes}),check.type)
 if(result.revision!==check.before.revision+(sameFields(check.before.fields,check.fields)?0:1)||!sameFields(result.fields,check.fields))fail()
 return result
}
