<script setup lang="ts">
import {computed} from 'vue'
import {customerNotificationIcons} from './notification-customer-icons'
export type CustomerNotificationChannel=typeof customerNotificationIcons[number]['channel']
const props=defineProps<{channels:readonly CustomerNotificationChannel[]|null}>()
const enabled=computed(()=>customerNotificationIcons.filter(icon=>props.channels?.includes(icon.channel)))
</script>
<template><span v-if="channels===null" class="rule-unset">—</span><span v-else-if="!channels.length" class="rule-unset">未设置</span><div v-else class="customer-channels"><el-tooltip v-for="icon in enabled" :key="icon.channel" :content="icon.label" placement="top"><svg class="channel-icon" :style="{color:icon.color}" viewBox="0 0 24 24" role="img" :aria-label="icon.label" tabindex="0"><path :d="icon.path" /></svg></el-tooltip></div></template>
<style scoped>.customer-channels{display:flex;gap:8px;align-items:center;justify-content:flex-start}.channel-icon{width:20px;height:20px;flex:0 0 20px;fill:currentColor;cursor:pointer}.rule-unset{color:#c0c4cc}</style>
