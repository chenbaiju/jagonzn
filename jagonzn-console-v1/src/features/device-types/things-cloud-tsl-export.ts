import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
import type {PropertyDefinition} from './property-definition-api'
import type {TslSource} from './tsl-source-api'
import {fixedFunctionMdiIcon,eventStyleIconAllowed,commandStyleIconAllowed} from './function-style-icons'
import {validateCommandParameterOrder} from './command-parameter-schema'
export type TslExportIssue=Readonly<{path:string;message:string}>
export type TslExportFile=Readonly<{name:string;mime:string;content:string}>
export type TslExport=Readonly<{file?:TslExportFile;issues:readonly TslExportIssue[];warnings:readonly TslExportIssue[]}>
const object=(value:StrictJsonValue|undefined):StrictJsonObject|undefined=>value&&typeof value==='object'&&!Array.isArray(value)&&!isStrictJsonNumber(value)?value as StrictJsonObject:undefined
/** 数字节点始终使用严格JSON解析器的词法；字符串仅作JSON转义，不执行HTML。 */
export function prettyTslJson(value:StrictJsonValue,depth=0):string{
 if(isStrictJsonNumber(value))return value.lexical
 if(value===null||typeof value!=='object')return JSON.stringify(value)
 const pad='  '.repeat(depth),child='  '.repeat(depth+1)
 if(Array.isArray(value))return value.length?'[\n'+value.map(item=>child+prettyTslJson(item,depth+1)).join(',\n')+'\n'+pad+']':'[]'
 const entries=Object.entries(value)
 return entries.length?'{\n'+entries.map(([key,item])=>child+JSON.stringify(key)+': '+prettyTslJson(item,depth+1)).join(',\n')+'\n'+pad+'}':'{}'
}
/** 采用真实Source TSL形状；不能承载的本地约束独立说明，不静默宣称可无损往返。 */
export function thingsCloudTslFile(source:TslSource):TslExport{
 const issues:TslExportIssue[]=[],warnings:TslExportIssue[]=[],issue=(path:string,message:string)=>issues.push(Object.freeze({path,message})),warn=(path:string,message:string)=>warnings.push(Object.freeze({path,message}))
 function basicType(type:string,path:string):string{
  const types:Record<string,string>={NUMBER:'number',SWITCH:'boolean',TEXT:'string',ENUM:'string',OBJECT:'object',LIST:'list',number:'number',integer:'number',boolean:'boolean',string:'string',object:'object',array:'list'}
  if(!types[type])issue(path,'该参数类型尚未取得原站TSL对应值')
  if(type==='integer')warn(path,'整数约束没有已确认的TSL参数字段；导出为数值参数')
  return types[type]||''
 }
 function commandParameters(schema:string|null|undefined,path:string,order?:readonly string[]|null):StrictJsonValue[]{
  if(!schema)return[]
  let root:StrictJsonObject
  try{root=parseDashboardRuntimeResponse(new TextEncoder().encode(schema))}catch{issue(path,'当前命令参数Schema无法读取');return[]}
  const properties=object(root.properties)
  if(root.type!=='object'||root.properties!==undefined&&!properties){issue(path,'当前命令参数Schema不是可枚举的对象参数');return[]}
  if(Object.keys(root).some(key=>!['type','properties'].includes(key)))warn(path,'TSL参数仅承载标识、名称、类型和说明；对象约束保留在ThingsLink定义中')
  try{validateCommandParameterOrder(order,schema)}catch{issue(path,'参数顺序与当前Schema不符，未按猜测顺序导出');return[]}
  if(order==null&&Object.keys(properties||{}).length>1)warn(path,'命令未声明参数顺序，当前读取顺序不代表原作者顺序')
  return (order??Object.keys(properties||{})).map((key,index)=>{const value=properties?.[key]
   const field=object(value),fieldPath=`${path}[${index}]`
   if(!field){issue(fieldPath,'参数定义不是JSON对象');return{identifier:key,name:key,dataType:'',descr:''}}
   const dataType=typeof field.type==='string'?basicType(field.type,`${fieldPath}.dataType`):''
   if(!dataType)issue(`${fieldPath}.dataType`,'参数缺少可表达的单一类型')
   if(Object.keys(field).some(key=>!['type','title','description'].includes(key)))warn(fieldPath,'参数范围、枚举、默认值及子结构约束未取得TSL承载字段；原Schema保留')
   return{identifier:key,name:typeof field.title==='string'?field.title:key,dataType,descr:typeof field.description==='string'?field.description:''}
  })
 }
 function property(row:PropertyDefinition,index:number):StrictJsonObject{
  const path=`$.attributes[${index}]`,flows:Record<string,string>={REPORT:'report',SHARED:'share',DOWNLINK:'push',CLOUD_PRIVATE:'cloud'},attributeType=flows[row.accessType]
  if(!attributeType)issue(`${path}.attributeType`,'该流向尚未取得原站TSL对应值')
  let dataType='',options:StrictJsonObject={}
  if(row.dataType==='NUMBER'){
   dataType='number';options={...(row.unit?{unit:row.unit}:{}),...(row.defaultValue!==undefined?{default:row.defaultValue}:{}),...(row.minimumValue!==undefined?{min:row.minimumValue}:{}),...(row.maximumValue!==undefined?{max:row.maximumValue}:{}),...(row.numericStep!==undefined?{step:row.numericStep}:{})}
   if(row.decimalPlaces!==undefined)warn(`${path}.options`,'小数位数是独立声明，TSL仅导出真实步进，不将位数转换为step')
  }else if(row.dataType==='SWITCH'){
   dataType='boolean';const encoding=row.switchEncoding||'BOOLEAN'
   const encodings:Record<string,string>={BOOLEAN:'boolean',NUMBER:'number',TEXT:'text'},valueType=encodings[encoding]
   if(!valueType)issue(`${path}.options.valueType`,'该开关编码没有Source对应值')
   options={valueType:valueType||'',...(row.onLabel?{onText:row.onLabel}:{}),...(row.offLabel?{offText:row.offLabel}:{})}
  }else if(row.dataType==='ENUM'){
   dataType='enum';options={enumMap:Object.fromEntries((row.enumOptions||[]).map(value=>[value,row.presentation?.enumDescriptions[value]||'']))}
  }else if(row.dataType==='DAILY_TIMER'||row.dataType==='DAILY_TIMER_LIST'||row.dataType==='DAILY_TIMER_RANGE'||row.dataType==='DAILY_TIMER_RANGE_LIST'||row.dataType==='DAILY_TIMER_DURATION'||row.dataType==='DAILY_TIMER_DURATION_LIST'||row.dataType==='DAILY_TIMER_INTERVAL'||row.dataType==='DAILY_TIMER_INTERVAL_LIST'){dataType=row.dataType==='DAILY_TIMER'?'daily_timer':row.dataType==='DAILY_TIMER_LIST'?'daily_timer_list':row.dataType==='DAILY_TIMER_RANGE'?'daily_timer_range':row.dataType==='DAILY_TIMER_RANGE_LIST'?'daily_timer_range_list':row.dataType==='DAILY_TIMER_DURATION'?'daily_timer_duration':row.dataType==='DAILY_TIMER_DURATION_LIST'?'daily_timer_duration_list':row.dataType==='DAILY_TIMER_INTERVAL'?'daily_timer_interval':'daily_timer_interval_list';if(row.accessType!=='CLOUD_PRIVATE')issue(`${path}.attributeType`,'每日定时器仅支持云端私有属性')}else if(row.dataType==='TEXT'){dataType='string';options=row.textDefaultValue===undefined?{}:{default:row.textDefaultValue}}
  else if(row.dataType==='OBJECT'){
   dataType='object'
   if(!row.schema)issue(`${path}.options.children`,'对象缺少真实Schema')
   else try{
    const schema=parseDashboardRuntimeResponse(new TextEncoder().encode(row.schema)),properties=object(schema.properties)
    if(schema.type!=='object')issue(`${path}.options.children`,'对象Schema根类型不符')
    if(Object.keys(schema).some(key=>!['type','properties','required'].includes(key)))warn(path,'对象闭集、数量及其它Schema约束没有已确认的TSL字段；原Schema保留')
    if(!properties&&schema.properties!==undefined)issue(`${path}.options.children`,'对象子字段无法读取')
    const required=Array.isArray(schema.required)?schema.required:[]
    options={children:Object.entries(properties||{}).map(([key,raw],index)=>{
     const child=object(raw),at=`${path}.options.children[${index}]`,meta=row.presentation?.objectFields[key]
     if(!child){issue(at,'对象子字段不是JSON对象');return{identifier:key,name:key,dataType:'',descr:'',required:required.includes(key)}}
     if(Object.keys(child).some(key=>!['type','title','description'].includes(key)))warn(at,'子字段的范围、文本长度、默认值和嵌套约束未取得TSL字段；原Schema保留')
     if(typeof child.type!=='string')issue(`${at}.dataType`,'对象子字段缺少可表达的单一类型')
     return{identifier:key,name:meta?.name||(typeof child.title==='string'?child.title:key),dataType:typeof child.type==='string'?basicType(child.type,`${at}.dataType`):'',descr:meta?meta.description||'':typeof child.description==='string'?child.description:'',required:required.includes(key)}
    })}
   }catch{issue(`${path}.options.children`,'对象Schema无法读取')}
  }else if(row.dataType==='LIST'){
   dataType='list';if(row.schema||row.compositeProfile)warn(path,'TSL列表采用原站空options；长度、元素Schema及混合列表规则保留在ThingsLink定义中')
  }else issue(`${path}.dataType`,'该类型尚未取得原站TSL形状')
  if(row.presentation?.iconId||row.presentation?.color||row.presentation?.iconRaster)warn(path,'属性图标和颜色没有已确认的TSL承载字段；保留在ThingsLink定义中')
  return{identifier:row.propertyKey,name:row.name,descr:row.description||'',attributeType:attributeType||'',dataType,options}
 }
 const attributes=[...source.properties].sort((a,b)=>a.sortOrder-b.sortOrder).map(property)
 const events=[...source.events].sort((a,b)=>a.sortOrder-b.sortOrder).map((row,index)=>{
  const path=`$.events[${index}]`,levels:Record<string,string>={INFO:'info',SUCCESS:'success',WARNING:'warning',ERROR:'fault'},level=levels[row.level]
  if(!level)issue(`${path}.level`,'该事件级别尚未取得原站TSL对应值')
  const style=row.presentation?.iconId&&row.presentation.color&&!row.presentation.iconRaster&&fixedFunctionMdiIcon(row.presentation.iconId)&&eventStyleIconAllowed(row.presentation.iconId)?{icon:row.presentation.iconId,color:row.presentation.color}:undefined
  if(!style&&(row.presentation?.iconId||row.presentation?.color||row.presentation?.iconRaster))warn(path,'事件图标和颜色没有完整已确认的TSL承载字段；保留在ThingsLink定义中')
  const params=[...row.parameters].sort((a,b)=>a.sortOrder-b.sortOrder).map((parameter,index)=>{
   const at=`${path}.params[${index}]`
   if(parameter.required||parameter.schema||parameter.enumOptions.length)warn(at,'TSL参数仅承载标识、名称、类型和说明；必填、枚举及Schema约束保留在ThingsLink定义中')
   return{identifier:parameter.parameterKey,name:parameter.name,dataType:basicType(parameter.dataType,`${at}.dataType`),descr:parameter.description||''}
  })
  return{identifier:row.eventKey,name:row.name,descr:row.description||'',params,level:level||'',...(style?{style}:{})}
 })
 const commands=[...source.commands].sort((a,b)=>a.sortOrder-b.sortOrder).map((row,index)=>{
  const path=`$.commands[${index}]`
  warn(path,'命令超时没有已确认的TSL字段；超时设置保留在ThingsLink定义中')
  const style=row.presentation?.iconId&&row.presentation.color&&!row.presentation.iconRaster&&fixedFunctionMdiIcon(row.presentation.iconId)&&commandStyleIconAllowed(row.presentation.iconId)?{icon:row.presentation.iconId,color:row.presentation.color}:undefined
  if(!style&&(row.presentation?.iconId||row.presentation?.color||row.presentation?.iconRaster))warn(path,'命令图标和颜色没有完整已确认的TSL承载字段；保留在ThingsLink定义中')
  return{identifier:row.commandKey,name:row.name,descr:row.description||'',sendParams:commandParameters(row.inputSchema,`${path}.sendParams`,row.presentation?.inputParameterOrder),replyParams:commandParameters(row.outputSchema,`${path}.replyParams`,row.presentation?.outputParameterOrder),...(style?{style}:{})}
 })
 const root:StrictJsonObject={name:source.name,descr:source.description||'',icon:'mdi-cube-outline',attributes,events,commands}
 if(!object(root))issue('$','TSL根资料无效')
 const content=prettyTslJson(root)+'\n'
 // 出口再经现成严格JSON入口，避免数字token或文本转义成为伪JSON。
 if(!issues.length)try{parseDashboardRuntimeResponse(new TextEncoder().encode(content))}catch{issue('$','导出内容超出4MiB安全读取范围，未截断定义')}
 return Object.freeze({...(issues.length?{}:{file:Object.freeze({name:`thingscloud-tsl-${source.deviceTypeId}.json`,mime:'application/json;charset=utf-8',content})}),issues:Object.freeze(issues),warnings:Object.freeze(warnings)})
}
