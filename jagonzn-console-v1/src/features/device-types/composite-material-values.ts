import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {materialText,scalarAccessTypes} from './scalar-material-values'
export const compositeObjectBoundaryMessage='源站声明子字段及required；平台采用封闭OBJECT，additionalProperties=false、maxProperties等于已声明子字段数；子字段名称说明保存在objectFields，未补源站min/max/default'
export const compositeListBoundaryMessage='源站List空options；平台适配BASIC_MIXED_LIST_V1及maxItems=256，不声明items；仅有限基本JSON值、深度8、对象64项、文本4096码点，不接受null；不代表旧SDK或OTA兼容'
export function stripCompositeText(value:string){return value.replace(/^[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]+$/gu,'')}
function invalid():never{throw new Error('V6复合属性Schema、字段说明或平台边界不符合合同')}
function object(value:StrictJsonValue|undefined,keys?:readonly string[]):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))invalid();const row=value as StrictJsonObject;if(keys&&(Object.keys(row).length!==keys.length||keys.some(key=>!Object.hasOwn(row,key))))invalid();return row}
function integer(value:StrictJsonValue|undefined){if(!value||!isStrictJsonNumber(value)||! /^(0|[1-9]\d*)$/.test(value.lexical))invalid();return Number(value.lexical)}
/** V6仅承接已观察的一层具名Number子字段及无items的混合List，不扩大既有标量格式。 */
export function compositeMaterialFields(row:StrictJsonObject):Record<string,unknown>{
 if(typeof row.accessType!=='string'||!scalarAccessTypes.includes(row.accessType as typeof scalarAccessTypes[number])||!materialText(row.schema,65536,true))invalid()
 const schema=object(parseDashboardRuntimeResponse(new TextEncoder().encode(row.schema)))
 if(row.dataType==='LIST'){
  object(schema,['type','maxItems']);if(schema.type!=='array'||integer(schema.maxItems)!==256||row.compositeProfile!=='BASIC_MIXED_LIST_V1'||Object.hasOwn(row,'presentation'))invalid()
  return{schema:row.schema,compositeProfile:'BASIC_MIXED_LIST_V1'}
 }
 if(row.dataType!=='OBJECT'||Object.hasOwn(row,'compositeProfile'))invalid()
 object(schema,['type','properties','required','additionalProperties','maxProperties']);const fields=object(schema.properties),keys=Object.keys(fields)
 if(schema.type!=='object'||!keys.length||keys.length>64||schema.additionalProperties!==false||integer(schema.maxProperties)!==keys.length||!Array.isArray(schema.required)||schema.required.some(key=>typeof key!=='string'||!Object.hasOwn(fields,key))||new Set(schema.required).size!==schema.required.length)invalid()
 for(const key of keys)if(!/^[A-Za-z0-9_-]{1,64}$/.test(key)||object(fields[key],['type']).type!=='number')invalid()
 const presentation=object(row.presentation,['iconId','color','enumDescriptions','objectFields']),metadata=object(presentation.objectFields)
 if(presentation.iconId!==null||presentation.color!==null||Object.keys(object(presentation.enumDescriptions)).length||Object.keys(metadata).length!==keys.length||keys.some(key=>!Object.hasOwn(metadata,key)))invalid()
 for(const key of keys){const field=object(metadata[key],['name','description']);if(!materialText(field.name,64)||!stripCompositeText(field.name)||field.description!==null&&!materialText(field.description,512))invalid()}
 return{schema:row.schema,presentation}
}
