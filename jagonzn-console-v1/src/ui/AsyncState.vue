<script setup lang="ts">
import { errorMessage } from '@/core/http'
defineProps<{ loading?: boolean; error?: unknown; empty?: boolean; emptyText?: string; forbidden?: boolean }>()
defineEmits<{ retry: [] }>()
</script>
<template>
  <div v-if="forbidden" class="tl-async" role="status">当前账号没有此内容的读取权限</div>
  <div v-else-if="loading" class="tl-async" role="status" aria-live="polite"><el-skeleton :rows="3" animated /></div>
  <div v-else-if="error" class="tl-async" role="alert"><p>{{ errorMessage(error) }}</p><el-button size="small" @click="$emit('retry')">重新读取</el-button></div>
  <el-empty v-else-if="empty" :description="emptyText || '暂无数据'" :image-size="72"><slot name="empty" /></el-empty>
  <slot v-else />
</template>
<style scoped>.tl-async { padding: 44px 20px; text-align: center; color: var(--tl-muted); }.tl-async[role=alert] { color: var(--tl-text); }</style>
