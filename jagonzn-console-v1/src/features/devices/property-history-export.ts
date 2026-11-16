import {isStrictJsonNumber} from '@things-link/client-contracts/dashboard/v1'
import {formatTime} from '@/core/time'
import {propertyObservations} from './property-observations-api'
import {decodePropertyObservations,observationWindow,type ObservationQuery} from './property-observations-json'
import {downloadTabular} from './device-data-export'
type OriginalObservation=ReturnType<typeof decodePropertyObservations>['items'][number]
export type ExportObservation=OriginalObservation&{readonly readWindow:Readonly<{reportedFrom:string;reportedTo:string;platformFrom:string;platformTo:string}>}
export type HistoryExportQuery=Omit<ObservationQuery,'source'|'includeActor'|'limit'>&{property:string}
export type HistoryExportResult={query:Readonly<HistoryExportQuery>;items:readonly ExportObservation[];hasMore:boolean;reportedFrom:string;reportedTo:string;platformFrom:string;platformTo:string}
function at(value:string){const fraction=/\.(\d{1,9})/.exec(value)?.[1]||'';return BigInt(Date.parse(value.replace(/\.\d{1,9}/,'')))*1000000n+BigInt(fraction.padEnd(9,'0'))}
/** Source明确最多5000条、不带列表来源筛选或用户；顺序读取真实签名后继，不冒充跨请求快照。 */
export async function readPropertyHistoryExport(query:HistoryExportQuery,signal:AbortSignal,onProgress:(count:number)=>void=()=>{}):Promise<HistoryExportResult>{
 observationWindow(query.from,query.to)
 if(!/^[A-Za-z0-9_-]{1,64}$/.test(query.property))throw new Error('属性标识不可用于历史导出')
 const active=AbortSignal.any([signal,AbortSignal.timeout(30000)]),items:ExportObservation[]=[],seen=new Set<string>(),cursors=new Set<string>()
 let cursor:string|undefined,received=0,previous:OriginalObservation|undefined,window:ReturnType<typeof decodePropertyObservations>|undefined
 for(let page=0;page<100;page++){
  if(active.aborted)throw active.reason
  const current:ObservationQuery={...query,limit:50,source:undefined,includeActor:false},budget=Math.min(4194304,8388608-received)
  if(budget<1)throw new Error('历史导出超过8MiB完整读取预算，请缩小时间范围')
  const bytes=await propertyObservations(current,cursor,active,budget);received+=bytes.byteLength
  if(active.aborted)throw active.reason
  if(received>8388608)throw new Error('历史导出超过8MiB完整读取预算，请缩小时间范围')
  const result=decodePropertyObservations(bytes,current)
  if(window&&(at(result.reportedTo)>at(window.reportedTo)||at(result.platformTo)>at(window.platformTo)))throw new Error('历史导出分页上界发生变化，请重新读取')
  for(const item of result.items){
   const id=`${item.sourceKind==='DEVICE_REPORT'?'report':'platform'}:${item.sourceId}:${item.propertyKey}`
   if(seen.has(id)||previous&&(at(item.at)>at(previous.at)||at(item.at)===at(previous.at)&&previous.sourceKind!=='DEVICE_REPORT'&&item.sourceKind==='DEVICE_REPORT'))throw new Error('历史导出分页出现重复或顺序不完整')
   seen.add(id);items.push(Object.freeze({...item,readWindow:Object.freeze({reportedFrom:result.reportedFrom,reportedTo:result.reportedTo,platformFrom:result.platformFrom,platformTo:result.platformTo})}));previous=item
  }
  window=result;onProgress(items.length)
  if(items.length>5000)throw new Error('历史导出超过条数预算')
  if(!result.hasMore||items.length===5000)return Object.freeze({query:Object.freeze({...query}),items:Object.freeze(items),hasMore:result.hasMore,reportedFrom:result.reportedFrom,reportedTo:result.reportedTo,platformFrom:result.platformFrom,platformTo:result.platformTo})
  if(!result.nextCursor||cursors.has(result.nextCursor))throw new Error('历史导出未取得新的签名位置')
  cursors.add(result.nextCursor);cursor=result.nextCursor
 }
 throw new Error('历史导出超过100页读取预算，请缩小时间范围')
}
export function historyExportRows(result:HistoryExportResult,showMilliseconds:boolean,propertyName?:string){
 const header=['时间（Asia/Shanghai）','原始时间（保留时区与纳秒）',...(propertyName?['属性展示名']:[]),'属性标识符','属性类型','值','值状态','精度','历史模型ID','来源原件ID','时间语义','本次导出上限','后继状态','请求起点','请求终点','该页上报窗口起点','该页上报窗口终点','该页平台窗口起点','该页平台窗口终点']
 const numericRows=new Set<number>(),valueColumn=propertyName?5:4
 const rows=[header,...result.items.map((item,index)=>{
  if(isStrictJsonNumber(item.value))numericRows.add(index+1)
  const local=formatTime(item.at)+(showMilliseconds?'.'+(/\.(\d{1,9})/.exec(item.at)?.[1]||'').padEnd(3,'0').slice(0,3):'')
  return[local,item.at,...(propertyName?[propertyName]:[]),item.propertyKey,{DEVICE_REPORT:'属性上报',PLATFORM_DOWNLINK:'属性下发',PLATFORM_CLOUD_UPDATE:'云端更新'}[item.sourceKind],item.valueText,item.state,item.precision,item.sourceModelVersionId||'',item.sourceId,item.timeKind,'5000',result.hasMore?'还有后继，请缩小时间范围':'本次读取未返回后继',result.query.from,result.query.to,item.readWindow.reportedFrom,item.readWindow.reportedTo,item.readWindow.platformFrom,item.readWindow.platformTo]
 })]
 return{rows,numericCell:(row:number,column:number)=>column===valueColumn&&numericRows.has(row)}
}
export function downloadPropertyHistory(result:HistoryExportResult,showMilliseconds:boolean,format:'xlsx'|'csv',propertyName?:string){const{rows,numericCell}=historyExportRows(result,showMilliseconds,propertyName);downloadTabular(rows,format,`属性历史-${result.query.property}`,numericCell)}
