import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import type {PropertyPresentation} from './property-presentation'
export type ObjectFieldDraft={key:string;name:string;description:string;dataType:'NUMBER'|'SWITCH'|'TEXT';required:boolean;maxLength:number}
export const objectFieldTypes=[['NUMBER','Number（数值）'],['SWITCH','Switch（开关）'],['TEXT','Text（文本）']] as const
function object(value:StrictJsonValue|undefined):StrictJsonObject|undefined{return value&&typeof value==='object'&&!Array.isArray(value)&&!isStrictJsonNumber(value)?value as StrictJsonObject:undefined}
function integer(value:StrictJsonValue|undefined,max:number){if(!value||!isStrictJsonNumber(value)||!/^\d+$/.test(value.lexical))return undefined;const n=Number(value.lexical);return Number.isSafeInteger(n)&&n<=max?n:undefined}
/** 只接能完整表示的直接标量结构；其它约束留在原JSON编辑，不能静默删去。 */
export function readObjectFields(schema:string,presentation?:PropertyPresentation|null):ObjectFieldDraft[]|undefined{
 if(!schema)return[]
 try{const root=parseDashboardRuntimeResponse(new TextEncoder().encode(schema)),properties=object(root.properties),maximum=integer(root.maxProperties,64)
  if(root.type!=='object'||root.additionalProperties!==false||!properties||Object.keys(root).some(key=>!['type','properties','required','additionalProperties','maxProperties'].includes(key))||!Object.keys(properties).length||maximum!==Object.keys(properties).length||!Array.isArray(root.required)||root.required.some(key=>typeof key!=='string'||!Object.hasOwn(properties,key))||new Set(root.required).size!==root.required.length)return undefined
  const rows:ObjectFieldDraft[]=[]
  for(const [key,raw] of Object.entries(properties)){const field=object(raw);if(!/^[A-Za-z0-9_-]{1,64}$/.test(key)||!field)return undefined
   let dataType:ObjectFieldDraft['dataType'],maxLength=4096
   if(field.type==='number'&&Object.keys(field).length===1)dataType='NUMBER'
   else if(field.type==='boolean'&&Object.keys(field).length===1)dataType='SWITCH'
   else if(field.type==='string'&&Object.keys(field).length===2&&Object.hasOwn(field,'maxLength')&&integer(field.maxLength,4096)!==undefined){dataType='TEXT';maxLength=integer(field.maxLength,4096)!}
   else return undefined
   const meta=presentation?.objectFields[key];rows.push({key,name:meta?.name||key,description:meta?.description||'',dataType,required:root.required.includes(key),maxLength})
  }return rows
 }catch{return undefined}
}
export function objectFieldsSchema(rows:readonly ObjectFieldDraft[]):string{
 if(!rows.length||rows.length>64)throw new Error('Object直接子字段必须为1至64项')
 const properties=Object.create(null) as Record<string,unknown>,required:string[]=[]
 for(const row of rows){const key=row.key.trim();if(!/^[A-Za-z0-9_-]{1,64}$/.test(key)||Object.hasOwn(properties,key)||!row.name.trim()||row.name.trim().length>64||row.description.trim().length>512||!objectFieldTypes.some(([type])=>type===row.dataType)||typeof row.required!=='boolean')throw new Error('请检查子字段名称、唯一标识符、说明和已支持类型')
  if(row.dataType==='TEXT'&&(!Number.isInteger(row.maxLength)||row.maxLength<0||row.maxLength>4096))throw new Error('文本子字段长度范围为0至4096')
  properties[key]=row.dataType==='TEXT'?{type:'string',maxLength:row.maxLength}:{type:row.dataType==='NUMBER'?'number':'boolean'};if(row.required)required.push(key)
 }
 return JSON.stringify({type:'object',properties,required,additionalProperties:false,maxProperties:rows.length})
}
