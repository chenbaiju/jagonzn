<script setup lang="ts">
import {computed} from 'vue'
const props=defineProps<{level:string}>()
const label=computed(()=>({INFO:'信息',SUCCESS:'成功',WARNING:'警告',ERROR:'故障'}[props.level]||props.level))
</script>
<template><svg class="definition-level" :class="`definition-level--${level.toLowerCase()}`" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" role="img" :aria-label="label"><template v-if="level==='WARNING'"><path d="M12 3 22 21H2Z"/><path d="M12 9v5m0 3v.1"/></template><template v-else><circle cx="12" cy="12" r="9"/><path v-if="level==='SUCCESS'" d="m7.5 12 3 3 6-6"/><path v-else-if="level==='ERROR'" d="m9 9 6 6m0-6-6 6"/><path v-else d="M12 11v6m0-10v.1"/></template></svg></template>
