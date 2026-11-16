<script setup lang="ts">
const props=defineProps<{modelValue:string;disabled?:boolean}>()
const emit=defineEmits<{'update:modelValue':[value:string]}>()
function update(value:string|null){if(!props.disabled)emit('update:modelValue',value||'')}
</script>
<template><el-form-item label="运行时间" class="task-once-field"><el-time-picker :model-value="modelValue" size="small" value-format="HH:mm:ss" format="HH:mm:ss" placeholder="选择时分秒" :disabled="disabled" aria-label="初始一次时间" @update:model-value="update"/></el-form-item></template>
<style scoped>
.task-once-field :deep(.el-date-editor.el-input) { width: 200px; max-width: 100%; }
</style>
