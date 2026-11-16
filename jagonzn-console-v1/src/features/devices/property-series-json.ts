import {isStrictJsonNumber,parseDashboardRuntimeResponse,type StrictJsonValue,type StrictJsonObject} from '@things-link/client-contracts/dashboard/v1'
import type {Schema} from '@/core/contracts'
import {seriesSteps,seriesAggregates,type SeriesStep,type SeriesAggregate} from './property-series-options'
declare const decimalBrand:unique symbol
export type SeriesDecimal=Readonly<{lexical:string;[decimalBrand]:true}>
const decimals=new WeakSet<object>()
const numberPattern=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/
export function seriesDecimal(lexical:string):SeriesDecimal{
 if(!numberPattern.test(lexical)||lexical.length>17050)throw new Error('曲线数值超出十进制能力')
 const [coefficient,rawExponent='0']=lexical.toLowerCase().split('e'),fraction=coefficient!.split('.')[1]||'',exponent=Number(rawExponent)
 if(!Number.isSafeInteger(exponent)||Math.abs(exponent)>32800||fraction.length>16400||coefficient!.replace(/[-.]/g,'').length>17000)throw new Error('曲线数值超出十进制能力')
 const digits=coefficient!.replace(/[-.]/g,'').replace(/^0+/,'')
 const order=digits.length+exponent-fraction.length
 if(digits&&(order>328||order < -16400))throw new Error('曲线数值超出十进制能力')
 const result=Object.freeze({lexical}) as SeriesDecimal;decimals.add(result);return result
}
export function isSeriesDecimal(value:unknown):value is SeriesDecimal{return !!value&&typeof value==='object'&&decimals.has(value)}
export type SeriesPoint=Omit<Schema<'ConsolePropertySeriesPoint'>,'value'>&{readonly value:SeriesDecimal}
export type PropertySeries=Omit<Schema<'ConsolePropertySeriesResponse'>,'points'>&{readonly points:readonly SeriesPoint[]}
export type SeriesQuery={project:string;device:string;model:string;property:string;from:string;to:string;granularity:SeriesStep;aggregation:SeriesAggregate}
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i
export function seriesInstant(value:unknown):value is string{
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value.slice(0,10)
}
export function instantKey(value:string){return value.replace(/(?:\.(\d{1,9}))?Z$/,(_all,fraction:string='')=>'.'+fraction.padEnd(9,'0')+'Z')}
function fail():never{throw new Error('数值曲线响应不符合当前只读合同')}
function object(value:StrictJsonValue|undefined):StrictJsonObject{if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return fail();return value as StrictJsonObject}
function closed(value:StrictJsonObject,fields:readonly string[]){if(Object.keys(value).length!==fields.length||fields.some(key=>!Object.hasOwn(value,key)))fail()}
/** 仅将合法、完整且在JSON值位置的数字替为0；所有结构/UTF8/重复键仍由共享严格解析器验证。
 * DTO中唯一数值位置是point.value；封闭类型验证和数字总数保证每段原词法恰用一次。
 * 不扩大全局RuntimeNumber，不让合法SUM 2e308被浏览器Infinity改写。 */
function numericFrames(bytes:Uint8Array){
 if(bytes.byteLength>4194304||(bytes[0]===239&&bytes[1]===187&&bytes[2]===191))fail()
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),tokens:string[]=[],parts:string[]=[]
 let quoted=false,escaped=false,start=0,previous=''
 for(let index=0;index<text.length;index++){
  const c=text[index]!
  if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue}
  if(c==='"'){quoted=true;previous='"';continue}
  if(c==='-'||/[0-9]/.test(c)){
   if(![':',',','['].includes(previous))fail()
   const token=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(index))?.[0]
   if(!token||!/[\s,}\]]/.test(text[index+token.length]||''))fail()
   tokens.push(token);parts.push(text.slice(start,index),'0');index+=token.length-1;start=index+1;previous='0'
  }else if(!/[ \t\r\n]/.test(c))previous=c
 }
 parts.push(text.slice(start));return{root:parseDashboardRuntimeResponse(new TextEncoder().encode(parts.join(''))),tokens}
}
export function validateSeriesQuery(query:SeriesQuery){
 if(![query.project,query.device,query.model].every(value=>uuid.test(value))||!/^[-A-Za-z0-9_]{1,64}$/.test(query.property)||!seriesInstant(query.from)||!seriesInstant(query.to)||instantKey(query.from)>=instantKey(query.to)||!seriesSteps.some(s=>s.value===query.granularity)||!seriesAggregates.some(a=>a.value===query.aggregation))throw new Error('请选择有效设备、属性和含时区的时间范围')
}
function windowValue(value:StrictJsonValue|undefined,query:SeriesQuery){const result=object(value);closed(result,['from','to']);if(!seriesInstant(result.from)||!seriesInstant(result.to)||instantKey(result.from)>instantKey(result.to)||instantKey(result.from)!==instantKey(result.to)&&instantKey(result.from)<instantKey(query.from)||instantKey(result.to)>instantKey(query.to))fail();return result as unknown as Schema<'ConsolePropertySeriesWindow'>}
export function decodePropertySeries(bytes:Uint8Array,query:SeriesQuery):PropertySeries{
 validateSeriesQuery(query);const{root,tokens}=numericFrames(bytes)
 closed(root,['projectId','deviceId','modelVersionId','propertyKey','requestedFrom','requestedTo','requestedGranularity','actualGranularity','aggregation','bucketPolicy','reportedWindow','platformWindow','points'])
 if(root.projectId!==query.project||root.deviceId!==query.device||root.modelVersionId!==query.model||root.propertyKey!==query.property||!seriesInstant(root.requestedFrom)||instantKey(root.requestedFrom)!==instantKey(query.from)||!seriesInstant(root.requestedTo)||instantKey(root.requestedTo)!==instantKey(query.to)||root.requestedGranularity!==query.granularity||root.aggregation!==query.aggregation)fail()
 const step=seriesSteps.find(item=>item.value===root.actualGranularity)
 if(!step||seriesSteps.indexOf(step)<seriesSteps.findIndex(item=>item.value===query.granularity)||root.bucketPolicy!==(step.value==='RAW'?'RAW_VISIBLE_POINTS':'VISIBLE_WINDOW_BUCKETS'))fail()
 const reportedWindow=windowValue(root.reportedWindow,query),platformWindow=windowValue(root.platformWindow,query)
 if(!Array.isArray(root.points)||root.points.length>4000||tokens.length!==root.points.length)fail()
 let reported=0,platform=0
 const seen=new Set<string>(),points=root.points.map((item,index)=>{
  const point=object(item);closed(point,['sourceKind','timeKind','precision','ts','value','sampleCount','sourceModelVersionId','modelVersion'])
  const isReport=point.sourceKind==='DEVICE_REPORT'
  if(!isReport&&!['PLATFORM_DOWNLINK','PLATFORM_CLOUD_UPDATE'].includes(point.sourceKind as string))fail()
  if(isReport)reported++;else platform++
  const window=isReport?reportedWindow:platformWindow
  if(point.timeKind!==(isReport?'DEVICE_OCCURRED':'PLATFORM_ACCEPTED')||!seriesInstant(point.ts)||!isStrictJsonNumber(point.value!)||point.value.lexical!=='0'||typeof point.sampleCount!=='string'||!/^[1-9][0-9]{0,18}$/.test(point.sampleCount)||BigInt(point.sampleCount)>9223372036854775807n||typeof point.modelVersion!=='string'||point.modelVersion.length>64||!point.modelVersion)fail()
  if(point.sourceModelVersionId===null){if(!isReport||point.modelVersion!=='LEGACY_UNVERSIONED')fail()}
  else if(typeof point.sourceModelVersionId!=='string'||!uuid.test(point.sourceModelVersionId)||point.modelVersion==='LEGACY_UNVERSIONED')fail()
  const precision=step.value==='RAW'?(isReport?'LEGACY_DOUBLE_SOURCE':'EXACT_PLATFORM_JSON'):query.aggregation==='COUNT'?'EXACT_COUNT':isReport?'LEGACY_DOUBLE_SOURCE':'DECIMAL_AGGREGATE'
  if(point.precision!==precision||step.value==='RAW'&&point.sampleCount!=='1'||precision==='EXACT_COUNT'&&tokens[index]!==point.sampleCount)fail()
  if(step.value==='RAW'&&!Number.isFinite(Number(tokens[index])))fail()
  const at=instantKey(point.ts),lower=instantKey(window.from!),upper=instantKey(window.to!)
  if(lower===upper||at>=upper)fail()
  if(step.value==='RAW'){if(at<lower)fail()}
  else{
   const date=new Date(point.ts),ms=date.getTime()
   if(step.seconds===-1){if(date.getUTCDate()!==1||date.getUTCHours()||date.getUTCMinutes()||date.getUTCSeconds()||!/^\d{4}-\d{2}-01T00:00:00(?:\.0{1,9})?Z$/.test(point.ts))fail();date.setUTCMonth(date.getUTCMonth()+1)}
   else{if(ms%(step.seconds*1000)!==0||!/:(?:[0-5]\d)(?:\.0{1,9})?Z$/.test(point.ts))fail();date.setTime(ms+step.seconds*1000)}
   if(instantKey(date.toISOString())<=lower)fail()
  }
  const key=[point.sourceKind,point.sourceModelVersionId,point.modelVersion,at].join('|')
  // RAW同刻可有多个持久原件，汇总同来源/版本/桶只能有一个。
  if(step.value!=='RAW'&&seen.has(key))fail();seen.add(key)
  return Object.freeze({...point,value:seriesDecimal(tokens[index]!)}) as unknown as SeriesPoint
 })
 if(reported>2000||platform>2000||points.some((point,index)=>index>0&&instantKey(point.ts!)<instantKey(points[index-1]!.ts!)))fail()
 return Object.freeze({...root,reportedWindow,platformWindow,points:Object.freeze(points)}) as unknown as PropertySeries
}
