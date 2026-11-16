<script setup lang="ts">
import { computed,ref,watch } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { scheduleIntent,deviceTimerSchedule,type TimerTimeType,type ScheduleIntent } from './task-schedule-state'
import { taskInstantToWall,taskWallToInstant } from './task-schedule-time'
import TaskTimerAttributes from './TaskTimerAttributes.vue'
import type {TaskSelectionWrite} from './models'
import TaskIntervalFields from './TaskIntervalFields.vue'
import TaskSolarFields from './TaskSolarFields.vue'
import { solarFields,type SolarFieldsDraft } from './task-solar-fields'
import { intervalFields,type IntervalFieldsDraft } from './task-interval-fields'
const props=defineProps<{modelValue:boolean;seed?:ScheduleIntent;selection?:TaskSelectionWrite;projectZone?:string;intervalSupported?:boolean;solarSupported?:boolean;busy?:boolean;locked?:boolean;error?:string}>()
const emit=defineEmits<{ 'update:modelValue':[value:boolean];save:[intent:ScheduleIntent];reread:[] }>()
const kind=ref<string>(),zoneKind=ref<'FOLLOW_PROJECT'|'CUSTOM'>('FOLLOW_PROJECT'),customZone=ref(''),once=ref(''),times=ref<string[]>(['00:00:00']),days=ref<number[]>([1,2,3,4,5,6,7]),repeat=ref('EVERY_DAY'),localError=ref(''),zonePicker=ref(false),pendingZone=ref('')
const timeSource=ref<'FIXED'|'DEVICE_TIMER'>('FIXED'),timerAttributes=ref<string[]>(['']),timerTimeTypes=ref<Record<string,TimerTimeType>>({})
const intervalDraft=ref<IntervalFieldsDraft>({amount:'5',unit:'MINUTES',rangeEnabled:false,ranges:[]})
const solarDraft=ref<SolarFieldsDraft>({event:'SUNRISE',beforeMinutes:0})
const blocked=computed(()=>!!props.busy||!!props.locked)
const kinds=[['MANUAL','关闭定时'],['ONCE','只运行一次'],['DAILY','每日定时'],['INTERVAL','间隔时间重复'],['SOLAR','日出日落']]
const labels=['每周一','每周二','每周三','每周四','每周五','每周六','每周日']
let originalWall='',originalZone=''
watch(()=>props.modelValue,value=>{
  if(!value)return
  kind.value=props.seed?.kind;zoneKind.value=props.seed&&props.seed.kind!=='MANUAL'&&!deviceTimerSchedule(props.seed)&&props.seed.zoneKind?props.seed.zoneKind:'FOLLOW_PROJECT';customZone.value=props.seed&&props.seed.kind!=='MANUAL'&&!deviceTimerSchedule(props.seed)&&props.seed.zoneKind==='CUSTOM'?props.seed.zone||'':props.projectZone||''
  once.value='';times.value=['00:00:00'];days.value=[1,2,3,4,5,6,7];repeat.value='EVERY_DAY';localError.value='';zonePicker.value=false;originalWall='';originalZone=''
  if(props.seed?.kind==='ONCE')try{originalZone=props.seed.zoneKind==='CUSTOM'?props.seed.zone||'':props.projectZone||'';once.value=taskInstantToWall(props.seed.onceAt,originalZone);originalWall=once.value}catch{localError.value='请重新读取任务时区后再设置时间'}
  timeSource.value=props.seed&&deviceTimerSchedule(props.seed)?'DEVICE_TIMER':'FIXED';timerAttributes.value=props.seed&&deviceTimerSchedule(props.seed)?[...props.seed.timerAttributes]:[''];timerTimeTypes.value=props.seed&&deviceTimerSchedule(props.seed)?{...props.seed.timerTimeTypes}:{}
  if(props.seed?.kind==='DAILY'&&!deviceTimerSchedule(props.seed)){times.value=[...props.seed.times]}
  if(props.seed?.kind==='DAILY'&&!deviceTimerSchedule(props.seed)||props.seed?.kind==='SOLAR'){days.value=[...props.seed.days];repeat.value=days.value.length===7?'EVERY_DAY':'CUSTOM'}
  solarDraft.value=props.seed?.kind==='SOLAR'?{event:props.seed.event,beforeMinutes:props.seed.before,position:{...props.seed.position},...(props.seed.locationName===undefined?{}:{locationName:props.seed.locationName})}:{event:'SUNRISE',beforeMinutes:0}
  intervalDraft.value=props.seed?.kind==='INTERVAL'?{amount:String(props.seed.minutes%60===0?props.seed.minutes/60:props.seed.minutes),unit:props.seed.minutes%60===0?'HOURS':'MINUTES',rangeEnabled:props.seed.ranges.length>0,ranges:props.seed.ranges.map(r=>({...r}))}:{amount:'5',unit:'MINUTES',rangeEnabled:false,ranges:[]}
},{immediate:true})
const zones=computed(()=>{
  const known=new Set<string>(['UTC',props.projectZone||'',customZone.value].filter(Boolean))
  try{for(const zone of Intl.supportedValuesOf('timeZone'))known.add(zone)}catch{/* 旧宿主仍提供已知项目/当前/UTC选项，不造非法时区。 */}
  return [...known].sort()
})
function close(value=false){if(!props.busy)emit('update:modelValue',value)}
function chooseZone(){if(blocked.value)return;pendingZone.value=customZone.value||props.projectZone||'';zonePicker.value=true}
function confirmZone(){if(!pendingZone.value)return;customZone.value=pendingZone.value;zonePicker.value=false}
function timerChanged(identifiers:string[],timeTypes:Record<string,TimerTimeType>){if(!blocked.value){timerAttributes.value=identifiers;timerTimeTypes.value=timeTypes}}
function addTime(){if(blocked.value||times.value.length>=24)return;times.value=[...times.value,'00:00:00']}
function removeTime(index:number){if(blocked.value||times.value.length<=1||!Number.isInteger(index)||index<0||index>=times.value.length)return;times.value=times.value.filter((_,i)=>i!==index)}
function submit(){
  if(blocked.value)return
  localError.value=''
  try{
    let intent:ScheduleIntent
    if(kind.value==='MANUAL')intent={kind:'MANUAL'}
    else if(kind.value==='ONCE'){
      const effective=zoneKind.value==='CUSTOM'?customZone.value:props.projectZone
      if(!effective)throw new Error('请先核对项目时区')
      const original=props.seed?.kind==='ONCE'&&once.value===originalWall&&effective===originalZone&&zoneKind.value===props.seed.zoneKind
      const at=original&&props.seed?.kind==='ONCE'?props.seed.onceAt:taskWallToInstant(once.value,effective).instant
      intent={kind:'ONCE',onceAt:at,zoneKind:zoneKind.value,...(zoneKind.value==='CUSTOM'?{zone:customZone.value}:{})}
    }else if(kind.value==='DAILY'&&timeSource.value==='DEVICE_TIMER')intent={kind:'DAILY',timeSource:'DEVICE_TIMER',timerAttributes:[...timerAttributes.value],...(Object.keys(timerTimeTypes.value).length?{timerTimeTypes:timerTimeTypes.value}:{})}
    else if(kind.value==='DAILY')intent={kind:'DAILY',times:[...times.value],days:repeat.value==='EVERY_DAY'?[1,2,3,4,5,6,7]:[...days.value],zoneKind:zoneKind.value,...(zoneKind.value==='CUSTOM'?{zone:customZone.value}:{})}
    else if(kind.value==='INTERVAL'&&props.intervalSupported){
      const fields=intervalFields(intervalDraft.value)
      intent={kind:'INTERVAL',minutes:fields.minutes,ranges:fields.ranges,...(fields.ranges.length?(zoneKind.value==='CUSTOM'?{zoneKind:zoneKind.value,zone:customZone.value}:{zoneKind:zoneKind.value}):{})}
    }
    else if(kind.value==='SOLAR'&&props.solarSupported){
      const fields=solarFields(solarDraft.value)
      intent={kind:'SOLAR',event:fields.event,before:fields.beforeMinutes,position:fields.position,...(fields.locationName===undefined?{}:{locationName:fields.locationName}),days:repeat.value==='EVERY_DAY'?[1,2,3,4,5,6,7]:[...days.value],zoneKind:zoneKind.value,...(zoneKind.value==='CUSTOM'?{zone:customZone.value}:{})}
    }
    else throw new Error('请选择当前可用的定时方式')
    emit('save',scheduleIntent(intent,props.projectZone))
  }catch(cause){localError.value=cause instanceof Error?cause.message:'请检查定时设置'}
}
</script>
<template>
  <el-config-provider :locale="zhCn">
  <el-dialog :model-value="modelValue" title="设置定时" width="800px" top="20vh" class="task-schedule-dialog" :close-on-click-modal="!busy" :close-on-press-escape="!busy" :show-close="!busy" @update:model-value="close">
    <el-form label-position="top" @submit.prevent="submit">
      <el-form-item label="定时方式"><el-radio-group v-model="kind" :disabled="blocked" class="task-schedule-modes"><el-radio v-for="option in kinds" :key="option[0]" :value="option[0]" :disabled="option[0]==='INTERVAL'&&!intervalSupported||option[0]==='SOLAR'&&!solarSupported">{{option[1]}}</el-radio></el-radio-group></el-form-item>
      <template v-if="kind==='DAILY'">
        <el-form-item label="时间设置方式"><el-radio-group v-model="timeSource" :disabled="blocked"><el-radio value="FIXED">设置固定时间</el-radio><el-radio value="DEVICE_TIMER">读取设备定时器属性</el-radio></el-radio-group></el-form-item>
        <TaskTimerAttributes v-if="modelValue&&timeSource==='DEVICE_TIMER'" :model-value="timerAttributes" :time-types="timerTimeTypes" :selection="selection" @change="timerChanged" :disabled="blocked"/>
      </template>
      <el-form-item v-if="kind==='DAILY'&&timeSource!=='DEVICE_TIMER'||kind==='SOLAR'" label="重复方式"><el-radio-group v-model="repeat" :disabled="blocked"><el-radio value="EVERY_DAY">每日</el-radio><el-radio value="CUSTOM">自定义</el-radio></el-radio-group><el-checkbox-group v-if="repeat==='CUSTOM'" v-model="days" :disabled="blocked" class="task-schedule-weekdays"><el-checkbox v-for="(label,index) in labels" :key="index" :value="index+1">{{label}}</el-checkbox></el-checkbox-group></el-form-item>
        <el-form-item v-if="kind==='DAILY'&&timeSource!=='DEVICE_TIMER'" label="运行时间"><div class="task-schedule-times"><div v-for="(_time,index) in times" :key="index" class="task-schedule-time-row"><el-time-picker v-model="times[index]" value-format="HH:mm:ss" format="HH:mm:ss" placeholder="HH:mm:ss" :disabled="blocked" :aria-label="`运行时间 ${index+1}`" /><el-button v-if="times.length>1" link :disabled="blocked" :aria-label="`移除每日时间 ${index+1}`" @click="removeTime(index)">移除</el-button></div><el-button :disabled="blocked||times.length>=24" @click="addTime">添加</el-button></div></el-form-item>
      <TaskSolarFields v-if="kind==='SOLAR'" v-model="solarDraft" position-editable :disabled="blocked||!solarSupported" />
      <TaskIntervalFields v-if="kind==='INTERVAL'" v-model="intervalDraft" :disabled="blocked" />
      <el-form-item v-if="kind==='ONCE'" label="运行时间"><el-date-picker v-model="once" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss" format="YYYY-MM-DD HH:mm:ss" placeholder="选择运行时间" :disabled="blocked" aria-label="一次运行时间" /></el-form-item>
      <el-form-item v-if="kind==='ONCE'||kind==='DAILY'&&timeSource!=='DEVICE_TIMER'||kind==='SOLAR'||kind==='INTERVAL'&&intervalDraft.rangeEnabled" label="时区设置"><div class="task-schedule-zone"><el-radio-group v-model="zoneKind" :disabled="blocked"><el-radio value="FOLLOW_PROJECT">跟随项目时区 <span class="task-schedule-muted">{{projectZone||'—'}}</span></el-radio><el-radio value="CUSTOM">自定义时区</el-radio></el-radio-group><span v-if="zoneKind==='CUSTOM'">{{customZone||'—'}} <el-button link type="primary" :disabled="blocked" @click="chooseZone">编辑</el-button></span></div></el-form-item>
    </el-form>
    <template #footer><el-alert v-if="localError||error" class="task-schedule-footer-error" :title="localError||error" type="error" :closable="false"><el-button v-if="locked" :disabled="busy" @click="$emit('reread')">重新读取核对</el-button></el-alert><el-button :disabled="busy" @click="close()">取消</el-button><el-button type="primary" :loading="busy" :disabled="blocked||kind==='SOLAR'&&(!solarSupported||!solarDraft.position)" @click="submit">完成</el-button></template>
  </el-dialog>
  <el-dialog v-model="zonePicker" title="选择时区" width="460px" append-to-body class="task-schedule-zone-dialog"><el-select v-model="pendingZone" filterable placeholder="选择时区" aria-label="搜索时区" style="width:100%"><el-option v-for="zone in zones" :key="zone" :value="zone" :label="zone" /></el-select><template #footer><el-button @click="zonePicker=false">取消</el-button><el-button type="primary" :disabled="!pendingZone" @click="confirmZone">确定</el-button></template></el-dialog>
  </el-config-provider>
</template>
<style scoped>
.task-schedule-modes{display:flex;flex-wrap:wrap;gap:4px 22px}.task-schedule-modes :deep(.el-radio){margin-right:0}
.task-schedule-weekdays{display:flex;flex-wrap:wrap;gap:4px 16px;width:100%;margin-top:8px}.task-schedule-weekdays :deep(.el-checkbox){margin-right:0}
.task-schedule-times{display:flex;flex-direction:column;gap:8px;align-items:flex-start}.task-schedule-time-row{display:flex;gap:10px;align-items:center;max-width:100%}.task-schedule-time-row :deep(.el-date-editor.el-input){width:200px;max-width:100%}.task-schedule-zone{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.task-schedule-zone :deep(.el-radio-group){display:flex;flex-wrap:wrap;gap:12px}.task-schedule-muted{color:var(--tl-muted);font-size:12px;margin-left:6px}
</style>
<style>.task-schedule-dialog.el-dialog,.task-schedule-zone-dialog.el-dialog{max-width:calc(100vw - 32px)}.task-schedule-dialog.el-dialog{display:flex;flex-direction:column;max-height:calc(80vh - 24px)}.task-schedule-dialog .el-dialog__header,.task-schedule-dialog .el-dialog__footer{flex-shrink:0}.task-schedule-dialog .el-dialog__body{padding-top:24px;padding-bottom:20px;overflow-y:auto;min-height:0}.task-schedule-dialog .el-dialog__footer{padding-top:8px}.task-schedule-footer-error{margin-bottom:12px;text-align:left}</style>
