<script setup lang="ts">
import TaskDebugLogPanel from './TaskDebugLogPanel.vue'
import { taskDebugLogTransport } from './task-debug-transport'
</script>
<template><main class="tl-page"><TaskDebugLogPanel :transport="taskDebugLogTransport" /></main></template>
