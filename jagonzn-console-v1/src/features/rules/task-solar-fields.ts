import {validUnicode} from './preprocess-exact-json'
/** 展示草稿与输入预算；不是网络DTO；地点显式坐标预算与原站套餐内页证据分别登记。 */
export type SolarEvent='SUNRISE'|'SUNSET'
export type SolarPosition={latitude:number;longitude:number}
export type SolarFieldsDraft={event:SolarEvent;beforeMinutes:number;position?:SolarPosition;locationName?:string}
/** 地点名仅是固定点的可选元信息；空串保留，旧null/缺省仍省略。 */
export function solarLocationName(value:unknown):string|undefined{
 if(value===undefined||value===null)return undefined
 if(typeof value!=='string'||[...value].length>256||!validUnicode(value)||/\p{Cc}/u.test(value))throw new Error('地点名称无效')
 return value
}
export const solarBeforeMinutes=[360,300,240,180,150,120,90,60,50,40,30,20,10,5,0,-5,-10,-20,-30,-40,-50,-60,-90,-120,-150,-180,-240,-300,-360] as const

function coordinate(value:unknown,bound:number):number{
  if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>bound||Number(value.toFixed(8))!==value)throw new Error('地点坐标无效，请重新读取定时设置')
  return Object.is(value,-0)?0:value
}
/** 明确位置才可编辑既有太阳计划，零经纬度是合法坐标，不是未配置。 */
export function solarPosition(value:unknown):SolarPosition{
  if(!value||typeof value!=='object'||Object.keys(value).length!==2||!('latitude' in value)||!('longitude' in value))throw new Error('请先配置日出日落地点')
  return{latitude:coordinate(value.latitude,90),longitude:coordinate(value.longitude,180)}
}
/** 只冻结事件、精确29项前后偏移和已有位置，内部复查/消费日期不进入草稿。 */
export function solarFields(value:SolarFieldsDraft):SolarFieldsDraft&{position:SolarPosition}{
  if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['event','beforeMinutes','position','locationName'].includes(k))||value.event!=='SUNRISE'&&value.event!=='SUNSET'
    ||!Number.isInteger(value.beforeMinutes)||!solarBeforeMinutes.includes(value.beforeMinutes as typeof solarBeforeMinutes[number]))throw new Error('请选择可用的太阳事件与前后偏移')
  const locationName=solarLocationName(value.locationName)
  return{event:value.event,beforeMinutes:value.beforeMinutes,position:solarPosition(value.position),...(locationName===undefined?{}:{locationName})}
}

/** 正数提前，负数延后；复用API历史字段名，不反转网络符号。 */
export function solarOffsetLabel(minutes:number):string{
  if(!solarBeforeMinutes.includes(minutes as typeof solarBeforeMinutes[number]))throw new Error('请选择可用的前后偏移')
  if(minutes===0)return '准时'
  const absolute=Math.abs(minutes),hours=Math.floor(absolute/60),rest=absolute%60
  const duration=hours?`${hours} 小时${rest?` ${rest} 分钟`:''}`:`${rest} 分钟`
  return `${minutes>0?'之前':'之后'} ${duration}`
}
/** 首次地点只收明确的十进制文本；空白不能被Number隐式解释为零，不调用定位或外部地理服务。 */
export function solarPositionInput(latitude:string,longitude:string):SolarPosition{
  const values=[latitude,longitude].map(value=>value.trim())
  if(values.some(value=>!/^[-]?(0|[1-9][0-9]*)(\.[0-9]{1,8})?$/.test(value)))throw new Error('请输入有效经纬度，最多8位小数')
  return solarPosition({latitude:Number(values[0]),longitude:Number(values[1])})
}
