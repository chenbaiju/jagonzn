import {api} from '@/core/http'
import {csvCell} from './form-model'
import type {Schema} from '@/core/contracts'
import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'

export type PropertyQueryItem=Readonly<Required<Schema<'DevicePropertyQueryItemResponse'>>>
export type PropertyQueryResult=Readonly<Omit<Required<Schema<'DevicePropertyQueryResponse'>>,'items'>&{items:readonly PropertyQueryItem[]}>
export type PropertyQueryValidation=Readonly<Required<Schema<'DevicePropertyQueryValidationResponse'>>>
type QueryBody=Readonly<Omit<Schema<'DevicePropertyQueryRequest'>,'deviceIds'>&{expression:string;deviceIds?:readonly string[]}>
export type PropertyQueryIntent=Readonly<{project:string;body:QueryBody;digest:string}>
export interface PropertyQueryTransport {
 validate(intent:PropertyQueryIntent,signal:AbortSignal):Promise<PropertyQueryValidation>
 execute(intent:PropertyQueryIntent,signal:AbortSignal):Promise<PropertyQueryResult>
}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,key=/^[A-Za-z0-9_-]{1,64}$/,grammar='DEVICE_PROPERTY_QUERY_V1'
function object(value:StrictJsonValue|undefined):value is StrictJsonObject{return value!==undefined&&value!==null&&typeof value==='object'&&!Array.isArray(value)&&!isStrictJsonNumber(value)}
function fields(value:StrictJsonValue|undefined,names:readonly string[]):asserts value is StrictJsonObject {
 if(!object(value)||Object.keys(value).length!==names.length||Object.keys(value).some(name=>!names.includes(name)))throw new Error('设备查询响应结构不完整')
}
function id(value:StrictJsonValue|undefined){if(typeof value!=='string'||!uuid.test(value))throw new Error('设备查询身份无效');return value}
function count(value:StrictJsonValue|undefined){if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,2})$/.test(value)||BigInt(value)>500n)throw new Error('设备查询数量无效');return value}
function wellFormed(value:string){
 for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(code>=0xd800&&code<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false}else if(code>=0xdc00&&code<=0xdfff)return false}return true
}
function expected(root:StrictJsonObject,intent:PropertyQueryIntent){if(root.grammarVersion!==grammar||root.expressionDigest!==intent.digest)throw new Error('查询响应与当前条件不一致')}
/** 原表达式只作为字符串序列化，绝不把其中十进制解析成JS number。 */
export async function preparePropertyQuery(project:string,expression:string,typeId?:string,deviceIds?:readonly string[]):Promise<PropertyQueryIntent>{
 if(!uuid.test(project)||!expression.trim()||new TextEncoder().encode(expression).byteLength>8192||!wellFormed(expression))throw new Error('查询条件不能为空且最多8KiB')
 if(typeId!==undefined&&!uuid.test(typeId)||deviceIds!==undefined&&(!deviceIds.length||deviceIds.length>500||new Set(deviceIds).size!==deviceIds.length||deviceIds.some(value=>!uuid.test(value))))throw new Error('设备查询范围无效')
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(expression))),value=>value.toString(16).padStart(2,'0')).join('')
 const body:QueryBody=Object.freeze({expression,...(typeId?{deviceTypeId:typeId}:{}),...(deviceIds?{deviceIds:Object.freeze([...deviceIds])}: {})})
 return Object.freeze({project,body,digest})
}
export function decodePropertyQueryValidation(bytes:Uint8Array,intent:PropertyQueryIntent):PropertyQueryValidation{
 const root=parseDashboardRuntimeResponse(bytes);fields(root,['grammarVersion','expressionDigest','propertyKeys']);expected(root,intent)
 if(!Array.isArray(root.propertyKeys)||root.propertyKeys.length>32||root.propertyKeys.some(value=>typeof value!=='string'||!key.test(value))||new Set(root.propertyKeys).size!==root.propertyKeys.length)throw new Error('查询属性集合无效')
 return{grammarVersion:grammar,expressionDigest:intent.digest,propertyKeys:root.propertyKeys as string[]}
}
export function decodePropertyQueryResult(bytes:Uint8Array,intent:PropertyQueryIntent):PropertyQueryResult{
 const root=parseDashboardRuntimeResponse(bytes);fields(root,['grammarVersion','expressionDigest','evaluatedAt','candidateCount','matchedCount','unknownCount','items']);expected(root,intent)
 if(typeof root.evaluatedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(root.evaluatedAt)||!Number.isFinite(Date.parse(root.evaluatedAt)))throw new Error('查询时刻无效')
 const candidateCount=count(root.candidateCount),matchedCount=count(root.matchedCount),unknownCount=count(root.unknownCount)
 if(!Array.isArray(root.items)||BigInt(root.items.length)!==BigInt(matchedCount)||BigInt(matchedCount)+BigInt(unknownCount)>BigInt(candidateCount))throw new Error('查询完整数量与结果不一致')
 const seen=new Set<string>(),items:PropertyQueryItem[]=root.items.map(value=>{
  fields(value,['deviceId','deviceTypeId','name','status','modelVersionId']);const deviceId=id(value.deviceId),deviceTypeId=id(value.deviceTypeId)
  if(seen.has(deviceId)||intent.body.deviceTypeId&&intent.body.deviceTypeId!==deviceTypeId||intent.body.deviceIds&&!intent.body.deviceIds.includes(deviceId))throw new Error('查询结果超出本次范围')
  seen.add(deviceId)
  if(typeof value.name!=='string'||!value.name.trim()||value.name.length>128||!['ONLINE','OFFLINE'].includes(String(value.status)))throw new Error('查询设备资料无效')
  const modelVersionId=value.modelVersionId===null?null:id(value.modelVersionId)
  return{deviceId,deviceTypeId,name:value.name,status:String(value.status),modelVersionId}
 })
 return{grammarVersion:grammar,expressionDigest:intent.digest,evaluatedAt:root.evaluatedAt,candidateCount,matchedCount,unknownCount,items}
}
export const propertyQueryTransport:PropertyQueryTransport={
 async validate(intent,signal){return decodePropertyQueryValidation(await api<Uint8Array>(`/api/v1/projects/${intent.project}/device-property-queries/validate`,{method:'post',body:intent.body,signal,responseType:'bytes',maxResponseBytes:65536}),intent)},
 async execute(intent,signal){return decodePropertyQueryResult(await api<Uint8Array>(`/api/v1/projects/${intent.project}/device-property-queries/execute`,{method:'post',body:intent.body,signal,responseType:'bytes',maxResponseBytes:4*1024*1024}),intent)}
}

/** 导出原同RR完整结果，不重新请求、不把当前显示页冒充全部匹配。 */
export function propertyQueryCsv(result:PropertyQueryResult){
 if(result.items.length!==Number(result.matchedCount)||result.items.length>500)throw new Error('查询完整结果无效，不能导出')
 const rows=[['设备名称','设备ID','设备类型ID','在线状态','模型版本ID','查询时刻'],...result.items.map(row=>[row.name,row.deviceId,row.deviceTypeId,row.status==='ONLINE'?'在线':'离线',row.modelVersionId||'',result.evaluatedAt])]
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')
}
