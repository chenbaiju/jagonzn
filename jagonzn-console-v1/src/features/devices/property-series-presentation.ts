import {historyGeometry,historySegments,parseDashboardRuntimeResponse,createRuntimeNumber,isStrictJsonNumber,type HistoryPoint} from '@things-link/client-contracts/dashboard/v1'
import {isSeriesDecimal,instantKey,type SeriesDecimal,type SeriesPoint,type PropertySeries} from './property-series-json'
import {seriesSteps,type SeriesStep} from './property-series-options'
type DecimalParts={coefficient:bigint;exponent:number}
export function decimalParts(value:SeriesDecimal):DecimalParts{
 if(!isSeriesDecimal(value))throw new Error('曲线数值未通过原词法验证')
 const[raw,exp='0']=value.lexical.toLowerCase().split('e'),fraction=raw!.split('.')[1]||''
 let coefficient=BigInt(raw!.replace('.','')),exponent=Number(exp)-fraction.length
 if(!coefficient)return{coefficient:0n,exponent:0}
 while(coefficient%10n===0n){coefficient/=10n;exponent++}
 return{coefficient,exponent}
}
export function compareDecimals(a:SeriesDecimal,b:SeriesDecimal){
 const left=decimalParts(a),right=decimalParts(b),exponent=Math.min(left.exponent,right.exponent)
 const x=left.coefficient*10n**BigInt(left.exponent-exponent),y=right.coefficient*10n**BigInt(right.exponent-exponent)
 return x===y?0:x<y?-1:1
}
export type SeriesAxis={minimum?:SeriesDecimal;maximum?:SeriesDecimal}
export type PlotPoint={x:number;y:number;visible:boolean;point:SeriesPoint}
export type PlotLine={id:string;property:string;source:SeriesPoint['sourceKind'];model:string;points:PlotPoint[];segments:PlotPoint[][]}
function nanoseconds(value:string){return BigInt(Date.parse(value.slice(0,19)+'Z'))*1000000n+BigInt((/\.(\d+)Z$/.exec(value)?.[1]||'').padEnd(9,'0'))}
/** 先以整数差归一，再交已验共享像素几何；原值从不被坐标近似替换。 */
function normalizedValues(points:readonly SeriesPoint[],axis:SeriesAxis){
 if(!points.length)return[]
 let low=points[0]!.value,high=low
 for(const point of points){if(compareDecimals(point.value,low)<0)low=point.value;if(compareDecimals(point.value,high)>0)high=point.value}
 low=axis.minimum||low;high=axis.maximum||high
 if(compareDecimals(low,high)>0)throw new Error('纵轴最小值不能大于最大值')
 const a=decimalParts(low),b=decimalParts(high),exponent=Math.min(a.exponent,b.exponent,...points.map(p=>decimalParts(p.value).exponent))
 const unit=(value:SeriesDecimal)=>{const p=decimalParts(value);return p.coefficient*10n**BigInt(p.exponent-exponent)}
 const minimum=unit(low),span=unit(high)-minimum
 return points.map(point=>{if(!span)return 0.5;const value=unit(point.value);return value<minimum?-1:value>minimum+span?2:Number((value-minimum)*1000000000n/span)/1000000000})
}
function runtime(value:number){const parsed=parseDashboardRuntimeResponse(new TextEncoder().encode(`{"n":${value}}`)).n;if(!isStrictJsonNumber(parsed!))throw new Error('坐标不可用');return createRuntimeNumber(parsed)}
function nextBucket(value:string,step:SeriesStep){const at=new Date(value),width=seriesSteps.find(item=>item.value===step)!.seconds;if(width<0)at.setUTCMonth(at.getUTCMonth()+1);else at.setTime(at.getTime()+width*1000);return at.toISOString()}
export function plotSeries(frame:readonly PropertySeries[],axes:Readonly<Record<string,SeriesAxis>>={},window?:readonly [string,string]):PlotLine[]{
 const all=frame.flatMap(result=>result.points),times=all.map(p=>nanoseconds(p.ts!)),low=window?nanoseconds(window[0]):times.reduce((a,b)=>a<b?a:b, times[0]||0n),high=window?nanoseconds(window[1]):times.reduce((a,b)=>a>b?a:b,times[0]||0n),lines:PlotLine[]=[]
 for(const result of frame){
  const originals=result.points,normalized=normalizedValues(originals,axes[result.propertyKey!]||{})
  const projected:HistoryPoint[]=originals.map((point,index)=>({ts:point.ts!,value:runtime(Math.max(0,Math.min(1,normalized[index]!))),sampleCount:point.sampleCount!,thingModelVersionId:point.sourceModelVersionId??null,modelVersion:point.modelVersion!}))
  // 加两个几何锚点固定纵轴0..1；它们不进入事实、分段、统计或导出。
  const anchors:HistoryPoint[]=projected.length?[{...projected[0]!,value:runtime(0)},{...projected[0]!,value:runtime(1)}]:[]
  const geometry=historyGeometry([...projected,...anchors]).slice(0,projected.length)
  const groups=new Map<string,number[]>()
  originals.forEach((point,index)=>{const id=[result.propertyKey,point.sourceKind,point.sourceModelVersionId,point.modelVersion].join('|');const group=groups.get(id)||[];group.push(index);groups.set(id,group)})
  for(const[id,indices]of groups){
   const points=indices.map(index=>({point:originals[index]!,visible:normalized[index]!>=0&&normalized[index]!<=1,x:high===low?320:24+Number((nanoseconds(originals[index]!.ts!)-low)*1000000000n/(high-low))/1000000000*592,y:geometry[index]!.y}))
   const history=indices.map(index=>projected[index]!),mapped=new Map(history.map((point,index)=>[point,points[index]!]))
   const segments:PlotPoint[][]=[]
   for(const segment of historySegments(history,result.actualGranularity!)){
    let current:PlotPoint[]=[]
    for(const point of segment){const item=mapped.get(point)!,previous=current[current.length-1]
     if(!item.visible){if(current.length)segments.push(current);current=[];continue}
     if(previous&&result.actualGranularity!=='RAW'&&instantKey(point.ts)>instantKey(nextBucket(previous.point.ts!,result.actualGranularity!))){segments.push(current);current=[]}
     current.push(item)
    }
    if(current.length)segments.push(current)
   }
   lines.push({id,property:result.propertyKey!,source:originals[indices[0]!]!.sourceKind,model:originals[indices[0]!]!.modelVersion!,points,segments})
  }
 }
 return lines
}
/** 图中点的均值；精确整数运算，循环小数最多保留18位有效数字并显式标近似。 */
export function seriesStatistics(points:readonly SeriesPoint[]){
 if(!points.length)return
 let minimum=points[0]!.value,maximum=minimum
 const parts=points.map(point=>decimalParts(point.value)),exponent=Math.min(...parts.map(p=>p.exponent))
 let sum=0n
 for(let index=0;index<points.length;index++){const value=points[index]!.value,p=parts[index]!;if(compareDecimals(value,minimum)<0)minimum=value;if(compareDecimals(value,maximum)>0)maximum=value;sum+=p.coefficient*10n**BigInt(p.exponent-exponent)}
 const count=BigInt(points.length),sign=sum<0n?'-':'',absolute=sum<0n?-sum:sum
 let shift=18-absolute.toString().length+count.toString().length
 const numerator=shift>=0?absolute*10n**BigInt(shift):absolute,denominator=shift>=0?count:count*10n**BigInt(-shift)
 let quotient=numerator/denominator,approximate=numerator%denominator!==0n
 while(quotient.toString().length>18){approximate ||= quotient%10n!==0n;quotient/=10n;shift--}
 let digits=quotient.toString(),power=exponent-shift
 if(!quotient)return{minimum:minimum.lexical,maximum:maximum.lexical,average:'0',approximate}
 while(digits.endsWith('0')){digits=digits.slice(0,-1);power++}
 const order=digits.length+power
 const average=sign+(order>21||order< -5?digits[0]+(digits.length>1?'.'+digits.slice(1):'')+'e'+(order-1):order<=0?'0.'+'0'.repeat(-order)+digits:order>=digits.length?digits+'0'.repeat(order-digits.length):digits.slice(0,order)+'.'+digits.slice(order))
 return{minimum:minimum.lexical,maximum:maximum.lexical,average,approximate}
}
export function linePath(points:readonly PlotPoint[],step=false){return points.map((point,index)=>index===0?`M${point.x},${point.y}`:step?`H${point.x}V${point.y}`:`L${point.x},${point.y}`).join(' ')}
export function seriesValueY(points:readonly SeriesPoint[],value:SeriesDecimal,axis:SeriesAxis={}){
 if(!points.length)return
 let minimum=points[0]!.value,maximum=minimum
 for(const point of points){if(compareDecimals(point.value,minimum)<0)minimum=point.value;if(compareDecimals(point.value,maximum)>0)maximum=point.value}
 const normalized=normalizedValues([{...points[0]!,value}],{minimum:axis.minimum||minimum,maximum:axis.maximum||maximum})[0]!
 return normalized>=0&&normalized<=1?196-normalized*172:undefined
}
