<script setup lang="ts">
import { QuestionFilled } from '@element-plus/icons-vue'
defineProps<{ label: string; content: string }>()
</script>

<template>
 <el-tooltip :content="content" placement="top">
  <el-icon class="alarm-field-help" tabindex="0" role="img" :aria-label="`${label}说明`"><QuestionFilled /></el-icon>
 </el-tooltip>
</template>

<style scoped>
.alarm-field-help { margin-left: 6px; color: #b9bec7; font-size: 13px; vertical-align: -2px; cursor: help; }
</style>
