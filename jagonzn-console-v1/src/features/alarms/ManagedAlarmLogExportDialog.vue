<script setup lang="ts">
import {computed,onScopeDispose,ref} from 'vue'
import {can,projectId} from '../../core/session'
import {identityEpoch,onIdentityChange} from '../../core/http'
import AlarmLogExportDialog from './AlarmLogExportDialog.vue'
import {alarmLogExportApi,alarmLogExportDisplay,type AlarmLogExportQuery} from './alarm-log-export-api'
import {alarmLogExportBlob,type AlarmLogExportFile} from './alarm-log-export-file'
const props=defineProps<{modelValue:boolean;filters:AlarmLogExportQuery;download?:(file:AlarmLogExportFile)=>Promise<void>|void}>()
const emit=defineEmits<{'update:modelValue':[value:boolean]}>()
const epoch=ref(identityEpoch()),dispose=onIdentityChange(()=>{epoch.value=identityEpoch()});onScopeDispose(dispose)
const scope=computed(()=>JSON.stringify([epoch.value,projectId.value,can('alarm:read'),props.filters.status,props.filters.from,props.filters.before,props.filters.deviceId,props.filters.ruleId]))
async function load(signal:AbortSignal){
 const identity=epoch.value,project=projectId.value,key=scope.value,filters={...props.filters}
 if(!project||!can('alarm:read'))throw new Error('没有读取告警历史的权限')
 const response=await alarmLogExportApi.read(project,filters,signal)
 if(signal.aborted||identity!==epoch.value||key!==scope.value||!can('alarm:read'))throw new DOMException('导出范围已改变','AbortError')
 if(response.items.some(item=>filters.deviceId!==undefined&&item.log.deviceId!==filters.deviceId
  ||filters.ruleId!==undefined&&item.log.ruleId!==filters.ruleId))throw new Error('告警导出返回了当前设备或规则范围外的事件')
 return response.items.map(alarmLogExportDisplay)
}
/** 宿主下载只发生在当前范围的已验证文件就绪后，URL不进入持久状态。 */
function download(file:AlarmLogExportFile){
 if(props.download)return props.download(file)
 const url=URL.createObjectURL(alarmLogExportBlob(file)),link=document.createElement('a')
 // 原站文件名资料不含扩展名，默认浏览器宿主按实际格式补齐，确保下载文件可直接识别。
 link.href=url;link.download=`${file.filename}.${file.mime==='application/csv'?'csv':'xls'}`
 try{document.body.appendChild(link);link.click()}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
}
</script>
<template><AlarmLogExportDialog :model-value="modelValue&&!!projectId&&can('alarm:read')" :scope-key="scope" :load="load" :download="download" @update:model-value="emit('update:modelValue',$event)" /></template>
