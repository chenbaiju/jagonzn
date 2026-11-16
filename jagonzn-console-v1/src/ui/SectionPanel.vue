<script setup lang="ts">defineProps<{ title?: string }>()</script>
<template><section class="tl-section-panel"><header v-if="title || $slots.header" class="tl-section-panel__header"><h2 v-if="title">{{ title }}</h2><slot name="header" /><span class="tl-section-panel__extra"><slot name="extra" /></span></header><div class="tl-section-panel__body"><slot /></div></section></template>
<style scoped>
.tl-section-panel { border: 1px solid var(--tl-border); border-radius: 4px; margin-bottom: 22px; overflow: hidden; }
.tl-section-panel__header { padding: 14px 18px; display: flex; align-items: center; gap: 12px; min-height: 48px; background: var(--tl-fill); border-bottom: 1px solid var(--tl-border); }
h2 { font-size: 14px; font-weight: 600; margin: 0; color: var(--tl-title); line-height: 20px; }
.tl-section-panel__extra { margin-left: auto; font-size: 12px; font-weight: 400; }
.tl-section-panel__body { padding: 20px; }
</style>
