<script setup lang="ts">
import {computed,onMounted,onScopeDispose,watch} from 'vue'
import {alarmRuleTimeSlots} from './alarm-rule-time-slots'
const props=defineProps<{modelValue:readonly number[];disabled?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:number[]]}>()
const selected=computed(()=>new Set(alarmRuleTimeSlots(props.modelValue)))
let dragging=false,paint=false
const stop=()=>{dragging=false}
function apply(indexes:number[],value:boolean){if(props.disabled)return;const result=new Set(selected.value);for(const index of indexes)value?result.add(index):result.delete(index);const next=[...result].sort((a,b)=>a-b);if(next.join(',')!==[...selected.value].join(','))emit('update:modelValue',next)}
function start(event:PointerEvent,indexes:number[]){if(props.disabled||event.button!==0)return;event.preventDefault();paint=!indexes.every(index=>selected.value.has(index));dragging=true;apply(indexes,paint)}
function drag(event:PointerEvent,indexes:number[]){if(!event.buttons){stop();return}if(dragging)apply(indexes,paint)}
function keyboard(event:MouseEvent,indexes:number[]){if(event.detail===0)apply(indexes,!indexes.every(index=>selected.value.has(index)))}
watch(()=>props.disabled,value=>{if(value)stop()},{flush:'sync'})
onMounted(()=>{window.addEventListener('pointerup',stop);window.addEventListener('pointercancel',stop);window.addEventListener('blur',stop)})
onScopeDispose(()=>{stop();window.removeEventListener('pointerup',stop);window.removeEventListener('pointercancel',stop);window.removeEventListener('blur',stop)})
</script>
<template>
 <div class="time-slot-scroll" role="group" aria-label="选择有效时间段">
  <div class="time-span-selector"><div class="time-slot-hours">
   <div v-for="hour in 24" :key="hour" class="time-hour">
    <button type="button" class="hour-label" :disabled="disabled" :aria-label="`${String(hour-1).padStart(2,'0')}时，选择或取消整小时`" :aria-pressed="selected.has((hour-1)*2)&&selected.has((hour-1)*2+1)" @pointerdown="start($event,[(hour-1)*2,(hour-1)*2+1])" @pointerenter="drag($event,[(hour-1)*2,(hour-1)*2+1])" @click="keyboard($event,[(hour-1)*2,(hour-1)*2+1])">{{String(hour-1).padStart(2,'0')}}</button>
    <button v-for="half in [0,1]" :key="half" type="button" class="time-slot" :class="{selected:selected.has((hour-1)*2+half)}" :disabled="disabled" :data-slot="(hour-1)*2+half" :aria-label="`${String(hour-1).padStart(2,'0')}:${half?'30':'00'} 至 ${half?(hour===24?'24:00':String(hour).padStart(2,'0')+':00'):String(hour-1).padStart(2,'0')+':30'}`" :aria-pressed="selected.has((hour-1)*2+half)" @pointerdown="start($event,[(hour-1)*2+half])" @pointerenter="drag($event,[(hour-1)*2+half])" @click="keyboard($event,[(hour-1)*2+half])" />
   </div>
  </div></div>
 </div>
</template>
<style scoped>
.time-slot-scroll{max-width:100%;overflow-x:auto;padding-bottom:4px}.time-span-selector{display:flex;user-select:none}.time-slot-hours{display:flex;justify-content:center}.time-hour{flex:1 1 0%;margin-right:4px}.hour-label,.time-slot{display:block;width:100%;padding:0;border:0;border-radius:2px;cursor:pointer}.hour-label{height:24px;background:transparent;color:var(--tl-text);font:inherit;font-size:12px;line-height:24px;text-align:center}.time-slot{height:16px;background:#e5e7eb}.time-slot+.time-slot{margin-top:4px}.time-slot.selected{background:#60a5fa}.hour-label:focus-visible,.time-slot:focus-visible{outline:2px solid var(--tl-primary);outline-offset:1px}.hour-label:disabled,.time-slot:disabled{cursor:not-allowed;opacity:.65}
</style>
