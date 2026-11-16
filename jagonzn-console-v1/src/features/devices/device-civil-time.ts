import {computed,ref,watch,type Ref} from 'vue'
import {formatTime} from '@/core/time'
/** 东八区民用时间只由UTC字段构造，不借浏览器本地时区或DST归一化日期。 */
export function eastEightCivilInstant(value:string):string {
 const parts=/^([0-9]{4})-([0-9]{2})-([0-9]{2}) ([0-9]{2}):([0-9]{2}):([0-9]{2})$/.exec(value)
 if(!parts||parts[1]==='0000')throw new Error('请选择完整的东八区时间')
 const [year,month,day,hour,minute,second]=parts.slice(1).map(Number) as [number,number,number,number,number,number]
 const calendar=new Date(0);calendar.setUTCFullYear(year,month-1,day);calendar.setUTCHours(hour,minute,second,0)
 if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day||calendar.getUTCHours()!==hour||calendar.getUTCMinutes()!==minute||calendar.getUTCSeconds()!==second)throw new Error('东八区日期或时间无效')
 const utc=new Date(calendar.getTime()-8*3600000)
 if(utc.getUTCFullYear()<1||utc.getUTCFullYear()>9999)throw new Error('东八区时间超出可表示范围')
 return utc.toISOString()
}
/** 草稿文字与已查询的UTC窗口分开，逐字编辑不发送请求，也不能导出旧窗口。 */
export function useEastEightRange(range:Ref<[Date,Date]>) {
 const draft=ref<[string,string]>(['',''])
 function reset(){draft.value=[formatTime(range.value[0]),formatTime(range.value[1])]}
 watch(range,reset,{immediate:true,flush:'sync'})
 const dirty=computed(()=>draft.value[0]!==formatTime(range.value[0])||draft.value[1]!==formatTime(range.value[1]))
 function edit(index:0|1,value:string|undefined){draft.value[index]=value||''}
 function parse():[Date,Date]{
  const from=new Date(eastEightCivilInstant(draft.value[0])),to=new Date(eastEightCivilInstant(draft.value[1]))
  if(from.getTime()>=to.getTime())throw new Error('结束时间必须晚于起始时间')
  return[from,to]
 }
 return{draft,dirty,edit,parse,reset}
}
