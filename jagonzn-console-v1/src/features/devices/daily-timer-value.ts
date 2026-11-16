import {isStrictJsonNumber,type StrictJsonObject,type StrictJsonValue} from '@things-link/client-contracts/dashboard/v1'
/** 原生每日定时器只校验自身结构；保留可省略时区和原始属性值，不生成默认参数。 */
export function dailyTimerValue(value:StrictJsonValue|undefined):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return false
 const row=value as StrictJsonObject
 const keys=Object.keys(row)
 if(keys.length<3||keys.length>4||keys.some(k=>!['enable','time','repeat','timezone'].includes(k))||typeof row.enable!=='boolean'||typeof row.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(row.time)||typeof row.repeat!=='string'||!/^[0-6]*$/.test(row.repeat)||new Set(row.repeat).size!==row.repeat.length)return false
 if(Object.hasOwn(row,'timezone')){
  if(typeof row.timezone!=='string'||!row.timezone||row.timezone.length>64||row.timezone.trim()!==row.timezone||!/^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)*$/.test(row.timezone))return false
  try{new Intl.DateTimeFormat('en',{timeZone:row.timezone})}catch{return false}
 }
 return true
}

/** 列表保留原序及共享时区；重复按原time/repeat字符串识别，不因enable不同放行。 */
export function dailyTimerListValue(value:StrictJsonValue|undefined):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return false
 const row=value as StrictJsonObject
 if(Object.keys(row).some(k=>!['timers','timezone'].includes(k))||!Array.isArray(row.timers)||row.timers.length>50)return false
 if(Object.hasOwn(row,'timezone')){
  if(typeof row.timezone!=='string'||!row.timezone||row.timezone.length>64||row.timezone.trim()!==row.timezone||!/^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)*$/.test(row.timezone))return false
  try{new Intl.DateTimeFormat('en',{timeZone:row.timezone})}catch{return false}
 }
 const seen=new Set<string>()
 for(const timer of row.timers){
  if(!timer||typeof timer!=='object'||Array.isArray(timer)||isStrictJsonNumber(timer))return false
  const entry=timer as StrictJsonObject
  if(Object.keys(entry).length!==3||Object.hasOwn(entry,'timezone')||!dailyTimerValue(entry))return false
  const identity=JSON.stringify([entry.time,entry.repeat]);if(seen.has(identity))return false;seen.add(identity)
 }
 return true
}

/** 首片每日区间按已观察App只允许同日严格起止；不增加缺省值或扩展跨夜解释。 */
export function dailyTimerRangeValue(value:StrictJsonValue|undefined):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return false
 const row=value as StrictJsonObject,keys=Object.keys(row)
 if(keys.length<4||keys.length>5||keys.some(k=>!['enable','start_time','end_time','repeat','timezone'].includes(k))||typeof row.enable!=='boolean'||typeof row.start_time!=='string'||typeof row.end_time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(row.start_time)||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(row.end_time)||row.start_time>=row.end_time||typeof row.repeat!=='string'||!/^[0-6]*$/.test(row.repeat)||new Set(row.repeat).size!==row.repeat.length)return false
 if(Object.hasOwn(row,'timezone')){
  if(typeof row.timezone!=='string'||!row.timezone||row.timezone.length>64||row.timezone.trim()!==row.timezone||!/^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)*$/.test(row.timezone))return false
  try{new Intl.DateTimeFormat('en',{timeZone:row.timezone})}catch{return false}
 }
 return true
}

/** 区间列表保留原序和共享时区；共同星期的闭区间相触也拒，启停不豁免，空星期对称无事件。 */
export function dailyTimerRangeListValue(value:StrictJsonValue|undefined):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return false
 const row=value as StrictJsonObject
 if(Object.keys(row).some(k=>!['timers','timezone'].includes(k))||!Array.isArray(row.timers)||row.timers.length>50)return false
 if(Object.hasOwn(row,'timezone')){
  if(typeof row.timezone!=='string'||!row.timezone||row.timezone.length>64||row.timezone.trim()!==row.timezone||!/^[A-Za-z][A-Za-z0-9_+.-]*(?:\/[A-Za-z0-9_+.-]+)*$/.test(row.timezone))return false
  try{new Intl.DateTimeFormat('en',{timeZone:row.timezone})}catch{return false}
 }
 const intervals:{start:string;end:string;days:string}[]=[]
 for(const timer of row.timers){
  if(!timer||typeof timer!=='object'||Array.isArray(timer)||isStrictJsonNumber(timer))return false
  const entry=timer as StrictJsonObject
  if(Object.keys(entry).length!==4||Object.hasOwn(entry,'timezone')||!dailyTimerRangeValue(entry))return false
  const current={start:entry.start_time as string,end:entry.end_time as string,days:entry.repeat as string}
  if(intervals.some(previous=>[...current.days].some(day=>previous.days.includes(day))&&current.start<=previous.end&&previous.start<=current.end))return false
  intervals.push(current)
 }
 return true
}

/** 时长只接收正整数JSON词法，先限制位数再计算同日墙钟终点，不补默认字段。 */
export function dailyTimerDurationValue(value:StrictJsonValue|undefined):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return false
 const row=value as StrictJsonObject,keys=Object.keys(row)
 if(keys.length<4||keys.length>5||keys.some(k=>!['enable','start_time','duration','repeat','timezone'].includes(k))||typeof row.start_time!=='string'||typeof row.enable!=='boolean'||typeof row.repeat!=='string')return false
 const duration=durationSeconds(row.duration)
 if(duration===undefined||!dailyTimerValue({enable:row.enable,time:row.start_time,repeat:row.repeat,...(Object.hasOwn(row,'timezone')?{timezone:row.timezone!}:{})}))return false
 return clockSeconds(row.start_time)+duration<86400
}

/** 时长列表独立检查原字符串重复与共同星期闭区间；空星期不与其它项产生交集。 */
export function dailyTimerDurationListValue(value:StrictJsonValue|undefined):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return false
 const row=value as StrictJsonObject
 if(Object.keys(row).some(k=>!['timers','timezone'].includes(k))||!Array.isArray(row.timers)||row.timers.length>50)return false
 if(Object.hasOwn(row,'timezone')&&!dailyTimerValue({enable:false,time:'00:00:00',repeat:'',timezone:row.timezone!}))return false
 const seen=new Set<string>(),intervals:{start:number;end:number;days:string}[]=[]
 for(const timer of row.timers){
  if(!timer||typeof timer!=='object'||Array.isArray(timer)||isStrictJsonNumber(timer))return false
  const entry=timer as StrictJsonObject
  if(Object.keys(entry).length!==4||Object.hasOwn(entry,'timezone')||!dailyTimerDurationValue(entry))return false
  const duration=durationSeconds(entry.duration)!,start=clockSeconds(entry.start_time as string),days=entry.repeat as string
  const identity=JSON.stringify([entry.start_time,duration,days]);if(seen.has(identity))return false;seen.add(identity)
  const current={start,end:start+duration,days}
  if(intervals.some(previous=>[...days].some(day=>previous.days.includes(day))&&start<=previous.end&&previous.start<=current.end))return false
  intervals.push(current)
 }
 return true
}

/** 有界后才转为整数；小数、指数、裸JS数值均不能冒充已验证的JSON整数token。 */
function durationSeconds(value:StrictJsonValue|undefined):number|undefined{
 if(value===undefined||!isStrictJsonNumber(value)||value.lexical.length>5||!/^[1-9][0-9]*$/.test(value.lexical))return undefined
 const seconds=Number(value.lexical)
 return seconds<86400?seconds:undefined
}
function clockSeconds(time:string):number{return Number(time.slice(0,2))*3600+Number(time.slice(3,5))*60+Number(time.slice(6,8))}

/** 间歇值仅校验有界周期与末端，不预展开事件；to是末次起点上界，END可越过to。 */
export function dailyTimerIntervalValue(value:StrictJsonValue|undefined):boolean{return intervalBounds(value)!==undefined}

/** 间歇列表按完整from/to窗口共同星期检查闭区间；精确重复即使关闭或空星期也拒。 */
export function dailyTimerIntervalListValue(value:StrictJsonValue|undefined):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return false
 const row=value as StrictJsonObject
 if(Object.keys(row).some(k=>!['timers','timezone'].includes(k))||!Array.isArray(row.timers)||row.timers.length>50)return false
 if(Object.hasOwn(row,'timezone')&&!dailyTimerValue({enable:false,time:'00:00:00',repeat:'',timezone:row.timezone!}))return false
 const seen=new Set<string>(),windows:{from:number;to:number;days:string}[]=[]
 for(const timer of row.timers){
  if(!timer||typeof timer!=='object'||Array.isArray(timer)||isStrictJsonNumber(timer))return false
  const entry=timer as StrictJsonObject,current=intervalBounds(entry)
  if(Object.keys(entry).length!==6||Object.hasOwn(entry,'timezone')||!current)return false
  const identity=JSON.stringify([entry.from_time,entry.to_time,current.duration,current.interval,entry.repeat]);if(seen.has(identity))return false;seen.add(identity)
  if(windows.some(previous=>[...current.days].some(day=>previous.days.includes(day))&&current.from<=previous.to&&previous.from<=current.to))return false
  windows.push(current)
 }
 return true
}

/** D/I沿正整数token预算；末起点包含to，最后结束可恰为24时，不误约束END<=to。 */
function intervalBounds(value:StrictJsonValue|undefined):{from:number;to:number;duration:number;interval:number;days:string}|undefined{
 if(!value||typeof value!=='object'||Array.isArray(value)||isStrictJsonNumber(value))return
 const row=value as StrictJsonObject,keys=Object.keys(row)
 if(keys.length<6||keys.length>7||keys.some(k=>!['enable','from_time','to_time','duration','interval','repeat','timezone'].includes(k))||typeof row.enable!=='boolean'||typeof row.repeat!=='string'||typeof row.from_time!=='string'||typeof row.to_time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(row.to_time))return
 if(!dailyTimerValue({enable:row.enable,time:row.from_time,repeat:row.repeat,...(Object.hasOwn(row,'timezone')?{timezone:row.timezone!}:{})}))return
 const duration=durationSeconds(row.duration),interval=durationSeconds(row.interval)
 if(duration===undefined||interval===undefined)return
 const from=clockSeconds(row.from_time),to=clockSeconds(row.to_time)
 if(from>=to||from+duration>to)return
 const lastStart=from+Math.floor((to-from)/(duration+interval))*(duration+interval)
 if(lastStart+duration>86400)return
 return {from,to,duration,interval,days:row.repeat}
}
