<script setup lang="ts">
import {ref} from 'vue'
import DeviceRuleCreateForm from './DeviceRuleCreateForm.vue'
import type {DeviceRuleDefinitionPort} from './device-rule-definition-port'
defineProps<{deviceId:string;deviceName?:string;transport:DeviceRuleDefinitionPort}>()
const emit=defineEmits<{close:[];created:[id:string];busy:[value:boolean]}>()
const busy=ref(false),locked=ref(false),form=ref<InstanceType<typeof DeviceRuleCreateForm>>()
function activity(value:boolean){busy.value=value;emit('busy',value)}
</script>
<template><el-dialog :model-value="true" title="创建设备规则" width="600px" top="6vh" class="device-rule-create-dialog" :close-on-click-modal="!busy&&!locked" :close-on-press-escape="!busy&&!locked" :show-close="!busy&&!locked" @close="form?.requestClose()"><DeviceRuleCreateForm ref="form" :device-id="deviceId" :device-name="deviceName" :transport="transport" @close="emit('close')" @created="emit('created',$event)" @busy="activity" @locked="locked=$event"/></el-dialog></template>
<style>
.device-rule-create-dialog{max-width:calc(100vw - 32px)}.device-rule-create-dialog .el-dialog__body{max-height:calc(88dvh - 140px);overflow:auto}
</style>
