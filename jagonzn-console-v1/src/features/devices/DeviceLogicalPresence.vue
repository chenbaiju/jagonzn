<script setup lang="ts">
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
import {useDeviceOverview} from './use-device-overview'
import {readLogicalPresence} from './device-logical-presence-api'
import {formatTime} from '@/core/time'
const props=defineProps<{deviceId:string;compact?:boolean}>(),resource=useDeviceOverview(()=>props.deviceId,readLogicalPresence)
const label=(state:string)=>state==='ONLINE'?'在线':state==='OFFLINE'?'离线':state==='INACTIVE'?'尚未连接':'未知'
</script>
<template><details class="logical-presence" :class="{'is-compact':compact}" :open="!compact" aria-label="逻辑在线状态"><summary v-show="compact">逻辑在线：{{resource.error.value?'读取失败':resource.data.value?label(resource.data.value.state):resource.loading.value?'读取中':'—'}}<ReferenceIcon glyph="󰋽"/></summary><div class="logical-presence__details"><header><span>逻辑在线：{{resource.data.value?label(resource.data.value.state):'—'}}</span><el-button size="small" :loading="resource.loading.value" @click="resource.reload">刷新逻辑在线</el-button></header><el-alert v-if="resource.error.value" title="逻辑在线状态读取失败，请刷新重试" type="error" :closable="false"/><template v-if="resource.data.value"><p v-if="resource.data.value.mode==='LEGACY_TRANSPORT'">当前类型未配置独立在线超时，沿用原接入状态。</p><p v-else-if="resource.data.value.mode==='UNAVAILABLE'">当前类型来源不可用，不能判断逻辑在线。</p><template v-else><p>在线超时 {{resource.data.value.onlineTimeoutMinutes}} 分钟 · 接入状态 {{label(resource.data.value.transportStatus)}} · 观察截止 {{formatTime(resource.data.value.observedAt)}}</p><p v-if="resource.data.value.state==='UNKNOWN'" role="status">当前观察不足，不能确认离线。现有活连接没有完整静默观察时也会显示未知；这与接入连接状态不同。</p><p v-else-if="resource.data.value.state==='OFFLINE'">完整观察窗口内没有合格上报或心跳；接入连接状态保持独立。</p><p v-else>当前窗口内已有合格上报或心跳。</p></template></template></div></details></template>
<style scoped>.logical-presence{font-size:13px;line-height:1.7;color:var(--tl-muted);margin:14px 0}.logical-presence header{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.logical-presence p{margin:6px 0}
.logical-presence.is-compact{position:relative;margin:0;line-height:20px;font-size:14px;min-width:0}
.logical-presence summary{display:flex;align-items:center;gap:5px;list-style:none;cursor:pointer;color:var(--tl-muted);white-space:nowrap}
.logical-presence summary::-webkit-details-marker{display:none}.logical-presence summary .reference-icon{font-size:14px}
.logical-presence summary:hover{color:var(--tl-primary)}.logical-presence summary:focus-visible{outline:2px solid var(--tl-primary);outline-offset:3px;border-radius:2px}
.is-compact .logical-presence__details{position:absolute;top:calc(100% + 10px);right:0;z-index:20;width:360px;max-width:calc(100vw - 32px);padding:16px;border:1px solid var(--tl-border);border-radius:4px;background:#fff;box-shadow:0 2px 12px #0000001a;font-size:13px;line-height:1.7;white-space:normal}
.is-compact .logical-presence__details header{justify-content:space-between;gap:8px}.is-compact .logical-presence__details .el-button{height:28px;padding:7px 12px;font-size:12px}
@media(max-width:767px){.is-compact .logical-presence__details{position:fixed;top:auto;left:16px;right:16px;width:auto;margin-top:10px}}
</style>
