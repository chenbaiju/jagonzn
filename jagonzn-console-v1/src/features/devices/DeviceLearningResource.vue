<script setup lang="ts">
import ReferenceIcon from '@/ui/ReferenceIcon.vue'
defineProps<{kind:'command'|'event'|'user'|'information'|'alarm'|'property'}>()
const topics={
 property:{label:'什么是设备属性？',path:'device-manage/device-attributes'},
 command:{label:'什么是设备命令？',path:'device-manage/device-commands'},
 event:{label:'什么是设备事件？',path:'device-manage/device-events'},
 information:{label:'什么是设备扩展信息？',path:'device-type/extend-info-define'},
 alarm:{label:'什么是告警规则？',path:'alarm/alarm-rule'},
 user:{label:'什么是用户？',path:'customer-app/what-is-customer'}
} as const
</script>
<template><div class="tl-learning-resource"><ReferenceIcon glyph="󰋽"/><span>学习资源： <a :href="`https://www.thingscloud.xyz/docs/guide/${topics[kind].path}.html`" target="_blank" rel="noopener noreferrer">{{topics[kind].label}} <ReferenceIcon glyph="󰏌"/></a></span></div></template>
