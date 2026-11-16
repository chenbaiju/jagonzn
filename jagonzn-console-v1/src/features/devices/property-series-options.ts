import type {Schema} from '@/core/contracts'
export type SeriesStep=Schema<'ConsolePropertySeriesResponse'>['actualGranularity']
export type SeriesAggregate=Schema<'ConsolePropertySeriesResponse'>['aggregation']
/** Source工具模块5349的可用窗口；服务端仍按实际权益和点数决定最终粒度。 */
export const seriesSteps:ReadonlyArray<{value:SeriesStep;label:string;seconds:number;maximum:number}>=[
 ['RAW','原始数据',0,21600],['THIRTY_SECONDS','30秒',30,21600],['ONE_MINUTE','1分钟',60,21600],
 ['TWO_MINUTES','2分钟',120,43200],['FIVE_MINUTES','5分钟',300,86400],['TEN_MINUTES','10分钟',600,259200],
 ['FIFTEEN_MINUTES','15分钟',900,432000],['THIRTY_MINUTES','30分钟',1800,604800],['ONE_HOUR','1小时',3600,1296000],
 ['THREE_HOURS','3小时',10800,5184000],['SIX_HOURS','6小时',21600,7776000],['TWELVE_HOURS','12小时',43200,15552000],
 ['ONE_DAY','1天',86400,31536000],['THREE_DAYS','3天',259200,31536000],['SEVEN_DAYS','7天',604800,31536000],['ONE_MONTH','1个月',-1,31536000],
].map(([value,label,seconds,maximum])=>({value:value as SeriesStep,label:label as string,seconds:seconds as number,maximum:maximum as number}))
export const seriesAggregates:ReadonlyArray<{value:SeriesAggregate;label:string}>=[
 ['AVG','平均值'],['MAX','最大值'],['MIN','最小值'],['MEDIAN','中位数'],['FIRST','首位数'],['LAST','末尾数'],['SPREAD','首尾差值'],['COUNT','次数统计'],['SUM','求和'],
].map(([value,label])=>({value:value as SeriesAggregate,label:label!}))
export const seriesPresets=[
 ['custom','自定义'],['last_5m','最近5分钟'],['last_15m','最近15分钟'],['last_30m','最近30分钟'],['last_1h','最近1小时'],['last_3h','最近3小时'],['last_6h','最近6小时'],['last_12h','最近12小时'],['last_24h','最近24小时'],
 ['last_3d','最近3天'],['last_7d','最近7天'],['last_15d','最近15天'],['last_30d','最近30天'],['last_60d','最近60天'],['last_90d','最近90天'],['last_6mo','最近6个月'],['last_1y','最近1年'],
 ['today','今天'],['today_so_far','今天到现在'],['yesterday','昨天'],['day_before_yesterday','前天'],['last_week_today','上周今天'],['this_week','本周'],['this_week_so_far','本周到现在'],['previous_week','上周'],
 ['this_month','本月'],['this_month_so_far','本月到现在'],['previous_month','上月'],['this_year','本年'],['this_year_so_far','本年到现在'],['previous_year','去年'],
] as const
/** 自然日/周/月/年固定按东八区计算，API保留绝对UTC；最近分钟/小时/天保留实际经过时长。 */
export function presetRange(preset:string,now=new Date()):[Date,Date]|undefined{
 if(preset==='custom')return
 const offset=8*3600000,wall=new Date(now.getTime()+offset),absolute=(value:Date)=>new Date(value.getTime()-offset)
 const last=/^last_(\d+)(m|h|d|mo|y)$/.exec(preset)
 if(last){const count=Number(last[1]),unit=last[2]
  if(unit==='mo'||unit==='y'){const from=new Date(wall),day=from.getUTCDate();from.setUTCDate(1);from.setUTCMonth(from.getUTCMonth()-count*(unit==='y'?12:1));const end=new Date(from);end.setUTCMonth(end.getUTCMonth()+1,0);from.setUTCDate(Math.min(day,end.getUTCDate()));return[absolute(from),new Date(now)]}
  return[new Date(now.getTime()-count*({m:60000,h:3600000,d:86400000}[unit as 'm'|'h'|'d'])),new Date(now)]
 }
 const start=new Date(wall);start.setUTCHours(0,0,0,0);const end=new Date(start)
 const days=(value:Date,count:number)=>value.setUTCDate(value.getUTCDate()+count)
 if(['today','today_so_far','yesterday','day_before_yesterday','last_week_today'].includes(preset)){
  days(start,preset==='yesterday'?-1:preset==='day_before_yesterday'?-2:preset==='last_week_today'?-7:0);end.setTime(start.getTime());days(end,1)
 }else if(['this_week','this_week_so_far','previous_week'].includes(preset)){
  days(start,-((start.getUTCDay()+6)%7)-(preset==='previous_week'?7:0));end.setTime(start.getTime());days(end,7)
 }else if(['this_month','this_month_so_far','previous_month'].includes(preset)){
  start.setUTCDate(1);if(preset==='previous_month')start.setUTCMonth(start.getUTCMonth()-1);end.setTime(start.getTime());end.setUTCMonth(end.getUTCMonth()+1)
 }else if(['this_year','this_year_so_far','previous_year'].includes(preset)){
  start.setUTCMonth(0,1);if(preset==='previous_year')start.setUTCFullYear(start.getUTCFullYear()-1);end.setTime(start.getTime());end.setUTCFullYear(end.getUTCFullYear()+1)
 }else throw new Error('未知时间预设')
 return[absolute(start),preset.endsWith('_so_far')?new Date(now):absolute(end)]
}
export function minimumSeriesStep(from:string,to:string):SeriesStep{
 const seconds=(Date.parse(to)-Date.parse(from))/1000
 return(seriesSteps.find(step=>seconds<=step.maximum)||seriesSteps[seriesSteps.length-1]!).value
}
