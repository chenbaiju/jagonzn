<script setup lang="ts">
import {QuestionFilled} from '@element-plus/icons-vue'
defineProps<{text:string;href?:string}>()
</script>
<template><el-tooltip :content="text" placement="top"><a v-if="href" class="definition-help" :href="href" :aria-label="text" target="_blank" rel="noopener noreferrer"><el-icon><QuestionFilled/></el-icon></a><span v-else class="definition-help" tabindex="0" :aria-label="text"><el-icon><QuestionFilled/></el-icon></span></el-tooltip></template>
<style scoped>.definition-help{display:inline-flex;align-items:center;color:#c0c4cc;font-size:14px;margin-left:12px;vertical-align:middle;line-height:1;text-decoration:none}.definition-help:hover,.definition-help:focus-visible{color:var(--tl-primary)}</style>
