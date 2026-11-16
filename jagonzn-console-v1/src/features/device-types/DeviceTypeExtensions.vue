<script setup lang="ts">
import {computed,onScopeDispose,reactive,watch} from 'vue'
import DeviceExtensionDefinitions from '../devices/DeviceExtensionDefinitions.vue'
import DeviceTypeLocationPolicy from './DeviceTypeLocationPolicy.vue'
import DeviceTypePlanarPolicy from './DeviceTypePlanarPolicy.vue'
import DeviceTypeCameraPolicy from './DeviceTypeCameraPolicy.vue'
import DeviceTypeIccidPolicy from './DeviceTypeIccidPolicy.vue'
const props=withDefaults(defineProps<{typeId:string;typeStatus?:string;disabled?:boolean}>(),{disabled:false})
const emit=defineEmits<{locked:[value:boolean];changed:[]}>()
const rows=[{id:'location',name:'地理坐标',kind:'位置'},{id:'planar',name:'平面坐标',kind:'平面坐标'},{id:'camera',name:'萤石摄像头',kind:'文字'},{id:'iccid',name:'物联卡ICCID',kind:'文本'}] as const
const locks=reactive<Record<string,boolean>>({definitions:false,location:false,planar:false,camera:false,iccid:false})
const locked=computed(()=>Object.values(locks).some(Boolean))
function disabledExcept(id:string){return props.disabled||Object.entries(locks).some(([key,value])=>key!==id&&value)}
watch(locked,value=>emit('locked',value),{immediate:true,flush:'sync'})
onScopeDispose(()=>emit('locked',false))
</script>
<template>
 <DeviceExtensionDefinitions :device-type-id="typeId" :special-rows="rows" :disabled="disabledExcept('definitions')" @locked="locks.definitions=$event" @changed="emit('changed')">
  <template #special-enabled="{row}">
   <DeviceTypeLocationPolicy v-if="row.id==='location'" compact :type-id="typeId" :type-status="typeStatus" :disabled="disabledExcept('location')" @locked="locks.location=$event" @changed="emit('changed')"/>
   <DeviceTypePlanarPolicy v-else-if="row.id==='planar'" compact :type-id="typeId" :disabled="disabledExcept('planar')" @locked="locks.planar=$event" @changed="emit('changed')"/>
   <DeviceTypeCameraPolicy v-else-if="row.id==='camera'" compact :type-id="typeId" :disabled="disabledExcept('camera')" @locked="locks.camera=$event" @changed="emit('changed')"/>
   <DeviceTypeIccidPolicy v-else-if="row.id==='iccid'" compact :type-id="typeId" :type-status="typeStatus" :disabled="disabledExcept('iccid')" @locked="locks.iccid=$event" @changed="emit('changed')"/>
  </template>
 </DeviceExtensionDefinitions>
</template>
