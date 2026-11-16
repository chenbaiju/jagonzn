import {basicObjectBoundaryMessage,basicObjectParameterSchema} from './function-material-values'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import type {MaterialProperty} from './tsl-material-import-api'
import {materialText,sourceMaterialNumber,compareMaterialNumbers} from './scalar-material-values'
import type {MaterialEvent,MaterialCommand,MaterialAdaptationDecision} from './function-material-values'
import {compositeObjectBoundaryMessage,compositeListBoundaryMessage,stripCompositeText} from './composite-material-values'
import {sourceStyleTokenWithoutGlyph,sourceStyleNoGlyphMessage,eventStyleIconAllowed,commandStyleIconAllowed} from './function-style-icons'

type PropertyRequest=Schema<'SaveDevicePropertyDefinitionRequest'>
/** 正式属性写合同的转换候选；本模块没有HTTP、发布或导入副作用。 */
export type TslNumberProperty=Readonly<Required<Pick<PropertyRequest,'propertyKey'|'name'|'accessType'|'dataType'|'sortOrder'|'description'>>>
export type TslIssue=Readonly<{path:string;message:string}>
export type TslScalarProperty=Readonly<Omit<MaterialProperty,'sourcePointer'>>
export type TslPreview=Readonly<{source?:Readonly<{name:string;description:string;icon:string}>;properties:readonly (TslNumberProperty|TslScalarProperty)[];issues:readonly TslIssue[]}>
const MAX_BYTES=1024*1024,MAX_PROPERTIES=100
const child=(path:string,key:string)=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)?`${path}.${key}`:`${path}[${JSON.stringify(key)}]`
/** 只接已观察的Number/report/空options形状；任何错误都不给部分导入候选。 */
export function convertThingsCloudTsl(bytes:Uint8Array):TslPreview{
 const issues:TslIssue[]=[],properties:TslNumberProperty[]=[]
 const issue=(path:string,message:string)=>{issues.push(Object.freeze({path,message}))}
 function object(value:StrictJsonValue|undefined,path:string,required:readonly string[]):StrictJsonObject|undefined{
  if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value)){issue(path,'必须是JSON对象');return}
  const row=value as StrictJsonObject
  for(const key of required)if(!Object.hasOwn(row,key))issue(child(path,key),'缺少必要字段')
  for(const key of Object.keys(row))if(!required.includes(key))issue(child(path,key),'当前转换切片不支持该字段')
  return row
 }
 function text(value:StrictJsonValue|undefined,path:string,maximum:number,nonblank=false):value is string{
  if(typeof value!=='string'||value.length>maximum||value.includes('\0')||new TextDecoder('utf-8',{fatal:true}).decode(new TextEncoder().encode(value))!==value||nonblank&&!value.trim()){issue(path,`必须是${nonblank?'非空':'合法'}文本，最多${maximum}个字符`);return false}return true
 }
 if(bytes.byteLength>MAX_BYTES){issue('$','TSL原文最多1MiB');return {properties:[],issues}}
 let decoded:StrictJsonValue
 try{decoded=parseDashboardRuntimeResponse(bytes)}catch{issue('$','JSON原文无效：请检查重复字段、UTF-8、字符串或数字格式');return {properties:[],issues}}
 const root=object(decoded,'$',['name','descr','icon','attributes','events','commands'])
 if(!root)return {properties:[],issues}
 const name=text(root.name,'$.name',128,true)?root.name:undefined,description=text(root.descr,'$.descr',512)?root.descr:undefined,icon=text(root.icon,'$.icon',128)?root.icon:undefined
 const source=name!==undefined&&description!==undefined&&icon!==undefined?Object.freeze({name,description,icon}):undefined
 for(const section of ['events','commands'] as const){if(!Array.isArray(root[section]))issue(`$.${section}`,'必须是数组');else if(root[section].length)issue(`$.${section}`,'当前只支持已确认的Number属性切片；该段必须为空，不会忽略其内容')}
 if(!Array.isArray(root.attributes))issue('$.attributes','必须是数组')
 else if(root.attributes.length>MAX_PROPERTIES)issue('$.attributes','本次最多转换100个属性，不会截断')
 else{
  const keys=new Set<string>()
  root.attributes.forEach((value,index)=>{
   const path=`$.attributes[${index}]`,before=issues.length,row=object(value,path,['identifier','name','descr','attributeType','dataType','options']);if(!row)return
   const key=text(row.identifier,child(path,'identifier'),64,true)?row.identifier:undefined
   if(key!==undefined){if(!/^[A-Za-z0-9_-]{1,64}$/.test(key))issue(child(path,'identifier'),'属性标识仅支持字母、数字、下划线和连字符');if(keys.has(key))issue(child(path,'identifier'),'同类属性标识重复');keys.add(key)}
   const propertyName=text(row.name,child(path,'name'),128,true)?row.name:undefined,descr=text(row.descr,child(path,'descr'),512)?row.descr:undefined
   if(row.attributeType!=='report')issue(child(path,'attributeType'),'当前只确认report，不能猜测其它流向')
   if(row.dataType!=='number')issue(child(path,'dataType'),'当前只确认number，不会改成其它类型或丢弃')
   object(row.options,child(path,'options'),[])
   if(issues.length===before&&key!==undefined&&propertyName!==undefined&&descr!==undefined)properties.push(Object.freeze({propertyKey:key,name:propertyName,accessType:'REPORT',dataType:'NUMBER',sortOrder:index,description:descr||null}))
  })
 }
 return Object.freeze({...(source?{source}:{}),properties:Object.freeze(issues.length?[]:properties),issues:Object.freeze(issues)})
}

/** 新格式只解释实取的四标量/四流向；旧v1入口保持原封闭解释，不丢弃未支持领域。 */
export function convertThingsCloudScalarTsl(bytes:Uint8Array):TslPreview{
 const issues:TslIssue[]=[],properties:TslScalarProperty[]=[],issue=(path:string,message:string)=>{issues.push(Object.freeze({path,message}))}
 function object(value:StrictJsonValue|undefined,path:string,allowed:readonly string[],required:readonly string[]=allowed):StrictJsonObject|undefined{
  if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value)){issue(path,'必须是JSON对象');return}
  const row=value as StrictJsonObject
  for(const key of required)if(!Object.hasOwn(row,key))issue(child(path,key),'缺少必要字段')
  for(const key of Object.keys(row))if(!allowed.includes(key))issue(child(path,key),'新标量格式不支持该字段，不会忽略内容')
  return row
 }
 function text(value:unknown,path:string,max:number,nonblank=false):value is string{if(!materialText(value,max,nonblank)){issue(path,`必须是${nonblank?'非空':'合法'}文本，最多${max}个字符`);return false}return true}
 if(bytes.byteLength>MAX_BYTES){issue('$','TSL原文最多1MiB');return{properties:[],issues}}
 let root:StrictJsonObject|undefined
 try{root=object(parseDashboardRuntimeResponse(bytes),'$',['name','descr','icon','attributes','events','commands'])}catch{issue('$','JSON原文无效：请检查重复字段、UTF-8、字符串或数字格式')}
 if(!root)return{properties:[],issues}
 const name=text(root.name,'$.name',128,true)?root.name:undefined,description=text(root.descr,'$.descr',512)?root.descr:undefined,icon=text(root.icon,'$.icon',128)?root.icon:undefined,source=name!==undefined&&description!==undefined&&icon!==undefined?Object.freeze({name,description,icon}):undefined
 for(const section of ['events','commands']){if(!Array.isArray(root[section]))issue(`$.${section}`,'必须是数组');else if(root[section].length)issue(`$.${section}`,'新标量格式不支持非空事件或命令，不会忽略内容')}
 if(!Array.isArray(root.attributes))issue('$.attributes','必须是数组')
 else if(root.attributes.length>MAX_PROPERTIES)issue('$.attributes','本次最多转换100个属性，不会截断')
 else{
  const keys=new Set<string>(),flows:Record<string,string>={report:'REPORT',push:'DOWNLINK',share:'SHARED',cloud:'CLOUD_PRIVATE'},types:Record<string,string>={number:'NUMBER',boolean:'SWITCH',string:'TEXT',enum:'ENUM'}
  root.attributes.forEach((raw,index)=>{
   const path=`$.attributes[${index}]`,before=issues.length,row=object(raw,path,['identifier','name','descr','attributeType','dataType','options']);if(!row)return
   const key=text(row.identifier,`${path}.identifier`,64,true)?row.identifier:undefined,title=text(row.name,`${path}.name`,128,true)?row.name:undefined,note=text(row.descr,`${path}.descr`,512)?row.descr:undefined
   if(key!==undefined){if(!/^[A-Za-z0-9_-]{1,64}$/.test(key))issue(`${path}.identifier`,'属性标识仅支持字母、数字、下划线和连字符');if(keys.has(key))issue(`${path}.identifier`,'同类属性标识重复');keys.add(key)}
   const accessType=typeof row.attributeType==='string'&&Object.hasOwn(flows,row.attributeType)?flows[row.attributeType]:undefined,dataType=typeof row.dataType==='string'&&Object.hasOwn(types,row.dataType)?types[row.dataType]:undefined
   if(!accessType)issue(`${path}.attributeType`,'流向必须是report/push/share/cloud之一')
   if(!dataType)issue(`${path}.dataType`,'仅接Number/Text/Switch/Enum，不会忽略Object/List或未知类型')
   const allowed=row.dataType==='number'?['unit','min','max','step','default']:row.dataType==='string'?['default']:row.dataType==='boolean'?['valueType','onText','offText']:row.dataType==='enum'?['enumMap']:[]
   const options=object(row.options,`${path}.options`,allowed,row.dataType==='boolean'?['valueType']:row.dataType==='enum'?['enumMap']:[]),fields:Record<string,unknown>={}
   if(options&&row.dataType==='number'){
    if(Object.hasOwn(options,'unit')&&text(options.unit,`${path}.options.unit`,32)){const unit=(options.unit as string).trim();if(unit)fields.unit=unit}
    for(const[key,target]of[['min','minimumValue'],['max','maximumValue'],['step','numericStep'],['default','defaultValue']] as const)if(Object.hasOwn(options,key)){
     const number=sourceMaterialNumber(options[key]);if(number===undefined)issue(`${path}.options.${key}`,'必须是有界的严格十进制字符串');else if(key==='step'&&compareMaterialNumbers(number,'0')<=0)issue(`${path}.options.step`,'步进必须大于0');else fields[target]=number
    }
    if(typeof fields.minimumValue==='string'&&typeof fields.maximumValue==='string'&&compareMaterialNumbers(fields.minimumValue,fields.maximumValue)>0)issue(`${path}.options.max`,'最大值不能小于最小值')
    if(typeof fields.defaultValue==='string'&&(typeof fields.minimumValue==='string'&&compareMaterialNumbers(fields.defaultValue,fields.minimumValue)<0||typeof fields.maximumValue==='string'&&compareMaterialNumbers(fields.defaultValue,fields.maximumValue)>0))issue(`${path}.options.default`,'默认声明必须位于已声明量程内')
   }else if(options&&row.dataType==='string'){
    if(Object.hasOwn(options,'default')&&text(options.default,`${path}.options.default`,4096))fields.textDefaultValue=options.default
   }else if(options&&row.dataType==='boolean'){
    const encodings:Record<string,string>={boolean:'BOOLEAN',number:'NUMBER',text:'TEXT'},encoding=typeof options.valueType==='string'&&Object.hasOwn(encodings,options.valueType)?encodings[options.valueType]:undefined
    if(!encoding)issue(`${path}.options.valueType`,'开关编码必须是boolean/number/text之一');else fields.switchEncoding=encoding
    for(const[key,target]of[['onText','onLabel'],['offText','offLabel']] as const)if(Object.hasOwn(options,key)&&text(options[key],`${path}.options.${key}`,32)){const value=(options[key] as string).trim();if(value)fields[target]=value}
   }else if(options&&row.dataType==='enum'){
    const map=options.enumMap
    if(!map||typeof map!=='object'||Array.isArray(map)||isStrictJsonNumber(map))issue(`${path}.options.enumMap`,'枚举映射必须是对象')
    else{
     const entries=Object.entries(map),descriptions:Record<string,string>=Object.create(null)
     if(!entries.length||entries.length>100)issue(`${path}.options.enumMap`,'枚举必须为1至100项')
     for(const[key,value]of entries){const at=child(`${path}.options.enumMap`,key);if(!materialText(key,64,true)||key.trim()!==key)issue(at,'枚举键必须为1至64字符且没有首尾空白');if(text(value,at,512)&&value.trim())descriptions[key]=value.trim()}
     fields.enumOptions=Object.freeze(entries.map(([key])=>key));if(Object.keys(descriptions).length)fields.presentation=Object.freeze({iconId:null,color:null,enumDescriptions:Object.freeze(descriptions),objectFields:Object.freeze({})})
    }
   }
   if(issues.length===before&&key!==undefined&&title!==undefined&&note!==undefined&&accessType&&dataType)properties.push(Object.freeze({propertyKey:key,name:title.trim(),description:note.trim()||null,sortOrder:index,accessType,dataType,...fields}) as TslScalarProperty)
  })
 }
 return Object.freeze({...(source?{source}:{}),properties:Object.freeze(issues.length?[]:properties),issues:Object.freeze(issues)})
}

/** 三域本地候选只复用正式写入字段；实际写入仍使用服务端权威预览及固定摘要。 */
export type TslFunctionEvent=MaterialEvent
export type TslFunctionCommand=MaterialCommand
export type TslFunctionDecision=MaterialAdaptationDecision
export type TslFunctionPreview=Readonly<TslPreview&{events:readonly TslFunctionEvent[];commands:readonly TslFunctionCommand[];adaptationDecisions:readonly TslFunctionDecision[]}>
/** 参数目前仅适配同形状string/boolean；未知结构整份拒绝，不剪裁其它领域。 */
export function convertThingsCloudFunctionTsl(bytes:Uint8Array):TslFunctionPreview{return convertFunctionTsl(bytes,false)}
/** V4只扩Number参数；平台数值约束逐域说明，不改旧V3解释。 */
export function convertThingsCloudNumberFunctionTsl(bytes:Uint8Array):TslFunctionPreview{return convertFunctionTsl(bytes,true)}
/** 样式使用有准确SVG路径的固定MDI身份，不替换为近似语义图标。 */
export function convertThingsCloudStyledFunctionTsl(bytes:Uint8Array):TslFunctionPreview{return convertFunctionTsl(bytes,true,true)}
export function convertThingsCloudCompositeTsl(bytes:Uint8Array):TslFunctionPreview{return convertFunctionTsl(bytes,true,true,true)}
export function convertThingsCloudSourceStyleTsl(bytes:Uint8Array):TslFunctionPreview{return convertFunctionTsl(bytes,true,true,true,true)}
export function convertThingsCloudBasicObjectTsl(bytes:Uint8Array):TslFunctionPreview{return convertFunctionTsl(bytes,true,true,true,true,true)}
function convertFunctionTsl(bytes:Uint8Array,allowNumber:boolean,allowStyle=false,allowComposite=false,allowSourceTokens=false,allowBasicObjects=false):TslFunctionPreview{
 const issues:TslIssue[]=[],events:TslFunctionEvent[]=[],commands:TslFunctionCommand[]=[],decisions:TslFunctionDecision[]=[],issue=(path:string,message:string)=>issues.push(Object.freeze({path,message}))
 const failed=():TslFunctionPreview=>Object.freeze({properties:[],events:[],commands:[],adaptationDecisions:[],issues:Object.freeze(issues)})
 if(bytes.byteLength>MAX_BYTES){issue('$','TSL原文最多1MiB');return failed()}
 let root:StrictJsonObject
 try{root=parseDashboardRuntimeResponse(bytes)}catch{issue('$','JSON原文无效：请检查重复字段、UTF-8、字符串或数字格式');return failed()}
 function object(value:StrictJsonValue|undefined,path:string,fields:readonly string[]):StrictJsonObject|undefined{
  if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value)){issue(path,'必须是JSON对象');return}
  const row=value as StrictJsonObject
  for(const key of fields)if(!Object.hasOwn(row,key))issue(child(path,key),'缺少必要字段')
  for(const key of Object.keys(row))if(!fields.includes(key))issue(child(path,key),'三域材料不支持该字段，不会忽略内容')
  return row
 }
 function text(value:unknown,path:string,max:number,required=false):string|undefined{if(!materialText(value,max,required)){issue(path,`必须是${required?'非空':'合法'}文本，最多${max}个字符`);return}return value as string}
 function identity(row:StrictJsonObject,path:string,keys:Set<string>,maximumDescription=500){const key=text(row.identifier,`${path}.identifier`,64,true),name=text(row.name,`${path}.name`,128,true),description=text(row.descr,`${path}.descr`,maximumDescription);if(key!==undefined){if(!/^[A-Za-z0-9_-]{1,64}$/.test(key)||keys.has(key))issue(`${path}.identifier`,'标识必须合法且同类内不能重复');keys.add(key)}return{key,name,description}}
 function parameters(value:StrictJsonValue|undefined,path:string,event=false){
  const rows:{key:string;name:string;description:string;type:'string'|'boolean'|'number'|'object'}[]=[]
  if(!Array.isArray(value)){issue(path,'必须是数组');return rows}if(value.length>100){issue(path,'每组最多100项参数，不会截断');return rows}
  const keys=new Set<string>()
  value.forEach((item,index)=>{const at=`${path}[${index}]`,before=issues.length,row=object(item,at,['identifier','name','dataType','descr']);if(!row)return;const meta=identity(row,at,keys,512);const description=text(row.descr,`${at}.descr`,512);if(!(allowBasicObjects&&event?['string','boolean','number','object']:allowNumber?['string','boolean','number']:['string','boolean']).includes(String(row.dataType)))issue(`${at}.dataType`,allowNumber?(allowComposite?'该参数缺少可导入结构；V6仅支持已确认string/boolean/number，Enum/Object/List整份拒绝':'V4参数仅支持string/boolean/number；Enum/Object/List整份拒绝'):'参数仅适配已确认同形状的string/boolean；Number/Enum/Object/List整份拒绝');if(issues.length===before&&meta.key!==undefined&&meta.name!==undefined&&description!==undefined)rows.push({key:meta.key,name:meta.name.trim(),description:description.trim(),type:row.dataType as 'string'|'boolean'|'number'|'object'})})
  return rows
 }
 if(!object(root,'$',['name','descr','icon','attributes','events','commands']))return failed()
 // 仅将已独立处理的复合类型及原生Timer临时投影后复用身份校验，输出仍恢复原生类型，仍保留根上的未知字段供其拒绝。
 const sourceProperties=Array.isArray(root.attributes)?root.attributes:[],composite=(value:StrictJsonValue)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&!isStrictJsonNumber(value)&&['object','list','daily_timer','daily_timer_list','daily_timer_range','daily_timer_range_list','daily_timer_duration','daily_timer_duration_list','daily_timer_interval','daily_timer_interval_list'].includes(String((value as StrictJsonObject).dataType))
 const scalar=convertThingsCloudScalarTsl(new TextEncoder().encode(prettyFunctionInput({...root,...(allowComposite&&Array.isArray(root.attributes)?{attributes:sourceProperties.map(value=>composite(value)?{...(value as StrictJsonObject),dataType:'number',options:{}}:value)}:{}),events:[],commands:[]})))
 issues.push(...scalar.issues)
 const compositeFields=new Map<number,Record<string,unknown>>()
 if(allowComposite)sourceProperties.forEach((value,index)=>{if(!composite(value))return;const row=value as StrictJsonObject,path=`$.attributes[${index}]`,before=issues.length
  if(row.dataType==='daily_timer'||row.dataType==='daily_timer_list'||row.dataType==='daily_timer_range'||row.dataType==='daily_timer_range_list'||row.dataType==='daily_timer_duration'||row.dataType==='daily_timer_duration_list'||row.dataType==='daily_timer_interval'||row.dataType==='daily_timer_interval_list'){object(row.options,path+'.options',[]);if(row.attributeType!=='cloud')issue(path+'.attributeType','每日定时器仅支持cloud');if(issues.length===before)compositeFields.set(index,{dataType:row.dataType==='daily_timer'?'DAILY_TIMER':row.dataType==='daily_timer_list'?'DAILY_TIMER_LIST':row.dataType==='daily_timer_range'?'DAILY_TIMER_RANGE':row.dataType==='daily_timer_range_list'?'DAILY_TIMER_RANGE_LIST':row.dataType==='daily_timer_duration'?'DAILY_TIMER_DURATION':row.dataType==='daily_timer_duration_list'?'DAILY_TIMER_DURATION_LIST':row.dataType==='daily_timer_interval'?'DAILY_TIMER_INTERVAL':'DAILY_TIMER_INTERVAL_LIST'});return}
  if(row.dataType==='list'){object(row.options,path+'.options',[]);if(issues.length===before){compositeFields.set(index,{dataType:'LIST',schema:JSON.stringify({type:'array',maxItems:256}),compositeProfile:'BASIC_MIXED_LIST_V1'});decisions.push({scope:path,code:'LIST_PLATFORM_MIXED_BOUNDARY',message:compositeListBoundaryMessage})}return}
  const options=object(row.options,path+'.options',['children']);if(!options)return;const children=options.children;if(!Array.isArray(children)||!children.length||children.length>64){issue(path+'.options.children','OBJECT需1至64个已具名子字段，平台不推测空对象或未声明结构');return}
  const keys=new Set<string>(),fields:Record<string,{type:'number'}>=Object.create(null),metadata:Record<string,{name:string;description:string|null}>=Object.create(null),required:string[]=[]
  children.forEach((raw,position)=>{const at=`${path}.options.children[${position}]`,prior=issues.length,entry=object(raw,at,['identifier','name','dataType','descr','required']);if(!entry)return;const key=text(entry.identifier,at+'.identifier',64,true),name=text(entry.name,at+'.name',128),note=text(entry.descr,at+'.descr',512);if(key!==undefined&&(!/^[A-Za-z0-9_-]{1,64}$/.test(key)||keys.has(key)))issue(at+'.identifier','子字段标识必须合法且不重复');if(key!==undefined)keys.add(key);if(name!==undefined&&(!stripCompositeText(name)||stripCompositeText(name).length>64))issue(at+'.name','子字段名称经既有平台规范后需为1至64个字符');if(entry.dataType!=='number')issue(at+'.dataType','当前仅有具名Number子字段原件；嵌套或其它子字段类型缺少可复用结构，整份不导入');if(typeof entry.required!=='boolean')issue(at+'.required','必须保留源站明确的required布尔值');if(issues.length===prior&&key!==undefined&&name!==undefined&&note!==undefined){fields[key]={type:'number'};metadata[key]={name:stripCompositeText(name),description:stripCompositeText(note)||null};if(entry.required===true)required.push(key)}})
  if(issues.length===before){compositeFields.set(index,{dataType:'OBJECT',schema:JSON.stringify({type:'object',properties:fields,required,additionalProperties:false,maxProperties:children.length}),presentation:{iconId:null,color:null,enumDescriptions:{},objectFields:metadata}});decisions.push({scope:path,code:'OBJECT_PLATFORM_SCHEMA_BOUNDARY',message:compositeObjectBoundaryMessage})}
 })
 const properties=allowComposite?scalar.properties.map(row=>Object.freeze({...row,...compositeFields.get(row.sortOrder!)})):scalar.properties
 for(const kind of ['events','commands'] as const){const values=root[kind];if(!Array.isArray(values)){issue(`$.${kind}`,'必须是数组');continue}if(values.length>100){issue(`$.${kind}`,'每域最多100项功能，不会截断');continue}const keys=new Set<string>();values.forEach((value,index)=>{
  const path=`$.${kind}[${index}]`,before=issues.length,hasStyle=allowStyle&&!!value&&typeof value==='object'&&Object.hasOwn(value,'style'),row=object(value,path,[...(kind==='events'?['identifier','name','descr','params','level']:['identifier','name','descr','sendParams','replyParams']),...(hasStyle?['style']:[])]);if(!row)return;const meta=identity(row,path,keys,kind==='events'?512:500)
  let style:{iconId:string;color:string}|undefined
  if(hasStyle){const supplied=object(row.style,path+'.style',['icon','color']);if(supplied){if(!(kind==='events'?eventStyleIconAllowed(supplied.icon):commandStyleIconAllowed(supplied.icon))||!allowSourceTokens&&sourceStyleTokenWithoutGlyph(supplied.icon))issue(path+'.style.icon','该图标不属于当前功能的固定图标集合，不使用近似替代');if(typeof supplied.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(supplied.color))issue(path+'.style.color','颜色必须是六位HEX');if(typeof supplied.icon==='string'&&typeof supplied.color==='string')style={iconId:supplied.icon,color:supplied.color.toLowerCase()}}}
  if(kind==='events'){
   const params=parameters(row.params,`${path}.params`,true),levels:Record<string,string>={info:'INFO',success:'SUCCESS',warning:'WARNING',fault:'ERROR'},level=typeof row.level==='string'&&Object.hasOwn(levels,row.level)?levels[row.level]:undefined
   if(!level)issue(`${path}.level`,'事件级别必须是info/success/warning/fault')
   if(issues.length===before&&meta.key!==undefined&&meta.name!==undefined&&meta.description!==undefined&&level){events.push(Object.freeze({sourcePointer:path,eventKey:meta.key,name:meta.name.trim(),description:meta.description.trim()||null,level,sortOrder:index,parameters:params.map((parameter,sortOrder)=>({sourcePointer:`${path}.params[${sortOrder}]`,parameterKey:parameter.key,name:parameter.name,dataType:parameter.type==='string'?'TEXT':parameter.type==='number'?'NUMBER':parameter.type==='object'?'OBJECT':'SWITCH',required:false,sortOrder,description:parameter.description||null,...(parameter.type==='object'?{schema:basicObjectParameterSchema,compositeProfile:'BASIC_MIXED_OBJECT_V1'}:{})})),...(style?{presentation:style}:{})}) as TslFunctionEvent);decisions.push({scope:path,code:'EVENT_OPTIONAL_PARAMETERS',message:'源站未声明必填；平台导入事件参数required=false'+(allowNumber?'；Number沿平台事件引擎：有效位数最多38、绝对值不超过1e308、scale为-308至308，未补源站min/max/step':'')+(allowStyle?'；显式style的MDI图标和HEX颜色按原值保留（颜色仅规范大小写）':'')},{scope:path,code:'EVENT_UNKNOWN_KEYS_REJECTED',message:'事件沿用平台现有额外参数拒绝规则'});if(allowSourceTokens&&sourceStyleTokenWithoutGlyph(style?.iconId))decisions.push({scope:path,code:'SOURCE_STYLE_TOKEN_NO_GLYPH',message:sourceStyleNoGlyphMessage});params.forEach((parameter,position)=>{if(parameter.type==='object')decisions.push({scope:`${path}.params[${position}]`,code:'EVENT_BASIC_OBJECT_PLATFORM_BOUNDARY',message:basicObjectBoundaryMessage})})}
  }else{
   const input=parameters(row.sendParams,`${path}.sendParams`),output=parameters(row.replyParams,`${path}.replyParams`),schema=(params:typeof input)=>JSON.stringify({type:'object',properties:Object.fromEntries(params.map(parameter=>[parameter.key,{type:parameter.type,title:parameter.name,...(parameter.description?{description:parameter.description}:{})}]))})
   if(issues.length===before&&meta.key!==undefined&&meta.name!==undefined&&meta.description!==undefined){commands.push(Object.freeze({sourcePointer:path,commandKey:meta.key,name:meta.name.trim(),description:meta.description.trim()||null,sortOrder:index,inputSchema:schema(input),outputSchema:schema(output),timeoutSeconds:30,presentation:{iconId:style?.iconId??null,color:style?.color??null,inputParameterOrder:input.map(parameter=>parameter.key),outputParameterOrder:output.map(parameter=>parameter.key)}}) as TslFunctionCommand);decisions.push({scope:path,code:'COMMAND_OPTIONAL_OPEN_PARAMETERS',message:'源站未声明必填或额外键策略；Schema不添加required和additionalProperties'+(allowNumber?'；Number沿平台COMMAND_COMPAT数值校验，不新增源站未声明的minimum/maximum/step/default':'')+(allowStyle?'；显式style的MDI图标和HEX颜色按原值保留（颜色仅规范大小写）':'')},{scope:path,code:'COMMAND_TIMEOUT_PLATFORM_DEFAULT',message:'源站未声明超时；使用平台默认30秒'});if(allowSourceTokens&&sourceStyleTokenWithoutGlyph(style?.iconId))decisions.push({scope:path,code:'SOURCE_STYLE_TOKEN_NO_GLYPH',message:sourceStyleNoGlyphMessage})}
  }
 })}
 const total=scalar.properties.length+events.length+commands.length,parameterCount=events.reduce((sum,row)=>sum+row.parameters.length,0)+commands.reduce((sum,row)=>sum+(row.presentation.inputParameterOrder?.length||0)+(row.presentation.outputParameterOrder?.length||0),0)
 if(allowBasicObjects&&!events.some(row=>row.parameters.some(parameter=>parameter.compositeProfile==='BASIC_MIXED_OBJECT_V1')))issue('$.events','V9仅用于含明确通用Object事件参数的材料');if(total>100)issue('$','三域功能总数最多100项，不会截断');if(parameterCount>100)issue('$','本次参数总数最多100项，不会截断');if(!total&&!issues.length)issue('$','没有可导入功能')
 return Object.freeze({...scalar,properties:issues.length?[]:properties,events:Object.freeze(issues.length?[]:events),commands:Object.freeze(issues.length?[]:commands),adaptationDecisions:Object.freeze(issues.length?[]:decisions),issues:Object.freeze(issues)})
}
/** 为复用既有纯转换保留严格数字词法，不经JS浮点或删掉未知根字段。 */
function prettyFunctionInput(value:StrictJsonValue):string{if(isStrictJsonNumber(value))return value.lexical;if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return'['+value.map(prettyFunctionInput).join(',')+']';return'{'+Object.entries(value).map(([key,item])=>JSON.stringify(key)+':'+prettyFunctionInput(item)).join(',')+'}'}
