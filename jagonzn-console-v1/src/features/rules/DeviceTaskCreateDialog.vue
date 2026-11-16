<script setup lang="ts">
import {ref} from 'vue'
import DeviceTaskCreateForm from './DeviceTaskCreateForm.vue'
import type {DeviceTaskDefinitionPort} from './device-task-definition-port'
defineProps<{deviceId:string;deviceName?:string;transport:DeviceTaskDefinitionPort}>()
const emit=defineEmits<{close:[];created:[id:string];busy:[value:boolean]}>()
const busy=ref(false),locked=ref(false),form=ref<InstanceType<typeof DeviceTaskCreateForm>>()
function activity(value:boolean){busy.value=value;emit('busy',value)}
</script>
<template><el-dialog :model-value="true" title="创建任务" width="500px" top="6vh" class="device-task-create-dialog" :close-on-click-modal="!busy&&!locked" :close-on-press-escape="!busy&&!locked" :show-close="!busy&&!locked" @close="form?.requestClose()"><DeviceTaskCreateForm ref="form" :device-id="deviceId" :device-name="deviceName" :transport="transport" @close="emit('close')" @invalidated="emit('close')" @created="emit('created',$event)" @busy="activity" @locked="locked=$event"/></el-dialog></template>
<style>
.device-task-create-dialog{max-width:calc(100vw - 32px)}.device-task-create-dialog .el-dialog__body{max-height:calc(88dvh - 140px);overflow:auto}
</style>
