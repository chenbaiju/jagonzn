<script setup lang="ts">
import {computed,ref,watch} from 'vue'
import {Calendar} from '@element-plus/icons-vue'
import {ElConfigProvider,ElDatePickerPanel} from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import {formatTime} from '@/core/time'
const props=withDefaults(defineProps<{modelValue?:string;disabled?:boolean;placeholder:string;size?:'small'|'default'|'large';clearable?:boolean}>(),{clearable:true})
const emit=defineEmits<{'update:modelValue':[string|undefined];change:[]}>()
const visible=ref(false)
const popperOptions={strategy:"fixed" as const,modifiers:[{name:"preventOverflow",enabled:true,options:{mainAxis:true,altAxis:true,padding:16,tether:false}},{name:"flip",enabled:true,options:{fallbackPlacements:["top-start","bottom-start"]}}]}
// 日期面板只选日历日期，时分秒保留民用文本；不能让浏览器DST把东八区02:30改成03:30。
const day=computed(()=>/^([0-9]{4}-[0-9]{2}-[0-9]{2})/.exec(props.modelValue||'')?.[1]||formatTime(new Date()).slice(0,10))
const clock=computed(()=>props.modelValue?.includes(' ')?props.modelValue.slice(11):'00:00:00')
const calendarDefault=computed(()=>{const date=new Date(0);date.setFullYear(Number(day.value.slice(0,4)),Number(day.value.slice(5,7))-1,Number(day.value.slice(8,10)));date.setHours(12,0,0,0);return date})
function setText(value:string){emit('update:modelValue',value||undefined)}
function setDay(value:unknown){if(typeof value==='string'&&/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))emit('update:modelValue',`${value} ${clock.value}`)}
function setClock(value:string){emit('update:modelValue',`${day.value} ${/^[0-9]{2}:[0-9]{2}$/.test(value)?value+':00':value}`)}
function commit(){visible.value=false;emit('change')}
function now(){emit('update:modelValue',formatTime(new Date()));commit()}
watch(()=>props.disabled,value=>{if(value)visible.value=false})
</script>
<template>
<ElConfigProvider :locale="zhCn">
<el-popover v-model:visible="visible" trigger="click" placement="bottom-start" :width="322"  :popper-options="popperOptions" :disabled="disabled" popper-class="history-east-eight-picker">
<template #reference><el-input class="history-civil-input" :model-value="modelValue" :size="size" :disabled="disabled" :placeholder="placeholder" :aria-label="placeholder" :clearable="clearable" @update:model-value="setText" @change="emit('change')" @keydown.enter.stop.prevent="commit" @keydown.esc="visible=false"><template #prefix><el-icon><Calendar/></el-icon></template></el-input></template>
<div class="history-east-eight-picker__zone">东八区 · UTC+08:00</div>
<ElDatePickerPanel :model-value="day" type="date" value-format="YYYY-MM-DD" :default-value="calendarDefault" :show-footer="false" :border="false" @update:model-value="setDay"/>
<div class="history-east-eight-picker__clock"><label>时间</label><el-input type="time" step="1" :model-value="clock" aria-label="东八区时分秒" @update:model-value="setClock"/></div>
<div class="history-east-eight-picker__footer"><el-button text @click="now">此刻</el-button><el-button size="small" type="primary" @click="commit">确定时间</el-button></div>
</el-popover>
</ElConfigProvider>
</template>
<style>
.history-civil-input{width:100%;max-width:280px;}.history-east-eight-picker{max-width:calc(100vw - 32px);max-height:calc(100dvh - 32px);overflow-y:auto;padding:0!important;}.history-east-eight-picker .el-picker-panel{width:100%;box-sizing:border-box;box-shadow:none;}.history-east-eight-picker .el-date-picker__header{margin:12px;}.history-east-eight-picker .el-picker-panel__content{width:auto;margin:12px;}.history-east-eight-picker__zone{padding:10px 12px;color:var(--tl-muted);border-bottom:1px solid var(--tl-border);font-size:12px;}.history-east-eight-picker__clock{display:flex;align-items:center;gap:12px;padding:0 12px 12px;}.history-east-eight-picker__clock .el-input{flex:1;min-width:0;}.history-east-eight-picker__footer{display:flex;justify-content:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--tl-border);}
</style>
