<script setup lang="ts">
import {ref,watch} from 'vue'
import DeviceAlarmHistory from '../alarms/DeviceAlarmHistory.vue'
import DeviceLearningResource from './DeviceLearningResource.vue'
import DeviceAlarmRules from './DeviceAlarmRules.vue'
const props=defineProps<{deviceId:string;createAlarmRequest?:string}>()
const emit=defineEmits<{cleared:[project:string,device:string]}>()
const mode=ref('history')
watch(()=>props.createAlarmRequest,key=>{if(key)mode.value='rules'},{immediate:true})
</script>
<template><section><DeviceLearningResource kind="alarm"/><DeviceAlarmHistory :device-id="deviceId" :visible="mode==='history'"><template #leading><el-radio-group v-model="mode" aria-label="设备告警视图"><el-radio-button value="history">告警历史</el-radio-button><el-radio-button value="rules">告警规则</el-radio-button></el-radio-group></template></DeviceAlarmHistory><DeviceAlarmRules :device-id="deviceId" :visible="mode==='rules'" :create-request-key="createAlarmRequest" :create-property-key="createAlarmRequest" @cleared="(project,device)=>emit('cleared',project,device)"><template #leading><el-radio-group v-model="mode" aria-label="设备告警视图"><el-radio-button value="history">告警历史</el-radio-button><el-radio-button value="rules">告警规则</el-radio-button></el-radio-group></template></DeviceAlarmRules></section></template>
