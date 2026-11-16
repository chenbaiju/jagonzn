<script setup lang="ts">
import {watch} from 'vue'
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {projectId} from '@/core/session'
import {THINGSLINK_EXTRAS_VISIBLE} from '@/core/replica-scope'
import {useResource} from '@/core/use-resource'
import {formatTime} from '@/core/time'
import {api} from '@/core/http'
import type {Schema} from '@/core/contracts'
import {devicePath} from './api'
import DeviceProperties from './DeviceProperties.vue'
import DeviceActivityOverview from './DeviceActivityOverview.vue'
import DeviceUsageOverview from './DeviceUsageOverview.vue'
import SectionPanel from '@/ui/SectionPanel.vue'
import AsyncState from '@/ui/AsyncState.vue'
const props=defineProps<{deviceId:string;notConnected?:boolean}>()
const emit=defineEmits<{busy:[value:boolean];'create-alarm':[propertyKey:string]}>()
const resource=useResource(signal=>api<Schema<'DeviceAccessDiagnosticsResponse'>>(`${devicePath(projectId.value,props.deviceId)}/access-diagnostics`,{signal}))
watch(()=>[props.deviceId,projectId.value],()=>{resource.clear();if(THINGSLINK_EXTRAS_VISIBLE&&projectId.value)void resource.reload()},{immediate:true})
const connectionGuides=[
 {label:'MQTT 或 TCP 接入',href:'https://www.thingscloud.xyz/docs/tutorials/#%E8%AE%BE%E5%A4%87%E6%8E%A5%E5%85%A5%E8%B0%83%E8%AF%95%E5%BF%AB%E9%80%9F%E4%B8%8A%E6%89%8B'},
 {label:'DTU 或 RTU 接入',href:'https://www.thingscloud.xyz/docs/tutorials/#dtu-rtu-%E7%BD%91%E5%85%B3%E6%8E%A5%E5%85%A5%E6%95%99%E7%A8%8B'},
 {label:'4G / NB-IoT 模组接入',href:'https://www.thingscloud.xyz/docs/tutorials/#_4g-%E8%AE%BE%E5%A4%87%E6%8E%A5%E5%85%A5%E7%A4%BA%E4%BE%8B'},
 {label:'WiFi 模组接入',href:'https://www.thingscloud.xyz/docs/tutorials/#wifi-%E8%AE%BE%E5%A4%87%E6%8E%A5%E5%85%A5%E7%A4%BA%E4%BE%8B'},
 {label:'更多设备接入指南',href:'https://www.thingscloud.xyz/docs/guide/connect-device/'},
 {label:'看看哪些设备正在接入？',href:'https://www.thingscloud.xyz/devices/'}
]
</script>
<template><div v-if="notConnected" class="device-connect-guide" role="note" aria-label="设备接入教程"><ReferenceIcon glyph="󰘥"/><div><p>设备尚未连接或上报数据到 ThingsLink。请参考教程：</p><ul><li v-for="guide in connectionGuides" :key="guide.href"><a :href="guide.href" target="_blank" rel="noopener noreferrer"><strong>{{guide.label}}</strong><ReferenceIcon glyph="󰏌"/></a></li></ul></div></div><DeviceProperties :device-id="deviceId" presentation="cards" @busy="emit('busy',$event)" @create-alarm="emit('create-alarm',$event)" /><DeviceActivityOverview :device-id="deviceId"/><DeviceUsageOverview :device-id="deviceId"/><SectionPanel v-if="THINGSLINK_EXTRAS_VISIBLE" title="接入诊断"><template #extra><el-button @click="resource.reload">刷新</el-button></template><AsyncState :loading="resource.loading.value" :error="resource.error.value" @retry="resource.reload"><dl class="tl-key-values"><dt>协议 / 接入状态</dt><dd>{{resource.data.value?.protocol||'—'}} / {{resource.data.value?.state||'—'}}</dd><dt>最近活动</dt><dd>{{formatTime(resource.data.value?.lastActivityAt)}}</dd><dt>最近认证</dt><dd>{{formatTime(resource.data.value?.lastAuthenticatedAt)}}</dd><dt>连接时间</dt><dd>{{formatTime(resource.data.value?.connectedAt)}}</dd><dt>最近断开</dt><dd>{{formatTime(resource.data.value?.lastDisconnectedAt)}}</dd><dt>断开原因</dt><dd>{{resource.data.value?.lastDisconnectReason||'—'}}</dd></dl></AsyncState></SectionPanel></template>

<style scoped>
.device-connect-guide{display:flex;margin:8px 0 20px;padding:10px 15px;font-size:14px;line-height:20px;color:#606266;background:#fdf4e7;border-left:2px solid #eab772;border-radius:5px}.device-connect-guide .reference-icon{font-size:16px;line-height:20px;margin:0 5px 0 0}.device-connect-guide>.reference-icon{align-self:flex-start}.device-connect-guide p{margin:0}.device-connect-guide ul{margin:0;padding:5px 0 5px 20px;list-style:disc}.device-connect-guide a{display:inline-flex;align-items:center;gap:4px;margin:0 3px;color:#eab772;text-decoration:underline;font-weight:700}.device-connect-guide strong{font-weight:700}
</style>
