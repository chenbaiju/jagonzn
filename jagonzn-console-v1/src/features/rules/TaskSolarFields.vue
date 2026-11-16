<script setup lang="ts">
import { computed,ref,watch,onScopeDispose } from 'vue'
import {projectId} from '@/core/session'
import {onIdentityChange,identityEpoch} from '@/core/http'
import DirectoryAmapFrame from '../devices/DirectoryAmapFrame.vue'
import type {PickerPoint} from '../devices/directory-amap-protocol'
import { solarBeforeMinutes,solarOffsetLabel,solarPositionInput,solarLocationName,type SolarFieldsDraft } from './task-solar-fields'
const props=defineProps<{modelValue:SolarFieldsDraft;disabled?:boolean;positionEditable?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:SolarFieldsDraft]}>()
const event=computed({get:()=>props.modelValue.event,set:value=>{if(!props.disabled)emit('update:modelValue',{...props.modelValue,event:value})}})
const before=computed({get:()=>props.modelValue.beforeMinutes,set:value=>{if(!props.disabled)emit('update:modelValue',{...props.modelValue,beforeMinutes:value})}})
const editing=ref(false),latitude=ref(''),longitude=ref(''),name=ref(''),nameTouched=ref(false),error=ref(''),mapError=ref(''),mapBusy=ref(false),initialPoint=ref<PickerPoint|null>(null),map=ref<InstanceType<typeof DirectoryAmapFrame>>()
const generation=ref(0);let hadName=false
const mapScope=computed(()=>`${identityEpoch()}:${projectId.value}:solar-location:${generation.value}`)
function close(){generation.value++;editing.value=false;latitude.value='';longitude.value='';name.value='';nameTouched.value=false;error.value='';mapError.value='';mapBusy.value=false;initialPoint.value=null;map.value?.cancelPicker()}
function dialogUpdate(value:boolean){if(!value)close()}
function open(){if(props.disabled||!props.positionEditable)return;generation.value++;latitude.value=props.modelValue.position?String(props.modelValue.position.latitude):'';longitude.value=props.modelValue.position?String(props.modelValue.position.longitude):'';hadName=props.modelValue.locationName!=null;name.value=solarLocationName(props.modelValue.locationName)??'';nameTouched.value=false;error.value='';mapError.value='';initialPoint.value=props.modelValue.position?{...props.modelValue.position}:null;editing.value=true}
function changed(touchName=false){if(touchName)nameTouched.value=true;error.value='';mapError.value='';map.value?.cancelPicker()}
function locateName(){if(props.disabled||!editing.value||!nameTouched.value||!name.value)return;try{solarLocationName(name.value);map.value?.queryPicker({kind:'name',name:name.value})}catch(cause){error.value=cause instanceof Error?cause.message:'地点名称无效'}}
function locateCoordinates(){if(props.disabled||!editing.value)return;try{const point=solarPositionInput(latitude.value,longitude.value);map.value?.queryPicker({kind:'coordinates',point})}catch(cause){error.value=cause instanceof Error?cause.message:'地点坐标无效'}}
function picked(point:PickerPoint,locationName:string){if(props.disabled||!editing.value)return;latitude.value=String(point.latitude);longitude.value=String(point.longitude);initialPoint.value=point;name.value=locationName;nameTouched.value=true;error.value=''}
function confirm(){if(props.disabled||!props.positionEditable){close();return}map.value?.cancelPicker();try{const position=solarPositionInput(latitude.value,longitude.value),locationName=hadName||nameTouched.value?solarLocationName(name.value):undefined;const value={...props.modelValue,position};delete value.locationName;if(locationName!==undefined)value.locationName=locationName;emit('update:modelValue',value);close()}catch(cause){error.value=cause instanceof Error?cause.message:'地点坐标无效'}}
watch(()=>[props.disabled,props.positionEditable] as const,([disabled,editable])=>{if(disabled||!editable)close()})
watch(()=>props.modelValue,()=>{if(editing.value)close()})
watch(projectId,close)
const release=onIdentityChange(close);onScopeDispose(release)
</script>
<template>
  <el-form-item label="运行时间"><div class="task-solar-time">
    <el-radio-group v-model="event" :disabled="disabled" aria-label="太阳事件"><el-radio-button value="SUNRISE">日出</el-radio-button><el-radio-button value="SUNSET">日落</el-radio-button></el-radio-group>
    <el-select v-model="before" :disabled="disabled" aria-label="前后偏移"><el-option v-for="minutes in solarBeforeMinutes" :key="minutes" :label="solarOffsetLabel(minutes)" :value="minutes" /></el-select>
  </div></el-form-item>
  <el-form-item label="地点位置"><div class="task-solar-location">
    <template v-if="modelValue.position"><span v-if="modelValue.locationName">{{modelValue.locationName}}</span><span v-else>纬度 {{modelValue.position.latitude}}，经度 {{modelValue.position.longitude}}</span></template><span v-else>设置日出日落的地点位置，系统会自动计算不同地点的日出日落时间。</span>
    <el-button link type="primary" :disabled="disabled||!positionEditable" @click="open">编辑地点位置</el-button>
  </div></el-form-item>
  <el-dialog :model-value="editing" title="编辑地点位置" width="800px" :lock-scroll="false" :close-on-click-modal="false" append-to-body @update:model-value="dialogUpdate">
    <el-form label-position="top" @submit.prevent><div class="task-solar-location-columns">
      <el-form-item label="地点名称"><el-input v-model="name" size="small" aria-label="太阳地点名称" :disabled="disabled" @input="changed(true)" @blur="locateName"/></el-form-item>
      <el-form-item label="纬度"><el-input v-model="latitude" size="small" aria-label="太阳地点纬度" :disabled="disabled" @input="changed()" @blur="locateCoordinates"/></el-form-item>
      <el-form-item label="经度"><el-input v-model="longitude" size="small" aria-label="太阳地点经度" :disabled="disabled" @input="changed()" @blur="locateCoordinates"/></el-form-item>
    </div></el-form>
    <div class="task-solar-location-map"><DirectoryAmapFrame v-if="editing&&projectId" ref="map" :project-id="projectId" :scope-key="mapScope" :rows="[]" selected="" base-map="vector" :picker="initialPoint" :disabled="disabled" @point="picked" @picker-busy="mapBusy=$event" @error="mapError=$event"/></div>
    <p v-if="error||mapError" role="alert">{{error||mapError}}</p>
    <template #footer><el-button @click="close">取消</el-button><el-button type="primary" :disabled="disabled" @click="confirm">保存</el-button></template>
  </el-dialog>
</template>
<style scoped>
.task-solar-time,.task-solar-location{display:flex;flex-wrap:wrap;align-items:center;gap:10px;width:100%}.task-solar-time :deep(.el-select){width:180px;max-width:100%}.task-solar-location-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.task-solar-location-map{width:100%;height:460px}.task-solar-location-columns :deep(.el-input){width:100%}
:deep(.el-dialog){max-width:calc(100vw - 32px)}
</style>
