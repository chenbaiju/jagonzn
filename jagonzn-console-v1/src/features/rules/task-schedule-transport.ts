import {taskTimerReferences,taskTimerIntent} from './task-initial-schedule'
import type { Schema } from '@/core/contracts'
import { currentProject } from '@/core/session'
import { cas } from './models'
import { getConsoleTaskSchedule,setConsoleTaskSchedule } from './api'
import { scheduleIntent,deviceTimerSchedule,type ScheduleIntent,type ScheduleProjection,type TaskScheduleTransport } from './task-schedule-state'
import { canonicalTaskInstant } from './task-schedule-time'
function incomplete():never{throw new Error('任务定时返回格式不完整，请重新读取任务与项目')}
function zone(value:unknown):value is string{if(typeof value!=='string'||!value||value.length>64)return false;try{new Intl.DateTimeFormat('en',{timeZone:value});return true}catch{return false}}
/** 只转换主控正式生成Schema，包含0290间隔及0340太阳；旧CRON与旧NULL各自保留，不猜每日或一次完成。 */
function projection(value:Schema<'ConsoleTaskScheduleView'>,project:string):ScheduleProjection{
  const requiresReconfigure=value?.requiresReconfigure
  if(!value||!['MANUAL','ONCE','DAILY','CRON','INTERVAL','SOLAR'].includes(value.mode)||typeof value.legacy!=='boolean'||typeof value.taskEnabled!=='boolean'||typeof value.onceConsumed!=='boolean'||!zone(value.resolvedTimezone)
    ||!Array.isArray(value.times)||value.times.length>24||!Array.isArray(value.weekdays)||value.weekdays.length>7)incomplete()
  const token=cas(value.version),next=value.nextRunAt==null?undefined:canonicalTaskInstant(value.nextRunAt)
  if(requiresReconfigure!==undefined&&(requiresReconfigure!==true||value.mode!=='ONCE'||value.legacy||value.taskEnabled||value.onceConsumed||next))incomplete()
  if(!value.taskEnabled&&next)incomplete()
  if(value.mode!=='INTERVAL'&&(value.intervalMinutes!=null||value.timeRanges!=null))incomplete()
  if(value.mode!=='SOLAR'&&(value.solar!=null||value.solarWaitingForEvent!=null))incomplete()
  if(value.timeSource==='DEVICE_TIMER'){
    if(value.mode!=='DAILY'||value.legacy||value.onceConsumed||value.runAt!=null||value.times.length||value.weekdays.length||value.timezoneMode!=null||value.timezone!=null||next||!Array.isArray(value.timerAttributes))incomplete()
    const seed=taskTimerIntent(value.timerAttributes)
    return{token,kind:'DAILY',live:value.taskEnabled,consumed:false,seed}
  }
  if(value.timeSource!=null&&(value.mode!=='DAILY'||value.timeSource!=='FIXED')||value.timerAttributes!=null)incomplete()
  if(value.legacy){
    if(value.onceConsumed||value.mode!=='ONCE'&&value.mode!=='CRON'||value.timezoneMode!=null||value.timezone!=null||value.times.length||value.weekdays.length)incomplete()
    if(value.mode==='ONCE'){if(value.runAt==null)incomplete();canonicalTaskInstant(value.runAt)}else if(value.runAt!=null)incomplete()
    return{token,kind:value.mode==='ONCE'?'ONCE':'UNMAPPED',live:value.taskEnabled,consumed:false}
  }
  if(value.mode==='MANUAL'){
    if(value.runAt!=null||value.timezoneMode!=null||value.timezone!=null||value.times.length||value.weekdays.length||next)incomplete()
    return{token,kind:'MANUAL',live:value.taskEnabled,consumed:value.onceConsumed,seed:{kind:'MANUAL'}}
  }
  if(value.mode==='INTERVAL'){
    if(value.onceConsumed||value.runAt!=null||value.times.length||value.weekdays.length||!Number.isInteger(value.intervalMinutes)||value.intervalMinutes!<5||value.intervalMinutes!>2147483647||!Array.isArray(value.timeRanges)||value.timeRanges.length>24)incomplete()
    if(!value.timeRanges.length){
      if(value.timezoneMode!=null||value.timezone!=null)incomplete()
      const seed=scheduleIntent({kind:'INTERVAL',minutes:value.intervalMinutes!,ranges:[]},undefined)
      return{token,kind:'INTERVAL',live:value.taskEnabled,consumed:false,seed}
    }
  }
  if(value.onceConsumed||value.mode==='CRON'||value.timezoneMode!=='FOLLOW_PROJECT'&&value.timezoneMode!=='CUSTOM')incomplete()
  const projectZone=currentProject.value?.id===project?currentProject.value.timezone:undefined
  if(value.timezoneMode==='FOLLOW_PROJECT'){
    if(value.timezone!=null)incomplete()
    if(projectZone&&projectZone!==value.resolvedTimezone)throw new Error('项目时区已变化，请重新读取项目后重试')
  }else if(!zone(value.timezone)||value.timezone!==value.resolvedTimezone)incomplete()
  const timezone=value.timezoneMode==='CUSTOM'?{zoneKind:value.timezoneMode,zone:value.timezone!}:{zoneKind:value.timezoneMode}
  let seed:ScheduleIntent
  if(value.mode==='INTERVAL')seed={kind:'INTERVAL',minutes:value.intervalMinutes!,ranges:value.timeRanges!,...timezone}
  else if(value.mode==='SOLAR'){
    const source:Schema<'ConsoleTaskSolarPlan'>|undefined=value.solar
    if(value.runAt!=null||value.times.length||!source||typeof source!=='object'||Array.isArray(source)||Object.keys(source).length<4||Object.keys(source).length>5||Object.keys(source).some(k=>!['event','beforeMinutes','latitude','longitude','locationName'].includes(k))
      ||typeof value.solarWaitingForEvent!=='boolean'||value.solarWaitingForEvent&&(!value.taskEnabled||!!next))incomplete()
    seed={kind:'SOLAR',event:source.event,before:source.beforeMinutes,position:{latitude:source.latitude,longitude:source.longitude},...(source.locationName==null?{}:{locationName:source.locationName}),days:value.weekdays,...timezone}
  }
  else if(value.mode==='ONCE'){
    if(value.runAt==null||value.times.length||value.weekdays.length)incomplete()
    const at=canonicalTaskInstant(value.runAt);if(next&&next!==at)incomplete()
    seed={kind:'ONCE',onceAt:at,...timezone}
  }else{
    if(value.runAt!=null)incomplete()
    seed={kind:'DAILY',times:value.times,days:value.weekdays,...timezone}
  }
  seed=scheduleIntent(seed,projectZone||value.resolvedTimezone)
  return{token,kind:seed.kind,live:value.taskEnabled,consumed:false,...(requiresReconfigure===true?{requiresReconfigure:true}:{}),...(value.mode==='SOLAR'?{waitingForEvent:value.solarWaitingForEvent!}:{}),seed}
}
export const taskScheduleTransport:TaskScheduleTransport={
  readPlan:async(project,job,signal)=>projection(await getConsoleTaskSchedule(project,job,signal),project),
  replacePlan:async(project,job,token,raw)=>{
    const projectZone=currentProject.value?.id===project?currentProject.value.timezone:undefined,intent=scheduleIntent(raw,projectZone)
    let body:Schema<'ConsoleTaskScheduleRequest'>
    if(intent.kind==='MANUAL')body={expectedVersion:cas(token),mode:'MANUAL'}
    else if(intent.kind==='SOLAR')body={expectedVersion:cas(token),mode:'SOLAR',timezoneMode:intent.zoneKind,...(intent.zoneKind==='CUSTOM'?{timezone:intent.zone}:{}),weekdays:[...intent.days],solar:{event:intent.event,beforeMinutes:intent.before,latitude:intent.position.latitude,longitude:intent.position.longitude,...(intent.locationName===undefined?{}:{locationName:intent.locationName})}}
    else if(intent.kind==='INTERVAL')body={expectedVersion:cas(token),mode:'INTERVAL',intervalMinutes:intent.minutes,timeRanges:intent.ranges.map(range=>({...range})),...(intent.ranges.length?{timezoneMode:intent.zoneKind,...(intent.zoneKind==='CUSTOM'?{timezone:intent.zone}:{})}:{})}
    else if(deviceTimerSchedule(intent))body={expectedVersion:cas(token),mode:'DAILY',timeSource:'DEVICE_TIMER',timerAttributes:taskTimerReferences(intent)}
    else body={expectedVersion:cas(token),mode:intent.kind,timezoneMode:intent.zoneKind,...(intent.zoneKind==='CUSTOM'?{timezone:intent.zone}:{}),...(intent.kind==='ONCE'?{runAt:intent.onceAt}:{times:[...intent.times],weekdays:[...intent.days]})}
    return projection(await setConsoleTaskSchedule(project,job,body),project)
  }
}
