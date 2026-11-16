/** 展示编辑字段，未携带服务端DTO或内部锚点；时区由全局计划父表单管理。 */
export type IntervalRange={start:string;end:string}
export type IntervalFieldsDraft={amount:string;unit:'MINUTES'|'HOURS';rangeEnabled:boolean;ranges:readonly IntervalRange[]}
export function intervalFields(value:IntervalFieldsDraft):{minutes:number;ranges:IntervalRange[]}{
  if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['amount','unit','rangeEnabled','ranges'].includes(k))
    ||typeof value.amount!=='string'||value.amount.length>16||!/^\d+(\.\d{1,6})?$/.test(value.amount)
    ||!['MINUTES','HOURS'].includes(value.unit)||typeof value.rangeEnabled!=='boolean')throw new Error('请设置有效的间隔时间')
  const [whole,fraction='']=value.amount.split('.'),scale=10n**BigInt(fraction.length)
  const numerator=(BigInt(whole!)*scale+BigInt(fraction||'0'))*(value.unit==='HOURS'?60n:1n)
  if(numerator%scale!==0n)throw new Error('间隔时间必须换算为整数分钟')
  const minutes=numerator/scale
  if(minutes<5n||minutes>2147483647n)throw new Error('间隔时间须为 5 至 2147483647 分钟')
  if(!value.rangeEnabled)return{minutes:Number(minutes),ranges:[]}
  if(!Array.isArray(value.ranges)||value.ranges.length<1||value.ranges.length>24)throw new Error('请添加 1 至 24 个时间范围')
  const segments:Array<[number,number]>=[]
  const ranges=value.ranges.map(range=>{
    if(!range||typeof range!=='object'||Object.keys(range).some(k=>!['start','end'].includes(k))
      ||typeof range.start!=='string'||typeof range.end!=='string'
      ||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(range.start)||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(range.end)||range.start===range.end)throw new Error('请填写不同的开始、结束分钟时间')
    const minute=(text:string)=>Number(text.slice(0,2))*60+Number(text.slice(3))
    const start=minute(range.start),end=minute(range.end)
    if(start<end)segments.push([start,end]);else{segments.push([start,1440]);if(end>0)segments.push([0,end])}
    return{start:range.start,end:range.end}
  }).sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end))
  segments.sort((a,b)=>a[0]-b[0])
  for(let i=1;i<segments.length;i++)if(segments[i-1]![1]>segments[i]![0])throw new Error('时间范围不能重叠，跨夜范围也须互不重叠')
  return{minutes:Number(minutes),ranges}
}
