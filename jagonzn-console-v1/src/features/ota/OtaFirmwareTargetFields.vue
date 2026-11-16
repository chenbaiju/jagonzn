<script setup lang="ts">
import {computed} from 'vue'
import {can,projectId} from '@/core/session'
import TaskChoiceSelect from '../rules/TaskChoiceSelect.vue'
import {otaTargetDeviceChoices,type OtaTargetDraft,type OtaTargetDeviceLoader} from './ota-target-conditions-api'
const props=withDefaults(defineProps<{modelValue:OtaTargetDraft;deviceTypeId:string;disabled?:boolean;loader?:OtaTargetDeviceLoader}>(),{loader:otaTargetDeviceChoices})
const emit=defineEmits<{'update:modelValue':[value:OtaTargetDraft]}>()
const deviceReadable=computed(()=>can('device:read'))
const load=computed(()=>{const project=projectId.value,type=props.deviceTypeId,loader=props.loader;return (cursor:string|undefined,signal:AbortSignal)=>loader(project,type,cursor,signal)})
function devicesEnabled(value:unknown){if(props.disabled||!props.deviceTypeId||value===true&&!deviceReadable.value)return;emit('update:modelValue',{...props.modelValue,deviceIds:value===true?[]:null})}
function selected(value:string[]){if(props.disabled||!deviceReadable.value)return;emit('update:modelValue',{...props.modelValue,deviceIds:[...value]})}
function sourceEnabled(value:unknown){if(props.disabled)return;emit('update:modelValue',{...props.modelValue,sourceFirmwareVersion:value===true?'':null})}
function source(value:string){if(props.disabled)return;emit('update:modelValue',{...props.modelValue,sourceFirmwareVersion:value})}
</script>
<template><div class="ota-target-fields"><el-form-item label="是否指定待升级设备"><el-switch :model-value="modelValue.deviceIds!==null" :disabled="disabled||!deviceTypeId||!deviceReadable&&modelValue.deviceIds===null" aria-label="指定待升级设备" @update:model-value="devicesEnabled"/><div v-if="modelValue.deviceIds!==null" class="target-input"><TaskChoiceSelect v-if="deviceReadable&&deviceTypeId" :key="`${projectId}:${deviceTypeId}`" :model-value="modelValue.deviceIds" :loader="load" :maximum="1000" :disabled="disabled" @update:model-value="selected"/><p v-else class="help">已指定 {{modelValue.deviceIds.length}} 台设备；当前没有设备读取权限，保留原选择。</p><p class="help">仅选择所属设备类型的设备，最多1000台。关闭时适用于该类型全部设备。</p></div></el-form-item><el-form-item label="是否指定待升级版本"><el-switch :model-value="modelValue.sourceFirmwareVersion!==null" :disabled="disabled" aria-label="指定待升级版本" @update:model-value="sourceEnabled"/><div v-if="modelValue.sourceFirmwareVersion!==null" class="target-input"><el-input :model-value="modelValue.sourceFirmwareVersion" :disabled="disabled" aria-label="待升级设备当前版本号" placeholder="请输入设备当前版本号" maxlength="256" @update:model-value="source"/><p class="help">与设备当前上报的版本号精确匹配，保留原文，最多128个字符。例如1.2与1.2.0分别匹配。</p></div></el-form-item></div></template>
<style scoped>.target-input{width:100%;margin-top:10px}.help{font-size:12px;line-height:20px;color:var(--tl-muted);overflow-wrap:anywhere}</style>
