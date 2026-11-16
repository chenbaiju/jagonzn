import type {Schema} from '@/core/contracts'
/** 仅复用唯一正式目录合同；生成后类型检查由主控执行。 */
export type DirectoryActivity=NonNullable<Schema<'ConsoleDeviceCatalogResponse'>['activity']>
function object(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new Error('目录活跃能力无效')
 const item=value as Record<string,unknown>
 if(Object.keys(item).length!==keys.length||keys.some(key=>!Object.hasOwn(item,key)))throw new Error('目录活跃能力不完整')
 return item
}
function exact(value:unknown,expected:string[]){return Array.isArray(value)&&value.length===expected.length&&value.every((v,i)=>v===expected[i])}
/** 只校验目录asOf原文：公历日期、普通秒及RFC3339偏移；保留原1～9位小数/时区，不做Date归一化。
 * 当前平台Instant输出不含闰秒，故明确拒绝second=60；四位年份含0000沿原格式，不借Date.UTC的0～99年偏移。 */
function directoryAsOf(value:unknown):value is string{
 if(typeof value!=='string')return false
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value)
 if(!match)return false
 const [year,month,day,hour,minute,second]=match.slice(1,7).map(Number) as [number,number,number,number,number,number]
 if(month<1||month>12||day<1||hour>23||minute>59||second>59)return false
 const leap=year%4===0&&(year%100!==0||year%400===0)
 const monthDays=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31]
 if(day>monthDays[month-1]!)return false
 const zone=match[7]!
 return zone==='Z'||Number(zone.slice(1,3))<=23&&Number(zone.slice(4,6))<=59
}
/** 缺整个块为旧运行实例；非法新块不推导能力，调用方不得把ACTIVE查询结果当全量。 */
export function decodeDirectoryActivity(value:unknown):DirectoryActivity|undefined{
 if(value===undefined||value===null)return undefined
 const raw=object(value,['contractVersion','policyReadSupported','mode','observationEpoch','supportedFilters','positiveKindsByProtocol','negativeCoverage','asOf'])
 const bounded=raw.contractVersion===4,enabled=raw.mode==='POSITIVE_ONLY'||bounded&&raw.mode==='BOUNDED_WINDOW',kinds=object(raw.positiveKindsByProtocol,['MQTT','HTTP','COAP','TCP'])
 if(![1,2,3,4].includes(raw.contractVersion as number)||raw.policyReadSupported!==true||!(bounded?raw.mode==='BOUNDED_WINDOW':['DISABLED','POSITIVE_ONLY'].includes(String(raw.mode)))||raw.negativeCoverage!==(bounded?'QUALIFIED_WHEN_COMPLETE':'NOT_QUALIFIED')
  ||!(enabled?typeof raw.observationEpoch==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(raw.observationEpoch):raw.observationEpoch===null)
  ||!exact(raw.supportedFilters,bounded?['ACTIVE','INACTIVE']:enabled?['ACTIVE']:[])||!exact(kinds.MQTT,enabled?(raw.contractVersion===3||bounded?['PROPERTY_REPORT','EVENT','HEARTBEAT']:['PROPERTY_REPORT','EVENT']):[])
  ||!['HTTP','COAP'].every(protocol=>exact(kinds[protocol],enabled?['PROPERTY_REPORT']:[]))
  ||!(bounded?exact(kinds.TCP,['PROPERTY_REPORT','HEARTBEAT']):raw.contractVersion===3?(exact(kinds.TCP,['PROPERTY_REPORT'])||exact(kinds.TCP,['PROPERTY_REPORT','HEARTBEAT'])):exact(kinds.TCP,enabled?(raw.contractVersion===2?['PROPERTY_REPORT','HEARTBEAT']:['PROPERTY_REPORT']):[]))
  ||(raw.contractVersion===2||raw.contractVersion===3||bounded)&&!enabled
  ||!directoryAsOf(raw.asOf))throw new Error('目录活跃能力无效')
 if(bounded)return{contractVersion:4,policyReadSupported:true,mode:'BOUNDED_WINDOW',observationEpoch:raw.observationEpoch as string,supportedFilters:['ACTIVE','INACTIVE'],positiveKindsByProtocol:{MQTT:['PROPERTY_REPORT','EVENT','HEARTBEAT'],HTTP:['PROPERTY_REPORT'],COAP:['PROPERTY_REPORT'],TCP:['PROPERTY_REPORT','HEARTBEAT']},negativeCoverage:'QUALIFIED_WHEN_COMPLETE',asOf:raw.asOf}
 if(raw.contractVersion===3)return{contractVersion:3,policyReadSupported:true,mode:'POSITIVE_ONLY',observationEpoch:raw.observationEpoch as string,supportedFilters:['ACTIVE'],positiveKindsByProtocol:{MQTT:['PROPERTY_REPORT','EVENT','HEARTBEAT'],HTTP:['PROPERTY_REPORT'],COAP:['PROPERTY_REPORT'],TCP:exact(kinds.TCP,['PROPERTY_REPORT','HEARTBEAT'])?['PROPERTY_REPORT','HEARTBEAT']:['PROPERTY_REPORT']},negativeCoverage:'NOT_QUALIFIED',asOf:raw.asOf}
 if(raw.contractVersion===2)return{contractVersion:2,policyReadSupported:true,mode:'POSITIVE_ONLY',observationEpoch:raw.observationEpoch as string,supportedFilters:['ACTIVE'],positiveKindsByProtocol:{MQTT:['PROPERTY_REPORT','EVENT'],HTTP:['PROPERTY_REPORT'],COAP:['PROPERTY_REPORT'],TCP:['PROPERTY_REPORT','HEARTBEAT']},negativeCoverage:'NOT_QUALIFIED',asOf:raw.asOf}
 return{contractVersion:1,policyReadSupported:true,mode:enabled?'POSITIVE_ONLY':'DISABLED',observationEpoch:enabled?raw.observationEpoch as string:null,supportedFilters:enabled?['ACTIVE']:[],positiveKindsByProtocol:{MQTT:enabled?['PROPERTY_REPORT','EVENT']:[],HTTP:enabled?['PROPERTY_REPORT']:[],COAP:enabled?['PROPERTY_REPORT']:[],TCP:enabled?['PROPERTY_REPORT']:[]},negativeCoverage:'NOT_QUALIFIED',asOf:raw.asOf}
}
/** v4只表明服务器按完整窗口筛选；客户端不从空页或观察缺失推造不活跃，完整窗口内的从未上报由服务端按类型阈值判定。 */
export function activitySupported(cap:DirectoryActivity|undefined,filter:'ACTIVE'|'INACTIVE'='ACTIVE'){
 if(!cap||!cap.observationEpoch)return false
 if(cap.contractVersion===4)return cap.mode==='BOUNDED_WINDOW'&&cap.negativeCoverage==='QUALIFIED_WHEN_COMPLETE'&&exact(cap.supportedFilters,['ACTIVE','INACTIVE'])
 return filter==='ACTIVE'&&[1,2,3].includes(cap.contractVersion)&&cap.mode==='POSITIVE_ONLY'&&cap.negativeCoverage==='NOT_QUALIFIED'&&exact(cap.supportedFilters,['ACTIVE'])
}
