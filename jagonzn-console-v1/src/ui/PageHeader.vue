<script setup lang="ts">
import ReferenceIcon from './ReferenceIcon.vue'
defineProps<{ title: string; back?: boolean; backDisabled?: boolean; count?: number | string }>()
defineEmits<{ back: [] }>()
</script>
<template>
  <header class="tl-page-header">
    <div class="tl-page-header__title">
      <template v-if="back"><button class="tl-back" aria-label="返回" :disabled="backDisabled" @click="$emit('back')"><ReferenceIcon glyph="󰁍" /><span>返回</span></button><span class="tl-page-header__divider" /></template>
      <h1 :class="{ 'is-secondary': back }"><span class="tl-page-header__label">{{ title }}</span><span v-if="count !== undefined" class="tl-page-header__count">({{ count }})</span></h1>
      <slot name="status" />
    </div>
    <div class="tl-page-header__actions"><slot /></div>
  </header>
</template>
<style scoped>
.tl-page-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 20px; min-height: 40px; }
.tl-page-header__title, .tl-page-header__actions { display: flex; align-items: center; gap: 12px; }
h1 { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; font-size: var(--tl-font-title); font-weight: 400; line-height: 40px; color: #1f2f3d; margin: 0; }
h1.is-secondary { min-height: 24px; font-size: 18px; line-height: 24px; }
.tl-page-header__label, .tl-page-header__count { line-height: 1; }
.tl-page-header__count { font-size: 20px; }
.tl-page-header__actions { gap: 8px; }
.tl-page-header__actions :deep(.el-button + .el-button) { margin-left: 0; }
.tl-back .reference-icon { font-size: 16px; }
.tl-back { display: inline-flex; gap: 8px; align-items: center; border: 0; background: none; color: #4a4a4a; padding: 0; cursor: pointer; white-space: nowrap; }
.tl-back:enabled:hover { color: var(--tl-primary); }
.tl-back:disabled { color: var(--tl-muted); cursor: not-allowed; }
.tl-page-header__divider { width: 1px; height: 18px; background: var(--tl-input-border); margin: 0 8px; }
@media(max-width: 760px) { .tl-page-header { align-items: flex-start; flex-wrap: wrap; } }
</style>
