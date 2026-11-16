<script setup lang="ts">
import { computed, watch } from 'vue'
import { projectId } from '@/core/session'
import { useResource } from '@/core/use-resource'
import { selectedTaskChoices, type TaskChoiceKind } from './task-choices'
import type { Task } from './models'
const props=defineProps<{ task:Task }>()
const kind=computed<TaskChoiceKind|undefined>(()=>props.task.targetType==='EXPLICIT_DEVICES'?'devices':props.task.targetType==='DEVICE_TYPE'?'device-types':props.task.targetType==='DEVICE_GROUP' || props.task.targetType==='DEVICE_GROUPS'?'device-groups':undefined)
const ids=computed(()=>props.task.targetType==='EXPLICIT_DEVICES'?props.task.targetDeviceIds || []:props.task.targetType==='DEVICE_TYPE'?(props.task.targetDeviceTypeId?[props.task.targetDeviceTypeId]:[]):props.task.targetType==='DEVICE_GROUP'?(props.task.targetGroupId?[props.task.targetGroupId]:[]):props.task.targetType==='DEVICE_GROUPS'?props.task.targetGroupIds || []:[])
const resource=useResource(signal=>selectedTaskChoices(projectId.value,kind.value!,ids.value,signal))
watch([projectId,()=>props.task],()=>{resource.clear();if(projectId.value && kind.value && ids.value.length)void resource.reload()},{immediate:true})
const items=computed(()=>{const names=new Map(resource.data.value?.map(item=>[item.id,item.label]));return ids.value.slice(0,20).map(id=>({id,label:names.get(id) || id}))})
</script>
<template><div class="task-target-summary"><span v-if="task.targetType==='ALL_DEVICES'">所有设备</span><span v-else-if="!items.length">—</span><template v-for="item in items" :key="item.id"><router-link v-if="kind==='devices'" :to="`/devices/${item.id}`" class="task-target-chip">{{ item.label }}</router-link><span v-else class="task-target-chip">{{ item.label }}</span></template><span v-if="ids.length>20" class="tl-muted">另外 {{ ids.length-20 }} 项</span><span v-if="resource.error.value" class="tl-muted">部分目标名称未能读取</span></div></template>
<style scoped>.task-target-summary{display:flex;flex-wrap:wrap;gap:6px;min-width:0;max-width:100%;}.task-target-chip{padding:2px 7px;background:var(--tl-fill);border-radius:3px;overflow-wrap:anywhere;max-width:100%;font-size:12px;color:var(--el-color-primary);}</style>
