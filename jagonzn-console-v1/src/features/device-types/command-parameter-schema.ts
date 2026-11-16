import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import {propertyValueText} from '../devices/property-decoder'
export const commandParameterTypes=[['number','Number（数值）'],['integer','Integer（整数）'],['string','Text（文本）'],['boolean','Switch（布尔）'],['object','Object（对象）'],['array','List（列表）']] as const
export type CommandParameterType=typeof commandParameterTypes[number][0]
export type CommandParameterRow={key:string;name:string;description:string;namePresent:boolean;descriptionPresent:boolean;type:CommandParameterType;required:boolean;minimum:string;maximum:string;minLength:string;maxLength:string;minItems:string;maxItems:string;enumText:string;nestedSchema:string}
export type CommandParameterForm={rows:CommandParameterRow[];additionalProperties:boolean|undefined;requiredPresent:boolean;propertiesPresent:boolean;unconstrained:boolean}
const encoder=new TextEncoder(),keyPattern=/^[A-Za-z0-9_-]{1,64}$/
function object(value:StrictJsonValue|undefined):StrictJsonObject|undefined{return value&&typeof value==='object'&&!Array.isArray(value)&&!isStrictJsonNumber(value)?value as StrictJsonObject:undefined}
function length(value:StrictJsonValue|undefined){if(!isStrictJsonNumber(value!)||! /^(0|[1-9]\d*)$/.test((value as {lexical:string}).lexical)||BigInt((value as {lexical:string}).lexical)>2147483647n)return undefined;return(value as {lexical:string}).lexical}
function text(value:StrictJsonValue|undefined,max:number){return value===undefined?'':typeof value==='string'&&value.length<=max?value:undefined}
function allowed(type:CommandParameterType){return['type','title','description','enum',...(type==='number'||type==='integer'?['minimum','maximum']:type==='string'?['minLength','maxLength']:type==='array'?['minItems','maxItems','items']:type==='object'?['properties','required','additionalProperties']:[])]}
export function newCommandParameter():CommandParameterRow{return{key:'',name:'',description:'',namePresent:false,descriptionPresent:false,type:'number',required:false,minimum:'',maximum:'',minLength:'',maxLength:'',minItems:'',maxItems:'',enumText:'',nestedSchema:''}}
/** 顺序是独立展示声明；不得从JSONB对象键序推断原作者顺序。 */
export function commandSchemaParameterKeys(schema:string|null|undefined):string[]{
 if(!schema?.trim())throw new Error('参数顺序要求对应对象 Schema，留空时请清除顺序声明')
 const root=parseDashboardRuntimeResponse(encoder.encode(schema)),properties=root.properties===undefined?Object.create(null) as StrictJsonObject:object(root.properties)
 if(root.type!=='object'||!properties||Object.keys(properties).length>100||Object.keys(properties).some(key=>!keyPattern.test(key)))throw new Error('参数顺序要求具有最多100项合法键的对象 Schema')
 return Object.keys(properties)
}
export function validateCommandParameterOrder(order:readonly string[]|null|undefined,schema:string|null|undefined):void{
 if(order==null)return
 const keys=commandSchemaParameterKeys(schema)
 if(order.length>100||new Set(order).size!==order.length||order.some(key=>!keyPattern.test(key))||order.length!==keys.length||keys.some(key=>!order.includes(key)))throw new Error('参数顺序必须与对应 Schema 的完整参数键一致')
}
export function reconcileCommandParameterOrder(schema:string,previous:readonly string[]|null|undefined):string[]{
 const keys=commandSchemaParameterKeys(schema)
 return[...(previous||[]).filter(key=>keys.includes(key)),...keys.filter(key=>!previous?.includes(key))]
}
/** 只有整份结构能够完整表示时才返回表单；未知/默认/联合约束均保留原JSON；嵌套子Schema单独保留精确原值。 */
export function readCommandParameterForm(schema:string,order?:readonly string[]|null):CommandParameterForm|undefined{
 if(!schema.trim())return{rows:[],additionalProperties:undefined,requiredPresent:false,propertiesPresent:false,unconstrained:true}
 try{
  const root=parseDashboardRuntimeResponse(encoder.encode(schema)),properties=root.properties===undefined?Object.create(null) as StrictJsonObject:object(root.properties)
  if(root.type!=='object'||Object.keys(root).some(key=>!['type','properties','required','additionalProperties'].includes(key))||!properties||Object.keys(properties).length>100||root.additionalProperties!==undefined&&typeof root.additionalProperties!=='boolean')return undefined
  const required=root.required??[];if(!Array.isArray(required)||required.some(key=>typeof key!=='string'||!Object.hasOwn(properties,key))||new Set(required).size!==required.length)return undefined
  validateCommandParameterOrder(order,schema)
  const rows:CommandParameterRow[]=[]
  for(const key of order??Object.keys(properties)){const value=properties[key]
   const field=object(value);if(!keyPattern.test(key)||!field||!commandParameterTypes.some(([type])=>type===field.type))return undefined
   const type=field.type as CommandParameterType,name=text(field.title,128),description=text(field.description,512)
   if(Object.keys(field).some(key=>!allowed(type).includes(key))||name===undefined||description===undefined)return undefined
   const row={...newCommandParameter(),key,name,description,namePresent:Object.hasOwn(field,'title'),descriptionPresent:Object.hasOwn(field,'description'),type,required:required.includes(key)}
   for(const bound of ['minimum','maximum'] as const){const value=field[bound];if(value!==undefined){if(!isStrictJsonNumber(value)||value.lexical.length>1024)return undefined;row[bound]=value.lexical}}
   for(const bound of ['minLength','maxLength','minItems','maxItems'] as const)if(field[bound]!==undefined){const value=length(field[bound]);if(value===undefined)return undefined;row[bound]=value}
   if(type==='object'&&['properties','required','additionalProperties'].some(key=>Object.hasOwn(field,key))){const nested:Record<string,StrictJsonValue>={type:'object'};for(const key of ['properties','required','additionalProperties'])if(Object.hasOwn(field,key))nested[key]=field[key]!;row.nestedSchema=propertyValueText(nested)}
   if(type==='array'&&Object.hasOwn(field,'items')){if(!object(field.items))return undefined;row.nestedSchema=propertyValueText(field.items!)}
   if(field.enum!==undefined){if(!Array.isArray(field.enum)||!field.enum.length||field.enum.length>100)return undefined;row.enumText=propertyValueText(field.enum)}
   rows.push(row)
  }
  return{rows,additionalProperties:root.additionalProperties as boolean|undefined,requiredPresent:Object.hasOwn(root,'required'),propertiesPresent:Object.hasOwn(root,'properties'),unconstrained:false}
 }catch{return undefined}
}
function numberInput(value:string){const text=value.trim();if(!text)return undefined;if(text.length>1024)throw new Error('数值边界过长，请保留原 JSON 编辑');const parsed=parseDashboardRuntimeResponse(encoder.encode(`{"value":${text}}`)).value;if(!isStrictJsonNumber(parsed!))throw new Error('数值边界必须是合法 JSON 数字');return parsed.lexical}
function lengthInput(value:string){const text=value.trim();if(!text)return undefined;if(!/^(0|[1-9]\d{0,9})$/.test(text)||BigInt(text)>2147483647n)throw new Error('长度必须为0至2147483647的整数');return text}
/** 只生成命令内核已经执行的约束；名称和说明是展示元信息，不改变运行值。 */
export function commandParameterSchema(form:CommandParameterForm):string{
 if(form.rows.length>100)throw new Error('结构化参数每份最多100项；其它模型请保留 JSON 编辑')
 const keys=new Set<string>(),required:string[]=[],entries:string[]=[]
 for(const row of form.rows){const key=row.key.trim();if(!keyPattern.test(key)||keys.has(key))throw new Error('参数标识符必须为1至64位字母、数字、下划线或横线，且不能重复');keys.add(key)
  if(typeof row.name!=='string'||row.name.length>128||typeof row.description!=='string'||row.description.length>512||!commandParameterTypes.some(([type])=>type===row.type)||typeof row.required!=='boolean')throw new Error('请检查参数名称、说明及数据类型')
  const fields=[`"type":${JSON.stringify(row.type)}`]
  if(row.namePresent||row.name)fields.push(`"title":${JSON.stringify(row.name)}`)
  if(row.descriptionPresent||row.description)fields.push(`"description":${JSON.stringify(row.description)}`)
  if(row.type==='number'||row.type==='integer')for(const bound of ['minimum','maximum'] as const){const value=numberInput(row[bound]);if(value!==undefined)fields.push(`"${bound}":${value}`)}
  if(row.type==='string'||row.type==='array')for(const bound of row.type==='string'?['minLength','maxLength'] as const:['minItems','maxItems'] as const){const value=lengthInput(row[bound]);if(value!==undefined)fields.push(`"${bound}":${value}`)}
  if((row.type==='object'||row.type==='array')&&row.nestedSchema.trim()){
   const nested=parseDashboardRuntimeResponse(encoder.encode(row.nestedSchema));
   if(row.type==='object'){if(nested.type!=='object'||Object.keys(nested).some(key=>!['type','properties','required','additionalProperties'].includes(key)))throw new Error('对象子字段只支持对象结构约束；其它约束请保留完整 JSON 编辑');for(const key of ['properties','required','additionalProperties'])if(Object.hasOwn(nested,key))fields.push(`${JSON.stringify(key)}:${propertyValueText(nested[key]!)}`)}
   else fields.push(`"items":${row.nestedSchema.trim()}`)
  }
  if(row.enumText.trim()){const raw=row.enumText.trim(),value=parseDashboardRuntimeResponse(encoder.encode(`{"value":${raw}}`)).value;if(!Array.isArray(value)||!value.length||value.length>100)throw new Error('枚举约束必须为1至100项的 JSON 数组');fields.push(`"enum":${raw}`)}
  entries.push(`${JSON.stringify(key)}:{${fields.join(',')}}`);if(row.required)required.push(key)
 }
 const fields=['"type":"object"'];if(form.propertiesPresent||form.rows.length||!form.unconstrained)fields.push(`"properties":{${entries.join(',')}}`)
 if(form.requiredPresent||required.length)fields.push(`"required":${JSON.stringify(required)}`)
 if(form.additionalProperties!==undefined)fields.push(`"additionalProperties":${form.additionalProperties}`)
 const result=`{${fields.join(',')}}`;if(encoder.encode(result).length>65536)throw new Error('结构化参数 Schema 超过64KiB，请精简或保留原 JSON 编辑')
 parseDashboardRuntimeResponse(encoder.encode(result));return result
}
