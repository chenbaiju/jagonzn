import {canonicalTaskInstant,taskInstantToWall,taskWallToInstant} from './task-schedule-time'
/** 创建钟表草稿，不是持久计划；日期只能由服务器原创建事务绑定。 */
export type TaskOnceClockIntent={kind:'ONCE_CLOCK';time:string;zoneKind:'FOLLOW_PROJECT'|'CUSTOM';zone?:string}
export function taskOnceClockIntent(value:TaskOnceClockIntent,projectZone?:string):TaskOnceClockIntent{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['kind','time','zoneKind','zone'].includes(key))||value.kind!=='ONCE_CLOCK'||typeof value.time!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(value.time))throw new Error('请选择完整的时分秒')
 if(value.zoneKind!=='FOLLOW_PROJECT'&&value.zoneKind!=='CUSTOM'||value.zoneKind==='FOLLOW_PROJECT'&&'zone' in value)throw new Error('请核对一次计划时区方式')
 const zone=value.zoneKind==='CUSTOM'?value.zone:projectZone
 if(typeof zone!=='string'||!zone||zone.length>64)throw new Error('请先核对任务时区')
 try{new Intl.DateTimeFormat('en',{timeZone:zone})}catch{throw new Error('请选择有效时区')}
 return{kind:'ONCE_CLOCK',time:value.time,zoneKind:value.zoneKind,...(value.zoneKind==='CUSTOM'?{zone}: {})}
}
/** 只核对服务器已冻结的绝对时刻，不用浏览器now选择某一天。 */
export function taskOnceClockRunAtMatches(raw:TaskOnceClockIntent,runAt:string,timezone:string,projectZone?:string):boolean{
 const intent=taskOnceClockIntent(raw,projectZone),effective=intent.zoneKind==='CUSTOM'?intent.zone!:projectZone!
 if(timezone!==effective)return false
 const canonical=canonicalTaskInstant(runAt)
 if(!canonical.endsWith('.000000Z'))return false
 const wall=taskInstantToWall(canonical,effective)
 if(wall.slice(11)!==intent.time)return false
 const reversed=taskWallToInstant(wall,effective)
 return !reversed.ambiguous&&canonicalTaskInstant(reversed.instant)===canonical
}
