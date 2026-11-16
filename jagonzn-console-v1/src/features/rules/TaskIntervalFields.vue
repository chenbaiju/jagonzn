<script setup lang="ts">
import type { IntervalFieldsDraft,IntervalRange } from './task-interval-fields'
const props=defineProps<{modelValue:IntervalFieldsDraft;disabled?:boolean;unitRadio?:boolean;rangeLabel?:string}>()
const emit=defineEmits<{'update:modelValue':[value:IntervalFieldsDraft]}>()
function update(patch:Partial<IntervalFieldsDraft>){if(!props.disabled)emit('update:modelValue',{...props.modelValue,...patch,ranges:patch.ranges||props.modelValue.ranges.map(r=>({...r}))})}
function range(index:number,key:keyof IntervalRange,value:string|null){update({ranges:props.modelValue.ranges.map((r,i)=>i===index?{...r,[key]:value||''}:{...r})})}
function add(){if(!props.disabled&&props.modelValue.ranges.length<24)update({ranges:[...props.modelValue.ranges.map(r=>({...r})),{start:'',end:''}]})}
function remove(index:number){update({ranges:props.modelValue.ranges.filter((_,i)=>i!==index).map(r=>({...r}))})}
</script>
<template>
  <el-form-item v-if="unitRadio" label="时间单位"><el-radio-group :model-value="modelValue.unit" :disabled="disabled" aria-label="间隔时间单位" @update:model-value="update({unit:$event as IntervalFieldsDraft['unit']})"><el-radio value="MINUTES">分钟</el-radio><el-radio value="HOURS">小时</el-radio></el-radio-group></el-form-item>
  <el-form-item label="间隔时间"><div class="task-interval-amount"><el-input :model-value="modelValue.amount" :disabled="disabled" inputmode="decimal" aria-label="间隔时间值" @update:model-value="update({amount:$event})" /><el-select v-if="!unitRadio" :model-value="modelValue.unit" :disabled="disabled" aria-label="间隔单位" @update:model-value="update({unit:$event})"><el-option value="MINUTES" label="分钟" /><el-option value="HOURS" label="小时" /></el-select></div><p class="task-interval-help">最小间隔为 5 分钟。</p></el-form-item>
  <el-form-item :label="rangeLabel||'设置时间范围'"><el-switch :model-value="modelValue.rangeEnabled" :disabled="disabled" :aria-label="rangeLabel||'设置时间范围'" @update:model-value="update({rangeEnabled:!!$event})" /></el-form-item>
  <div v-if="modelValue.rangeEnabled" class="task-interval-ranges"><div v-for="(item,index) in modelValue.ranges" :key="index" class="task-interval-range"><el-time-picker :model-value="item.start" format="HH:mm" value-format="HH:mm" placeholder="开始时间" :disabled="disabled" :aria-label="`开始时间 ${index+1}`" @update:model-value="range(index,'start',$event)" /><span class="task-interval-divider">至</span><el-time-picker :model-value="item.end" format="HH:mm" value-format="HH:mm" placeholder="结束时间" :disabled="disabled" :aria-label="`结束时间 ${index+1}`" @update:model-value="range(index,'end',$event)" /><el-button link type="primary" :disabled="disabled" :aria-label="`移除时间范围 ${index+1}`" @click="remove(index)">移除</el-button></div><el-button link type="primary" :disabled="disabled||modelValue.ranges.length>=24" @click="add">添加时间范围</el-button><p class="task-interval-help">结束早于开始表示跨夜；范围包含开始、不包含结束，不能重叠。</p></div>
</template>
<style scoped>
.task-interval-amount{display:flex;gap:10px;flex-wrap:wrap;width:100%}.task-interval-amount>.el-input{width:150px}.task-interval-amount>.el-select{width:100px}.task-interval-help{width:100%;color:var(--tl-muted);font-size:12px;line-height:1.6;margin:8px 0 0}.task-interval-ranges{margin:0 0 18px}.task-interval-range{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:10px}.task-interval-range :deep(.el-date-editor.el-input){width:150px;max-width:100%}.task-interval-divider{color:var(--tl-muted)}
</style>
