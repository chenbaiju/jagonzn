import {scheduleIntent,type TimerTimeType,type ScheduleIntent} from './task-schedule-state'
import {solarFields,type SolarFieldsDraft} from './task-solar-fields'
import {taskOnceClockIntent} from './task-once-clock-fields'
import type {InitialTaskScheduleIntent} from './task-initial-schedule'
import {intervalFields,type IntervalFieldsDraft} from './task-interval-fields'
/** 仅表单草稿，不是网络DTO；跨类型和两步往返均由父页持有。 */
export type TaskCreateScheduleDraft={kind:'MANUAL'|'ONCE'|'DAILY'|'INTERVAL'|'SOLAR';timeSource:'FIXED'|'DEVICE_TIMER';timerAttributes:string[];timerTimeTypes?:Record<string,TimerTimeType>;zoneKind:'FOLLOW_PROJECT'|'CUSTOM';zone:string;once:string;repeat:'EVERY_DAY'|'CUSTOM';times:string[];days:number[];interval:IntervalFieldsDraft;solar:SolarFieldsDraft}
export function createTaskScheduleDraft():TaskCreateScheduleDraft{return{kind:'MANUAL',timeSource:'FIXED',timerAttributes:[''],timerTimeTypes:{},zoneKind:'FOLLOW_PROJECT',zone:'',once:'',repeat:'EVERY_DAY',times:['00:00:00'],days:[],interval:{amount:'5',unit:'MINUTES',rangeEnabled:false,ranges:[]},solar:{event:'SUNRISE',beforeMinutes:0}}}
/** 每类草稿复用成熟封闭校验；太阳必须显式地点，不从项目/设备或零值推断位置。 */
export function taskCreateScheduleIntent(draft:TaskCreateScheduleDraft,projectZone?:string):InitialTaskScheduleIntent{
 if(draft.kind==='MANUAL')return{kind:'MANUAL'}
 const zone=draft.zoneKind==='CUSTOM'?{zoneKind:draft.zoneKind,zone:draft.zone}:{zoneKind:draft.zoneKind}
 if(draft.kind==='SOLAR'){const fields=solarFields(draft.solar);return scheduleIntent({kind:'SOLAR',event:fields.event,before:fields.beforeMinutes,position:fields.position,...(fields.locationName===undefined?{}:{locationName:fields.locationName}),days:draft.repeat==='EVERY_DAY'?[1,2,3,4,5,6,7]:draft.days,...zone},projectZone)}
 if(draft.kind==='INTERVAL'){const fields=intervalFields(draft.interval);return scheduleIntent({kind:'INTERVAL',minutes:fields.minutes,ranges:fields.ranges,...(fields.ranges.length?zone:{})},projectZone)}
 if(draft.kind==='DAILY'&&draft.timeSource==='DEVICE_TIMER')return scheduleIntent({kind:'DAILY',timeSource:'DEVICE_TIMER',timerAttributes:draft.timerAttributes,...(draft.timerTimeTypes&&Object.keys(draft.timerTimeTypes).length?{timerTimeTypes:draft.timerTimeTypes}:{})},projectZone)
 if(draft.kind==='DAILY')return scheduleIntent({kind:'DAILY',times:draft.times,days:draft.repeat==='EVERY_DAY'?[1,2,3,4,5,6,7]:draft.days,...zone},projectZone)
 return taskOnceClockIntent({kind:'ONCE_CLOCK',time:draft.once,...zone},projectZone)
}
