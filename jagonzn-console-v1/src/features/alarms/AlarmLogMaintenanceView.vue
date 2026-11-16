<script setup lang="ts">
import {watch} from 'vue'
import {can,projectId} from '../../core/session'
import {useResource} from '../../core/use-resource'
import AsyncState from '../../ui/AsyncState.vue'
import {alarmLogMaintenanceApi} from './alarm-log-maintenance-api'
import AlarmLogMaintenanceFields from './AlarmLogMaintenanceFields.vue'
const props=defineProps<{logId:string;detail?:boolean;normal?:boolean;canEdit?:boolean}>()
defineEmits<{edit:[]}>()
const resource=useResource(signal=>alarmLogMaintenanceApi.read(projectId.value,props.logId,signal))
async function read(){resource.clear();if(projectId.value&&props.logId&&can('alarm:read'))await resource.reload()}
watch([projectId,()=>props.logId,()=>can('alarm:read')],()=>void read(),{immediate:true})
watch(resource.error,value=>{if(value)resource.data.value=undefined})
</script>
<template><AsyncState :loading="resource.loading.value" :error="resource.error.value" @retry="read"><AlarmLogMaintenanceFields :content="resource.data.value??null" :detail="detail" :normal="normal" :can-edit="canEdit&&!!resource.data.value" @edit="$emit('edit')" /></AsyncState></template>
