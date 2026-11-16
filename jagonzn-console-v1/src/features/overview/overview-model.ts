import type {Overview,OverviewChart,OverviewTrends} from './overview-api'
export type RingSlice=Readonly<{label:string;value:number;color:string}>
export type OverviewRing=Readonly<{key:string;title:string;center:string;available:boolean;slices:readonly RingSlice[]}>
export const chartColors=['#2196f3','#67c23a','#ffb24c','#b48bf0','#f56c6c','#00b9ad','#5e7ce2','#e58acb','#a7b1c2','#d5ac72']
const sourcePalettes:Readonly<Record<string,readonly string[]>>={
  messages:['rgba(54,162,235,.3)','#F87171','#FBBF24','#34D399','#60A5FA','#B91C1C','#92400E','#065F46','#818CF8'],
  active:['#34D399'],connections:['#10B981','#EF4444','#3B82F6','#F59E0B'],alarms:['#4ade80','#f87171','#facc15'],
  notifications:['#2563EB','#DC2626','#F59E0B','#10B981','#EC4899','#8B44AD','#009688','#03A9F4','#FF5722'],
  rules:['#7C3AED','#D97706'],tasks:['#F472B6'],automations:['rgba(75,192,192,.7)','rgba(255,99,132,.7)','#ff9f40','#9966ff'],
  scenes:['rgba(75,192,192,.7)','rgba(255,99,132,.7)','#ff9f40','#9966ff'],mqtt:['rgba(54,162,235,.3)','#34D399','#FBBF24'],tcp:['rgba(54,162,235,.3)','#34D399','#FBBF24'],http:['rgba(54,162,235,.3)','#34D399','#FBBF24']
}
/** 原站具名图型；仅将本项目同义的公开序列映射为柱形或折线。 */
export function trendPresentation(chart:OverviewChart,index:number){
  const key=chart.key||'',series=chart.series?.[index]?.key||'',stacked=['connections','alarms','notifications','automations','scenes'].includes(key)
  const bar=['connections','alarms','notifications','active'].includes(key)||series==='message.total'||/^bytes\.(mqtt|tcp|http)Total$/.test(series)||['automation.completed','automation.failed','scene.completed','scene.failed'].includes(series)
  return {bar,stacked,color:sourcePalettes[key]?.[index]||chartColors[index%chartColors.length]!}
}
export function validCount(value:unknown):value is number{return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0}
export function countText(value:unknown):string{return validCount(value)?new Intl.NumberFormat('zh-CN').format(value):typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value)&&BigInt(value).toString()===value?new Intl.NumberFormat('zh-CN').format(BigInt(value)):'—'}
export function rateText(value:unknown):string{return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1?(value*100).toFixed(1)+'%':'—'}
function countDistribution(total:unknown,rows:readonly Readonly<{label:string;value:unknown;color:string}>[]):readonly RingSlice[]|undefined{
  if(!validCount(total)||rows.some(row=>!validCount(row.value))||rows.reduce((n,row)=>n+(row.value as number),0)!==total)return undefined
  return rows as readonly RingSlice[]
}
/** 同一概要快照中的互斥分组；不能用本页设备列表拼装分布。 */
export function overviewRings(snapshot?:Overview):readonly OverviewRing[]{
  const total=snapshot?.devices?.total,online=snapshot?.devices?.online,active=snapshot?.devices?.active24h
  const kind=snapshot?.deviceKindCounts,activity=snapshot?.deviceActivityCounts,alarm=snapshot?.alarmSeverityDeviceCounts
  const kinds=countDistribution(total,[{label:'直连设备',value:kind?.DIRECT,color:'#4359B9'},{label:'网关',value:kind?.GATEWAY,color:'#81C463'},{label:'子设备',value:kind?.SUB_DEVICE,color:'#F7BE47'},{label:'未分类',value:kind?.UNCLASSIFIED,color:'#ccc'}])
  const onlineData=validCount(total)&&validCount(online)&&online<=total?[{label:'在线设备',value:online,color:'#3ba272'},{label:'离线设备',value:total-online,color:'#ccc'}]:undefined
  let activeData=countDistribution(total,[{label:'5分钟内',value:activity?.WITHIN_5M,color:'#8B5CF6'},{label:'1小时内',value:activity?.WITHIN_1H,color:'#A78BFA'},{label:'1天内',value:activity?.WITHIN_24H,color:'#C4B5FD'},{label:'1天以上',value:activity?.OVER_24H,color:'#ccc'}])
  if(!validCount(active)||!activeData||activeData.slice(0,3).reduce((n,row)=>n+row.value,0)!==active)activeData=undefined
  if(activeData){const original=activeData;activeData=original.map((row,index)=>({...row,value:index<3?original.slice(0,index+1).reduce((sum,item)=>sum+item.value,0):row.value}))}
  let alarmData=countDistribution(total,[{label:'正常',value:alarm?.NORMAL,color:'#60A5FA'},{label:'紧急告警',value:alarm?.CRITICAL,color:'#B91C1C'},{label:'重要告警',value:alarm?.MAJOR,color:'#F59E0B'},{label:'普通告警',value:alarm?.MINOR,color:'#FCD34D'},{label:'警告',value:alarm?.WARNING,color:'#edcf56'},{label:'提示',value:alarm?.INFO,color:'#93c5fd'}])
  const expected=validCount(total)&&alarmData?(total===0?0:(total-alarmData[0]!.value)/total):undefined
  if(!snapshot?.alarmRate?.available||typeof snapshot.alarmRate.value!=='number'||expected===undefined||Math.abs(snapshot.alarmRate.value-expected)>1e-12)alarmData=undefined
  return [
    {key:'kind',title:'设备接入类型',center:kinds?countText(total)+' 台':'—',available:!!kinds,slices:kinds?.filter(row=>row.label!=='未分类'||row.value>0)||[]},
    {key:'online',title:'设备在线率',center:onlineData?rateText(snapshot?.devices?.onlineRate):'—',available:!!onlineData,slices:onlineData||[]},
    {key:'activity',title:'设备活跃率',center:activeData?rateText(snapshot?.devices?.active24hRate):'—',available:!!activeData,slices:activeData||[]},
    {key:'alarm',title:'设备告警率',center:alarmData?rateText(snapshot?.alarmRate?.value):'—',available:!!alarmData,slices:alarmData||[]}
  ]
}
export function alarmDeviceCount(snapshot?:Overview):number|undefined{
  return overviewRings(snapshot).find(row=>row.key==='alarm')?.available&&validCount(snapshot?.devices?.total)&&validCount(snapshot?.alarmSeverityDeviceCounts?.NORMAL)?snapshot.devices.total-snapshot.alarmSeverityDeviceCounts.NORMAL:undefined
}
export function formatTrendValue(value:unknown,unit?:string):string{
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)return '—'
  if(unit!=='BYTES')return new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(value)
  let amount=value,index=0;const units=['B','KB','MB','GB','TB','PB']
  while(amount>=1024&&index<units.length-1){amount/=1024;index++}
  return Number(amount.toFixed(index?2:0))+' '+units[index]
}
/** null结束一段曲线；单个已知点也保留，不能跨缺桶连线或补零。 */
export function trendSegments(values:readonly(number|null)[],maximum:number,width=600,height=144):ReadonlyArray<Readonly<{path:string;single:boolean;x:number;y:number}>>{
  const result:Array<{path:string;single:boolean;x:number;y:number}>=[];let points:Array<readonly[number,number]>=[]
  function finish(){if(points.length){result.push({path:points.map(([x,y],i)=>(i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2)).join(' '),single:points.length===1,x:points[0]![0],y:points[0]![1]});points=[]}}
  values.forEach((value,index)=>{if(value===null||!validCount(value)){finish();return}points.push([(index+.5)/values.length*width,height-(maximum>0?value/maximum:0)*height])});finish();return result
}
export function trendMaximum(chart:OverviewChart):number{return Math.max(0,...(chart.series||[]).flatMap(row=>(row.values||[]).filter(validCount)))}
/** 导出当前图的原始桶与来源；空桶为空单元格，不补零或转为人读单位。 */
export function overviewChartCsv(snapshot:OverviewTrends,chart:OverviewChart):string{
  if(!chart.series?.some(row=>row.values?.some(validCount)))throw new Error('当前图没有可导出的样本')
  const from=Date.parse(snapshot.from||''),step=(snapshot.stepHours||0)*3600000,length=chart.series[0]?.values?.length||0
  if(!Number.isFinite(from)||step<=0)throw new Error('统计窗口不完整')
  function cell(value:unknown){let text=value==null?'':String(value);if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'}
  const rows:unknown[][]=[['项目',snapshot.projectId,'来源',snapshot.source,'单位',chart.unit,'聚合',chart.aggregation],['UTC桶起点','UTC桶终点',...chart.series.map(row=>row.label)]]
  for(let i=0;i<length;i++)rows.push([new Date(from+i*step).toISOString(),new Date(from+(i+1)*step).toISOString(),...chart.series.map(row=>row.values?.[i]??null)])
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')
}
