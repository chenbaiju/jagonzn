import {taskOnceClockIntent,taskOnceClockRunAtMatches,type TaskOnceClockIntent} from './task-once-clock-fields'
import {canonicalTaskInstant} from './task-schedule-time'
import type {Schema} from '@/core/contracts'
import {scheduleIntent,deviceTimerSchedule,type DeviceTimerScheduleIntent,type TimerTimeType,type ScheduleIntent,type ScheduleZone} from './task-schedule-state'
export type InitialTaskScheduleIntent=ScheduleIntent|TaskOnceClockIntent
/** 只消费正式584-clock创建计划；沿用成熟意图校验，不携带CAS、锚点或太阳内部游标。 */
export function taskInitialScheduleRequest(raw:InitialTaskScheduleIntent,projectZone?:string):Schema<'InitialTaskScheduleRequest'>{
 if(raw.kind==='ONCE_CLOCK'){const intent=taskOnceClockIntent(raw,projectZone);return{mode:'ONCE',time:intent.time,timezoneMode:intent.zoneKind,...(intent.zoneKind==='CUSTOM'?{timezone:intent.zone}:{})}}
 const intent=scheduleIntent(raw,projectZone)
 if(intent.kind==='MANUAL')return{mode:'MANUAL'}
 if(intent.kind==='INTERVAL')return{mode:'INTERVAL',intervalMinutes:intent.minutes,timeRanges:intent.ranges.map(r=>({...r})),...(intent.ranges.length?{timezoneMode:intent.zoneKind,...(intent.zoneKind==='CUSTOM'?{timezone:intent.zone}:{})}:{})}
 if(deviceTimerSchedule(intent))return{mode:'DAILY',timeSource:'DEVICE_TIMER',timerAttributes:taskTimerReferences(intent)}
 const zone={timezoneMode:intent.zoneKind,...(intent.zoneKind==='CUSTOM'?{timezone:intent.zone}:{})}
 if(intent.kind==='SOLAR')return{mode:'SOLAR',...zone,weekdays:[...intent.days],solar:{event:intent.event,beforeMinutes:intent.before,latitude:intent.position.latitude,longitude:intent.position.longitude,...(intent.locationName===undefined?{}:{locationName:intent.locationName})}}
 return{mode:intent.kind,...zone,...(intent.kind==='ONCE'?{runAt:intent.onceAt}:{times:[...intent.times],weekdays:[...intent.days]})}
}
/** 严格反解正式形状供原意图核对；隐藏字段即使为undefined也不默默丢弃。 */
export function taskInitialScheduleIntent(value:Schema<'InitialTaskScheduleRequest'>,projectZone?:string):InitialTaskScheduleIntent{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('任务初始计划不完整')
 const mode=value.mode,keys=mode==='MANUAL'?['mode']:mode==='ONCE'?['mode','runAt','time','timezoneMode','timezone']:mode==='DAILY'?['mode','times','weekdays','timezoneMode','timezone','timeSource','timerAttributes']:mode==='INTERVAL'?['mode','intervalMinutes','timeRanges','timezoneMode','timezone']:mode==='SOLAR'?['mode','solar','weekdays','timezoneMode','timezone']:[]
 if(!keys.length||Object.keys(value).some(k=>!keys.includes(k)))throw new Error('任务初始计划含有不支持的字段')
 if(mode==='DAILY'&&value.timeSource==='DEVICE_TIMER'){
  if(Object.keys(value).some(k=>!['mode','timeSource','timerAttributes'].includes(k)))throw new Error('每日定时器属性计划不完整')
  return taskTimerIntent(value.timerAttributes)
 }
 if(value.timeSource!==undefined&&value.timeSource!=='FIXED'||value.timerAttributes!==undefined)throw new Error('请核对每日定时时间设置方式')
 if(mode==='MANUAL')return scheduleIntent({kind:'MANUAL'},projectZone)
 if(mode==='INTERVAL'){
  if(typeof value.intervalMinutes!=='number'||!Array.isArray(value.timeRanges))throw new Error('间隔计划字段不完整')
  return scheduleIntent({kind:mode,minutes:value.intervalMinutes,ranges:value.timeRanges,...('timezoneMode' in value?{zoneKind:value.timezoneMode}:{}),...('timezone' in value?{zone:value.timezone}:{})},projectZone)
 }
 let zone:ScheduleZone
 if(value.timezoneMode==='CUSTOM')zone={zoneKind:'CUSTOM',zone:value.timezone}
 else if(value.timezoneMode==='FOLLOW_PROJECT')zone={zoneKind:'FOLLOW_PROJECT',...('timezone' in value?{zone:value.timezone}:{})}
 else throw new Error('请核对初始计划时区方式')
 if(mode==='ONCE'&&'time' in value){if('runAt' in value||typeof value.time!=='string')throw new Error('一次钟表与绝对时刻不能混入');return taskOnceClockIntent({kind:'ONCE_CLOCK',time:value.time,...zone},projectZone)}
 if(mode==='ONCE'){if(typeof value.runAt!=='string')throw new Error('请明确一次计划的日期与时间');return scheduleIntent({kind:mode,onceAt:value.runAt,...zone},projectZone)}
 if(mode==='DAILY')return scheduleIntent({kind:mode,times:value.times||[],days:value.weekdays||[],...zone},projectZone)
 const solar=value.solar
 if(!solar||typeof solar!=='object'||Array.isArray(solar)||Object.keys(solar).length<4||Object.keys(solar).length>5||Object.keys(solar).some(k=>!['event','beforeMinutes','latitude','longitude','locationName'].includes(k)))throw new Error('太阳计划字段不完整')
 return scheduleIntent({kind:'SOLAR',event:solar.event,before:solar.beforeMinutes,position:{latitude:solar.latitude,longitude:solar.longitude},...(solar.locationName==null?{}:{locationName:solar.locationName}),days:value.weekdays||[],...zone},projectZone)
}

/** 比较实际持久计划与初始意图；钟表分支只核服务器已冻结时刻，不计算下一日期。 */
export function taskInitialScheduleMatches(initial:Schema<'InitialTaskScheduleRequest'>,seed:ScheduleIntent,runAt:string|undefined|null,projectZone?:string):boolean{
 const request=taskInitialScheduleIntent(initial,projectZone)
 if(request.kind==='ONCE_CLOCK'){
  if(seed.kind!=='ONCE'||typeof runAt!=='string'||canonicalTaskInstant(seed.onceAt)!==canonicalTaskInstant(runAt)||seed.zoneKind!==request.zoneKind||seed.zone!==request.zone)return false
  return taskOnceClockRunAtMatches(request,seed.onceAt,request.zoneKind==='CUSTOM'?request.zone!:projectZone!,projectZone)
 }
 return JSON.stringify(taskInitialScheduleRequest(seed,projectZone))===JSON.stringify(taskInitialScheduleRequest(request,projectZone))
}

/** 端点只来自显式草稿，旧point/list引用仍恰有identifier，不增加缺省字段。 */
export function taskTimerReferences(intent:DeviceTimerScheduleIntent):NonNullable<Schema<'InitialTaskScheduleRequest'>['timerAttributes']>{
 return intent.timerAttributes.map(identifier=>({identifier,...(intent.timerTimeTypes&&Object.hasOwn(intent.timerTimeTypes,identifier)?{timeType:intent.timerTimeTypes[identifier]}:{})}))
}
/** 读回引用的完整端点身份；不从缺字段推断START，不借当前候选重写持久计划。 */
export function taskTimerIntent(value:unknown):DeviceTimerScheduleIntent{
 if(!Array.isArray(value))throw new Error('每日定时器属性计划不完整')
 const endpoints:Record<string,TimerTimeType>=Object.create(null),identifiers:string[]=[]
 for(const reference of value){
  if(!reference||typeof reference!=='object'||Array.isArray(reference)||Object.keys(reference).some(k=>k!=='identifier'&&k!=='timeType')||typeof reference.identifier!=='string')throw new Error('每日定时器属性引用不完整')
  identifiers.push(reference.identifier)
  if(Object.hasOwn(reference,'timeType')){if(reference.timeType!=='START'&&reference.timeType!=='END')throw new Error('定时区间端点不合法');endpoints[reference.identifier]=reference.timeType}
 }
 const intent=scheduleIntent({kind:'DAILY',timeSource:'DEVICE_TIMER',timerAttributes:identifiers,...(Object.keys(endpoints).length?{timerTimeTypes:endpoints}:{})},undefined)
 if(!deviceTimerSchedule(intent))throw new Error('每日定时器属性计划不完整')
 return intent
}
