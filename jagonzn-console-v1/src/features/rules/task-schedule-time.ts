/** 原站秒级本地日期输入；显式IANA时区换算，不取浏览器本地时区。 */
const wallPattern=/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})$/
const formatters=new Map<string,Intl.DateTimeFormat>()
function formatter(zone:string){
  if(typeof zone!=='string'||!zone||zone.length>64)throw new Error('请先核对任务时区')
  let value=formatters.get(zone)
  if(!value){value=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});if(formatters.size>=32)formatters.clear();formatters.set(zone,value)}
  return value
}
function wallAt(epoch:number,format:Intl.DateTimeFormat){
  const fields=Object.fromEntries(format.formatToParts(new Date(epoch)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]))
  return `${fields.year!.padStart(4,'0')}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}:${fields.second}`
}
function naive(value:string){
  const match=wallPattern.exec(value);if(!match)throw new Error('请填写完整的日期和秒时间')
  const [,y,m,d,h,min,s]=match,parts=[y,m,d,h,min,s].map(Number),[year,month,day,hour,minute,second]=parts
  if(!year||month!<1||month!>12||day!<1||day!>31||hour!>23||minute!>59||second!>59)throw new Error('日期或时间不合法')
  const date=new Date(0);date.setUTCFullYear(year!,month!-1,day!);date.setUTCHours(hour!,minute!,second!,0)
  if(date.getUTCFullYear()!==year||date.getUTCMonth()+1!==month||date.getUTCDate()!==day)throw new Error('日期不存在')
  return date.getTime()
}
/** 规范到UTC并保留全部六位微秒，不用毫秒Date把成功响应误判成不同的计划。 */
export function canonicalTaskInstant(instant:string){
  const match=typeof instant==='string'&&/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.([0-9]{1,6}))?(Z|[+-]\d\d:\d\d)$/.exec(instant)
  if(!match)throw new Error('任务计划时间不完整，请重新读取')
  naive(match[1]!);const epoch=Date.parse(instant);if(!Number.isFinite(epoch))throw new Error('任务计划时间不合法')
  const utc=new Date(epoch).toISOString();if(!/^[0-9]{4}-/.test(utc))throw new Error('计划时间超出可保存范围')
  return utc.slice(0,19)+'.'+(match[2]||'').padEnd(6,'0')+'Z'
}
/** UTC事实仅用于展示回填；保存时保留微秒，不把本地显示秒数当原始事实。 */
export function taskInstantToWall(instant:string,zone:string){return wallAt(Date.parse(canonicalTaskInstant(instant)),formatter(zone))}
/**
 * 对当前未来IANA分钟offset枚举精确反解，最多2161次Intl格式化；缺失时刻拒绝，重叠选择较早真实发生点。
 * 每个候选都要完整本地回读匹配，不用宽松解析或补一小时修正缺失时刻。
 */
export function taskWallToInstant(value:string,zone:string):{instant:string;ambiguous:boolean}{
  const epoch=naive(value),format=formatter(zone),matches:number[]=[]
  for(let offset=-18*60;offset<=18*60;offset++){
    const candidate=epoch-offset*60000
    if(wallAt(candidate,format)===value)matches.push(candidate)
  }
  if(!matches.length)throw new Error('该时区不存在这个本地时间，请调整后重试')
  const first=Math.min(...matches),instant=new Date(first).toISOString()
  if(!/^[0-9]{4}-/.test(instant))throw new Error('计划时间超出可保存范围')
  return {instant,ambiguous:matches.length>1}
}
