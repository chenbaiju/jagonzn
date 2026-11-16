<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import TaskTimerAttributes from './TaskTimerAttributes.vue'
import type {TaskSelectionWrite} from './models'
import TaskIntervalFields from './TaskIntervalFields.vue'
import TaskSolarFields from './TaskSolarFields.vue'
import TaskOnceClockFields from './TaskOnceClockFields.vue'
import type {TimerTimeType} from './task-schedule-state'
import type {TaskCreateScheduleDraft} from './task-create-schedule'
const props=defineProps<{modelValue:TaskCreateScheduleDraft;selection?:TaskSelectionWrite;projectZone?:string;disabled?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:TaskCreateScheduleDraft]}>()
function update(patch:Partial<TaskCreateScheduleDraft>){if(!props.disabled)emit('update:modelValue',{...props.modelValue,...patch})}
function timerChanged(identifiers:string[],timeTypes:Record<string,TimerTimeType>){update({timerAttributes:identifiers,timerTimeTypes:timeTypes})}
function time(index:number,value:string|null){update({times:props.modelValue.times.map((v,i)=>i===index?value||'':v)})}
function add(){if(props.modelValue.times.length<24)update({times:[...props.modelValue.times,'00:00:00']})}
const zoneVisible=computed(()=>props.modelValue.kind==='ONCE'||props.modelValue.kind==='DAILY'&&props.modelValue.timeSource!=='DEVICE_TIMER'||props.modelValue.kind==='SOLAR'||props.modelValue.kind==='INTERVAL'&&props.modelValue.interval.rangeEnabled)
const zones=computed(()=>{const options=new Set(['UTC',props.projectZone||'',props.modelValue.zone].filter(Boolean));try{Intl.supportedValuesOf('timeZone').forEach(z=>options.add(z))}catch{/* 已知项目/UTC仍可用。 */}return [...options].sort()})
const zoneEditing=ref(false),zoneDraft=ref('')
function zoneCaption(zone:string|undefined){if(!zone)return '未设置';try{const offset=new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'longOffset'}).formatToParts(new Date()).find(part=>part.type==='timeZoneName')?.value.replace('GMT','UTC')||'';return `${zone} ${offset==='UTC'?'UTC+00:00':offset}`}catch{return zone}}
function closeZone(){zoneEditing.value=false;zoneDraft.value=''}
function editZone(){if(props.disabled||!zoneVisible.value)return;update({zoneKind:'CUSTOM'});zoneDraft.value=props.modelValue.zone||props.projectZone||'';zoneEditing.value=true}
function saveZone(){if(props.disabled||!zoneEditing.value||!zoneDraft.value)return;try{new Intl.DateTimeFormat('en',{timeZone:zoneDraft.value})}catch{return}update({zoneKind:'CUSTOM',zone:zoneDraft.value});closeZone()}
function zoneDialog(value:boolean){if(!value)closeZone()}
watch(()=>props.disabled,value=>{if(value)closeZone()})
watch(()=>props.modelValue.kind,closeZone)
watch(()=>props.projectZone,closeZone)
const days=['每周一','每周二','每周三','每周四','每周五','每周六','每周日']
</script>
<template><section class="create-schedule-fields">
 <el-form-item label="定时方式"><el-radio-group :model-value="modelValue.kind" aria-label="初始定时方式" :disabled="disabled" class="schedule-modes" @update:model-value="update({kind:$event as TaskCreateScheduleDraft['kind']})"><el-radio value="MANUAL">关闭定时</el-radio><el-radio value="ONCE">只运行一次</el-radio><el-radio value="DAILY">每日定时</el-radio><el-radio value="INTERVAL">间隔时间重复</el-radio><el-radio value="SOLAR">日出日落</el-radio></el-radio-group></el-form-item>
 <template v-if="modelValue.kind==='DAILY'">
  <el-form-item label="时间设置方式"><el-radio-group :model-value="modelValue.timeSource" :disabled="disabled" @update:model-value="update({timeSource:$event as TaskCreateScheduleDraft['timeSource']})"><el-radio value="FIXED">设置固定时间</el-radio><el-radio value="DEVICE_TIMER">读取设备定时器属性</el-radio></el-radio-group></el-form-item>


 <TaskTimerAttributes v-if="modelValue.timeSource==='DEVICE_TIMER'" :model-value="modelValue.timerAttributes" :time-types="modelValue.timerTimeTypes" :selection="selection" :disabled="disabled" @change="timerChanged"/>
 </template>
 <template v-if="modelValue.kind==='DAILY'&&modelValue.timeSource!=='DEVICE_TIMER'||modelValue.kind==='SOLAR'">
  <el-form-item label="重复方式"><el-radio-group :model-value="modelValue.repeat" :disabled="disabled" @update:model-value="update({repeat:$event as TaskCreateScheduleDraft['repeat']})"><el-radio value="EVERY_DAY">每日</el-radio><el-radio value="CUSTOM">自定义</el-radio></el-radio-group><el-checkbox-group v-if="modelValue.repeat==='CUSTOM'" :model-value="modelValue.days" :disabled="disabled" class="schedule-days" @update:model-value="update({days:$event as number[]})"><el-checkbox v-for="(day,index) in days" :key="day" :value="index+1">{{day}}</el-checkbox></el-checkbox-group></el-form-item>
 </template>
  <el-form-item v-if="modelValue.kind==='DAILY'&&modelValue.timeSource!=='DEVICE_TIMER'" label="运行时间"><div class="schedule-times"><div v-for="(value,index) in modelValue.times" :key="index" class="schedule-time-row"><el-time-picker :model-value="value" value-format="HH:mm:ss" format="HH:mm:ss" :disabled="disabled" :aria-label="`初始每日时间 ${index+1}`" @update:model-value="time(index,$event)"/><el-button v-if="modelValue.times.length>1" link :disabled="disabled" :aria-label="`移除每日时间 ${index+1}`" @click="update({times:modelValue.times.filter((_,i)=>i!==index)})">移除</el-button></div><el-button :disabled="disabled||modelValue.times.length>=24" @click="add">添加</el-button></div></el-form-item>
 <TaskSolarFields v-if="modelValue.kind==='SOLAR'" position-editable :model-value="modelValue.solar" :disabled="disabled" @update:model-value="update({solar:$event})"/>
 <TaskOnceClockFields v-if="modelValue.kind==='ONCE'" :model-value="modelValue.once" :disabled="disabled" @update:model-value="update({once:$event})"/>
 <TaskIntervalFields v-if="modelValue.kind==='INTERVAL'" unit-radio range-label="启用时间范围" :model-value="modelValue.interval" :disabled="disabled" @update:model-value="update({interval:$event})"/>
 <el-form-item v-if="zoneVisible" label="时区设置"><el-radio-group :model-value="modelValue.zoneKind" :disabled="disabled" class="schedule-zone" aria-label="时区设置" @update:model-value="update({zoneKind:$event as TaskCreateScheduleDraft['zoneKind']})">
  <el-radio value="FOLLOW_PROJECT" border class="zone-card"><span class="zone-title">跟随项目时区</span><span class="zone-detail">{{zoneCaption(projectZone)}}</span></el-radio>
  <el-radio value="CUSTOM" border class="zone-card"><span class="zone-title">自定义时区</span><span class="zone-detail">{{zoneCaption(modelValue.zone)}} <el-button link type="primary" :disabled="disabled" @click.stop.prevent="editZone">编辑</el-button></span></el-radio>
 </el-radio-group></el-form-item>
 <el-dialog :model-value="zoneEditing" title="选择时区" width="500px" :close-on-click-modal="false" @update:model-value="zoneDialog"><el-select v-model="zoneDraft" filterable :disabled="disabled" placeholder="选择时区" aria-label="初始自定义时区" class="zone-dialog-select"><el-option v-for="zone in zones" :key="zone" :value="zone" :label="zone"/></el-select><template #footer><el-button @click="closeZone">取消</el-button><el-button type="primary" :disabled="disabled||!zoneDraft" @click="saveZone">确定</el-button></template></el-dialog>
</section></template>
<style scoped>.schedule-modes{display:flex;flex-wrap:wrap;gap:4px 22px}.schedule-modes :deep(.el-radio){margin-right:0}.schedule-help{width:100%;font-size:12px;line-height:1.6;color:var(--tl-muted);margin:8px 0 0}.schedule-days{width:100%;display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px}.schedule-days :deep(.el-checkbox){margin-right:0}.schedule-times{display:flex;flex-direction:column;align-items:flex-start;gap:8px}.schedule-time-row{display:flex;gap:10px;align-items:center;max-width:100%}.schedule-zone{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;width:100%}.schedule-zone :deep(.zone-card){display:flex;align-items:flex-start;height:66px;width:100%;margin:0;padding:12px 16px;box-sizing:border-box;overflow:visible}.schedule-zone :deep(.el-radio__input){margin-top:2px}.schedule-zone :deep(.el-radio__label){display:flex;flex-direction:column;min-width:0;white-space:normal;line-height:20px}.schedule-zone :deep(.zone-card.is-checked){background:var(--el-color-primary-light-9);border-color:var(--el-color-primary-light-5)}.zone-detail{font-size:12px;color:var(--tl-muted);overflow-wrap:anywhere}.zone-detail :deep(.el-button){height:auto;font-size:12px;padding:0;margin-left:4px}.zone-dialog-select{width:100%}:deep(.el-dialog){max-width:calc(100vw - 32px)}@media(max-width:640px){.schedule-zone{grid-template-columns:1fr}.schedule-zone :deep(.zone-card){min-height:66px;height:auto}}.schedule-time-row :deep(.el-date-editor.el-input){width:200px;max-width:100%}</style>
<style scoped>
.create-schedule-fields :deep(.el-form-item) { margin-bottom: 24px; }
.schedule-modes { column-gap: 30px; }
.schedule-zone :deep(.zone-card.is-checked) { border-color: var(--tl-primary); }
.schedule-zone :deep(.zone-card .el-radio__label) { padding-left: 8px; }
</style>
