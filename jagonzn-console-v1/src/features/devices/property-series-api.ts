import {api} from '@/core/http'
import {devicePath} from './api'
import {decodePropertySeries,validateSeriesQuery,type SeriesQuery,type PropertySeries} from './property-series-json'
import {seriesSteps} from './property-series-options'
export async function propertySeries(query:SeriesQuery,signal:AbortSignal,maximum=4194304){
 validateSeriesQuery(query)
 if(!Number.isSafeInteger(maximum)||maximum<1||maximum>4194304)throw new Error('曲线完整读取预算已用尽，请减少属性或缩小时间范围')
 return api<Uint8Array>(`${devicePath(query.project,query.device)}/property-observations/series`,{query:{expectedModelVersionId:query.model,propertyKey:query.property,from:query.from,to:query.to,granularity:query.granularity,aggregation:query.aggregation},signal,responseType:'bytes',maxResponseBytes:maximum})
}
/** 一轮最多五属性、两路并发、累计8MiB；统一较粗粒度，任何失败均不交付部分图表。 */
export async function propertySeriesFrame(queries:readonly SeriesQuery[],signal:AbortSignal):Promise<readonly PropertySeries[]>{
 if(queries.length<1||queries.length>5||new Set(queries.map(q=>q.property)).size!==queries.length)throw new Error('曲线需选择一至五个不同数值属性')
 const first=queries[0]!
 for(const query of queries){validateSeriesQuery(query);if(['project','device','model','from','to','aggregation','granularity'].some(key=>query[key as keyof SeriesQuery]!==first[key as keyof SeriesQuery]))throw new Error('对比曲线必须使用同一设备、模型和时间查询')}
 const controller=new AbortController(),combined=AbortSignal.any([signal,controller.signal]);let received=0,reserved=0
 const waiters=new Set<()=>void>()
 const notify=()=>{for(const wake of [...waiters])wake()}
 function waitForBudget(){return new Promise<void>((resolve,reject)=>{
  const finish=()=>{waiters.delete(wake);combined.removeEventListener('abort',abort)}
  const wake=()=>{finish();resolve()},abort=()=>{finish();reject(combined.reason)}
  waiters.add(wake);combined.addEventListener('abort',abort,{once:true});if(combined.aborted)abort()
 })}
 let actual=first.granularity,results:Array<PropertySeries|undefined>=queries.map(()=>undefined)
 try{
  for(let round=0;round<seriesSteps.length;round++){
   const pending=queries.map((_query,index)=>index).filter(index=>results[index]?.actualGranularity!==actual)
   let position=0
   async function worker(){
    while(position<pending.length){
     if(combined.aborted)throw combined.reason
     const index=pending[position++]!,query={...queries[index]!,granularity:actual}
     // 先为在途读取预留上限；剩余不足单次上限时等待已有响应释放额度。
     while(reserved>0&&8388608-received-reserved<4194304)await waitForBudget()
     if(combined.aborted)throw combined.reason
     const budget=Math.min(4194304,8388608-received-reserved)
     if(budget<1)throw new Error('本轮曲线响应超过8MiB完整预算，请减少属性或缩小时间范围')
     reserved+=budget
     let bytes:Uint8Array
     try{bytes=await propertySeries(query,combined,budget);received+=bytes.byteLength}
     finally{reserved-=budget;notify()}
     if(received>8388608)throw new Error('本轮曲线响应超过8MiB完整预算，请减少属性或缩小时间范围')
     results[index]=decodePropertySeries(bytes,query)
    }
   }
   await Promise.all(Array.from({length:Math.min(2,pending.length)},worker))
   const coarsest=Math.max(...results.map(result=>seriesSteps.findIndex(step=>step.value===result?.actualGranularity)))
   if(coarsest<0)throw new Error('曲线实际粒度不可用')
   if(seriesSteps[coarsest]!.value===actual)return Object.freeze(results as PropertySeries[])
   actual=seriesSteps[coarsest]!.value
  }
  throw new Error('曲线未能在有限粒度内形成完整对比')
 }catch(error){controller.abort();throw error}
}
