import { computed,nextTick,onScopeDispose,ref,watch,type Ref } from 'vue'
import { can,projectId } from '@/core/session'
import { ApiError,IdentityChanged,errorMessage,identityEpoch,onIdentityChange } from '@/core/http'
import { useResource } from '@/core/use-resource'
import { cas } from './models'
import { taskInstantToWall,canonicalTaskInstant } from './task-schedule-time'
import { intervalFields,type IntervalRange } from './task-interval-fields'
import { solarFields,type SolarEvent,type SolarPosition } from './task-solar-fields'

/** 编辑意图/展示端口，与正式网络DTO分开；适配器后续只消费主控生成Schema。 */
export type ScheduleZone={zoneKind:'FOLLOW_PROJECT'|'CUSTOM';zone?:string}
export type SolarScheduleIntent={kind:'SOLAR';event:SolarEvent;before:number;position:SolarPosition;locationName?:string;days:readonly number[]}&ScheduleZone
export type TimerTimeType='START'|'END'
export type DeviceTimerScheduleIntent={kind:'DAILY';timeSource:'DEVICE_TIMER';timerAttributes:readonly string[];timerTimeTypes?:Readonly<Record<string,TimerTimeType>>}
export function deviceTimerSchedule(value:ScheduleIntent):value is DeviceTimerScheduleIntent{return value.kind==='DAILY'&&'timeSource' in value&&value.timeSource==='DEVICE_TIMER'}
export type ScheduleIntent=DeviceTimerScheduleIntent|SolarScheduleIntent|{kind:'MANUAL'}|({kind:'ONCE';onceAt:string}&ScheduleZone)|({kind:'DAILY';times:readonly string[];days:readonly number[]}&ScheduleZone)|{kind:'INTERVAL';minutes:number;ranges:readonly IntervalRange[];zoneKind?:'FOLLOW_PROJECT'|'CUSTOM';zone?:string}
export type ScheduleProjection={token:number;kind:'MANUAL'|'ONCE'|'DAILY'|'INTERVAL'|'SOLAR'|'UNMAPPED';live:boolean;consumed:boolean;requiresReconfigure?:boolean;waitingForEvent?:boolean;seed?:ScheduleIntent}
export type TaskScheduleTransport={readPlan:(project:string,job:string,signal:AbortSignal)=>Promise<ScheduleProjection>;replacePlan:(project:string,job:string,token:number,intent:ScheduleIntent)=>Promise<ScheduleProjection>}
/** 冻结真正编辑的有限字段，不把残缺分支或隐藏全定义传给写端口。 */
export function scheduleIntent(value:ScheduleIntent,projectZone:string|undefined):ScheduleIntent{
  if(!value||typeof value!=='object')throw new Error('请选择定时方式')
  if(deviceTimerSchedule(value)){
    if(Object.keys(value).some(k=>!['kind','timeSource','timerAttributes','timerTimeTypes'].includes(k))||!Array.isArray(value.timerAttributes)||value.timerAttributes.length<1||value.timerAttributes.length>10||value.timerAttributes.some(k=>typeof k!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(k))||new Set(value.timerAttributes).size!==value.timerAttributes.length)throw new Error('请填写1至10个不重复的定时器属性标识符')
    const endpoints=value.timerTimeTypes
    if(endpoints!==undefined&&(!endpoints||typeof endpoints!=='object'||Array.isArray(endpoints)||Object.keys(endpoints).some(key=>!value.timerAttributes.includes(key)||endpoints[key]!=='START'&&endpoints[key]!=='END')))throw new Error('请明确选择定时区间的开始或结束时间')
    // 端点按原引用顺序冻结，避免用户编辑次序与服务回读次序制造虚假的UNKNOWN。
    const ordered:Record<string,TimerTimeType>=Object.create(null);if(endpoints)for(const key of value.timerAttributes)if(Object.hasOwn(endpoints,key))ordered[key]=endpoints[key]!
    return{kind:'DAILY',timeSource:'DEVICE_TIMER',timerAttributes:[...value.timerAttributes],...(Object.keys(ordered).length?{timerTimeTypes:{...ordered}}:{})}
  }
  if(value.kind==='MANUAL'){if(Object.keys(value).some(k=>k!=='kind'))throw new Error('关闭定时不接受隐藏字段');return{kind:'MANUAL'}}
  if(value.kind==='INTERVAL'){
    if(Object.keys(value).some(k=>!['kind','minutes','ranges','zoneKind','zone'].includes(k))||!Number.isInteger(value.minutes)||value.minutes<5||value.minutes>2147483647||!Array.isArray(value.ranges)||value.ranges.length>24)throw new Error('请设置有效的间隔分钟与时间范围')
    const fields=intervalFields({amount:String(value.minutes),unit:'MINUTES',rangeEnabled:value.ranges.length>0,ranges:value.ranges})
    if(!fields.ranges.length){if(value.zoneKind!==undefined||value.zone!==undefined)throw new Error('无时间范围不接受隐藏时区');return{kind:'INTERVAL',minutes:fields.minutes,ranges:[]}}
    if(value.zoneKind!=='FOLLOW_PROJECT'&&value.zoneKind!=='CUSTOM'||value.zoneKind==='FOLLOW_PROJECT'&&value.zone!==undefined)throw new Error('请核对时区方式')
    const zone=value.zoneKind==='CUSTOM'?value.zone:projectZone
    if(!zone||zone.length>64)throw new Error('请先重新读取项目时区')
    new Intl.DateTimeFormat('en',{timeZone:zone})
    return{kind:'INTERVAL',minutes:fields.minutes,ranges:fields.ranges,...(value.zoneKind==='CUSTOM'?{zoneKind:value.zoneKind,zone}:{zoneKind:value.zoneKind})}
  }
  if(value.kind==='SOLAR'){
    if(Object.keys(value).some(k=>!['kind','event','before','position','locationName','days','zoneKind','zone'].includes(k)))throw new Error('太阳计划含有未知字段')
    const fields=solarFields({event:value.event,beforeMinutes:value.before,position:value.position,locationName:value.locationName})
    if(!Array.isArray(value.days)||value.days.length<1||value.days.length>7||new Set(value.days).size!==value.days.length||value.days.some(d=>!Number.isInteger(d)||d<1||d>7))throw new Error('请设置有效重复星期')
    if(value.zoneKind!=='FOLLOW_PROJECT'&&value.zoneKind!=='CUSTOM'||value.zoneKind==='FOLLOW_PROJECT'&&value.zone!==undefined)throw new Error('请核对时区方式')
    const zone=value.zoneKind==='CUSTOM'?value.zone:projectZone;if(!zone||zone.length>64)throw new Error('请先重新读取项目时区');new Intl.DateTimeFormat('en',{timeZone:zone})
    return{kind:'SOLAR',event:fields.event,before:fields.beforeMinutes,position:fields.position,...(fields.locationName===undefined?{}:{locationName:fields.locationName}),days:[...value.days].sort((a,b)=>a-b),...(value.zoneKind==='CUSTOM'?{zoneKind:value.zoneKind,zone}:{zoneKind:value.zoneKind})}
  }
  if(value.kind!=='ONCE'&&value.kind!=='DAILY')throw new Error('当前定时方式暂不可保存')
  const keys=value.kind==='ONCE'?['kind','onceAt','zoneKind','zone']:['kind','times','days','zoneKind','zone']
  if(Object.keys(value).some(k=>!keys.includes(k)))throw new Error('定时字段不完整，请重新读取')
  if(value.zoneKind!=='FOLLOW_PROJECT'&&value.zoneKind!=='CUSTOM'||value.zoneKind==='FOLLOW_PROJECT'&&value.zone!==undefined)throw new Error('请核对时区方式')
  const zone=value.zoneKind==='CUSTOM'?value.zone:projectZone
  if(!zone||zone.length>64)throw new Error('请先重新读取项目时区')
  // Intl只校验显式时区，不把运行环境时区当项目时区。
  new Intl.DateTimeFormat('en',{timeZone:zone})
  const zoneFields:ScheduleZone=value.zoneKind==='CUSTOM'?{zoneKind:value.zoneKind,zone}:{zoneKind:value.zoneKind}
  if(value.kind==='ONCE'){taskInstantToWall(value.onceAt,zone);return{kind:'ONCE',onceAt:canonicalTaskInstant(value.onceAt),...zoneFields}}
  if(!Array.isArray(value.times)||value.times.length<1||value.times.length>24||new Set(value.times).size!==value.times.length||value.times.some(t=>typeof t!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(t))
    ||!Array.isArray(value.days)||value.days.length<1||value.days.length>7||new Set(value.days).size!==value.days.length||value.days.some(d=>!Number.isInteger(d)||d<1||d>7))throw new Error('请设置有效运行时间和重复星期')
  return{kind:'DAILY',times:[...value.times].sort(),days:[...value.days].sort((a,b)=>a-b),...zoneFields}
}
/** 全局计划与父入口共享忙/未知；先刷新父定义再读计划才能完成人工核对。 */
export function useTaskScheduleState(job:Ref<string>,projectZone:Ref<string|undefined>,transport:TaskScheduleTransport,refreshContext:()=>Promise<void>,available:Ref<boolean>=ref(true)){
  const allowed=computed(()=>available.value&&can('task:read')),manage=computed(()=>allowed.value&&can('task:manage'))
  const editing=ref(false),seed=ref<ScheduleIntent>(),writing=ref(false),rereading=ref(false),locked=ref(false),writeError=ref(''),notice=ref('')
  const busy=computed(()=>writing.value||rereading.value)
  let active=true,generation=0,refreshId=0
  function validate(value:ScheduleProjection){
    if(!value||!['MANUAL','ONCE','DAILY','INTERVAL','SOLAR','UNMAPPED'].includes(value.kind)||typeof value.live!=='boolean'||typeof value.consumed!=='boolean'||value.consumed&&value.kind!=='MANUAL')throw new Error('任务定时返回不完整，请重新读取')
    if(value.requiresReconfigure!==undefined&&(value.requiresReconfigure!==true||value.kind!=='ONCE'||value.live||value.consumed))throw new Error('任务定时返回不完整，请重新读取')
    if(value.kind==='SOLAR'?typeof value.waitingForEvent!=='boolean'||!value.seed||value.waitingForEvent&&!value.live:value.waitingForEvent!==undefined)throw new Error('太阳等待状态不完整，请重新读取')
    cas(value.token)
    if(value.seed){const plan=scheduleIntent(value.seed,projectZone.value);if(plan.kind!==value.kind)throw new Error('任务定时身份不匹配，请重新读取');return{...value,seed:plan}}
    return value
  }
  const page=useResource(async signal=>validate(await transport.readPlan(projectId.value,job.value,signal)))
  function reset(cancel=false){generation++;editing.value=false;seed.value=undefined;writing.value=false;locked.value=false;writeError.value='';notice.value='';page.clear();if(cancel){refreshId++;rereading.value=false}}
  const dispose=onIdentityChange(()=>reset(true));onScopeDispose(()=>{active=false;dispose()})
  watch([projectId,job,projectZone,allowed,manage],(now,previous)=>{
    const same=!!previous&&now[0]===previous[0]&&now[1]===previous[1],retain=same&&(writing.value||locked.value)
    reset(!same);locked.value=retain;if(retain)writeError.value='请重新读取任务与定时设置核对最新状态'
    if(allowed.value&&projectId.value&&job.value&&!rereading.value)void reload(false)
  },{immediate:true})
  watch(page.error,cause=>{if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){page.data.value=undefined;editing.value=false;seed.value=undefined}})
  const ready=computed(()=>allowed.value&&!busy.value&&!locked.value&&!page.loading.value&&!page.error.value&&!!page.data.value)
  const canManage=computed(()=>ready.value&&manage.value)
  function capture(){const project=projectId.value,id=job.value,epoch=identityEpoch(),scope=generation;return()=>active&&epoch===identityEpoch()&&scope===generation&&project===projectId.value&&id===job.value&&allowed.value}
  function open(){if(!canManage.value)return;editing.value=true;seed.value=page.data.value?.seed?structuredClone(page.data.value.seed):undefined;writeError.value='';notice.value=''}
  function close(){if(!busy.value){editing.value=false;seed.value=undefined}}
  async function reload(manual=true){
    if(!allowed.value||!projectId.value||!job.value||busy.value)return
    const refresh=++refreshId,project=projectId.value,id=job.value,epoch=identityEpoch()
    const same=()=>active&&epoch===identityEpoch()&&project===projectId.value&&id===job.value&&can('task:read')
    if(manual){editing.value=false;seed.value=undefined;rereading.value=true;try{await refreshContext();await nextTick()}catch(cause){if(same()&&refresh===refreshId&&!(cause instanceof IdentityChanged)){writeError.value=errorMessage(cause);page.clear();page.error.value=cause}if(refresh===refreshId)rereading.value=false;return}}
    if(!same()||!allowed.value||refresh!==refreshId){if(refresh===refreshId)rereading.value=false;return}
    const current=capture();await page.reload()
    if(current()&&manual&&!page.error.value&&page.data.value){locked.value=false;writeError.value='';notice.value=''}
    if(refresh===refreshId)rereading.value=false
  }
  function fail(cause:unknown){
    writeError.value=errorMessage(cause)
    if(!(cause instanceof ApiError)||cause.outcomeUnknown||cause.status===0||cause.status===409||cause.status>=500)locked.value=true
    if(cause instanceof ApiError&&[401,403,404].includes(cause.status)){page.clear();page.error.value=cause;editing.value=false;seed.value=undefined}
  }
  async function save(value:ScheduleIntent){
    if(!editing.value||!canManage.value||!page.data.value)return
    let intent:ScheduleIntent
    try{intent=scheduleIntent(value,projectZone.value)}catch(cause){writeError.value=errorMessage(cause);return}
    const previous=page.data.value,current=capture(),project=projectId.value,id=job.value,token=cas(previous.token)
    writing.value=true;writeError.value='';notice.value=''
    try{
      const returned=validate(await transport.replacePlan(project,id,token,structuredClone(intent)))
      if(!current()||!manage.value)return
      const same=previous.seed&&JSON.stringify(previous.seed)===JSON.stringify(intent)&&!previous.consumed
      if(returned.kind!==intent.kind||returned.token!==token+1&&!(same&&returned.token===token)||!returned.seed||JSON.stringify(scheduleIntent(returned.seed,projectZone.value))!==JSON.stringify(intent))throw new Error('任务定时写响应不匹配，请重新读取核对')
      await refreshContext();await nextTick();if(!current()||!manage.value)return
      await page.reload();if(!current()||!manage.value)return
      if(page.error.value||!page.data.value)throw page.error.value||new Error('任务定时保存后未形成实际回读')
      editing.value=false;seed.value=undefined;notice.value='定时设置已保存'
    }catch(cause){if(current()&&!(cause instanceof IdentityChanged))fail(cause)}
    finally{if(current())writing.value=false}
  }
  return{allowed,manage,page,editing,seed,busy,locked,writeError,notice,ready,canManage,open,close,reload,save}
}
