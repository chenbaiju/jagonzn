<script setup lang="ts">
import type {ModelDocumentField} from './model-documentation'

defineProps<{fields:readonly ModelDocumentField[]}>()
</script>

<template>
 <table class="model-field-table">
  <thead><tr><th scope="col">字段</th><th scope="col">冻结值</th></tr></thead>
  <tbody>
   <tr v-for="field in fields" :key="field.label">
    <th scope="row">{{field.label}}</th>
    <td>
     <template v-if="field.missing">-</template>
     <pre v-else-if="field.label.endsWith('Schema')&&field.value.includes('\n')"><code>{{field.value}}</code></pre>
     <template v-else>{{field.value}}</template>
    </td>
   </tr>
  </tbody>
 </table>
</template>

<style scoped>
.model-field-table{width:100%;border-collapse:collapse;color:var(--tl-text);font-size:16px;line-height:24px;overflow-wrap:anywhere}
.model-field-table th,.model-field-table td{padding:6px 10px;border:1px solid var(--tl-border);text-align:left;vertical-align:top}
.model-field-table th{font-weight:500}
.model-field-table thead{background:var(--tl-fill);color:var(--tl-title)}
.model-field-table tbody th{width:26%;color:var(--tl-muted)}
.model-field-table td{white-space:pre-wrap}
.model-field-table pre{margin:0;padding:8px;border-radius:3px;background:var(--tl-fill);font:14px/20px Monaco,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:600px){
 .model-field-table{font-size:13px;line-height:19px}
 .model-field-table th,.model-field-table td{padding:3px}
}
</style>
