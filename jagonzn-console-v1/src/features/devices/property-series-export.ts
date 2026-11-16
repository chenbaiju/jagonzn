import type {PropertySeries} from './property-series-json'
import {tabularCsv,tabularXlsx,downloadTabular} from './device-data-export'
/** 导出当前已完整读取的图中点，每个来源/历史模型独立一行，不合并同刻事实。 */
export function seriesExportRows(frame:readonly PropertySeries[],names:Readonly<Record<string,string>>){
 const properties=frame.map(item=>item.propertyKey!),headers=['时间（UTC）','来源','时间语义','精度','历史模型ID','历史版本','样本数','实际粒度','汇总函数','时间桶政策',...properties.map(key=>`${names[key]||key} (${key})`)]
 const rows:string[][]=[headers]
 for(const result of frame)for(const point of result.points)rows.push([point.ts!,point.sourceKind!,point.timeKind!,point.precision!,point.sourceModelVersionId||'',point.modelVersion!,point.sampleCount!,result.actualGranularity!,result.aggregation!,result.bucketPolicy!,...properties.map(key=>key===result.propertyKey?point.value.lexical:'')])
 return rows
}
export function seriesCsv(frame:readonly PropertySeries[],names:Readonly<Record<string,string>>){return tabularCsv(seriesExportRows(frame,names),(row,column)=>row>0&&column>=10)}
export function seriesXlsx(frame:readonly PropertySeries[],names:Readonly<Record<string,string>>){return tabularXlsx(seriesExportRows(frame,names))}
export function downloadSeries(frame:readonly PropertySeries[],names:Readonly<Record<string,string>>,format:'xlsx'|'csv'){downloadTabular(seriesExportRows(frame,names),format,'属性曲线',(row,column)=>row>0&&column>=10)}
