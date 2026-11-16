<script setup lang="ts">
import SectionPanel from '@/ui/SectionPanel.vue'
import {type TaskAppVisibility,type TaskAppVisibilityKey} from './task-app-visibility-api'
const props=defineProps<{value?:TaskAppVisibility;disabled?:boolean;loading?:boolean;error?:string}>()
const emit=defineEmits<{change:[key:TaskAppVisibilityKey,value:boolean];retry:[]}>()
const surfaces=[
 {key:'projectDeviceDetails',label:'ThingsAdmin',product:'项目应用',location:'设备详情页',docs:'/guide/project-app/common-saas.html'},
 {key:'userSettings',label:'ThingsX',product:'用户应用',location:'设备设置页面',docs:'/guide/customer-app/common-app.html'},
 {key:'userDetails',label:'ThingsXS',product:'用户应用',location:'设备详情页',docs:'/guide/customer-app/common-saas.html'},
] as const
function change(key:TaskAppVisibilityKey,value:unknown){if(!props.disabled&&!props.loading&&props.value&&typeof value==='boolean')emit('change',key,value)}
</script>
<template><SectionPanel title="应用可见性" class="task-app-visibility">
 <div v-for="surface in surfaces" :key="surface.key" class="app-visibility-item"><span class="app-visibility-title">{{surface.label}}</span><span class="app-visibility-tips">在{{surface.product}} <a :href="`https://www.thingscloud.xyz/docs${surface.docs}`" target="_blank" rel="noopener noreferrer">{{surface.label}} ↗</a> 的{{surface.location}}中显示该任务。</span><div class="app-visibility-action"><el-switch v-if="value" :model-value="value[surface.key]" :aria-label="`${surface.label}应用可见性`" :disabled="disabled||loading" @change="change(surface.key,$event)"/><el-skeleton v-else-if="loading" :rows="1" animated/></div></div>
 <el-alert v-if="error" :title="error" type="warning" :closable="false"><el-button :disabled="loading" @click="emit('retry')">重新读取应用可见性</el-button></el-alert>
</SectionPanel></template>
<style scoped>.task-app-visibility{transition:box-shadow .3s}.task-app-visibility:hover{box-shadow:0 2px 12px 0 rgba(0,0,0,.1)}.task-app-visibility :deep(.tl-section-panel__header){padding:12px 20px;min-height:52px;background:#fff}.task-app-visibility :deep(.tl-section-panel__header h2){font-size:15px;line-height:28px;font-weight:600;color:#2f354d}.task-app-visibility :deep(.tl-section-panel__body){padding:20px}.app-visibility-item{padding:0 0 20px}.app-visibility-title{display:block;font-size:14px;line-height:18px;color:#606266;font-weight:600}.app-visibility-tips{display:block;margin:3px 0 0;font-size:13px;line-height:18px;color:#909399}.app-visibility-tips a{color:#1e88e5;text-decoration:none}.app-visibility-tips a:hover{text-decoration:underline}.app-visibility-action{margin:7px 0 0;font-size:15px;line-height:20px;color:#002822}</style>
