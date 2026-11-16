<script setup lang="ts">
/** 目录中已观察的设备轮廓与连接图形；状态含义仍由旁侧文字提供。 */
defineProps<{kind:'device'|'connection'}>()
</script>
<template>
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false">
    <path v-if="kind==='device'" d="m12 2 9 5v10l-9 5-9-5V7ZM3 7l9 5 9-5M12 12v10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path v-else d="M7 2h3v5h4V2h3v5h3v5a8 8 0 0 1-6.5 7.86V23h-3v-3.14A8 8 0 0 1 4 12V7h3Z" fill="currentColor"/>
  </svg>
</template>
