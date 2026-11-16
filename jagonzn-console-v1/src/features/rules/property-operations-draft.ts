import {ExactDecimal,validUnicode,writePreprocessJson,type ExactJson} from './preprocess-exact-json'
import type {FunctionDraft} from './rule-builder-draft'
import {coordinateTransformDraft,type CoordinateTransformDraft} from './coordinate-transform-draft'
import {geofenceDraft,type CircleGeofenceDraft,type PolygonGeofenceDraft} from './geofence-draft'
import {periodUsageDraft,type PeriodUsageDraft} from './period-usage-draft'

/** 表单本地域草稿；正式HTTP只在生成Schema后的边界编码。 */
export type PropertyOperationDraft={id:string;kind:'FUNCTION';function:{format:FunctionDraft['format'];source:string}}|{id:string;kind:'COORDINATE_TRANSFORM';config:CoordinateTransformDraft}|{id:string;kind:'POINT_IN_CIRCLE';config:CircleGeofenceDraft}|{id:string;kind:'POINT_IN_POLYGON';config:PolygonGeofenceDraft}|{id:string;kind:'PERIOD_USAGE';config:PeriodUsageDraft}
export type PropertyOperationsDraft={profile:'PROPERTY_TRANSFORM_V1';operations:PropertyOperationDraft[]}
export type PropertyOperationCommand={token:string;kind:'EDIT'|'REMOVE';index:number}|{token:string;kind:'ADD'|'SORT'}
export const propertyOperationId=/^[A-Za-z0-9_-]{1,64}$/
export function clonePropertyOperations(value:PropertyOperationsDraft):PropertyOperationsDraft{return {profile:value.profile,operations:value.operations.map((row):PropertyOperationDraft=>{if(row.kind==='FUNCTION')return {...row,function:{...row.function}};if(row.kind==='COORDINATE_TRANSFORM')return {...row,config:{...row.config}};if(row.kind==='POINT_IN_CIRCLE')return {...row,config:{...row.config}};if(row.kind==='POINT_IN_POLYGON')return {...row,config:{...row.config}};return {...row,config:{...row.config}}})}}
export function propertyOperationsDraft(value:PropertyOperationsDraft):PropertyOperationsDraft{
 if(value.profile!=='PROPERTY_TRANSFORM_V1'||!Array.isArray(value.operations)||value.operations.length<1||value.operations.length>32)throw new Error('请添加1至32项预处理操作')
 const ids=new Set<string>()
 const operations=value.operations.map((row):PropertyOperationDraft=>{
  if(!propertyOperationId.test(row.id)||ids.has(row.id))throw new Error('预处理操作标识无效或重复');ids.add(row.id)
  if(row.kind==='COORDINATE_TRANSFORM')return {id:row.id,kind:row.kind,config:coordinateTransformDraft(row.config)}
  if(row.kind==='POINT_IN_CIRCLE')return {id:row.id,kind:row.kind,config:geofenceDraft(row.kind,row.config) as CircleGeofenceDraft}
  if(row.kind==='PERIOD_USAGE')return {id:row.id,kind:row.kind,config:periodUsageDraft(row.config)}
  if(row.kind==='POINT_IN_POLYGON')return {id:row.id,kind:row.kind,config:geofenceDraft(row.kind,row.config) as PolygonGeofenceDraft}
  if(row.kind!=='FUNCTION'||!['COMMON_JS','FUNCTION_EXPRESSION'].includes(row.function.format)||!row.function.source.trim()||!validUnicode(row.function.source))throw new Error('请补全每项操作的函数与格式')
  return {id:row.id,kind:row.kind,function:{format:row.function.format,source:row.function.source}}
 })
 const result:PropertyOperationsDraft={profile:'PROPERTY_TRANSFORM_V1',operations}
 if(new TextEncoder().encode(writePreprocessJson(result,true)).length>65536)throw new Error('预处理操作总内容超过允许大小')
 return result
}
/** 只有用户显式加入原生操作时升级；旧函数id/格式/源码原件保留。 */
export function functionsToPropertyOperations(functions:readonly FunctionDraft[]):PropertyOperationDraft[]{return functions.map(row=>({id:row.id,kind:'FUNCTION',function:{format:row.format,source:row.source}}))}
export function propertyOperationLabel(value:FunctionDraft|PropertyOperationDraft):string{if(!('kind' in value))return '预处理函数';return {FUNCTION:'预处理函数',COORDINATE_TRANSFORM:'GPS 位置坐标系转换',POINT_IN_CIRCLE:'GPS 位置电子围栏检查（圆形）',POINT_IN_POLYGON:'GPS 位置电子围栏检查（多边形）',PERIOD_USAGE:'计算抄表周期累计值'}[value.kind]}
export function propertyOperationGlyph(value:FunctionDraft|PropertyOperationDraft):string{if(!('kind' in value)||value.kind==='FUNCTION')return '󰡱';return value.kind==='COORDINATE_TRANSFORM'?'󰍏':value.kind==='PERIOD_USAGE'?'󰓅':'󱋼'}
export function readPropertyOperationsDraft(value:ExactJson):PropertyOperationsDraft{
 const invalid=()=>new Error('原生预处理操作资料不完整，请重新读取')
 const object=(input:ExactJson|undefined,keys:string[])=>{if(!input||typeof input!=='object'||Array.isArray(input)||input instanceof ExactDecimal||Object.keys(input).length!==keys.length||keys.some(key=>!Object.hasOwn(input,key)))throw invalid();return input}
 const text=(input:ExactJson|undefined)=>{if(typeof input!=='string')throw invalid();return input}
 const root=object(value,['profile','operations']);if(root.profile!=='PROPERTY_TRANSFORM_V1'||!Array.isArray(root.operations))throw invalid()
 const operations=root.operations.map((value):PropertyOperationDraft=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||value instanceof ExactDecimal)throw invalid()
  if(value.kind==='FUNCTION'){const row=object(value,['id','kind','function']),fn=object(row.function,['format','source']);if(fn.format!=='COMMON_JS'&&fn.format!=='FUNCTION_EXPRESSION')throw invalid();return{id:text(row.id),kind:'FUNCTION',function:{format:fn.format,source:text(fn.source)}}}
  if(value.kind==='COORDINATE_TRANSFORM'){const row=object(value,['id','kind','config']),config=object(row.config,['inputProperty','conversion','outputProperty']);if(config.conversion!=='WGS84_TO_GCJ02'&&config.conversion!=='WGS84_TO_BD09')throw invalid();return{id:text(row.id),kind:'COORDINATE_TRANSFORM',config:{inputProperty:text(config.inputProperty),conversion:config.conversion,outputProperty:text(config.outputProperty)}}}
  if(value.kind==='POINT_IN_CIRCLE'){const row=object(value,['id','kind','config']),config=object(row.config,['point','circle','result']);return{id:text(row.id),kind:'POINT_IN_CIRCLE',config:{point:text(config.point),circle:text(config.circle),result:text(config.result)}}}
  if(value.kind==='POINT_IN_POLYGON'){const row=object(value,['id','kind','config']),config=object(row.config,['point','polygon','result']);return{id:text(row.id),kind:'POINT_IN_POLYGON',config:{point:text(config.point),polygon:text(config.polygon),result:text(config.result)}}}
  if(value.kind==='PERIOD_USAGE'){const row=object(value,['id','kind','config']),config=object(row.config,['totalInput','usageDay','usageMonth']);if(typeof config.usageDay!=='boolean'||typeof config.usageMonth!=='boolean')throw invalid();return{id:text(row.id),kind:'PERIOD_USAGE',config:{totalInput:text(config.totalInput),usageDay:config.usageDay,usageMonth:config.usageMonth}}}
  throw invalid()
 })
 return propertyOperationsDraft({profile:'PROPERTY_TRANSFORM_V1',operations})
}
