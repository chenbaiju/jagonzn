<script setup lang="ts">
import DefinitionExternalIcon from './DefinitionExternalIcon.vue'
import DefinitionLevelIcon from './DefinitionLevelIcon.vue'
defineProps<{kind:string;published?:boolean}>()
</script>
<template><div class="definition-guide" :title="published?'保存将更新类型功能定义，已有设备仍使用原绑定模型。':undefined"><DefinitionLevelIcon level="INFO"/><a :href="`https://www.thingscloud.xyz/docs/guide/device-type/function-define.html#${kind}`" target="_blank" rel="noopener noreferrer">什么是{{kind==='属性'?'设备属性':kind}}？<DefinitionExternalIcon/></a></div></template>
